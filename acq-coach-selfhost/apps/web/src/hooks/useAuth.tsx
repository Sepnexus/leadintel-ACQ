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

// ─── DEV BYPASS ───────────────────────────────────────────────────────────────
// Set VITE_DEV_BYPASS_AUTH=true in .env.local to skip login and preview the app
// as a mock super-admin. Never set this in production.
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";
const MOCK_SESSION = DEV_BYPASS ? { access_token: "dev-bypass", user: { id: "dev-user", email: "dev@local" } } : null;
const MOCK_WHO: WhoAmI = {
  user: { id: "dev-user", email: "dev@local" },
  is_super_admin: true,
  admin_account_ids: [],
  rep_account_ids: [],
  rep_ghl_user_ids: [],
  accounts: [],
};
// ──────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any | null>(DEV_BYPASS ? MOCK_SESSION : null);
  const [loading, setLoading] = useState(!DEV_BYPASS);
  const [who, setWho] = useState<WhoAmI | null>(DEV_BYPASS ? MOCK_WHO : null);

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
    if (DEV_BYPASS) return; // skip real auth when bypass is active
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
  }, []);

  return <AuthCtx.Provider value={{ session, loading, who, refreshWho, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
