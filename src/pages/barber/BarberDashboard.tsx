import { useEffect, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, MapPin } from "lucide-react";
import { format, isAfter, startOfToday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface BookingWithDetails {
  id: string;
  booking_date: string;
  status: string;
  price: number;
  chair: { identifier: string; location: { name: string; city: string | null } } | null;
}

export default function BarberDashboard() {
  const { barberProfile } = useBarberProfile();
  const [upcomingBookings, setUpcomingBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!barberProfile) return;
    fetchUpcoming();
  }, [barberProfile]);

  const fetchUpcoming = async () => {
    const today = format(startOfToday(), "yyyy-MM-dd");
    const { data } = await supabase
      .from("chair_bookings")
      .select("id, booking_date, status, price, chair_id")
      .eq("barber_profile_id", barberProfile!.id)
      .gte("booking_date", today)
      .neq("status", "cancelled")
      .order("booking_date", { ascending: true })
      .limit(5);

    if (data && data.length > 0) {
      const chairIds = data.map((b) => b.chair_id);
      const { data: chairs } = await supabase
        .from("chairs")
        .select("id, identifier, location_id")
        .in("id", chairIds);

      const locationIds = [...new Set((chairs || []).map((c) => c.location_id))];
      const { data: locations } = await supabase
        .from("locations")
        .select("id, name, city")
        .in("id", locationIds);

      const enriched = data.map((b) => {
        const chair = chairs?.find((c) => c.id === b.chair_id);
        const location = chair ? locations?.find((l) => l.id === chair.location_id) : null;
        return {
          ...b,
          chair: chair ? { identifier: chair.identifier, location: location ? { name: location.name, city: location.city } : { name: "Unknown", city: null } } : null,
        };
      });
      setUpcomingBookings(enriched);
    }
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Welcome back, {barberProfile?.full_name}
        </h1>
        <p className="text-sm text-muted-foreground">Here are your upcoming bookings.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : upcomingBookings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
          <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No upcoming bookings yet.</p>
          <Button variant="outline" onClick={() => navigate("/barber/browse")}>
            Browse Stations
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {upcomingBookings.map((booking) => (
            <div key={booking.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(booking.booking_date + "T00:00:00"), "EEEE, MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {booking.chair?.location.name} — Chair {booking.chair?.identifier}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground capitalize">
                {booking.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
