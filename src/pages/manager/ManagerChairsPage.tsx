import { useCallback, useEffect, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import LocationWaitlistSection from "@/components/LocationWaitlistSection";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Armchair, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchLocationChairs, updateChairStatus } from "@/services/managerData";

type ChairRow = {
  id: string;
  identifier: string | null;
  status: string | null;
};

const statusBadge: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  occupied: "bg-amber-100 text-amber-700 border border-amber-200",
  maintenance: "bg-rose-100 text-rose-700 border border-rose-200",
};

const statusLabel: Record<string, string> = {
  available: "Disponível",
  occupied: "Ocupada",
  maintenance: "Manutenção",
};

export default function ManagerChairsPage() {
  const { managerLocationId, managerPermissions } = useBarberProfile();
  const [chairs, setChairs] = useState<ChairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadChairs = useCallback(async () => {
    if (!managerLocationId) return;
    setLoading(true);
    try {
      const data = await fetchLocationChairs(managerLocationId);
      setChairs(
        (data as any[]).map((row) => ({
          id: row.id,
          identifier: row.identifier ?? null,
          status: row.status ?? null,
        }))
      );
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar as cadeiras.");
      setChairs([]);
    } finally {
      setLoading(false);
    }
  }, [managerLocationId]);

  useEffect(() => {
    void loadChairs();
  }, [loadChairs]);

  const handleStatusChange = async (chairId: string, newStatus: string) => {
    setUpdatingId(chairId);
    try {
      await updateChairStatus(chairId, newStatus);
      toast.success("Status da cadeira atualizado.");
      setChairs((prev) =>
        prev.map((c) => (c.id === chairId ? { ...c, status: newStatus } : c))
      );
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status da cadeira.");
    } finally {
      setUpdatingId(null);
    }
  };

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

  const canEdit = Boolean(managerPermissions?.can_edit_chairs);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Cadeiras</h1>
          <p className="text-sm text-muted-foreground">
            Cadeiras deste ponto físico.{" "}
            {!canEdit && (
              <span className="text-muted-foreground/70">(somente leitura)</span>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void loadChairs()}
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando cadeiras...</p>
        </div>
      ) : chairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Armchair className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nenhuma cadeira encontrada</p>
          <p className="text-xs text-muted-foreground">
            Este ponto físico ainda não possui cadeiras cadastradas.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {chairs.map((chair) => {
            const currentStatus = chair.status ?? "available";
            return (
              <div
                key={chair.id}
                className="rounded-3xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Armchair className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {chair.identifier
                          ? `Cadeira ${chair.identifier}`
                          : "Cadeira sem identificador"}
                      </p>
                      <span
                        className={cn(
                          "mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          statusBadge[currentStatus] ??
                            "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {statusLabel[currentStatus] ?? currentStatus}
                      </span>
                    </div>
                  </div>

                  {canEdit ? (
                    <Select
                      value={currentStatus}
                      onValueChange={(val) => void handleStatusChange(chair.id, val)}
                      disabled={updatingId === chair.id}
                    >
                      <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Disponível</SelectItem>
                        <SelectItem value="occupied">Ocupada</SelectItem>
                        <SelectItem value="maintenance">Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {statusLabel[currentStatus] ?? currentStatus}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {managerLocationId && <LocationWaitlistSection locationId={managerLocationId} />}
    </div>
  );
}
