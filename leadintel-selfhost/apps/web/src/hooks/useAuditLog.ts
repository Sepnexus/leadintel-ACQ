import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, any> | null;
  occurred_at: string;
}

export interface AuditLogFilters {
  fromDate?: string | null;
  toDate?: string | null;
  actorUserId?: string | null;
  action?: string | null;
  page?: number;
  pageSize?: number;
}

export function useAuditLog(filters: AuditLogFilters = {}) {
  const { role } = useCurrentTenant();
  const pageSize = filters.pageSize ?? 20;
  const page = filters.page ?? 0;

  const query = useQuery({
    queryKey: ["audit_log", filters],
    enabled: role === "super_admin",
    queryFn: async (): Promise<{ rows: AuditLogRow[]; count: number }> => {
      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false });
      if (filters.fromDate) q = q.gte("occurred_at", filters.fromDate);
      if (filters.toDate) q = q.lte("occurred_at", filters.toDate);
      if (filters.actorUserId) q = q.eq("actor_user_id", filters.actorUserId);
      if (filters.action) q = q.eq("action", filters.action);
      q = q.range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AuditLogRow[], count: count ?? 0 };
    },
  });
  return {
    rows: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}