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
  barber_profile_id?: string;
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

/**
 * Pure COALESCE logic: resolves the effective auto-confirm setting.
 * Rule: location override takes precedence over org default (null = inherit).
 *
 * @param orgAutoConfirm  - org-level default (never null, has a DB default of true)
 * @param locationOverride - location-level override (null = inherit from org)
 * @returns "confirmed" | "pending"
 */
export function resolveEffectiveAutoConfirm(
  orgAutoConfirm: boolean,
  locationOverride: boolean | null
): "confirmed" | "pending" {
  const effective = locationOverride ?? orgAutoConfirm;
  return effective ? "confirmed" : "pending";
}

type OrgAutoConfirmRow = { auto_confirm_bookings: boolean } | null;
type LocationAutoConfirmRow = { auto_confirm_bookings: boolean | null } | null;

type VwBarberBookingRow = {
  id: string;
  barber_profile_id: string;
  organization_id: string;
  chair_id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  chair_identifier: string | null;
  location_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  organization_name: string | null;
  payment_status: string | null;
  payment_id: string | null;
  payment_amount: number | null;
};

type PaymentRow = {
  id: string;
  booking_id: string | null;
  status: string;
  amount: number;
};

async function resolveBookingStatus(
  organizationId: string,
  chairId: string
): Promise<"confirmed" | "pending"> {
  // Fetch org default + location override in parallel
  const [orgRes, chairRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("auto_confirm_bookings")
      .eq("id", organizationId)
      .single(),
    supabase
      .from("chairs")
      .select("location_id")
      .eq("id", chairId)
      .single(),
  ]);

  const orgData = orgRes.data as OrgAutoConfirmRow;
  const orgAutoConfirm: boolean = orgData?.auto_confirm_bookings ?? true;

  if (chairRes.data?.location_id) {
    const locRes = await supabase
      .from("locations")
      .select("auto_confirm_bookings")
      .eq("id", chairRes.data.location_id)
      .single();

    const locData = locRes.data as LocationAutoConfirmRow;
    const locationOverride: boolean | null = locData?.auto_confirm_bookings ?? null;
    return resolveEffectiveAutoConfirm(orgAutoConfirm, locationOverride);
  }

  return resolveEffectiveAutoConfirm(orgAutoConfirm, null);
}

export async function createChairBooking(
  input: CreateChairBookingInput
): Promise<ChairBookingTimeRow> {
  const barberProfileId = await getCurrentBarberProfileId();
  const status = await resolveBookingStatus(input.organizationId, input.chairId);

  const { data, error } = await supabase
    .from("chair_bookings")
    .insert({
      chair_id: input.chairId,
      barber_profile_id: barberProfileId,
      organization_id: input.organizationId,
      start_at: input.startAt,
      end_at: input.endAt,
      status,
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
    .select("id, start_at, end_at, status, barber_profile_id")
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

  // Try using the view first, which is more efficient
  const { data, error } = await supabase
    .from("vw_barber_bookings")
    .select("*")
    .eq("barber_profile_id", barberProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    // Fallback to manual join if view fails (for backward compatibility during migration)
    const { data: bookingsData, error: bookingsError } = await supabase
      .from("chair_bookings")
      .select("*")
      .eq("barber_profile_id", barberProfileId)
      .order("created_at", { ascending: false });

    if (bookingsError) {
      throw new Error(bookingsError.message || "Erro ao carregar suas reservas.");
    }

    if (!bookingsData || bookingsData.length === 0) return [];

    const bookings = bookingsData;
    const chairIds = Array.from(new Set(bookings.map((booking) => booking.chair_id)));
    const organizationIds = Array.from(
      new Set(bookings.map((booking) => booking.organization_id))
    );
    const bookingIds = bookings.map((booking) => booking.id);

    type RawChair = {
      id: string;
      identifier: string | null;
      location_id: string | null;
      locations: { id: string; name: string; address: string | null; city: string | null; state: string | null } | null;
    };

    const [chairsRes, organizationsRes, paymentsRes] = await Promise.all([
      supabase
        .from("chairs")
        .select("id, identifier, location_id, locations(id, name, address, city, state)")
        .in("id", chairIds),
      supabase.from("organizations").select("id, name").in("id", organizationIds),
      supabase
        .from("payments")
        .select("id, booking_id, status, amount")
        .in("booking_id", bookingIds),
    ]);

    const chairMap = new Map<string, RawChair>();
    for (const chair of (chairsRes.data ?? []) as unknown as RawChair[]) {
      chairMap.set(chair.id, chair);
    }

    const organizationMap = new Map<string, { id: string; name: string }>();
    for (const organization of organizationsRes.data ?? []) {
      organizationMap.set(organization.id, organization);
    }

    const paymentMap = new Map<string, PaymentRow>();
    for (const payment of (paymentsRes.data ?? []) as unknown as PaymentRow[]) {
      if (payment.booking_id && !paymentMap.has(payment.booking_id)) {
        paymentMap.set(payment.booking_id, payment);
      }
    }

    return bookings.map((booking) => {
      const chair = chairMap.get(booking.chair_id);
      const location = chair?.locations;
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
        payment_amount: typeof payment?.amount === "number" ? payment.amount : null,
      };
    });
  }

  // If view succeeded, return the data mapped to the type
  return ((data ?? []) as unknown as VwBarberBookingRow[]).map((item) => ({
    id: item.id,
    barber_profile_id: item.barber_profile_id,
    organization_id: item.organization_id,
    chair_id: item.chair_id,
    start_at: item.start_at,
    end_at: item.end_at,
    booking_status: item.status,
    notes: item.notes,
    created_at: item.created_at,
    chair_identifier: item.chair_identifier ?? "Cadeira",
    location_name: item.location_name ?? "Local nao informado",
    location_address: item.location_address ?? null,
    location_city: item.location_city ?? null,
    location_state: item.location_state ?? null,
    organization_name: item.organization_name ?? "Barbearia",
    payment_status: item.payment_status ?? null,
    payment_id: item.payment_id ?? null,
    payment_amount: typeof item.payment_amount === "number" ? item.payment_amount : null,
  }));
}

export async function cancelMyBarberBooking(bookingId: string): Promise<void> {
  const barberProfileId = await getCurrentBarberProfileId();

  const { error } = await supabase
    .from("chair_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("barber_profile_id", barberProfileId)
    .in("status", ["pending", "confirmed"]);

  if (error) {
    throw new Error(error.message || "Erro ao cancelar reserva.");
  }
}

export { getMyChairBookings as listMyBarberBookings };
