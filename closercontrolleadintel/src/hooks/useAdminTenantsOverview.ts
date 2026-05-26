import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

export interface AdminTenantOverviewRow {
  id: string;
  name: string;
  status: string;
  plan_type: string | null;
  ghl_location_id: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  contact_count: number;
  notes_scope_accessible: boolean | null;
  notes_exist: boolean | null;
  notes_last_checked_at: string | null;
}

export const ADMIN_TENANTS_OVERVIEW_KEY = ["admin", "tenants", "overview"] as const;

export function useAdminTenantsOverview() {
  const { role } = useCurrentTenant();
  const query = useQuery({
    queryKey: ADMIN_TENANTS_OVERVIEW_KEY,
    enabled: role === "super_admin",
    queryFn: async (): Promise<AdminTenantOverviewRow[]> => {
      const { data, error } = await supabase.rpc("admin_tenants_overview");
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        ...r,
        contact_count: Number(r.contact_count ?? 0),
      })) as AdminTenantOverviewRow[];

      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return rows;
      const { data: notes } = await supabase
        .from("tenants")
        .select("id, notes_scope_accessible, notes_exist, notes_last_checked_at")
        .in("id", ids);
      const map = new Map<string, any>();
      for (const n of notes ?? []) map.set(n.id as string, n);
      return rows.map((r) => {
        const n = map.get(r.id);
        return {
          ...r,
          notes_scope_accessible: n?.notes_scope_accessible ?? null,
          notes_exist: n?.notes_exist ?? null,
          notes_last_checked_at: n?.notes_last_checked_at ?? null,
        };
      });
    },
  });
  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}