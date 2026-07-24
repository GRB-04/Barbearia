import { useEffect, useMemo, useState } from "react";
import {
  Plus, User, Mail, Phone, Trash2, Copy, Share2, Star, Shield,
  Scissors, UserCog, ClipboardList, Users, ChevronDown, CheckCircle2,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type MemberRole = "barber" | "manager" | "receptionist";

type TeamMember = {
  id: string;
  barber_profile_id: string | null;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  role?: "owner" | "manager" | "receptionist" | "barber";
};

const ROLE_CONFIG = {
  manager: {
    label: "Gerente",
    icon: UserCog,
    badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
    description: "Gerencia uma unidade específica",
  },
  barber: {
    label: "Barbeiro",
    icon: Scissors,
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
    description: "Atende clientes e gerencia cadeiras",
  },
  receptionist: {
    label: "Recepcionista",
    icon: ClipboardList,
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
    description: "Realiza check-in e controle de entrada",
  },
} as const;

export default function TeamPage() {
  const { organization, loading: orgLoading } = useOrganization();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avgRatings, setAvgRatings] = useState<Record<string, number>>({});
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("barber");

  const loadMembers = async () => {
    if (!organization?.id) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("organization_barbers")
      .select("id, barber_profile_id, organization_id, full_name, email, phone, user_id, role")
      .eq("organization_id", organization.id)
      .neq("role", "owner")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[TeamPage] load error:", error);
      toast.error("Não foi possível carregar a equipe.");
      setMembers([]);
      setLoading(false);
      return;
    }

    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);

    const profileIds = ((data as TeamMember[]) ?? [])
      .map((b) => b.barber_profile_id)
      .filter(Boolean) as string[];

    if (profileIds.length > 0) {
      const { data: ratingsData } = await supabase
        .from("barber_ratings")
        .select("barber_profile_id, rating")
        .in("barber_profile_id", profileIds);

      if (ratingsData && ratingsData.length > 0) {
        const grouped: Record<string, number[]> = {};
        for (const r of ratingsData as { barber_profile_id: string; rating: number }[]) {
          if (!grouped[r.barber_profile_id]) grouped[r.barber_profile_id] = [];
          grouped[r.barber_profile_id].push(r.rating);
        }
        const avgs: Record<string, number> = {};
        for (const [pid, ratings] of Object.entries(grouped)) {
          avgs[pid] = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        }
        setAvgRatings(avgs);
      }
    }
  };

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setNewRole("barber");
  };

  // Generate per-person invite link (includes email so the system can pre-match)
  const buildInviteLink = (memberEmail: string) => {
    if (!organization?.id) return "";
    const base = `${window.location.origin}/barber/auth`;
    const params = new URLSearchParams({ org: organization.id, email: memberEmail });
    return `${base}?${params.toString()}`;
  };

  const handleAddMember = async () => {
    if (!organization?.id) {
      toast.error("Organização não encontrada.");
      return;
    }

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    if (!normalizedName) { toast.error("Informe o nome."); return; }
    if (!normalizedEmail) { toast.error("Informe o e-mail."); return; }

    setSubmitting(true);

    try {
      const { data: existing } = await supabase
        .from("organization_barbers")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existing) {
        toast.error("Já existe um membro com esse e-mail nesta organização.");
        return;
      }

      // Auto-link if user already has an account
      const { data: profile } = await supabase
        .from("barber_profiles")
        .select("id, user_id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      const { data: inserted, error } = await supabase
        .from("organization_barbers")
        .insert({
          organization_id: organization.id,
          full_name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone || null,
          barber_profile_id: profile?.id || null,
          user_id: profile?.user_id || null,
          role: newRole,
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message || "Não foi possível adicionar o membro.");
        return;
      }

      toast.success(`${ROLE_CONFIG[newRole].label} adicionado! Agora compartilhe o link de convite.`);

      if (inserted?.id) setJustAddedId(inserted.id);

      resetForm();
      setDialogOpen(false);
      await loadMembers();
    } catch (err: any) {
      toast.error("Erro inesperado ao adicionar membro.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja remover ${member.full_name} da equipe?`
    );
    if (!confirmed) return;

    if (member.barber_profile_id) {
      const { data: relatedContracts } = await supabase
        .from("contracts")
        .select("id")
        .eq("barber_profile_id", member.barber_profile_id)
        .limit(1);

      if (relatedContracts && relatedContracts.length > 0) {
        toast.error("Não é possível remover: este membro possui contratos vinculados.");
        return;
      }
    }

    const { error } = await supabase.from("organization_barbers").delete().eq("id", member.id);

    if (error) {
      if (error.code === "23503") {
        toast.error("Não é possível remover: o membro possui histórico de atendimentos.");
      } else {
        toast.error("Não foi possível remover. " + error.message);
      }
      return;
    }

    toast.success(`${member.full_name} removido da equipe.`);
    if (justAddedId === member.id) setJustAddedId(null);
    await loadMembers();
  };

  const handleChangeRole = async (memberId: string, role: string) => {
    setChangingRoleId(memberId);
    try {
      const { error } = await supabase
        .from("organization_barbers")
        .update({ role: role as TeamMember["role"] })
        .eq("id", memberId);

      if (error) throw error;

      const member = members.find((b) => b.id === memberId);
      if (member?.barber_profile_id) {
        await supabase
          .from("barber_profiles")
          .update({ role: role as TeamMember["role"] })
          .eq("id", member.barber_profile_id);
      }

      toast.success("Papel atualizado com sucesso.");
      setMembers((prev) =>
        prev.map((b) => (b.id === memberId ? { ...b, role: role as TeamMember["role"] } : b))
      );
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar papel.");
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleCopyInviteLink = (memberEmail: string, memberName: string) => {
    const link = buildInviteLink(memberEmail);
    navigator.clipboard.writeText(link);
    toast.success(`Link de convite de ${memberName} copiado!`);
  };

  const handleShareWhatsApp = (memberEmail: string, memberName: string, role: MemberRole) => {
    const link = buildInviteLink(memberEmail);
    const roleLabel = ROLE_CONFIG[role]?.label ?? "membro da equipe";
    const text = encodeURIComponent(
      `Olá, ${memberName}! Você foi adicionado como *${roleLabel}* na Barber House. Acesse o link abaixo para criar sua senha e entrar no sistema:\n\n${link}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  // Group members by role
  const grouped = useMemo(() => {
    const groups: Record<MemberRole, TeamMember[]> = {
      manager: [],
      barber: [],
      receptionist: [],
    };
    for (const m of members) {
      const r = (m.role as MemberRole) || "barber";
      if (r in groups) groups[r].push(m);
    }
    return groups;
  }, [members]);

  const totalLabel = useMemo(() => {
    const n = members.length;
    return n === 0 ? "Nenhum membro" : n === 1 ? "1 membro" : `${n} membros`;
  }, [members.length]);

  if (orgLoading || loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
        <p className="text-muted-foreground">Organização não encontrada para este login.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground">{totalLabel} na organização</p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar membro
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar membro da equipe</DialogTitle>
              <DialogDescription>
                Cadastre o membro e defina o papel dele. Depois compartilhe o link de convite
                gerado para ele criar a senha e entrar no sistema.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Role selector — visual cards */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Papel na equipe</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["barber", "manager", "receptionist"] as MemberRole[]).map((r) => {
                    const cfg = ROLE_CONFIG[r];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all text-xs font-medium",
                          newRole === r
                            ? "border-primary bg-primary/5 text-primary shadow-sm"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{ROLE_CONFIG[newRole].description}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Nome completo</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="João Pedro"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao@email.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Telefone (opcional)</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(91) 99999-9999"
                />
              </div>

              {/* Preview invite link */}
              {email.trim() && (
                <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
                  <p className="text-xs font-semibold text-foreground">Link de convite pessoal</p>
                  <p className="text-[11px] break-all text-muted-foreground font-mono">
                    {buildInviteLink(email.trim().toLowerCase())}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { resetForm(); setDialogOpen(false); }}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button onClick={handleAddMember} disabled={submitting}>
                {submitting ? "Adicionando..." : "Adicionar e gerar link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty state */}
      {members.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">Nenhum membro ainda</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
            Adicione barbeiros, gerentes e recepcionistas para começar a usar o sistema de equipe.
          </p>
        </div>
      )}

      {/* Grouped sections */}
      {(["manager", "barber", "receptionist"] as MemberRole[]).map((role) => {
        const group = grouped[role];
        if (group.length === 0) return null;
        const cfg = ROLE_CONFIG[role];
        const Icon = cfg.icon;

        return (
          <div key={role} className="space-y-3">
            {/* Group header */}
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{cfg.label}s</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {group.length}
              </span>
            </div>

            <div className="grid gap-3">
              {group.map((member) => {
                const isLinked = Boolean(member.user_id && member.barber_profile_id);
                const memberRole = (member.role as MemberRole) || "barber";
                const isJustAdded = justAddedId === member.id;

                return (
                  <Card
                    key={member.id}
                    className={cn(
                      "rounded-2xl shadow-sm transition-all",
                      isJustAdded && "ring-2 ring-primary/40"
                    )}
                  >
                    <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold">{member.full_name}</h3>

                          {/* Account status */}
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border",
                            isLinked
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            {isLinked ? (
                              <><CheckCircle2 className="h-3 w-3" /> Ativo</>
                            ) : (
                              <><Clock className="h-3 w-3" /> Aguardando convite</>
                            )}
                          </span>

                          {/* Role badge */}
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border",
                            cfg.badge
                          )}>
                            <Shield className="h-3 w-3" />
                            {cfg.label}
                          </span>

                          {/* Rating */}
                          {member.barber_profile_id && avgRatings[member.barber_profile_id] != null && (
                            <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                              <Star className="h-3.5 w-3.5 fill-amber-400" />
                              {avgRatings[member.barber_profile_id].toFixed(1)}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{member.email || "E-mail não informado"}</span>
                          </div>
                          {member.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span>{member.phone}</span>
                            </div>
                          )}
                        </div>

                        {/* Invite link for pending members */}
                        {!isLinked && member.email && (
                          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs space-y-1.5">
                            <p className="font-semibold text-amber-800">Envie o link de convite para este membro criar a senha:</p>
                            <p className="font-mono break-all text-amber-700">
                              {buildInviteLink(member.email)}
                            </p>
                            <div className="flex gap-2 pt-0.5">
                              <button
                                onClick={() => handleCopyInviteLink(member.email!, member.full_name)}
                                className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-medium"
                              >
                                <Copy className="h-3 w-3" /> Copiar
                              </button>
                              <button
                                onClick={() => handleShareWhatsApp(member.email!, member.full_name, memberRole)}
                                className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium"
                              >
                                <Share2 className="h-3 w-3" /> WhatsApp
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-2 flex-wrap">
                        <Select
                          value={memberRole}
                          onValueChange={(val) => void handleChangeRole(member.id, val)}
                          disabled={changingRoleId === member.id}
                        >
                          <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
                            <SelectValue placeholder="Papel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="barber">Barbeiro</SelectItem>
                            <SelectItem value="manager">Gerente</SelectItem>
                            <SelectItem value="receptionist">Recepcionista</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1.5 rounded-xl"
                          onClick={() => void handleDeleteMember(member)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}