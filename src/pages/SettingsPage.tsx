import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Building2, Phone, Mail, Save } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { organization, loading: orgLoading } = useOrganization();
  const { user } = useAuth();

  const [name, setName] = useState(organization?.name ?? "");
  const [saving, setSaving] = useState(false);

  // Sync when org loads
  if (!saving && organization && name === "") {
    setName(organization.name);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!organization?.id) return;
    if (!name.trim()) {
      toast.error("Informe o nome da organização.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: name.trim() })
        .eq("id", organization.id);

      if (error) throw error;
      toast.success("Configurações salvas com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  if (orgLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Organização não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configurações
        </h1>
        <p className="text-sm text-muted-foreground">Gerencie as configurações da sua organização.</p>
      </div>

      {/* Org Info */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Dados da organização
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Nome da barbearia</Label>
              <Input
                id="orgName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Barbearia do Ector"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>ID da organização</Label>
              <Input value={organization.id} disabled className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Use este ID para integrar com sistemas externos.</p>
            </div>

            <div className="space-y-2">
              <Label>Moeda</Label>
              <Input value="BRL — Real Brasileiro" disabled />
            </div>

            <div className="space-y-2">
              <Label>Fuso horário</Label>
              <Input value="America/Sao_Paulo" disabled />
            </div>

            <Button type="submit" className="gap-2" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar configurações"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Conta do administrador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Input value="Administrador / Owner" disabled />
          </div>
        </CardContent>
      </Card>

      {/* Invite link */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Link de convite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Compartilhe este link com barbeiros para que se vinculem à sua organização.
          </p>
          <div className="flex gap-2">
            <Input
              value={`${window.location.origin}/barber/auth?org=${organization.id}`}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/barber/auth?org=${organization.id}`);
                toast.success("Link copiado!");
              }}
            >
              Copiar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
