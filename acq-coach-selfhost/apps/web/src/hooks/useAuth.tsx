import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Account = { id: string; name: string; location_id: string; company_id: string; integrated_at: string; is_active: boolean };
export type WhoAmI = {
  user: { id: string; email: string };
  is_super_admin: boolean;
  admin_account_ids: string[];
  rep_account_ids: string[];
  rep_ghl_user_ids: string[];
  accounts: Account[];
};

type Ctx = {
  session: any | null;
  loading: boolean;
  who: WhoAmI | null;
  refreshWho: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({ session: null, loading: true, who: null, refreshWho: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState<WhoAmI | null>(null);

  const fetchWho = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ghl-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
        body: JSON.stringify({ action: "whoami" }),
      });
      const data = await res.json();
      if (res.ok) setWho(data);
      else setWho(null);
    } catch {
      setWho(null);
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.access_token) {
        setTimeout(() => fetchWho(s.access_token), 0);
      } else {
        setWho(null);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.access_token) fetchWho(s.access_token).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchWho]);

  const refreshWho = useCallback(async () => {
    if (session?.access_token) await fetchWho(session.access_token);
  }, [session, fetchWho]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    setWho(null);
    // Land on the platform launcher (the "main" login) instead of re-rendering
    // this app's own login page. Falls through to the local login only when no
    // launcher is configured (standalone dev).
    const launcher = import.meta.env.VITE_LAUNCHER_URL as string | undefined;
    if (launcher) window.location.href = launcher;
  }, []);

  return <AuthCtx.Provider value={{ session, loading, who, refreshWho, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
