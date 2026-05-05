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
import {
  DollarSign,
  Users,
  Scissors,
  TrendingUp,
  RefreshCw,
  Star,
  BarChart3,
} from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, endOfDay, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type Period = "today" | "week" | "month";

type BarberStats = {
  barber_id: string;
  full_name: string;
  attendances: number;
  total_revenue: number;
  total_commission: number;
};

type HourStats = { hour: number; count: number };

type ContractStats = {
  active: number;
  total_revenue: number;
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

export default function OwnerDashboardPage() {
  const { organization } = useOrganization();

  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  const [barberStats, setBarberStats] = useState<BarberStats[]>([]);
  const [hourStats, setHourStats] = useState<HourStats[]>([]);
  const [contractStats, setContractStats] = useState<ContractStats>({ active: 0, total_revenue: 0 });
  const [totalCheckIns, setTotalCheckIns] = useState(0);

  async function loadData() {
    if (!organization?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const range = getPeriodRange(period);

    try {
      const [contractsRes, checkInsRes, barbersRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("id, status, price, barber_id")
          .eq("organization_id", organization.id)
          .in("status", ["active", "pending"]),

        supabase
          .from("check_ins")
          .select("id, barber_profile_id, service_amount, commission_amount, finished_at, started_at")
          .eq("organization_id", organization.id)
          .not("finished_at", "is", null)
          .gte("finished_at", range.from)
          .lte("finished_at", range.to),

        supabase
          .from("barbers")
          .select("id, full_name, barber_profile_id")
          .eq("organization_id", organization.id),
      ]);

      if (contractsRes.error) throw contractsRes.error;
      if (checkInsRes.error) throw checkInsRes.error;
      if (barbersRes.error) throw barbersRes.error;

      const contracts = contractsRes.data ?? [];
      const checkIns = checkInsRes.data ?? [];
      const barbers = (barbersRes.data ?? []) as { id: string; full_name: string; barber_profile_id: string | null }[];

      // Contract stats
      const activeContracts = contracts.filter((c) => c.status === "active");
      const totalContractRevenue = contracts.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
      setContractStats({ active: activeContracts.length, total_revenue: totalContractRevenue });

      // Check-in stats
      setTotalCheckIns(checkIns.length);

      // Barber rankings — map barber_profile_id to barber
      const profileToBarber = new Map<string, { id: string; full_name: string }>();
      for (const b of barbers) {
        if (b.barber_profile_id) profileToBarber.set(b.barber_profile_id, { id: b.id, full_name: b.full_name });
      }

      const rankMap = new Map<string, BarberStats>();
      for (const ci of checkIns) {
        const barber = ci.barber_profile_id ? profileToBarber.get(ci.barber_profile_id) : null;
        if (!barber) continue;

        const existing = rankMap.get(barber.id) ?? {
          barber_id: barber.id,
          full_name: barber.full_name,
          attendances: 0,
          total_revenue: 0,
          total_commission: 0,
        };

        existing.attendances += 1;
        existing.total_revenue += Number(ci.service_amount) || 0;
        existing.total_commission += Number(ci.commission_amount) || 0;
        rankMap.set(barber.id, existing);
      }

      setBarberStats(
        Array.from(rankMap.values()).sort((a, b) => b.attendances - a.attendances)
      );

      // Hour stats (peak hours)
      const hourMap = new Map<number, number>();
      for (const ci of checkIns) {
        if (!ci.started_at) continue;
        const hour = new Date(ci.started_at).getHours();
        hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
      }

      const hours: HourStats[] = Array.from(hourMap.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setHourStats(hours);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [organization?.id, period]);

  const totalRevenue = useMemo(() => barberStats.reduce((s, b) => s + b.total_revenue, 0), [barberStats]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da operação — {organization?.name}
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

      {/* KPI Cards */}
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
              <Scissors className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Atendimentos</p>
              <p className="text-2xl font-bold">{totalCheckIns}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contratos ativos</p>
              <p className="text-2xl font-bold">{contractStats.active}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Barbeiros ativos</p>
              <p className="text-2xl font-bold">{barberStats.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ranking de barbeiros */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-amber-500" />
              Ranking de barbeiros — {periodLabel[period]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : barberStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atendimento finalizado no período.</p>
            ) : (
              <div className="space-y-3">
                {barberStats.map((b, idx) => (
                  <div key={b.barber_id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{b.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.attendances} atendimento{b.attendances !== 1 ? "s" : ""} · {formatCurrency(b.total_revenue)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(b.total_commission)}</p>
                      <p className="text-xs text-muted-foreground">comissão</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Horários de pico */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Horários de pico — {periodLabel[period]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : hourStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atendimento com horário registrado.</p>
            ) : (
              <div className="space-y-3">
                {hourStats.map((h) => {
                  const pct = hourStats[0].count > 0 ? Math.round((h.count / hourStats[0].count) * 100) : 0;
                  return (
                    <div key={h.hour} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{String(h.hour).padStart(2, "0")}:00 – {String(h.hour + 1).padStart(2, "0")}:00</span>
                        <span className="text-muted-foreground">{h.count} atend.</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Receita por barbeiro */}
        <Card className="rounded-2xl shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Receita por barbeiro — {periodLabel[period]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : barberStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-3 pr-4">Barbeiro</th>
                      <th className="pb-3 pr-4">Atendimentos</th>
                      <th className="pb-3 pr-4">Receita</th>
                      <th className="pb-3">Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {barberStats.map((b) => (
                      <tr key={b.barber_id}>
                        <td className="py-3 pr-4 font-medium">{b.full_name}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{b.attendances}</td>
                        <td className="py-3 pr-4 font-semibold">{formatCurrency(b.total_revenue)}</td>
                        <td className="py-3 font-semibold text-emerald-600">{formatCurrency(b.total_commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="pt-3 pr-4">Total</td>
                      <td className="pt-3 pr-4">{totalCheckIns}</td>
                      <td className="pt-3 pr-4">{formatCurrency(totalRevenue)}</td>
                      <td className="pt-3">{formatCurrency(barberStats.reduce((s, b) => s + b.total_commission, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
