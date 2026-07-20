import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Timer, FileText, User } from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CheckIn {
  id: string;
  checked_in_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  status: string;
  service_amount: number | null;
  commission_amount: number | null;
}

export default function ClientHistoryPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [history, setHistory] = useState<CheckIn[]>([]);
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const fetchHistory = async () => {
    setLoading(true);

    try {
      const { data: client, error: clientError } = await supabase
        .from("barber_clients")
        .select("full_name")
        .eq("id", clientId)
        .single();

      if (!clientError && client) {
        setClientName(client.full_name);
      }

      const { data, error } = await supabase
        .from("check_ins")
        .select("*, service_amount, commission_amount")
        .eq("client_id", clientId)
        .eq("status", "finished")
        .order("finished_at", { ascending: false });

      if (error) {
        setHistory([]);
        setLoading(false);
        return;
      }

      setHistory((data as CheckIn[]) || []);
    } catch (error) {
      console.error("[ClientHistoryPage] fetchHistory error:", error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    if (hours === 0) return `${remaining} min`;
    if (remaining === 0) return `${hours}h`;
    return `${hours}h ${remaining}min`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Histórico do cliente
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName || "Cliente"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>

          <p className="text-sm font-medium text-foreground">
            Nenhum atendimento encontrado
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Este cliente ainda não possui atendimentos finalizados.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>
                  {item.finished_at
                    ? formatDistanceStrict(new Date(item.finished_at), new Date(), {
                        addSuffix: true,
                        locale: ptBR,
                      })
                    : "Sem data de finalização"}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="w-4 h-4" />
                <span>Duração: {formatDuration(item.duration_minutes)}</span>
              </div>

              {item.notes && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4 mt-0.5" />
                  <span>{item.notes}</span>
                </div>
              )}

              {(item.service_amount != null && item.service_amount > 0) && (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Valor do serviço</span>
                  <span className="font-semibold text-foreground">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.service_amount)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}