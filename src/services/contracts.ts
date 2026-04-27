import { supabase } from "@/integrations/supabase/client";

export type ContractStatus = "pending" | "active" | "ended" | "cancelled";
export type BillingCycle = "daily" | "weekly" | "monthly";

export type ActiveContractItem = {
  id: string;
  organization_id: string;
  barber_id: string;
  chair_id: string;
  start_date: string;
  end_date: string | null;
  billing_cycle: BillingCycle | null;
  price: number | null;
  status: ContractStatus;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  start_at: string | null;
  end_at: string | null;
};

export type MyContractListItem = ActiveContractItem & {
  chair_identifier: string | null;
  location_id: string | null;
  location_name: string | null;
};

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Usuário não autenticado.");
  }

  return user.id;
}

export async function getCurrentBarberProfileId(): Promise<string> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("barber_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Perfil do barbeiro não encontrado.");
  }

  return data.id;
}

export async function getCurrentBarberId(): Promise<string> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { data, error } = await supabase
    .from("barbers")
    .select("id")
    .eq("barber_profile_id", barberProfileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Barbeiro não encontrado.");
  }

  return data.id;
}

export async function getMyContracts(): Promise<MyContractListItem[]> {
  const barberId = await getCurrentBarberId();

  const { data: contractsData, error: contractsError } = await supabase
    .from("contracts")
    .select(`
      id,
      organization_id,
      barber_id,
      chair_id,
      start_date,
      end_date,
      billing_cycle,
      price,
      status,
      notes,
      created_at,
      updated_at,
      start_at,
      end_at
    `)
    .eq("barber_id", barberId)
    .order("start_at", { ascending: false });

  if (contractsError) {
    throw new Error(contractsError.message || "Erro ao carregar contratos.");
  }

  const contracts = (contractsData ?? []) as ActiveContractItem[];

  if (contracts.length === 0) {
    return [];
  }

  const chairIds = Array.from(
    new Set(contracts.map((contract) => contract.chair_id).filter(Boolean))
  );

  const { data: chairsData, error: chairsError } = await supabase
    .from("chairs")
    .select("id, identifier, location_id")
    .in("id", chairIds);

  if (chairsError) {
    throw new Error(chairsError.message || "Erro ao carregar cadeiras.");
  }

  const chairs =
    (chairsData as Array<{
      id: string;
      identifier: string | null;
      location_id: string;
    }>) ?? [];

  const locationIds = Array.from(
    new Set(chairs.map((chair) => chair.location_id).filter(Boolean))
  );

  const { data: locationsData, error: locationsError } = await supabase
    .from("locations")
    .select("id, name")
    .in("id", locationIds);

  if (locationsError) {
    throw new Error(locationsError.message || "Erro ao carregar unidades.");
  }

  const locations =
    (locationsData as Array<{
      id: string;
      name: string;
    }>) ?? [];

  const chairsMap = new Map(chairs.map((chair) => [chair.id, chair]));
  const locationsMap = new Map(
    locations.map((location) => [location.id, location])
  );

  return contracts.map((contract) => {
    const chair = chairsMap.get(contract.chair_id);
    const location = chair ? locationsMap.get(chair.location_id) : null;

    return {
      ...contract,
      chair_identifier: chair?.identifier ?? null,
      location_id: chair?.location_id ?? null,
      location_name: location?.name ?? null,
    };
  });
}

export async function getMyCurrentActiveContracts(): Promise<ActiveContractItem[]> {
  const barberId = await getCurrentBarberId();
  const now = new Date();

  const { data, error } = await supabase
    .from("contracts")
    .select(`
      id,
      organization_id,
      barber_id,
      chair_id,
      start_date,
      end_date,
      billing_cycle,
      price,
      status,
      notes,
      created_at,
      updated_at,
      start_at,
      end_at
    `)
    .eq("barber_id", barberId)
    .eq("status", "active")
    .not("start_at", "is", null)
    .not("end_at", "is", null)
    .order("start_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Erro ao carregar contratos ativos.");
  }

  const contracts = (data ?? []) as ActiveContractItem[];

  return contracts.filter((contract) => {
    if (!contract.start_at || !contract.end_at) {
      return false;
    }

    const start = new Date(contract.start_at);
    const end = new Date(contract.end_at);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }

    return start <= now && end >= now;
  });
}

export async function getMyCurrentContract(): Promise<ActiveContractItem | null> {
  const contracts = await getMyCurrentActiveContracts();
  return contracts[0] ?? null;
}

export async function getMyActiveContracts(): Promise<ActiveContractItem[]> {
  return getMyCurrentActiveContracts();
}
