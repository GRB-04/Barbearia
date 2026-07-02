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
