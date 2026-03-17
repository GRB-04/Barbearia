import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { FileText } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Contract = Tables<"contracts">;
type Barber = Tables<"barbers">;
type Chair = Tables<"chairs">;

interface ContractRow extends Contract {
  barbers: Barber;
  chairs: Chair;
}

const statusBadge: Record<string, string> = {
  active: "bg-occupied/10 text-occupied",
  pending: "bg-maintenance/10 text-maintenance",
  ended: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function ContractsPage() {
  const { organization } = useOrganization();
  const [contracts, setContracts] = useState<ContractRow[]>([]);

  useEffect(() => {
    if (organization) fetchContracts();
  }, [organization]);

  const fetchContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select("*, barbers(*), chairs(*)")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false });
    setContracts((data as ContractRow[]) || []);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Contracts</h1>
        <p className="text-sm text-muted-foreground">{contracts.length} active lease{contracts.length !== 1 ? "s" : ""}</p>
      </div>

      {contracts.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden rounded-lg" style={{ boxShadow: "var(--shadow-sm)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Barber</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Station</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Rate</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Start</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 bg-card hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{c.barbers?.full_name}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{c.chairs?.identifier}</td>
                  <td className="px-4 py-3 price text-foreground">${Number(c.price).toFixed(2)}<span className="text-xs text-muted-foreground">/{c.billing_cycle}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{c.start_date}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", statusBadge[c.status])}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No contracts yet</p>
          <p className="text-xs text-muted-foreground">Assign a barber to a station to create a contract.</p>
        </div>
      )}
    </div>
  );
}
