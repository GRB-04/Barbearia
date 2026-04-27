import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  RefreshCw,
  CalendarDays,
  Clock3,
  MapPin,
  Scissors,
  User,
} from "lucide-react";
import { motion } from "framer-motion";
import { format, differenceInHours, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Contract = Tables<"contracts">;
type Barber = Tables<"barbers">;
type Chair = Tables<"chairs">;
type Location = Tables<"locations">;

type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

interface DaySchedule {
  enabled: boolean;
  open: string | null;
  close: string | null;
}

type OperatingHours = Record<DayKey, DaySchedule>;

interface ContractRow extends Contract {
  barbers: Barber | null;
  chairs: Chair | null;
}

const statusBadge: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border border-amber-200",
  ended: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-rose-100 text-rose-700 border border-rose-200",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  ended: "Encerrado",
  cancelled: "Cancelado",
};

const billingCycleLabel: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

const dayNameToNumber: Record<string, DayKey> = {
  sunday: "0",
  monday: "1",
  tuesday: "2",
  wednesday: "3",
  thursday: "4",
  friday: "5",
  saturday: "6",
};

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseOperatingHours(value: unknown): OperatingHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const result = {} as OperatingHours;

  const keys: DayKey[] = ["0", "1", "2", "3", "4", "5", "6"];

  for (const key of keys) {
    const namedKey = Object.entries(dayNameToNumber).find(
      ([, dayNumber]) => dayNumber === key
    )?.[0];
    const raw = source[key] ?? (namedKey ? source[namedKey] : undefined);

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }

    const day = raw as Record<string, unknown>;

    if (typeof day.enabled === "boolean") {
      result[key] = {
        enabled: day.enabled,
        open: typeof day.open === "string" ? day.open : null,
        close: typeof day.close === "string" ? day.close : null,
      };
    } else {
      result[key] = {
        enabled: day.open !== false,
        open: typeof day.start === "string" ? day.start : null,
        close: typeof day.end === "string" ? day.end : null,
      };
    }
  }

  return result;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateToMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function getEffectiveStatus(contract: ContractRow): string {
  if (contract.status === "cancelled") return "cancelled";
  if (contract.status === "ended") return "ended";
  if (contract.status === "pending") return "pending";

  if (!contract.end_at) {
    return contract.status;
  }

  const end = new Date(contract.end_at);
  const now = new Date();

  if (Number.isNaN(end.getTime())) {
    return contract.status;
  }

  if (contract.status === "active" && end < now) {
    return "ended";
  }

  return contract.status;
}

