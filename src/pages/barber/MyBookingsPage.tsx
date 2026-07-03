import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  CalendarDays, 
  Clock3, 
  MapPin, 
  Scissors, 
  CreditCard, 
  CheckCircle2, 
  Timer, 
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { getMyChairBookings, type BarberBookingItem } from "@/services/chairBookings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MyWaitlistSection from "@/components/barber/MyWaitlistSection";

const statusBadge: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border border-amber-200",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
  finished: "bg-muted text-muted-foreground border border-border",
};

const statusLabel: Record<string, string> = {
  confirmed: "Confirmada",
  pending: "Pendente de Pagamento",
  cancelled: "Cancelada",
  finished: "Finalizada",
};

const paymentStatusBadge: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  failed: "bg-rose-500/10 text-rose-600",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd 'de' MMMM", { locale: ptBR });
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "HH:mm");
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function MyBookingsPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BarberBookingItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadBookings() {
    setLoading(true);
    try {
      const result = await getMyChairBookings();
      setBookings(result);
    } catch (error) {
      toast.error("Não foi possível carregar suas reservas.");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBookings();
  }, []);

  const stats = useMemo(() => {
    return {
      active: bookings.filter(b => b.booking_status === 'confirmed').length,
      pending: bookings.filter(b => b.booking_status === 'pending').length,
      total: bookings.length
    };
  }, [bookings]);

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <MyWaitlistSection />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Minhas reservas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe suas alocações de cadeira, pagamentos e horários.
          </p>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadBookings} 
          disabled={loading}
          className="rounded-xl"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmadas</p>
              <p className="text-2xl font-semibold text-foreground">{stats.active}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">
              <Timer className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Aguardando Pix</p>
              <p className="text-2xl font-semibold text-foreground">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total histórico</p>
              <p className="text-2xl font-semibold text-foreground">{stats.total}</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card px-6 py-20 text-center shadow-sm">
          <CalendarDays className="mb-4 h-12 w-12 text-muted-foreground/20" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma reserva encontrada</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Suas reservas de cadeira aparecerão aqui assim que você as criar na aba Explorar.
          </p>
          <Button 
            className="mt-6 rounded-2xl" 
            onClick={() => navigate("/barber/explore")}
          >
            Explorar cadeiras
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="group rounded-3xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-4 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary">
                        <Scissors className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-bold text-foreground">
                        {booking.chair_identifier}
                      </p>
                    </div>

                    <span className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                      statusBadge[booking.booking_status] ?? "bg-muted text-muted-foreground"
                    )}>
                      {statusLabel[booking.booking_status] ?? booking.booking_status}
                    </span>

                    {booking.payment_status && (
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                        paymentStatusBadge[booking.payment_status] ?? "bg-muted text-muted-foreground"
                      )}>
                        <CreditCard className="h-3 w-3" />
                        {booking.payment_status === 'paid' ? 'Pago' : 'Pagamento Pendente'}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                      <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Data e Horário
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatDate(booking.start_at)}
                          <span className="mx-2 text-muted-foreground">|</span>
                          {formatTime(booking.start_at)} → {formatTime(booking.end_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                      <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Localização
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {booking.organization_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {booking.location_name} • {booking.location_city}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row lg:flex-col items-center justify-between lg:justify-start gap-3 lg:w-48">
                  <div className="text-right lg:w-full">
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                    <p className="text-xl font-bold text-foreground">
                      {formatPrice(booking.payment_amount)}
                    </p>
                  </div>

                  {booking.booking_status === "pending" && (
                    <Button 
                      className="w-full rounded-2xl gap-2 shadow-sm bg-amber-500 hover:bg-amber-600 text-white border-none"
                      onClick={() => navigate(`/barber/payment/${booking.id}`)}
                    >
                      <AlertCircle className="h-4 w-4" />
                      Pagar agora
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}