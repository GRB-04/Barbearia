import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, ChevronRight, ArrowLeft, CalendarIcon, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Location {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  organization_id: string;
}

interface Chair {
  id: string;
  identifier: string;
  status: string;
  location_id: string;
}

type Step = "locations" | "chairs" | "date";

export default function BrowseStationsPage() {
  const { barberProfile } = useBarberProfile();
  const [step, setStep] = useState<Step>("locations");
  const [locations, setLocations] = useState<Location[]>([]);
  const [chairs, setChairs] = useState<Chair[]>([]);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedChair, setSelectedChair] = useState<Chair | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    const { data } = await supabase
      .from("locations")
      .select("id, name, address, city, state, organization_id")
      .eq("status", "active")
      .order("name");
    setLocations(data || []);
    setLoading(false);
  };

  const selectLocation = async (loc: Location) => {
    setSelectedLocation(loc);
    setStep("chairs");
    const { data } = await supabase
      .from("chairs")
      .select("id, identifier, status, location_id")
      .eq("location_id", loc.id)
      .order("identifier");
    setChairs(data || []);
  };

  const selectChair = async (chair: Chair) => {
    setSelectedChair(chair);
    setStep("date");
    // Fetch existing bookings for this chair
    const { data } = await supabase
      .from("chair_bookings")
      .select("booking_date")
      .eq("chair_id", chair.id)
      .neq("status", "cancelled");
    setBookedDates((data || []).map((b) => b.booking_date));
  };

  const confirmBooking = async () => {
    if (!selectedChair || !selectedDate || !barberProfile || !selectedLocation) return;
    setBooking(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const { error } = await supabase.from("chair_bookings").insert({
      barber_profile_id: barberProfile.id,
      chair_id: selectedChair.id,
      organization_id: selectedLocation.organization_id,
      booking_date: dateStr,
    });
    if (error) {
      toast.error(error.message.includes("unique") ? "This chair is already booked for that date." : error.message);
    } else {
      toast.success(`Chair ${selectedChair.identifier} booked for ${format(selectedDate, "MMM d, yyyy")}!`);
      goBack();
    }
    setBooking(false);
  };

  const goBack = () => {
    if (step === "date") {
      setStep("chairs");
      setSelectedChair(null);
      setSelectedDate(undefined);
      setBookedDates([]);
    } else if (step === "chairs") {
      setStep("locations");
      setSelectedLocation(null);
      setChairs([]);
    }
  };

  const isDateBooked = (date: Date) => {
    return bookedDates.includes(format(date, "yyyy-MM-dd"));
  };

  const isDatePast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step !== "locations" && (
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {step === "locations" && "Browse Stations"}
            {step === "chairs" && selectedLocation?.name}
            {step === "date" && `Chair ${selectedChair?.identifier}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "locations" && "Select a location to see available chairs."}
            {step === "chairs" && "Select a chair to book."}
            {step === "date" && "Pick a date for your booking."}
          </p>
        </div>
      </div>

      {/* Step: Locations */}
      {step === "locations" && (
        loading ? (
          <p className="text-sm text-muted-foreground">Loading locations...</p>
        ) : locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stations available yet.</p>
        ) : (
          <div className="grid gap-2">
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => selectLocation(loc)}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{loc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[loc.address, loc.city, loc.state].filter(Boolean).join(", ") || "No address"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )
      )}

      {/* Step: Chairs */}
      {step === "chairs" && (
        chairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chairs at this location.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {chairs.map((chair) => {
              const isAvailable = chair.status === "available";
              return (
                <button
                  key={chair.id}
                  onClick={() => isAvailable && selectChair(chair)}
                  disabled={!isAvailable}
                  className={cn(
                    "rounded-lg border p-4 text-center transition-colors",
                    isAvailable
                      ? "border-border bg-card hover:border-primary hover:bg-accent cursor-pointer"
                      : "border-border bg-muted cursor-not-allowed opacity-50"
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">Chair {chair.identifier}</p>
                  <p className={cn(
                    "text-xs mt-1 capitalize",
                    isAvailable ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {chair.status}
                  </p>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Step: Date */}
      {step === "date" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 inline-block">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => isDatePast(date) || isDateBooked(date)}
              className={cn("p-3 pointer-events-auto")}
            />
          </div>

          {selectedDate && (
            <div className="flex items-center gap-3">
              <div className="text-sm text-foreground">
                <span className="font-medium">{format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
                <span className="text-muted-foreground"> — Chair {selectedChair?.identifier} at {selectedLocation?.name}</span>
              </div>
            </div>
          )}

          <Button
            onClick={confirmBooking}
            disabled={!selectedDate || booking}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {booking ? "Booking..." : "Confirm Booking"}
          </Button>
        </div>
      )}
    </div>
  );
}
