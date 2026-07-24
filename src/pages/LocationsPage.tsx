import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MapPin,
  Plus,
  Building2,
  Camera,
  Upload,
  Phone,
  Instagram,
  Sparkles,
  Armchair,
  ExternalLink,
  Coffee,
  Wifi,
  Wind,
  Car,
  Gamepad2,
  Accessibility,
} from "lucide-react";
import { toast } from "sonner";

interface LocationMetadata {
  cover_url?: string;
  description?: string;
  phone?: string;
  instagram?: string;
  amenities?: string[];
  [key: string]: any;
}

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  capacity: number;
  organization_id: string;
  status: string;
  operating_hours: LocationMetadata;
}

const DEFAULT_COVER_IMAGE =
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80";

const PRESET_COVERS = [
  {
    name: "Moderna & Elegante",
    url: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Cadeiras Vintage",
    url: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Bancadas Premium",
    url: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Estilo Industrial",
    url: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80",
  },
];

const AVAILABLE_AMENITIES = [
  { id: "cafe", label: "Café & Cerveja Cortesia", icon: Coffee },
  { id: "wifi", label: "Wi-Fi de Alta Velocidade", icon: Wifi },
  { id: "ac", label: "Ambiente Climatizado", icon: Wind },
  { id: "parking", label: "Estacionamento no Local", icon: Car },
  { id: "gamer", label: "Espaço Gamer / Jogos", icon: Gamepad2 },
  { id: "accessibility", label: "Acessibilidade PCD", icon: Accessibility },
];

