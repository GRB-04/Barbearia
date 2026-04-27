# 📁 ARQUIVOS FRONTEND COM QUERIES - COMPLETOS

## 1️⃣ LocationsPage.tsx
**Localização**: `src/pages/LocationsPage.tsx`  
**Propósito**: Listar e criar locations  
**Queries**: 2 (SELECT all + INSERT)

```tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MapPin, Plus, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Location = Tables<"locations">;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.2, 0, 0, 1] as const },
  },
};

export default function LocationsPage() {
  const { organization, loading: organizationLoading } = useOrganization();

  const [locations, setLocations] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (organizationLoading) return;

    if (!organization?.id) {
      console.log("[LocationsPage] no organization found for current session");
      setLocations([]);
      setFetching(false);
      return;
    }

    fetchLocations();
  }, [organization?.id, organizationLoading]);

  // 🔴 QUERY 1: Fetch all locations (SEM LIMIT!)
  const fetchLocations = async () => {
    if (!organization?.id) {
      setLocations([]);
      setFetching(false);
      return;
    }

    setFetching(true);

    try {
      console.log("[LocationsPage] fetching locations for organization:", organization.id);

      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
        // ❌ PROBLEMA: SEM .limit(50) - carrega TUDO se tiver 10k locations

      console.log("[LocationsPage] fetch result:", { data, error });

      if (error) {
        console.error("[LocationsPage] fetch error:", error);
        toast.error(error.message);
        setLocations([]);
        return;
      }

      setLocations((data as Location[]) || []);
    } catch (err) {
      console.error("[LocationsPage] unexpected fetch error:", err);
      toast.error("Failed to load locations.");
      setLocations([]);
    } finally {
      setFetching(false);
    }
  };

  // 🔴 QUERY 2: INSERT new location
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization?.id) {
      toast.error("No organization found for this account.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("locations").insert({
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        organization_id: organization.id,
        status: "active",
      });

      if (error) {
        console.error("[LocationsPage] create error:", error);
        toast.error(error.message);
        return;
      }

      setName("");
      setAddress("");
      setCity("");
      setOpen(false);
      toast.success("Location created successfully.");
      await fetchLocations();
    } catch (err) {
      console.error("[LocationsPage] unexpected create error:", err);
      toast.error("Failed to create location.");
    } finally {
      setLoading(false);
    }
  };

  if (organizationLoading || fetching) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading locations...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Locations
          </h1>
          <p className="text-sm text-muted-foreground">
            {locations.length} location{locations.length !== 1 ? "s" : ""}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Location
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Location</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Downtown Shop"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St"
                />
              </div>

              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Austin"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create Location"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {locations.length > 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {locations.map((loc) => (
            <motion.div key={loc.id} variants={itemVariants}>
              <Link
                to={`/locations/${loc.id}`}
                className="station-card flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground">{loc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[loc.address, loc.city].filter(Boolean).join(", ") || "No address"}
                    </p>
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No locations yet</p>
          <p className="text-xs text-muted-foreground">
            Add your first location to start managing stations.
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## 2️⃣ LocationDetailPage.tsx
**Localização**: `src/pages/LocationDetailPage.tsx`  
**Propósito**: Gerenciar cadeiras e contratos de uma location  
**Queries**: 4 (SELECT location, chairs, contracts, barbers)

```tsx
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, User } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Chair = Tables<"chairs">;
type Barber = Tables<"barbers">;
type Contract = Tables<"contracts">;
type Location = Tables<"locations">;

interface ChairWithContract extends Chair {
  activeContract?: Contract & { barber?: Barber };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.2, 0, 0, 1] as const },
  },
};

