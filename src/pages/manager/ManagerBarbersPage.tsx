import { useCallback, useEffect, useMemo, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, Mail, Phone, RefreshCw, User, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchOrgBarbersForManager, type ManagerBarberRow } from "@/services/managerData";
import { cn } from "@/lib/utils";

export default function ManagerBarbersPage() {
  const { managerLocationId, managerPermissions, barber } = useBarberProfile();
  const [barbers, setBarbers] = useState<ManagerBarberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active">("all");

  const organizationId = (barber as any)?.organization_id ?? null;

  const loadBarbers = useCallback(async () => {
    if (!managerLocationId || !organizationId) return;
    setLoading(true);
    try {
      const data = await fetchOrgBarbersForManager(organizationId, managerLocationId);
      setBarbers(data);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar os barbeiros.");
      setBarbers([]);
    } finally {
      setLoading(false);
    }
  }, [managerLocationId, organizationId]);

  useEffect(() => {
    void loadBarbers();
  }, [loadBarbers]);

  const visibleBarbers = useMemo(
    () => (filter === "active" ? barbers.filter((b) => b.is_active) : barbers),
    [barbers, filter]
  );

  const activeCount = useMemo(() => barbers.filter((b) => b.is_active).length, [barbers]);

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
            Barbeiros da organização. "Ativos" têm reserva ou contrato neste ponto físico.
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

      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          className="rounded-xl"
          onClick={() => setFilter("all")}
        >
          Todos ({barbers.length})
        </Button>
        <Button
          variant={filter === "active" ? "default" : "outline"}
          size="sm"
          className="rounded-xl"
          onClick={() => setFilter("active")}
        >
          Ativos ({activeCount})
        </Button>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando barbeiros...</p>
        </div>
      ) : visibleBarbers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nenhum barbeiro encontrado</p>
          <p className="text-xs text-muted-foreground">
            {filter === "active"
              ? "Nenhum barbeiro ativo neste ponto físico ainda."
              : "Nenhum barbeiro vinculado à organização ainda."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleBarbers.map((b) => (
            <div
              key={b.id}
              className="rounded-3xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{b.full_name}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        b.is_active
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {b.is_active ? "Ativo no ponto" : "Sem atividade"}
                    </span>
                  </div>
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
