import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ChairBookingForm from "@/components/barber/ChairBookingForm";
import {
  listExploreChairs,
  type ExploreChairItem,
} from "@/services/chairBookings";
import {
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Map as MapIcon,
  ChevronDown,
  ChevronUp,
  Scissors,
  Star,
  CheckCircle2,
  Zap,
  Lightbulb,
  Sparkles,
  Search,
  Building2,
  CalendarCheck,
} from "lucide-react";

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

const BARBERSHOP_COVERS = [
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=800&auto=format&fit=crop",
];

function getLocationCoverImage(locationId: string): string {
  let charSum = 0;
  for (let i = 0; i < locationId.length; i++) {
    charSum += locationId.charCodeAt(i);
  }
  return BARBERSHOP_COVERS[charSum % BARBERSHOP_COVERS.length];
}

function getAddressLine(item: {
  address: string | null;
  city: string | null;
  state: string | null;
}) {
  return [item.address, item.city, item.state].filter(Boolean).join(" • ");
}

function getFullMapQuery(item: {
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
}) {
  const parts = [item.location_name, item.address, item.city, item.state].filter(Boolean);
  return parts.join(", ");
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
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const [chairs, setChairs] = useState<ExploreChairItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  
  // Selected chair for Dialog modal
  const [selectedChair, setSelectedChair] = useState<ExploreChairItem | null>(null);
  const [showMapForLocation, setShowMapForLocation] = useState<string | null>(null);
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({});

  function toggleLocationExpansion(locationId: string) {
    setExpandedLocations((prev) => ({
      ...prev,
      [locationId]: !prev[locationId],
    }));
  }

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

  const totalAvailableCount = useMemo(() => {
    return chairs.filter(c => c.chair_status === "available" && c.is_available_now).length;
  }, [chairs]);

  const hasActiveFilters = !!cityFilter || availableOnly || !!search.trim();

  return (
    <div className="container mx-auto max-w-7xl space-y-8 px-4 py-8">
      
      {/* 1. Header Banner & Page Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Explorar Unidades & Cadeiras</h1>
            <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-bold">
              <Sparkles className="h-3.5 w-3.5" />
              Parceiros Verificados
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Escolha uma barbearia parceira, selecione a cadeira ideal e agende seu turno em segundos.
          </p>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card border rounded-2xl px-4 py-2.5 shadow-xs">
            <Building2 className="h-4 w-4 text-primary" />
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Unidades</p>
              <p className="text-sm font-extrabold text-foreground">{groupedLocations.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-card border rounded-2xl px-4 py-2.5 shadow-xs">
            <CalendarCheck className="h-4 w-4 text-emerald-500" />
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Livres Hoje</p>
              <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{totalAvailableCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="rounded-3xl border bg-card p-5 space-y-4 shadow-sm border-muted/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Filtros & Pesquisa
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearch("");
                setCityFilter("");
                setAvailableOnly(true);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Limpar todos os filtros
            </button>
          )}
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-12">
          {/* Search Input */}
          <div className="relative md:col-span-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por barbearia, unidade, endereço ou cadeira..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full rounded-2xl border border-input bg-background pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/70"
            />
          </div>

          {/* City Filter */}
          <div className="md:col-span-3">
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-11 w-full rounded-2xl border border-input bg-background px-3.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            >
              <option value="">Todas as cidades</option>
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* Availability Toggle */}
          <div className="flex gap-2 md:col-span-3">
            <button
              onClick={() => setAvailableOnly((v) => !v)}
              className={`flex-1 h-11 rounded-2xl border px-4 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                availableOnly
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-background text-muted-foreground border-input hover:bg-muted"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Só disponíveis
            </button>

            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-2xl shrink-0 border-input"
              onClick={() => void loadExplore()}
              title="Atualizar lista"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-3xl border bg-card p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3 shadow-xs">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-medium">Carregando unidades e disponibilidade de cadeiras...</p>
        </div>
      )}

      {!loading && errorMessage && (
        <div className="rounded-3xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-5 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && groupedLocations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-3xl border p-8 space-y-3">
          <MapPin className="h-10 w-10 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-base font-bold text-foreground">Nenhuma unidade encontrada</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Tente alterar os termos da busca ou desativar o filtro de disponibilidade.
            </p>
          </div>
        </div>
      )}

      {/* 3. LOCATIONS LIST & CHAIR TILES (2 BARBERSHOPS SIDE BY SIDE ON DESKTOP) */}
      {!loading && !errorMessage && groupedLocations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {groupedLocations.map((location) => {
            const isMapVisible = showMapForLocation === location.location_id;
            const mapQuery = getFullMapQuery(location);
            const coverUrl = getLocationCoverImage(location.location_id);
            const availableChairsCount = location.chairs.filter(c => c.chair_status === "available").length;

            const isExpanded = !!expandedLocations[location.location_id];
            const visibleChairs = isExpanded ? location.chairs : location.chairs.slice(0, 4);
            const remainingChairsCount = location.chairs.length - 4;

            return (
              <section 
                key={location.location_id} 
                className="rounded-3xl border bg-card overflow-hidden shadow-sm border-muted/80 transition-all space-y-0 flex flex-col h-auto"
              >
                
                {/* Location Hero Header */}
                <div className="relative h-48 w-full bg-muted overflow-hidden group shrink-0">
                  <img 
                    src={coverUrl} 
                    alt={location.organization_name} 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  
                  {/* Top Badges */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                    <span className="text-xs font-extrabold bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      4.9 (42)
                    </span>

                    <span className="text-xs font-extrabold bg-background/90 backdrop-blur-md text-foreground px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5">
                      <Scissors className="h-3.5 w-3.5 text-primary" />
                      {availableChairsCount} de {location.chairs.length} disponíveis
                    </span>
                  </div>

                  {/* Bottom Location Info */}
                  <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-2 text-white">
                    <div className="space-y-0.5 max-w-[70%]">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xl font-black tracking-tight drop-shadow-md truncate">{location.organization_name}</h2>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      </div>
                      <p className="text-xs font-semibold opacity-95 text-muted-foreground/90 truncate">{location.location_name}</p>
                      {getAddressLine(location) && (
                        <p className="flex items-center gap-1 text-[11px] font-medium opacity-90 pt-0.5 truncate">
                          <MapPin className="h-3 w-3 text-primary shrink-0" />
                          {getAddressLine(location)}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowMapForLocation(isMapVisible ? null : location.location_id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-white/25 transition-all select-none shadow-xs shrink-0"
                    >
                      <MapIcon className="h-3.5 w-3.5 text-primary" />
                      {isMapVisible ? "Ocultar" : "Ver no Mapa"}
                      {isMapVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Google Map Embed */}
                {isMapVisible && (
                  <div className="p-4 bg-muted/20 border-b border-muted">
                    <div className="rounded-2xl overflow-hidden border border-muted h-48 w-full shadow-inner">
                      <iframe
                        title={`Mapa de ${location.location_name}`}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                      />
                    </div>
                  </div>
                )}

                {/* Chair Cards Grid */}
                <div className="p-5 space-y-4 bg-card flex flex-col justify-start">
                  <div className="flex items-center justify-between border-b pb-2.5">
                    <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Scissors className="h-3.5 w-3.5 text-primary" />
                      Cadeiras Disponíveis nesta Unidade
                    </h3>

                    {location.chairs.length > 4 && (
                      <button
                        type="button"
                        onClick={() => toggleLocationExpansion(location.location_id)}
                        className="inline-flex items-center gap-1 text-[11px] font-extrabold text-primary hover:underline transition-all select-none"
                      >
                        {isExpanded ? (
                          <>
                            Mostrar menos <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Mostrar todas ({location.chairs.length}) <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {visibleChairs.map((chair) => {
                      const isReservable = chair.chair_status === "available";
                      const isAvailableNow = chair.is_available_now;

                      return (
                        <div
                          key={chair.chair_id}
                          className="rounded-2xl border border-muted/80 bg-background p-3.5 flex flex-col justify-between space-y-3 hover:border-primary/40 hover:shadow-xs transition-all group"
                        >
                          <div className="space-y-2">
                            {/* Chair Header */}
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-extrabold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                  {chair.chair_identifier}
                                </h4>
                                <p className="text-[11px] font-medium text-muted-foreground mt-0.5 truncate">
                                  Cadeira Profissional Equipada
                                </p>
                              </div>

                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold shrink-0 ${
                                  isReservable && isAvailableNow
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                    : isReservable
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {isReservable
                                  ? isAvailableNow ? "Livre agora" : "Com reserva"
                                  : getChairStatusLabel(chair.chair_status)}
                              </span>
                            </div>

                            {/* Amenity Badges */}
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-md border border-muted">
                                <Zap className="h-2.5 w-2.5 text-amber-500" /> 220v
                              </span>
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-md border border-muted">
                                <Lightbulb className="h-2.5 w-2.5 text-yellow-500" /> Ring Light
                              </span>
                            </div>
                          </div>

                          {/* Pricing & CTA */}
                          <div className="pt-2.5 border-t border-muted/60 space-y-2">
                            <div className="flex items-baseline justify-between text-xs">
                              <span className="text-[11px] text-muted-foreground font-medium">Turno:</span>
                              <div className="text-right">
                                <span className="text-sm font-black text-primary">R$ 50,00</span>
                                <span className="text-[9px] text-muted-foreground font-medium inline-block ml-1">/ 4h</span>
                              </div>
                            </div>

                            <Button
                              type="button"
                              disabled={!isReservable}
                              onClick={() => setSelectedChair(chair)}
                              className="w-full rounded-xl h-9 text-[11px] font-extrabold shadow-xs gap-1"
                            >
                              <Sparkles className="h-3 w-3" />
                              {isReservable ? "Reservar Cadeira" : "Indisponível"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </section>
            );
          })}
        </div>
      )}


      {/* 4. BOOKING DIALOG MODAL */}
      <Dialog open={!!selectedChair} onOpenChange={(open) => !open && setSelectedChair(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          {selectedChair && (
            <>
              <DialogHeader className="text-left space-y-1 pb-2 border-b">
                <DialogTitle className="text-xl font-extrabold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  Agendar Turno — {selectedChair.chair_identifier}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Unidade: <strong className="text-foreground">{selectedChair.organization_name}</strong> ({selectedChair.location_name})
                </DialogDescription>
              </DialogHeader>

              <div className="pt-2">
                <ChairBookingForm
                  chair={selectedChair}
                  onCancel={() => setSelectedChair(null)}
                  onSuccess={(bookingId) => {
                    setSelectedChair(null);
                    navigate(`/barber/payment/${bookingId}`);
                  }}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
