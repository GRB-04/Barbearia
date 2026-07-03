import { useEffect, useMemo, useState } from "react";
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

function toTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildDate(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function getFriendlyBookingError(message: string): string {
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
// Supports both formats currently present in the app:
// named keys: { monday: { open: true, start: "09:00", end: "19:00" } }
// numeric keys: { "1": { enabled: true, open: "08:00", close: "18:00" } }
function getDayConfig(locationHours: any, date: Date): { open: boolean; start?: string; end?: string } | null {
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

// Format operating hours for display
function formatDayHours(locationHours: any, date: Date): string {
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
  const today = useMemo(() => {
    const d = new Date();
    // Start with current date, default time to 09:00 for UI convenience
    d.setHours(9, 0, 0, 0);
    return d;
  }, []);

  const [date, setDate] = useState(toDateStr(today));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("14:00");
  const [notes, setNotes] = useState("");

  const [bookings, setBookings] = useState<ChairBookingTimeRow[]>([]);
  const [locationHours, setLocationHours] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflictDetected, setConflictDetected] = useState(false);
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
        setLocationHours(locationRes.value.data?.operating_hours ?? null);
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
  }, [chair.chair_id]);

  function hasConflict(s: Date, e: Date) {
    return bookings.some((b) => {
      const bs = new Date(b.start_at);
      const be = new Date(b.end_at);
      return s < be && e > bs;
    });
  }

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

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    setConflictDetected(false);

    const s = buildDate(date, start);
    const f = buildDate(date, end);

    if (f <= s) {
      setError("O horário de fim deve ser maior que o de início.");
      return;
    }

    const durationMinutes = (f.getTime() - s.getTime()) / 60000;
    if (durationMinutes < 240) {
      setError("A reserva precisa ter no mínimo 4 horas de duração.");
      return;
    }

    if (hasConflict(s, f)) {
      setError("Essa cadeira já está reservada nesse horário.");
      setConflictDetected(true);
      return;
    }

    const hoursError = validateOperatingHours(s, f);
    if (hoursError) {
      setError(hoursError);
      return;
    }

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

      // Fixed price of R$ 50 per booking (MVP)
      const price = 50.0;

      try {
        await createBookingPayment(booking.id, price, chair.organization_id);
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
      if ((err.message ?? "").includes("chair_bookings_no_overlap_per_chair")) {
        setConflictDetected(true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleJoinWaitlist() {
    setJoiningWaitlist(true);
    setError("");
    try {
      const s = buildDate(date, start);
      const f = buildDate(date, end);
      await joinWaitlist({
        chairId: chair.chair_id,
        organizationId: chair.organization_id,
        locationId: chair.location_id,
        desiredStartAt: s.toISOString(),
        desiredEndAt: f.toISOString(),
      });
      toast.success("Você entrou na fila de espera! Avisaremos quando o horário vagar.");
      setConflictDetected(false);
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
      <div className="p-4 text-center text-sm text-muted-foreground">
        Carregando horários...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 p-4 border rounded-xl bg-card shadow-sm"
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">
          Reservar {chair.chair_identifier}
        </h3>
        <p className="text-xs text-muted-foreground">{chair.location_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Data
          </label>
          <Input
            type="date"
            value={date}
            min={toDateStr(today)}
            onChange={(e) => {
              setDate(e.target.value);
              setError("");
              setConflictDetected(false);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Início
          </label>
          <Input
            type="time"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setError("");
              setConflictDetected(false);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Fim
          </label>
          <Input
            type="time"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setError("");
              setConflictDetected(false);
            }}
          />
        </div>
      </div>

      {dayHours && (
        <p className="text-xs text-muted-foreground">
          Funcionamento neste dia:{" "}
          <span className="font-medium text-foreground">{dayHours}</span>
        </p>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-muted-foreground">
          Observações
        </label>
        <textarea
          className="w-full border rounded-lg p-3 text-sm min-h-[70px] bg-background resize-none"
          placeholder="Alguma observação para a reserva?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="rounded-lg bg-primary/5 p-3 border border-primary/10 flex justify-between items-center text-sm">
        <span className="text-muted-foreground">Valor da reserva:</span>
        <span className="font-bold text-primary">R$ 50,00</span>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-xs font-medium space-y-2">
          <p>{error}</p>
          {conflictDetected && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={joiningWaitlist}
              onClick={handleJoinWaitlist}
            >
              {joiningWaitlist ? "Entrando na fila..." : "Entrar na fila de espera deste horário"}
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={saving || joiningWaitlist}>
          {saving ? "Processando..." : "Confirmar reserva"}
        </Button>

        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
