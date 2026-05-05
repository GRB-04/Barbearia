import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, FileText, MapPin, Scissors, XCircle } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { getMyContracts, type MyContractListItem } from "@/services/contracts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

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
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "HH:mm");
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

// Multa de 50% se o contrato tiver sido criado há mais de 10 min (fora do cooldown)
const CANCELLATION_PENALTY_MINUTES = 10;
const CANCELLATION_FEE_PCT = 0.5;

export default function MyContractsPage() {
  const [contracts, setContracts] = useState<MyContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<MyContractListItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function loadContracts() {
    setLoading(true);
    try {
      const result = await getMyContracts();
      setContracts(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar seus contratos.";
      toast.error(message);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadContracts(); }, []);

  const activeCount = useMemo(() => contracts.filter((c) => c.status === "active").length, [contracts]);
  const pendingCount = useMemo(() => contracts.filter((c) => c.status === "pending").length, [contracts]);
  const endedCount = useMemo(() => contracts.filter((c) => c.status === "ended").length, [contracts]);
  const cancelledCount = useMemo(() => contracts.filter((c) => c.status === "cancelled").length, [contracts]);

  // Multa aplica se o contrato foi criado há mais de 10 min (cooldown de arrependimento expirou)
  const cancellationFine = useMemo(() => {
    if (!cancelTarget?.created_at) return 0;
    const minutesSinceCreation = differenceInMinutes(new Date(), new Date(cancelTarget.created_at));
    if (minutesSinceCreation > CANCELLATION_PENALTY_MINUTES) {
      return (cancelTarget.price ?? 0) * CANCELLATION_FEE_PCT;
    }
    return 0;
  }, [cancelTarget]);

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);

    try {
      const { error } = await supabase
        .from("contracts")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_fee: cancellationFine,
          cancellation_reason: "Cancelado pelo barbeiro via portal",
        } as any)
        .eq("id", cancelTarget.id);

      if (error) throw error;

      // Log to audit
      await supabase.from("audit_logs").insert({
        organization_id: cancelTarget.organization_id,
        action: "contract.cancelled",
        entity: "contracts",
        entity_id: cancelTarget.id,
        metadata: { fee: cancellationFine, reason: "Cancelado pelo barbeiro" },
      } as any);

      toast.success("Contrato cancelado.");
      setCancelTarget(null);
      await loadContracts();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao cancelar contrato.");
    } finally {
      setCancelling(false);
    }
  }

  const canCancel = (contract: MyContractListItem) =>
    contract.status === "active" || contract.status === "pending";

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Meus contratos</h1>
        <p className="text-sm text-muted-foreground">
          Veja suas cadeiras vinculadas, períodos contratados e situação atual.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Ativos", value: activeCount },
          { label: "Pendentes", value: pendingCount },
          { label: "Encerrados", value: endedCount },
          { label: "Cancelados", value: cancelledCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando seus contratos...</p>
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-sm">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Você ainda não possui contratos.</p>
          <p className="text-xs text-muted-foreground">Quando um owner vincular uma cadeira a você, ela aparecerá aqui.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {contracts.map((contract) => {
            const chairName = contract.chair_identifier ? `Cadeira ${contract.chair_identifier}` : "Cadeira";
            return (
              <div key={contract.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{chairName}</p>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", statusBadge[contract.status] ?? "bg-muted text-muted-foreground border border-border")}>
                        {statusLabel[contract.status] ?? contract.status}
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
                        <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Período</p>
                          <p className="text-sm font-medium text-foreground">
                            {formatDate(contract.start_at)}{" → "}{formatDate(contract.end_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
                        <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horário</p>
                          <p className="text-sm font-medium text-foreground">
                            {formatTime(contract.start_at)} → {formatTime(contract.end_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Scissors className="mt-0.5 h-4 w-4" />
                      <span>{formatPrice(contract.price)} / {billingCycleLabel[contract.billing_cycle ?? "daily"] ?? contract.billing_cycle ?? "Diário"}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4" />
                      <span>{contract.location_name ?? "Unidade não identificada"}</span>
                    </div>

                    {contract.notes ? <p className="text-xs text-muted-foreground">{contract.notes}</p> : null}
                  </div>

                  {canCancel(contract) && (
                    <div className="shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-xl"
                        onClick={() => setCancelTarget(contract)}
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar contrato
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar contrato</DialogTitle>
            <DialogDescription>
              Você está prestes a cancelar o contrato da cadeira{" "}
              <strong>{cancelTarget?.chair_identifier ?? ""}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {cancellationFine > 0 ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <p className="font-semibold">⚠️ Multa de cancelamento aplicável</p>
                <p className="mt-1">
                  O contrato começa em menos de {CANCELLATION_PENALTY_MINUTES} minutos. Uma multa de{" "}
                  <strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cancellationFine)}</strong>{" "}
                  (50% do valor) será registrada.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <p>✅ Cancelamento sem multa — feito com antecedência suficiente.</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelling}
            >
              {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}