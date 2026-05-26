import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { COLORS } from "@/utils/leadUtils";
import { AdminLayout } from "./AdminLayout";
import { useAdminTenantsOverview } from "@/hooks/useAdminTenantsOverview";
import { TenantOverviewTab } from "./_tabs/TenantOverviewTab";
import { TenantSyncHistoryTab } from "./_tabs/TenantSyncHistoryTab";
import { TenantEditTab } from "./_tabs/TenantEditTab";
import { TenantUsersTab } from "./_tabs/TenantUsersTab";
import { TenantBillingTab } from "./_tabs/TenantBillingTab";
import { TenantFieldsTab } from "./_tabs/TenantFieldsTab";
import { useSyncHistory } from "@/hooks/useSyncHistory";

type TabKey = "overview" | "sync" | "users" | "billing" | "fields" | "edit";

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { rows, loading, refetch } = useAdminTenantsOverview();
  const tenant = useMemo(() => rows.find((r) => r.id === id), [rows, id]);
  const [tab, setTab] = useState<TabKey>("overview");
  const sync = useSyncHistory(id ?? null, 50);

  if (loading) return <AdminLayout><div style={{ color: COLORS.T2 }}>Loading…</div></AdminLayout>;
  if (!tenant) {
    return (
      <AdminLayout>
        <div style={{ color: COLORS.T2, fontSize: 13 }}>
          Tenant not found. <Link to="/admin/tenants" style={{ color: COLORS.GRN }}>Back to list</Link>
        </div>
      </AdminLayout>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "sync", label: "Sync History" },
    { key: "users", label: "Users" },
    { key: "billing", label: "Billing" },
    { key: "fields", label: "Fields" },
    { key: "edit", label: "Edit" },
  ];

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link to="/admin/tenants" style={{
          color: COLORS.T2, textDecoration: "none", fontSize: 12,
          padding: "5px 10px", border: "1px solid " + COLORS.B2, borderRadius: 8,
        }}>← Tenants</Link>
        <h2 style={{
          margin: 0, fontFamily: "'League Spartan', sans-serif",
          fontSize: 22, color: COLORS.TEXT,
        }}>{tenant.name}</h2>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid " + COLORS.B1 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "transparent", border: "none",
              color: tab === t.key ? COLORS.GRN : COLORS.T2,
              borderBottom: "2px solid " + (tab === t.key ? COLORS.GRN : "transparent"),
              padding: "10px 16px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <TenantOverviewTab tenant={tenant} onSyncTriggered={() => sync.refetch()} />
      )}
      {tab === "sync" && <TenantSyncHistoryTab tenantId={tenant.id} />}
      {tab === "users" && <TenantUsersTab tenantId={tenant.id} tenantName={tenant.name} />}
      {tab === "billing" && <TenantBillingTab tenant={tenant} />}
      {tab === "fields" && <TenantFieldsTab tenantId={tenant.id} tenantName={tenant.name} />}
      {tab === "edit" && <TenantEditTab tenant={tenant} onSaved={refetch} />}
    </AdminLayout>
  );
}