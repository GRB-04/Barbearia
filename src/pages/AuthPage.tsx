import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LayoutGrid } from "lucide-react";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(true);
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
        setError("Muitas tentativas (Erro 429). O limite de envio de e-mails do Supabase foi atingido. Aguarde 1 hora ou desative 'Confirm email' no dashboard do Supabase.");
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Portal do Owner</h1>
          <p className="text-sm text-muted-foreground text-center">Gerencie sua barbearia, unidades e barbeiros.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dono@barbearia.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Carregando..." : isSignUp ? "Criar Conta" : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
          <button type="button" onClick={() => { setError(""); setIsSignUp(!isSignUp); }} className="text-primary hover:underline font-medium">
            {isSignUp ? "Entrar" : "Criar Conta"}
          </button>
        </p>

        <div className="pt-4 border-t border-border mt-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Você é um Barbeiro?</p>
          <a href="/barber/auth" className="text-sm text-primary hover:underline font-medium">
            Acessar Portal do Barbeiro
          </a>
        </div>
      </div>
    </div>
  );
}
