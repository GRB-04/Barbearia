import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, RefreshCw, Download, FileText } from "lucide-react";
import { format, startOfWeek, startOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type Period = "today" | "week" | "month";

type ContractReport = {
  id: string;
  barber_name: string;
  chair_identifier: string;
  location_name: string;
  start_at: string | null;
  end_at: string | null;
  price: number;
  billing_cycle: string | null;
  status: string;
  cancellation_fee: number | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getPeriodRange(period: Period) {
  const now = new Date();
  let from: Date;
  if (period === "today") from = startOfDay(now);
  else if (period === "week") from = startOfWeek(now, { locale: ptBR });
  else from = startOfMonth(now);
  return { from: from.toISOString(), to: endOfDay(now).toISOString() };
}

const periodLabel: Record<Period, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  ended: "Encerrado",
  cancelled: "Cancelado",
};

const billingLabel: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

export default function FinancialReportPage() {
  const { organization } = useOrganization();
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractReport[]>([]);

  async function loadData() {
    if (!organization?.id) { setLoading(false); return; }

    setLoading(true);
    const range = getPeriodRange(period);

    try {
      const { data: contractsData, error: contractsError } = await supabase
        .from("contracts")
        .select("id, price, billing_cycle, status, start_at, end_at, cancellation_fee, barber_profile_id, chair_id")
        .eq("organization_id", organization.id)
        .gte("start_at", range.from)
        .lte("start_at", range.to)
        .order("start_at", { ascending: false });

      if (contractsError) throw contractsError;

      const raw = contractsData ?? [];

      // Fetch related data
      const barberIds = [...new Set(raw.map((c) => c.barber_profile_id).filter(Boolean))];
      const chairIds = [...new Set(raw.map((c) => c.chair_id).filter(Boolean))];

      const [barbersRes, chairsRes] = await Promise.all([
        barberIds.length > 0
          ? supabase.from("organization_barbers").select("barber_profile_id, full_name").in("barber_profile_id", barberIds)
          : { data: [], error: null },
        chairIds.length > 0
          ? supabase.from("chairs").select("id, identifier, location_id").in("id", chairIds)
          : { data: [], error: null },
      ]);

      const barberMap = new Map((barbersRes.data ?? []).map((b: any) => [b.barber_profile_id, b.full_name]));
      const chairMap = new Map((chairsRes.data ?? []).map((c: any) => [c.id, c]));

      const locationIds = [...new Set((chairsRes.data ?? []).map((c: any) => c.location_id).filter(Boolean))];
      const { data: locData } = locationIds.length > 0
        ? await supabase.from("locations").select("id, name").in("id", locationIds)
        : { data: [] };

      const locationMap = new Map((locData ?? []).map((l: any) => [l.id, l.name]));

      const enriched: ContractReport[] = raw.map((c) => {
        const chair = chairMap.get(c.chair_id);
        return {
          id: c.id,
          barber_name: barberMap.get(c.barber_profile_id) ?? "—",
          chair_identifier: chair?.identifier ?? "—",
          location_name: chair ? (locationMap.get(chair.location_id) ?? "—") : "—",
          start_at: c.start_at,
          end_at: c.end_at,
          price: Number(c.price) || 0,
          billing_cycle: c.billing_cycle,
          status: c.status,
          cancellation_fee: c.cancellation_fee ? Number(c.cancellation_fee) : null,
        };
      });

      setContracts(enriched);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar relatório.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [organization?.id, period]);

  const totalRevenue = useMemo(() => contracts.filter((c) => c.status !== "cancelled").reduce((s, c) => s + c.price, 0), [contracts]);
  const totalFees = useMemo(() => contracts.reduce((s, c) => s + (c.cancellation_fee ?? 0), 0), [contracts]);

  function exportCSV() {
    const headers = ["ID", "Barbeiro", "Cadeira", "Local", "Início", "Fim", "Valor", "Ciclo", "Status", "Multa"];
    const rows = contracts.map((c) => [
      c.id,
      c.barber_name,
      c.chair_identifier,
      c.location_name,
      c.start_at ? format(new Date(c.start_at), "dd/MM/yyyy HH:mm") : "",
      c.end_at ? format(new Date(c.end_at), "dd/MM/yyyy HH:mm") : "",
      c.price.toFixed(2).replace(".", ","),
      billingLabel[c.billing_cycle ?? "daily"] ?? c.billing_cycle,
      statusLabel[c.status] ?? c.status,
      (c.cancellation_fee ?? 0).toFixed(2).replace(".", ","),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-financeiro-${period}-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado com sucesso!");
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatório Financeiro</h1>
          <p className="text-sm text-muted-foreground">Contratos e receita por período — {organization?.name}</p>
        </div>

        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={exportCSV} disabled={loading || contracts.length === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Receita ({periodLabel[period]})</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contratos</p>
              <p className="text-2xl font-bold">{contracts.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100">
              <DollarSign className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Multas arrecadadas</p>
              <p className="text-2xl font-bold text-rose-600">{formatCurrency(totalFees)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Contratos — {periodLabel[period]}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhum contrato no período selecionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4">Barbeiro</th>
                    <th className="pb-3 pr-4">Cadeira</th>
                    <th className="pb-3 pr-4">Local</th>
                    <th className="pb-3 pr-4">Período</th>
                    <th className="pb-3 pr-4">Valor</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Multa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 pr-4 font-medium">{c.barber_name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{c.chair_identifier}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{c.location_name}</td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">
                        {c.start_at ? format(new Date(c.start_at), "dd/MM HH:mm") : "—"}
                        {" → "}
                        {c.end_at ? format(new Date(c.end_at), "dd/MM HH:mm") : "—"}
                      </td>
                      <td className="py-3 pr-4 font-semibold">{formatCurrency(c.price)}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.status === "active" ? "bg-emerald-100 text-emerald-700" :
                          c.status === "cancelled" ? "bg-rose-100 text-rose-700" :
                          c.status === "ended" ? "bg-muted text-muted-foreground" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {statusLabel[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="py-3">
                        {c.cancellation_fee ? <span className="text-rose-600 font-medium">{formatCurrency(c.cancellation_fee)}</span> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="pt-3" colSpan={4}>Total</td>
                    <td className="pt-3">{formatCurrency(totalRevenue)}</td>
                    <td className="pt-3"></td>
                    <td className="pt-3 text-rose-600">{formatCurrency(totalFees)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
