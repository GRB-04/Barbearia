import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type AuditLog = {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const actionColors: Record<string, string> = {
  "contract.created": "bg-blue-100 text-blue-700",
  "contract.cancelled": "bg-rose-100 text-rose-700",
  "contract.ended": "bg-muted text-muted-foreground",
  "payment.paid": "bg-emerald-100 text-emerald-700",
  "payment.expired": "bg-amber-100 text-amber-700",
  "barber.added": "bg-purple-100 text-purple-700",
  "barber.removed": "bg-rose-100 text-rose-700",
};

export default function AuditLogPage() {
  const { organization } = useOrganization();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    if (!organization?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, action, entity, entity_id, metadata, created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as AuditLog[]) ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar auditoria.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadLogs(); }, [organization?.id]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro das últimas 100 ações críticas da organização.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => void loadLogs()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Log de ações</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShieldCheck className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhuma ação registrada ainda.</p>
              <p className="text-xs text-muted-foreground">Ações críticas como criação e cancelamento de contratos serão listadas aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex flex-col gap-1 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={`text-xs ${actionColors[log.action] ?? "bg-muted text-muted-foreground"}`}>
                        {log.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {log.entity}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}...` : ""}
                      </span>
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(log.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
