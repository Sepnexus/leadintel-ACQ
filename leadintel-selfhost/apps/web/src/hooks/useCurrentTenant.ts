import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SUPER_ADMIN_VIEW_KEY = "leadIntel_super_admin_view_tenant";

export interface CurrentTenant {
  id: string;
  name: string;
  status: string;
  ghl_location_id: string | null;
}

export interface CurrentTenantState {
  tenant: CurrentTenant | null;
  role: "super_admin" | "tenant_user" | null;
  loading: boolean;
  /** True if user has no membership and isn't super admin. */
  noTenantAssigned: boolean;
}

/**
 * Returns the active tenant for the current user.
 * - tenant_user: their assigned tenant (or null + noTenantAssigned=true)
 * - super_admin: tenant from localStorage selection, or null (= "view all")
 */
export function useCurrentTenant(): CurrentTenantState {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<CurrentTenantState>({
    tenant: null,
    role: null,
    loading: true,
    noTenantAssigned: false,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ tenant: null, role: null, loading: false, noTenantAssigned: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const role = (profile?.role as "super_admin" | "tenant_user" | undefined) ?? null;

      if (role === "super_admin") {
        const selected = typeof window !== "undefined"
          ? localStorage.getItem(SUPER_ADMIN_VIEW_KEY)
          : null;
        if (!selected) {
          if (!cancelled) setState({ tenant: null, role, loading: false, noTenantAssigned: false });
          return;
        }
        const { data: t } = await supabase
          .from("tenants")
          .select("id, name, status, ghl_location_id")
          .eq("id", selected)
          .maybeSingle();
        if (!cancelled) setState({ tenant: t ?? null, role, loading: false, noTenantAssigned: false });
        return;
      }

      // tenant_user
      const { data: membership } = await supabase
        .from("tenant_users")
        .select("tenants(id, name, status, ghl_location_id)")
        .eq("user_id", user.id)
        .maybeSingle();
      const tenant = (membership?.tenants as unknown as CurrentTenant | null) ?? null;
      if (!cancelled) {
        setState({
          tenant,
          role,
          loading: false,
          noTenantAssigned: !tenant,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return state;
}

export const SUPER_ADMIN_TENANT_KEY = SUPER_ADMIN_VIEW_KEY;