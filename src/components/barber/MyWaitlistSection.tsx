import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, Hourglass } from "lucide-react";
import {
  listMyWaitlist,
  cancelWaitlistEntry,
  type MyWaitlistEntry,
} from "@/services/waitlist";
import { createChairBooking } from "@/services/chairBookings";
import { createBookingPayment } from "@/services/payments";

function formatPeriod(startAt: string, endAt: string) {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const date = s.toLocaleDateString("pt-BR");
  const st = s.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const et = e.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} • ${st}–${et}`;
}

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return <span className="text-destructive">Prazo esgotado</span>;

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  return (
    <span className="font-mono font-semibold">
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </span>
  );
}

export default function MyWaitlistSection() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MyWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setEntries(await listMyWaitlist());
    } catch (e) {
      console.error("Erro ao carregar fila:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCancel(entryId: string) {
    setActioning(entryId);
    try {
      await cancelWaitlistEntry(entryId);
      toast.success("Você saiu da fila.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao sair da fila.");
    } finally {
      setActioning(null);
    }
  }

  async function handleBookNow(entry: MyWaitlistEntry) {
    setActioning(entry.id);
    try {
      const booking = await createChairBooking({
        chairId: entry.chair_id,
        organizationId: entry.organization_id,
        startAt: entry.desired_start_at,
        endAt: entry.desired_end_at,
      });
      try {
        await createBookingPayment(booking.id, 50.0, entry.organization_id);
        toast.success("Reserva criada! Redirecionando para pagamento...");
        navigate(`/barber/payment/${booking.id}`);
      } catch {
        toast.warning("Reserva criada, mas houve problema ao gerar cobrança.");
        await load();
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar reserva.");
      await load();
    } finally {
      setActioning(null);
    }
  }

  if (loading || entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Hourglass className="h-4 w-4" />
        Minha fila de espera
      </h2>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-xl border p-4 bg-card shadow-sm ${
              entry.status === "hold" ? "border-primary ring-1 ring-primary/30" : ""
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {entry.chair_identifier} • {entry.location_name}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatPeriod(entry.desired_start_at, entry.desired_end_at)}
                </p>
                {entry.status === "waiting" && entry.queue_position !== null && (
                  <Badge variant="secondary">{entry.queue_position}º na fila</Badge>
                )}
                {entry.status === "hold" && entry.hold_expires_at && (
                  <p className="text-xs text-primary">
                    Vaga liberada! Confirme em{" "}
                    <HoldCountdown expiresAt={entry.hold_expires_at} />
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {entry.status === "hold" && (
                  <Button
                    size="sm"
                    disabled={actioning === entry.id}
                    onClick={() => handleBookNow(entry)}
                  >
                    {actioning === entry.id ? "Reservando..." : "Reservar agora"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actioning === entry.id}
                  onClick={() => handleCancel(entry.id)}
                >
                  Sair da fila
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
