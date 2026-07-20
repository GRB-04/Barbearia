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

const METADATA_KEYS_MAP: Record<string, string> = {
  user_email: "E-mail do usuário",
  old_role: "Cargo anterior",
  new_role: "Novo cargo",
  price: "Valor do aluguel",
  billing_cycle: "Faturamento",
  chair_identifier: "Cadeira",
  location_name: "Unidade",
  barber_name: "Barbeiro",
  status: "Status",
  cancellation_reason: "Motivo do cancelamento",
  cancellation_fee: "Multa de rescisão",
  user_id: "ID do Usuário",
  full_name: "Nome completo",
  email: "E-mail",
  phone: "Telefone",
};

const VALUE_MAP: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  active: "Ativo",
  pending: "Pendente",
  cancelled: "Cancelado",
  ended: "Encerrado",
  voided: "Anulado",
  barber: "Barbeiro",
  manager: "Gerente",
  receptionist: "Recepcionista",
  owner: "Owner",
};

function formatMetadataValue(key: string, value: any): string {
  if (value === null || value === undefined) return "—";
  
  const valStr = String(value);
  
  if (key === "price" || key === "cancellation_fee") {
    const num = Number(value);
    if (!isNaN(num)) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
    }
  }

  return VALUE_MAP[valStr] ?? valStr;
}

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {Object.entries(log.metadata).map(([k, v]) => {
                          const label = METADATA_KEYS_MAP[k] ?? k;
                          const formattedValue = formatMetadataValue(k, v);
                          return (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border"
                            >
                              <strong className="text-foreground/80">{label}:</strong>
                              <span>{formattedValue}</span>
                            </span>
                          );
                        })}
                      </div>
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
