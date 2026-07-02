import { useCallback, useEffect, useMemo, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarDays, FileText, RefreshCw, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchLocationContracts } from "@/services/managerData";

type ContractRow = {
  id: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  price: number | null;
  billing_cycle: string | null;
  notes: string | null;
  chair_identifier: string | null;
  barber_full_name: string | null;
};

const statusBadge: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border border-amber-200",
  ended: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
  voided: "bg-rose-50 text-rose-400 border border-rose-100",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  ended: "Encerrado",
  cancelled: "Cancelado",
  voided: "Anulado",
};

const statusGroups = [
  { key: "active", label: "Ativos" },
  { key: "pending", label: "Pendentes" },
  { key: "ended", label: "Encerrados" },
];

export default function ManagerContractsPage() {
  const { managerLocationId } = useBarberProfile();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadContracts = useCallback(async () => {
    if (!managerLocationId) return;
    setLoading(true);
    try {
      const raw = await fetchLocationContracts(managerLocationId);
      setContracts(
        raw.map((row: any) => ({
          id: row.id,
          status: row.status,
          start_at: row.start_at,
          end_at: row.end_at,
          price: row.price,
          billing_cycle: row.billing_cycle,
          notes: row.notes,
          chair_identifier: row.chairs?.identifier ?? null,
          barber_full_name: row.barber_profiles?.full_name ?? null,
        }))
      );
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar os contratos.");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [managerLocationId]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const grouped = useMemo(() => {
    const map: Record<string, ContractRow[]> = { active: [], pending: [], ended: [] };
    for (const c of contracts) {
      if (map[c.status]) map[c.status].push(c);
      else map["ended"].push(c); // fallback for cancelled/voided
    }
    return map;
  }, [contracts]);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Contratos</h1>
          <p className="text-sm text-muted-foreground">
            Contratos de cadeiras deste ponto físico (somente leitura).
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void loadContracts()}
          disabled={loading}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {statusGroups.map((g) => (
          <div key={g.key} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{g.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {grouped[g.key]?.length ?? 0}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando contratos...</p>
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nenhum contrato encontrado</p>
          <p className="text-xs text-muted-foreground">
            Contratos são criados quando uma reserva é confirmada.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {statusGroups.map((g) => {
            const items = grouped[g.key] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {g.label}
                </h2>
                <div className="grid gap-4">
                  {items.map((contract) => {
                    const startDate = contract.start_at ? new Date(contract.start_at) : null;
                    const endDate = contract.end_at ? new Date(contract.end_at) : null;

                    return (
                      <div
                        key={contract.id}
                        className="rounded-3xl border border-border bg-card p-5 shadow-sm"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {contract.chair_identifier
                                ? `Cadeira ${contract.chair_identifier}`
                                : "Cadeira"}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                                statusBadge[contract.status] ??
                                  "bg-muted text-muted-foreground border border-border"
                              )}
                            >
                              {statusLabel[contract.status] ?? contract.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>{contract.barber_full_name ?? "Barbeiro"}</span>
                          </div>

                          <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                            <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Período
                              </p>
                              <p className="text-sm font-medium text-foreground">
                                {startDate
                                  ? format(startDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                                  : "—"}
                                {" → "}
                                {endDate
                                  ? format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                                  : "—"}
                              </p>
                            </div>
                          </div>

                          {contract.price != null && (
                            <p className="text-sm text-muted-foreground">
                              Valor:{" "}
                              <span className="font-medium text-foreground">
                                {contract.price.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                                {contract.billing_cycle ? ` / ${contract.billing_cycle}` : ""}
                              </span>
                            </p>
                          )}

                          {contract.notes && (
                            <p className="text-xs text-muted-foreground">{contract.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
