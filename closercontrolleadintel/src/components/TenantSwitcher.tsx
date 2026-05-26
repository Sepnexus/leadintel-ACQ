import { useEffect, useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { SUPER_ADMIN_TENANT_KEY, useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useTenantsList } from "@/hooks/useTenantsList";
import { AddTenantDialog } from "@/components/admin/AddTenantDialog";

/**
 * Super-admin-only tenant switcher. Persists selection to localStorage so
 * useCurrentTenant() picks it up. Returns null for non-super-admins.
 */
export function TenantSwitcher() {
  const { role, tenant } = useCurrentTenant();
  const { tenants } = useTenantsList();
  const [selected, setSelected] = useState<string>(tenant?.id ?? "");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setSelected(tenant?.id ?? "");
  }, [tenant?.id]);

  if (role !== "super_admin") return null;

  const onChange = (id: string) => {
    setSelected(id);
    if (id) localStorage.setItem(SUPER_ADMIN_TENANT_KEY, id);
    else localStorage.removeItem(SUPER_ADMIN_TENANT_KEY);
    // Force a reload so all tenant-scoped queries re-run with the new context.
    window.location.reload();
  };

  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        title="Super admin: switch tenant view"
        style={{
          background: COLORS.S2,
          border: "1px solid " + COLORS.GRN + "40",
          borderRadius: 8,
          color: COLORS.GRN,
          fontSize: 11,
          padding: "5px 10px",
          fontFamily: "inherit",
          outline: "none",
          cursor: "pointer",
        }}
      >
        <option value="">All tenants (no scope)</option>
        {tenants.filter((t) => t.status === "active").map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        title="Add new tenant"
        aria-label="Add new tenant"
        style={{
          background: COLORS.S2,
          border: "1px solid " + COLORS.GRN + "40",
          borderRadius: 8,
          color: COLORS.GRN,
          fontSize: 14,
          lineHeight: 1,
          width: 26,
          height: 26,
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        +
      </button>
      <AddTenantDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}