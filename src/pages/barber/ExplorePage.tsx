import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ChairBookingForm from "@/components/barber/ChairBookingForm";
import {
  listExploreChairs,
  type ExploreChairItem,
} from "@/services/chairBookings";
import { MapPin, RefreshCw, SlidersHorizontal } from "lucide-react";

type GroupedLocation = {
  organization_id: string;
  organization_name: string;
  location_id: string;
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  chairs: ExploreChairItem[];
};

function getAddressLine(item: {
  address: string | null;
  city: string | null;
  state: string | null;
}) {
  return [item.address, item.city, item.state].filter(Boolean).join(" • ");
}

function getChairStatusLabel(status: string) {
  switch (status) {
    case "available": return "Disponível";
    case "occupied": return "Ocupada";
    case "maintenance": return "Manutenção";
    default: return status || "Indisponível";
  }
}

function normalize(str: string) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const [chairs, setChairs] = useState<ExploreChairItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedChairId, setSelectedChairId] = useState<string | null>(null);

  async function loadExplore() {
    try {
      setLoading(true);
      setErrorMessage("");
      const data = await listExploreChairs();
      setChairs(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro ao carregar cadeiras.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadExplore(); }, []);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const c of chairs) {
      if (c.city) set.add(c.city);
    }
    return Array.from(set).sort();
  }, [chairs]);

  const filteredChairs = useMemo(() => {
    let result = chairs;

    if (cityFilter) {
      result = result.filter((c) => c.city === cityFilter);
    }

    if (availableOnly) {
      result = result.filter((c) => c.chair_status === "available");
    }

    const query = normalize(search.trim());
    if (query) {
      const terms = query.split(/\s+/);
      result = result.filter((item) => {
        const haystack = normalize(
          [item.organization_name, item.location_name, item.city, item.state, item.address, item.chair_identifier]
            .filter(Boolean).join(" ")
        );
        return terms.every((t) => haystack.includes(t));
      });
    }

    return result;
  }, [chairs, search, cityFilter, availableOnly]);

  const groupedLocations = useMemo<GroupedLocation[]>(() => {
    const map = new Map<string, GroupedLocation>();
    for (const item of filteredChairs) {
      if (!map.has(item.location_id)) {
        map.set(item.location_id, {
          organization_id: item.organization_id,
          organization_name: item.organization_name,
          location_id: item.location_id,
          location_name: item.location_name,
          address: item.address,
          city: item.city,
          state: item.state,
          chairs: [],
        });
      }
      map.get(item.location_id)!.chairs.push(item);
    }
    return Array.from(map.values());
  }, [filteredChairs]);

  const selectedLocation = useMemo(() => {
    if (!selectedLocationId) return null;
    return groupedLocations.find((location) => location.location_id === selectedLocationId) ?? null;
  }, [groupedLocations, selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    const stillExists = groupedLocations.some((location) => location.location_id === selectedLocationId);
    if (!stillExists) {
      setSelectedLocationId(null);
      setSelectedChairId(null);
    }
  }, [groupedLocations, selectedLocationId]);

  const hasActiveFilters = !!cityFilter || availableOnly || !!search.trim();

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Explorar cadeiras</h1>
        <p className="text-sm text-muted-foreground">
          Veja barbearias, unidades e cadeiras disponíveis para reserva flexível.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-background p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            placeholder="Buscar por barbearia, unidade, cidade ou cadeira…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-10 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring min-w-[160px]"
          >
            <option value="">Todas as cidades</option>
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          <button
            onClick={() => setAvailableOnly((v) => !v)}
            className={`h-10 rounded-xl border px-4 text-sm font-medium whitespace-nowrap transition-colors ${
              availableOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:bg-muted"
            }`}
          >
            Só disponíveis
          </button>

          <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => void loadExplore()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch("");
              setCityFilter("");
              setAvailableOnly(true);
              setSelectedLocationId(null);
              setSelectedChairId(null);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">
          Carregando cadeiras…
        </div>
      )}

      {!loading && errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && groupedLocations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nenhum ponto físico encontrado</p>
          <p className="text-xs text-muted-foreground">
            Tente ajustar os filtros ou buscar em outra cidade.
          </p>
        </div>
      )}

      {!loading && !errorMessage && groupedLocations.length > 0 && !selectedLocation && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            Escolha um ponto físico para ver as cadeiras disponíveis para reserva.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groupedLocations.map((location) => (
              <section key={location.location_id} className="rounded-3xl border bg-background p-6">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-semibold">{location.organization_name}</h2>
                  <p className="text-base font-medium text-foreground">{location.location_name}</p>
                  {getAddressLine(location) && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {getAddressLine(location)}
                    </p>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {location.chairs.length} cadeira{location.chairs.length === 1 ? "" : "s"} disponível{location.chairs.length === 1 ? "" : "eis"}
                  </span>
                  <Button
                    type="button"
                    onClick={() => {
                      setSelectedChairId(null);
                      setSelectedLocationId(location.location_id);
                    }}
                  >
                    Ver cadeiras
                  </Button>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {!loading && !errorMessage && selectedLocation && (
        <section className="rounded-3xl border bg-background p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-xl font-semibold">{selectedLocation.organization_name}</h2>
              <p className="text-base font-medium text-foreground">{selectedLocation.location_name}</p>
              {getAddressLine(selectedLocation) && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {getAddressLine(selectedLocation)}
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedChairId(null);
                setSelectedLocationId(null);
              }}
            >
              Trocar ponto físico
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {selectedLocation.chairs.map((chair) => {
              const isSelected = selectedChairId === chair.chair_id;
              const isReservable = chair.chair_status === "available";
              const isAvailableNow = chair.is_available_now;

              return (
                <div key={chair.chair_id} className="rounded-2xl border bg-background p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold">{chair.chair_identifier}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        isReservable && isAvailableNow
                          ? "bg-green-100 text-green-700"
                          : isReservable
                          ? "bg-amber-100 text-amber-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isReservable
                        ? isAvailableNow ? "Livre agora" : "Com reserva"
                        : getChairStatusLabel(chair.chair_status)}
                    </span>
                  </div>

                  <p className="mb-4 text-sm text-muted-foreground">
                    {isReservable
                      ? "Reservas futuras são validadas contra horários de funcionamento e conflitos existentes."
                      : "Esta cadeira não está disponível para novas reservas."}
                  </p>

                  {isSelected ? (
                    <ChairBookingForm
                      chair={chair}
                      onCancel={() => setSelectedChairId(null)}
                      onSuccess={(bookingId) => {
                        setSelectedChairId(null);
                        navigate(`/barber/payment/${bookingId}`);
                      }}
                    />
                  ) : (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={!isReservable}
                      onClick={() => setSelectedChairId(chair.chair_id)}
                    >
                      {isReservable ? "Reservar esta cadeira" : "Indisponível para reserva"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
