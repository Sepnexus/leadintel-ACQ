import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

export interface GhlIntegrationStatus {
  connected: boolean;
  lastSyncAt: string | null;
  contactCount: number;
}

export function useIntegrationStatus() {
  const [ghl, setGhl] = useState<GhlIntegrationStatus>({
    connected: false,
    lastSyncAt: null,
    contactCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const { tenantFilter, ready } = useTenantFilter();

  const refresh = useCallback(async () => {
    let stateQ: any = supabase
      .from("sync_state")
      .select("last_full_sync_at, last_delta_sync_at")
      .eq("resource", "contacts");
    if (tenantFilter) stateQ = stateQ.eq("tenant_id", tenantFilter);
    let countQ: any = supabase
      .from("ghl_contacts")
      .select("ghl_contact_id", { count: "exact", head: true });
    if (tenantFilter) countQ = countQ.eq("tenant_id", tenantFilter);
    const [{ data: state }, { count }] = await Promise.all([
      stateQ.maybeSingle(),
      countQ,
    ]);

    const lastSyncAt =
      (state as any)?.last_delta_sync_at ?? (state as any)?.last_full_sync_at ?? null;

    setGhl({
      connected: !!(state as any)?.last_full_sync_at,
      lastSyncAt,
      contactCount: count ?? 0,
    });
    setLoading(false);
  }, [tenantFilter]);

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [refresh, ready]);

  return { ghl, loading, refresh };
}
