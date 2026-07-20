import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { toast } from "sonner";

export interface OperationalBarber {
  id: string;
  barber_profile_id: string | null;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string | null;
}

interface UseOperationalBarberReturn {
  operationalBarber: OperationalBarber | null;
  loading: boolean;
  refreshOperationalBarber: () => Promise<OperationalBarber | null>;
}

export function useOperationalBarber(): UseOperationalBarberReturn {
  const { barberProfile } = useBarberProfile();

  const [operationalBarber, setOperationalBarber] = useState<OperationalBarber | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshOperationalBarber = useCallback(async (): Promise<OperationalBarber | null> => {
    if (!barberProfile?.id) {
      setOperationalBarber(null);
      setLoading(false);
      return null;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("organization_barbers")
        .select("id, barber_profile_id, organization_id, full_name, email, phone, created_at, updated_at")
        .eq("barber_profile_id", barberProfile.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[useOperationalBarber] fetch error:", error);
        toast.error(error.message);
        setOperationalBarber(null);
        return null;
      }

      if (!data) {
        setOperationalBarber(null);
        return null;
      }

      setOperationalBarber(data as OperationalBarber);
      return data as OperationalBarber;
    } catch (error) {
      console.error("[useOperationalBarber] unexpected error:", error);
      toast.error("Não foi possível carregar o barbeiro operacional.");
      setOperationalBarber(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [barberProfile?.id]);

  useEffect(() => {
    refreshOperationalBarber();
  }, [refreshOperationalBarber]);

  return {
    operationalBarber,
    loading,
    refreshOperationalBarber,
  };
}
