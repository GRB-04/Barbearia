import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, FileText, MapPin, Scissors } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { getMyContracts, type MyContractListItem } from "@/services/contracts";
import { cn } from "@/lib/utils";

const statusBadge: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border border-amber-200",
  ended: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  ended: "Encerrado",
  cancelled: "Cancelado",
};

const billingCycleLabel: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return format(date, "dd 'de' MMMM 'de' yyyy", {
    locale: ptBR,
  });
}

function formatTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return format(date, "HH:mm");
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "R$ 0,00";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export default function MyContractsPage() {
  const [contracts, setContracts] = useState<MyContractListItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadContracts() {
    setLoading(true);

    try {
      const result = await getMyContracts();
      setContracts(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao carregar seus contratos.";

      toast.error(message);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContracts();
  }, []);

  const activeCount = useMemo(
    () => contracts.filter((contract) => contract.status === "active").length,
    [contracts]
  );

  const pendingCount = useMemo(
    () => contracts.filter((contract) => contract.status === "pending").length,
    [contracts]
  );

  const endedCount = useMemo(
    () => contracts.filter((contract) => contract.status === "ended").length,
    [contracts]
  );

  const cancelledCount = useMemo(
    () => contracts.filter((contract) => contract.status === "cancelled").length,
    [contracts]
  );

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Meus contratos</h1>
        <p className="text-sm text-muted-foreground">
          Veja suas cadeiras vinculadas, períodos contratados e situação atual.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ativos
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {activeCount}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Pendentes
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {pendingCount}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Encerrados
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {endedCount}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Cancelados
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {cancelledCount}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Carregando seus contratos...
          </p>
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-sm">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Você ainda não possui contratos.
          </p>
          <p className="text-xs text-muted-foreground">
            Quando um owner vincular uma cadeira a você, ela aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {contracts.map((contract) => {
            const chairName = contract.chair_identifier
              ? `Cadeira ${contract.chair_identifier}`
              : "Cadeira";

            return (
              <div
                key={contract.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {chairName}
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

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
                        <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Período
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {formatDate(contract.start_at)}
                            {" → "}
                            {formatDate(contract.end_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
                        <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Horário
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {formatTime(contract.start_at)} →{" "}
                            {formatTime(contract.end_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Scissors className="mt-0.5 h-4 w-4" />
                      <span>
                        {formatPrice(contract.price)} /{" "}
                        {billingCycleLabel[contract.billing_cycle ?? "daily"] ??
                          contract.billing_cycle ??
                          "Diário"}
                      </span>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4" />
                      <span>{contract.location_name ?? "Unidade não identificada"}</span>
                    </div>

                    {contract.notes ? (
                      <p className="text-xs text-muted-foreground">{contract.notes}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}