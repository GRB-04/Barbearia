import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  Users,
  CheckCircle2,
  Clock3,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

type CheckInSummary = {
  id: string;
  client_id: string;
  barber_profile_id: string | null;
  checked_in_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

type BarberClientRow = {
  id: string;
  full_name: string;
};

type BarberProfileRow = {
  id: string;
  full_name: string | null;
};

type EnrichedCheckIn = CheckInSummary & {
  clientName: string;
  barberName: string;
};

function getStatusLabel(ci: CheckInSummary): string {
  if (ci.finished_at) return "Finalizado";
  if (ci.started_at && !ci.finished_at) return "Em atendimento";
  return "Aguardando";
}

function getStatusClass(ci: CheckInSummary): string {
  if (ci.finished_at) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (ci.started_at && !ci.finished_at) return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date();
  const d = new Date(dateStr);
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export default function ReceptionistDashboard() {
  const { barberProfile, barber, loading: profileLoading } = useBarberProfile();
  const effectiveOrgId = barber?.organization_id || barberProfile?.organization_id;
  const navigate = useNavigate();

  const [checkIns, setCheckIns] = useState<EnrichedCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const orgId = effectiveOrgId;
    if (!orgId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [checkInsRes, clientsRes, barbersRes] = await Promise.all([
        supabase
          .from("check_ins")
          .select(
            "id, client_id, barber_profile_id, checked_in_at, started_at, finished_at"
          )
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(60),

        supabase
          .from("barber_clients")
          .select("id, full_name")
          .eq("organization_id", orgId),

        supabase.from("barber_profiles").select("id, full_name"),
      ]);

      if (checkInsRes.error) throw checkInsRes.error;

      const clientMap = new Map<string, string>();
      for (const c of (clientsRes.data ?? []) as BarberClientRow[]) {
        clientMap.set(c.id, c.full_name);
      }

      const barberMap = new Map<string, string>();
      for (const b of (barbersRes.data ?? []) as BarberProfileRow[]) {
        barberMap.set(b.id, b.full_name ?? "Barbeiro");
      }

      const enriched: EnrichedCheckIn[] = (
        (checkInsRes.data ?? []) as CheckInSummary[]
      ).map((ci) => ({
        ...ci,
        clientName: clientMap.get(ci.client_id) ?? "Cliente",
        barberName: ci.barber_profile_id
          ? (barberMap.get(ci.barber_profile_id) ?? "Barbeiro")
          : "—",
      }));

      setCheckIns(enriched);
    } catch {
      toast.error("Erro ao carregar dados da recepção.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOrgId]);

  const todayCheckIns = checkIns.filter(
    (ci) =>
      isToday(ci.checked_in_at) ||
      isToday(ci.started_at) ||
      isToday(ci.finished_at)
  );
  const waiting = todayCheckIns.filter((ci) => !ci.started_at && !ci.finished_at);
  const inProgress = todayCheckIns.filter((ci) => ci.started_at && !ci.finished_at);
  const finished = todayCheckIns.filter((ci) => !!ci.finished_at);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recepção</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os atendimentos do dia em tempo real.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total hoje</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCheckIns.length}</div>
            <p className="text-xs text-muted-foreground">check-ins registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
            <Clock3 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waiting.length}</div>
            <p className="text-xs text-muted-foreground">na fila de espera</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em atendimento</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgress.length}</div>
            <p className="text-xs text-muted-foreground">atendimentos ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finalizados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{finished.length}</div>
            <p className="text-xs text-muted-foreground">atendimentos concluídos</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate("/barber/checkin")} className="gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Registrar check-in
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/barber/clients")}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Clientes da Casa
        </Button>
      </div>

      {/* Today's check-ins list */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">
          Atendimentos de hoje
          {todayCheckIns.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({todayCheckIns.length})
            </span>
          )}
        </h2>

        {loading ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Carregando atendimentos...
          </div>
        ) : todayCheckIns.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhum check-in hoje ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Os atendimentos do dia aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayCheckIns.map((ci) => (
              <div
                key={ci.id}
                className="flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{ci.clientName}</span>
                  <span className="text-xs text-muted-foreground">
                    Barbeiro: {ci.barberName}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-muted-foreground">
                    {ci.started_at && (
                      <p>Início: {formatTime(ci.started_at)}</p>
                    )}
                    {ci.finished_at && (
                      <p>Fim: {formatTime(ci.finished_at)}</p>
                    )}
                    {!ci.started_at && ci.checked_in_at && (
                      <p>Check-in: {formatTime(ci.checked_in_at)}</p>
                    )}
                  </div>

                  <Badge
                    className={`shrink-0 border text-xs ${getStatusClass(ci)}`}
                    variant="outline"
                  >
                    {getStatusLabel(ci)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
