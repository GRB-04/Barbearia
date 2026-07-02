import { useCallback, useEffect, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, Mail, Phone, RefreshCw, User, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchLocationBarbers } from "@/services/managerData";

type BarberInfo = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export default function ManagerBarbersPage() {
  const { managerLocationId, managerPermissions, barber } = useBarberProfile();
  const [barbers, setBarbers] = useState<BarberInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBarbers = useCallback(async () => {
    if (!managerLocationId) return;
    setLoading(true);
    try {
      const data = await fetchLocationBarbers(managerLocationId);
      setBarbers(data);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar os barbeiros.");
      setBarbers([]);
    } finally {
      setLoading(false);
    }
  }, [managerLocationId]);

  useEffect(() => {
    void loadBarbers();
  }, [loadBarbers]);

  if (!managerLocationId) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border border-border bg-card p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Sua conta de gerente não está vinculada a um ponto físico. Fale com o dono da organização.
          </p>
        </div>
      </div>
    );
  }

  const organizationId = (barber as any)?.organization_id ?? null;
  const inviteLink = organizationId
    ? `${window.location.origin}/barber/auth?org=${organizationId}`
    : null;

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Barbeiros</h1>
          <p className="text-sm text-muted-foreground">
            Barbeiros com reservas neste ponto físico.
          </p>
        </div>

        <div className="flex gap-2">
          {managerPermissions?.can_invite_barbers && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2"
              onClick={handleCopyLink}
              disabled={!inviteLink}
              title={!inviteLink ? "Organização não identificada" : undefined}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar link de convite
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => void loadBarbers()}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando barbeiros...</p>
        </div>
      ) : barbers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nenhum barbeiro encontrado</p>
          <p className="text-xs text-muted-foreground">
            Nenhum barbeiro fez reservas neste ponto físico ainda.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {barbers.map((b) => (
            <div
              key={b.id}
              className="rounded-3xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-semibold text-foreground">{b.full_name}</p>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{b.email ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{b.phone ?? "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
