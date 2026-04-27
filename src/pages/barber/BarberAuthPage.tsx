import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function BarberAuthPage() {
  const { signIn, signUp } = useAuth();
  const { claimBarberInvitation, refreshBarberProfile, createBarberProfile } = useBarberProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const organizationId = useMemo(() => {
    return searchParams.get("org");
  }, [searchParams]);

  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isInviteFlow = Boolean(organizationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const newUser = await signUp(email, password, {
          full_name: fullName,
          phone: phone,
        });

        if (!newUser) {
          throw new Error("Não foi possível criar a conta.");
        }

        if (organizationId) {
          await claimBarberInvitation(organizationId, fullName, phone);
        } else {
          // Trigger creates the profile, but we upsert to ensure it's up to date
          await createBarberProfile(fullName, phone, newUser.id, newUser.email);
        }

        navigate("/barber/dashboard");
        return;
      }

      await signIn(email, password);

      if (organizationId) {
        await claimBarberInvitation(
          organizationId,
          fullName || undefined,
          phone || undefined
        );
      } else {
        // If profile is missing (e.g. signup failed halfway before), create it now
        try {
          await createBarberProfile(fullName || "Barbeiro", phone || "");
        } catch (e) {
          // If already exists, just refresh
          await refreshBarberProfile();
        }
      }

      navigate("/barber/dashboard");
    } catch (err: any) {
      let errorMessage = err?.message || "Ocorreu um erro. Tente novamente.";
      if (err?.status === 429 || errorMessage.toLowerCase().includes("rate limit")) {
        errorMessage = "Muitas tentativas (Erro 429). O limite de envio de e-mails de cadastro do Supabase foi atingido. Tente novamente em 1 hora ou desative 'Confirm email' nas configurações do Supabase.";
      } else if (errorMessage.toLowerCase().includes("invalid login")) {
        errorMessage = "E-mail ou senha incorretos.";
      } else if (errorMessage.toLowerCase().includes("already registered")) {
        errorMessage = "Este e-mail já está cadastrado. Volte e faça Login.";
      }
      setError(errorMessage);
      console.error("Barber auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground">
            <Scissors className="h-5 w-5 text-background" />
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Barber Portal
          </h1>

          <p className="text-sm text-muted-foreground text-center">
            {isInviteFlow
              ? "Cadastro vinculado à barbearia convidante."
              : "Acesse sua conta de barbeiro."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">
                  Nome completo
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="João da Silva"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Telefone
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 91 99999-9999"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="barbeiro@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Senha
            </Label>
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



          <Button
            type="submit"
            className="w-full bg-foreground text-background hover:bg-foreground/90"
            disabled={loading}
          >
            {loading
              ? "Carregando..."
              : isSignUp
              ? "Criar conta de barbeiro"
              : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground pt-4">
          {isSignUp ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setIsSignUp(!isSignUp);
            }}
            className="font-medium text-primary hover:underline"
          >
            {isSignUp ? "Fazer Login" : "Criar Conta"}
          </button>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          É dono da barbearia?{" "}
          <a href="/" className="text-primary hover:underline font-medium">
            Ir para o portal do owner
          </a>
        </p>
      </div>
    </div>
  );
}