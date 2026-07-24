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
  QrCode,
  ShieldCheck,
  Download,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

type CheckInSummary = {
  id: string;
  client_id: string;
  barber_profile_id: string | null;
  checked_in_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  notes: string | null;
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

type QrAccessLog = {
  id: string;
  created_at: string;
  metadata: {
    barber_name?: string;
    access_method?: string;
    granted_at?: string;
  } | null;
};

function playNotificationChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    // Tone 1: E5 (659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: A5 (880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.warn("Could not play chime:", e);
  }
}

function getStatusLabel(ci: CheckInSummary): string {
  if (ci.finished_at) return "Finalizado";
  if (ci.started_at && !ci.finished_at) return "Em atendimento";
  return "Aguardando";
}

function getStatusClass(ci: CheckInSummary): string {
  if (ci.finished_at) return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300";
  if (ci.started_at && !ci.finished_at) return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300";
  return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300";
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
  const { barberProfile, barber } = useBarberProfile();
  const effectiveOrgId = barber?.organization_id || barberProfile?.organization_id;
  const navigate = useNavigate();

  const [checkIns, setCheckIns] = useState<EnrichedCheckIn[]>([]);
  const [qrLogs, setQrLogs] = useState<QrAccessLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const orgId = effectiveOrgId;
    if (!orgId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [checkInsRes, clientsRes, barbersRes, qrLogsRes] = await Promise.all([
        supabase
          .from("check_ins")
          .select(
            "id, client_id, barber_profile_id, checked_in_at, started_at, finished_at, notes"
          )
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(60),

        supabase
          .from("barber_clients")
          .select("id, full_name")
          .eq("organization_id", orgId),

        supabase.from("barber_profiles").select("id, full_name"),

        supabase
          .from("audit_logs")
          .select("id, created_at, metadata")
          .eq("organization_id", orgId)
          .eq("action", "qr_access_granted")
          .order("created_at", { ascending: false })
          .limit(20),
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
      setQrLogs((qrLogsRes.data as unknown as QrAccessLog[]) ?? []);
    } catch {
      toast.error("Erro ao carregar dados da recepção.");
    } finally {
      setLoading(false);
    }
  }

  // Realtime Supabase Subscription + 5s Polling Backup
  useEffect(() => {
    void loadData();

    if (!effectiveOrgId) return;

    // 1. Supabase Realtime WebSocket Listener
    const channel = supabase
      .channel(`reception-realtime-${effectiveOrgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
        },
        (payload) => {
          if (
            payload.new &&
            (payload.new as any).organization_id === effectiveOrgId &&
            (payload.new as any).action === "qr_access_granted"
          ) {
            playNotificationChime();
            const barberName = (payload.new as any).metadata?.barber_name || "Barbeiro";
            toast.success(`🔔 Acesso liberado: ${barberName} acabou de escanear o crachá!`, {
              duration: 5000,
            });
            void loadData();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "check_ins",
        },
        () => {
          void loadData();
        }
      )
      .subscribe();

    // 2. Backup polling interval (every 5s) to guarantee updates
    const pollInterval = setInterval(() => {
      void loadData();
    }, 5000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
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
  const todayQrLogs = qrLogs.filter((log) => isToday(log.created_at));

  // CSV Report Export Handler
  function handleExportCSV() {
    if (todayCheckIns.length === 0 && todayQrLogs.length === 0) {
      toast.info("Nenhum registro hoje para exportar.");
      return;
    }

    const rows: string[][] = [
      ["Tipo de Registro", "Barbeiro / Cliente", "Horario", "Status", "Observacoes"]
    ];

    // Add QR Access logs
    for (const log of todayQrLogs) {
      rows.push([
        "Cracha Digital (QR Code)",
        log.metadata?.barber_name || "Barbeiro",
        new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        "Acesso Liberado",
        "Liberacao registrada na portaria via QR Code"
      ]);
    }

    // Add CheckIns
    for (const ci of todayCheckIns) {
      const timeStr = ci.checked_in_at
        ? new Date(ci.checked_in_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "—";
      rows.push([
        ci.notes?.includes("QR Code") ? "Check-in (QR Code)" : "Check-in Cliente",
        `${ci.clientName} (Barbeiro: ${ci.barberName})`,
        timeStr,
        getStatusLabel(ci),
        ci.notes || ""
      ]);
    }

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const todayStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_recepcao_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório baixado com sucesso!");
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recepção & Portaria</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os atendimentos e liberações de acesso via QR Code em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar Relatório (CSV)
          </Button>

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
      </div>


      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

        <Card className="border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
              Acessos QR Code
            </CardTitle>
            <QrCode className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
              {todayQrLogs.length}
            </div>
            <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">liberações via crachá</p>
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

      {/* QR Code Access Stream Section */}
      {todayQrLogs.length > 0 && (
        <Card className="rounded-2xl border-indigo-200/60 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-card shadow-sm dark:border-indigo-900/40 dark:from-indigo-950/20 dark:via-purple-950/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-950 dark:text-indigo-200">
                <QrCode className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Liberações de Portaria via Crachá Digital (QR Code)
              </CardTitle>
              <Badge variant="outline" className="border-indigo-300 text-indigo-700 bg-indigo-100/50 text-[11px]">
                {todayQrLogs.length} acessos hoje
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="divide-y divide-indigo-100/60 dark:divide-indigo-900/30">
              {todayQrLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-600/10 flex items-center justify-center text-indigo-600 shrink-0">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {log.metadata?.barber_name || "Barbeiro Validação"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Entrada liberada por escanear o crachá digital
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-medium text-indigo-700 dark:text-indigo-300">
                      {formatTime(log.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              Os atendimentos do dia e acessos QR Code aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayCheckIns.map((ci) => {
              const isQrCheckIn = ci.notes?.includes("QR Code") || ci.notes?.includes("Crachá");

              return (
                <div
                  key={ci.id}
                  className="flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ci.clientName}</span>
                      {isQrCheckIn && (
                        <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 gap-1 py-0 h-5">
                          <QrCode className="h-3 w-3" />
                          Crachá Digital
                        </Badge>
                      )}
                    </div>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
