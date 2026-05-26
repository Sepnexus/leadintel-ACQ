import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COLORS } from "@/utils/leadUtils";
import { AdminLayout } from "./AdminLayout";
import { useAdminTenantsOverview } from "@/hooks/useAdminTenantsOverview";
import { AddTenantDialog } from "@/components/admin/AddTenantDialog";
import { useCheckNotesAccess } from "@/hooks/useCheckNotesAccess";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active:   { bg: COLORS.GRN + "30", fg: COLORS.GRN,  label: "Active" },
    paused:   { bg: COLORS.AMB + "30", fg: COLORS.AMB,  label: "Paused" },
    disabled: { bg: COLORS.T3 + "30",  fg: COLORS.T2,   label: "Disabled" },
  };
  const s = map[status] ?? map.disabled;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      background: s.bg, color: s.fg, fontSize: 10, fontWeight: 600,
      letterSpacing: 0.4, textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

function fmtRelative(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function NotesBadge({ accessible, exist }: { accessible: boolean | null; exist: boolean | null }) {
  let label = "—";
  let color = COLORS.T3;
  if (accessible === false) { label = "❌ No scope"; color = COLORS.RED; }
  else if (accessible === true && exist === true) { label = "✅ Has notes"; color = COLORS.GRN; }
  else if (accessible === true && exist === false) { label = "🟡 No notes"; color = COLORS.AMB; }
  return <span style={{ color, fontSize: 11 }}>{label}</span>;
}

export default function AdminTenantsPage() {
  const { rows, loading, error, refetch } = useAdminTenantsOverview();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const checkNotes = useCheckNotesAccess();

  const mapAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("map-all-tenants-fields");
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed");
      return data as { ok: true; tenants: number; avg_mapped: number; results: Array<{ name: string; mapped: string[]; unmapped: string[]; error?: string }> };
    },
    onMutate: () => {
      toast.loading("Mapping fields for tenants…", { id: "map-all" });
    },
    onSuccess: (data) => {
      toast.success(
        `Auto-mapped ${data.tenants} tenants. ${data.avg_mapped} fields matched per tenant on average.`,
        { id: "map-all" },
      );
      const failed = data.results.filter((r) => r.error || r.mapped.length === 0);
      for (const f of failed.slice(0, 5)) {
        toast.warning(`${f.name}: ${f.error ?? "no fields matched"}`);
      }
    },
    onError: (e: any) => {
      toast.error(e?.message || "Failed to map fields", { id: "map-all" });
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const inputStyle: React.CSSProperties = {
    background: COLORS.S2, border: "1px solid " + COLORS.B2, color: COLORS.TEXT,
    padding: "6px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none",
  };

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Search tenants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 220 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{
            background: COLORS.GRN, border: "none", color: "#fff",
            padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            fontFamily: "inherit", fontWeight: 600,
          }}
        >+ Add tenant</button>
        <button
          onClick={() => checkNotes.mutate({ run_all: true })}
          disabled={checkNotes.isPending}
          style={{
            background: "transparent", border: "1px solid " + COLORS.B2, color: COLORS.TEXT,
            padding: "8px 14px", borderRadius: 8, fontSize: 12,
            cursor: checkNotes.isPending ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontWeight: 600, marginLeft: 8,
          }}
        >{checkNotes.isPending ? "Checking…" : "Check all tenants"}</button>
        <button
          onClick={() => mapAll.mutate()}
          disabled={mapAll.isPending}
          style={{
            background: "transparent", border: "1px solid " + COLORS.GRN + "60", color: COLORS.GRN,
            padding: "8px 14px", borderRadius: 8, fontSize: 12,
            cursor: mapAll.isPending ? "not-allowed" : "pointer",
            fontFamily: "inherit", fontWeight: 600, marginLeft: 8,
          }}
        >{mapAll.isPending ? "Mapping…" : "Map all tenants automatically"}</button>
      </div>

      {loading && <div style={{ color: COLORS.T2, fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ color: COLORS.RED, fontSize: 13 }}>{error.message}</div>}
      {!loading && !error && (
        <div style={{
          background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: COLORS.S2, color: COLORS.T2, textAlign: "left" }}>
                {["Name", "Status", "Plan", "Location ID", "Created", "Last Sync", "Contacts", "Notes", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid " + COLORS.B1, color: COLORS.TEXT }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "10px 12px" }}><StatusPill status={t.status} /></td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{t.plan_type ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2, fontFamily: "monospace", fontSize: 11 }}>{t.ghl_location_id ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{fmtRelative(t.created_at)}</td>
                  <td style={{ padding: "10px 12px", color: t.last_sync_at ? COLORS.TEXT : COLORS.T3 }}>{fmtRelative(t.last_sync_at)}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.TEXT }}>{t.contact_count.toLocaleString()}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <NotesBadge accessible={t.notes_scope_accessible} exist={t.notes_exist} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Link
                      to={`/admin/tenants/${t.id}`}
                      style={{
                        color: COLORS.GRN, textDecoration: "none",
                        border: "1px solid " + COLORS.GRN + "40", padding: "4px 10px",
                        borderRadius: 6, fontSize: 11,
                      }}
                    >View</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>No tenants match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AddTenantDialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) refetch(); }} />
    </AdminLayout>
  );
}