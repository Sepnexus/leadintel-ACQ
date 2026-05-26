import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

export interface UsersSyncState {
  last_full_sync_at: string | null;
  last_delta_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
}

export function useUsersSyncState(activeUserCount: number) {
  const [state, setState] = useState<UsersSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const { tenantFilter, ready } = useTenantFilter();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      let q: any = supabase
        .from("sync_state")
        .select("last_full_sync_at, last_delta_sync_at, last_error, last_error_at, consecutive_failures")
        .eq("resource", "users");
      if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
      const { data } = await q.maybeSingle();
      if (!cancelled) {
        setState((data as UsersSyncState) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // re-fetch when user count changes (i.e. after a sync completes and the list updates)
  }, [activeUserCount, tenantFilter, ready]);

  const lastSyncAt = state?.last_delta_sync_at ?? state?.last_full_sync_at ?? null;
  return { state, lastSyncAt, loading };
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}