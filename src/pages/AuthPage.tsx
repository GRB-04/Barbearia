import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors } from "lucide-react";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSignUp) {
      if (!fullName.trim()) { setError("Informe seu nome completo."); return; }
      if (!orgName.trim()) { setError("Informe o nome da barbearia."); return; }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, { full_name: fullName.trim(), org_name: orgName.trim() });
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes("rate limit")) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else if (err?.message?.includes("Invalid login")) {
        setError("Credenciais inválidas. Verifique seu e-mail e senha.");
      } else {
        setError(err?.message || "Ocorreu um erro inesperado.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start">
      {/* Left Panel — decorative barbershop visual */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-10 relative overflow-hidden sticky top-0 h-screen"
      >
        {/* Full photo background */}
        <img
          src="/owner-portal-hero.jpg"
          alt="Barber House"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.75) 100%)" }}
        />
        {/* Subtle vignette */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)`
          }}
        />

        {/* Barber pole stripe accent */}
        <div
          className="absolute top-0 left-10 w-1 h-full opacity-30"
          style={{ background: "repeating-linear-gradient(to bottom, #dc2626 0px, #dc2626 18px, white 18px, white 36px, #1d4ed8 36px, #1d4ed8 54px)" }}
        />

        {/* Logo area */}
        <div className="relative z-10">
          <div>
            <p className="text-white font-bold text-2xl tracking-tight">Barber House</p>
            <p className="text-amber-400/80 text-xs font-medium tracking-widest uppercase">Gestão & Estilo</p>
          </div>
        </div>

        {/* Center statement */}
        <div className="relative z-10 pb-6">
          <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
            Gestão<br />
            <span style={{ color: "#d97706" }}>profissional</span><br />
            para barbearias.
          </h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-xs">
            Controle de cadeiras, agendamentos, barbeiros e muito mais. Tudo em um único lugar.
          </p>
        </div>
      </div>

      {/* Right Panel — login form */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md space-y-8">

          {/* Mobile logo */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
              style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
            >
              <Scissors className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <p className="font-bold text-2xl tracking-tight text-foreground">Barber House</p>
              <p className="text-muted-foreground text-xs tracking-widest uppercase mt-0.5">Portal da Organização</p>
            </div>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Bem-vindo de volta 👋
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Acesse o painel do dono para gerenciar sua barbearia.
            </p>
          </div>

          {/* Tabs */}
          <div
            className="grid grid-cols-2 rounded-2xl p-1 gap-1"
            style={{ background: "hsl(var(--muted))" }}
          >
            <button
              id="tab-entrar"
              type="button"
              onClick={() => { setError(""); setIsSignUp(false); }}
              className={`py-2.5 text-sm font-semibold rounded-xl transition-all ${
                !isSignUp
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              id="tab-criar"
              type="button"
              onClick={() => { setError(""); setIsSignUp(true); }}
              className={`py-2.5 text-sm font-semibold rounded-xl transition-all ${
                isSignUp
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Criar Conta
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Extra fields only in sign-up mode */}
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="owner-fullname" className="text-sm font-semibold">Seu Nome Completo</Label>
                  <Input
                    id="owner-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: João Silva"
                    required
                    autoComplete="name"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-orgname" className="text-sm font-semibold">Nome da Barbearia</Label>
                  <Input
                    id="owner-orgname"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ex: Barber House SP"
                    required
                    className="h-11 rounded-xl"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="owner-email" className="text-sm font-semibold">E-mail</Label>
              <Input
                id="owner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dono@barberhouse.com.br"
                required
                autoComplete="email"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-password" className="text-sm font-semibold">Senha</Label>
              <Input
                id="owner-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="h-11 rounded-xl"
              />
            </div>


            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              id="btn-submit-owner"
              type="submit"
              className="w-full h-11 rounded-xl font-bold text-base shadow-md"
              style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
              disabled={loading}
            >
              {loading ? "Carregando..." : isSignUp ? "Criar Conta" : "Entrar no Painel"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted-foreground font-medium">outros portais</span>
            </div>
          </div>

          {/* Other portal — single link since barbers & managers share the same auth */}
          <a
            id="link-barber-portal"
            href="/barber/auth"
            className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-5 py-4 hover:bg-muted/60 transition-colors"
          >
            <Scissors className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Sou Barbeiro ou Gerente</p>
              <p className="text-xs text-muted-foreground">Acesse o portal de equipe aqui</p>
            </div>
            <span className="ml-auto text-muted-foreground text-xs">→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
