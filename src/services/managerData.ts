import { supabase } from "@/integrations/supabase/client";

export type ManagerBookingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  created_at: string;
  chair_identifier: string | null;
  barber_full_name: string | null;
};

export async function fetchLocationInfo(locationId: string) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, address")
    .eq("id", locationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchLocationBookings(
  locationId: string,
  onlyPending: boolean
): Promise<ManagerBookingRow[]> {
  let query = supabase
    .from("chair_bookings")
    .select(
      `
      id,
      status,
      start_at,
      end_at,
      notes,
      created_at,
      chairs!inner ( identifier, location_id ),
      barber_profiles ( full_name )
    `
    )
    .eq("chairs.location_id", locationId)
    .order("created_at", { ascending: false });

  if (onlyPending) {
    query = query.eq("status", "pending");
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    status: row.status,
    start_at: row.start_at,
    end_at: row.end_at,
    notes: row.notes,
    created_at: row.created_at,
    chair_identifier: row.chairs?.identifier ?? null,
    barber_full_name: row.barber_profiles?.full_name ?? null,
  }));
}

export async function updateBookingStatus(
  bookingId: string,
  status: "confirmed" | "rejected"
) {
  const { error } = await supabase
    .from("chair_bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) throw error;
}

export async function fetchLocationChairs(locationId: string) {
  const { data, error } = await supabase
    .from("chairs")
    .select("*")
    .eq("location_id", locationId)
    .order("identifier", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchLocationContracts(locationId: string) {
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      *,
      chairs!inner ( identifier, location_id ),
      barber_profiles ( full_name )
    `
    )
    .eq("chairs.location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as any[];
}

// Barbeiros distintos com reservas no ponto
export async function fetchLocationBarbers(locationId: string) {
  const { data, error } = await supabase
    .from("chair_bookings")
    .select(
      `
      barber_profile_id,
      barber_profiles ( id, full_name, email, phone ),
      chairs!inner ( location_id )
    `
    )
    .eq("chairs.location_id", locationId);

  if (error) throw error;

  const seen = new Map<string, any>();
  ((data ?? []) as any[]).forEach((row) => {
    const p = row.barber_profiles;
    if (p?.id && !seen.has(p.id)) seen.set(p.id, p);
  });

  return Array.from(seen.values()) as {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  }[];
}

export async function updateChairStatus(chairId: string, status: string) {
  const { error } = await supabase
    .from("chairs")
    .update({ status })
    .eq("id", chairId);

  if (error) throw error;
}

export type ManagerPaymentRow = {
  id: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  reference: string | null;
  barber_full_name: string | null;
  chair_identifier: string | null;
  booking_start_at: string | null;
};

export async function fetchLocationPayments(
  locationId: string
): Promise<ManagerPaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      amount,
      status,
      due_date,
      paid_at,
      payment_method,
      reference,
      chair_bookings!inner (
        start_at,
        chairs!inner ( identifier, location_id ),
        barber_profiles ( full_name )
      )
    `
    )
    .eq("chair_bookings.chairs.location_id", locationId)
    .order("due_date", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((row: any) => row.chair_bookings?.chairs?.location_id === locationId)
    .map((row) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      due_date: row.due_date,
      paid_at: row.paid_at,
      payment_method: row.payment_method,
      reference: row.reference,
      barber_full_name: row.chair_bookings?.barber_profiles?.full_name ?? null,
      chair_identifier: row.chair_bookings?.chairs?.identifier ?? null,
      booking_start_at: row.chair_bookings?.start_at ?? null,
    }));
}

export async function registerManualPayment(paymentId: string, method: string) {
  const { error } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: method,
      reference: `MANUAL_${Date.now()}`,
    })
    .eq("id", paymentId);

  if (error) throw error;
}
