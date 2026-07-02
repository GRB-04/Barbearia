// src/components/ManagerUsersSection.tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import {
  DEFAULT_MANAGER_PERMISSIONS,
  MANAGER_PERMISSION_LABELS,
  parseManagerPermissions,
  type ManagerPermissions,
} from "@/lib/managerPermissions";

type ManagerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_id: string | null;
  location_id: string | null;
  permissions: unknown;
};

type LocationOption = { id: string; name: string };

export default function ManagerUsersSection() {
  const { organization } = useOrganization();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [permissions, setPermissions] = useState<ManagerPermissions>({
    ...DEFAULT_MANAGER_PERMISSIONS,
  });

  const fetchData = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    try {
      const [managersRes, locationsRes] = await Promise.all([
        supabase
          .from("organization_barbers")
          .select("id, full_name, email, user_id, location_id, permissions")
          .eq("organization_id", organization.id)
          .eq("role", "manager")
          .order("created_at", { ascending: true }),
        supabase
          .from("locations")
          .select("id, name")
          .eq("organization_id", organization.id)
          .order("name", { ascending: true }),
      ]);

      if (managersRes.error) throw managersRes.error;
      if (locationsRes.error) throw locationsRes.error;

      setManagers((managersRes.data ?? []) as ManagerRow[]);
      setLocations((locationsRes.data ?? []) as LocationOption[]);
    } catch (error: any) {
      toast.error(error.message || "Não foi possível carregar os gerentes.");
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleAddManager = async () => {
    if (!organization?.id) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (!locationId) {
      toast.error("Selecione o ponto físico.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("organization_barbers").insert({
        organization_id: organization.id,
        email: normalizedEmail,
        full_name: fullName.trim() || null,
        role: "manager",
        location_id: locationId,
        permissions,
      });

      if (error) throw error;

      toast.success(
        "Gerente adicionado. Envie o link de convite para ele criar a conta."
      );
      setDialogOpen(false);
      setEmail("");
      setFullName("");
      setLocationId("");
      setPermissions({ ...DEFAULT_MANAGER_PERMISSIONS });
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Não foi possível adicionar o gerente.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePermission = async (
    manager: ManagerRow,
    key: keyof ManagerPermissions,
    value: boolean
  ) => {
    const current = parseManagerPermissions(manager.permissions);
    const next = { ...current, [key]: value };

    const { error } = await supabase
      .from("organization_barbers")
      .update({ permissions: next })
      .eq("id", manager.id);

    if (error) {
      toast.error(error.message || "Não foi possível atualizar a permissão.");
      return;
    }

    setManagers((prev) =>
      prev.map((m) => (m.id === manager.id ? { ...m, permissions: next } : m))
    );
  };

  const handleChangeLocation = async (manager: ManagerRow, newLocationId: string) => {
    const { error } = await supabase
      .from("organization_barbers")
      .update({ location_id: newLocationId })
      .eq("id", manager.id);

    if (error) {
      toast.error(error.message || "Não foi possível alterar o ponto.");
      return;
    }

    setManagers((prev) =>
      prev.map((m) => (m.id === manager.id ? { ...m, location_id: newLocationId } : m))
    );
    toast.success("Ponto físico atualizado.");
  };

  const handleRemoveManager = async (manager: ManagerRow) => {
    const { error } = await supabase
      .from("organization_barbers")
      .delete()
      .eq("id", manager.id);

    if (error) {
      toast.error(error.message || "Não foi possível remover o gerente.");
      return;
    }

    toast.success("Gerente removido.");
    await fetchData();
  };

  const copyInviteLink = () => {
    if (!organization?.id) return;
    const link = `${window.location.origin}/barber/auth?org=${organization.id}`;
    void navigator.clipboard.writeText(link);
    toast.success("Link de convite copiado.");
  };

  const locationName = (id: string | null) =>
    locations.find((l) => l.id === id)?.name ?? "Sem ponto";

  const permissionKeys = Object.keys(
    MANAGER_PERMISSION_LABELS
  ) as (keyof ManagerPermissions)[];

  return (
    <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Gerentes</h2>
          <p className="text-sm text-muted-foreground">
            Gerentes administram um ponto físico e aprovam reservas quando a
            confirmação automática está desativada.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl">
              <UserPlus className="mr-2 h-4 w-4" />
              Adicionar gerente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo gerente</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manager-email">E-mail</Label>
                <Input
                  id="manager-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gerente@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manager-name">Nome (opcional)</Label>
                <Input
                  id="manager-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome do gerente"
                />
              </div>

              <div className="space-y-2">
                <Label>Ponto físico</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o ponto" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Permissões</Label>
                {permissionKeys.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">
                      {MANAGER_PERMISSION_LABELS[key]}
                    </span>
                    <Switch
                      checked={permissions[key]}
                      onCheckedChange={(checked) =>
                        setPermissions((prev) => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>

              <Button
                className="w-full rounded-2xl"
                onClick={handleAddManager}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Adicionar gerente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando gerentes...</p>
      ) : managers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum gerente cadastrado ainda.
        </p>
      ) : (
        <div className="space-y-4">
          {managers.map((manager) => {
            const perms = parseManagerPermissions(manager.permissions);
            return (
              <div
                key={manager.id}
                className="rounded-2xl border border-border p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {manager.full_name || manager.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{manager.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {manager.user_id
                        ? "Conta vinculada"
                        : "Aguardando criação da conta (envie o link de convite)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!manager.user_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={copyInviteLink}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Convite
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-destructive"
                      onClick={() => void handleRemoveManager(manager)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Ponto físico</Label>
                  <Select
                    value={manager.location_id ?? ""}
                    onValueChange={(v) => void handleChangeLocation(manager, v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={locationName(manager.location_id)} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {permissionKeys.map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2"
                    >
                      <span className="text-xs text-foreground">
                        {MANAGER_PERMISSION_LABELS[key]}
                      </span>
                      <Switch
                        checked={perms[key]}
                        onCheckedChange={(checked) =>
                          void handleTogglePermission(manager, key, checked)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
