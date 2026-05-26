import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserInvitation {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  invited_by_user_id: string | null;
}

export interface TenantMember {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

export function tenantUsersKey(tenantId: string) {
  return ["tenant_users", tenantId] as const;
}
export function tenantInvitationsKey(tenantId: string) {
  return ["tenant_invitations", tenantId] as const;
}

export function useTenantMembers(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: tenantUsersKey(tenantId ?? ""),
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantMember[]> => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("id, user_id, created_at, users:user_id(email, full_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        email: row.users?.email ?? null,
        full_name: row.users?.full_name ?? null,
        created_at: row.created_at,
      }));
    },
  });
}

export function useTenantInvitations(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: tenantInvitationsKey(tenantId ?? ""),
    enabled: !!tenantId,
    queryFn: async (): Promise<UserInvitation[]> => {
      const { data, error } = await supabase
        .from("user_invitations")
        .select("id, email, expires_at, accepted_at, revoked_at, created_at, invited_by_user_id")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserInvitation[];
    },
  });
}

export function useInvalidateTenantUsers() {
  const qc = useQueryClient();
  return (tenantId: string) => {
    qc.invalidateQueries({ queryKey: tenantUsersKey(tenantId) });
    qc.invalidateQueries({ queryKey: tenantInvitationsKey(tenantId) });
  };
}