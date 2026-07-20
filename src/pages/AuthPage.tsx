import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LayoutGrid } from "lucide-react";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false); // default: login mode
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <LayoutGrid className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Portal da Organização</h1>
          <p className="text-sm text-muted-foreground text-center">Acesso do dono: gerencie sua barbearia, unidades e barbeiros.</p>
        </div>

        {/* Tab switcher — large, clearly clickable buttons */}
        <div className="grid grid-cols-2 rounded-xl border border-border overflow-hidden">
          <button
            id="tab-entrar"
            type="button"
            onClick={() => { setError(""); setIsSignUp(false); }}
            className={`py-3 text-sm font-semibold transition-colors ${
              !isSignUp
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Entrar
          </button>
          <button
            id="tab-criar"
            type="button"
            onClick={() => { setError(""); setIsSignUp(true); }}
            className={`py-3 text-sm font-semibold transition-colors ${
              isSignUp
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="owner-email" className="text-sm font-medium">E-mail</Label>
            <Input
              id="owner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dono@barbearia.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-password" className="text-sm font-medium">Senha</Label>
            <Input
              id="owner-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button id="btn-submit-owner" type="submit" className="w-full" disabled={loading}>
            {loading ? "Carregando..." : isSignUp ? "Criar Conta" : "Entrar"}
          </Button>
        </form>

        <div className="pt-4 border-t border-border text-center space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Você é um Barbeiro?</p>
            <a id="link-barber-portal" href="/barber/auth" className="text-sm text-primary hover:underline font-medium">
              Acessar Portal do Barbeiro
            </a>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Você é Gerente de um ponto?</p>
            <a id="link-manager-portal" href="/barber/auth" className="text-sm text-primary hover:underline font-medium">
              Entrar no Portal do Gerente
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
