import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import {
  getMyCurrentActiveContracts,
  type ActiveContractItem,
} from "@/services/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  UserPlus,
  Star,
  Clock,
  CheckCircle2,
  Scissors,
  Play,
  Check,
  QrCode,
  RefreshCw,
  User,
  Sparkles,
  Calendar,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DASHBOARD_CACHE_KEY = "barber-dashboard-cache-v1";
function clearDashboardCache() {
  sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
}

type BarberClient = {
  id: string;
  full_name: string;
  created_at: string | null;
};

type CurrentActiveContract = Pick<
  ActiveContractItem,
  "id" | "status" | "chair_id" | "organization_id" | "created_at"
>;

type ActiveBooking = {
  id: string;
  chair_id: string;
  organization_id: string;
  start_at: string;
  end_at: string;
  status: string;
  created_at: string | null;
};

type CheckInRow = {
  id: string;
  client_id: string;
  organization_id: string;
  contract_id: string | null;
  status: string;
  checked_in_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string | null;
  barber_profile_id?: string | null;
};

type EnrichedCheckIn = CheckInRow & {
  clientName: string;
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function calculateDurationMinutes(
  startedAt: string | null,
  finishedAt: string | null
): number | null {
  if (!startedAt || !finishedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  const diffMs = end - start;

  if (diffMs <= 0) return 0;
  return Math.round(diffMs / (1000 * 60));
}

export default function CheckInPage() {
  const { barberProfile, loading: barberLoading, isReceptionist } = useBarberProfile();

  const [contracts, setContracts] = useState<CurrentActiveContract[]>([]);
  const [bookings, setBookings] = useState<ActiveBooking[]>([]);
  const [clients, setClients] = useState<BarberClient[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [barbersList, setBarbersList] = useState<{ id: string; full_name: string }[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [selectedBarberContracts, setSelectedBarberContracts] = useState<CurrentActiveContract[]>([]);
  const [selectedBarberBookings, setSelectedBarberBookings] = useState<ActiveBooking[]>([]);

  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCheckIn, setSavingCheckIn] = useState<boolean>(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  // Filter State: "all" | "service" | "qr_gate"
  const [activeFilter, setActiveFilter] = useState<"all" | "service" | "qr_gate">("all");
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  // Finish Attendance Modal State
  const [finishTarget, setFinishTarget] = useState<EnrichedCheckIn | null>(null);
  const [serviceAmount, setServiceAmount] = useState<string>("");
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingFinish, setSubmittingFinish] = useState<boolean>(false);
  const [finishingId, setFinishingId] = useState<string | null>(null);

  // Toggle for New Check-In Form
  const [newCheckInOpen, setNewCheckInOpen] = useState<boolean>(false);

  const barber = barberProfile;

  const loadData = async () => {
    if (!barberProfile?.id) return;
    setLoading(true);

    try {
      if (!isReceptionist) {
        const activeRes = await getMyCurrentActiveContracts(barberProfile.id);
        setContracts(
          activeRes.map((c) => ({
            id: c.id,
            status: c.status,
            chair_id: c.chair_id,
            organization_id: c.organization_id,
            created_at: c.created_at,
          }))
        );

        const nowIso = new Date().toISOString();
        const { data: bData } = await supabase
          .from("chair_bookings")
          .select("id, chair_id, organization_id, start_at, end_at, status, created_at")
          .eq("barber_profile_id", barberProfile.id)
          .eq("status", "confirmed")
          .lte("start_at", nowIso)
          .gte("end_at", nowIso);

        setBookings(bData ?? []);
      } else {
        const { data: bList } = await supabase
          .from("barber_profiles")
          .select("id, full_name")
          .order("full_name");
        setBarbersList(bList ?? []);
      }

      // Fetch Clients
      let clientQuery = supabase
        .from("barber_clients")
        .select("id, full_name, created_at")
        .order("full_name");

      if (!isReceptionist) {
        clientQuery = clientQuery.eq("barber_profile_id", barberProfile.id);
      }

      const { data: clientData } = await clientQuery;
      setClients(clientData ?? []);

      // Fetch Check-Ins
      let checkInQuery = supabase
        .from("check_ins")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!isReceptionist) {
        checkInQuery = checkInQuery.eq("barber_profile_id", barberProfile.id);
      }

      const { data: checkInData } = await checkInQuery;
      setCheckIns(checkInData ?? []);
    } catch {
      toast.error("Erro ao carregar dados do check-in.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberProfile?.id, isReceptionist]);

  // Load contracts/bookings for selected barber when receptionist selects one
  useEffect(() => {
    if (!isReceptionist || !selectedBarberId) {
      setSelectedBarberContracts([]);
      setSelectedBarberBookings([]);
      return;
    }

    void (async () => {
      const activeRes = await getMyCurrentActiveContracts(selectedBarberId);
      setSelectedBarberContracts(
        activeRes.map((c) => ({
          id: c.id,
          status: c.status,
          chair_id: c.chair_id,
          organization_id: c.organization_id,
          created_at: c.created_at,
        }))
      );

      const nowIso = new Date().toISOString();
      const { data: bData } = await supabase
        .from("chair_bookings")
        .select("id, chair_id, organization_id, start_at, end_at, status, created_at")
        .eq("barber_profile_id", selectedBarberId)
        .eq("status", "confirmed")
        .lte("start_at", nowIso)
        .gte("end_at", nowIso);

      setSelectedBarberBookings(bData ?? []);
    })();
  }, [isReceptionist, selectedBarberId]);

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.full_name));
    return map;
  }, [clients]);

  const barbersMap = useMemo(() => {
    const map = new Map<string, string>();
    barbersList.forEach((b) => map.set(b.id, b.full_name));
    return map;
  }, [barbersList]);

  const enrichedCheckIns = useMemo<EnrichedCheckIn[]>(() => {
    return checkIns.map((item) => ({
      ...item,
      clientName: clientMap.get(item.client_id) ?? "Cliente cadastrado",
    }));
  }, [checkIns, clientMap]);

  const allCount = enrichedCheckIns.length;
  const serviceCount = useMemo(
    () => enrichedCheckIns.filter((c) => !c.notes?.includes("Crachá Digital") && !c.notes?.includes("QR Code")).length,
    [enrichedCheckIns]
  );
  const qrGateCount = useMemo(
    () => enrichedCheckIns.filter((c) => c.notes?.includes("Crachá Digital") || c.notes?.includes("QR Code")).length,
    [enrichedCheckIns]
  );

  const filteredCheckIns = useMemo(() => {
    return enrichedCheckIns.filter((checkIn) => {
      const isQr = checkIn.notes?.includes("Crachá Digital") || checkIn.notes?.includes("QR Code");
      if (activeFilter === "service") return !isQr;
      if (activeFilter === "qr_gate") return isQr;
      return true;
    });
  }, [enrichedCheckIns, activeFilter]);

  function getBarberNameOfCheckIn(checkIn: CheckInRow): string {
    if (checkIn.barber_profile_id && barbersMap.has(checkIn.barber_profile_id)) {
      return barbersMap.get(checkIn.barber_profile_id)!;
    }
    return barberProfile?.full_name ?? "Barbeiro";
  }

  const hasActiveContract = contracts.length > 0;
  const hasActiveBooking = bookings.length > 0;
  const hasValidAccess = hasActiveContract || hasActiveBooking;

  const accessLabel = useMemo(() => {
    if (hasActiveContract && hasActiveBooking) {
      return "Contrato e Booking ativos";
    }
    if (hasActiveContract) {
      return "Contrato ativo agora";
    }
    if (hasActiveBooking) {
      return "Booking ativo agora";
    }
    return "Sem vínculo válido no momento";
  }, [hasActiveContract, hasActiveBooking]);

  const effectiveOrgId = useMemo(() => {
    if (barberProfile?.organization_id) return barberProfile.organization_id;
    if (contracts[0]?.organization_id) return contracts[0].organization_id;
    if (bookings[0]?.organization_id) return bookings[0].organization_id;
    if (checkIns[0]?.organization_id) return checkIns[0].organization_id;
    return null;
  }, [barberProfile, contracts, bookings, checkIns]);

  async function handleQuickCreateClient() {
    if (!newClientName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    if (!barberProfile?.id) return;
    setCreatingClient(true);

    try {
      const { data, error } = await supabase
        .from("barber_clients")
        .insert({
          barber_profile_id: barberProfile.id,
          organization_id: effectiveOrgId,
          full_name: newClientName.trim(),
          phone: newClientPhone.trim() || null,
        })
        .select("id, full_name, created_at")
        .single();

      if (error) throw new Error(error.message);

      toast.success(`Cliente ${data.full_name} cadastrado com sucesso!`);
      setClients((prev) => [data, ...prev]);
      setSelectedClientId(data.id);
      setNewClientName("");
      setNewClientPhone("");
      setQuickCreateOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar cliente.";
      toast.error(msg);
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleCreateCheckIn() {
    if (!barberProfile?.id) {
      toast.error("Perfil do barbeiro não encontrado.");
      return;
    }

    if (!selectedClientId) {
      toast.error("Selecione um cliente.");
      return;
    }

    if (isReceptionist && !selectedBarberId) {
      toast.error("Selecione o barbeiro para o atendimento.");
      return;
    }

    const hasValid = isReceptionist
      ? (selectedBarberContracts.length > 0 || selectedBarberBookings.length > 0)
      : hasValidAccess;

    if (!hasValid) {
      toast.error(
        isReceptionist
          ? "O barbeiro selecionado não possui contrato ativo ou booking ativo no momento."
          : "Você só pode registrar check-in com contrato ativo agora ou booking ativo agora."
      );
      return;
    }

    const activeContract = isReceptionist ? (selectedBarberContracts[0] ?? null) : (contracts[0] ?? null);
    const activeBooking = isReceptionist ? (selectedBarberBookings[0] ?? null) : (bookings[0] ?? null);

    const organizationId =
      activeContract?.organization_id ?? activeBooking?.organization_id ?? null;

    if (!organizationId) {
      toast.error("Não foi possível identificar a organização do check-in.");
      return;
    }

    setSavingCheckIn(true);

    try {
      const sourceNoteParts: string[] = [];

      if (activeContract?.id) {
        sourceNoteParts.push(`contract:${activeContract.id}`);
      }

      if (activeBooking?.id) {
        sourceNoteParts.push(`booking:${activeBooking.id}`);
      }

      if (notes.trim()) {
        sourceNoteParts.push(notes.trim());
      }

      const insertPayload = {
        barber_profile_id: isReceptionist ? selectedBarberId : barberProfile.id,
        client_id: selectedClientId,
        organization_id: organizationId,
        contract_id: activeContract?.id ?? null,
        status: "checked_in",
        checked_in_at: new Date().toISOString(),
        notes: sourceNoteParts.join(" | ") || null,
      };

      const { error } = await supabase.from("check_ins").insert(insertPayload);

      if (error) {
        throw new Error(error.message || "Erro ao registrar check-in.");
      }

      toast.success("Check-in registrado com sucesso.");
      setSelectedClientId("");
      setNotes("");
      setNewCheckInOpen(false);
      clearDashboardCache();
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao registrar check-in.";
      toast.error(message);
    } finally {
      setSavingCheckIn(false);
    }
  }

  async function handleStartAttendance(checkInId: string) {
    setStartingId(checkInId);

    try {
      const { error } = await supabase
        .from("check_ins")
        .update({
          started_at: new Date().toISOString(),
          status: "in_progress",
        })
        .eq("id", checkInId);

      if (error) {
        throw new Error(error.message || "Erro ao iniciar atendimento.");
      }

      toast.success("Atendimento iniciado com sucesso.");
      clearDashboardCache();
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao iniciar atendimento.";
      toast.error(message);
    } finally {
      setStartingId(null);
    }
  }

  async function handleFinishAttendance(checkIn: EnrichedCheckIn) {
    setFinishTarget(checkIn);
    setServiceAmount("");
    setRating(0);
    setRatingComment("");
  }

  async function handleConfirmFinish() {
    if (!finishTarget) return;
    setSubmittingFinish(true);

    const checkIn = finishTarget;
    const finishedAt = new Date().toISOString();
    const durationMinutes = calculateDurationMinutes(checkIn.started_at, finishedAt);
    const svcAmount = parseFloat(serviceAmount) || 0;

    let commissionAmount = 0;
    if (checkIn.contract_id) {
      const { data: contractData } = await supabase
        .from("contracts")
        .select("commission_type, commission_value")
        .eq("id", checkIn.contract_id)
        .maybeSingle();

      if (contractData) {
        if (contractData.commission_type === "percentage") {
          commissionAmount = svcAmount * (Number(contractData.commission_value) / 100);
        } else {
          commissionAmount = Number(contractData.commission_value);
        }
      }
    }

    try {
      const { error } = await supabase
        .from("check_ins")
        .update({
          finished_at: finishedAt,
          duration_minutes: durationMinutes,
          status: "finished",
          service_amount: svcAmount,
          commission_amount: commissionAmount,
        })
        .eq("id", checkIn.id);

      if (error) throw new Error(error.message || "Erro ao finalizar atendimento.");

      if (rating > 0 && barberProfile?.id && effectiveOrgId) {
        await supabase.from("barber_ratings").insert({
          organization_id: effectiveOrgId,
          barber_profile_id: barberProfile.id,
          check_in_id: checkIn.id,
          rating,
          comment: ratingComment.trim() || null,
        } as Record<string, unknown>);
      }

      if (effectiveOrgId) {
        await supabase.from("audit_logs").insert({
          organization_id: effectiveOrgId,
          action: "checkin.finished",
          entity: "check_ins",
          entity_id: checkIn.id,
          metadata: { service_amount: svcAmount, commission_amount: commissionAmount, duration_minutes: durationMinutes },
        } as Record<string, unknown>);
      }

      toast.success(`Atendimento finalizado! Comissão: R$ ${commissionAmount.toFixed(2)}`);
      setFinishTarget(null);
      clearDashboardCache();
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao finalizar atendimento.";
      toast.error(message);
    } finally {
      setSubmittingFinish(false);
      setFinishingId(null);
    }
  }

  if (barberLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Check-in</h1>
            <p className="text-sm text-muted-foreground">Carregando operação de atendimento...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!barberProfile || !barber) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Check-in</h1>
          <p className="text-sm text-muted-foreground">Perfil operacional não encontrado.</p>
        </div>
      </div>
    );
  }

  const waitingCount = enrichedCheckIns.filter((c) => !c.started_at && !c.finished_at).length;
  const inProgressCount = enrichedCheckIns.filter((c) => !!c.started_at && !c.finished_at).length;
  const finishedCount = enrichedCheckIns.filter((c) => !!c.finished_at).length;

  return (
    <>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Scissors className="h-6 w-6 text-primary" />
              Check-in & Atendimentos
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe a fila de espera, tempos de atendimento e liberações de acesso na portaria.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => setNewCheckInOpen((prev) => !prev)}
              className="gap-2 rounded-xl shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Novo check-in
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadData()}
              className="rounded-xl shrink-0"
              title="Atualizar dados"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Metrics Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-background dark:from-amber-950/20 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Aguardando na Fila</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{waitingCount}</p>
                <p className="text-[11px] text-muted-foreground">clientes na recepção</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/50 to-background dark:from-emerald-950/20 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Em Atendimento</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{inProgressCount}</p>
                <p className="text-[11px] text-muted-foreground">na cadeira agora</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300">
                <Scissors className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/50 to-background dark:from-blue-950/20 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Finalizados Hoje</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{finishedCount}</p>
                <p className="text-[11px] text-muted-foreground">serviços concluídos</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Collapsible / Expandable Form for New Check-In */}
        {newCheckInOpen && (
          <Card className="rounded-2xl border-2 border-primary/20 bg-card shadow-md transition-all">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Registrar Novo Check-in
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Cliente</label>
                    <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px] text-primary">
                          <UserPlus className="h-3 w-3" />
                          Cadastrar rápido
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Cadastro Rápido de Cliente</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-3">
                          <div className="space-y-2">
                            <Label>Nome completo</Label>
                            <Input 
                              value={newClientName} 
                              onChange={(e) => setNewClientName(e.target.value)} 
                              placeholder="Ex: João da Silva"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Telefone (opcional)</Label>
                            <Input 
                              value={newClientPhone} 
                              onChange={(e) => setNewClientPhone(e.target.value)} 
                              placeholder="(91) 99999-9999"
                            />
                          </div>
                          <Button 
                            className="w-full rounded-xl" 
                            onClick={handleQuickCreateClient}
                            disabled={creatingClient}
                          >
                            {creatingClient ? "Cadastrando..." : "Cadastrar e selecionar"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <select
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    <option value="">Selecione um cliente...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {isReceptionist && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Barbeiro / Profissional</label>
                    <select
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      value={selectedBarberId}
                      onChange={(e) => setSelectedBarberId(e.target.value)}
                    >
                      <option value="">Selecione um barbeiro...</option>
                      {barbersList.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Observações (opcional)</label>
                <Input
                  className="rounded-xl text-sm"
                  placeholder="Ex: Corte degrada + barba"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {!isReceptionist && !hasValidAccess && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  ⚠️ Você não possui contrato ativo nem booking ativo no momento para registrar check-in.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setNewCheckInOpen(false)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateCheckIn}
                  className="rounded-xl gap-2 shadow-sm"
                  disabled={savingCheckIn || (!isReceptionist && !hasValidAccess) || (isReceptionist && (!selectedBarberId || (selectedBarberContracts.length === 0 && selectedBarberBookings.length === 0))) || !selectedClientId}
                >
                  {savingCheckIn ? "Registrando..." : "Confirmar Check-in"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Atendimentos Recentes List */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Atendimentos Recentes
            </h2>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-2xl border border-border/50 text-xs font-medium self-start sm:self-auto overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeFilter === "all"
                    ? "bg-background text-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Todos</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {allCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("service")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeFilter === "service"
                    ? "bg-background text-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Scissors className="h-3.5 w-3.5 text-primary" />
                <span>Atendimentos de Clientes</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {serviceCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("qr_gate")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeFilter === "qr_gate"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>Portaria (QR Code)</span>
                <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px]">
                  {qrGateCount}
                </span>
              </button>
            </div>
          </div>

          {filteredCheckIns.length === 0 ? (
            <Card className="rounded-2xl border border-dashed border-border p-10 text-center">
              <CardContent className="p-0">
                <Scissors className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-base font-medium text-foreground">Nenhum registro nesta categoria.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Alterne entre as abas acima para visualizar atendimentos de clientes ou acessos via QR Code.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredCheckIns.map((checkIn) => {
                const isQrCodeAccess = checkIn.notes?.includes("Crachá Digital") || checkIn.notes?.includes("QR Code");
                const isWaiting = !checkIn.started_at && !checkIn.finished_at;
                const isInProgress = !!checkIn.started_at && !checkIn.finished_at;
                const isFinished = !!checkIn.finished_at;

                return (
                  <Card 
                    key={checkIn.id} 
                    className="rounded-2xl border border-border/70 bg-card shadow-sm hover:border-border transition-all overflow-hidden"
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* Left Info Column */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-base font-bold text-foreground">
                              {checkIn.clientName}
                            </span>

                            {isQrCodeAccess && (
                              <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 hover:bg-indigo-100 font-medium text-[11px] gap-1">
                                <QrCode className="h-3 w-3" />
                                Crachá Digital (QR Code)
                              </Badge>
                            )}

                            {isWaiting && !isQrCodeAccess && (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 hover:bg-amber-100 font-medium text-[11px] gap-1">
                                <Clock className="h-3 w-3" />
                                Aguardando
                              </Badge>
                            )}

                            {isInProgress && (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 hover:bg-emerald-100 font-medium text-[11px] gap-1">
                                <Scissors className="h-3 w-3" />
                                Em Atendimento
                              </Badge>
                            )}

                            {isFinished && (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 hover:bg-blue-100 font-medium text-[11px] gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Finalizado
                              </Badge>
                            )}
                          </div>

                          {isReceptionist && (
                            <p className="text-xs text-muted-foreground">
                              Barbeiro: <span className="font-medium text-foreground">{getBarberNameOfCheckIn(checkIn)}</span>
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
                            <span>Check-in às <strong className="text-foreground">{formatTime(checkIn.checked_in_at ?? checkIn.created_at)}</strong></span>
                            {checkIn.notes && !isQrCodeAccess && (
                              <span className="truncate max-w-xs text-muted-foreground/80">• {checkIn.notes}</span>
                            )}
                          </div>

                          {/* Render Duration / Timestamps for Active Haircut Services */}
                          {!isQrCodeAccess && (isInProgress || isFinished) && (
                            <div className="flex items-center gap-4 pt-2 text-xs">
                              {checkIn.started_at && (
                                <div className="rounded-lg bg-muted/40 px-2.5 py-1">
                                  Início: <strong className="text-foreground">{formatTime(checkIn.started_at)}</strong>
                                </div>
                              )}
                              {checkIn.finished_at && (
                                <div className="rounded-lg bg-muted/40 px-2.5 py-1">
                                  Fim: <strong className="text-foreground">{formatTime(checkIn.finished_at)}</strong>
                                </div>
                              )}
                              {checkIn.duration_minutes !== null && (
                                <div className="rounded-lg bg-emerald-100/50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 font-medium">
                                  Duração: {checkIn.duration_minutes} min
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Right Action Column (Barber only) */}
                        <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                          {isWaiting && !isQrCodeAccess && !isReceptionist && (
                            <Button
                              size="sm"
                              className="rounded-xl gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                              disabled={startingId === checkIn.id}
                              onClick={() => void handleStartAttendance(checkIn.id)}
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                              {startingId === checkIn.id ? "Iniciando..." : "Iniciar atendimento"}
                            </Button>
                          )}

                          {isInProgress && !isReceptionist && (
                            <Button
                              size="sm"
                              className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                              disabled={finishingId === checkIn.id}
                              onClick={() => void handleFinishAttendance(checkIn)}
                            >
                              <Check className="h-4 w-4" />
                              {finishingId === checkIn.id ? "Finalizando..." : "Finalizar atendimento"}
                            </Button>
                          )}

                          {isFinished && (
                            <div className="text-right text-xs">
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-xl">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Finish Attendance Modal */}
      <Dialog open={!!finishTarget} onOpenChange={(open) => { if (!open) setFinishTarget(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Scissors className="h-5 w-5 text-primary" />
              Finalizar Atendimento
            </DialogTitle>
          </DialogHeader>

          {finishTarget && (
            <div className="space-y-4 py-3">
              <div className="rounded-xl border border-muted-foreground/10 bg-muted/20 p-3">
                <p className="text-sm font-semibold text-foreground">{finishTarget.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  Início: {formatTime(finishTarget.started_at)} • Duração estimada: {calculateDurationMinutes(finishTarget.started_at, new Date().toISOString()) ?? 0} min
                </p>
              </div>

              <div className="space-y-2">
                <Label>Valor do serviço prestado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 50.00"
                  value={serviceAmount}
                  onChange={(e) => setServiceAmount(e.target.value)}
                  className="rounded-xl text-base font-semibold"
                />
              </div>

              <div className="space-y-2">
                <Label>Avaliação do atendimento (opcional)</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 text-amber-400 hover:scale-110 transition"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {rating > 0 && (
                <div className="space-y-2">
                  <Label>Comentário da avaliação (opcional)</Label>
                  <Input
                    placeholder="Ex: Excelente atendimento, cliente muito satisfeito."
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button variant="ghost" onClick={() => setFinishTarget(null)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleConfirmFinish}
                  disabled={submittingFinish}
                >
                  {submittingFinish ? "Salvando..." : "Confirmar e Concluir"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}