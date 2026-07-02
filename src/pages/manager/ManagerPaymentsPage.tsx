import { useCallback, useEffect, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, AlertTriangle, Banknote, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchLocationPayments,
  registerManualPayment,
  type ManagerPaymentRow,
} from "@/services/managerData";

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

const methodLabel: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  card: "Cartão",
};

export default function ManagerPaymentsPage() {
  const { managerLocationId } = useBarberProfile();
  const [payments, setPayments] = useState<ManagerPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<ManagerPaymentRow | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [registering, setRegistering] = useState(false);

  const loadPayments = useCallback(async () => {
    if (!managerLocationId) return;
    setLoading(true);
    try {
      const data = await fetchLocationPayments(managerLocationId);
      setPayments(data);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar as cobranças.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [managerLocationId]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const openRegisterDialog = (payment: ManagerPaymentRow) => {
    setSelectedPayment(payment);
    setSelectedMethod("");
    setDialogOpen(true);
  };

  const handleRegister = async () => {
    if (!selectedPayment || !selectedMethod) return;
    setRegistering(true);
    try {
      await registerManualPayment(selectedPayment.id, selectedMethod);
      toast.success("Pagamento registrado com sucesso.");
      setDialogOpen(false);
      setSelectedPayment(null);
      await loadPayments();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar pagamento.");
    } finally {
      setRegistering(false);
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

  const pending = payments.filter((p) => p.status === "pending");
  const paid = payments.filter((p) => p.status === "paid");
  const now = new Date();

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Cobranças</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os pagamentos de cadeiras do seu ponto físico.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void loadPayments()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando cobranças...</p>
        </div>
      ) : (
        <>
          {/* Pendentes */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-semibold text-foreground">
                Pendentes {pending.length > 0 ? `(${pending.length})` : ""}
              </h2>
            </div>

            {pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-3xl border border-dashed border-border">
                <Banknote className="mb-2 h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhum pagamento pendente.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pending.map((payment) => {
                  const isOverdue =
                    payment.due_date !== null && new Date(payment.due_date) < now;

                  return (
                    <div
                      key={payment.id}
                      className={cn(
                        "rounded-3xl border bg-card p-5 shadow-sm",
                        isOverdue ? "border-rose-300" : "border-border"
                      )}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {payment.barber_full_name ?? "Barbeiro"}
                            </p>
                            {payment.chair_identifier && (
                              <span className="text-xs text-muted-foreground">
                                · Cadeira {payment.chair_identifier}
                              </span>
                            )}
                            {isOverdue && (
                              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
                                Em atraso
                              </span>
                            )}
                          </div>
                          <p className="text-lg font-bold text-foreground">
                            {formatBRL(payment.amount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Vencimento: {formatDate(payment.due_date)}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          className="rounded-xl shrink-0"
                          onClick={() => openRegisterDialog(payment)}
                        >
                          Registrar recebimento
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Histórico */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <h2 className="text-base font-semibold text-foreground">
                Histórico {paid.length > 0 ? `(${paid.length})` : ""}
              </h2>
            </div>

            {paid.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-3xl border border-dashed border-border">
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
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
                          Valor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Método
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Data do pagamento
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Referência
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paid.map((payment) => (
                        <tr key={payment.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {payment.barber_full_name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {formatBRL(payment.amount)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {payment.payment_method
                              ? (methodLabel[payment.payment_method] ?? payment.payment_method)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(payment.paid_at)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {payment.reference ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Dialog: Registrar recebimento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {selectedPayment.barber_full_name ?? "Barbeiro"}
                </p>
                <p className="text-lg font-bold text-foreground">
                  {formatBRL(selectedPayment.amount)}
                </p>
                {selectedPayment.chair_identifier && (
                  <p className="text-xs text-muted-foreground">
                    Cadeira {selectedPayment.chair_identifier}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Método de pagamento
                </label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecione o método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setDialogOpen(false)}
              disabled={registering}
            >
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => void handleRegister()}
              disabled={!selectedMethod || registering}
            >
              {registering ? "Registrando..." : "Confirmar recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
