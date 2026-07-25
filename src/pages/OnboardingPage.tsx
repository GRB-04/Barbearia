import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2, MapPin, Scissors, Users, LogOut,
  Copy, Check, ArrowRight, ChevronRight, Wifi, Wind, Droplets, Sparkles,
} from "lucide-react";
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

const STEPS = [
  { id: "org" as Step,      num: 1, label: "Barbearia",  icon: Building2,  desc: "Identificação do negócio" },
  { id: "location" as Step, num: 2, label: "Unidade",    icon: MapPin,     desc: "Localização física" },
  { id: "chair" as Step,    num: 3, label: "Cadeira",    icon: Scissors,   desc: "Seu primeiro espaço" },
  { id: "invite" as Step,   num: 4, label: "Equipe",     icon: Users,      desc: "Convide sua equipe" },
];

export default function OnboardingPage() {
  const { createOrganization, organization } = useOrganization();
  const { signOut, user } = useAuth();

  const [step, setStep] = useState<Step>(() => {
    const saved = localStorage.getItem("barber_onboarding_step") as Step | null;
    if (saved && saved !== "done") return saved;
    return organization ? "location" : "org";
  });

  // Step 1
  const [orgName, setOrgName] = useState(() => (user?.user_metadata?.org_name as string) ?? "");
  const [orgLoading, setOrgLoading] = useState(false);

  // Step 2
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationCapacity, setLocationCapacity] = useState(2);
  const [locationLoading, setLocationLoading] = useState(false);
  const [createdLocationId, setCreatedLocationId] = useState<string | null>(() =>
    localStorage.getItem("barber_onboarding_location_id")
  );

  // Step 3
  const [chairIdentifier, setChairIdentifier] = useState("Cadeira 1");
  const [chairMirror, setChairMirror] = useState(true);
  const [chairSink, setChairSink] = useState(false);
  const [chairAC, setChairAC] = useState(false);
  const [chairLoading, setChairLoading] = useState(false);

  // Step 4
  const [copied, setCopied] = useState(false);

  const inviteLink = organization
    ? `${window.location.origin}/barber/auth?org=${organization.id}`
    : "";

  useEffect(() => {
    localStorage.setItem("barber_onboarding_step", step);
  }, [step]);

  useEffect(() => {
    if (createdLocationId) {
      localStorage.setItem("barber_onboarding_location_id", createdLocationId);
    } else {
      localStorage.removeItem("barber_onboarding_location_id");
    }
  }, [createdLocationId]);

  const stepOrder: Step[] = ["org", "location", "chair", "invite", "done"];
  const currentStepIndex = stepOrder.indexOf(step);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setOrgLoading(true);
    try {
      localStorage.setItem("barber_onboarding_in_progress", "true");
      localStorage.setItem("barber_onboarding_step", "location");
      await createOrganization(orgName.trim());
      setStep("location");
    } catch (err: any) {
      localStorage.removeItem("barber_onboarding_in_progress");
      localStorage.setItem("barber_onboarding_step", "org");
      const msg = err?.message || "Erro ao criar organização.";
      toast.error(msg);
      console.error("[OnboardingPage] createOrg error:", err);
    } finally {
      setOrgLoading(false);
    }
  }

  async function handleCreateLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!organization?.id) {
      toast.error("Organização não encontrada. Recarregue a página.");
      return;
    }
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
      toast.success("Unidade criada!");
      setStep("chair");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar unidade.");
      console.error("[OnboardingPage] createLocation error:", err);
    } finally {
      setLocationLoading(false);
    }
  }

  async function handleCreateChair(e: React.FormEvent) {
    e.preventDefault();
    if (!organization?.id || !createdLocationId) {
      toast.error("Unidade não encontrada. Recarregue a página.");
      return;
    }
    if (!chairIdentifier.trim()) {
      toast.error("Informe o nome da cadeira.");
      return;
    }
    setChairLoading(true);
    try {
      const { error } = await supabase.from("chairs").insert({
        identifier: chairIdentifier.trim(),
        location_id: createdLocationId,
        status: "available",
        resources: { mirror: chairMirror, sink: chairSink, air_conditioning: chairAC },
      } as any);
      if (error) throw error;
      toast.success("Cadeira criada!");
      setStep("invite");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar cadeira.");
      console.error("[OnboardingPage] createChair error:", err);
    } finally {
      setChairLoading(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFinish() {
    localStorage.removeItem("barber_onboarding_in_progress");
    localStorage.removeItem("barber_onboarding_step");
    localStorage.removeItem("barber_onboarding_location_id");
    setStep("done");
    setTimeout(() => { window.location.href = "/dashboard"; }, 800);
  }

  function clearAndSignOut() {
    localStorage.removeItem("barber_onboarding_in_progress");
    localStorage.removeItem("barber_onboarding_step");
    localStorage.removeItem("barber_onboarding_location_id");
    signOut();
  }

  if (step === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-6xl animate-bounce">🎉</div>
          <h1 className="text-2xl font-bold">Tudo pronto!</h1>
          <p className="text-muted-foreground">Redirecionando para o painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col justify-between w-80 shrink-0 sticky top-0 h-screen p-8"
        style={{ background: "linear-gradient(160deg, #0f0f0f 0%, #1a1209 60%, #2d1f06 100%)" }}
      >
        {/* Logo */}
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
            >
              <Scissors className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base tracking-tight">Barber House</p>
              <p className="text-amber-500/70 text-xs tracking-widest uppercase">Setup</p>
            </div>
          </div>

          {/* Steps nav */}
          <div className="space-y-2">
            {STEPS.map((s, idx) => {
              const sIdx = stepOrder.indexOf(s.id);
              const isActive = s.id === step;
              const isDone = sIdx < currentStepIndex;
              const Icon = s.icon;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all ${
                    isActive
                      ? "bg-amber-500/15 border border-amber-500/30"
                      : isDone
                      ? "opacity-60"
                      : "opacity-30"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? "bg-amber-500 text-white"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {isDone ? "✓" : s.num}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isActive ? "text-amber-400" : "text-white/70"}`}>
                      {s.label}
                    </p>
                    <p className="text-xs text-white/40">{s.desc}</p>
                  </div>
                  {isActive && <ChevronRight className="ml-auto h-4 w-4 text-amber-500/60" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom quote */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-white/60 text-xs leading-relaxed italic">
              "Uma barbearia bem gerida começa com uma configuração sólida."
            </p>
          </div>
          <button
            type="button"
            onClick={clearAndSignOut}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair da conta
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-8">

          {/* Mobile header */}
          <div className="lg:hidden flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
            >
              <Scissors className="h-4 w-4 text-white" />
            </div>
            <p className="font-bold text-lg">Barber House</p>
          </div>

          {/* Mobile step pills */}
          <div className="flex lg:hidden items-center gap-1 flex-wrap">
            {STEPS.map((s, idx) => {
              const sIdx = stepOrder.indexOf(s.id);
              const isDone = sIdx < currentStepIndex;
              const isActive = s.id === step;
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <div
                    className={`h-2 w-2 rounded-full transition-all ${
                      isDone ? "bg-emerald-500" : isActive ? "bg-amber-500" : "bg-muted"
                    }`}
                  />
                  {idx < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
                </div>
              );
            })}
            <span className="ml-2 text-xs text-muted-foreground">
              Passo {currentStepIndex + 1} de {STEPS.length}
            </span>
          </div>

          {/* ── STEP 1: ORG ─── */}
          {step === "org" && (
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Building2 className="h-5 w-5" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Passo 1 de 4</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">Como se chama sua barbearia?</h1>
                <p className="text-muted-foreground">
                  Este é o nome da sua organização. Vai aparecer para clientes e equipe.
                </p>
              </div>

              <form onSubmit={handleCreateOrg} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="orgName" className="text-sm font-semibold">Nome da barbearia</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ex: Barber House SP"
                    required
                    autoFocus
                    className="h-12 rounded-xl text-base"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl font-bold text-base gap-2"
                  style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
                  disabled={orgLoading || !orgName.trim()}
                >
                  {orgLoading ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Criando organização...</>
                  ) : (
                    <> Continuar <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </form>

              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Dica
                </div>
                <p className="text-sm text-muted-foreground">
                  Você pode ter múltiplas unidades (filiais) dentro da mesma organização.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 2: LOCATION ─── */}
          {step === "location" && (
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <MapPin className="h-5 w-5" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Passo 2 de 4</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">Onde fica sua unidade?</h1>
                <p className="text-muted-foreground">
                  Adicione o endereço físico da sua barbearia. Pode adicionar mais unidades depois.
                </p>
              </div>

              <form onSubmit={handleCreateLocation} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="locName" className="text-sm font-semibold">Nome da unidade</Label>
                  <Input
                    id="locName"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Ex: Unidade Centro"
                    required
                    autoFocus
                    className="h-12 rounded-xl text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="locAddress" className="text-sm font-semibold">Endereço <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input
                    id="locAddress"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    placeholder="Rua das Flores, 100 — Bairro"
                    className="h-12 rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="locCity" className="text-sm font-semibold">Cidade</Label>
                    <Input
                      id="locCity"
                      value={locationCity}
                      onChange={(e) => setLocationCity(e.target.value)}
                      placeholder="São Paulo"
                      required
                      className="h-12 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="locState" className="text-sm font-semibold">Estado (UF)</Label>
                    <Input
                      id="locState"
                      value={locationState}
                      onChange={(e) => setLocationState(e.target.value.toUpperCase())}
                      placeholder="SP"
                      maxLength={2}
                      required
                      className="h-12 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Capacidade de cadeiras</Label>
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => setLocationCapacity(Math.max(1, locationCapacity - 1))}
                      className="h-10 w-10 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors">−</button>
                    <span className="text-2xl font-bold w-8 text-center">{locationCapacity}</span>
                    <button type="button" onClick={() => setLocationCapacity(Math.min(50, locationCapacity + 1))}
                      className="h-10 w-10 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors">+</button>
                    <span className="text-sm text-muted-foreground">cadeiras máx.</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1 h-12 rounded-xl font-bold gap-2"
                    style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
                    disabled={locationLoading}
                  >
                    {locationLoading ? (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Criando...</>
                    ) : (
                      <>Continuar <ArrowRight className="h-4 w-4" /></>
                    )}
                  </Button>
                  <Button type="button" variant="outline" className="h-12 rounded-xl px-5"
                    onClick={() => setStep("chair")}>
                    Pular
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 3: CHAIR ─── */}
          {step === "chair" && (
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Scissors className="h-5 w-5" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Passo 3 de 4</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">Sua primeira cadeira</h1>
                <p className="text-muted-foreground">
                  Cada cadeira pode ser reservada e alocada para um barbeiro específico.
                </p>
              </div>

              <form onSubmit={handleCreateChair} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="chairId" className="text-sm font-semibold">Nome / identificador</Label>
                  <Input
                    id="chairId"
                    value={chairIdentifier}
                    onChange={(e) => setChairIdentifier(e.target.value)}
                    placeholder="Ex: Cadeira 1 ou C1"
                    required
                    autoFocus
                    className="h-12 rounded-xl text-base"
                  />
                  <p className="text-xs text-muted-foreground">Um apelido curto para identificar esta cadeira.</p>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Recursos disponíveis</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Espelho", icon: Sparkles, value: chairMirror, set: setChairMirror },
                      { label: "Pia", icon: Droplets, value: chairSink, set: setChairSink },
                      { label: "Ar-cond.", icon: Wind, value: chairAC, set: setChairAC },
                    ].map(({ label, icon: Icon, value, set }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => set(!value)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-medium transition-all ${
                          value
                            ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-border text-muted-foreground hover:border-muted-foreground"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${value ? "text-amber-500" : ""}`} />
                        {label}
                        {value && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1 h-12 rounded-xl font-bold gap-2"
                    style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
                    disabled={chairLoading}
                  >
                    {chairLoading ? (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Criando...</>
                    ) : (
                      <>Continuar <ArrowRight className="h-4 w-4" /></>
                    )}
                  </Button>
                  <Button type="button" variant="outline" className="h-12 rounded-xl px-5"
                    onClick={() => setStep("invite")}>
                    Pular
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 4: INVITE ─── */}
          {step === "invite" && (
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Users className="h-5 w-5" />
                  <span className="text-sm font-semibold uppercase tracking-wider">Passo 4 de 4</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">Convide sua equipe</h1>
                <p className="text-muted-foreground">
                  Compartilhe este link com seus barbeiros, gerentes e recepcionistas. Cada um se cadastra sozinho.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link de convite</p>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-xl border bg-background px-3 py-2.5 font-mono text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                      {inviteLink}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 rounded-xl h-10 w-10"
                      onClick={handleCopyLink}
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full h-12 rounded-xl font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    const msg = encodeURIComponent(
                      `Olá! Você foi convidado para a equipe da nossa barbearia no BarberHouse.\nAcesse o link para criar sua conta:\n${inviteLink}`
                    );
                    window.open(`https://wa.me/?text=${msg}`, "_blank");
                  }}
                >
                  <Wifi className="h-4 w-4" />
                  Enviar via WhatsApp
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-xs text-muted-foreground uppercase">ou</span>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full h-12 rounded-xl font-bold gap-2"
                  style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
                  onClick={handleFinish}
                >
                  Concluir e ir para o painel <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Você pode convidar mais pessoas depois, na página <strong>Equipe</strong>.
                </p>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
