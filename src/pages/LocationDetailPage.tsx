import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, User } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
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
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.2, 0, 0, 1] } },
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
  const [assignStartDate, setAssignStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organization && id) {
      fetchAll();
    }
  }, [organization, id]);

  const fetchAll = async () => {
    const [locRes, chairRes, contractRes, barberRes] = await Promise.all([
      supabase.from("locations").select("*").eq("id", id!).single(),
      supabase.from("chairs").select("*").eq("location_id", id!).order("identifier"),
      supabase.from("contracts").select("*, barbers(*)").eq("organization_id", organization!.id).in("status", ["active", "pending"]),
      supabase.from("barbers").select("*").eq("organization_id", organization!.id),
    ]);

    setLocation(locRes.data);
    setBarbers(barberRes.data || []);

    const contracts = (contractRes.data || []) as (Contract & { barbers: Barber })[];
    const enriched: ChairWithContract[] = (chairRes.data || []).map((chair) => {
      const contract = contracts.find((c) => c.chair_id === chair.id);
      return {
        ...chair,
        activeContract: contract ? { ...contract, barber: contract.barbers } : undefined,
      };
    });
    setChairs(enriched);
  };

  const handleAddChair = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.from("chairs").insert({ identifier: newChairId, location_id: id! });
    setNewChairId("");
    setAddChairOpen(false);
    setLoading(false);
    fetchAll();
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChair) return;
    setLoading(true);
    await supabase.from("contracts").insert({
      barber_id: assignBarberId,
      chair_id: selectedChair.id,
      organization_id: organization!.id,
      price: parseFloat(assignPrice),
      billing_cycle: assignCycle,
      start_date: assignStartDate,
      status: "active",
    });
    await supabase.from("chairs").update({ status: "occupied" as Enums<"chair_status"> }).eq("id", selectedChair.id);
    setAssignOpen(false);
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

  if (!location) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  const occupiedCount = chairs.filter((c) => c.status === "occupied").length;

  return (
    <div className="p-6">
      <Link to="/locations" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Locations
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{location.name}</h1>
          <p className="text-sm text-muted-foreground">
            {occupiedCount}/{chairs.length} stations occupied
          </p>
        </div>
        <Dialog open={addChairOpen} onOpenChange={setAddChairOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Station</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Station</DialogTitle></DialogHeader>
            <form onSubmit={handleAddChair} className="space-y-4">
              <div className="space-y-2">
                <Label>Station Identifier</Label>
                <Input value={newChairId} onChange={(e) => setNewChairId(e.target.value)} placeholder="#01" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Create Station</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Station Grid */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {chairs.map((chair) => (
          <motion.div key={chair.id} variants={itemVariants}>
            <div
              className={cn("station-card relative", chair.status === "available" && "cursor-pointer")}
              onClick={() => chair.status === "available" && openAssign(chair)}
            >
              {/* Status dot */}
              <div className={cn("absolute right-3 top-3 h-2 w-2 rounded-full", statusColors[chair.status])} />

              <p className="text-xs font-mono text-muted-foreground mb-1">{chair.identifier}</p>

              {chair.activeContract?.barber ? (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground truncate">{chair.activeContract.barber.full_name}</p>
                  </div>
                  <p className="price text-sm text-foreground">
                    ${Number(chair.activeContract.price).toFixed(2)}
                    <span className="text-xs text-muted-foreground">/{chair.activeContract.billing_cycle}</span>
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
          <p className="text-sm font-medium text-foreground">No stations yet</p>
          <p className="text-xs text-muted-foreground">Add stations to this location to start assigning barbers.</p>
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Station {selectedChair?.identifier}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <div className="space-y-2">
              <Label>Barber</Label>
              <Select value={assignBarberId} onValueChange={setAssignBarberId} required>
                <SelectTrigger><SelectValue placeholder="Select barber" /></SelectTrigger>
                <SelectContent>
                  {barbers.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" step="0.01" value={assignPrice} onChange={(e) => setAssignPrice(e.target.value)} placeholder="250.00" required />
              </div>
              <div className="space-y-2">
                <Label>Billing Cycle</Label>
                <Select value={assignCycle} onValueChange={(v) => setAssignCycle(v as Enums<"billing_cycle">)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !assignBarberId || !assignPrice}>
              Assign Station
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
