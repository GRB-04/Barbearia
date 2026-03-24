import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, X } from "lucide-react";
import { format, isAfter, startOfToday } from "date-fns";
import { toast } from "sonner";

interface Booking {
  id: string;
  booking_date: string;
  status: string;
  price: number;
  chair_id: string;
}

interface BookingEnriched extends Booking {
  chair_identifier: string;
  location_name: string;
}

export default function MyBookingsPage() {
  const { barberProfile } = useBarberProfile();
  const [bookings, setBookings] = useState<BookingEnriched[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!barberProfile) return;
    fetchBookings();
  }, [barberProfile]);

  const fetchBookings = async () => {
    const { data } = await supabase
      .from("chair_bookings")
      .select("id, booking_date, status, price, chair_id")
      .eq("barber_profile_id", barberProfile!.id)
      .order("booking_date", { ascending: false });

    if (data && data.length > 0) {
      const chairIds = [...new Set(data.map((b) => b.chair_id))];
      const { data: chairs } = await supabase.from("chairs").select("id, identifier, location_id").in("id", chairIds);
      const locationIds = [...new Set((chairs || []).map((c) => c.location_id))];
      const { data: locations } = await supabase.from("locations").select("id, name").in("id", locationIds);

      const enriched: BookingEnriched[] = data.map((b) => {
        const chair = chairs?.find((c) => c.id === b.chair_id);
        const location = chair ? locations?.find((l) => l.id === chair.location_id) : null;
        return { ...b, chair_identifier: chair?.identifier || "?", location_name: location?.name || "Unknown" };
      });
      setBookings(enriched);
    }
    setLoading(false);
  };

  const cancelBooking = async (id: string) => {
    const { error } = await supabase
      .from("chair_bookings")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Booking cancelled.");
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    }
  };

  const today = startOfToday();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">My Bookings</h1>
        <p className="text-sm text-muted-foreground">View and manage your chair rentals.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings yet.</p>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const bookingDate = new Date(b.booking_date + "T00:00:00");
            const isFuture = isAfter(bookingDate, today) || format(bookingDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
            const canCancel = isFuture && b.status !== "cancelled";
            return (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {format(bookingDate, "EEEE, MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {b.location_name} — Chair {b.chair_identifier}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                    b.status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"
                  }`}>
                    {b.status}
                  </span>
                  {canCancel && (
                    <Button variant="ghost" size="sm" onClick={() => cancelBooking(b.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
