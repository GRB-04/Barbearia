import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  capacity: number;
  organization_id: string;
}

export default function LocationsPage() {
  const { organization } = useOrganization();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [capacity, setCapacity] = useState(2);

  useEffect(() => {
    if (!organization?.id) return;
    void fetchLocations();
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
    setCapacity(2);
  };

  const handleCreateLocation = async () => {
    if (!organization?.id) {
      toast.error("Organização não encontrada.");
      return;
    }

    if (!name.trim() || !address.trim() || !city.trim() || !state.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      toast.error("A capacidade deve ser um numero maior que zero.");
      return;
    }

    setCreating(true);

    const defaultOperatingHours = {
      monday:    { open: true,  start: "09:00", end: "19:00" },
      tuesday:   { open: true,  start: "09:00", end: "19:00" },
      wednesday: { open: true,  start: "09:00", end: "19:00" },
      thursday:  { open: true,  start: "09:00", end: "19:00" },
      friday:    { open: true,  start: "09:00", end: "19:00" },
      saturday:  { open: true,  start: "09:00", end: "17:00" },
      sunday:    { open: false, start: "09:00", end: "13:00" },
    };

    const { error } = await supabase.from("locations").insert({
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      capacity,
      organization_id: organization.id,
      status: "active",
      operating_hours: defaultOperatingHours,
    });

    if (error) {
      toast.error(error.message);
      setCreating(false);
      return;
    }

    toast.success("Local criado com sucesso.");
    setOpen(false);
    resetForm();
    await fetchLocations();
    setCreating(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locais</h1>
          <p className="text-muted-foreground">
            {locations.length} {locations.length === 1 ? "local" : "locais"}
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
            <Button className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar local
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Novo local</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Barbearia dos irmÃƒÂ£os"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Endereço</label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Almirante Barroso, 250"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cidade</label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="BelÃƒÂ©m"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado</label>
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="PA"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Capacidade</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  placeholder="2"
                />
                <p className="text-xs text-muted-foreground">
                  Informe a quantidade mÃƒÂ¡xima de cadeiras dessa unidade. Valor entre 1 e 5.
                </p>
              </div>

              <Button
                onClick={handleCreateLocation}
                className="w-full"
                disabled={creating}
              >
                  {creating ? "Criando..." : "Criar local"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Carregando locais...</p>
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">Nenhum local cadastrado</p>
          <p className="text-xs text-muted-foreground">
            Crie a primeira unidade da sua barbearia.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {locations.map((location) => (
            <Link
              key={location.id}
              to={`/locations/${location.id}`}
              className="rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md block"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    {location.name}
                  </h2>

                  <p className="text-sm text-muted-foreground">
                    {location.address}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    {location.city}, {location.state}
                  </p>

                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    Capacidade: {location.capacity}{" "}
                    {location.capacity === 1 ? "cadeira" : "cadeiras"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
