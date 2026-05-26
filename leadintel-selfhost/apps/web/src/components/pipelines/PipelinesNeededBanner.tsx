import { useState } from "react";
import { useTenantPipelinesConfig } from "@/hooks/useTenantPipelinesConfig";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { PipelineSelectionModal } from "./PipelineSelectionModal";

/**
 * Soft-prompt banner shown to tenant_users (and super_admin viewing a specific tenant)
 * when the tenant has no rows in tenant_pipelines yet.
 */
export function PipelinesNeededBanner() {
  const { tenant, role, loading: tenantLoading } = useCurrentTenant();
  const { needsSetup, loading, refetch } = useTenantPipelinesConfig();
  const [open, setOpen] = useState(false);

  if (tenantLoading || loading) return null;
  if (!tenant) return null;
  if (!needsSetup) return null;
  // Hide for super_admin only when no tenant is selected — once they switch into
  // a tenant the banner reminds them this tenant needs setup.
  if (role !== "tenant_user" && role !== "super_admin") return null;

  return (
    <>
      <div style={{
        background: "linear-gradient(90deg, rgba(78,125,61,0.18), rgba(78,125,61,0.06))",
        border: "1px solid rgba(78,125,61,0.45)",
        borderRadius: 12,
        padding: "14px 18px",
        margin: "0 0 16px 0",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            Welcome to Lead Intel
          </div>
          <div style={{ fontSize: 12, color: "#bbb" }}>
            Tell us which pipelines to monitor for <strong style={{ color: "#fff" }}>{tenant.name}</strong>. You can change this anytime in Settings.
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: "#4e7d3d",
            border: "none",
            color: "#fff",
            padding: "9px 20px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Select Pipelines
        </button>
      </div>
      {open && (
        <PipelineSelectionModal
          tenantId={tenant.id}
          tenantName={tenant.name}
          isOpen={open}
          onClose={() => setOpen(false)}
          onSaved={() => { refetch(); }}
        />
      )}
    </>
  );
}