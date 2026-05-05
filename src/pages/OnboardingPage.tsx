import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LayoutGrid, MapPin, Scissors, ChevronRight, LogOut, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Step = "org" | "location" | "chair" | "invite" | "done";

const DEFAULT_OPERATING_HOURS = {
  monday:    { open: true,  start: "08:00", end: "18:00" },
  tuesday:   { open: true,  start: "08:00", end: "18:00" },
  wednesday: { open: true,  start: "08:00", end: "18:00" },
  thursday:  { open: true,  start: "08:00", end: "22:00" },
  friday:    { open: true,  start: "08:00", end: "22:00" },
  saturday:  { open: true,  start: "08:00", end: "22:00" },
  sunday:    { open: false, start: "08:00", end: "18:00" },
};

export default function OnboardingPage() {
  const { createOrganization, organization } = useOrganization();
  const { signOut } = useAuth();

  const [step, setStep] = useState<Step>(organization ? "location" : "org");

  // Step 1 — Org
  const [orgName, setOrgName] = useState("");
  const [orgLoading, setOrgLoading] = useState(false);

  // Step 2 — Location
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationCapacity, setLocationCapacity] = useState(2);
  const [locationLoading, setLocationLoading] = useState(false);
  const [createdLocationId, setCreatedLocationId] = useState<string | null>(null);

  // Step 3 — Chair
  const [chairIdentifier, setChairIdentifier] = useState("C1");
  const [chairMirror, setChairMirror] = useState(true);
  const [chairSink, setChairSink] = useState(false);
  const [chairAC, setChairAC] = useState(false);
  const [chairLoading, setChairLoading] = useState(false);

  // Step 4 — Invite
  const [copied, setCopied] = useState(false);

  const inviteLink = organization
    ? `${window.location.origin}/barber/auth?org=${organization.id}`
    : "";

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setOrgLoading(true);
    try {
      await createOrganization(orgName.trim());
      setStep("location");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar organização.");
    } finally {
      setOrgLoading(false);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;
    if (!locationName.trim() || !locationCity.trim() || !locationState.trim()) {
      toast.error("Preencha nome, cidade e estado.");
      return;
    }
    setLocationLoading(true);
    try {
      const { data, error } = await supabase.from("locations").insert({
        name: locationName.trim(),
        address: locationAddress.trim() || null,
        city: locationCity.trim(),
        state: locationState.trim(),
        capacity: locationCapacity,
        organization_id: organization.id,
        status: "active",
        operating_hours: DEFAULT_OPERATING_HOURS,
      }).select("id").single();
      if (error) throw error;
      setCreatedLocationId(data.id);
      toast.success("Unidade criada com sucesso!");
      setStep("chair");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar unidade.");
    } finally {
      setLocationLoading(false);
    }
  };

  const handleCreateChair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !createdLocationId) return;
    if (!chairIdentifier.trim()) {
      toast.error("Informe o identificador da cadeira.");
      return;
    }
    setChairLoading(true);
    try {
      const { error } = await supabase.from("chairs").insert({
        identifier: chairIdentifier.trim(),
        location_id: createdLocationId,
        organization_id: organization.id,
        status: "available",
        has_mirror: chairMirror,
        has_sink: chairSink,
        has_air_conditioning: chairAC,
      });
      if (error) throw error;
      toast.success("Cadeira criada com sucesso!");
      setStep("invite");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar cadeira.");
    } finally {
      setChairLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(
      `Olá! Você foi convidado para se juntar à nossa equipe no Barber Chair Connect.\nAcesse o link abaixo para criar sua conta:\n${inviteLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "org", label: "Organização", icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "location", label: "Unidade", icon: <MapPin className="h-4 w-4" /> },
    { id: "chair", label: "Cadeira", icon: <Scissors className="h-4 w-4" /> },
    { id: "invite", label: "Convidar", icon: <ChevronRight className="h-4 w-4" /> },
  ];

  const stepOrder: Step[] = ["org", "location", "chair", "invite", "done"];
  const currentStepIndex = stepOrder.indexOf(step);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 py-10">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Scissors className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Configure sua barbearia
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Siga os passos para configurar tudo em minutos.
          </p>
        </div>

        {/* Step indicators */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {steps.map((s, idx) => {
              const sIdx = stepOrder.indexOf(s.id);
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      sIdx <= currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      sIdx === currentStepIndex ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                  {idx < steps.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step 1 — Organization */}
        {step === "org" && (
          <form onSubmit={handleCreateOrg} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Nome da sua barbearia</h2>
              <p className="text-sm text-muted-foreground">Este será o nome da sua organização no sistema.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName">Nome</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Ex: Barbearia do Ector"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={orgLoading || !orgName.trim()}>
              {orgLoading ? "Criando..." : "Criar organização →"}
            </Button>
          </form>
        )}

        {/* Step 2 — Location */}
        {step === "location" && (
          <form onSubmit={handleCreateLocation} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Sua primeira unidade</h2>
              <p className="text-sm text-muted-foreground">Adicione o endereço do ponto físico da barbearia.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locName">Nome da unidade</Label>
              <Input id="locName" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Ex: Unidade Centro" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locAddress">Endereço</Label>
              <Input id="locAddress" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} placeholder="Rua das Flores, 100" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="locCity">Cidade</Label>
                <Input id="locCity" value={locationCity} onChange={(e) => setLocationCity(e.target.value)} placeholder="São Paulo" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locState">Estado</Label>
                <Input id="locState" value={locationState} onChange={(e) => setLocationState(e.target.value)} placeholder="SP" maxLength={2} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locCapacity">Capacidade de cadeiras</Label>
              <Input id="locCapacity" type="number" min={1} max={10} value={locationCapacity} onChange={(e) => setLocationCapacity(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Horário padrão: Seg–Qua 08h–18h | Qui–Sáb 08h–22h | Dom Fechado</p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={locationLoading}>
                {locationLoading ? "Criando..." : "Criar unidade →"}
              </Button>
              <Button type="button" variant="outline" onClick={() => window.location.href = "/locations"}>
                Pular
              </Button>
            </div>
          </form>
        )}

        {/* Step 3 — Chair */}
        {step === "chair" && (
          <form onSubmit={handleCreateChair} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Primeira cadeira</h2>
              <p className="text-sm text-muted-foreground">Adicione a primeira cadeira da sua unidade.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chairId">Identificador</Label>
              <Input id="chairId" value={chairIdentifier} onChange={(e) => setChairIdentifier(e.target.value)} placeholder="Ex: C1" required autoFocus />
              <p className="text-xs text-muted-foreground">Um nome ou número para identificar esta cadeira.</p>
            </div>
            <div className="space-y-2">
              <Label>Recursos disponíveis</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Espelho", value: chairMirror, set: setChairMirror },
                  { label: "Pia", value: chairSink, set: setChairSink },
                  { label: "Ar cond.", value: chairAC, set: setChairAC },
                ].map(({ label, value, set }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => set(!value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {value ? "✓ " : ""}{label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={chairLoading}>
                {chairLoading ? "Criando..." : "Criar cadeira →"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep("invite")}>
                Pular
              </Button>
            </div>
          </form>
        )}

        {/* Step 4 — Invite */}
        {step === "invite" && (
          <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Convide seus barbeiros</h2>
              <p className="text-sm text-muted-foreground">Compartilhe o link abaixo para que eles se cadastrem e se vinculem à sua equipe automaticamente.</p>
            </div>
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={handleCopyLink} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              type="button"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={handleWhatsApp}
            >
              Enviar via WhatsApp
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => { setStep("done"); setTimeout(() => window.location.href = "/locations", 800); }}>
              Concluir configuração →
            </Button>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="rounded-2xl border bg-card p-6 shadow-sm text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-semibold">Tudo pronto!</h2>
            <p className="text-sm text-muted-foreground">Redirecionando para o painel...</p>
          </div>
        )}

        {/* Logout link */}
        <p className="text-center">
          <button
            type="button"
            onClick={() => signOut()}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3 w-3" /> Sair da conta
          </button>
        </p>
      </div>
    </div>
  );
}
