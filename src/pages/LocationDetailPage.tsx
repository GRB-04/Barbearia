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
  Camera,
  Upload,
  MapPin,
  Phone,
  Instagram,
  Sparkles,
  Armchair,
  Coffee,
  Wifi,
  Wind,
  Car,
  Gamepad2,
  Accessibility,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

  // Estados para edição estendida da unidade
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [editLocName, setEditLocName] = useState("");
  const [editLocAddress, setEditLocAddress] = useState("");
  const [editLocCity, setEditLocCity] = useState("");
  const [editLocState, setEditLocState] = useState("");
  const [editLocCapacity, setEditLocCapacity] = useState(2);
  const [editLocCoverUrl, setEditLocCoverUrl] = useState("");
  const [editLocDescription, setEditLocDescription] = useState("");
  const [editLocPhone, setEditLocPhone] = useState("");
  const [editLocInstagram, setEditLocInstagram] = useState("");
  const [editLocAmenities, setEditLocAmenities] = useState<string[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);
  const [uploadingEditCover, setUploadingEditCover] = useState(false);

  // Sincroniza estados do form de edição quando a unidade carregar
  useEffect(() => {
    if (location) {
      setEditLocName(location.name);
      setEditLocAddress(location.address ?? "");
      setEditLocCity(location.city ?? "");
      setEditLocState(location.state ?? "");
      setEditLocCapacity(location.capacity ?? 2);

      const meta = (location.operating_hours || {}) as any;
      setEditLocCoverUrl(
        meta.cover_url ||
          "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80"
      );
      setEditLocDescription(meta.description || "");
      setEditLocPhone(meta.phone || "");
      setEditLocInstagram(meta.instagram || "");
      setEditLocAmenities(
        meta.amenities || [
          "Café & Cerveja Cortesia",
          "Wi-Fi de Alta Velocidade",
          "Ambiente Climatizado",
        ]
      );
    }
  }, [location]);

  useEffect(() => {
    if (!organization?.id || !id) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, id]);

  const handleEditCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingEditCover(true);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `location-cover-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);

      setEditLocCoverUrl(data.publicUrl);
      toast.success("Foto de capa enviada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload da capa.");
    } finally {
      setUploadingEditCover(false);
    }
  };

  const toggleEditAmenity = (label: string) => {
    setEditLocAmenities((prev) =>
      prev.includes(label)
        ? prev.filter((a) => a !== label)
        : [...prev, label]
    );
  };

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
      const currentOperatingHours = (location.operating_hours || {}) as any;
      const updatedOperatingHours = {
        ...currentOperatingHours,
        cover_url: editLocCoverUrl,
        description: editLocDescription.trim(),
        phone: editLocPhone.trim(),
        instagram: editLocInstagram.trim(),
        amenities: editLocAmenities,
      };

      const { error } = await supabase
        .from("locations")
        .update({
          name: editLocName.trim(),
          address: editLocAddress.trim() || null,
          city: editLocCity.trim(),
          state: editLocState.trim(),
          capacity: editLocCapacity,
          operating_hours: updatedOperatingHours as import("@/integrations/supabase/types").Json,
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
      {/* Hero Banner Header Section */}
      <div className="relative rounded-3xl border border-border/80 bg-card overflow-hidden shadow-xs space-y-0">
        <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-muted">
          <img
            src={
              (location.operating_hours as any)?.cover_url ||
              "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80"
            }
            alt={location.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

          {/* Top Header Actions */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <Link
              to="/locations"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-background/80 hover:bg-background text-foreground text-xs font-semibold backdrop-blur-xs transition-all shadow-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar aos Locais
            </Link>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAll}
                className="rounded-xl bg-background/80 hover:bg-background border-none backdrop-blur-xs shadow-xs text-xs font-semibold"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Atualizar
              </Button>

              {/* Modal para Editar Local */}
              <Dialog open={editLocationOpen} onOpenChange={setEditLocationOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl font-semibold text-xs shadow-sm gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar local
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-[640px] rounded-3xl max-h-[90vh] overflow-y-auto p-6">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                      <Pencil className="h-5 w-5 text-primary" />
                      Editar Barbearia — {location.name}
                    </DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleSaveLocation} className="space-y-6 pt-2">
                    {/* Cover photo section */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">Foto de Capa / Fachada</Label>
                      <div className="relative h-40 w-full rounded-2xl border overflow-hidden bg-muted/30 group">
                        <img src={editLocCoverUrl} alt="Capa" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-background/90 text-foreground text-xs font-semibold hover:bg-background cursor-pointer shadow-md">
                            <Upload className="h-4 w-4" />
                            {uploadingEditCover ? "Enviando..." : "Subir Foto"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleEditCoverUpload}
                              disabled={uploadingEditCover}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Basic details */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="locName">Nome da Barbearia</Label>
                        <Input
                          id="locName"
                          value={editLocName}
                          onChange={(e) => setEditLocName(e.target.value)}
                          placeholder="Nome da unidade"
                          className="rounded-2xl"
                          required
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="locAddress">Endereço Completo</Label>
                        <Input
                          id="locAddress"
                          value={editLocAddress}
                          onChange={(e) => setEditLocAddress(e.target.value)}
                          placeholder="Endereço completo"
                          className="rounded-2xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="locCity">Cidade</Label>
                        <Input
                          id="locCity"
                          value={editLocCity}
                          onChange={(e) => setEditLocCity(e.target.value)}
                          placeholder="Cidade"
                          className="rounded-2xl"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="locState">Estado (UF)</Label>
                        <Input
                          id="locState"
                          value={editLocState}
                          onChange={(e) => setEditLocState(e.target.value)}
                          placeholder="Estado"
                          className="rounded-2xl"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="locCapacity" className="flex items-center gap-1.5">
                        <Armchair className="h-4 w-4 text-primary" />
                        Capacidade de Bancadas
                      </Label>
                      <Input
                        id="locCapacity"
                        type="number"
                        min={totalChairs}
                        max={50}
                        value={editLocCapacity}
                        onChange={(e) => setEditLocCapacity(Number(e.target.value))}
                        className="rounded-2xl"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Mínimo permitido: {totalChairs} (quantidade de cadeiras atualmente criadas).
                      </p>
                    </div>

                    {/* Presentation & Contact */}
                    <div className="space-y-4 pt-2 border-t border-border">
                      <div className="space-y-2">
                        <Label htmlFor="editLocDesc">Descrição / Apresentação</Label>
                        <Textarea
                          id="editLocDesc"
                          value={editLocDescription}
                          onChange={(e) => setEditLocDescription(e.target.value)}
                          placeholder="Apresentação da unidade..."
                          className="rounded-2xl min-h-[70px] text-sm"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="editLocPhone">Telefone / WhatsApp</Label>
                          <Input
                            id="editLocPhone"
                            value={editLocPhone}
                            onChange={(e) => setEditLocPhone(e.target.value)}
                            placeholder="(91) 99999-9999"
                            className="rounded-2xl"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="editLocInsta">Instagram</Label>
                          <Input
                            id="editLocInsta"
                            value={editLocInstagram}
                            onChange={(e) => setEditLocInstagram(e.target.value)}
                            placeholder="@barbeariaprime"
                            className="rounded-2xl"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Amenities */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <Label className="text-sm font-semibold">Comodidades & Diferenciais</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {[
                          "Café & Cerveja Cortesia",
                          "Wi-Fi de Alta Velocidade",
                          "Ambiente Climatizado",
                          "Estacionamento no Local",
                          "Espaço Gamer / Jogos",
                          "Acessibilidade PCD",
                        ].map((label) => {
                          const isSelected = editLocAmenities.includes(label);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => toggleEditAmenity(label)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs text-left transition-all ${
                                isSelected
                                  ? "bg-primary/10 border-primary text-foreground font-semibold"
                                  : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60"
                              }`}
                            >
                              <Sparkles className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : ""}`} />
                              <span className="truncate">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        type="submit"
                        className="w-full rounded-2xl h-11 font-bold text-base shadow-sm"
                        disabled={savingLocation || uploadingEditCover}
                      >
                        {savingLocation ? "Salvando..." : "Salvar Alterações do Local"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Bottom Hero Information */}
          <div className="absolute bottom-4 left-5 right-5 text-white flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-md">
                  {location.name}
                </h1>
                <Badge className="bg-emerald-500 text-white font-semibold text-xs shadow-sm">
                  Unidade Ativa
                </Badge>
              </div>

              <p className="text-xs sm:text-sm text-white/90 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                {[location.address, location.city, location.state].filter(Boolean).join(", ") || "Sem endereço"}
              </p>

              {(location.operating_hours as any)?.description && (
                <p className="text-xs text-white/80 italic max-w-2xl line-clamp-2 pt-0.5">
                  {`"${(location.operating_hours as any).description}"`}
                </p>
              )}
            </div>

            {/* Badges on Hero */}
            <div className="flex flex-wrap gap-2 text-xs shrink-0 pt-2 sm:pt-0">
              <span className="rounded-xl bg-white/20 backdrop-blur-md px-3 py-1.5 font-bold text-white shadow-xs border border-white/20">
                Capacidade: {totalChairs}/{capacity}
              </span>
              <span className="rounded-xl bg-emerald-500/80 backdrop-blur-md px-3 py-1.5 font-bold text-white shadow-xs">
                Disponíveis: {availableCount}
              </span>
              <span className="rounded-xl bg-amber-500/80 backdrop-blur-md px-3 py-1.5 font-bold text-white shadow-xs">
                Ocupadas: {occupiedCount}
              </span>
              {maintenanceCount > 0 && (
                <span className="rounded-xl bg-red-500/80 backdrop-blur-md px-3 py-1.5 font-bold text-white shadow-xs">
                  Manutenção: {maintenanceCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Amenities Bar under Hero */}
        {((location.operating_hours as any)?.amenities?.length > 0 || (location.operating_hours as any)?.phone || (location.operating_hours as any)?.instagram) && (
          <div className="p-4 bg-muted/30 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-border/50">
            <div className="flex items-center gap-2 flex-wrap">
              {((location.operating_hours as any)?.amenities || []).map((amenity: string) => (
                <span key={amenity} className="inline-flex items-center gap-1 font-semibold text-foreground bg-background px-3 py-1 rounded-xl border border-border/60 shadow-2xs">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {amenity}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 text-muted-foreground font-medium">
              {(location.operating_hours as any)?.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  {(location.operating_hours as any).phone}
                </span>
              )}
              {(location.operating_hours as any)?.instagram && (
                <span className="flex items-center gap-1">
                  <Instagram className="h-3.5 w-3.5 text-primary" />
                  {(location.operating_hours as any).instagram}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

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

      {/* Per-location booking confirmation override */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Confirmação de reservas</h2>
          <p className="text-xs text-muted-foreground">
            Substitui o padrão da organização apenas para este local. &quot;Herdar&quot; usa o padrão da organização.
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