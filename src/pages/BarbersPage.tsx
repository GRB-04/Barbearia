import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, User } from "lucide-react";
import { motion } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

type Barber = Tables<"barbers">;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.2, 0, 0, 1] } },
};

export default function BarbersPage() {
  const { organization } = useOrganization();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organization) fetchBarbers();
  }, [organization]);

  const fetchBarbers = async () => {
    const { data } = await supabase
      .from("barbers")
      .select("*")
      .eq("organization_id", organization!.id)
      .order("full_name");
    setBarbers(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.from("barbers").insert({
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      organization_id: organization!.id,
    });
    setFullName("");
    setPhone("");
    setEmail("");
    setOpen(false);
    setLoading(false);
    fetchBarbers();
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Barbers</h1>
          <p className="text-sm text-muted-foreground">{barbers.length} tenant{barbers.length !== 1 ? "s" : ""}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Barber</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Barber</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Marcus Johnson" required />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marcus@email.com" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Create Barber</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {barbers.map((barber) => (
          <motion.div key={barber.id} variants={itemVariants}>
            <div className="station-card">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{barber.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{barber.phone || barber.email || "No contact"}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {barbers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <User className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No barbers yet</p>
          <p className="text-xs text-muted-foreground">Add barbers to start assigning them to stations.</p>
        </div>
      )}
    </div>
  );
}
