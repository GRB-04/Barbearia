import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { useNavigate } from "react-router-dom";
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
  CalendarDays,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  Pencil,
  FileText,
  ShieldOff,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface BarberClient {
  id: string;
  organization_id: string;
  barber_profile_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  first_appointment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeOptional(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function safeFormatDate(dateStr: string | null, formatStr: string) {
  if (!dateStr) return null;
  try {
    // Handle YYYY-MM-DD by appending time to avoid timezone shifts
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return null;
    return format(date, formatStr, { locale: ptBR });
  } catch (e) {
    return null;
  }
}

const DASHBOARD_CACHE_KEY = "barber-dashboard-cache-v1";
function clearDashboardCache() {
  sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
}

export default function ClientsPage() {
  const { barberProfile } = useBarberProfile();
  const navigate = useNavigate();

  const [clients, setClients] = useState<BarberClient[]>([]);
  const [filteredClients, setFilteredClients] = useState<BarberClient[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [anonymizingId, setAnonymizingId] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<BarberClient | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [firstAppointmentDate, setFirstAppointmentDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!barberProfile?.id || !barberProfile?.organization_id) return;
    fetchClients();
  }, [barberProfile?.id, barberProfile?.organization_id]);

  useEffect(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      setFilteredClients(clients);
      return;
    }

    setFilteredClients(
      clients.filter((client) => {
        return (
          client.full_name.toLowerCase().includes(term) ||
          (client.phone ?? "").toLowerCase().includes(term) ||
          (client.email ?? "").toLowerCase().includes(term)
        );
      })
    );
  }, [search, clients]);

  const resetForm = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setFirstAppointmentDate("");
    setNotes("");
    setSelectedClient(null);
  };

  const fillEditForm = (client: BarberClient) => {
    setSelectedClient(client);
    setFullName(client.full_name ?? "");
    setPhone(client.phone ?? "");
    setEmail(client.email ?? "");
    setFirstAppointmentDate(client.first_appointment_date ?? "");
    setNotes(client.notes ?? "");
  };

  const fetchClients = async () => {
    if (!barberProfile?.id) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("barber_clients")
        .select("*")
        .eq("barber_profile_id", barberProfile.id)
        .order("full_name", { ascending: true });

      if (error) {
        toast.error(error.message);
        setClients([]);
        return;
      }

      setClients((data as BarberClient[]) || []);
    } catch (error) {
      console.error("[ClientsPage] fetchClients error:", error);
      toast.error("Não foi possível carregar os clientes.");
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!barberProfile?.id || !barberProfile?.organization_id) {
      toast.error("Perfil do barbeiro não encontrado.");
      return;
    }

    if (!fullName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    setCreating(true);

    try {
      const { error } = await supabase.from("barber_clients").insert({
        organization_id: barberProfile.organization_id,
        barber_profile_id: barberProfile.id,
        full_name: fullName.trim(),
        phone: normalizeOptional(phone),
        email: normalizeOptional(email),
        first_appointment_date: normalizeOptional(firstAppointmentDate),
        notes: normalizeOptional(notes),
      } as any);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cliente criado com sucesso.");
      setCreateOpen(false);
      resetForm();
      clearDashboardCache();
      await fetchClients();
    } catch (error) {
      console.error("[ClientsPage] handleCreate error:", error);
      toast.error("Não foi possível criar o cliente.");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado.");
      return;
    }

    if (!fullName.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("barber_clients")
        .update({
          full_name: fullName.trim(),
          phone: normalizeOptional(phone),
          email: normalizeOptional(email),
          first_appointment_date: normalizeOptional(firstAppointmentDate),
          notes: normalizeOptional(notes),
        } as any)
        .eq("id", selectedClient.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cliente atualizado com sucesso.");
      setEditOpen(false);
      resetForm();
      await fetchClients();
    } catch (error) {
      console.error("[ClientsPage] handleSave error:", error);
      toast.error("Não foi possível atualizar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (clientId: string) => {
    setDeletingId(clientId);

    try {
      const { error } = await supabase
        .from("barber_clients")
        .delete()
        .eq("id", clientId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Cliente removido com sucesso.");
      clearDashboardCache();
      await fetchClients();
    } catch (error) {
      console.error("[ClientsPage] handleDelete error:", error);
      toast.error("Não foi possível remover o cliente.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAnonymize = async (client: BarberClient) => {
    const confirmed = window.confirm(
      `Anonimizar dados de "${client.full_name}"?\n\nEsta ação substitui os dados pessoais por valores genéricos, conforme a LGPD Art. 18. A ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setAnonymizingId(client.id);
    try {
      const { error } = await supabase
        .from("barber_clients")
        .update({
          full_name: "Cliente Anonimizado",
          phone: null,
          email: null,
          notes: null,
          first_appointment_date: null,
          is_anonymized: true,
          anonymized_at: new Date().toISOString(),
        } as any)
        .eq("id", client.id);

      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        organization_id: barberProfile?.organization_id ?? null,
        action: "anonymize_client",
        details: { client_id: client.id, reason: "LGPD Art. 18 — solicitação do titular" },
      } as any);

      toast.success("Dados do cliente anonimizados com sucesso (LGPD).");
      await fetchClients();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao anonimizar cliente.");
    } finally {
      setAnonymizingId(null);
    }
  };

  const totalClients = clients.length;
  const withPhoneCount = useMemo(
    () => clients.filter((client) => Boolean(client.phone)).length,
    [clients]
  );
  const withEmailCount = useMemo(
    () => clients.filter((client) => Boolean(client.email)).length,
    [clients]
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Meus clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre, edite e acompanhe sua base de clientes.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchClients}
            disabled={loading}
            className="rounded-xl"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar
          </Button>

          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Novo cliente
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Novo cliente</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nome completo"
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(91) 99999-9999"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="cliente@email.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Data do primeiro atendimento</Label>
                  <Input
                    type="date"
                    value={firstAppointmentDate}
                    onChange={(e) => setFirstAppointmentDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Informações adicionais"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? "Salvando..." : "Criar cliente"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {totalClients}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
              <Phone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Com telefone
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {withPhoneCount}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Com email
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {withEmailCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou email"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando clientes...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>

          <p className="text-sm font-medium text-foreground">
            Nenhum cliente encontrado
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre um cliente para começar a montar sua base.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="rounded-3xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {client.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cliente do barbeiro
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                      <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Telefone
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {client.phone || "Não informado"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-3">
                      <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Email
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {client.email || "Não informado"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="mt-0.5 h-4 w-4" />
                    <span>
                      {safeFormatDate(client.first_appointment_date, "dd 'de' MMMM 'de' yyyy") 
                        ? `Primeiro atendimento em ${safeFormatDate(client.first_appointment_date, "dd 'de' MMMM 'de' yyyy")}`
                        : "Sem data de primeiro atendimento"}
                    </span>
                  </div>

                  {client.notes && (
                    <p className="text-xs text-muted-foreground">{client.notes}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => navigate(`/barber/clients/${client.id}/history`)}
                      disabled={!!(client as any).is_anonymized}
                    >
                      <FileText className="mr-1.5 h-4 w-4" />
                      Histórico
                    </Button>

                    <Dialog
                      open={editOpen && selectedClient?.id === client.id}
                      onOpenChange={(open) => {
                        setEditOpen(open);
                        if (!open) resetForm();
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          disabled={!!(client as any).is_anonymized}
                          onClick={() => {
                            fillEditForm(client);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          {(client as any).is_anonymized ? "Anonimizado" : "Editar"}
                        </Button>
                      </DialogTrigger>

                      <DialogContent className="max-w-xl">
                        <DialogHeader>
                          <DialogTitle>Editar cliente</DialogTitle>
                        </DialogHeader>

                        <form onSubmit={handleSave} className="space-y-4">
                          <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="Nome completo"
                              required
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Telefone</Label>
                              <Input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="(91) 99999-9999"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Email</Label>
                              <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="cliente@email.com"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Data do primeiro atendimento</Label>
                            <Input
                              type="date"
                              value={firstAppointmentDate}
                              onChange={(e) => setFirstAppointmentDate(e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Observações</Label>
                            <Input
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Informações adicionais"
                            />
                          </div>

                          <Button type="submit" className="w-full" disabled={saving}>
                            {saving ? "Salvando..." : "Salvar alterações"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>

                    {/* LGPD Anonymize button */}
                    {!(client as any).is_anonymized && (
                      <Button
                        variant="outline"
                        className="rounded-xl text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50"
                        disabled={anonymizingId === client.id}
                        onClick={() => void handleAnonymize(client)}
                        title="Anonimizar dados (LGPD Art. 18)"
                      >
                        <ShieldOff className="mr-1.5 h-4 w-4" />
                        {anonymizingId === client.id ? "Anonimizando..." : "Anonimizar"}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      className="rounded-xl text-destructive hover:text-destructive"
                      disabled={deletingId === client.id || !!(client as any).is_anonymized}
                      onClick={() => void handleDelete(client.id)}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      {deletingId === client.id ? "Removendo..." : "Excluir"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}