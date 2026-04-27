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
import { Plus, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
};

type EnrichedCheckIn = CheckInRow & {
  clientName: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusLabel(checkIn: EnrichedCheckIn): string {
  if (checkIn.finished_at) return "Finalizado";
  if (checkIn.started_at && !checkIn.finished_at) return "Em atendimento";
  return "Aguardando";
}

function getStatusVariant(
  checkIn: EnrichedCheckIn
): "default" | "secondary" | "outline" {
  if (checkIn.finished_at) return "default";
  if (checkIn.started_at && !checkIn.finished_at) return "secondary";
  return "outline";
}

function calculateDurationMinutes(
  startedAt: string | null,
  finishedAt: string | null
): number | null {
  if (!startedAt || !finishedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return null;
  }

  const diffMinutes = Math.floor((end - start) / 60000);
  return Math.max(1, diffMinutes);
}

export default function CheckInPage() {
  const { barberProfile, barber, loading: barberLoading } = useBarberProfile();

  const [clients, setClients] = useState<BarberClient[]>([]);
  const [contracts, setContracts] = useState<CurrentActiveContract[]>([]);
  const [bookings, setBookings] = useState<ActiveBooking[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);

  const [selectedClientId, setSelectedClientId] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [finishingId, setFinishingId] = useState<string | null>(null);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  async function loadData() {
    if (!barberProfile || !barber) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const nowIso = new Date().toISOString();

      const [clientsResult, contractsResult, bookingsResult, checkInsResult] =
        await Promise.all([
          supabase
            .from("barber_clients")
            .select("id, full_name, created_at")
            .eq("barber_profile_id", barberProfile.id)
            .order("full_name", { ascending: true }),

          getMyCurrentActiveContracts(),

          supabase
            .from("chair_bookings")
            .select(
              "id, chair_id, organization_id, start_at, end_at, status, created_at"
            )
            .eq("barber_profile_id", barberProfile.id)
            .in("status", ["pending", "confirmed"])
            .lte("start_at", nowIso)
            .gte("end_at", nowIso)
            .order("start_at", { ascending: false }),

          supabase
            .from("check_ins")
            .select(
              "id, client_id, organization_id, contract_id, status, checked_in_at, started_at, finished_at, duration_minutes, notes, created_at"
            )
            .eq("barber_profile_id", barberProfile.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      if (clientsResult.error) {
        throw new Error(
          clientsResult.error.message || "Erro ao carregar clientes."
        );
      }

      if (bookingsResult.error) {
        throw new Error(
          bookingsResult.error.message || "Erro ao carregar bookings."
        );
      }

      if (checkInsResult.error) {
        throw new Error(
          checkInsResult.error.message || "Erro ao carregar check-ins."
        );
      }

      const normalizedContracts: CurrentActiveContract[] = (
        contractsResult ?? []
      ).map((contract) => ({
        id: contract.id,
        status: contract.status,
        chair_id: contract.chair_id,
        organization_id: contract.organization_id,
        created_at: contract.created_at,
      }));

      setClients((clientsResult.data as BarberClient[]) ?? []);
      setContracts(normalizedContracts);
      setBookings((bookingsResult.data as ActiveBooking[]) ?? []);
      setCheckIns((checkInsResult.data as CheckInRow[]) ?? []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao carregar dados do check-in.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickCreateClient() {
    if (!barberProfile?.id || !barberProfile?.organization_id) return;
    if (!newClientName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    setCreatingClient(true);
    try {
      const { data, error } = await supabase
        .from("barber_clients")
        .insert({
          organization_id: barberProfile.organization_id,
          barber_profile_id: barberProfile.id,
          full_name: newClientName.trim(),
          phone: newClientPhone.trim() || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      toast.success("Cliente cadastrado com sucesso.");
      setQuickCreateOpen(false);
      setNewClientName("");
      setNewClientPhone("");
      
      // Auto-select the new client
      const newClient = data as BarberClient;
      setSelectedClientId(newClient.id);
      
      await loadData();
    } catch (error) {
      toast.error("Erro ao cadastrar cliente.");
    } finally {
      setCreatingClient(false);
    }
  }

  useEffect(() => {
    if (!barberProfile?.id || !barber?.id) return;
    void loadData();
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

  const activeContractsCount = contracts.length;
  const activeBookingsCount = bookings.length;

  const hasActiveContract = activeContractsCount > 0;
  const hasActiveBooking = activeBookingsCount > 0;

  const hasValidAccess = hasActiveContract || hasActiveBooking;

  const accessLabel = useMemo(() => {
    if (hasActiveContract && hasActiveBooking) {
      return "Contrato e booking ativos agora";
    }

    if (hasActiveContract) {
      return "Contrato ativo agora";
    }

    if (hasActiveBooking) {
      return "Booking ativo agora";
    }

    return "Sem vínculo válido no momento";
  }, [hasActiveContract, hasActiveBooking]);

  async function handleCreateCheckIn() {
    if (!barberProfile?.id) {
      toast.error("Perfil do barbeiro não encontrado.");
      return;
    }

    if (!selectedClientId) {
      toast.error("Selecione um cliente.");
      return;
    }

    if (!hasValidAccess) {
      toast.error(
        "Você só pode registrar check-in com contrato ativo agora ou booking ativo agora."
      );
      return;
    }

    const activeContract = contracts[0] ?? null;
    const activeBooking = bookings[0] ?? null;

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
        barber_profile_id: barberProfile.id,
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

      toast.success("Atendimento iniciado.");
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
    setFinishingId(checkIn.id);

    try {
      const finishedAt = new Date().toISOString();
      const durationMinutes = calculateDurationMinutes(
        checkIn.started_at,
        finishedAt
      );

      const { error } = await supabase
        .from("check_ins")
        .update({
          finished_at: finishedAt,
          duration_minutes: durationMinutes,
          status: "finished",
        })
        .eq("id", checkIn.id);

      if (error) {
        throw new Error(error.message || "Erro ao finalizar atendimento.");
      }

      toast.success("Atendimento finalizado.");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao finalizar atendimento.";
      toast.error(message);
    } finally {
      setFinishingId(null);
    }
  }

  if (barberLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Carregando operação de atendimento...
          </p>
        </div>
      </div>
    );
  }

  if (!barberProfile || !barber) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Perfil operacional não encontrado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Check-in</h1>
        <p className="text-sm text-muted-foreground">
          Registre chegada do cliente e controle o início e o fim do atendimento.
        </p>
        <p className="text-sm text-muted-foreground">
          Perfil operacional: <span className="font-medium">{barber.full_name}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Contratos válidos agora</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeContractsCount}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Bookings ativos agora</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeBookingsCount}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Acesso para check-in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant={hasValidAccess ? "default" : "outline"}>
              {accessLabel}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Regra de acesso: contrato válido agora ou booking ativo agora.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Novo check-in</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Cliente</label>
              <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                    <UserPlus className="h-3.5 w-3.5" />
                    Novo cliente
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cadastro rápido de cliente</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Nome completo</Label>
                      <Input 
                        value={newClientName} 
                        onChange={(e) => setNewClientName(e.target.value)} 
                        placeholder="Nome do cliente"
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
                      className="w-full" 
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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">Selecione um cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Observações</label>
            <textarea
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {!hasValidAccess ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Você não pode registrar check-in agora porque não há contrato válido
              agora nem booking ativo.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleCreateCheckIn}
              disabled={savingCheckIn || !hasValidAccess || !selectedClientId}
            >
              {savingCheckIn ? "Registrando..." : "Registrar check-in"}
            </Button>

            <Button type="button" variant="outline" onClick={() => void loadData()}>
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Atendimentos recentes
        </h2>

        {enrichedCheckIns.length === 0 ? (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-10 text-center">
              <p className="text-base font-medium text-foreground">
                Nenhum check-in ainda.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Quando você registrar check-ins, eles aparecerão aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {enrichedCheckIns.map((checkIn) => {
              const canStart = !checkIn.started_at && !checkIn.finished_at;
              const canFinish = !!checkIn.started_at && !checkIn.finished_at;

              return (
                <Card key={checkIn.id} className="rounded-2xl shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-foreground">
                          {checkIn.clientName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Check-in em{" "}
                          {formatDateTime(checkIn.checked_in_at ?? checkIn.created_at)}
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
                          {checkIn.duration_minutes !== null
                            ? `${checkIn.duration_minutes}min`
                            : "—"}
                        </p>
                      </div>
                    </div>

                    {checkIn.notes ? (
                      <div className="rounded-xl border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Observações</p>
                        <p className="mt-1 text-sm font-medium">{checkIn.notes}</p>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canStart || startingId === checkIn.id}
                        onClick={() => void handleStartAttendance(checkIn.id)}
                      >
                        {startingId === checkIn.id
                          ? "Iniciando..."
                          : "Iniciar atendimento"}
                      </Button>

                      <Button
                        type="button"
                        disabled={!canFinish || finishingId === checkIn.id}
                        onClick={() => void handleFinishAttendance(checkIn)}
                      >
                        {finishingId === checkIn.id
                          ? "Finalizando..."
                          : "Finalizar atendimento"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}