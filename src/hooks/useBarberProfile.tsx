import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BarberProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string | null;
}

interface BarberProfileContextType {
  barberProfile: BarberProfile | null;
  loading: boolean;
  createBarberProfile: (fullName: string, phone?: string) => Promise<BarberProfile>;
}

const BarberProfileContext = createContext<BarberProfileContextType | undefined>(undefined);

export function BarberProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [barberProfile, setBarberProfile] = useState<BarberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBarberProfile(null);
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("barber_profiles")
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle();
    setBarberProfile(data);
    setLoading(false);
  };

  const createBarberProfile = async (fullName: string, phone?: string) => {
    const { data, error } = await supabase
      .from("barber_profiles")
      .insert({ user_id: user!.id, full_name: fullName, phone: phone || null, email: user!.email })
      .select()
      .single();
    if (error) throw error;
    setBarberProfile(data);
    return data;
  };

  return (
    <BarberProfileContext.Provider value={{ barberProfile, loading, createBarberProfile }}>
      {children}
    </BarberProfileContext.Provider>
  );
}

export function useBarberProfile() {
  const context = useContext(BarberProfileContext);
  if (!context) throw new Error("useBarberProfile must be used within BarberProfileProvider");
  return context;
}
