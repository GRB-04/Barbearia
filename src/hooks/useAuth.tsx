import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<User | null>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_CACHE_KEY = "auth-session-cache-v2";

type CachedAuthPayload = {
  session: Session | null;
  user: User | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const initializedRef = useRef(false);

  const saveCache = (nextSession: Session | null, nextUser: User | null) => {
    const payload: CachedAuthPayload = {
      session: nextSession,
      user: nextUser,
    };

    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(payload));
  };

  const clearCache = () => {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
  };

  const loadCache = () => {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return false;

    try {
      const cached = JSON.parse(raw) as CachedAuthPayload;
      setSession(cached.session ?? null);
      setUser(cached.user ?? null);
      return true;
    } catch (error) {
      console.error("[AuthProvider] cache parse error:", error);
      clearCache();
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncSessionState = (nextSession: Session | null) => {
      if (!isMounted) return;

      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      setLoading(false);

      saveCache(nextSession, nextUser);
    };

    if (!initializedRef.current) {
      initializedRef.current = true;

      const cacheLoaded = loadCache();
      if (cacheLoaded) {
        setLoading(false);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncSessionState(nextSession);
    });

    const loadInitialSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          if (isMounted) {
            setSession(null);
            setUser(null);
            setLoading(false);
            clearCache();
          }
          return;
        }

        syncSessionState(data.session);
      } catch (error) {
        console.error("[AuthProvider] loadInitialSession error:", error);

        if (isMounted) {
          setSession(null);
          setUser(null);
          setLoading(false);
          clearCache();
        }
      }
    };

    void loadInitialSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setSession(null);
        setUser(null);
        clearCache();
        return;
      }

      const nextSession = data.session ?? null;
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      saveCache(nextSession, nextUser);
    } catch (error) {
      console.error("[AuthProvider] refreshSession error:", error);
      setSession(null);
      setUser(null);
      clearCache();
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signUp = async (email: string, password: string, metadata?: any) => {
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: metadata,
        },
      });

      if (error) {
        throw error;
      }

      return data.user;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setSession(null);
      setUser(null);
      clearCache();
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      signIn,
      signUp,
      signOut,
      refreshSession,
    }),
    [session, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}