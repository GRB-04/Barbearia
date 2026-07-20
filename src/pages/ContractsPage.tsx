import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import {
  FileText,
  RefreshCw,
  CalendarDays,
  Clock3,
  User,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ContractWithBooking = {
  id: string;
  organization_id: string;
  chair_id: string;
  booking_id: string | null;
  barber_profile_id: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string;
  billing_cycle: string | null;
  price: number | null;
  notes: string | null;
  created_at: string | null;
  esign_status: string | null;
  esign_envelope_id: string | null;
  // joined
  chair_identifier: string | null;
  barber_full_name: string | null;
};

const statusBadge: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border border-amber-200",
  ended: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
  voided: "bg-rose-50 text-rose-400 border border-rose-100",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  ended: "Encerrado",
  cancelled: "Cancelado",
  voided: "Anulado",
};

export default function ContractsPage() {
  const { organization } = useOrganization();

  const [contracts, setContracts] = useState<ContractWithBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!organization?.id) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("contracts")
        .select(`
          id,
          organization_id,
          chair_id,
          booking_id,
          barber_profile_id,
          start_at,
          end_at,
          status,
          billing_cycle,
          price,
          notes,
          created_at,
          esign_status,
          esign_envelope_id,
          chairs ( identifier ),
          barber_profiles ( full_name )
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(error.message || "Não foi possível carregar os contratos.");
        setContracts([]);
        return;
      }

      type RawRow = {
        id: string;
        organization_id: string;
        chair_id: string;
        booking_id: string | null;
        barber_profile_id: string | null;
        start_at: string | null;
        end_at: string | null;
        status: string;
        billing_cycle: string | null;
        price: number | null;
        notes: string | null;
        created_at: string | null;
        esign_status: string | null;
        esign_envelope_id: string | null;
        chairs: { identifier: string | null } | null;
        barber_profiles: { full_name: string | null } | null;
      };

      setContracts(
        ((data ?? []) as unknown as RawRow[]).map((row) => ({
          id: row.id,
          organization_id: row.organization_id,
          chair_id: row.chair_id,
          booking_id: row.booking_id,
          barber_profile_id: row.barber_profile_id,
          start_at: row.start_at,
          end_at: row.end_at,
          status: row.status,
          billing_cycle: row.billing_cycle,
          price: row.price,
          notes: row.notes,
          created_at: row.created_at,
          esign_status: row.esign_status,
          esign_envelope_id: row.esign_envelope_id,
          chair_identifier: row.chairs?.identifier ?? null,
          barber_full_name: row.barber_profiles?.full_name ?? null,
        }))
      );
    } catch (err) {
      console.error("[ContractsPage] fetchAll error:", err);
      toast.error("Não foi possível carregar os contratos.");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!organization?.id) return;
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);


  const activeCount = useMemo(
    () => contracts.filter((c) => c.status === "active").length,
    [contracts]
  );
  const pendingCount = useMemo(
    () => contracts.filter((c) => c.status === "pending").length,
    [contracts]
  );
  const endedCount = useMemo(
    () => contracts.filter((c) => c.status === "ended").length,
    [contracts]
  );
  const cancelledCount = useMemo(
    () => contracts.filter((c) => c.status === "cancelled").length,
    [contracts]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Contratos
          </h1>
          <p className="text-sm text-muted-foreground">
            Contratos gerados automaticamente a partir das reservas confirmadas.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchAll()}
          disabled={loading}
          className="rounded-xl"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ativos</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{activeCount}</p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendentes</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{pendingCount}</p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Encerrados</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{endedCount}</p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cancelados</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{cancelledCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando contratos...</p>
        </div>
      ) : contracts.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4">
          {contracts.map((contract) => {
            const startAtDate = contract.start_at ? new Date(contract.start_at) : null;
            const endAtDate = contract.end_at ? new Date(contract.end_at) : null;

            return (
              <div
                key={contract.id}
                className="rounded-3xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {contract.chair_identifier ? `Cadeira ${contract.chair_identifier}` : "Cadeira"}
                      </p>

                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                          statusBadge[contract.status] ??
                            "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {statusLabel[contract.status] ?? contract.status}
                      </span>

                      {contract.esign_status === "signed" ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                          ✓ Assinado pelo Barbeiro
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                          ✍ Assinatura Pendente
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <User className="mt-0.5 h-4 w-4" />
                      <span>{contract.barber_full_name ?? "Barbeiro"}</span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                        <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Período
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {startAtDate
                              ? format(startAtDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                              : "—"}
                            {" → "}
                            {endAtDate
                              ? format(endAtDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                        <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Horário
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {startAtDate ? format(startAtDate, "HH:mm") : "—"} →{" "}
                            {endAtDate ? format(endAtDate, "HH:mm") : "—"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {contract.notes && (
                      <p className="text-xs text-muted-foreground">{contract.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Nenhum contrato ainda</p>
          <p className="text-xs text-muted-foreground">
            Contratos são criados automaticamente quando uma reserva é confirmada.
          </p>
        </div>
      )}
    </div>
  );
}
