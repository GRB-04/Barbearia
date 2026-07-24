import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, Loader2, QrCode, ShieldAlert, Scissors } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type BarberInfo = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organization_id: string | null;
  organization_name: string | null;
};

type Phase = "loading" | "ready" | "confirming" | "success" | "error" | "not_found";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getRoleLabel(role: string | null): string {
  if (role === "manager") return "Gerente";
  if (role === "receptionist") return "Recepcionista";
  return "Barbeiro Profissional";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AccessGatePage() {
  const { barberId } = useParams<{ barberId: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [barber, setBarber] = useState<BarberInfo | null>(null);
  const [accessTime, setAccessTime] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Load barber data on mount
  useEffect(() => {
    if (!barberId) {
      setPhase("not_found");
      return;
    }

    void (async () => {
      try {
        // Fetch barber_profile
        const { data: profile, error: profileError } = await supabase
          .from("barber_profiles")
          .select("id, full_name, email, phone, role, organization_id")
          .eq("id", barberId)
          .single();

        if (profileError || !profile) {
          setPhase("not_found");
          return;
        }

        let resolvedOrgId = profile.organization_id;

        // Fallback 1: check organization_barbers
        if (!resolvedOrgId) {
          const { data: obData } = await supabase
            .from("organization_barbers")
            .select("organization_id")
            .eq("barber_profile_id", barberId)
            .limit(1);
          if (obData && obData[0]?.organization_id) {
            resolvedOrgId = obData[0].organization_id;
          }
        }

        // Fallback 2: check contracts
        if (!resolvedOrgId) {
          const { data: ctData } = await supabase
            .from("contracts")
            .select("organization_id")
            .eq("barber_profile_id", barberId)
            .eq("status", "active")
            .limit(1);
          if (ctData && ctData[0]?.organization_id) {
            resolvedOrgId = ctData[0].organization_id;
          }
        }

        // Fallback 3: check chair_bookings
        if (!resolvedOrgId) {
          const { data: cbData } = await supabase
            .from("chair_bookings")
            .select("organization_id")
            .eq("barber_profile_id", barberId)
            .eq("status", "confirmed")
            .limit(1);
          if (cbData && cbData[0]?.organization_id) {
            resolvedOrgId = cbData[0].organization_id;
          }
        }

        // If the barber belongs to an org, fetch org name
        let orgName: string | null = null;
        if (resolvedOrgId) {
          const { data: org } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", resolvedOrgId)
            .single();
          orgName = org?.name ?? null;
        }

        setBarber({
          id: profile.id,
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          role: profile.role,
          organization_id: resolvedOrgId,
          organization_name: orgName,
        });
        setPhase("ready");
      } catch {
        setPhase("error");
        setErrorMsg("Erro inesperado ao carregar dados do barbeiro.");
      }
    })();
  }, [barberId]);

  async function handleGrantAccess() {
    if (!barber) return;

    setPhase("confirming");

    try {
      const now = new Date();
      const timeStr = formatTime(now);

      // 1. Register in audit_logs
      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "qr_access_granted",
        entity: "barber_profiles",
        entity_id: barber.id,
        organization_id: barber.organization_id,
        metadata: {
          barber_name: barber.full_name,
          access_method: "qr_code",
          granted_at: now.toISOString(),
          granted_via: "access_gate_page",
        },
      });

      if (auditError) {
        console.warn("[AccessGatePage] audit_logs warning:", auditError);
      }

      // 2. Also register in check_ins so it shows up in real-time in the reception dashboard
      if (barber.organization_id) {
        let clientId: string | null = null;

        const { data: existingClients } = await supabase
          .from("barber_clients")
          .select("id")
          .eq("organization_id", barber.organization_id)
          .limit(1);

        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id;
        } else {
          // Create default client entry for QR accesses
          const { data: newClient } = await supabase
            .from("barber_clients")
            .insert({
              organization_id: barber.organization_id,
              barber_profile_id: barber.id,
              full_name: `Barbeiro: ${barber.full_name}`,
              notes: "Acesso registrado via Crachá Digital (QR Code)",
            })
            .select("id")
            .single();

          if (newClient) {
            clientId = newClient.id;
          }
        }

        if (clientId) {
          await supabase.from("check_ins").insert({
            barber_profile_id: barber.id,
            client_id: clientId,
            organization_id: barber.organization_id,
            status: "checked_in",
            checked_in_at: now.toISOString(),
            notes: "Acesso via Crachá Digital (QR Code)",
          });
        }
      }

      // 3. Register in notifications table for barber, owner, and receptionists/staff
      if (barber.organization_id) {
        const targetUserIds = new Set<string>();

        if (barber.user_id) {
          targetUserIds.add(barber.user_id);
        }

        // Fetch org owner
        const { data: orgData } = await supabase
          .from("organizations")
          .select("owner_id")
          .eq("id", barber.organization_id)
          .single();

        if (orgData?.owner_id) {
          targetUserIds.add(orgData.owner_id);
        }

        // Fetch all staff members (receptionists, managers) in the organization
        const { data: staffMembers } = await supabase
          .from("organization_barbers")
          .select("user_id")
          .eq("organization_id", barber.organization_id);

        if (staffMembers) {
          for (const s of staffMembers) {
            if (s.user_id) targetUserIds.add(s.user_id);
          }
        }

        // Insert notification for each recipient user
        const notificationInserts = Array.from(targetUserIds).map((uid) => ({
          organization_id: barber.organization_id,
          user_id: uid,
          title: uid === barber.user_id
            ? "📱 Entrada Liberada via QR Code"
            : `📱 Acesso Liberado: ${barber.full_name}`,
          body: uid === barber.user_id
            ? `Sua entrada foi registrada na recepção com sucesso às ${timeStr}.`
            : `Entrada liberada na portaria via Crachá Digital às ${timeStr}.`,
          type: "qr_access",
        }));

        if (notificationInserts.length > 0) {
          await supabase.from("notifications").insert(notificationInserts);
        }
      }

      setAccessTime(now);
      setPhase("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao liberar acesso.";
      setErrorMsg(msg);
      setPhase("error");
    }
  }

  // ─── Render states ──────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-white">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
          <p className="text-sm text-slate-300">Verificando identidade...</p>
        </div>
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">QR Code Inválido</h1>
          <p className="text-sm text-slate-400">
            Este QR Code não corresponde a nenhum barbeiro cadastrado no sistema.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Erro</h1>
          <p className="text-sm text-slate-400">{errorMsg || "Tente novamente em instantes."}</p>
          <button
            onClick={() => {
              setPhase("ready");
              setErrorMsg("");
            }}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (phase === "success" && barber && accessTime) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          {/* Success Icon */}
          <div className="mx-auto w-24 h-24 rounded-full bg-emerald-400/20 flex items-center justify-center ring-4 ring-emerald-400/30">
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          </div>

          {/* Success text */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Acesso Liberado!</h1>
            <p className="text-emerald-300 text-lg font-semibold">{barber.full_name}</p>
            {barber.organization_name && (
              <p className="text-sm text-emerald-400/70">{barber.organization_name}</p>
            )}
          </div>

          {/* Timestamp */}
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-2xl px-5 py-3 text-white">
            <Clock className="h-4 w-4 text-emerald-300" />
            <span className="text-sm font-medium">
              Entrada registrada às <strong>{formatTime(accessTime)}</strong>
            </span>
          </div>

          {/* Secondary info */}
          <p className="text-xs text-emerald-400/50">
            Acesso registrado no sistema BarberHouse Connect
          </p>
        </div>
      </div>
    );
  }

  // ─── Ready / Confirming state ────────────────────────────────────────────────

  const isConfirming = phase === "confirming";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-4 py-10">
      {/* Header brand */}
      <div className="flex items-center gap-2 text-slate-400 text-xs mb-10">
        <Scissors className="h-3.5 w-3.5" />
        <span>BarberHouse Connect</span>
      </div>

      {/* Main card */}
      <div className="w-full max-w-sm space-y-6">
        {/* Identity card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 space-y-5">
          {/* QR scan indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">QR Code Verificado</span>
            </div>
            <QrCode className="h-4 w-4 text-slate-400" />
          </div>

          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-lg">
              {barber && getInitials(barber.full_name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{barber?.full_name}</h1>
              <p className="text-sm text-slate-400">{getRoleLabel(barber?.role ?? null)}</p>
              {barber?.organization_name && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{barber.organization_name}</p>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">ID do Crachá</span>
              <span className="text-slate-300 font-mono truncate max-w-[160px]">
                {barber?.id.slice(0, 8)}...
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Status</span>
              <span className="text-emerald-400 font-medium">Ativo no sistema</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={() => void handleGrantAccess()}
          disabled={isConfirming}
          className={`
            w-full flex items-center justify-center gap-3
            rounded-2xl py-5 text-lg font-bold text-white
            shadow-lg shadow-emerald-900/40 transition-all duration-200
            active:scale-95 select-none
            ${isConfirming
              ? "bg-slate-600 cursor-not-allowed"
              : "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600"
            }
          `}
        >
          {isConfirming ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Registrando...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-6 w-6" />
              Liberar Acesso
            </>
          )}
        </button>

        {/* Instruction */}
        <p className="text-center text-xs text-slate-500 px-4">
          Pressione o botão acima para confirmar a entrada do barbeiro e registrar o acesso no sistema.
        </p>
      </div>
    </div>
  );
}
