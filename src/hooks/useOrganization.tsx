import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

type Organization = Tables<"organizations">;

interface OrgContextType {
  organization: Organization | null;
  loading: boolean;
  createOrganization: (name: string) => Promise<Organization>;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrganization(null);
      setLoading(false);
      return;
    }
    fetchOrg();
  }, [user]);

  const fetchOrg = async () => {
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("owner_id", user!.id)
      .limit(1)
      .maybeSingle();
    setOrganization(data);
    setLoading(false);
  };

  const createOrganization = async (name: string) => {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, owner_id: user!.id })
      .select()
      .single();
    if (error) throw error;
    setOrganization(data);
    return data;
  };

  return (
    <OrgContext.Provider value={{ organization, loading, createOrganization }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrgContext);
  if (!context) throw new Error("useOrganization must be used within OrgProvider");
  return context;
}
