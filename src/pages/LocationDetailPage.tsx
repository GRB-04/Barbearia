import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import LocationWaitlistSection from "@/components/LocationWaitlistSection";

type ChairStatus = "available" | "occupied" | "maintenance";

interface LocationRow {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  city: string | null;
  status: string | null;
  capacity: number | null;
  operating_hours: OperatingHours;
}

interface ChairRow {
  id: string;
  location_id: string;
  identifier: string;
  status: ChairStatus;
  resources: Record<string, unknown> | null;
}

type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

interface DaySchedule {
  enabled: boolean;
  open: string | null;
  close: string | null;
  price: number | null;
}

type OperatingHours = Record<DayKey, DaySchedule>;

interface ChairResources {
  mirror?: boolean;
  sink?: boolean;
  air_conditioning?: boolean;
}

const dayLabels: Record<DayKey, string> = {
  "0": "Domingo",
  "1": "Segunda",
  "2": "Terça",
  "3": "Quarta",
  "4": "Quinta",
  "5": "Sexta",
  "6": "Sábado",
};

const defaultOperatingHours: OperatingHours = {
  "0": { enabled: false, open: null, close: null, price: 50 },
  "1": { enabled: true, open: "08:00", close: "18:00", price: 50 },
  "2": { enabled: true, open: "08:00", close: "18:00", price: 50 },
  "3": { enabled: true, open: "08:00", close: "18:00", price: 50 },
  "4": { enabled: true, open: "08:00", close: "22:00", price: 60 },
  "5": { enabled: true, open: "08:00", close: "22:00", price: 80 },
  "6": { enabled: true, open: "08:00", close: "22:00", price: 80 },
};

const statusMeta: Record<
  ChairStatus,
  {
    label: string;
    dotClass: string;
    textClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  available: {
    label: "Disponível",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700",
    icon: CheckCircle2,
  },
  occupied: {
    label: "Ocupada",
    dotClass: "bg-amber-500",
    textClass: "text-amber-700",
    icon: Clock3,
  },
  maintenance: {
    label: "Manutenção",
    dotClass: "bg-rose-500",
    textClass: "text-rose-700",
    icon: Wrench,
  },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.2, 0, 0, 1] as const },
  },
};

function parseOperatingHours(value: unknown): OperatingHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultOperatingHours;
  }

  const source = value as Record<string, unknown>;
  const result: Partial<OperatingHours> = {};

  (Object.keys(defaultOperatingHours) as DayKey[]).forEach((day) => {
    const rawDay = source[day];

    if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) {
      result[day] = defaultOperatingHours[day];
      return;
    }

    const dayData = rawDay as Record<string, unknown>;

    result[day] = {
      enabled: Boolean(dayData.enabled),
      open: typeof dayData.open === "string" ? dayData.open : null,
      close: typeof dayData.close === "string" ? dayData.close : null,
      price: typeof dayData.price === "number" ? dayData.price : 50,
    };
  });

  return result as OperatingHours;
}

function parseResources(value: unknown): ChairResources {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;

  return {
    mirror: Boolean(record.mirror),
    sink: Boolean(record.sink),
    air_conditioning: Boolean(record.air_conditioning),
  };
}

