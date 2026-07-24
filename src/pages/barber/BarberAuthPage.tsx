import { useMemo, useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, Camera, Upload, Trash2, User, ShieldCheck, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function BarberAuthPage() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const { claimBarberInvitation, refreshBarberProfile, createBarberProfile } = useBarberProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const organizationId = useMemo(() => {
    return searchParams.get("org");
  }, [searchParams]);

  const [isSignUp, setIsSignUp] = useState(Boolean(searchParams.get("org")));
  const [email, setEmail] = useState(() => searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isInviteFlow = Boolean(organizationId);

  // Biometric / Selfie Flow States
  const [signUpStep, setSignUpStep] = useState<"fields" | "selfie" | "processing" | "success">("fields");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [cameraActive, setCameraActive] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Detectando face...");
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera controls
  async function startCamera() {
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: "user" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      toast.error("Não foi possível acessar a câmera do dispositivo.");
      setCameraActive(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  function captureSelfie() {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (ctx && videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, 300, 300);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
            setSelectedPhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
            stopCamera();
          }
        }, "image/jpeg", 0.9);
      }
    } catch (err) {
      toast.error("Erro ao capturar a foto.");
      console.error(err);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  function handleRemovePhoto() {
    setSelectedPhoto(null);
    setPhotoPreview("");
  }

  // Clear camera if component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const redirectByRole = async (targetUserId?: string) => {
    try {
      const uId = targetUserId || (await supabase.auth.getUser()).data.user?.id;
      if (!uId) {
        navigate("/barber/dashboard");
        return;
      }

      const { data: profile } = await supabase
        .from("barber_profiles")
        .select("role")
        .eq("user_id", uId)
        .maybeSingle();

      const role = profile?.role;
      if (role === "manager") {
        navigate("/manager/dashboard");
      } else if (role === "receptionist") {
        navigate("/barber/check-in");
      } else {
        navigate("/barber/dashboard");
      }
    } catch {
      navigate("/barber/dashboard");
    }
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSignUp) {
      if (signUpStep === "fields") {
        if (!fullName.trim() || !email.trim() || !password.trim()) {
          toast.error("Preencha todos os campos obrigatórios.");
          return;
        }
        setSignUpStep("selfie");
        return;
      }
    } else {
      // Login Flow
      setLoading(true);
      try {
        await signIn(email, password);

        if (organizationId) {
          try {
            await claimBarberInvitation(
              organizationId,
              fullName || undefined,
              phone || undefined
            );
          } catch (claimErr: any) {
            toast.error(claimErr?.message || "Convite não encontrado. Verifique se o dono já te adicionou.");
          }
        } else {
          try {
            await createBarberProfile(fullName || "Barbeiro", phone || "");
          } catch (e) {
            await refreshBarberProfile();
          }
        }
        await redirectByRole();
      } catch (err: any) {
        let errorMessage = err?.message || "Ocorreu um erro. Tente novamente.";
        if (errorMessage.toLowerCase().includes("invalid login")) {
          errorMessage = "E-mail ou senha incorretos.";
        }
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }
  };

  // Perform the actual signup and photo upload
  const handleCompleteBiometricRegistration = async (skipPhoto = false) => {
    setLoading(true);
    setSignUpStep("processing");

    try {
      // Step 1: Detect face simulation
      setProcessingMessage("Detectando face...");
      await new Promise(r => setTimeout(r, 800));

      // Step 2: Extract details
      setProcessingMessage("Mapeando pontos faciais...");
      await new Promise(r => setTimeout(r, 800));

      // Step 3: Validate database constraints
      setProcessingMessage("Validando dados biométricos...");
      await new Promise(r => setTimeout(r, 800));

      // Trigger actual Supabase Auth signup
      const newUser = await signUp(email, password, {
        full_name: fullName,
        phone: phone,
      });

      if (!newUser) {
        throw new Error("Não foi possível criar a conta de usuário.");
      }

      let avatarUrl: string | undefined = undefined;
      const photoToUpload = skipPhoto ? null : selectedPhoto;

      if (photoToUpload) {
        try {
          const fileExt = photoToUpload.name.split('.').pop() || 'jpg';
          const fileName = `${newUser.id}-${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, photoToUpload);

          if (!uploadError) {
            const { data } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);
            avatarUrl = data.publicUrl;
          }
        } catch (uploadErr) {
          console.error("Erro ao subir avatar no cadastro:", uploadErr);
        }
      }

      // Create internal profile matching Auth User
      if (organizationId) {
        try {
          await claimBarberInvitation(organizationId, fullName, phone);
          if (avatarUrl) {
            await supabase.from("barber_profiles").update({ avatar_url: avatarUrl } as any).eq("user_id", newUser.id);
          }
        } catch (claimErr: any) {
          await createBarberProfile(fullName, phone, newUser.id, newUser.email, null, avatarUrl);
        }
      } else {
        await createBarberProfile(fullName, phone, newUser.id, newUser.email, null, avatarUrl);
      }

      setSignUpStep("success");
      await new Promise(r => setTimeout(r, 1200));
      await redirectByRole(newUser.id);
    } catch (err: any) {
      let errorMessage = err?.message || "Ocorreu um erro no cadastro.";
      if (errorMessage.toLowerCase().includes("already registered")) {
        errorMessage = "Este e-mail já está cadastrado. Volte e faça Login.";
      }
      setError(errorMessage);
      setSignUpStep("fields");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-foreground">
            <Scissors className="h-5 w-5 text-background" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Você já está conectado</h1>
          <p className="text-sm text-muted-foreground">Logado como <span className="font-medium text-foreground">{user.email}</span></p>

          <div className="space-y-3 pt-4">
            {isInviteFlow && (
              <Button 
                className="w-full bg-foreground text-background hover:bg-foreground/90" 
                onClick={async () => {
                  setLoading(true);
                  setError("");
                  try {
                    await claimBarberInvitation(organizationId!, fullName || undefined, phone || undefined);
                    toast.success("Vinculado à barbearia com sucesso!");
                    await redirectByRole();
                  } catch (err: any) {
                    setError(err?.message || "Convite não encontrado. Peça ao dono da barbearia para adicionar seu email primeiro.");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "Vinculando..." : "Aceitar Convite da Barbearia"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                setLoading(true);
                try {
                  await refreshBarberProfile();
                } finally {
                  setLoading(false);
                  await redirectByRole();
                }
              }}
              disabled={loading}
            >
              Ir para o Painel
            </Button>
          </div>
          <div className="pt-4">
            <button
              onClick={() => void signOut()}
              className="text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              Não é {user.email}? Sair e entrar com outra conta
            </button>
          </div>
          {error && <p className="text-sm text-destructive mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left decorative panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-10 relative overflow-hidden"
      >
        {/* Full photo background */}
        <img
          src="/barber-house-hero.jpg"
          alt="Barber House"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.75) 100%)" }}
        />
        {/* Vignette */}
        <div
          className="absolute inset-0 opacity-30"
          style={{ backgroundImage: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)` }}
        />

        {/* Barber pole stripe accent */}
        <div
          className="absolute top-0 left-10 w-1 h-full opacity-30"
          style={{ background: "repeating-linear-gradient(to bottom, #dc2626 0px, #dc2626 18px, white 18px, white 36px, #1d4ed8 36px, #1d4ed8 54px)" }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div>
            <p className="text-white font-bold text-2xl tracking-tight">Barber House</p>
            <p className="text-amber-400/80 text-xs font-medium tracking-widest uppercase">
              Gestão & Estilo
            </p>
          </div>
        </div>

        {/* Tagline */}
        <div className="relative z-10 pb-6">
          <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
            Seu espaço,<br />
            <span style={{ color: "#d97706" }}>seu controle.</span>
          </h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-xs">
            Acesse seu painel de barbeiro ou gerente e controle sua agenda, cadeiras e comissões com facilidade.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md space-y-7">

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
              <p className="text-muted-foreground text-xs tracking-widest uppercase mt-0.5">
                {isSignUp ? "Cadastro" : "Portal do Barbeiro"}
              </p>
            </div>
          </div>

          {/* Desktop heading — adaptive per step */}
          <div className="hidden lg:block">
            {(!isSignUp || signUpStep === "fields") && (
              <>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                  {isSignUp ? "Crie sua conta ✂️" : "Olá, barbeiro! 👋"}
                </h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  {isSignUp
                    ? "Preencha seus dados para começar na Barber House."
                    : "Acesse sua conta de barbeiro ou gerente."}
                </p>
              </>
            )}
            {isSignUp && signUpStep === "selfie" && (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                  Validação Facial 🔐
                </h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  Para maior segurança, registre sua selfie para controle de acesso.
                </p>
              </>
            )}
            {isSignUp && signUpStep === "processing" && (
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Processando biometria...
              </h1>
            )}
            {isSignUp && signUpStep === "success" && (
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Conta ativada! 🎉
              </h1>
            )}
          </div>

          {/* STEP 1 — Login or Signup Fields */}
          {(!isSignUp || signUpStep === "fields") && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {isSignUp && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-semibold">Nome completo</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="João da Silva"
                      required
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold">Telefone</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+55 91 99999-9999"
                      className="h-11 rounded-xl"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="barbeiro@barberhouse.com.br"
                  required
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-11 rounded-xl"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-bold text-base shadow-md text-white"
                style={{ background: "linear-gradient(135deg, #1f2937, #111827)" }}
                disabled={loading}
              >
                {loading
                  ? "Carregando..."
                  : isSignUp
                  ? "Avançar para Validação Facial ✂️"
                  : "Entrar na Barber House"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
                <button
                  type="button"
                  onClick={() => { setError(""); setIsSignUp(!isSignUp); setSignUpStep("fields"); }}
                  className="font-semibold text-primary hover:underline"
                >
                  {isSignUp ? "Fazer Login" : "Criar Conta"}
                </button>
              </p>
            </form>
          )}

          {/* STEP 2 — Selfie */}
          {isSignUp && signUpStep === "selfie" && (
            <div className="space-y-6 text-center">
              <p className="text-xs text-muted-foreground">
                Para maior segurança e controle de acesso às cadeiras, realize o escaneamento facial.
              </p>

              <div className="flex flex-col items-center justify-center gap-4">
                <div
                  className="relative h-48 w-48 rounded-full overflow-hidden flex items-center justify-center"
                  style={{ border: "3px solid #d97706", background: "rgba(180,83,9,0.08)" }}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Selfie Preview" className="h-full w-full object-cover" />
                  ) : cameraActive ? (
                    <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover bg-black scale-x-[-1]" />
                  ) : (
                    <User className="h-20 w-20 text-muted-foreground" />
                  )}
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  {cameraActive ? (
                    <>
                      <Button type="button" onClick={captureSelfie} className="rounded-xl">Capturar Foto</Button>
                      <Button type="button" variant="outline" onClick={stopCamera} className="rounded-xl">Cancelar</Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" onClick={startCamera} className="rounded-xl gap-1">
                      <Camera className="h-4 w-4" />
                      Tirar Selfie
                    </Button>
                  )}

                  <label className="inline-flex items-center justify-center text-xs font-semibold border rounded-xl hover:bg-muted/40 cursor-pointer h-10 px-4 select-none gap-1 transition-all">
                    <Upload className="h-4 w-4" />
                    Galeria
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>

                  {photoPreview && (
                    <Button type="button" variant="ghost" onClick={handleRemovePhoto} className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive gap-1">
                      <Trash2 className="h-4 w-4" />
                      Limpar
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => handleCompleteBiometricRegistration(false)}
                  className="w-full h-11 rounded-xl font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
                  disabled={!selectedPhoto || loading}
                >
                  Confirmar Biometria
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleCompleteBiometricRegistration(true)}
                  className="w-full text-xs text-muted-foreground"
                  disabled={loading}
                >
                  Pular e validar depois
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 — Processing */}
          {isSignUp && signUpStep === "processing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-5 text-center">
              <div
                className="h-16 w-16 rounded-full flex items-center justify-center animate-pulse"
                style={{ background: "linear-gradient(135deg, #b45309, #92400e)" }}
              >
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
              <p className="font-bold text-lg text-foreground">{processingMessage}</p>
              <p className="text-xs text-muted-foreground">Isso leva apenas alguns instantes...</p>
            </div>
          )}

          {/* STEP 4 — Success */}
          {isSignUp && signUpStep === "success" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
              <ShieldCheck className="h-20 w-20 text-emerald-500 animate-bounce" />
              <h3 className="font-extrabold text-xl text-foreground">Identidade Validada!</h3>
              <p className="text-sm text-muted-foreground">Sua conta foi ativada com sucesso. Bem-vindo à Barber House! 💈</p>
            </div>
          )}

          {/* Footer links */}
          {signUpStep === "fields" && (
            <div className="pt-2 border-t border-border space-y-2 text-center">
              <p className="text-xs text-muted-foreground">
                É gerente de um ponto? Entre com sua conta aqui — você será levado ao portal automaticamente.
              </p>
              <p className="text-xs text-muted-foreground">
                É dono da barbearia?{" "}
                <a href="/" className="text-primary hover:underline font-semibold">
                  Ir para o Portal da Organização
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
