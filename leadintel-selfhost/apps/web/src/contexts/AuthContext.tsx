import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listener FIRST, then getSession — required by Supabase auth patterns.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);
      // Audit super_admin sign-in events. Defer with setTimeout to avoid
      // doing async work inside the auth callback (Supabase guideline).
      if (event === "SIGNED_IN" && newSession?.user) {
        setTimeout(() => {
          maybeAuditSuperAdminLogin().catch(() => {});
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function maybeAuditSuperAdminLogin() {
  // Look up role for the current user; only audit super_admins.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") return;
  await supabase.functions.invoke("log-admin-event", {
    body: {
      action: "login.super_admin",
      metadata: {
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    },
  });
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}