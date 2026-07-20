import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  createChairBooking,
  getChairBookingsByChairId,
  checkBarberAvailability,
  type ChairBookingTimeRow,
  type ExploreChairItem,
} from "@/services/chairBookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBookingPayment } from "@/services/payments";
import { joinWaitlist } from "@/services/waitlist";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Lock, 
  Coffee,
  Sparkles
} from "lucide-react";

type Props = {
  chair: ExploreChairItem;
  onCancel?: () => void;
  onSuccess?: (bookingId: string) => void;
};

// Maps JS getDay() (0=Sun,1=Mon,...6=Sat) to operating_hours named keys
const DOW_TO_NAME: Record<number, string> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildDate(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export function getFriendlyBookingError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes("chair_bookings_no_overlap_per_chair")) {
    return "Essa cadeira já está reservada nesse horário.";
  }
  if (msg.includes("chair_bookings_no_overlap_per_barber")) {
    return "Você já possui outra reserva ativa nesse mesmo horário.";
  }
  if (msg.includes("minimum_4_hours") || msg.includes("minimum_duration")) {
    return "A reserva precisa ter no mínimo 4 horas.";
  }
  if (msg.includes("operating_hours") || msg.includes("funcionamento")) {
    return "O horário selecionado está fora do funcionamento deste local.";
  }
  if (msg.includes("não está disponível") || msg.includes("disponivel") || msg.includes("available")) {
    return "Esta cadeira não está disponível para reservas.";
  }
  return message || "Erro ao processar reserva.";
}

// Gets the operating hours config for a given JS date.
export function getDayConfig(locationHours: any, date: Date): { open: boolean; start?: string; end?: string } | null {
  if (!locationHours) return null;
  const dayName = DOW_TO_NAME[date.getDay()];
  const raw = locationHours[dayName] ?? locationHours[date.getDay().toString()];

  if (!raw || typeof raw !== "object") return null;

  if (typeof raw.enabled === "boolean") {
    return {
      open: raw.enabled,
      start: typeof raw.open === "string" ? raw.open : undefined,
      end: typeof raw.close === "string" ? raw.close : undefined,
    };
  }

  return {
    open: raw.open !== false,
    start: typeof raw.start === "string" ? raw.start : undefined,
    end: typeof raw.end === "string" ? raw.end : undefined,
  };
}

// Gets the suggested booking slot (preserved for test compatibility)
export function getSuggestedBookingSlot(now: Date, locationHours: any): { date: string; start: string; end: string } {
  const targetDate = new Date(now);
  if (targetDate.getMinutes() > 0) {
    targetDate.setHours(targetDate.getHours() + 1);
  }
  targetDate.setMinutes(0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(targetDate);
    checkDate.setDate(targetDate.getDate() + i);
    
    const config = getDayConfig(locationHours, checkDate);
    if (config && config.open && config.start && config.end) {
      const [openH, openM] = config.start.split(":").map(Number);
      const [closeH, closeM] = config.end.split(":").map(Number);
      
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;
      
      let checkStartMinutes = openMinutes;
      if (i === 0) {
        checkStartMinutes = Math.max(openMinutes, targetDate.getHours() * 60);
      }
      
      if (checkStartMinutes + 240 <= closeMinutes) {
        const startH = Math.floor(checkStartMinutes / 60);
        const startM = checkStartMinutes % 60;
        
        const endH = startH + 4;
        const endM = startM;
        
        const padHour = (h: number) => String(h).padStart(2, "0");
        const padMin = (m: number) => String(m).padStart(2, "0");
        
        return {
          date: toDateStr(checkDate),
          start: `${padHour(startH)}:${padMin(startM)}`,
          end: `${padHour(endH)}:${padMin(endM)}`
        };
      }
    }
  }

  const fallback = new Date(now);
  fallback.setHours(9, 0, 0, 0);
  return {
    date: toDateStr(fallback),
    start: "09:00",
    end: "14:00"
  };
}

// Format operating hours for display
export function formatDayHours(locationHours: any, date: Date): string {
  const config = getDayConfig(locationHours, date);
  if (!config) return "Sem horário definido";
  if (config.open === false) return "Fechado";
  if (config.start && config.end) return `${config.start} – ${config.end}`;
  return "Aberto";
}

