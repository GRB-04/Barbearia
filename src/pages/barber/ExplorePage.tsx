import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ChairBookingForm from "@/components/barber/ChairBookingForm";
import {
  listExploreChairs,
  type ExploreChairItem,
} from "@/services/chairBookings";

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
    case "available":
      return "Disponivel";
    case "occupied":
      return "Ocupada";
    case "maintenance":
      return "Manutencao";
    default:
      return status || "Indisponivel";
  }
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const [chairs, setChairs] = useState<ExploreChairItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedChairId, setSelectedChairId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  async function loadExplore() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await listExploreChairs();
      setChairs(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao carregar cadeiras.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadExplore();
  }, []);

  const filteredChairs = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return chairs;

    return chairs.filter((item) => {
      const normalize = (str: string) => 
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      
      const searchTerms = normalize(query).split(" ");
      const haystack = normalize([
        item.organization_name,
        item.location_name,
        item.city,
        item.state,
        item.address,
        item.chair_identifier,
      ].filter(Boolean).join(" "));

      return searchTerms.every(term => haystack.includes(term));
    });
  }, [chairs, search]);

  const groupedLocations = useMemo<GroupedLocation[]>(() => {
    const map = new Map<string, GroupedLocation>();

    for (const item of filteredChairs) {
      const key = item.location_id;

      if (!map.has(key)) {
        map.set(key, {
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

      map.get(key)!.chairs.push(item);
    }

    return Array.from(map.values());
  }, [filteredChairs]);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Explorar cadeiras</h1>
        <p className="text-sm text-muted-foreground">
          Veja barbearias, unidades e cadeiras disponíveis para reserva flexível.
        </p>
      </div>

      <div className="rounded-2xl border bg-background p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            placeholder="Buscar por barbearia, unidade, cidade ou cadeira"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none"
          />

          <Button type="button" variant="outline" onClick={() => void loadExplore()}>
            Atualizar
          </Button>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">
          Carregando cadeiras...
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage && groupedLocations.length === 0 ? (
        <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">
          Nenhuma cadeira encontrada para esse filtro.
        </div>
      ) : null}

      {!loading && !errorMessage ? (
        <div className="space-y-8">
          {groupedLocations.map((location) => (
            <section
              key={location.location_id}
              className="rounded-3xl border bg-background p-6"
            >
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold">{location.organization_name}</h2>
                <p className="text-lg font-medium">{location.location_name}</p>
                <p className="text-sm text-muted-foreground">
                  {getAddressLine(location)}
                </p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {location.chairs.map((chair) => {
                  const isSelected = selectedChairId === chair.chair_id;
                  const isAvailableNow = chair.is_available_now;
                  const isReservable = chair.chair_status === "available";

                  return (
                    <div
                      key={chair.chair_id}
                      className="rounded-2xl border bg-background p-5"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">
                            {chair.chair_identifier}
                          </h3>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            isReservable && isAvailableNow
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {isReservable
                            ? isAvailableNow
                              ? "Livre agora"
                              : "Ocupada agora"
                            : getChairStatusLabel(chair.chair_status)}
                        </span>
                      </div>

                      <p className="mb-4 text-sm text-muted-foreground">
                        {isReservable
                          ? "A reserva pode ser futura. O banco valida conflito de horario e horario de funcionamento."
                          : "Esta cadeira precisa estar disponivel para receber novas reservas."}
                      </p>

                      {isSelected ? (
                        <ChairBookingForm
                          chair={chair}
                          onCancel={() => {
                            setSelectedChairId(null);
                            setSuccessMessage("");
                          }}
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
                          onClick={() => {
                            setSuccessMessage("");
                            setSelectedChairId(chair.chair_id);
                          }}
                        >
                          {isReservable ? "Reservar esta cadeira" : "Indisponivel para reserva"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
