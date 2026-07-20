import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import {
  parseManagerPermissions,
  type ManagerPermissions,
} from "@/lib/managerPermissions";

type BarberProfile = Tables<"barber_profiles">;
type Barber = Tables<"organization_barbers">;

type BarberProfileContextType = {
  barberProfile: BarberProfile | null;
  barber: Barber | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isReceptionist: boolean;
  isLocationManager: boolean;
  managerLocationId: string | null;
  managerPermissions: ManagerPermissions;
  refreshBarberProfile: () => Promise<void>;
  createBarberProfile: (
    fullName: string,
    phone?: string,
    customUserId?: string,
    customEmail?: string | null,
    organizationId?: string | null,
    avatarUrl?: string
  ) => Promise<BarberProfile>;
  claimBarberInvitation: (
    organizationId: string,
    fullName?: string,
    phone?: string
  ) => Promise<void>;
};

const BarberProfileContext = createContext<BarberProfileContextType | undefined>(
  undefined
);

const BARBER_PROFILE_CACHE_KEY = "barber-profile-cache-v6";

type CachedBarberProfilePayload = {
  userId: string;
  barberProfile: BarberProfile | null;
  barber: Barber | null;
};

export function BarberProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const [barberProfile, setBarberProfile] = useState<BarberProfile | null>(null);
  const [barber, setBarber] = useState<Barber | null>(null);
  const [loading, setLoading] = useState(true);

  const saveCache = useCallback(
    (nextProfile: BarberProfile | null, nextBarber: Barber | null) => {
      if (!user?.id) return;

      const payload: CachedBarberProfilePayload = {
        userId: user.id,
        barberProfile: nextProfile,
        barber: nextBarber,
      };

      sessionStorage.setItem(BARBER_PROFILE_CACHE_KEY, JSON.stringify(payload));
    },
    [user?.id]
  );

  const loadCache = useCallback(() => {
    if (!user?.id) return false;

    const raw = sessionStorage.getItem(BARBER_PROFILE_CACHE_KEY);
    if (!raw) return false;

    try {
      const cached = JSON.parse(raw) as CachedBarberProfilePayload;

      if (cached.userId !== user.id) {
        sessionStorage.removeItem(BARBER_PROFILE_CACHE_KEY);
        return false;
      }

      setBarberProfile(cached.barberProfile ?? null);
      setBarber(cached.barber ?? null);
      return true;
    } catch (error) {
      console.error("[BarberProfileProvider] cache parse error:", error);
      sessionStorage.removeItem(BARBER_PROFILE_CACHE_KEY);
      return false;
    }
  }, [user?.id]);

  const fetchBarberProfile = useCallback(
    async (forceRefresh = false) => {
      if (authLoading) return;

      if (!user?.id) {
        setBarberProfile(null);
        setBarber(null);
        setLoading(false);
        sessionStorage.removeItem(BARBER_PROFILE_CACHE_KEY);
        return;
      }

      if (!forceRefresh) {
        const cacheLoaded = loadCache();

        if (cacheLoaded) {
          setLoading(false);
          return;
        }
      }

      setLoading(true);

      try {
        const { data: profileData, error: profileError } = await supabase
          .from("barber_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error(
            "[BarberProfileProvider] barber_profiles fetch error:",
            profileError
          );
          setBarberProfile(null);
          setBarber(null);
          saveCache(null, null);
          return;
        }

        if (!profileData) {
          setBarberProfile(null);
          setBarber(null);
          saveCache(null, null);
          return;
        }

        const nextProfile = profileData as BarberProfile;

        const { data: barberData, error: barberError } = await supabase
          .from("organization_barbers")
          .select("*")
          .eq("barber_profile_id", nextProfile.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (barberError) {
          console.error("[BarberProfileProvider] barbers fetch error:", barberError);
          setBarberProfile(nextProfile);
          setBarber(null);
          saveCache(nextProfile, null);
          return;
        }

        const nextBarber = (barberData as Barber | null) ?? null;

        setBarberProfile(nextProfile);
        setBarber(nextBarber);
        saveCache(nextProfile, nextBarber);
      } catch (error) {
        console.error("[BarberProfileProvider] unexpected error:", error);
        setBarberProfile(null);
        setBarber(null);
        saveCache(null, null);
      } finally {
        setLoading(false);
      }
    },
    [authLoading, user?.id, loadCache, saveCache]
  );

  const refreshBarberProfile = useCallback(async () => {
    await fetchBarberProfile(true);
  }, [fetchBarberProfile]);

  const createBarberProfile = useCallback(
    async (
      fullName: string,
      phone?: string,
      customUserId?: string,
      customEmail?: string | null,
      organizationId?: string | null,
      avatarUrl?: string
    ): Promise<BarberProfile> => {
      const targetUserId = customUserId ?? user?.id;
      const targetEmail = customEmail ?? user?.email ?? null;
      const normalizedName = fullName.trim();

      if (!targetUserId) {
        throw new Error("Usuário não autenticado.");
      }

      if (!normalizedName) {
        throw new Error("Nome do barbeiro é obrigatório.");
      }

      const payload = {
        user_id: targetUserId,
        full_name: normalizedName,
        email: targetEmail,
        phone: phone?.trim() || null,
        organization_id: organizationId ?? null,
        avatar_url: avatarUrl ?? null,
      };

      const { data, error } = await supabase
        .from("barber_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const nextProfile = data as BarberProfile;
      setBarberProfile(nextProfile);
      setBarber(null);
      saveCache(nextProfile, null);

      return nextProfile;
    },
    [user?.id, user?.email, saveCache]
  );

  const claimBarberInvitation = useCallback(
    async (organizationId: string, fullName?: string, phone?: string) => {
      if (!organizationId) {
        throw new Error("Link da barbearia inválido.");
      }

      const { error } = await supabase.rpc("claim_barber_invitation", {
        p_organization_id: organizationId,
        p_full_name: fullName?.trim() || null,
        p_phone: phone?.trim() || null,
      });

      if (error) {
        throw error;
      }

      await fetchBarberProfile(true);
    },
    [fetchBarberProfile]
  );

  useEffect(() => {
    if (authLoading) return;

    void fetchBarberProfile(false);
  }, [authLoading, user?.id, fetchBarberProfile]);

  const isAdmin = useMemo(() => {
    const r = (barberProfile as { role?: string })?.role;
    return r === "owner" || r === "manager";
  }, [barberProfile]);

  const isManager = useMemo(() => {
    const r = (barberProfile as { role?: string })?.role;
    return r === "owner" || r === "manager";
  }, [barberProfile]);

  const isReceptionist = useMemo(() => {
    const r = (barberProfile as { role?: string })?.role;
    return r === "receptionist";
  }, [barberProfile]);

  const isLocationManager = useMemo(() => {
    return (barber as { role?: string })?.role === "manager";
  }, [barber]);

  const managerLocationId = useMemo(() => {
    if (!isLocationManager) return null;
    return ((barber as { location_id?: string | null })?.location_id) ?? null;
  }, [barber, isLocationManager]);

  const managerPermissions = useMemo(() => {
    return parseManagerPermissions((barber as { permissions?: unknown })?.permissions);
  }, [barber]);

  const value = useMemo(
    () => ({
      barberProfile,
      barber,
      loading,
      isAdmin,
      isManager,
      isReceptionist,
      isLocationManager,
      managerLocationId,
      managerPermissions,
      refreshBarberProfile,
      createBarberProfile,
      claimBarberInvitation,
    }),
    [
      barberProfile,
      barber,
      loading,
      isAdmin,
      isManager,
      isReceptionist,
      isLocationManager,
      managerLocationId,
      managerPermissions,
      refreshBarberProfile,
      createBarberProfile,
      claimBarberInvitation,
    ]
  );

  return (
    <BarberProfileContext.Provider value={value}>
      {children}
    </BarberProfileContext.Provider>
  );
}

export function useBarberProfile() {
  const context = useContext(BarberProfileContext);

  if (!context) {
    throw new Error("useBarberProfile must be used within BarberProfileProvider");
  }

  return context;
}
