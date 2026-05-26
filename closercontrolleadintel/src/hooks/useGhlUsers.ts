import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

export interface GhlUser {
  ghl_user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean;
}

export function displayName(u: GhlUser): string {
  const combined = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  if (u.email) return u.email;
  return u.ghl_user_id;
}

export function useGhlUsers(): { users: GhlUser[]; userMap: Map<string, GhlUser>; loading: boolean } {
  const [users, setUsers] = useState<GhlUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantFilter, ready } = useTenantFilter();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      let q: any = supabase
        .from("ghl_users")
        .select("ghl_user_id, first_name, last_name, email, role, is_active")
        .eq("is_active", true);
      if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
      const { data } = await q;
      if (!cancelled) {
        setUsers((data as GhlUser[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantFilter, ready]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.ghl_user_id, u])), [users]);
  return { users, userMap, loading };
}