function buildResources(resources: ChairResources) {
  return {
    mirror: Boolean(resources.mirror),
    sink: Boolean(resources.sink),
    air_conditioning: Boolean(resources.air_conditioning),
  };
}

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useOrganization();

  const [location, setLocation] = useState<LocationRow | null>(null);
  const [chairs, setChairs] = useState<ChairRow[]>([]);
  const [operatingHours, setOperatingHours] =
    useState<OperatingHours>(defaultOperatingHours);

  const [loadingPage, setLoadingPage] = useState(true);
  const [savingHours, setSavingHours] = useState(false);
  const [locationAutoConfirm, setLocationAutoConfirm] = useState<boolean | null>(null);
  const [savingAutoConfirm, setSavingAutoConfirm] = useState(false);

  const [addChairOpen, setAddChairOpen] = useState(false);
  const [editChairOpen, setEditChairOpen] = useState(false);
  const [creatingChair, setCreatingChair] = useState(false);
  const [savingChair, setSavingChair] = useState(false);

  const [newChairIdentifier, setNewChairIdentifier] = useState("");
  const [newChairStatus, setNewChairStatus] =
    useState<ChairStatus>("available");
  const [newChairResources, setNewChairResources] = useState<ChairResources>({
    mirror: false,
    sink: false,
    air_conditioning: false,
  });

  const [selectedChair, setSelectedChair] = useState<ChairRow | null>(null);
  const [editChairIdentifier, setEditChairIdentifier] = useState("");
  const [editChairStatus, setEditChairStatus] =
    useState<ChairStatus>("available");
  const [editChairResources, setEditChairResources] = useState<ChairResources>({
    mirror: false,
    sink: false,
    air_conditioning: false,
  });

  // Estados para edição dos dados básicos do local
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [editLocName, setEditLocName] = useState("");
  const [editLocAddress, setEditLocAddress] = useState("");
  const [editLocCity, setEditLocCity] = useState("");
  const [editLocState, setEditLocState] = useState("");
  const [editLocCapacity, setEditLocCapacity] = useState(2);
  const [savingLocation, setSavingLocation] = useState(false);

  // Sincroniza estados do form de edição quando a unidade carregar
  useEffect(() => {
    if (location) {
      setEditLocName(location.name);
      setEditLocAddress(location.address ?? "");
      setEditLocCity(location.city ?? "");
      setEditLocState(location.state ?? "");
      setEditLocCapacity(location.capacity ?? 2);
    }
  }, [location]);

  useEffect(() => {
    if (!organization?.id || !id) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, id]);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location?.id) return;
    if (!editLocName.trim() || !editLocCity.trim() || !editLocState.trim()) {
      toast.error("Preencha nome, cidade e estado.");
      return;
    }
    if (editLocCapacity < totalChairs) {
      toast.error(`A capacidade máxima não pode ser menor que a quantidade de cadeiras cadastradas (${totalChairs}).`);
      return;
    }

    setSavingLocation(true);
    try {
      const { error } = await supabase
        .from("locations")
        .update({
          name: editLocName.trim(),
          address: editLocAddress.trim() || null,
          city: editLocCity.trim(),
          state: editLocState.trim(),
          capacity: editLocCapacity,
        })
        .eq("id", location.id);

      if (error) throw error;
      toast.success("Local atualizado com sucesso.");
      setEditLocationOpen(false);
      await fetchAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar local.");
    } finally {
      setSavingLocation(false);
    }
  };

  const fetchAll = async () => {
    if (!organization?.id || !id) return;

    setLoadingPage(true);

    try {
      const [locationRes, chairsRes] = await Promise.all([
        supabase
          .from("locations")
          .select("*")
          .eq("id", id)
          .eq("organization_id", organization.id)
          .single(),
        supabase
          .from("chairs")
          .select("*")
          .eq("location_id", id)
          .order("identifier", { ascending: true }),
      ]);

      if (locationRes.error) {
        toast.error(locationRes.error.message);
        setLocation(null);
        setChairs([]);
        return;
      }

      if (chairsRes.error) {
        toast.error(chairsRes.error.message);
        setChairs([]);
        return;
      }

      const locationData = locationRes.data as unknown as LocationRow;
      const chairData = ((chairsRes.data ?? []) as unknown as ChairRow[]) || [];

      setLocation(locationData);
      setChairs(chairData);
      setOperatingHours(parseOperatingHours(locationData.operating_hours));
      setLocationAutoConfirm(locationData.auto_confirm_bookings ?? null);
    } catch (error) {
      console.error("[LocationDetailPage] fetchAll error:", error);
      toast.error("Não foi possível carregar o local.");
    } finally {
      setLoadingPage(false);
    }
  };

  const capacity = location?.capacity ?? 2;
  const totalChairs = chairs.length;
  const availableCount = chairs.filter((chair) => chair.status === "available").length;
  const occupiedCount = chairs.filter((chair) => chair.status === "occupied").length;
  const maintenanceCount = chairs.filter((chair) => chair.status === "maintenance").length;
  const remainingSlots = Math.max(capacity - totalChairs, 0);
  const isAtCapacity = totalChairs >= capacity;

  const suggestedIdentifier = useMemo(() => {
    return `Cadeira ${totalChairs + 1}`;
  }, [totalChairs]);

  useEffect(() => {
    if (addChairOpen && !newChairIdentifier.trim()) {
      setNewChairIdentifier(suggestedIdentifier);
    }
  }, [addChairOpen, suggestedIdentifier, newChairIdentifier]);

  const resetCreateForm = () => {
    setNewChairIdentifier("");
    setNewChairStatus("available");
    setNewChairResources({
      mirror: false,
      sink: false,
      air_conditioning: false,
    });
  };

  const handleOpenEdit = (chair: ChairRow) => {
    const resources = parseResources(chair.resources);

    setSelectedChair(chair);
    setEditChairIdentifier(chair.identifier ?? "");
    setEditChairStatus(chair.status);
    setEditChairResources(resources);
    setEditChairOpen(true);
  };

  const handleCreateChair = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id) {
      toast.error("Local inválido.");
      return;
    }

    if (isAtCapacity) {
      toast.error(`Este local já atingiu o limite de ${capacity} cadeiras.`);
      return;
    }

    if (!newChairIdentifier.trim()) {
      toast.error("Informe o identificador da cadeira.");
      return;
    }

    setCreatingChair(true);

    try {
      const { error } = await supabase.from("chairs").insert({
        location_id: id,
        identifier: newChairIdentifier.trim(),
        status: newChairStatus,
        resources: buildResources(newChairResources) as import("@/integrations/supabase/types").Json,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cadeira criada com sucesso.");
      setAddChairOpen(false);
      resetCreateForm();
      await fetchAll();
    } catch (error) {
      console.error("[LocationDetailPage] handleCreateChair error:", error);
      toast.error("Não foi possível criar a cadeira.");
    } finally {
      setCreatingChair(false);
    }
  };

  const handleSaveChair = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedChair) {
      toast.error("Nenhuma cadeira selecionada.");
      return;
    }

    if (!editChairIdentifier.trim()) {
      toast.error("Informe o identificador da cadeira.");
      return;
    }

    setSavingChair(true);

    try {
      const { error } = await supabase
        .from("chairs")
        .update({
          identifier: editChairIdentifier.trim(),
          status: editChairStatus,
          resources: buildResources(editChairResources) as import("@/integrations/supabase/types").Json,
        })
        .eq("id", selectedChair.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cadeira atualizada com sucesso.");
      setEditChairOpen(false);
      setSelectedChair(null);
      await fetchAll();
    } catch (error) {
      console.error("[LocationDetailPage] handleSaveChair error:", error);
      toast.error("Não foi possível atualizar a cadeira.");
    } finally {
      setSavingChair(false);
    }
  };

  const updateDaySchedule = (
    day: DayKey,
    field: keyof DaySchedule,
    value: boolean | string | null
  ) => {
    setOperatingHours((current) => ({
      ...current,
      [day]: {
        ...current[day],
        [field]: value,
      },
    }));
  };

  const saveLocationAutoConfirm = async (value: boolean | null) => {
    if (!location?.id) return;
    setSavingAutoConfirm(true);
    setLocationAutoConfirm(value);
    try {
      const { error } = await supabase
        .from("locations")
        .update({ auto_confirm_bookings: value })
        .eq("id", location.id);
      if (error) throw error;
      toast.success("Configuração de confirmação salva.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar configuração.");
    } finally {
      setSavingAutoConfirm(false);
    }
  };

  const saveOperatingHours = async () => {
    if (!location?.id) return;

    for (const day of Object.keys(operatingHours) as DayKey[]) {
      const schedule = operatingHours[day];

      if (schedule.enabled) {
        if (!schedule.open || !schedule.close) {
          toast.error(`Defina abertura e fechamento para ${dayLabels[day]}.`);
          return;
        }

        if (schedule.close <= schedule.open) {
          toast.error(
            `O fechamento de ${dayLabels[day]} deve ser maior que a abertura.`
          );
          return;
        }
      }
    }

    setSavingHours(true);

    try {
      const { error } = await supabase
        .from("locations")
        .update({
          operating_hours: operatingHours as import("@/integrations/supabase/types").Json,
        })
        .eq("id", location.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Horário de funcionamento salvo com sucesso.");
      await fetchAll();
    } catch (error) {
      console.error("[LocationDetailPage] saveOperatingHours error:", error);
      toast.error("Não foi possível salvar o horário de funcionamento.");
    } finally {
      setSavingHours(false);
    }
  };

  if (loadingPage) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando local...</div>;
  }

  if (!location) {
    return <div className="p-6 text-sm text-muted-foreground">Local não encontrado.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Link
        to="/locations"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Locais
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {location.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[location.address, location.city].filter(Boolean).join(", ") || "Sem endereço"}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              Capacidade: {totalChairs}/{capacity}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              Disponíveis: {availableCount}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              Ocupadas: {occupiedCount}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              Manutenção: {maintenanceCount}
            </span>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {remainingSlots > 0
              ? `${remainingSlots} vaga${remainingSlots > 1 ? "s" : ""} restante${remainingSlots > 1 ? "s" : ""} neste local.`
              : "Este local atingiu a capacidade máxima de cadeiras."}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            className="rounded-xl"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar
          </Button>

          {/* Modal para Editar Local */}
          <Dialog
            open={editLocationOpen}
            onOpenChange={setEditLocationOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar local
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Editar local — {location.name}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSaveLocation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="locName">Nome</Label>
                  <Input
                    id="locName"
                    value={editLocName}
                    onChange={(e) => setEditLocName(e.target.value)}
                    placeholder="Nome da unidade"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="locAddress">Endereço</Label>
                  <Input
                    id="locAddress"
                    value={editLocAddress}
                    onChange={(e) => setEditLocAddress(e.target.value)}
                    placeholder="Endereço completo"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="locCity">Cidade</Label>
                    <Input
                      id="locCity"
                      value={editLocCity}
                      onChange={(e) => setEditLocCity(e.target.value)}
                      placeholder="Cidade"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="locState">Estado</Label>
                    <Input
                      id="locState"
                      value={editLocState}
                      onChange={(e) => setEditLocState(e.target.value)}
                      placeholder="Estado"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="locCapacity">Capacidade de cadeiras</Label>
                  <Input
                    id="locCapacity"
                    type="number"
                    min={1}
                    max={50}
                    value={editLocCapacity}
                    onChange={(e) => setEditLocCapacity(Number(e.target.value))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Define a capacidade máxima de cadeiras deste ponto (mínimo: {totalChairs} de cadeiras cadastradas).
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={savingLocation}>
                  {savingLocation ? "Salvando..." : "Salvar alterações"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={addChairOpen}
            onOpenChange={(open) => {
              setAddChairOpen(open);
              if (!open) resetCreateForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" disabled={isAtCapacity} className="rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Adicionar cadeira
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova cadeira</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreateChair} className="space-y-4">
                <div className="space-y-2">
                  <Label>Identificador</Label>
                  <Input
                    value={newChairIdentifier}
                    onChange={(e) => setNewChairIdentifier(e.target.value)}
                    placeholder="Cadeira 1"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={newChairStatus}
                    onValueChange={(value) => setNewChairStatus(value as ChairStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Disponível</SelectItem>
                      <SelectItem value="occupied">Ocupada</SelectItem>
                      <SelectItem value="maintenance">Manutenção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Recursos</Label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(newChairResources.mirror)}
                      onChange={(e) =>
                        setNewChairResources((prev) => ({
                          ...prev,
                          mirror: e.target.checked,
                        }))
                      }
                    />
                    Espelho
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(newChairResources.sink)}
                      onChange={(e) =>
                        setNewChairResources((prev) => ({
                          ...prev,
                          sink: e.target.checked,
                        }))
                      }
                    />
                    Pia
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(newChairResources.air_conditioning)}
                      onChange={(e) =>
                        setNewChairResources((prev) => ({
                          ...prev,
                          air_conditioning: e.target.checked,
                        }))
                      }
                    />
                    Ar-condicionado
                  </label>
                </div>

                <Button type="submit" className="w-full" disabled={creatingChair}>
                  {creatingChair ? "Criando..." : "Criar cadeira"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Per-location booking confirmation override */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Confirmação de reservas</h2>
          <p className="text-xs text-muted-foreground">
            Substitui o padrão da organização apenas para este local. "Herdar" usa o padrão da organização.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {(["inherit", "on", "off"] as const).map((opt) => {
            const current =
              locationAutoConfirm === null ? "inherit" : locationAutoConfirm ? "on" : "off";
            const label =
              opt === "inherit" ? "Herdar da org" : opt === "on" ? "Sempre confirmar" : "Sempre aprovar";
            return (
              <button
                key={opt}
                disabled={savingAutoConfirm}
                onClick={() =>
                  saveLocationAutoConfirm(
                    opt === "inherit" ? null : opt === "on" ? true : false
                  )
                }
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                  current === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Horário de funcionamento
            </h2>
            <p className="text-xs text-muted-foreground">
              Configure os dias e horários do ponto. Isso será usado para validar contratos e alocações.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {(Object.keys(operatingHours) as DayKey[]).map((day) => {
            const schedule = operatingHours[day];

            return (
              <div
                key={day}
                className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 md:grid-cols-[160px_120px_1fr_1fr]"
              >
                <div className="flex items-center text-sm font-medium text-foreground">
                  {dayLabels[day]}
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(e) =>
                      updateDaySchedule(day, "enabled", e.target.checked)
                    }
                  />
                  Aberto
                </label>

                <div className="space-y-1">
                  <Label className="text-xs">Abertura</Label>
                  <Input
                    type="time"
                    value={schedule.open ?? ""}
                    onChange={(e) =>
                      updateDaySchedule(day, "open", e.target.value || null)
                    }
                    disabled={!schedule.enabled}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Fechamento</Label>
                  <Input
                    type="time"
                    value={schedule.close ?? ""}
                    onChange={(e) =>
                      updateDaySchedule(day, "close", e.target.value || null)
                    }
                    disabled={!schedule.enabled}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Preço (R$)</Label>
                  <Input
                    type="number"
                    value={schedule.price ?? ""}
                    onChange={(e) =>
                      updateDaySchedule(day, "price", e.target.value ? parseFloat(e.target.value) : null)
                    }
                    disabled={!schedule.enabled}
                    placeholder="50.00"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveOperatingHours} disabled={savingHours} className="rounded-xl">
            {savingHours ? "Salvando..." : "Salvar horários"}
          </Button>
        </div>
      </div>

      {chairs.length > 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {chairs.map((chair) => {
            const meta = statusMeta[chair.status];
            const Icon = meta.icon;
            const resources = parseResources(chair.resources);

            return (
              <motion.div key={chair.id} variants={itemVariants}>
                <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{chair.identifier}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                        <span className={cn("text-xs font-medium", meta.textClass)}>
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(chair)}
                      className="h-8 px-2 rounded-xl"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    <span>Status: {meta.label}</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Recursos
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs",
                          resources.mirror
                            ? "border-foreground/20 bg-secondary text-secondary-foreground"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        Espelho {resources.mirror ? "✓" : "—"}
                      </span>

                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs",
                          resources.sink
                            ? "border-foreground/20 bg-secondary text-secondary-foreground"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        Pia {resources.sink ? "✓" : "—"}
                      </span>

                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs",
                          resources.air_conditioning
                            ? "border-foreground/20 bg-secondary text-secondary-foreground"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        Ar-condicionado {resources.air_conditioning ? "✓" : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-3xl border border-border bg-card shadow-sm">
          <p className="text-sm font-medium text-foreground">Nenhuma cadeira ainda</p>
          <p className="text-xs text-muted-foreground">
            Adicione cadeiras para começar a gerenciar este local.
          </p>
        </div>
      )}

      <Dialog
        open={editChairOpen}
        onOpenChange={(open) => {
          setEditChairOpen(open);
          if (!open) setSelectedChair(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cadeira {selectedChair?.identifier}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveChair} className="space-y-4">
            <div className="space-y-2">
              <Label>Identificador</Label>
              <Input
                value={editChairIdentifier}
                onChange={(e) => setEditChairIdentifier(e.target.value)}
                placeholder="Cadeira 1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editChairStatus}
                onValueChange={(value) => setEditChairStatus(value as ChairStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="occupied">Ocupada</SelectItem>
                  <SelectItem value="maintenance">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Recursos</Label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editChairResources.mirror)}
                  onChange={(e) =>
                    setEditChairResources((prev) => ({
                      ...prev,
                      mirror: e.target.checked,
                    }))
                  }
                />
                Espelho
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editChairResources.sink)}
                  onChange={(e) =>
                    setEditChairResources((prev) => ({
                      ...prev,
                      sink: e.target.checked,
                    }))
                  }
                />
                Pia
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editChairResources.air_conditioning)}
                  onChange={(e) =>
                    setEditChairResources((prev) => ({
                      ...prev,
                      air_conditioning: e.target.checked,
                    }))
                  }
                />
                Ar-condicionado
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={savingChair}>
              {savingChair ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {id && <LocationWaitlistSection locationId={id} />}
    </div>
  );
}