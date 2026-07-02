import { supabase } from "@/integrations/supabase/client";

export type ContractStatus = "pending" | "active" | "ended" | "cancelled" | "voided";

export type MyContractListItem = {
  id: string;
  organization_id: string;
  barber_profile_id: string | null;
  chair_id: string;
  booking_id: string | null;
  start_at: string | null;
  end_at: string | null;
  billing_cycle: string | null;
  price: number | null;
  status: ContractStatus;
  notes: string | null;
  created_at: string | null;
  chair_identifier: string | null;
  location_id: string | null;
  location_name: string | null;
};

async function getCurrentBarberProfileId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Usuário não autenticado.");
  }

  const { data, error: profileError } = await supabase
    .from("barber_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !data) {
    throw new Error("Perfil do barbeiro não encontrado.");
  }

  return data.id;
}

export async function getMyContracts(): Promise<MyContractListItem[]> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { data, error } = await supabase
    .from("contracts")
    .select(`
      id,
      organization_id,
      barber_profile_id,
      chair_id,
      booking_id,
      start_at,
      end_at,
      billing_cycle,
      price,
      status,
      notes,
      created_at,
      chairs ( identifier, location_id, locations ( id, name ) )
    `)
    .eq("barber_profile_id", barberProfileId)
    .order("start_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Erro ao carregar contratos.");
  }

  return ((data ?? []) as any[]).map((row) => {
    const chair = row.chairs;
    const location = Array.isArray(chair?.locations)
      ? chair.locations[0]
      : chair?.locations;

    return {
      id: row.id,
      organization_id: row.organization_id,
      barber_profile_id: row.barber_profile_id,
      chair_id: row.chair_id,
      booking_id: row.booking_id,
      start_at: row.start_at,
      end_at: row.end_at,
      billing_cycle: row.billing_cycle,
      price: row.price,
      status: row.status as ContractStatus,
      notes: row.notes,
      created_at: row.created_at,
      chair_identifier: chair?.identifier ?? null,
      location_id: chair?.location_id ?? null,
      location_name: location?.name ?? null,
    };
  });
}

export async function getMyCurrentActiveContracts(): Promise<MyContractListItem[]> {
  const now = new Date().toISOString();
  const contracts = await getMyContracts();

  return contracts.filter(
    (c) =>
      c.status === "active" &&
      c.start_at != null &&
      c.end_at != null &&
      c.start_at <= now &&
      c.end_at >= now
  );
}

export async function getMyCurrentContract(): Promise<MyContractListItem | null> {
  const contracts = await getMyCurrentActiveContracts();
  return contracts[0] ?? null;
}

export async function getMyActiveContracts(): Promise<MyContractListItem[]> {
  return getMyCurrentActiveContracts();
}
