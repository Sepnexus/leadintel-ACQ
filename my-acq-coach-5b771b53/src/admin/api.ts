// Shared admin-api client + react-query hooks.
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export function useAdminCall() {
  const { session } = useAuth();
  return async (body: Record<string, unknown>) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  };
}

export function useAdminQuery<T = any>(key: QueryKey, body: Record<string, unknown>, opts?: { enabled?: boolean; staleTime?: number; refetchInterval?: number }) {
  const call = useAdminCall();
  return useQuery<T>({
    queryKey: key,
    queryFn: () => call(body) as Promise<T>,
    staleTime: opts?.staleTime ?? 30_000,
    enabled: opts?.enabled,
    refetchInterval: opts?.refetchInterval,
    refetchOnWindowFocus: false,
  });
}

export function useAdminMutation<TVars = any>(opts?: { invalidate?: QueryKey[] }) {
  const call = useAdminCall();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => call(vars as any),
    onSuccess: () => {
      opts?.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export const fmt$ = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;
export const fmt$4 = (cents: number) => `$${(Number(cents) / 100).toFixed(4)}`;

// Shared types
export type Customer = {
  id: string; name: string; location_id: string; company_id: string;
  integrated_at: string; is_active: boolean; created_at: string; api_key?: string;
  admins: { id: string; email: string }[];
  rep_count: number;
  balance_cents: number;
};
export type TeamMember = { user_id: string; email: string; role: string; ghl_user_ids: string[]; created_at?: string };
export type GhlUser = { ghl_user_id: string; name?: string; email?: string; role?: string };
export type Tx = {
  id: string; account_id: string; account_name?: string; type: string;
  amount_cents: number; balance_after_cents: number; reason: string;
  stripe_session_id: string | null; created_at: string;
};
export type SyncRun = { id: string; account_id: string; trigger: string; status: string; conversations_scanned: number; conversations_saved: number; messages_saved: number; call_messages_found: number; duration_ms: number | null; error_message: string | null; cursor_before_ms: number | null; cursor_after_ms: number | null; started_at: string; finished_at: string | null };
export type SyncStateRow = { account_id: string; cursor_ms: number; last_run_at: string | null; last_status: string | null };
export type AnyUser = { id: string; email: string; created_at: string; last_sign_in_at: string | null; roles: { role: string; account_id: string | null; account_name: string | null; created_at: string }[] };
