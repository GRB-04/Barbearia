import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CalendarDays, Clock3, User, Check, X, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type LocationRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

type BookingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  created_at: string;
  chair_identifier: string | null;
  location_name: string | null;
  barber_full_name: string | null;
};

type RawBookingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  created_at: string;
  chairs: {
    identifier: string | null;
    locations: { name: string } | { name: string }[] | null;
  } | null;
  barber_profiles: { full_name: string | null } | null;
};

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

export default function BookingsPage() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  // â”€â”€ Locations query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const {
    data: locations = [],
    isFetching: locationsLoading,
    refetch: refetchLocations,
  } = useQuery({
    queryKey: ["bookings-page-locations", organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<LocationRow[]> => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, city, state")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message || "Não foi possível carregar os locais.");
      return (data ?? []) as LocationRow[];
    },
  });

  // Auto-select first location when locations load
  const effectiveLocationId =
    selectedLocationId && locations.some((l) => l.id === selectedLocationId)
      ? selectedLocationId
      : (locations[0]?.id ?? null);

  // â”€â”€ Bookings query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bookingsQueryKey = [
    "bookings-page-bookings",
    organization?.id,
    effectiveLocationId,
    filter,
  ];

  const {
    data: bookings = [],
    isFetching: bookingsLoading,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: bookingsQueryKey,
    enabled: !!organization?.id && !!effectiveLocationId,
    staleTime: 30_000,
    queryFn: async (): Promise<BookingRow[]> => {
      let query = supabase
        .from("chair_bookings")
        .select(`
          id,
          status,
          start_at,
          end_at,
          notes,
          created_at,
          chairs!inner ( identifier, location_id, locations ( name ) ),
          barber_profiles ( full_name )
        `)
        .eq("organization_id", organization!.id)
        .eq("chairs.location_id", effectiveLocationId!)
        .order("created_at", { ascending: false });

      if (filter === "pending") {
        query = query.eq("status", "pending");
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message || "Não foi possível carregar as reservas.");

      return ((data ?? []) as unknown as RawBookingRow[]).map((row) => {
        const loc = Array.isArray(row.chairs?.locations)
          ? row.chairs.locations[0]
          : row.chairs?.locations;
        return {
          id: row.id,
          status: row.status,
          start_at: row.start_at,
          end_at: row.end_at,
          notes: row.notes,
          created_at: row.created_at,
          chair_identifier: row.chairs?.identifier ?? null,
          location_name: loc?.name ?? null,
          barber_full_name: row.barber_profiles?.full_name ?? null,
        };
      });
    },
  });

  // â”€â”€ Update status mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      bookingId,
      newStatus,
    }: {
      bookingId: string;
      newStatus: "confirmed" | "rejected";
    }) => {
      const { error } = await supabase
        .from("chair_bookings")
        .update({ status: newStatus })
        .eq("id", bookingId);

      if (error) throw new Error(error.message || "Erro ao atualizar reserva.");
      return newStatus;
    },
    onSuccess: (newStatus) => {
      toast.success(
        newStatus === "confirmed" ? "Reserva confirmada." : "Reserva rejeitada."
      );
      void queryClient.invalidateQueries({ queryKey: bookingsQueryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao atualizar reserva.");
    },
  });

  const loading = locationsLoading || bookingsLoading;
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const selectedLocation =
    locations.find((l) => l.id === effectiveLocationId) ?? null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Reservas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as reservas de cadeiras da sua organização.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => {
              void refetchLocations();
              void refetchBookings();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Locais da organização</h2>
        </div>

        {locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum local cadastrado para esta organização.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {locations.map((location) => {
              const isActive = location.id === effectiveLocationId;
              return (
                <Button
                  key={location.id}
                  variant={isActive ? "default" : "outline"}
                  className="rounded-xl justify-start"
                  size="sm"
                  onClick={() => setSelectedLocationId(location.id)}
                >
                  <span>{location.name}</span>
                  {(location.city || location.state) && (
                    <span
                      className={cn(
                        "ml-2 text-xs",
                        isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {location.city}
                      {location.city && location.state ? ", " : ""}
                      {location.state}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {selectedLocation && (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{selectedLocation.name}</h2>
            <p className="text-xs text-muted-foreground">
              {selectedLocation.city || selectedLocation.state
                ? [selectedLocation.city, selectedLocation.state].filter(Boolean).join(" - ")
                : "Local selecionado"}
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
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando reservas...</p>
        </div>
      ) : !selectedLocation ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Selecione um local para ver as reservas
          </p>
          <p className="text-xs text-muted-foreground">
            As reservas passam a ser exibidas por unidade, com filtro de pendentes e todas dentro
            do local.
          </p>
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
              : `Os barbeiros ainda não fizeram reservas em ${selectedLocation.name}.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {bookings.map((booking) => {
            const start = new Date(booking.start_at);
            const end = new Date(booking.end_at);
            const isPending = booking.status === "pending";
            const isActioning =
              updateStatusMutation.isPending &&
              updateStatusMutation.variables?.bookingId === booking.id;

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
                        {booking.location_name ? ` â€” ${booking.location_name}` : ""}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                          statusBadge[booking.status] ??
                            "bg-muted text-muted-foreground border-border"
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
                            {format(start, "HH:mm")} â†’ {format(end, "HH:mm")}
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
                        onClick={() =>
                          updateStatusMutation.mutate({
                            bookingId: booking.id,
                            newStatus: "confirmed",
                          })
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                        disabled={isActioning}
                        onClick={() =>
                          updateStatusMutation.mutate({
                            bookingId: booking.id,
                            newStatus: "rejected",
                          })
                        }
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
