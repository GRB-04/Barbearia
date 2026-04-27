import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelMyBarberBooking,
  listMyBarberBookings,
  type BarberBookingItem,
} from "@/services/barberBookings";
import { toast } from "sonner";

function formatDateTime(value: string): string {
  const date = new Date(value);

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "confirmed":
      return "Confirmado";
    case "cancelled":
      return "Cancelado";
    case "completed":
      return "Finalizado";
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "confirmed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    case "completed":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getChairLiveClass(isAvailableNow: boolean): string {
  return isAvailableNow
    ? "bg-green-100 text-green-700"
    : "bg-amber-100 text-amber-700";
}

function getChairLiveLabel(isAvailableNow: boolean): string {
  return isAvailableNow ? "Livre agora" : "Ocupada agora";
}

function getAddressLine(item: BarberBookingItem): string {
  return [item.address, item.city, item.state].filter(Boolean).join(" • ");
}

function getBookingGroup(
  item: BarberBookingItem
): "upcoming" | "active" | "history" {
  const now = new Date();
  const start = new Date(item.start_at);
  const end = new Date(item.end_at);

  if (item.status === "cancelled" || item.status === "completed") {
    return "history";
  }

  if (now < start) {
    return "upcoming";
  }

  if (now >= start && now < end) {
    return "active";
  }

  return "history";
}

function isBookingActiveNow(item: BarberBookingItem): boolean {
  const now = new Date();
  const start = new Date(item.start_at);
  const end = new Date(item.end_at);

  return (
    now >= start &&
    now < end &&
    item.status !== "cancelled" &&
    item.status !== "completed"
  );
}

function canCancelBooking(item: BarberBookingItem): boolean {
  return item.status === "pending" || item.status === "confirmed";
}

type BookingSectionProps = {
  title: string;
  emptyMessage: string;
  bookings: BarberBookingItem[];
  cancellingId: string | null;
  onCancel: (booking: BarberBookingItem) => void;
};

function BookingSection({
  title,
  emptyMessage,
  bookings,
  cancellingId,
  onCancel,
}: BookingSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border bg-background p-5 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const availableNow = !isBookingActiveNow(booking);
            const canCancel = canCancelBooking(booking);

            return (
              <div
                key={booking.id}
                className="space-y-4 rounded-2xl border bg-background p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold">
                      {booking.organization_name}
                    </h3>
                    <p className="text-sm font-medium">{booking.location_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {booking.chair_identifier}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getAddressLine(booking) || "Endereço não informado"}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                      booking.status
                    )}`}
                  >
                    {getStatusLabel(booking.status)}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Início</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(booking.start_at)}
                    </p>
                  </div>

                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Fim</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(booking.end_at)}
                    </p>
                  </div>

                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">
                      Situação real da cadeira
                    </p>
                    <div className="mt-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${getChairLiveClass(
                          availableNow
                        )}`}
                      >
                        {getChairLiveLabel(availableNow)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">
                      Reserva criada em
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(booking.created_at)}
                    </p>
                  </div>
                </div>

                {booking.notes ? (
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Observações</p>
                    <p className="mt-1 text-sm">{booking.notes}</p>
                  </div>
                ) : null}

                {canCancel ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => onCancel(booking)}
                      disabled={cancellingId === booking.id}
                    >
                      {cancellingId === booking.id
                        ? "Cancelando..."
                        : "Cancelar reserva"}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function MyChairBookingsPage() {
  const [bookings, setBookings] = useState<BarberBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function loadBookings() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await listMyBarberBookings();
      setBookings(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao carregar seus bookings.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBookings();
  }, []);

  async function handleCancel(booking: BarberBookingItem) {
    const confirmed = window.confirm(
      `Deseja cancelar a reserva de ${booking.chair_identifier}?`
    );

    if (!confirmed) return;

    try {
      setCancellingId(booking.id);
      await cancelMyBarberBooking(booking.id);
      toast.success("Reserva cancelada com sucesso.");
      await loadBookings();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao cancelar reserva.";
      toast.error(message);
    } finally {
      setCancellingId(null);
    }
  }

  const grouped = useMemo(() => {
    return {
      upcoming: bookings.filter((item) => getBookingGroup(item) === "upcoming"),
      active: bookings.filter((item) => getBookingGroup(item) === "active"),
      history: bookings.filter((item) => getBookingGroup(item) === "history"),
    };
  }, [bookings]);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Meus bookings</h1>
          <p className="text-sm text-muted-foreground">
            Aqui o barbeiro acompanha reservas futuras, ativas e histórico.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={() => void loadBookings()}>
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">
          Carregando seus bookings...
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage ? (
        <div className="space-y-8">
          <BookingSection
            title="Ativos agora"
            emptyMessage="Nenhum booking ativo no momento."
            bookings={grouped.active}
            cancellingId={cancellingId}
            onCancel={handleCancel}
          />

          <BookingSection
            title="Próximos bookings"
            emptyMessage="Nenhum booking futuro encontrado."
            bookings={grouped.upcoming}
            cancellingId={cancellingId}
            onCancel={handleCancel}
          />

          <BookingSection
            title="Histórico"
            emptyMessage="Nenhum booking finalizado ou expirado ainda."
            bookings={grouped.history}
            cancellingId={cancellingId}
            onCancel={handleCancel}
          />
        </div>
      ) : null}
    </div>
  );
}