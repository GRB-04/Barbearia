import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import ReceptionistDashboard from "./ReceptionistDashboard";
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
  FileText,
  Timer,
  CalendarClock,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { startOfMonth, startOfDay, endOfDay, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

type BarberClient = {
  id: string;
  full_name: string;
  created_at: string;
};

type Contract = {
  id: string;
  status: string | null;
  created_at: string;
  barber_profile_id?: string | null;
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

// UUID / internal reference pattern detector
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const INTERNAL_REF_REGEX = /^(contract:|booking:|ref:|id:)/i;

function isInternalNote(note: string | null): boolean {
  if (!note) return false;
  return UUID_REGEX.test(note.trim()) || INTERNAL_REF_REGEX.test(note.trim());
}

export default function BarberDashboard() {
  const {
    barberProfile,
    barber,
    isReceptionist,
    loading: barberLoading,
    refreshBarberProfile,
  } = useBarberProfile();
  const effectiveOrgId = barber?.organization_id || barberProfile?.organization_id;

  // Recepcionistas tÃªm um dashboard prÃ³prio â€” redireciona imediatamente
  if (isReceptionist) {
    return <ReceptionistDashboard />;
  }

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
      const isRecep = isReceptionist;
      const orgId = effectiveOrgId;

      const [clientsResult, contractsResult, checkInsResult, earningsResult] = await Promise.all([
        isRecep
          ? supabase
              .from("barber_clients")
              .select("id, full_name, created_at")
              .eq("organization_id", orgId)
              .order("created_at", { ascending: false })
          : supabase
              .from("barber_clients")
              .select("id, full_name, created_at")
              .eq("barber_profile_id", barberProfile.id)
              .order("created_at", { ascending: false }),

        isRecep
          ? supabase
              .from("contracts")
              .select("id, status, created_at, barber_profile_id")
              .eq("organization_id", orgId)
              .order("created_at", { ascending: false })
          : supabase
              .from("contracts")
              .select("id, status, created_at, barber_profile_id")
              .eq("barber_profile_id", barberProfile.id)
              .order("created_at", { ascending: false }),

        isRecep
          ? supabase
              .from("check_ins")
              .select(
                "id, client_id, status, checked_in_at, started_at, finished_at, duration_minutes, notes, created_at"
              )
              .eq("organization_id", orgId)
              .order("created_at", { ascending: false })
              .limit(8)
          : supabase
              .from("check_ins")
              .select(
                "id, client_id, status, checked_in_at, started_at, finished_at, duration_minutes, notes, created_at"
              )
              .eq("barber_profile_id", barberProfile.id)
              .order("created_at", { ascending: false })
              .limit(8),

        isRecep
          ? Promise.resolve({ data: [], error: null })
          : supabase
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

      if (!isRecep && earningsResult.error) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const activeBarbersCount = useMemo(() => {
    const activeContracts = contracts.filter((c) => c.status === "active");
    const barberIds = activeContracts.map((c) => c.barber_profile_id).filter(Boolean);
    return new Set(barberIds).size;
  }, [contracts]);

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

  const formatCheckInTime = (value: string | null): string => {
    if (!value) return "â€”";
    const d = new Date(value);
    const timeStr = format(d, "HH:mm", { locale: ptBR });
    if (isToday(d)) return `Hoje, ${timeStr}`;
    if (isYesterday(d)) return `Ontem, ${timeStr}`;
    return format(d, "dd/MM, HH:mm", { locale: ptBR });
  };

  const formatDuration = (checkIn: EnrichedCheckIn): string => {
    if (checkIn.duration_minutes !== null && checkIn.duration_minutes > 0) {
      const h = Math.floor(checkIn.duration_minutes / 60);
      const m = checkIn.duration_minutes % 60;
      if (h > 0 && m > 0) return `${h}h ${m}min`;
      if (h > 0) return `${h}h`;
      return `${m}min`;
    }

    if (checkIn.started_at && checkIn.finished_at) {
      const start = new Date(checkIn.started_at).getTime();
      const end = new Date(checkIn.finished_at).getTime();
      const totalMinutes = Math.max(0, Math.floor((end - start) / 60000));
      if (totalMinutes === 0) return "< 1min";
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      if (h > 0 && m > 0) return `${h}h ${m}min`;
      if (h > 0) return `${h}h`;
      return `${m}min`;
    }

    return null as unknown as string;
  };

  type StatusInfo = {
    label: string;
    dotClass: string;
    textClass: string;
  };

  const getStatusInfo = (checkIn: EnrichedCheckIn): StatusInfo => {
    if (checkIn.finished_at) {
      return {
        label: "Finalizado",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-600 dark:text-emerald-400",
      };
    }
    if (checkIn.started_at && !checkIn.finished_at) {
      return {
        label: "Em atendimento",
        dotClass: "bg-amber-400 animate-pulse",
        textClass: "text-amber-600 dark:text-amber-400",
      };
    }
    return {
      label: "Aguardando",
      dotClass: "bg-muted-foreground/30",
      textClass: "text-muted-foreground",
    };
  };

  // Get initials for avatar
  const getInitials = (name: string): string => {
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  if (barberLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Carregando visÃ£o geral da operaÃ§Ã£o...
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
            Perfil nÃ£o encontrado.
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
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full overflow-hidden border border-muted-foreground/10 bg-muted/20 flex items-center justify-center shrink-0">
              {(barberProfile as any).avatar_url ? (
                <img src={(barberProfile as any).avatar_url} alt={barberProfile.full_name} className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">OlÃ¡, {barberProfile.full_name}!</h1>
              <p className="text-sm text-muted-foreground">
                Seja bem-vindo ao BarberHouse Connect. VocÃª ainda nÃ£o estÃ¡ vinculado a nenhuma equipe.
              </p>
            </div>
          </div>

          <Card className="rounded-2xl border-dashed bg-muted/30">
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Scissors className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">Comece a trabalhar hoje</h3>
                <p className="text-sm text-muted-foreground">
                  Explore cadeiras disponÃ­veis em barbearias prÃ³ximas e faÃ§a sua reserva por perÃ­odo.
                </p>
              </div>
              <Button asChild className="rounded-xl px-8">
                <a href="/barber/explore">Explorar Cadeiras</a>
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <p>
              <strong>Dica:</strong> Se vocÃª foi convidado por uma barbearia especÃ­fica, peÃ§a o <strong>link de convite</strong> para vincular sua conta automaticamente Ã  equipe deles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full overflow-hidden border border-muted-foreground/10 bg-muted/20 flex items-center justify-center shrink-0">
            {(barberProfile as any).avatar_url ? (
              <img src={(barberProfile as any).avatar_url} alt={barber.full_name} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-0.5">
            <h1 className="text-lg font-semibold text-foreground">OlÃ¡, {barber.full_name}!</h1>
            <p className="text-xs text-muted-foreground">
              VisÃ£o geral da sua operaÃ§Ã£o â€” {isReceptionist ? "Recepcionista" : barberProfile.role === "manager" ? "Gerente" : "Barbeiro"}
            </p>
          </div>
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

      {isReceptionist ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                <Scissors className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Barbeiros ativos</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {activeBarbersCount}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                <UserRound className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Clientes da Casa</p>
                <p className="text-2xl font-bold text-blue-600">{clients.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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
                <p className="text-sm text-muted-foreground">Ganhos do mÃªs</p>
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
      )}

      {/* â”€â”€â”€ ATENDIMENTOS RECENTES â€” Lista compacta â”€â”€â”€ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Atendimentos Recentes
          </h2>
          {enrichedCheckIns.length > 0 && (
            <span className="text-xs text-muted-foreground font-medium">
              Ãšltimos {enrichedCheckIns.length} registros
            </span>
          )}
        </div>

        {enrichedCheckIns.length === 0 ? (
          <Card className="rounded-2xl shadow-sm border-dashed">
            <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <CalendarClock className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Nenhum atendimento ainda</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Quando vocÃª registrar check-ins de clientes, eles aparecerÃ£o aqui.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <div className="divide-y divide-border">
              {enrichedCheckIns.map((checkIn, idx) => {
                const status = getStatusInfo(checkIn);
                const duration = formatDuration(checkIn);
                const checkinTime = formatCheckInTime(checkIn.checked_in_at ?? checkIn.created_at);
                const initials = getInitials(checkIn.clientName);
                const visibleNote = !isInternalNote(checkIn.notes) ? checkIn.notes : null;

                return (
                  <div
                    key={checkIn.id}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Avatar com iniciais */}
                    <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm select-none">
                      {initials}
                    </div>

                    {/* Nome + nota (se houver) */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {checkIn.clientName}
                      </p>
                      {visibleNote ? (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{visibleNote}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          {checkinTime}
                        </p>
                      )}
                    </div>

                    {/* DuraÃ§Ã£o */}
                    {duration && (
                      <div className="shrink-0 flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted rounded-lg px-2 py-1">
                        <Timer className="h-3 w-3" />
                        {duration}
                      </div>
                    )}

                    {/* Status indicator */}
                    <div className="shrink-0 flex items-center gap-1.5 min-w-[100px] justify-end">
                      <span className={`inline-block w-2 h-2 rounded-full ${status.dotClass}`} />
                      <span className={`text-xs font-semibold ${status.textClass}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