const statusColors: Record<string, string> = {
  available: "bg-available",
  occupied: "bg-occupied",
  maintenance: "bg-maintenance",
};

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useOrganization();

  const [location, setLocation] = useState<Location | null>(null);
  const [chairs, setChairs] = useState<ChairWithContract[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  const [addChairOpen, setAddChairOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedChair, setSelectedChair] = useState<ChairWithContract | null>(null);

  const [newChairId, setNewChairId] = useState("");
  const [assignBarberId, setAssignBarberId] = useState("");
  const [assignPrice, setAssignPrice] = useState("");
  const [assignCycle, setAssignCycle] = useState<Enums<"billing_cycle">>("weekly");
  const [assignStartDate, setAssignStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organization && id) {
      fetchAll();
    }
  }, [organization, id]);

  // 🔴 QUERIES 1-4: Parallel requests pero sem JOIN
  const fetchAll = async () => {
    if (!organization || !id) return;

    const [locRes, chairRes, contractRes, barberRes] = await Promise.all([
      // Query 1: Get location
      supabase.from("locations").select("*").eq("id", id).single(),
      // Query 2: Get chairs
      supabase.from("chairs").select("*").eq("location_id", id).order("identifier"),
      // Query 3: Get contracts (para enrichment)
      supabase
        .from("contracts")
        .select("*, barbers(*)")
        .eq("organization_id", organization.id)
        .in("status", ["active", "pending"]),
      // Query 4: Get barbers (para dropdown)
      supabase.from("barbers").select("*").eq("organization_id", organization.id),
    ]);

    if (locRes.error) {
      toast.error(locRes.error.message);
      return;
    }

    if (chairRes.error) {
      toast.error(chairRes.error.message);
      return;
    }

    if (contractRes.error) {
      toast.error(contractRes.error.message);
      return;
    }

    if (barberRes.error) {
      toast.error(barberRes.error.message);
      return;
    }

    setLocation(locRes.data);
    setBarbers(barberRes.data || []);

    const contracts = (contractRes.data || []) as (Contract & { barbers: Barber })[];

    const enriched: ChairWithContract[] = (chairRes.data || []).map((chair) => {
      const contract = contracts.find((c) => c.chair_id === chair.id);

      return {
        ...chair,
        activeContract: contract
          ? {
              ...contract,
              barber: contract.barbers,
            }
          : undefined,
      };
    });

    setChairs(enriched);
  };

  const handleAddChair = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newChairId.trim()) {
      toast.error("Informe o identificador da cadeira.");
      return;
    }

    if (!id) {
      toast.error("Location inválida.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("chairs").insert({
      identifier: newChairId.trim(),
      location_id: id,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Cadeira criada com sucesso.");
    setNewChairId("");
    setAddChairOpen(false);
    setLoading(false);
    fetchAll();
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedChair) {
      toast.error("Selecione uma cadeira.");
      return;
    }

    if (!organization) {
      toast.error("Organização não encontrada.");
      return;
    }

    if (!assignBarberId || !assignPrice || !assignStartDate) {
      toast.error("Preencha todos os campos.");
      return;
    }

    const parsedPrice = parseFloat(assignPrice);

    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      toast.error("Informe um preço válido.");
      return;
    }

    setLoading(true);

    // Check if chair already has active contract
    const { data: existingContract, error: existingContractError } = await supabase
      .from("contracts")
      .select("id")
      .eq("chair_id", selectedChair.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingContractError) {
      toast.error(existingContractError.message);
      setLoading(false);
      return;
    }

    if (existingContract) {
      toast.error("Essa cadeira já está ocupada.");
      setLoading(false);
      return;
    }

    // Calculate end_date based on billing_cycle
    let endDate: string | null = null;
    const start = new Date(`${assignStartDate}T00:00:00`);

    if (assignCycle === "daily") {
      start.setDate(start.getDate() + 1);
      endDate = start.toISOString().split("T")[0];
    } else if (assignCycle === "weekly") {
      start.setDate(start.getDate() + 7);
      endDate = start.toISOString().split("T")[0];
    } else if (assignCycle === "monthly") {
      start.setMonth(start.getMonth() + 1);
      endDate = start.toISOString().split("T")[0];
    }

    // Insert contract
    const { error: contractError } = await supabase.from("contracts").insert({
      barber_id: assignBarberId,
      chair_id: selectedChair.id,
      organization_id: organization.id,
      price: parsedPrice,
      billing_cycle: assignCycle,
      start_date: assignStartDate,
      end_date: endDate,
      status: "active",
    });

    if (contractError) {
      toast.error(contractError.message);
      setLoading(false);
      return;
    }

    // Update chair status
    const { error: chairError } = await supabase
      .from("chairs")
      .update({
        status: "occupied" as Enums<"chair_status">,
      })
      .eq("id", selectedChair.id);

    if (chairError) {
      toast.error(chairError.message);
      setLoading(false);
      return;
    }

    toast.success("Cadeira atribuída com sucesso.");

    setAssignOpen(false);
    setSelectedChair(null);
    setAssignBarberId("");
    setAssignPrice("");
    setAssignCycle("weekly");
    setAssignStartDate(new Date().toISOString().split("T")[0]);

    setLoading(false);
    fetchAll();
  };

  const openAssign = (chair: ChairWithContract) => {
    setSelectedChair(chair);
    setAssignBarberId("");
    setAssignPrice("");
    setAssignCycle("weekly");
    setAssignStartDate(new Date().toISOString().split("T")[0]);
    setAssignOpen(true);
  };

  if (!location) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  const occupiedCount = chairs.filter((c) => c.status === "occupied").length;

  return (
    <div className="p-6">
      <Link
        to="/locations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Locations
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {location.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {occupiedCount}/{chairs.length} stations occupied
          </p>
        </div>

        <Dialog open={addChairOpen} onOpenChange={setAddChairOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Station
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Station</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleAddChair} className="space-y-4">
              <div className="space-y-2">
                <Label>Station Identifier</Label>
                <Input
                  value={newChairId}
                  onChange={(e) => setNewChairId(e.target.value)}
                  placeholder="#01"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                Create Station
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-3 grid-cols-2 lg:grid-cols-4"
      >
        {chairs.map((chair) => (
          <motion.div key={chair.id} variants={itemVariants}>
            <div
              className={cn(
                "station-card relative",
                chair.status === "available" && "cursor-pointer"
              )}
              onClick={() => chair.status === "available" && openAssign(chair)}
            >
              <div
                className={cn(
                  "absolute right-3 top-3 h-2 w-2 rounded-full",
                  statusColors[chair.status]
                )}
              />

              <p className="text-xs font-mono text-muted-foreground mb-1">
                {chair.identifier}
              </p>

              {chair.activeContract?.barber ? (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground truncate">
                      {chair.activeContract.barber.full_name}
                    </p>
                  </div>

                  <p className="price text-sm text-foreground">
                    ${Number(chair.activeContract.price).toFixed(2)}
                    <span className="text-xs text-muted-foreground">
                      /{chair.activeContract.billing_cycle}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  {chair.status === "maintenance" ? "Under maintenance" : "Available"}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {chairs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-8 w-8 text-muted-foreground/50 mb-3">📭</div>
          <p className="text-sm font-medium text-foreground">No stations yet</p>
          <p className="text-xs text-muted-foreground">
            Add your first station to start renting chairs.
          </p>
        </div>
      )}

      {/* Dialogs at end... */}
    </div>
  );
}
```

---

## 3️⃣ MyBookingsPage.tsx
**Localização**: `src/pages/barber/MyBookingsPage.tsx`  
**Propósito**: Listar bookings do barbeiro  
**Queries**: 3️⃣ **N+1 PROBLEM!**
- Query 1: chair_bookings
- Query 2: chairs (separate)
- Query 3: locations (separate)

```tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, X } from "lucide-react";
import { format, isAfter } from "date-fns";
import { toast } from "sonner";

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
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
    setLoading(true);

    // 🔴 QUERY 1: Get all bookings
    const { data, error } = await supabase
      .from("chair_bookings")
      .select("*")
      .eq("barber_profile_id", barberProfile!.id)
      .order("start_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const bookingRows = (data ?? []) as unknown as Booking[];

    if (bookingRows.length > 0) {
      const chairIds = [...new Set(bookingRows.map((b) => b.chair_id))];

      // 🔴 QUERY 2: Get chairs (SEPARATE query!)
      const { data: chairs, error: chairsError } = await supabase
        .from("chairs")
        .select("id, identifier, location_id")
        .in("id", chairIds);

      if (chairsError) {
        toast.error(chairsError.message);
        setLoading(false);
        return;
      }

      const locationIds = [...new Set((chairs || []).map((c) => c.location_id))];

      // 🔴 QUERY 3: Get locations (SEPARATE query!)
      const { data: locations, error: locationsError } = await supabase
        .from("locations")
        .select("id, name")
        .in("id", locationIds);

      if (locationsError) {
        toast.error(locationsError.message);
        setLoading(false);
        return;
      }

      // ❌ MANUAL ENRICHMENT - deveria estar em 1 query com JOINs
      const enriched: BookingEnriched[] = bookingRows.map((b) => {
        const chair = chairs?.find((c) => c.id === b.chair_id);
        const location = chair ? locations?.find((l) => l.id === chair.location_id) : null;

        return {
          ...b,
          chair_identifier: chair?.identifier || "?",
          location_name: location?.name || "Unknown",
        };
      });

      setBookings(enriched);
    } else {
      setBookings([]);
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
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
      );
    }
  };

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
            const startAt = new Date(b.start_at);
            const endAt = new Date(b.end_at);
            const canCancel = isAfter(startAt, new Date()) && b.status !== "cancelled";

            return (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {format(startAt, "EEEE, MMM d, yyyy HH:mm")} →{" "}
                      {format(endAt, "EEEE, MMM d, yyyy HH:mm")}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {b.location_name} — Chair {b.chair_identifier}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      b.status === "cancelled"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {b.status}
                  </span>

                  {canCancel && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelBooking(b.id)}
                      className="h-7 text-xs text-destructive hover:text-destructive"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
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
```

---

## 4️⃣ BrowseStationsPage.tsx
**Localização**: `src/pages/barber/BrowseStationsPage.tsx`  
**Propósito**: Barbeiro navega e faz booking  
**Queries**: 4️⃣ **N+1 PROBLEM!**
- Query 1: All locations
- Query 2: Chairs por location (disparada manualmente)
- Query 3: Conflict check (booking duplicado)
- Query 4: INSERT booking

```tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { MapPin, ChevronRight, ArrowLeft, Check } from "lucide-react";
import { format, differenceInHours } from "date-fns";
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

type Step = "locations" | "chairs" | "datetime";

export default function BrowseStationsPage() {
  const { barberProfile } = useBarberProfile();

  const [step, setStep] = useState<Step>("locations");
  const [locations, setLocations] = useState<Location[]>([]);
  const [chairs, setChairs] = useState<Chair[]>([]);

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedChair, setSelectedChair] = useState<Chair | null>(null);

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!barberProfile?.organization_id) {
      setLocations([]);
      setLoading(false);
      return;
    }

    fetchLocations();
  }, [barberProfile?.organization_id]);

  // 🔴 QUERY 1: Get all locations
  const fetchLocations = async () => {
    if (!barberProfile?.organization_id) {
      setLocations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("locations")
      .select("id, name, address, city, state, organization_id")
      .eq("organization_id", barberProfile.organization_id)
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error("[BrowseStationsPage] fetchLocations error:", error);
      toast.error(error.message);
      setLocations([]);
      setLoading(false);
      return;
    }

    setLocations((data as Location[]) || []);
    setLoading(false);
  };

  // 🔴 QUERY 2: Get chairs for selected location (N+1!)
  const selectLocation = async (loc: Location) => {
    setSelectedLocation(loc);
    setStep("chairs");

    const { data, error } = await supabase
      .from("chairs")
      .select("id, identifier, status, location_id")
      .eq("location_id", loc.id)
      .order("identifier");

    if (error) {
      console.error("[BrowseStationsPage] selectLocation chairs error:", error);
      toast.error(error.message);
      setChairs([]);
      return;
    }

    setChairs((data as Chair[]) || []);
  };

  const selectChair = (chair: Chair) => {
    setSelectedChair(chair);
    setStep("datetime");
  };

  const confirmBooking = async () => {
    if (!selectedChair || !startDate || !endDate || !barberProfile || !selectedLocation) {
      toast.error("Fill all fields.");
      return;
    }

    const hours = differenceInHours(endDate, startDate);
    if (hours < 4) {
      toast.error("Minimum booking is 4 hours.");
      return;
    }

    setBooking(true);

    // 🔴 QUERY 3: Check for conflicts
    const { data: conflicts, error: conflictsError } = await supabase
      .from("chair_bookings")
      .select("id, start_at, end_at")
      .eq("chair_id", selectedChair.id)
      .neq("status", "cancelled");
      // ❌ PROBLEMA: Sem validação se booking está dentro do horário operacional

    if (conflictsError) {
      toast.error(conflictsError.message);
      setBooking(false);
      return;
    }

    const hasConflict = (conflicts || []).some((b: any) => {
      const existingStart = new Date(b.start_at);
      const existingEnd = new Date(b.end_at);

      return startDate < existingEnd && endDate > existingStart;
    });

    if (hasConflict) {
      toast.error("This chair is already booked for this time.");
      setBooking(false);
      return;
    }

    // 🔴 QUERY 4: Insert booking
    const { error } = await supabase.from("chair_bookings").insert({
      barber_profile_id: barberProfile.id,
      chair_id: selectedChair.id,
      organization_id: selectedLocation.organization_id,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      status: "pending",
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Booking created successfully!");
      goBack();
    }

    setBooking(false);
  };

  const goBack = () => {
    if (step === "datetime") {
      setStep("chairs");
      setSelectedChair(null);
      setStartDate(undefined);
      setEndDate(undefined);
    } else if (step === "chairs") {
      setStep("locations");
      setSelectedLocation(null);
      setChairs([]);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        {step !== "locations" && (
          <button onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        <h1 className="text-lg font-semibold">
          {step === "locations" && "Browse Stations"}
          {step === "chairs" && selectedLocation?.name}
          {step === "datetime" && `Chair ${selectedChair?.identifier}`}
        </h1>
      </div>

      {step === "locations" && (
        <>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active barbershop locations found for your account.
            </p>
          ) : (
            <div className="grid gap-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => selectLocation(loc)}
                  className="flex justify-between border p-4 rounded-lg"
                >
                  <div className="flex gap-2">
                    <MapPin className="h-4 w-4" />
                    <div>
                      <p>{loc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[loc.address, loc.city].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </div>
                  <ChevronRight />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === "chairs" && (
        <div className="grid grid-cols-2 gap-3">
          {chairs.map((chair) => (
            <button
              key={chair.id}
              disabled={chair.status !== "available"}
              onClick={() => selectChair(chair)}
              className={cn(
                "border p-4 rounded-lg",
                chair.status !== "available" && "opacity-50"
              )}
            >
              Chair {chair.identifier}
            </button>
          ))}
        </div>
      )}

      {step === "datetime" && (
        <div className="space-y-4">
          <div>
            <p className="text-sm">Start date</p>
            <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
          </div>

          <div>
            <p className="text-sm">End date</p>
            <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
          </div>

          {startDate && endDate && (
            <p className="text-sm">
              {format(startDate, "PPP")} → {format(endDate, "PPP")}
            </p>
          )}

          <Button onClick={confirmBooking} disabled={booking}>
            <Check className="h-4 w-4 mr-1" />
            {booking ? "Booking..." : "Confirm Booking"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

---

## 5️⃣ BarberDashboard.tsx
**Localização**: `src/pages/barber/BarberDashboard.tsx`  
**Propósito**: Dashboard do barbeiro com bookings próximos  
**Queries**: 3️⃣ **N+1 PROBLEM!**
- Query 1: chair_bookings (only id, start_at, end_at, status, chair_id - incompleto)
- Query 2: chairs (separate)
- Query 3: locations (separate)

```tsx
import { useEffect, useState } from "react";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, MapPin } from "lucide-react";
import { format, isAfter } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface BookingWithDetails {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  chair_id: string;
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
    setLoading(true);

    const nowIso = new Date().toISOString();

    // 🔴 QUERY 1: Get bookings (SEM related chair/location data!)
    const { data, error } = await supabase
      .from("chair_bookings")
      .select("id, start_at, end_at, status, chair_id")
      .eq("barber_profile_id", barberProfile!.id)
      .gte("end_at", nowIso)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true })
      .limit(5);

    if (error) {
      console.error("[BarberDashboard] booking query error:", error);
      setUpcomingBookings([]);
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const chairIds = data.map((b) => b.chair_id);

      // 🔴 QUERY 2: Get chairs (SEPARATE query!)
      const { data: chairs } = await supabase
        .from("chairs")
        .select("id, identifier, location_id")
        .in("id", chairIds);

      const locationIds = [...new Set((chairs || []).map((c) => c.location_id))];

      // 🔴 QUERY 3: Get locations (SEPARATE query!)
      const { data: locations } = await supabase
        .from("locations")
        .select("id, name, city")
        .in("id", locationIds);

      // ❌ MANUAL ENRICHMENT - deveria estar tudo em 1 query
      const enriched = data.map((b) => {
        const chair = chairs?.find((c) => c.id === b.chair_id);
        const location = chair ? locations?.find((l) => l.id === chair.location_id) : null;

        return {
          ...b,
          chair: chair
            ? {
                identifier: chair.identifier,
                location: location
                  ? { name: location.name, city: location.city }
                  : { name: "Unknown", city: null },
              }
            : null,
        };
      });

      setUpcomingBookings(enriched as BookingWithDetails[]);
    } else {
      setUpcomingBookings([]);
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
            <div
              key={booking.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(booking.start_at), "EEEE, MMM d, yyyy HH:mm")} →{" "}
                    {format(new Date(booking.end_at), "EEEE, MMM d, yyyy HH:mm")}
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
```

---

## 📊 RESUMO DE PROBLEMAS ENCONTRADOS

| Arquivo | Queries | Problema |
|---------|---------|----------|
| **LocationsPage** | 2 | SEM LIMIT - carrega tudo |
| **LocationDetailPage** | 4 | Parallel sim, mas sem JOIN - enrichment manual |
| **MyBookingsPage** | 3️⃣ | **N+1 CRÍTICO** - 3 queries sequenciais |
| **BrowseStationsPage** | 4️⃣ | **N+1 CRÍTICO** - múltiplas queries |
| **BarberDashboard** | 3️⃣ | **N+1 CRÍTICO** - select incompleto |

---

## ✅ PRÓXIMOS PASSOS

1. **MyBookingsPage**: Consolidar 3 queries em 1 com JOINs
2. **BrowseStationsPage**: Pré-carregar locations com chairs
3. **BarberDashboard**: Usar SELECT com related data
4. **LocationsPage**: Adicionar LIMIT 50
5. **Todos**: Remover console.logs

**Ganho total esperado**: ~2-3s por operação