export default function LocationsPage() {
  const { organization } = useOrganization();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [coverUrl, setCoverUrl] = useState<string>(DEFAULT_COVER_IMAGE);
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    "Café & Cerveja Cortesia",
    "Wi-Fi de Alta Velocidade",
    "Ambiente Climatizado",
  ]);

  useEffect(() => {
    if (!organization?.id) return;
    void fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const fetchLocations = async () => {
    if (!organization?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLocations([]);
      setLoading(false);
      return;
    }

    setLocations((data as Location[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setName("");
    setAddress("");
    setCity("");
    setState("");
    setCapacity(4);
    setCoverUrl(DEFAULT_COVER_IMAGE);
    setDescription("");
    setPhone("");
    setInstagram("");
    setSelectedAmenities([
      "Café & Cerveja Cortesia",
      "Wi-Fi de Alta Velocidade",
      "Ambiente Climatizado",
    ]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `location-cover-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);

      setCoverUrl(data.publicUrl);
      toast.success("Foto de capa enviada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload da capa.");
    } finally {
      setUploadingCover(false);
    }
  };

  const toggleAmenity = (label: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(label)
        ? prev.filter((a) => a !== label)
        : [...prev, label]
    );
  };

  const handleCreateLocation = async () => {
    if (!organization?.id) {
      toast.error("Organização não encontrada.");
      return;
    }

    if (!name.trim() || !address.trim() || !city.trim() || !state.trim()) {
      toast.error("Preencha o nome, endereço, cidade e estado.");
      return;
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      toast.error("A capacidade deve ser no mínimo 1 cadeira.");
      return;
    }

    setCreating(true);

    const defaultOperatingHours = {
      "0": { enabled: false, open: null, close: null, price: 50 },
      "1": { enabled: true, open: "08:00", close: "18:00", price: 50 },
      "2": { enabled: true, open: "08:00", close: "18:00", price: 50 },
      "3": { enabled: true, open: "08:00", close: "18:00", price: 50 },
      "4": { enabled: true, open: "08:00", close: "22:00", price: 60 },
      "5": { enabled: true, open: "08:00", close: "22:00", price: 80 },
      "6": { enabled: true, open: "08:00", close: "22:00", price: 80 },
      // Extended Metadata
      cover_url: coverUrl,
      description: description.trim(),
      phone: phone.trim(),
      instagram: instagram.trim(),
      amenities: selectedAmenities,
    };

    const { error } = await supabase.from("locations").insert({
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      capacity,
      organization_id: organization.id,
      status: "active",
      operating_hours: defaultOperatingHours as any,
    });

    if (error) {
      toast.error(error.message);
      setCreating(false);
      return;
    }

    toast.success("Barbearia cadastrada com sucesso!");
    setOpen(false);
    resetForm();
    await fetchLocations();
    setCreating(false);
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Top Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Unidades & Lojas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as barbearias físicas da sua rede, fotos, fotos de capa, comodidades e capacidade de bancadas.
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="rounded-2xl h-11 px-5 font-semibold gap-2 shadow-sm">
              <Plus className="h-5 w-5" />
              Adicionar Nova Barbearia
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-[640px] rounded-3xl max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Cadastrar Nova Barbearia
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-2">
              {/* Photo & Cover Section */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Foto de Capa / Fachada da Barbearia</Label>

                <div className="relative h-44 w-full rounded-2xl border border-border/80 overflow-hidden bg-muted/30 group">
                  <img
                    src={coverUrl}
                    alt="Capa"
                    className="h-full w-full object-cover transition-all group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-3">
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-background/90 text-foreground text-xs font-semibold hover:bg-background cursor-pointer transition-all shadow-md">
                      <Upload className="h-4 w-4" />
                      {uploadingCover ? "Enviando..." : "Subir Foto"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={uploadingCover}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="loc-name">Nome da Barbearia / Unidade</Label>
                  <Input
                    id="loc-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Barbearia Prime - Unidade Centro"
                    className="rounded-2xl"
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="loc-address">Endereço Completo</Label>
                  <Input
                    id="loc-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex: Av. Almirante Barroso, 250 - Bairro Centro"
                    className="rounded-2xl"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loc-city">Cidade</Label>
                  <Input
                    id="loc-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: Belém"
                    className="rounded-2xl"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loc-state">Estado (UF)</Label>
                  <Input
                    id="loc-state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Ex: PA"
                    className="rounded-2xl"
                    required
                  />
                </div>
              </div>

              {/* Capacity */}
              <div className="space-y-2">
                <Label htmlFor="loc-cap" className="flex items-center gap-1.5">
                  <Armchair className="h-4 w-4 text-primary" />
                  Capacidade de Cadeiras (Bancadas)
                </Label>
                <Input
                  id="loc-cap"
                  type="number"
                  min={1}
                  max={50}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="rounded-2xl"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Quantidade máxima de cadeiras de atendimento disponíveis para aluguel nesta unidade.
                </p>
              </div>

              {/* Description & Contact */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="space-y-2">
                  <Label htmlFor="loc-desc">Descrição / Apresentação da Barbearia</Label>
                  <Textarea
                    id="loc-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Barbearia conceito com ambiente climatizado, bebidas cortesia, som de qualidade e profissionais renomados."
                    className="rounded-2xl min-h-[70px] text-sm"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="loc-phone" className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Telefone / WhatsApp da Loja
                    </Label>
                    <Input
                      id="loc-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(91) 99999-9999"
                      className="rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="loc-insta" className="flex items-center gap-1.5">
                      <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                      Instagram da Barbearia
                    </Label>
                    <Input
                      id="loc-insta"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="@barbeariaprime"
                      className="rounded-2xl"
                    />
                  </div>
                </div>
              </div>

              {/* Amenities */}
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-sm font-semibold">Comodidades & Diferenciais da Loja</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {AVAILABLE_AMENITIES.map((item) => {
                    const IconComp = item.icon;
                    const isSelected = selectedAmenities.includes(item.label);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleAmenity(item.label)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${
                          isSelected
                            ? "bg-primary/10 border-primary text-foreground font-semibold"
                            : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        <IconComp className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : ""}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-border">
                <Button
                  onClick={handleCreateLocation}
                  className="w-full rounded-2xl h-11 font-bold text-base shadow-sm"
                  disabled={creating || uploadingCover}
                >
                  {creating ? "Cadastrando Unidade..." : "Confirmar e Cadastrar Barbearia"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Locations List Grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-80 rounded-3xl border bg-card/60 animate-pulse" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-12 text-center bg-card/40">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-lg font-bold text-foreground">Nenhuma barbearia cadastrada</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Cadastre a primeira unidade física da sua barbearia para ativar a gestão de cadeiras e recepção.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => {
            const meta = location.operating_hours || {};
            const coverImage = meta.cover_url || DEFAULT_COVER_IMAGE;
            const desc = meta.description;
            const shopPhone = meta.phone;
            const shopInsta = meta.instagram;
            const amenitiesList: string[] = meta.amenities || [];

            return (
              <div
                key={location.id}
                className="group relative rounded-3xl border border-border/80 bg-card overflow-hidden shadow-xs hover:shadow-md hover:border-border transition-all flex flex-col"
              >
                {/* Cover Image Banner */}
                <div className="relative h-48 w-full overflow-hidden bg-muted">
                  <img
                    src={coverImage}
                    alt={location.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <Badge className="bg-emerald-500/90 text-white font-medium text-[11px] gap-1 shadow-sm backdrop-blur-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      Unidade Ativa
                    </Badge>

                    <Badge className="bg-background/90 text-foreground font-semibold text-[11px] gap-1 backdrop-blur-xs shadow-sm">
                      <Armchair className="h-3 w-3 text-primary" />
                      {location.capacity} {location.capacity === 1 ? "cadeira" : "cadeiras"}
                    </Badge>
                  </div>

                  {/* Bottom Header Info */}
                  <div className="absolute bottom-3 left-4 right-4 text-white">
                    <h3 className="text-lg font-bold truncate leading-tight drop-shadow-xs">
                      {location.name}
                    </h3>
                    <p className="text-xs text-white/80 flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0 text-primary" />
                      {location.city}, {location.state}
                    </p>
                  </div>
                </div>

                {/* Card Content Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{location.address}</span>
                    </p>

                    {desc && (
                      <p className="text-xs text-foreground/80 line-clamp-2 italic bg-muted/30 p-2.5 rounded-xl border border-muted/50">
                        "{desc}"
                      </p>
                    )}

                    {/* Contact details if available */}
                    {(shopPhone || shopInsta) && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                        {shopPhone && (
                          <span className="flex items-center gap-1 font-medium">
                            <Phone className="h-3 w-3 text-primary" />
                            {shopPhone}
                          </span>
                        )}
                        {shopInsta && (
                          <span className="flex items-center gap-1 font-medium">
                            <Instagram className="h-3 w-3 text-primary" />
                            {shopInsta}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Amenities pills */}
                    {amenitiesList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {amenitiesList.slice(0, 3).map((amenity) => (
                          <span
                            key={amenity}
                            className="inline-flex items-center gap-1 text-[10px] font-medium bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-lg"
                          >
                            <Sparkles className="h-2.5 w-2.5 text-primary" />
                            {amenity}
                          </span>
                        ))}
                        {amenitiesList.length > 3 && (
                          <span className="text-[10px] text-muted-foreground font-semibold px-1.5 py-0.5">
                            +{amenitiesList.length - 3} mais
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-border/60">
                    <Link to={`/locations/${location.id}`} className="w-full">
                      <Button className="w-full rounded-2xl gap-2 font-semibold text-xs h-10 shadow-xs">
                        Gerenciar Unidade
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
