import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BarberAuthPage() {
  const { signIn, signUp, user } = useAuth();
  const { createBarberProfile } = useBarberProfile();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        await createBarberProfile(fullName, phone);
        navigate("/barber/dashboard");
      } else {
        await signIn(email, password);
        navigate("/barber/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Barber Portal</h1>
          <p className="text-sm text-muted-foreground">Find & rent your chair.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555-0123" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="barber@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full bg-foreground text-background hover:bg-foreground/90" disabled={loading}>
            {loading ? "Loading..." : isSignUp ? "Create Barber Account" : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline font-medium">
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Are you a shop owner?{" "}
          <a href="/" className="text-primary hover:underline font-medium">Go to Owner Portal</a>
        </p>
      </div>
    </div>
  );
}
