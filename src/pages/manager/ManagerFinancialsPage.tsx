import { useCallback, useEffect, useMemo, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Clock,
  AlertCircle,
  FileText,
  Banknote,
} from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchLocationPayments,
  fetchLocationContracts,
  type ManagerPaymentRow,
} from "@/services/managerData";

type Period = "today" | "week" | "month";

const periodLabel: Record<Period, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
};

const methodLabel: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  card: "Cartão",
};

const formatBRL = (amount: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
};

function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;
  if (period === "today") from = startOfDay(now);
  else if (period === "week") from = startOfWeek(now, { locale: ptBR });
  else from = startOfMonth(now);
  return { from, to: endOfDay(now) };
}

function isInPeriod(dateStr: string | null, range: { from: Date; to: Date }): boolean {
  if (!dateStr) return false;
  try {
    return isWithinInterval(new Date(dateStr), range);
  } catch {
    return false;
  }
}

export default function ManagerFinancialsPage() {
  const { managerLocationId } = useBarberProfile();
  const [payments, setPayments] = useState<ManagerPaymentRow[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");

  const loadData = useCallback(async () => {
    if (!managerLocationId) return;
    setLoading(true);
    try {
      const [paymentsData, contractsData] = await Promise.all([
        fetchLocationPayments(managerLocationId),
        fetchLocationContracts(managerLocationId),
      ]);
      setPayments(paymentsData);
      setContracts(contractsData);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar os dados financeiros.");
      setPayments([]);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [managerLocationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Summary cards — always computed over the full dataset (not period-filtered)
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfDay(now);

  const receivedThisMonth = useMemo(
    () =>
      payments
        .filter(
          (p) =>
            p.status === "paid" &&
            p.paid_at !== null &&
            isWithinInterval(new Date(p.paid_at), { start: currentMonthStart, end: currentMonthEnd })
        )
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const pendingTotal = useMemo(
    () =>
      payments
        .filter((p) => p.status === "pending")
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const overdueTotal = useMemo(
    () =>
      payments
        .filter(
          (p) =>
            p.status === "pending" &&
            p.due_date !== null &&
            new Date(p.due_date) < now
        )
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const activeContractsCount = useMemo(
    () => contracts.filter((c) => c.status === "active").length,
    [contracts]
  );

  // Period-filtered payments for the table
  const periodRange = useMemo(() => getPeriodRange(period), [period]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (p.status === "paid") return isInPeriod(p.paid_at, periodRange);
      if (p.status === "pending") return isInPeriod(p.due_date, periodRange);
      return false;
    });
  }, [payments, periodRange]);

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
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Resumo financeiro do seu ponto físico.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Receita recebida no mês */}
        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">Receita recebida no mês</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatBRL(receivedThisMonth)}</p>
        </div>

        {/* Receita pendente */}
        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">Receita pendente</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{formatBRL(pendingTotal)}</p>
        </div>

        {/* Em atraso */}
        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-100">
              <AlertCircle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">Em atraso</p>
          </div>
          <p className="text-2xl font-bold text-rose-600">{formatBRL(overdueTotal)}</p>
        </div>

        {/* Contratos ativos */}
        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">Contratos ativos</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">{activeContractsCount}</p>
        </div>
      </div>

      {/* Period filter + payments table */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-foreground">Pagamentos</h2>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Carregando dados financeiros...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center rounded-3xl border border-dashed border-border">
            <Banknote className="mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum pagamento em {periodLabel[period].toLowerCase()}.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Barbeiro
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cadeira
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Valor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Vencimento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pago em
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Método
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPayments.map((payment) => {
                    const isOverdue =
                      payment.status === "pending" &&
                      payment.due_date !== null &&
                      new Date(payment.due_date) < now;

                    return (
                      <tr key={payment.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {payment.barber_full_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {payment.chair_identifier ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {formatBRL(payment.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {payment.status === "paid" ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                              Pago
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
                              Em atraso
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(payment.due_date)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(payment.paid_at)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {payment.payment_method
                            ? (methodLabel[payment.payment_method] ?? payment.payment_method)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
