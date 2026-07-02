import { useEffect, useMemo, useState } from "react";
import { Plus, User, Mail, Phone, Trash2, Copy, Share2, Star, Shield } from "lucide-react";
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

type BarberRow = {
  id: string;
  barber_profile_id: string | null;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  role?: "owner" | "manager" | "receptionist" | "barber";
};

export default function BarbersPage() {
  const { organization, loading: orgLoading } = useOrganization();

  const [barbers, setBarbers] = useState<BarberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avgRatings, setAvgRatings] = useState<Record<string, number>>({});
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const loadBarbers = async () => {
    if (!organization?.id) {
      setBarbers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("organization_barbers")
      .select(
        "id, barber_profile_id, organization_id, full_name, email, phone, user_id, role"
      )
      .eq("organization_id", organization.id)
      .neq("role", "manager")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[BarbersPage] load error:", error);
      toast.error("Não foi possível carregar os barbeiros.");
      setBarbers([]);
      setLoading(false);
      return;
    }

    setBarbers((data as BarberRow[]) ?? []);
    setLoading(false);

    // Load ratings for each barber_profile_id
    const profileIds = ((data as BarberRow[]) ?? [])
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
    void loadBarbers();
  }, [organization?.id]);

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhone("");
  };

  const handleAddBarber = async () => {
    if (!organization?.id) {
      toast.error("Organização não encontrada.");
      return;
    }

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    if (!normalizedName) {
      toast.error("Informe o nome do barbeiro.");
      return;
    }

    if (!normalizedEmail) {
      toast.error("Informe o e-mail do barbeiro.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: existingBarber, error: existingBarberError } = await supabase
        .from("organization_barbers")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingBarberError) {
        console.error(
          "[BarbersPage] existing barber lookup error:",
          existingBarberError
        );
        toast.error("Não foi possível validar o e-mail do barbeiro.");
        setSubmitting(false);
        return;
      }

      if (existingBarber) {
        toast.error("Já existe um barbeiro com esse e-mail nesta barbearia.");
        setSubmitting(false);
        return;
      }

      // Auto-link se o barbeiro já tiver criado a conta
      const { data: profile } = await supabase
        .from("barber_profiles")
        .select("id, user_id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      const { error } = await supabase.from("organization_barbers").insert({
        organization_id: organization.id,
        full_name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
        barber_profile_id: profile?.id || null,
        user_id: profile?.user_id || null,
      });

      if (error) {
        console.error("[BarbersPage] insert barber error:", error);
        toast.error(error.message || "Não foi possível adicionar o barbeiro.");
        setSubmitting(false);
        return;
      }

      toast.success("Barbeiro adicionado com sucesso.");
      resetForm();
      setDialogOpen(false);
      await loadBarbers();
    } catch (error) {
      console.error("[BarbersPage] unexpected add barber error:", error);
      toast.error("Erro inesperado ao adicionar o barbeiro.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBarber = async (barber: BarberRow) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja remover este barbeiro da organização?"
    );

    if (!confirmed) return;

    if (barber.barber_profile_id) {
      const { data: relatedContracts } = await supabase
        .from("contracts")
        .select("id")
        .eq("barber_profile_id", barber.barber_profile_id)
        .limit(1);

      if (relatedContracts && relatedContracts.length > 0) {
        toast.error(
          "Não é possível remover este barbeiro pois ele possui contratos vinculados. Exclua os contratos primeiro na aba 'Contratos'."
        );
        return;
      }
    }

    const { error } = await supabase.from("organization_barbers").delete().eq("id", barber.id);

    if (error) {
      console.error("[BarbersPage] delete barber error:", error);
      if (error.code === "23503") {
        toast.error("Não é possível remover: o barbeiro possui histórico (atendimentos/reservas).");
      } else {
        toast.error("Não foi possível remover o barbeiro. " + error.message);
      }
      return;
    }

    toast.success("Barbeiro removido com sucesso.");
    await loadBarbers();
  };

  const handleChangeRole = async (barberId: string, newRole: string) => {
    setChangingRoleId(barberId);
    try {
      const { error } = await supabase
        .from("organization_barbers")
        .update({ role: newRole } as any)
        .eq("id", barberId);

      if (error) throw error;

      // Also update barber_profiles if linked
      const barber = barbers.find((b) => b.id === barberId);
      if (barber?.barber_profile_id) {
        await supabase
          .from("barber_profiles")
          .update({ role: newRole } as any)
          .eq("id", barber.barber_profile_id);
      }

      toast.success("Papel atualizado com sucesso.");
      setBarbers((prev) =>
        prev.map((b) => (b.id === barberId ? { ...b, role: newRole as any } : b))
      );
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar papel.");
    } finally {
      setChangingRoleId(null);
    }
  };

  const inviteLink = useMemo(() => {
    if (!organization?.id) return "";
    return `${window.location.origin}/barber/auth?org=${organization.id}`;
  }, [organization?.id]);

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    toast.success("Link de convite copiado para a área de transferência!");
  };

  const handleShareWhatsApp = () => {
    if (!inviteLink) return;
    const text = encodeURIComponent(
      `Olá! Venha fazer parte da nossa equipe no Barber Chair Connect. Acesse o link para criar seu perfil de barbeiro: ${inviteLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const barberCountLabel = useMemo(() => {
    if (barbers.length === 1) return "1 barbeiro";
    return `${barbers.length} barbeiros`;
  }, [barbers.length]);

  if (orgLoading || loading) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Barbeiros</h1>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Barbeiros</h1>
          <p className="text-muted-foreground">
            Organização não encontrada para este login.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Barbeiros</h1>
          <p className="text-muted-foreground">{barberCountLabel}</p>
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
              Adicionar barbeiro
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar barbeiro</DialogTitle>
              <DialogDescription>
                Cadastre o barbeiro na sua barbearia. Depois, ele poderá criar a
                conta usando o link da barbearia e o vínculo será concluído
                automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
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
                  placeholder="joaopedro123@gmail.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(91) 99999-9999"
                />
              </div>

              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Link da barbearia</p>
                <p className="mt-1 break-all text-muted-foreground">
                  {inviteLink}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setDialogOpen(false);
                }}
                disabled={submitting}
              >
                Cancelar
              </Button>

              <Button onClick={handleAddBarber} disabled={submitting}>
                {submitting ? "Adicionando..." : "Adicionar barbeiro"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-muted/30 border-dashed rounded-2xl">
        <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 text-center md:text-left">
            <h3 className="font-semibold text-base">Convidar Barbeiros</h3>
            <p className="text-sm text-muted-foreground">
              Compartilhe este link para que novos barbeiros se vinculem à sua organização.
            </p>
            <div className="mt-2 bg-background/50 px-3 py-1.5 rounded-lg border text-xs font-mono break-all text-primary/80">
              {inviteLink}
            </div>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={handleCopyLink}
            >
              <Copy className="h-4 w-4" />
              Copiar Link
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
              onClick={handleShareWhatsApp}
            >
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>

      {barbers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>

          <h2 className="mt-4 text-xl font-semibold">Nenhum barbeiro ainda</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adicione barbeiros para começar a usar o sistema.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {barbers.map((barber) => {
            const isLinked = Boolean(barber.user_id && barber.barber_profile_id);

            return (
              <Card key={barber.id} className="rounded-2xl shadow-sm">
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold">{barber.full_name}</h3>
                        {barber.barber_profile_id && avgRatings[barber.barber_profile_id] != null && (
                          <span className="flex items-center gap-1 text-sm text-amber-500">
                            <Star className="h-4 w-4 fill-amber-400" />
                            {avgRatings[barber.barber_profile_id].toFixed(1)}
                          </span>
                        )}
                        {/* Role badge */}
                        <span className={[
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          (barber.role as string) === "receptionist" ? "bg-blue-100 text-blue-700" :
                          (barber.role as string) === "manager" ? "bg-purple-100 text-purple-700" :
                          (barber.role as string) === "owner" ? "bg-amber-100 text-amber-700" :
                          "bg-muted text-muted-foreground"
                        ].join(" ")}>
                          <Shield className="h-3 w-3" />
                          {(barber.role as string) === "receptionist" ? "Recepcionista" :
                           (barber.role as string) === "manager" ? "Gerente" :
                           (barber.role as string) === "owner" ? "Owner" : "Barbeiro"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        ID operacional: {barber.id}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{barber.email || "E-mail não informado"}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{barber.phone || "Telefone não informado"}</span>
                      </div>

                      <div className="text-sm">
                        {isLinked ? (
                          <span className="text-emerald-600 font-medium">
                            Login vinculado ao perfil do barbeiro
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium">
                            Aguardando o barbeiro criar a conta pelo link da
                            barbearia
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 flex-wrap">
                    {/* Role changer */}
                    {(barber.role as string) !== "owner" && (
                      <Select
                        value={(barber.role as string) || "barber"}
                        onValueChange={(val) => void handleChangeRole(barber.id, val)}
                        disabled={changingRoleId === barber.id}
                      >
                        <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
                          <SelectValue placeholder="Papel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="barber">Barbeiro</SelectItem>
                          <SelectItem value="receptionist">Recepcionista</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => void handleDeleteBarber(barber)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}