export default function ContractsPage() {
  const { organization } = useOrganization();

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [chairs, setChairs] = useState<Chair[]>([]);
  const [locationsByChairId, setLocationsByChairId] = useState<Record<string, Location>>({});

  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [barberId, setBarberId] = useState("");
  const [chairId, setChairId] = useState("");
  const [startAt, setStartAt] = useState(() => {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    return formatDateTimeLocal(date);
  });
  const [endAt, setEndAt] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 4, 0, 0, 0);
    return formatDateTimeLocal(date);
  });
  const [price, setPrice] = useState("");
  const [billingCycle, setBillingCycle] = useState("daily");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!organization?.id) return;
    void fetchAll();
  }, [organization?.id]);

  const syncExpiredContracts = async () => {
    if (!organization?.id) return;

    const nowIso = new Date().toISOString();

    const { data: expiredContracts, error: expiredContractsError } = await supabase
      .from("contracts")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .lt("end_at", nowIso);

    if (expiredContractsError) {
      throw new Error(expiredContractsError.message || "Erro ao sincronizar contratos vencidos.");
    }

    if (!expiredContracts || expiredContracts.length === 0) {
      return;
    }

    const expiredIds = expiredContracts.map((contract) => contract.id);

    const { error: updateError } = await supabase
      .from("contracts")
      .update({ status: "ended" as Contract["status"] })
      .in("id", expiredIds);

    if (updateError) {
      throw new Error(updateError.message || "Erro ao encerrar contratos vencidos.");
    }
  };

  const fetchAll = async () => {
    if (!organization?.id) return;

    setLoading(true);

    try {
      await syncExpiredContracts();

      const [contractsRes, barbersRes, locationsRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("*")
          .eq("organization_id", organization.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("barbers")
          .select("*")
          .eq("organization_id", organization.id)
          .order("full_name", { ascending: true }),
        supabase.from("locations").select("*").eq("organization_id", organization.id),
      ]);

      const locations = (locationsRes.data as Location[]) || [];
      const locationIds = locations.map((location) => location.id);

      const chairsRes =
        locationIds.length > 0
          ? await supabase
              .from("chairs")
              .select("*")
              .in("location_id", locationIds)
              .order("identifier", { ascending: true })
          : { data: [], error: null };

      if (barbersRes.error) {
        toast.error(barbersRes.error.message);
        setBarbers([]);
      } else {
        setBarbers((barbersRes.data as Barber[]) || []);
      }

      if (chairsRes.error) {
        toast.error(chairsRes.error.message);
        setChairs([]);
      } else {
        setChairs((chairsRes.data as Chair[]) || []);
      }

      if (locationsRes.error) {
        toast.error(locationsRes.error.message);
        setLocationsByChairId({});
      } else {
        const byId = new Map(locations.map((location) => [location.id, location]));

        const mapping: Record<string, Location> = {};
        ((chairsRes.data as Chair[]) || []).forEach((chair) => {
          const location = byId.get(chair.location_id);
          if (location) {
            mapping[chair.id] = location;
          }
        });

        setLocationsByChairId(mapping);
      }

      if (contractsRes.error) {
        toast.error(contractsRes.error.message);
        setContracts([]);
      } else {
        const barberMap = new Map(
          ((barbersRes.data as Barber[]) || []).map((barber) => [barber.id, barber])
        );
        const chairMap = new Map(
          ((chairsRes.data as Chair[]) || []).map((chair) => [chair.id, chair])
        );

        setContracts(
          ((contractsRes.data as Contract[]) || []).map((contract) => ({
            ...contract,
            barbers: barberMap.get(contract.barber_id) ?? null,
            chairs: chairMap.get(contract.chair_id) ?? null,
          }))
        );
      }
    } catch (error) {
      console.error("[ContractsPage] fetchAll error:", error);
      toast.error("Não foi possível carregar os contratos.");
      setContracts([]);
      setBarbers([]);
      setChairs([]);
      setLocationsByChairId({});
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    const newStart = new Date();
    newStart.setMinutes(0, 0, 0);

    const newEnd = new Date(newStart);
    newEnd.setHours(newEnd.getHours() + 4);

    setBarberId("");
    setChairId("");
    setStartAt(formatDateTimeLocal(newStart));
    setEndAt(formatDateTimeLocal(newEnd));
    setPrice("");
    setBillingCycle("daily");
    setStatus("active");
    setNotes("");
  };

  const effectiveContracts = useMemo(
    () =>
      contracts.map((contract) => ({
        ...contract,
        effectiveStatus: getEffectiveStatus(contract),
      })),
    [contracts]
  );

  const activeCount = useMemo(
    () => effectiveContracts.filter((contract) => contract.effectiveStatus === "active").length,
    [effectiveContracts]
  );

  const pendingCount = useMemo(
    () => effectiveContracts.filter((contract) => contract.effectiveStatus === "pending").length,
    [effectiveContracts]
  );

  const endedCount = useMemo(
    () => effectiveContracts.filter((contract) => contract.effectiveStatus === "ended").length,
    [effectiveContracts]
  );

  const cancelledCount = useMemo(
    () => effectiveContracts.filter((contract) => contract.effectiveStatus === "cancelled").length,
    [effectiveContracts]
  );

  const validateOperatingHours = (selectedChairId: string, startDate: Date, endDate: Date) => {
    const location = locationsByChairId[selectedChairId];

    if (!location) {
      return "Não foi possível identificar o ponto da cadeira selecionada.";
    }

    const operatingHours = parseOperatingHours((location as unknown as { operating_hours?: unknown }).operating_hours);

    if (!operatingHours) {
      return "O ponto não possui horário de funcionamento configurado.";
    }

    const startDay = String(getDay(startDate)) as DayKey;
    const endDay = String(getDay(endDate)) as DayKey;

    if (startDay !== endDay) {
      return "O contrato deve começar e terminar no mesmo dia de funcionamento.";
    }

    const daySchedule = operatingHours[startDay];

    if (!daySchedule.enabled) {
      return "O ponto está fechado nesse dia.";
    }

    if (!daySchedule.open || !daySchedule.close) {
      return "O horário de funcionamento desse dia está incompleto.";
    }

    const openingMinutes = timeToMinutes(daySchedule.open);
    const closingMinutes = timeToMinutes(daySchedule.close);
    const startMinutes = dateToMinutes(startDate);
    const endMinutes = dateToMinutes(endDate);

    if (startMinutes < openingMinutes) {
      return `O contrato começa antes da abertura do ponto (${daySchedule.open}).`;
    }

    if (endMinutes > closingMinutes) {
      return `O contrato termina após o fechamento do ponto (${daySchedule.close}).`;
    }

    return null;
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization?.id) {
      toast.error("Organização não encontrada.");
      return;
    }

    if (!barberId || !chairId) {
      toast.error("Selecione o barbeiro e a cadeira.");
      return;
    }

    if (!price.trim()) {
      toast.error("Informe o valor do contrato.");
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    const priceNumber = Number(price);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error("Data ou hora inválida.");
      return;
    }

    if (!(endDate > startDate)) {
      toast.error("A data final deve ser maior que a data inicial.");
      return;
    }

    const durationHours = differenceInHours(endDate, startDate);
    if (durationHours < 4) {
      toast.error("O contrato deve ter no mínimo 4 horas.");
      return;
    }

    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    const operatingHoursError = validateOperatingHours(chairId, startDate, endDate);
    if (operatingHoursError) {
      toast.error(operatingHoursError);
      return;
    }

    setCreating(true);

    try {
      const { data: chairConflicts, error: chairConflictError } = await supabase
        .from("contracts")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("chair_id", chairId)
        .in("status", ["active", "pending"])
        .lt("start_at", endDate.toISOString())
        .gt("end_at", startDate.toISOString())
        .limit(1);

      if (chairConflictError) {
        toast.error(chairConflictError.message);
        setCreating(false);
        return;
      }

      if ((chairConflicts || []).length > 0) {
        toast.error("Essa cadeira já possui contrato nesse período.");
        setCreating(false);
        return;
      }

      const { data: barberConflicts, error: barberConflictError } = await supabase
        .from("contracts")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("barber_id", barberId)
        .in("status", ["active", "pending"])
        .lt("start_at", endDate.toISOString())
        .gt("end_at", startDate.toISOString())
        .limit(1);

      if (barberConflictError) {
        toast.error(barberConflictError.message);
        setCreating(false);
        return;
      }

      if ((barberConflicts || []).length > 0) {
        toast.error("Esse barbeiro já possui contrato ativo ou pendente nesse período.");
        setCreating(false);
        return;
      }

      const { error: insertError } = await supabase.from("contracts").insert({
        organization_id: organization.id,
        barber_id: barberId,
        chair_id: chairId,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        billing_cycle: billingCycle as Contract["billing_cycle"],
        price: priceNumber,
        status: status as Contract["status"],
        notes: notes.trim() || null,
      });

      if (insertError) {
        toast.error(insertError.message);
        setCreating(false);
        return;
      }

      if (status === "active") {
        const { error: chairUpdateError } = await supabase
          .from("chairs")
          .update({ status: "occupied" as Chair["status"] })
          .eq("id", chairId);

        if (chairUpdateError) {
          toast.error(chairUpdateError.message);
          setCreating(false);
          return;
        }
      }

      toast.success("Contrato criado com sucesso.");
      setOpen(false);
      resetForm();
      await fetchAll();
    } catch (error) {
      console.error("[ContractsPage] handleCreateContract error:", error);
      toast.error("Não foi possível criar o contrato.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Contratos
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os contratos e a alocação das cadeiras.
          </p>
        </div>

        <div className="flex gap-2">
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

          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Novo contrato
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo contrato</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreateContract} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Barbeiro</Label>
                    <Select value={barberId} onValueChange={setBarberId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um barbeiro" />
                      </SelectTrigger>
                      <SelectContent>
                        {barbers.map((barber) => (
                          <SelectItem key={barber.id} value={barber.id}>
                            {barber.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cadeira</Label>
                    <Select value={chairId} onValueChange={setChairId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma cadeira" />
                      </SelectTrigger>
                      <SelectContent>
                        {chairs.map((chair) => (
                          <SelectItem key={chair.id} value={chair.id}>
                            {chair.identifier ?? "Cadeira"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Início</Label>
                    <Input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Fim</Label>
                    <Input
                      type="datetime-local"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Valor do aluguel</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0,00"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Ciclo</Label>
                    <Select value={billingCycle} onValueChange={setBillingCycle}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o ciclo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diário</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="ended">Encerrado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observações do contrato"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? "Criando..." : "Criar contrato"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
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
      ) : effectiveContracts.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4">
          {effectiveContracts.map((contract) => {
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
                        {contract.chairs?.identifier ?? "Cadeira"}
                      </p>

                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                          statusBadge[contract.effectiveStatus] ??
                            "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {statusLabel[contract.effectiveStatus] ?? contract.effectiveStatus}
                      </span>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <User className="mt-0.5 h-4 w-4" />
                      <span>{contract.barbers?.full_name ?? "Barbeiro"}</span>
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

                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Scissors className="mt-0.5 h-4 w-4" />
                      <span>
                        R$ {Number(contract.price ?? 0).toFixed(2)} /{" "}
                        {billingCycleLabel[contract.billing_cycle || "daily"] ??
                          contract.billing_cycle}
                      </span>
                    </div>

                    {contract.notes && (
                      <p className="text-xs text-muted-foreground">{contract.notes}</p>
                    )}
                  </div>

                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4" />
                    <span>
                      {contract.chairs?.identifier
                        ? `Cadeira ${contract.chairs.identifier}`
                        : "Cadeira"}
                    </span>
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
            Crie um contrato para alocar uma cadeira a um barbeiro.
          </p>
        </div>
      )}
    </div>
  );
}
