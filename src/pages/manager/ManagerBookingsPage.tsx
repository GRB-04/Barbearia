import { useEffect, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { RefreshCw, CalendarDays, Clock3, User, Check, X, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchLocationBookings,
  updateBookingStatus,
  type ManagerBookingRow,
} from "@/services/managerData";

const statusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  completed: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  rejected: "Rejeitada",
  completed: "Concluída",
};

export default function ManagerBookingsPage() {
  const { managerLocationId } = useBarberProfile();
  const [bookings, setBookings] = useState<ManagerBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const loadBookings = async () => {
    if (!managerLocationId) return;
    setLoading(true);
    try {
      const data = await fetchLocationBookings(managerLocationId, filter === "pending");
      setBookings(data);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar as reservas.");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBookings();
  }, [managerLocationId, filter]);

  const handleAction = async (bookingId: string, newStatus: "confirmed" | "rejected") => {
    setActioning(bookingId);
    try {
      await updateBookingStatus(bookingId, newStatus);
      toast.success(newStatus === "confirmed" ? "Reserva confirmada." : "Reserva rejeitada.");
      await loadBookings();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar reserva.");
    } finally {
      setActioning(null);
    }
  };

  if (!managerLocationId) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border border-border bg-card p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Sua conta de gerente não está vinculada a um ponto físico. Fale com o dono da organização.
          </p>
        </div>
      </div>
    );
  }

  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Reservas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as reservas de cadeiras do seu ponto físico.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            size="sm"
            className="rounded-xl"
            onClick={() => setFilter("pending")}
          >
            Pendentes {pendingCount > 0 && filter === "pending" ? `(${pendingCount})` : ""}
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className="rounded-xl"
            onClick={() => setFilter("all")}
          >
            Todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => void loadBookings()}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando reservas...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            {filter === "pending" ? "Nenhuma reserva pendente" : "Nenhuma reserva encontrada"}
          </p>
          <p className="text-xs text-muted-foreground">
            {filter === "pending"
              ? "Todas as reservas estão confirmadas ou não há reservas ainda."
              : "Os barbeiros ainda não fizeram reservas neste ponto físico."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {bookings.map((booking) => {
            const start = new Date(booking.start_at);
            const end = new Date(booking.end_at);
            const isPending = booking.status === "pending";
            const isActioning = actioning === booking.id;

            return (
              <div
                key={booking.id}
                className="rounded-3xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {booking.chair_identifier
                          ? `Cadeira ${booking.chair_identifier}`
                          : "Cadeira"}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                          statusBadge[booking.status] ?? "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {statusLabel[booking.status] ?? booking.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{booking.barber_full_name ?? "Barbeiro"}</span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                        <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Data
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {format(start, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                        <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Horário
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {format(start, "HH:mm")} → {format(end, "HH:mm")}
                          </p>
                        </div>
                      </div>
                    </div>

                    {booking.notes && (
                      <p className="text-xs text-muted-foreground">{booking.notes}</p>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex gap-2 lg:flex-col">
                      <Button
                        size="sm"
                        className="rounded-xl gap-1.5"
                        disabled={isActioning}
                        onClick={() => handleAction(booking.id, "confirmed")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={isActioning}
                        onClick={() => handleAction(booking.id, "rejected")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
