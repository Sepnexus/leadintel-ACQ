import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

export interface TenantListItem {
  id: string;
  name: string;
  status: string;
  plan_type?: string | null;
  ghl_location_id?: string | null;
  created_at?: string | null;
}

export const TENANTS_LIST_KEY = ["tenants", "list"] as const;

/**
 * Loads the full tenants list. Only runs for super_admins (RLS will block others anyway).
 */
export function useTenantsList() {
  const { role } = useCurrentTenant();
  const enabled = role === "super_admin";
  const query = useQuery({
    queryKey: TENANTS_LIST_KEY,
    enabled,
    queryFn: async (): Promise<TenantListItem[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, status, plan_type, ghl_location_id, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TenantListItem[];
    },
  });
  return {
    tenants: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}