export default function ChairBookingForm({
  chair,
  onCancel,
  onSuccess,
}: Props) {
  const { barberProfile } = useBarberProfile();
  const currentBarberProfileId = barberProfile?.id;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  }, []);

  const [date, setDate] = useState(toDateStr(today));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [notes, setNotes] = useState("");

  const [bookings, setBookings] = useState<ChairBookingTimeRow[]>([]);
  const [locationHours, setLocationHours] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);

  async function load() {
    try {
      setLoading(true);

      const [bookingsResult, locationRes] = await Promise.allSettled([
        getChairBookingsByChairId(chair.chair_id),
        supabase
          .from("locations")
          .select("operating_hours")
          .eq("id", chair.location_id)
          .maybeSingle(),
      ]);

      if (bookingsResult.status === "fulfilled") {
        setBookings(bookingsResult.value);
      } else {
        console.warn("Could not preload chair booking conflicts:", bookingsResult.reason);
        setBookings([]);
      }

      if (locationRes.status === "fulfilled" && !locationRes.value.error) {
        const hours = locationRes.value.data?.operating_hours ?? null;
        setLocationHours(hours);
      } else {
        console.warn(
          "Could not load location operating hours:",
          locationRes.status === "rejected" ? locationRes.reason : locationRes.value.error
        );
        setLocationHours(null);
      }
    } catch (e) {
      console.error("Error loading booking form data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chair.chair_id]);

  // Suggest a default valid slot when locationHours are loaded
  useEffect(() => {
    if (locationHours) {
      const suggestion = getSuggestedBookingSlot(new Date(), locationHours);
      setDate(suggestion.date);
      setStartTime(suggestion.start);
      setEndTime(suggestion.end);
    }
  }, [locationHours]);

  // Validate against operating hours
  function validateOperatingHours(s: Date, e: Date): string | null {
    if (!locationHours) return null; // no hours configured — allow booking

    const config = getDayConfig(locationHours, s);

    if (!config) return "Sem configuração de horário para este dia.";
    if (config.open === false) return "Este local está fechado no dia selecionado.";

    if (config.start && config.end) {
      const [openH, openM] = config.start.split(":").map(Number);
      const [closeH, closeM] = config.end.split(":").map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;
      const startMinutes = s.getHours() * 60 + s.getMinutes();
      const endMinutes = e.getHours() * 60 + e.getMinutes();

      if (startMinutes < openMinutes) {
        return `O início da reserva deve ser a partir das ${config.start}.`;
      }
      if (endMinutes > closeMinutes) {
        return `A reserva deve terminar até as ${config.end}.`;
      }
    }

    return null;
  }

  // Filter bookings for the selected date
  const bookingsOnSelectedDate = useMemo(() => {
    if (!date) return [];
    return bookings.filter((b) => {
      const bDate = toDateStr(new Date(b.start_at));
      return bDate === date && b.status !== "cancelled" && b.status !== "rejected";
    });
  }, [bookings, date]);

  // Perform reactive live validation
  const validation = useMemo(() => {
    if (!date || !startTime || !endTime) {
      return { isValid: false, error: "Selecione a data e horários.", conflict: false, conflictOwn: false };
    }

    const s = buildDate(date, startTime);
    const f = buildDate(date, endTime);

    if (f <= s) {
      return { isValid: false, error: "O horário de término deve ser após o horário de início.", conflict: false, conflictOwn: false };
    }

    // 1. Minimum duration (4 hours)
    const durationMs = f.getTime() - s.getTime();
    if (durationMs < 4 * 60 * 60 * 1000) {
      return { isValid: false, error: "A reserva precisa ter no mínimo 4 horas.", conflict: false, conflictOwn: false };
    }

    // 2. Start time in the past
    if (s < new Date()) {
      return { isValid: false, error: "O horário de início não pode ser no passado.", conflict: false, conflictOwn: false };
    }

    // 3. Operating hours validation
    const hoursError = validateOperatingHours(s, f);
    if (hoursError) {
      return { isValid: false, error: hoursError, conflict: false, conflictOwn: false };
    }

    // 4. Overlap/Conflict check
    const overlap = bookings.find((b) => {
      if (b.status === "cancelled" || b.status === "rejected") return false;
      const bs = new Date(b.start_at);
      const be = new Date(b.end_at);
      return s < be && f > bs;
    });

    if (overlap) {
      const isOwn = currentBarberProfileId && overlap.barber_profile_id === currentBarberProfileId;
      return {
        isValid: false,
        error: isOwn
          ? "Você já possui uma reserva ativa nesta cadeira neste período."
          : "Esta cadeira já está reservada no período selecionado.",
        conflict: true,
        conflictOwn: !!isOwn,
      };
    }

    return { isValid: true, error: "", conflict: false, conflictOwn: false };
  }, [date, startTime, endTime, bookings, locationHours, currentBarberProfileId]);

  // Calculations for display
  const hoursCount = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const s = buildDate(date, startTime);
    const f = buildDate(date, endTime);
    const diffMs = f.getTime() - s.getTime();
    if (diffMs <= 0) return 0;
    return diffMs / (1000 * 60 * 60);
  }, [date, startTime, endTime]);

  const totalPrice = useMemo(() => {
    return Math.max(0, hoursCount * 12.50);
  }, [hoursCount]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");

    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    const s = buildDate(date, startTime);
    const f = buildDate(date, endTime);

    setSaving(true);

    try {
      const isAvailable = await checkBarberAvailability(
        s.toISOString(),
        f.toISOString()
      );
      if (!isAvailable) {
        setError(
          "Você já possui uma reserva ativa ou pendente neste mesmo horário."
        );
        setSaving(false);
        return;
      }

      const booking = await createChairBooking({
        chairId: chair.chair_id,
        organizationId: chair.organization_id,
        startAt: s.toISOString(),
        endAt: f.toISOString(),
        notes,
      });

      try {
        await createBookingPayment(booking.id, totalPrice, chair.organization_id);
        toast.success("Reserva criada! Redirecionando para pagamento...");
        onSuccess?.(booking.id);
      } catch (payErr: any) {
        console.error("Payment creation failed but booking was created:", payErr);
        toast.warning("Reserva criada, mas houve problema ao gerar cobrança.");
        onSuccess?.(booking.id);
      }
    } catch (err: any) {
      console.error("Booking creation failed:", err);
      const friendly = getFriendlyBookingError(err.message ?? "");
      setError(friendly);
    } finally {
      setSaving(false);
    }
  }

  async function handleJoinWaitlist() {
    setJoiningWaitlist(true);
    setError("");
    try {
      const s = buildDate(date, startTime);
      const f = buildDate(date, endTime);

      await joinWaitlist({
        chairId: chair.chair_id,
        organizationId: chair.organization_id,
        locationId: chair.location_id,
        desiredStartAt: s.toISOString(),
        desiredEndAt: f.toISOString(),
      });
      toast.success("Você entrou na fila de espera! Avisaremos quando o horário vagar.");
      onCancel?.();
    } catch (err: any) {
      setError(err.message ?? "Erro ao entrar na fila.");
    } finally {
      setJoiningWaitlist(false);
    }
  }

  const selectedDate = buildDate(date, "00:00");
  const dayHours = locationHours ? formatDayHours(locationHours, selectedDate) : null;

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Carregando horários...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 p-5 border rounded-2xl bg-card shadow-sm border-muted/50"
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Reservar {chair.chair_identifier}
        </h3>
        <p className="text-xs text-muted-foreground">{chair.location_name}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Date Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            Data
          </label>
          <Input
            type="date"
            value={date}
            min={toDateStr(today)}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border-muted focus:ring-primary h-10"
          />
        </div>

        {/* Start Time */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Início
          </label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-xl border-muted focus:ring-primary h-10"
          />
        </div>

        {/* End Time */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Término
          </label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-xl border-muted focus:ring-primary h-10"
          />
        </div>
      </div>

      {dayHours && (
        <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-lg">
          Funcionamento: <span className="font-semibold text-foreground">{dayHours}</span>
        </p>
      )}

      {/* Busy slots on selected date */}
      {bookingsOnSelectedDate.length > 0 && (
        <div className="space-y-1.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 p-3.5 rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
            Horários ocupados nesta cadeira ({format(selectedDate, "dd/MM")}):
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {bookingsOnSelectedDate.map((b) => {
              const start = new Date(b.start_at);
              const end = new Date(b.end_at);
              return (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-900"
                >
                  <Lock className="h-3 w-3" />
                  {format(start, "HH:mm")} – {format(end, "HH:mm")}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Observações
        </label>
        <textarea
          className="w-full border rounded-xl p-3 text-sm min-h-[70px] bg-background resize-none focus:ring-1 focus:ring-primary outline-none border-muted"
          placeholder="Alguma observação para a reserva?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {hoursCount > 0 && (
        <div className="rounded-xl bg-primary/5 p-4 border border-primary/10 flex justify-between items-center text-sm">
          <span className="text-muted-foreground font-medium">Duração total ({hoursCount.toFixed(1)}h):</span>
          <span className="font-bold text-primary text-base">R$ {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {/* Confict / Warning handling */}
      {validation.conflict && !validation.conflictOwn && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3.5 border border-amber-200 dark:border-amber-900/40 space-y-2">
          <div className="flex items-start gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <p>Esta cadeira já possui reserva nesse horário. Deseja entrar na fila de espera?</p>
          </div>
          <Button
            type="button"
            className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-10 text-xs font-semibold shadow-sm"
            disabled={joiningWaitlist}
            onClick={handleJoinWaitlist}
          >
            {joiningWaitlist ? "Entrando..." : "Entrar na Fila de Espera"}
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-destructive/10 p-3.5 text-destructive text-xs font-semibold flex items-start gap-2 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {(!validation.isValid && !validation.conflict && validation.error) && (
        <div className="rounded-xl bg-muted/60 p-3.5 text-muted-foreground text-xs font-semibold flex items-start gap-2 border border-border">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <p>{validation.error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {!validation.conflict && (
          <Button
            type="submit"
            className="flex-1 rounded-xl h-11 text-sm font-semibold shadow-sm"
            disabled={saving || !validation.isValid}
          >
            {saving ? "Processando..." : "Confirmar reserva"}
          </Button>
        )}

        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving || joiningWaitlist}
            className="rounded-xl h-11 text-sm font-semibold"
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
