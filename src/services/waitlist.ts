import { supabase } from "@/integrations/supabase/client";

export type JoinWaitlistInput = {
  chairId: string;
  organizationId: string;
  locationId: string;
  desiredStartAt: string;
  desiredEndAt: string;
};

export type MyWaitlistEntry = {
  id: string;
  chair_id: string;
  desired_start_at: string;
  desired_end_at: string;
  status: string;
  hold_expires_at: string | null;
  created_at: string;
  chair_identifier: string;
  location_name: string;
  organization_id: string;
  queue_position: number | null;
};

export type LocationWaitlistEntry = {
  id: string;
  chair_id: string;
  chair_identifier: string;
  barber_name: string;
  desired_start_at: string;
  desired_end_at: string;
  status: string;
  hold_expires_at: string | null;
  created_at: string;
};

async function getCurrentBarberProfileId(): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Usuário não autenticado.");
  }

  const { data, error } = await supabase
    .from("barber_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    throw new Error("Perfil do barbeiro não encontrado.");
  }

  return data.id;
}

export function getFriendlyWaitlistError(message: string): string {
  const msg = (message || "").toLowerCase();
  if (msg.includes("uq_chair_waitlist_active_per_barber_chair") || msg.includes("duplicate key")) {
    return "Você já está na fila desta cadeira.";
  }
  if (msg.includes("reserve a cadeira diretamente")) {
    return "Este período está livre — reserve a cadeira diretamente.";
  }
  if (msg.includes("futuro")) {
    return "O período desejado deve estar no futuro.";
  }
  return message || "Erro ao entrar na fila.";
}

export async function joinWaitlist(input: JoinWaitlistInput): Promise<void> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { error } = await supabase.from("chair_waitlist").insert({
    chair_id: input.chairId,
    barber_profile_id: barberProfileId,
    organization_id: input.organizationId,
    location_id: input.locationId,
    desired_start_at: input.desiredStartAt,
    desired_end_at: input.desiredEndAt,
  });

  if (error) {
    throw new Error(getFriendlyWaitlistError(error.message));
  }
}

export async function listMyWaitlist(): Promise<MyWaitlistEntry[]> {
  const barberProfileId = await getCurrentBarberProfileId();

  const [entriesRes, positionsRes] = await Promise.all([
    supabase
      .from("chair_waitlist")
      .select("*, chairs(identifier, locations(name))")
      .eq("barber_profile_id", barberProfileId)
      .in("status", ["waiting", "hold"])
      .order("created_at", { ascending: false }),
    supabase.rpc("my_waitlist_positions"),
  ]);

  if (entriesRes.error) {
    throw new Error(entriesRes.error.message || "Erro ao carregar sua fila.");
  }

  if (positionsRes.error) {
    console.warn("Falha ao carregar posições da fila:", positionsRes.error.message);
  }

  const positionMap = new Map<string, number>();
  for (const p of positionsRes.data ?? []) {
    positionMap.set(p.entry_id, Number(p.queue_position));
  }

  return (entriesRes.data ?? []).map((row: any) => {
    const chair = Array.isArray(row.chairs) ? row.chairs[0] : row.chairs;
    const location = Array.isArray(chair?.locations) ? chair.locations[0] : chair?.locations;
    return {
      id: row.id,
      chair_id: row.chair_id,
      desired_start_at: row.desired_start_at,
      desired_end_at: row.desired_end_at,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
      created_at: row.created_at,
      chair_identifier: chair?.identifier ?? "Cadeira",
      location_name: location?.name ?? "Local não informado",
      organization_id: row.organization_id,
      queue_position: positionMap.get(row.id) ?? null,
    };
  });
}

export async function cancelWaitlistEntry(entryId: string): Promise<void> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { error } = await supabase
    .from("chair_waitlist")
    .update({ status: "cancelled" })
    .eq("id", entryId)
    .eq("barber_profile_id", barberProfileId)
    .in("status", ["waiting", "hold"]);

  if (error) {
    throw new Error(error.message || "Erro ao sair da fila.");
  }
}

export async function listLocationWaitlist(
  locationId: string
): Promise<LocationWaitlistEntry[]> {
  const { data, error } = await supabase
    .from("chair_waitlist")
    .select("*, chairs(identifier), barber_profiles(full_name)")
    .eq("location_id", locationId)
    .in("status", ["waiting", "hold"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Erro ao carregar fila do ponto.");
  }

  return (data ?? []).map((row: any) => {
    const chair = Array.isArray(row.chairs) ? row.chairs[0] : row.chairs;
    const barber = Array.isArray(row.barber_profiles) ? row.barber_profiles[0] : row.barber_profiles;
    return {
      id: row.id,
      chair_id: row.chair_id,
      chair_identifier: chair?.identifier ?? "Cadeira",
      barber_name: barber?.full_name ?? "Barbeiro",
      desired_start_at: row.desired_start_at,
      desired_end_at: row.desired_end_at,
      status: row.status,
      hold_expires_at: row.hold_expires_at,
      created_at: row.created_at,
    };
  });
}
