import { supabase } from "@/integrations/supabase/client";

export type BarberBookingItem = {
  id: string;
  chair_id: string;
  organization_id: string;
  barber_profile_id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  chair_identifier: string;
  chair_status: string;
  location_id: string;
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  organization_name: string;
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

export async function listMyBarberBookings(): Promise<BarberBookingItem[]> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { data, error } = await supabase
    .from("chair_bookings")
    .select(`
      id,
      chair_id,
      organization_id,
      barber_profile_id,
      start_at,
      end_at,
      status,
      notes,
      created_at,
      updated_at
    `)
    .eq("barber_profile_id", barberProfileId)
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Erro ao carregar seus bookings.");
  }

  const bookings = (data ?? []) as Array<{
    id: string;
    chair_id: string;
    organization_id: string;
    barber_profile_id: string;
    start_at: string;
    end_at: string;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>;

  if (bookings.length === 0) {
    return [];
  }

  const chairIds = Array.from(new Set(bookings.map((item) => item.chair_id)));
  const organizationIds = Array.from(
    new Set(bookings.map((item) => item.organization_id))
  );

  const { data: chairsData, error: chairsError } = await supabase
    .from("chairs")
    .select(`
      id,
      identifier,
      status,
      location_id,
      locations (
        id,
        name,
        address,
        city,
        state,
        organization_id
      )
    `)
    .in("id", chairIds);

  if (chairsError) {
    throw new Error(
      chairsError.message || "Erro ao carregar cadeiras dos bookings."
    );
  }

  const { data: organizationsData, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", organizationIds);

  if (organizationsError) {
    throw new Error(
      organizationsError.message || "Erro ao carregar organizações dos bookings."
    );
  }

  const chairMap = new Map<string, any>();
  for (const chair of chairsData ?? []) {
    chairMap.set(chair.id, chair);
  }

  const organizationMap = new Map<string, { id: string; name: string }>();
  for (const organization of organizationsData ?? []) {
    organizationMap.set(organization.id, organization);
  }

  return bookings.map((booking) => {
    const chair = chairMap.get(booking.chair_id);
    const location = chair?.locations
      ? Array.isArray(chair.locations)
        ? chair.locations[0]
        : chair.locations
      : null;
    const organization = organizationMap.get(booking.organization_id);

    return {
      id: booking.id,
      chair_id: booking.chair_id,
      organization_id: booking.organization_id,
      barber_profile_id: booking.barber_profile_id,
      start_at: booking.start_at,
      end_at: booking.end_at,
      status: booking.status,
      notes: booking.notes,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      chair_identifier: chair?.identifier ?? "Cadeira",
      chair_status: chair?.status ?? "",
      location_id: chair?.location_id ?? "",
      location_name: location?.name ?? "Local não informado",
      address: location?.address ?? null,
      city: location?.city ?? null,
      state: location?.state ?? null,
      organization_name: organization?.name ?? "Barbearia",
    };
  });
}

export async function cancelMyBarberBooking(bookingId: string): Promise<void> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { error } = await supabase
    .from("chair_bookings")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("barber_profile_id", barberProfileId)
    .in("status", ["pending", "confirmed"]);

  if (error) {
    throw new Error(error.message || "Erro ao cancelar reserva.");
  }
}