import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantStats {
  contacts: number;
  opportunities: number;
  messages: number;
  users: number;
}

async function countOf(
  table: "ghl_contacts" | "ghl_opportunities" | "ghl_messages" | "ghl_users",
  tenantId: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return count ?? 0;
}

export function useTenantStats(tenantId: string | null) {
  const query = useQuery({
    queryKey: ["tenant_stats", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantStats> => {
      const [contacts, opportunities, messages, users] = await Promise.all([
        countOf("ghl_contacts", tenantId!),
        countOf("ghl_opportunities", tenantId!),
        countOf("ghl_messages", tenantId!),
        countOf("ghl_users", tenantId!),
      ]);
      return { contacts, opportunities, messages, users };
    },
  });
  return { stats: query.data, loading: query.isLoading, refetch: query.refetch };
}