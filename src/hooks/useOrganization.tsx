import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

interface OrganizationContextType {
  organization: Organization | null;
  loading: boolean;
  refreshOrganization: () => Promise<void>;
  createOrganization: (name: string) => Promise<Organization>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`organizations query timeout after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then((result) => {
        window.clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrganization = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const queryPromise: PromiseLike<PostgrestSingleResponse<Organization | null>> = supabase
        .from("organizations")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      const { data, error } = await withTimeout(queryPromise, 8000);

      if (error) {
        console.error("[OrgProvider] fetch error:", error);
        setOrganization(null);
        return;
      }

      setOrganization(data ?? null);
    } catch (error) {
      console.error("[OrgProvider] unexpected fetch error:", error);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user?.id, user]);

  const refreshOrganization = useCallback(async () => {
    await fetchOrganization();
  }, [fetchOrganization]);

  const createOrganization = useCallback(
    async (name: string): Promise<Organization> => {
      const normalizedName = name.trim();

      if (!user?.id) {
        throw new Error("Usuário não autenticado.");
      }

      if (!normalizedName) {
        throw new Error("Nome da organização é obrigatório.");
      }

      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("organizations")
          .insert({
            name: normalizedName,
            owner_id: user.id,
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        setOrganization(data);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void fetchOrganization();
  }, [fetchOrganization]);

  const value = useMemo(
    () => ({
      organization,
      loading,
      refreshOrganization,
      createOrganization,
    }),
    [organization, loading, refreshOrganization, createOrganization]
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);

  if (!context) {
    throw new Error("useOrganization must be used within OrgProvider");
  }

  return context;
}