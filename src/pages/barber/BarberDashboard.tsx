import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  Scissors,
  UserRound,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { startOfMonth, startOfDay, endOfDay } from "date-fns";

type BarberClient = {
  id: string;
  full_name: string;
  created_at: string;
};

type Contract = {
  id: string;
  status: string | null;
  created_at: string;
};

type CheckIn = {
  id: string;
  client_id: string;
  status: string;
  checked_in_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string | null;
};

type EnrichedCheckIn = CheckIn & {
  clientName: string;
};

type CachedDashboardData = {
  barberProfileId: string;
  clients: BarberClient[];
  contracts: Contract[];
  checkIns: CheckIn[];
  monthEarnings: number;
  todayEarnings: number;
};

const DASHBOARD_CACHE_KEY = "barber-dashboard-cache-v1";

export default function BarberDashboard() {
  const {
    barberProfile,
    barber,
    loading: barberLoading,
    refreshBarberProfile,
  } = useBarberProfile();

  const [clients, setClients] = useState<BarberClient[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [loading, setLoading] = useState(true);

  const initialLoadDoneRef = useRef(false);

  const saveCache = (
    nextClients: BarberClient[],
    nextContracts: Contract[],
    nextCheckIns: CheckIn[],
    nextMonthEarnings: number,
    nextTodayEarnings: number,
  ) => {
    if (!barberProfile?.id) return;

    const payload: CachedDashboardData = {
      barberProfileId: barberProfile.id,
      clients: nextClients,
      contracts: nextContracts,
      checkIns: nextCheckIns,
      monthEarnings: nextMonthEarnings,
      todayEarnings: nextTodayEarnings,
    };

    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  };

  const loadData = async (forceRefresh = false) => {
    if (!barberProfile || !barber) {
      setLoading(false);
      return;
    }

    if (!forceRefresh) {
      const cachedRaw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);

      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as CachedDashboardData;

          if (cached.barberProfileId === barberProfile.id) {
            setClients(cached.clients ?? []);
            setContracts(cached.contracts ?? []);
            setCheckIns(cached.checkIns ?? []);
            setMonthEarnings(cached.monthEarnings ?? 0);
            setTodayEarnings(cached.todayEarnings ?? 0);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.error("[BarberDashboard] cache parse error:", error);
        }
      }
    }

    setLoading(true);

    try {
      const [clientsResult, contractsResult, checkInsResult, earningsResult] = await Promise.all([
        supabase
          .from("barber_clients")
          .select("id, full_name, created_at")
          .eq("barber_profile_id", barberProfile.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("contracts")
          .select("id, status, created_at")
          .eq("barber_profile_id", barberProfile.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("check_ins")
          .select(
            "id, client_id, status, checked_in_at, started_at, finished_at, duration_minutes, notes, created_at"
          )
          .eq("barber_profile_id", barberProfile.id)
          .order("created_at", { ascending: false })
          .limit(8),

        // Month earnings
        supabase
          .from("check_ins")
          .select("commission_amount, service_amount, finished_at")
          .eq("barber_profile_id", barberProfile.id)
          .not("finished_at", "is", null)
          .gte("finished_at", startOfMonth(new Date()).toISOString()),
      ]);

      if (clientsResult.error) {
        console.error("[BarberDashboard] clients error:", clientsResult.error);
        toast.error(clientsResult.error.message || "Erro ao carregar clientes.");
      }

      if (contractsResult.error) {
        console.error("[BarberDashboard] contracts error:", contractsResult.error);
        toast.error(contractsResult.error.message || "Erro ao carregar contratos.");
      }

      if (checkInsResult.error) {
        console.error("[BarberDashboard] checkIns error:", checkInsResult.error);
        toast.error(checkInsResult.error.message || "Erro ao carregar atendimentos.");
      }

      const nextClients = (clientsResult.data as BarberClient[]) ?? [];
      const nextContracts = (contractsResult.data as Contract[]) ?? [];
      const nextCheckIns = (checkInsResult.data as CheckIn[]) ?? [];

      if (earningsResult.error) {
        console.error("[BarberDashboard] earnings error:", earningsResult.error);
        // Non-fatal: continue with 0 earnings
      }

      const earningsData = (earningsResult.data ?? []) as { commission_amount: number; service_amount: number; finished_at: string }[];
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      const nextMonthEarnings = earningsData.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
      const nextTodayEarnings = earningsData
        .filter((c) => c.finished_at >= todayStart && c.finished_at <= todayEnd)
        .reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);

      setClients(nextClients);
      setContracts(nextContracts);
      setCheckIns(nextCheckIns);
      setMonthEarnings(nextMonthEarnings);
      setTodayEarnings(nextTodayEarnings);

      saveCache(nextClients, nextContracts, nextCheckIns, nextMonthEarnings, nextTodayEarnings);
    } catch (error) {
      console.error("[BarberDashboard] unexpected load error:", error);
      toast.error("Erro inesperado ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!barberProfile?.id || !barber?.id) {
      setLoading(false);
      return;
    }
    if (initialLoadDoneRef.current) return;

    initialLoadDoneRef.current = true;
    void loadData(false);
  }, [barberProfile?.id, barber?.id]);

  const clientMap = useMemo(() => {
    const map = new Map<string, BarberClient>();
    for (const client of clients) {
      map.set(client.id, client);
    }
    return map;
  }, [clients]);

  const enrichedCheckIns = useMemo<EnrichedCheckIn[]>(() => {
    return checkIns.map((checkIn) => ({
      ...checkIn,
      clientName: clientMap.get(checkIn.client_id)?.full_name ?? "Cliente",
    }));
  }, [checkIns, clientMap]);

  const activeContractsCount = useMemo(
    () => contracts.filter((contract) => contract.status === "active").length,
    [contracts]
  );

  const attendedToday = useMemo(() => {
    const today = new Date();

    return enrichedCheckIns.filter((checkIn) => {
      const sourceDate = checkIn.checked_in_at ?? checkIn.created_at;
      if (!sourceDate) return false;

      const d = new Date(sourceDate);

      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [enrichedCheckIns]);

  const finishedToday = useMemo(() => {
    const today = new Date();

    return enrichedCheckIns.filter((checkIn) => {
      if (!checkIn.finished_at) return false;

      const d = new Date(checkIn.finished_at);

      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [enrichedCheckIns]);

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";

    return new Date(value).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const formatDuration = (checkIn: EnrichedCheckIn) => {
    if (checkIn.duration_minutes !== null) {
      return `${checkIn.duration_minutes}min`;
    }

    if (checkIn.started_at && checkIn.finished_at) {
      const start = new Date(checkIn.started_at).getTime();
      const end = new Date(checkIn.finished_at).getTime();
      const totalMinutes = Math.max(0, Math.floor((end - start) / 60000));
      return `${totalMinutes}min`;
    }

    return "—";
  };

  const getStatusLabel = (checkIn: EnrichedCheckIn) => {
    if (checkIn.finished_at) return "Finalizado";
    if (checkIn.started_at && !checkIn.finished_at) return "Em atendimento";
    return "Aguardando";
  };

  const getStatusVariant = (checkIn: EnrichedCheckIn) => {
    if (checkIn.finished_at) return "default";
    if (checkIn.started_at && !checkIn.finished_at) return "secondary";
    return "outline";
  };

  if (barberLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Carregando visão geral da operação...
          </p>
        </div>
      </div>
    );
  }

  if (!barberProfile) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Perfil não encontrado.
          </p>
        </div>
      </div>
    );
  }

  // Handle Freelancer state (has profile but no internal barber link yet)
  if (!barber) {
    return (
      <div className="space-y-6 p-6">
        <div className="max-w-2xl space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Olá, {barberProfile.full_name}!</h1>
            <p className="text-muted-foreground">
              Seja bem-vindo ao BarberHouse Connect. Você ainda não está vinculado a nenhuma equipe.
            </p>
          </div>

          <Card className="rounded-2xl border-dashed bg-muted/30">
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Scissors className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">Comece a trabalhar hoje</h3>
                <p className="text-sm text-muted-foreground">
                  Explore cadeiras disponíveis em barbearias próximas e faça sua reserva por período.
                </p>
              </div>
              <Button asChild className="rounded-xl px-8">
                <a href="/barber/explore">Explorar Cadeiras</a>
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <p>
              <strong>Dica:</strong> Se você foi convidado por uma barbearia específica, peça o <strong>link de convite</strong> para vincular sua conta automaticamente à equipe deles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da sua operação
          </p>
          <p className="text-sm text-muted-foreground">
            Perfil operacional: <span className="font-medium">{barber.full_name}</span>
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            void refreshBarberProfile();
            void loadData(true);
          }}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ganhos hoje</p>
              <p className="text-2xl font-bold text-emerald-600">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(todayEarnings)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ganhos do mês</p>
              <p className="text-2xl font-bold text-blue-600">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(monthEarnings)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clientes</p>
              <p className="text-4xl font-bold">{clients.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Scissors className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contratos ativos</p>
              <p className="text-4xl font-bold">{activeContractsCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Clock3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Atendimentos hoje</p>
              <p className="text-4xl font-bold">{attendedToday}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Finalizados hoje</p>
              <p className="text-4xl font-bold">{finishedToday}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Atendimentos recentes
        </h2>

        {enrichedCheckIns.length === 0 ? (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-10 text-center">
              <p className="text-base font-medium text-foreground">
                Nenhum atendimento ainda.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Quando você registrar check-ins, eles aparecerão aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {enrichedCheckIns.map((checkIn) => (
              <Card key={checkIn.id} className="rounded-2xl shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">
                        {checkIn.clientName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Check-in em {formatDateTime(checkIn.checked_in_at ?? checkIn.created_at)}
                      </p>
                    </div>

                    <Badge variant={getStatusVariant(checkIn)}>
                      {getStatusLabel(checkIn)}
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Início</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatDateTime(checkIn.started_at)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Fim</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatDateTime(checkIn.finished_at)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Duração</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatDuration(checkIn)}
                      </p>
                    </div>
                  </div>

                  {checkIn.notes && (
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Observações</p>
                      <p className="mt-1 text-sm font-medium">{checkIn.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}