import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SyncHistoryRow {
  id: string;
  tenant_id: string;
  resource: string;
  mode: string;
  triggered_by_user_id: string | null;
  triggered_by_email: string | null;
  trigger_source: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "failed" | "partial";
  stats: Record<string, any> | null;
  error_message: string | null;
  duration_ms: number | null;
}

export function useSyncHistory(tenantId: string | null, limit = 50) {
  const query = useQuery({
    queryKey: ["sync_history", tenantId, limit],
    enabled: !!tenantId,
    queryFn: async (): Promise<SyncHistoryRow[]> => {
      const { data, error } = await supabase
        .from("sync_history")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SyncHistoryRow[];
    },
    refetchInterval: (q) => {
      const rows = (q.state.data as SyncHistoryRow[] | undefined) ?? [];
      return rows.some((r) => r.status === "running") ? 5000 : false;
    },
  });
  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}