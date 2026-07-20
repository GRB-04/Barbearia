import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, DollarSign, Scissors, RefreshCw, Star } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatCurrency, getPeriodRange, type Period } from "@/lib/financial";

type CheckInRow = {
  id: string;
  service_amount: number;
  commission_amount: number;
  commission_type: string | null;
  checked_in_at: string | null;
  finished_at: string | null;
  started_at: string | null;
  duration_minutes: number | null;
  client_id: string;
  created_at: string | null;
};

type BarberClient = { id: string; full_name: string };


export default function EarningsPage() {
  const { barberProfile, barber, loading: barberLoading } = useBarberProfile();

  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [clients, setClients] = useState<BarberClient[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  async function loadData() {
    if (!barberProfile?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const range = getPeriodRange(period);

    try {
      const [checkInsRes, clientsRes] = await Promise.all([
        supabase
          .from("check_ins")
          .select("id, service_amount, commission_amount, commission_type, checked_in_at, finished_at, started_at, duration_minutes, client_id, created_at")
          .eq("barber_profile_id", barberProfile.id)
          .not("finished_at", "is", null)
          .gte("finished_at", range.from)
          .lte("finished_at", range.to)
          .order("finished_at", { ascending: false }),

        supabase
          .from("barber_clients")
          .select("id, full_name")
          .eq("barber_profile_id", barberProfile.id),
      ]);

      if (checkInsRes.error) throw checkInsRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setCheckIns((checkInsRes.data as CheckInRow[]) ?? []);
      setClients((clientsRes.data as BarberClient[]) ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar ganhos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberProfile?.id, period]);

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) map.set(c.id, c.full_name);
    return map;
  }, [clients]);

  const totalServices = checkIns.length;
  const totalRevenue = useMemo(() => checkIns.reduce((sum, c) => sum + (c.service_amount ?? 0), 0), [checkIns]);
  const totalCommission = useMemo(() => checkIns.reduce((sum, c) => sum + (c.commission_amount ?? 0), 0), [checkIns]);
  const avgDuration = useMemo(() => {
    const withDuration = checkIns.filter((c) => c.duration_minutes);
    if (!withDuration.length) return 0;
    return Math.round(withDuration.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0) / withDuration.length);
  }, [checkIns]);

  const periodLabel: Record<Period, string> = {
    today: "Hoje",
    week: "Esta semana",
    month: "Este mês",
  };

  if (barberLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!barberProfile) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Perfil não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Meus Ganhos</h1>
          <p className="text-sm text-muted-foreground">
            Extrato de faturamento e comissões — {barber?.full_name ?? barberProfile.full_name}
          </p>
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

          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sua comissão</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalCommission)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Scissors className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Atendimentos</p>
              <p className="text-2xl font-bold">{totalServices}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
              <Star className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Duração média</p>
              <p className="text-2xl font-bold">{avgDuration > 0 ? `${avgDuration}min` : "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Extrato de atendimentos — {periodLabel[period]}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : checkIns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <DollarSign className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhum atendimento finalizado {periodLabel[period].toLowerCase()}.</p>
              <p className="text-xs text-muted-foreground">Finalize atendimentos na tela de Check-in para ver o extrato aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4">Cliente</th>
                    <th className="pb-3 pr-4">Data</th>
                    <th className="pb-3 pr-4">Duração</th>
                    <th className="pb-3 pr-4">Serviço</th>
                    <th className="pb-3">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {checkIns.map((c) => (
                    <tr key={c.id} className="py-2">
                      <td className="py-3 pr-4 font-medium">{clientMap.get(c.client_id) ?? "Cliente"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {c.finished_at ? format(new Date(c.finished_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {c.duration_minutes ? `${c.duration_minutes}min` : "—"}
                      </td>
                      <td className="py-3 pr-4 font-medium text-foreground">{formatCurrency(c.service_amount ?? 0)}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          {formatCurrency(c.commission_amount ?? 0)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="pt-3 pr-4" colSpan={3}>Total</td>
                    <td className="pt-3 pr-4 text-foreground">{formatCurrency(totalRevenue)}</td>
                    <td className="pt-3 text-emerald-600">{formatCurrency(totalCommission)}</td>
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
