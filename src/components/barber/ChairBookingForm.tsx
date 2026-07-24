import { useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  AlertTriangle, 
  Lock, 
  Sparkles,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight
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
    start: "08:00",
    end: "12:00"
  };
}

export function formatDayHours(locationHours: any, date: Date): string {
  const config = getDayConfig(locationHours, date);
  if (!config) return "Sem horário definido";
  if (config.open === false) return "Fechado";
  if (config.start && config.end) return `${config.start} – ${config.end}`;
  return "Aberto";
}

const FIXED_SHIFTS = [
  { id: "morning", label: "Turno Manhã", time: "08:00 às 12:00", start: "08:00", end: "12:00", icon: Sun, price: 50 },
  { id: "afternoon", label: "Turno Tarde", time: "14:00 às 18:00", start: "14:00", end: "18:00", icon: Moon, price: 50 },
];

export default function ChairBookingForm({
  chair,
  onCancel,
  onSuccess,
}: Props) {
  const { barberProfile } = useBarberProfile();
  const currentBarberProfileId = barberProfile?.id;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  }, []);

  const [date, setDate] = useState(toDateStr(today));
  const [selectedShift, setSelectedShift] = useState<"morning" | "afternoon" | "custom">("morning");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [notes, setNotes] = useState("");

  const [bookings, setBookings] = useState<ChairBookingTimeRow[]>([]);
  const [locationHours, setLocationHours] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);

  // Generate 7 days for the horizontal date carousel
  const carouselDays = useMemo(() => {
    const days = [];
    const startDate = new Date();
    for (let i = 0; i < 7; i++) {
      const d = addDays(startDate, i);
      days.push({
        dateStr: toDateStr(d),
        dateObj: d,
        dayName: format(d, "EEE", { locale: ptBR }),
        dayNum: format(d, "dd"),
        monthName: format(d, "MMM", { locale: ptBR }).replace(".", ""),
        isToday: i === 0,
      });
    }
    return days;
  }, []);

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
        setBookings([]);
      }

      if (locationRes.status === "fulfilled" && !locationRes.value.error) {
        const hours = locationRes.value.data?.operating_hours ?? null;
        setLocationHours(hours);
      } else {
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
  }, [chair.chair_id]);

  useEffect(() => {
    if (locationHours) {
      const suggestion = getSuggestedBookingSlot(new Date(), locationHours);
      setDate(suggestion.date);
    }
  }, [locationHours]);

  function handleSelectShift(shiftId: "morning" | "afternoon") {
    setSelectedShift(shiftId);
    const shift = FIXED_SHIFTS.find((s) => s.id === shiftId);
    if (shift) {
      setStartTime(shift.start);
      setEndTime(shift.end);
    }
  }

  function validateOperatingHours(s: Date, e: Date): string | null {
    if (!locationHours) return null;
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

  const bookingsOnSelectedDate = useMemo(() => {
    if (!date) return [];
    return bookings.filter((b) => {
      const bDate = toDateStr(new Date(b.start_at));
      return bDate === date && b.status !== "cancelled" && b.status !== "rejected";
    });
  }, [bookings, date]);

  const validation = useMemo(() => {
    if (!date || !startTime || !endTime) {
      return { isValid: false, error: "Selecione a data e o turno.", conflict: false, conflictOwn: false };
    }

    const s = buildDate(date, startTime);
    const f = buildDate(date, endTime);

    if (f <= s) {
      return { isValid: false, error: "O horário de término deve ser após o horário de início.", conflict: false, conflictOwn: false };
    }

    const durationMs = f.getTime() - s.getTime();
    if (durationMs < 4 * 60 * 60 * 1000) {
      return { isValid: false, error: "A reserva precisa ter no mínimo 4 horas.", conflict: false, conflictOwn: false };
    }

    if (s < new Date()) {
      return { isValid: false, error: "O horário de início não pode ser no passado.", conflict: false, conflictOwn: false };
    }

    const hoursError = validateOperatingHours(s, f);
    if (hoursError) {
      return { isValid: false, error: hoursError, conflict: false, conflictOwn: false };
    }

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
          : "Esta cadeira já está reservada no turno selecionado.",
        conflict: true,
        conflictOwn: !!isOwn,
      };
    }

    return { isValid: true, error: "", conflict: false, conflictOwn: false };
  }, [date, startTime, endTime, bookings, locationHours, currentBarberProfileId]);

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
      className="space-y-5 p-5 border rounded-3xl bg-card shadow-sm border-muted/60"
    >
      <div className="space-y-1">
        <h3 className="font-bold text-base text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Reservar {chair.chair_identifier}
        </h3>
        <p className="text-xs text-muted-foreground">{chair.location_name}</p>
      </div>

      {/* 1. Date Carousel (Estilo Fresha) */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          Selecione a Data
        </label>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {carouselDays.map((item) => {
            const isSelected = item.dateStr === date;
            return (
              <button
                key={item.dateStr}
                type="button"
                onClick={() => setDate(item.dateStr)}
                className={`flex flex-col items-center justify-center min-w-[62px] py-2.5 px-2 rounded-2xl border transition-all text-center select-none ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm font-semibold scale-105"
                    : "bg-background text-foreground border-border hover:bg-muted/50"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wide opacity-80">
                  {item.dayName}
                </span>
                <span className="text-lg font-extrabold leading-tight">
                  {item.dayNum}
                </span>
                <span className="text-[9px] capitalize opacity-70">
                  {item.monthName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Turnos Fixos (Estilo Fresha / Requisito Reunião) */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Escolha o Turno
        </label>
        <div className="grid grid-cols-2 gap-3">
          {FIXED_SHIFTS.map((shift) => {
            const Icon = shift.icon;
            const isSelected = selectedShift === shift.id;
            return (
              <button
                key={shift.id}
                type="button"
                onClick={() => handleSelectShift(shift.id as "morning" | "afternoon")}
                className={`flex flex-col items-start justify-between p-3.5 rounded-2xl border transition-all text-left ${
                  isSelected
                    ? "bg-primary/10 border-primary text-foreground ring-2 ring-primary/20 shadow-sm"
                    : "bg-background border-border text-foreground hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    {shift.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{shift.time}</span>
                <span className="text-xs font-semibold text-primary mt-2">R$ {shift.price},00</span>
              </button>
            );
          })}
        </div>
      </div>

      {dayHours && (
        <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-muted/50 text-center">
          Horário de funcionamento: <span className="font-semibold text-foreground">{dayHours}</span>
        </p>
      )}

      {/* Busy slots notification */}
      {bookingsOnSelectedDate.length > 0 && (
        <div className="space-y-1.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 p-3.5 rounded-2xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
            Turnos ocupados nesta cadeira ({format(selectedDate, "dd/MM")}):
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
          Observações (opcional)
        </label>
        <textarea
          className="w-full border rounded-2xl p-3 text-sm min-h-[60px] bg-background resize-none focus:ring-1 focus:ring-primary outline-none border-muted"
          placeholder="Ex: Preciso de tomada próxima..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Booking Summary Panel (Estilo Fresha) */}
      {hoursCount > 0 && (
        <div className="rounded-2xl bg-primary/5 p-4 border border-primary/15 flex justify-between items-center text-sm">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground font-medium block">Total da Reserva:</span>
            <span className="text-xs font-semibold text-foreground">{date} ({startTime} – {endTime})</span>
          </div>
          <span className="font-extrabold text-primary text-lg">R$ {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {/* Conflict / Warning handling */}
      {validation.conflict && !validation.conflictOwn && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 p-3.5 border border-amber-200 dark:border-amber-900/40 space-y-2">
          <div className="flex items-start gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <p>Este turno já está reservado. Deseja entrar na fila de espera?</p>
          </div>
          <Button
            type="button"
            className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-2xl h-10 text-xs font-semibold shadow-sm"
            disabled={joiningWaitlist}
            onClick={handleJoinWaitlist}
          >
            {joiningWaitlist ? "Entrando..." : "Entrar na Fila de Espera"}
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-destructive/10 p-3.5 text-destructive text-xs font-semibold flex items-start gap-2 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {(!validation.isValid && !validation.conflict && validation.error) && (
        <div className="rounded-2xl bg-muted/60 p-3.5 text-muted-foreground text-xs font-semibold flex items-start gap-2 border border-border">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <p>{validation.error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {!validation.conflict && (
          <Button
            type="submit"
            className="flex-1 rounded-2xl h-12 text-sm font-bold shadow-sm"
            disabled={saving || !validation.isValid}
          >
            {saving ? "Processando..." : "Confirmar Reserva do Turno"}
          </Button>
        )}

        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving || joiningWaitlist}
            className="rounded-2xl h-12 text-sm font-semibold"
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
