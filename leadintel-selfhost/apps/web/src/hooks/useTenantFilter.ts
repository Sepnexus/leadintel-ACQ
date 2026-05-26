import { useCurrentTenant } from "@/hooks/useCurrentTenant";

/**
 * Returns the tenant_id that the frontend should explicitly filter by,
 * or null if no manual filter is needed (RLS handles it).
 *
 * - super_admin with a tenant selected → that tenant_id (RLS allows all, so we must filter)
 * - super_admin with no selection      → null (sees all)
 * - tenant_user                        → null (RLS already scopes to their tenant)
 */
export function useTenantFilter(): { tenantFilter: string | null; ready: boolean } {
  const { tenant, role, loading } = useCurrentTenant();
  if (loading) return { tenantFilter: null, ready: false };
  if (role === "super_admin" && tenant?.id) return { tenantFilter: tenant.id, ready: true };
  if (role === "tenant_user" && tenant?.id) return { tenantFilter: tenant.id, ready: true };
  return { tenantFilter: null, ready: true };
}
