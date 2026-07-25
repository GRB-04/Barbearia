import { useState, useRef, useEffect } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { User, Camera, Upload, Trash2, QrCode, ShieldCheck, FileCheck, ShieldAlert, Wifi } from "lucide-react";

export default function BarberProfilePage() {
  const { barberProfile, refreshBarberProfile, createBarberProfile } = useBarberProfile();

  const [fullName, setFullName] = useState(barberProfile?.full_name ?? "");
  const [email, setEmail] = useState(barberProfile?.email ?? "");
  const [phone, setPhone] = useState(barberProfile?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string>((barberProfile as any)?.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Document states
  const [docFront, setDocFront] = useState<string>("");
  const [docBack, setDocBack] = useState<string>("");
  const [backgroundCheck, setBackgroundCheck] = useState<string>("");

  // Camera integration state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim()) {
      toast.error("Informe a nova senha.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar senha.");
    } finally {
      setUpdatingPassword(false);
    }
  }

  useEffect(() => {
    if (barberProfile) {
      setFullName(barberProfile.full_name ?? "");
      setPhone(barberProfile.phone ?? "");
      setAvatarUrl((barberProfile as any).avatar_url ?? "");
    }
  }, [barberProfile]);

  // Handle local file selection upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImage(file);
  }

  // Common upload logic
  async function uploadImage(file: File) {
    if (!barberProfile?.id) return;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${barberProfile.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setAvatarUrl(data.publicUrl);
      toast.success("Foto de perfil enviada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload da imagem.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  // Camera capture methods
  async function startCamera() {
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 400, facingMode: "user" }
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

  async function captureSelfie() {
    if (!videoRef.current) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      
      if (ctx && videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, 400, 400);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
            await uploadImage(file);
            stopCamera();
          }
        }, "image/jpeg", 0.9);
      }
    } catch (err: any) {
      toast.error("Erro ao capturar a foto.");
      console.error(err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!barberProfile?.id) return;
    if (!fullName.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }
    if (!email.trim()) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    setSaving(true);
    try {
      // Update Supabase Auth email if changed
      if (email.trim() !== barberProfile.email) {
        const { error: authErr } = await supabase.auth.updateUser({ email: email.trim() });
        if (authErr) throw authErr;
      }

      await createBarberProfile(
        fullName.trim(),
        phone.trim() || undefined,
        barberProfile.user_id,
        email.trim(),
        barberProfile.organization_id ?? undefined,
        avatarUrl || undefined
      );
      toast.success("Perfil atualizado com sucesso!");
      await refreshBarberProfile();
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar alterações.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function handleRemovePhoto() {
    setAvatarUrl("");
    toast.info("Foto removida. Lembre-se de salvar para persistir.");
  }

  // Network IP override for testing QR code with a physical cell phone on local Wi-Fi
  const [networkHost, setNetworkHost] = useState(() => {
    return localStorage.getItem("dev_qr_network_host") || "192.168.0.141";
  });

  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const effectiveOrigin = (isLocalhost && networkHost.trim())
    ? `http://${networkHost.trim()}:${window.location.port || "8080"}`
    : window.location.origin;

  const accessUrl = barberProfile?.id
    ? `${effectiveOrigin}/access/${barberProfile.id}`
    : "";
  const qrCodeImageUrl = accessUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(accessUrl)}`
    : "";

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          Meu Perfil & Segurança
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie seus dados cadastrais, crachá digital e documentos de verificação.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Personal Profile Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl shadow-sm border-muted/60">
            <CardHeader>
              <CardTitle className="text-base font-bold">Dados Pessoais</CardTitle>
              <CardDescription>Ajuste suas informações básicas de identificação na plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Selfie / Avatar Section */}
                <div className="flex flex-col sm:flex-row items-center gap-6 pb-2">
                  <div className="relative h-28 w-28 rounded-full border border-muted-foreground/10 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Selfie" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-12 w-12 text-muted-foreground" />
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-background/75 flex items-center justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-center sm:text-left flex-1 w-full">
                    <p className="text-sm font-semibold">Foto de Perfil (Selfie Biométrica)</p>
                    <p className="text-xs text-muted-foreground">Tire uma foto na hora ou envie um arquivo do seu dispositivo.</p>
                    
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                      {cameraActive ? (
                        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center p-4">
                          <div className="bg-background rounded-3xl p-5 max-w-md w-full flex flex-col items-center gap-4">
                            <h3 className="font-bold text-sm">Posicione seu rosto</h3>
                            <video ref={videoRef} autoPlay playsInline className="h-72 w-72 rounded-full object-cover border-4 border-primary bg-black scale-x-[-1]" />
                            <div className="flex gap-2 w-full justify-center">
                              <Button type="button" onClick={captureSelfie} className="rounded-2xl flex-1 max-w-[120px]">Capturar</Button>
                              <Button type="button" variant="outline" onClick={stopCamera} className="rounded-2xl flex-1 max-w-[120px]">Cancelar</Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={startCamera} className="rounded-2xl gap-1.5 h-9">
                          <Camera className="h-3.5 w-3.5" />
                          Tirar foto
                        </Button>
                      )}

                      <label className="inline-flex items-center justify-center text-xs font-semibold border rounded-2xl hover:bg-muted/40 cursor-pointer h-9 px-3.5 select-none gap-1.5 transition-all">
                        <Upload className="h-3.5 w-3.5" />
                        Enviar arquivo
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                      </label>

                      {avatarUrl && (
                        <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto} className="rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 h-9">
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail (Login)</Label>
                    <Input 
                      id="email" 
                      type="email"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      placeholder="seu.email@exemplo.com"
                      required
                      disabled={!isEditing}
                      className="rounded-2xl border-muted disabled:opacity-60 disabled:cursor-not-allowed" 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Cargo Operacional</Label>
                    <Input 
                      id="role" 
                      value={
                        barberProfile?.role === "owner" ? "Proprietário" : 
                        barberProfile?.role === "manager" ? "Gerente" : 
                        barberProfile?.role === "receptionist" ? "Recepcionista" : "Barbeiro Profissional"
                      } 
                      disabled 
                      className="bg-muted/40 rounded-2xl" 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input 
                      id="name" 
                      value={fullName} 
                      onChange={(e) => setFullName(e.target.value)} 
                      placeholder="Nome do profissional"
                      required
                      disabled={!isEditing}
                      className="rounded-2xl border-muted disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input 
                      id="phone" 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)} 
                      placeholder="(99) 99999-9999"
                      disabled={!isEditing}
                      className="rounded-2xl border-muted disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  {!isEditing ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl h-11 px-6 font-bold"
                      onClick={() => setIsEditing(true)}
                    >
                      Alterar Dados
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl h-11 px-6"
                        onClick={() => {
                          setIsEditing(false);
                          setFullName(barberProfile?.full_name ?? "");
                          setPhone(barberProfile?.phone ?? "");
                          setEmail(barberProfile?.email ?? "");
                        }}
                        disabled={saving}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" className="rounded-2xl h-11 px-6 font-bold" disabled={saving || uploading}>
                        {saving ? "Salvando..." : "Salvar Alterações"}
                      </Button>
                    </>
                  )}
                </div>

              </form>
            </CardContent>
          </Card>

          {/* Password Change Card */}
          <Card className="rounded-3xl shadow-sm border-muted/60">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Alterar Senha de Acesso
              </CardTitle>
              <CardDescription>
                Atualize sua senha de login com segurança.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nova Senha</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="rounded-2xl border-muted"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Repita a nova senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="rounded-2xl border-muted"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="outline"
                    className="rounded-2xl h-10 px-5 font-bold"
                    disabled={updatingPassword}
                  >
                    {updatingPassword ? "Atualizando..." : "Alterar Senha"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Document Verification Section (Exigência Reunião) */}
          <Card className="rounded-3xl shadow-sm border-muted/60">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Documentos de Segurança
              </CardTitle>
              <CardDescription>
                Documentos exigidos para homologação na barbearia e acesso automatizado à portaria.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* RG / CPF Document Card */}
                <div className="p-4 border rounded-2xl bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <FileCheck className="h-4 w-4 text-primary" />
                      Documento (RG/CPF)
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                      Verificado
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Frente e verso legíveis do documento oficial com foto.</p>
                  <label className="inline-flex items-center justify-center w-full text-xs font-semibold border rounded-xl hover:bg-muted/60 cursor-pointer h-9 px-3 select-none gap-1.5 transition-all">
                    <Upload className="h-3.5 w-3.5" />
                    {docFront ? "Substituir Documento" : "Enviar Documento"}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setDocFront(URL.createObjectURL(e.target.files[0]));
                        toast.success("Documento enviado para análise!");
                      }
                    }} />
                  </label>
                </div>

                {/* Criminal Record Background Check */}
                <div className="p-4 border rounded-2xl bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      Antecedentes Criminais
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                      Pendente
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Certidão negativa recente de antecedentes criminais.</p>
                  <label className="inline-flex items-center justify-center w-full text-xs font-semibold border rounded-xl hover:bg-muted/60 cursor-pointer h-9 px-3 select-none gap-1.5 transition-all">
                    <Upload className="h-3.5 w-3.5" />
                    {backgroundCheck ? "Substituir Certidão" : "Enviar Certidão"}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setBackgroundCheck(URL.createObjectURL(e.target.files[0]));
                        toast.success("Antecedentes enviados para verificação!");
                      }
                    }} />
                  </label>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Digital QR Code Access Pass (Squire Style) */}
        <div className="space-y-6">
          <Card className="rounded-3xl shadow-sm border-muted/60 bg-gradient-to-b from-card to-muted/20">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-base font-bold flex items-center justify-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                Crachá Digital
              </CardTitle>
              <CardDescription>Acesso via QR Code para portarias e catracas automatizadas.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center space-y-4 pt-2">
              
              {/* QR Code Container */}
              <div className="p-4 bg-white rounded-3xl border-2 border-primary/20 shadow-md">
                {qrCodeImageUrl ? (
                  <img src={qrCodeImageUrl} alt="QR Code Acesso" className="h-44 w-44 object-contain" />
                ) : (
                  <div className="h-44 w-44 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                    Gerando QR Code...
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-foreground">
                  {barberProfile?.full_name || "Barbeiro Valido"}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground bg-muted/60 py-1 px-3 rounded-xl border border-muted">
                  ID: {barberProfile?.id?.slice(0, 8) || "---"}
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground px-2">
                Escaneie com a câmera do celular (conectado ao mesmo Wi-Fi).
              </p>

              {/* Wi-Fi IP configuration helper for local dev */}
              {isLocalhost && (
                <div className="w-full pt-3 mt-1 border-t border-border text-left space-y-1.5 bg-muted/30 p-2.5 rounded-2xl">
                  <label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Wifi className="h-3 w-3 text-primary" />
                      IP no Wi-Fi (para o celular):
                    </span>
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: 192.168.0.141"
                    value={networkHost}
                    onChange={(e) => {
                      setNetworkHost(e.target.value);
                      localStorage.setItem("dev_qr_network_host", e.target.value);
                    }}
                    className="h-7 text-xs font-mono rounded-xl bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    O QR Code atualizará com o IP da sua máquina no Wi-Fi.
                  </p>
                </div>
              )}

              {/* Test link for dev/demo */}
              {accessUrl && (
                <a
                  href={accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline font-medium pt-1"
                >
                  <QrCode className="h-3 w-3" />
                  Testar no navegador do PC →
                </a>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
