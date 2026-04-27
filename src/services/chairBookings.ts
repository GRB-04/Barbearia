import { supabase } from "@/integrations/supabase/client";

export type ExploreChairItem = {
  chair_id: string;
  chair_identifier: string;
  chair_status: string;
  location_id: string;
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  organization_id: string;
  organization_name: string;
  is_available_now: boolean;
};

export type CreateChairBookingInput = {
  chairId: string;
  organizationId: string;
  startAt: string;
  endAt: string;
  notes?: string;
};

export type ChairBookingTimeRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
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

export async function listExploreChairs(): Promise<ExploreChairItem[]> {
  const { data, error } = await supabase
    .from("vw_public_chair_explore")
    .select("*")
    .order("organization_name", { ascending: true })
    .order("location_name", { ascending: true })
    .order("chair_identifier", { ascending: true });

  if (error) {
    throw new Error(error.message || "Erro ao carregar cadeiras.");
  }

  return (data ?? []) as ExploreChairItem[];
}

export async function createChairBooking(
  input: CreateChairBookingInput
): Promise<ChairBookingTimeRow> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { data, error } = await supabase
    .from("chair_bookings")
    .insert({
      chair_id: input.chairId,
      barber_profile_id: barberProfileId,
      organization_id: input.organizationId,
      start_at: input.startAt,
      end_at: input.endAt,
      status: "pending",
      notes: input.notes ?? null,
    })
    .select("id, start_at, end_at, status")
    .single();

  if (error) {
    throw new Error(error.message || "Erro ao criar reserva.");
  }

  return data as ChairBookingTimeRow;
}

export async function getChairBookingsByChairId(
  chairId: string
): Promise<ChairBookingTimeRow[]> {
  const { data, error } = await supabase
    .from("chair_bookings")
    .select("id, start_at, end_at, status")
    .eq("chair_id", chairId)
    .in("status", ["pending", "confirmed"])
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Erro ao carregar horários da cadeira.");
  }

  return (data ?? []) as ChairBookingTimeRow[];
}

export async function checkBarberAvailability(
  startAt: string,
  endAt: string
): Promise<boolean> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { data, error } = await supabase
    .from("chair_bookings")
    .select("id")
    .eq("barber_profile_id", barberProfileId)
    .in("status", ["pending", "confirmed"])
    .lt("start_at", endAt)
    .gt("end_at", startAt)
    .limit(1);

  if (error) {
    throw new Error(error.message || "Erro ao verificar disponibilidade do barbeiro.");
  }

  return (data ?? []).length === 0;
}

export type BarberBookingItem = {
  id: string;
  barber_profile_id: string;
  organization_id: string;
  chair_id: string;
  start_at: string;
  end_at: string;
  booking_status: string;
  notes: string | null;
  created_at: string;
  chair_identifier: string;
  location_name: string;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  organization_name: string;
  payment_status: string | null;
  payment_id: string | null;
  payment_amount: number | null;
};

export async function getMyChairBookings(): Promise<BarberBookingItem[]> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { data, error } = await supabase
    .from("chair_bookings")
    .select(
      "id, barber_profile_id, organization_id, chair_id, start_at, end_at, status, notes, created_at"
    )
    .eq("barber_profile_id", barberProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Erro ao carregar suas reservas.");
  }

  const bookings = (data ?? []) as Array<{
    id: string;
    barber_profile_id: string;
    organization_id: string;
    chair_id: string;
    start_at: string;
    end_at: string;
    status: string;
    notes: string | null;
    created_at: string;
  }>;

  if (bookings.length === 0) return [];

  const chairIds = Array.from(new Set(bookings.map((booking) => booking.chair_id)));
  const organizationIds = Array.from(
    new Set(bookings.map((booking) => booking.organization_id))
  );
  const bookingIds = bookings.map((booking) => booking.id);

  const [chairsRes, organizationsRes, paymentsRes] = await Promise.all([
    supabase
      .from("chairs")
      .select(
        "id, identifier, location_id, locations(id, name, address, city, state)"
      )
      .in("id", chairIds),
    supabase.from("organizations").select("id, name").in("id", organizationIds),
    (supabase as any)
      .from("payments")
      .select("id, booking_id, status, amount")
      .in("booking_id", bookingIds),
  ]);

  if (chairsRes.error) {
    throw new Error(chairsRes.error.message || "Erro ao carregar cadeiras.");
  }

  if (organizationsRes.error) {
    throw new Error(
      organizationsRes.error.message || "Erro ao carregar barbearias."
    );
  }

  if (paymentsRes.error) {
    throw new Error(paymentsRes.error.message || "Erro ao carregar pagamentos.");
  }

  const chairMap = new Map<string, any>();
  for (const chair of chairsRes.data ?? []) {
    chairMap.set(chair.id, chair);
  }

  const organizationMap = new Map<string, { id: string; name: string }>();
  for (const organization of organizationsRes.data ?? []) {
    organizationMap.set(organization.id, organization);
  }

  const paymentMap = new Map<string, any>();
  for (const payment of paymentsRes.data ?? []) {
    if (payment.booking_id && !paymentMap.has(payment.booking_id)) {
      paymentMap.set(payment.booking_id, payment);
    }
  }

  return bookings.map((booking) => {
    const chair = chairMap.get(booking.chair_id);
    const location = Array.isArray(chair?.locations)
      ? chair.locations[0]
      : chair?.locations;
    const organization = organizationMap.get(booking.organization_id);
    const payment = paymentMap.get(booking.id);

    return {
      id: booking.id,
      barber_profile_id: booking.barber_profile_id,
      organization_id: booking.organization_id,
      chair_id: booking.chair_id,
      start_at: booking.start_at,
      end_at: booking.end_at,
      booking_status: booking.status,
      notes: booking.notes,
      created_at: booking.created_at,
      chair_identifier: chair?.identifier ?? "Cadeira",
      location_name: location?.name ?? "Local nao informado",
      location_address: location?.address ?? null,
      location_city: location?.city ?? null,
      location_state: location?.state ?? null,
      organization_name: organization?.name ?? "Barbearia",
      payment_status: payment?.status ?? null,
      payment_id: payment?.id ?? null,
      payment_amount:
        typeof payment?.amount === "number" ? payment.amount : null,
    };
  });
}

