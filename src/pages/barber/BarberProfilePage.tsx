import { useState, useRef, useEffect } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { User, Camera, Upload, Trash2, CheckCircle2 } from "lucide-react";

export default function BarberProfilePage() {
  const { barberProfile, refreshBarberProfile, createBarberProfile } = useBarberProfile();

  const [fullName, setFullName] = useState(barberProfile?.full_name ?? "");
  const [phone, setPhone] = useState(barberProfile?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string>((barberProfile as any)?.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Camera integration state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
        // Draw centered square crop from video feed
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

    setSaving(true);
    try {
      await createBarberProfile(
        fullName.trim(),
        phone.trim() || undefined,
        barberProfile.user_id,
        barberProfile.email,
        barberProfile.organization_id ?? undefined,
        avatarUrl || undefined
      );
      toast.success("Perfil atualizado com sucesso!");
      await refreshBarberProfile();
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

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <User className="h-5 w-5" />
          Meu Perfil
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie seus dados cadastrais e foto de perfil.</p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dados Pessoais</CardTitle>
          <CardDescription>Ajuste suas informações básicas de identificação na plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Selfie / Avatar Section */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pb-2">
              <div className="relative h-28 w-28 rounded-full border border-muted-foreground/10 bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
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
                <p className="text-sm font-semibold">Foto de Perfil (Selfie)</p>
                <p className="text-xs text-muted-foreground">Tire uma foto na hora ou envie um arquivo do seu dispositivo.</p>
                
                <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                  {cameraActive ? (
                    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center p-4">
                      <div className="bg-background rounded-2xl p-4 max-w-md w-full flex flex-col items-center gap-4">
                        <h3 className="font-semibold text-sm">Posicione seu rosto</h3>
                        <video ref={videoRef} autoPlay playsInline className="h-72 w-72 rounded-full object-cover border-4 border-primary bg-black scale-x-[-1]" />
                        <div className="flex gap-2 w-full justify-center">
                          <Button type="button" onClick={captureSelfie} className="rounded-xl flex-1 max-w-[120px]">Capturar</Button>
                          <Button type="button" variant="outline" onClick={stopCamera} className="rounded-xl flex-1 max-w-[120px]">Cancelar</Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={startCamera} className="rounded-xl gap-1.5 h-9">
                      <Camera className="h-3.5 w-3.5" />
                      Tirar foto
                    </Button>
                  )}

                  <label className="inline-flex items-center justify-center text-xs font-semibold border rounded-xl hover:bg-muted/40 cursor-pointer h-9 px-3.5 select-none gap-1.5 transition-all">
                    <Upload className="h-3.5 w-3.5" />
                    Enviar arquivo
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>

                  {avatarUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto} className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 h-9">
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
                <Input id="email" value={barberProfile?.email ?? ""} disabled className="bg-muted/40" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Cargo Operacional</Label>
                <Input 
                  id="role" 
                  value={
                    barberProfile?.role === "owner" ? "Proprietário" : 
                    barberProfile?.role === "manager" ? "Gerente" : 
                    barberProfile?.role === "receptionist" ? "Recepcionista" : "Barbeiro"
                  } 
                  disabled 
                  className="bg-muted/40" 
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
                  className="rounded-xl border-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input 
                  id="phone" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="(99) 99999-9999"
                  className="rounded-xl border-muted"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="rounded-xl h-10 px-6 font-semibold" disabled={saving || uploading}>
                {saving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
