import { useState } from "react";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import { useTenantStats } from "@/hooks/useTenantStats";
import type { AdminTenantOverviewRow } from "@/hooks/useAdminTenantsOverview";
import { useCheckNotesAccess, type CheckNotesResult } from "@/hooks/useCheckNotesAccess";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const RESOURCES = ["all", "users", "contacts", "opportunities", "conversations", "messages", "tasks", "notes"] as const;
type Resource = typeof RESOURCES[number];

export function TenantOverviewTab({
  tenant,
  onSyncTriggered,
}: {
  tenant: AdminTenantOverviewRow;
  onSyncTriggered: () => void;
}) {
  const { stats, loading } = useTenantStats(tenant.id);
  const [resource, setResource] = useState<Resource>("all");
  const [mode, setMode] = useState<"full" | "delta">("full");
  const [busy, setBusy] = useState(false);
  const checkNotes = useCheckNotesAccess();
  const [lastCheck, setLastCheck] = useState<CheckNotesResult | null>(null);
  const [showSample, setShowSample] = useState(false);

  async function trigger() {
    if (!tenant?.id || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("ghl-sync", {
        body: { tenant_id: tenant.id, resource, mode },
      });
      if (error) throw error;
      toast.success(`Sync started: ${resource} (${mode})`);
      onSyncTriggered();
    } catch (e: any) {
      toast.error(`Sync failed: ${e?.message ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  const sectionStyle: React.CSSProperties = {
    background: COLORS.S1, border: "1px solid " + COLORS.B1,
    borderRadius: 10, padding: 16, marginBottom: 16,
  };

  return (
    <div>
      <div style={sectionStyle}>
        <h3 style={hStyle}>Tenant info</h3>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, fontSize: 12 }}>
          <Field label="Name" value={tenant.name} />
          <Field label="ID" value={<code style={{ fontSize: 11 }}>{tenant.id}</code>} />
          <Field label="Location ID" value={<code style={{ fontSize: 11 }}>{tenant.ghl_location_id ?? "—"}</code>} />
          <Field label="Status" value={tenant.status} />
          <Field label="Plan" value={tenant.plan_type ?? "—"} />
          <Field label="Created" value={new Date(tenant.created_at).toLocaleString()} />
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={hStyle}>Quick stats</h3>
        {loading && <div style={{ color: COLORS.T2, fontSize: 12 }}>Loading…</div>}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Stat label="Contacts" value={stats.contacts} />
            <Stat label="Opportunities" value={stats.opportunities} />
            <Stat label="Messages" value={stats.messages} />
            <Stat label="Users" value={stats.users} />
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <h3 style={hStyle}>Notes Access</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <NotesPill accessible={tenant.notes_scope_accessible} exist={tenant.notes_exist} />
          <span style={{ color: COLORS.T3 }}>
            Last checked: {tenant.notes_last_checked_at
              ? new Date(tenant.notes_last_checked_at).toLocaleString()
              : "never"}
          </span>
          <button
            onClick={async () => {
              const res = await checkNotes.mutateAsync({ tenant_id: tenant.id });
              if (res.result) setLastCheck(res.result);
            }}
            disabled={checkNotes.isPending}
            style={{
              background: COLORS.GRN, color: "#fff", border: "none",
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: checkNotes.isPending ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >
            {checkNotes.isPending
              ? "Checking…"
              : tenant.notes_last_checked_at ? "Re-check" : "Check now"}
          </button>
        </div>
        {lastCheck?.sample_note && (
          <Collapsible open={showSample} onOpenChange={setShowSample}>
            <div style={{ marginTop: 12 }}>
              <CollapsibleTrigger asChild>
                <button style={{
                  background: "transparent", border: "1px solid " + COLORS.B2, color: COLORS.T2,
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {showSample ? "Hide sample" : "View sample"}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div style={{
                  marginTop: 8, padding: 10, background: COLORS.S2, borderRadius: 6,
                  color: COLORS.TEXT, fontSize: 12, whiteSpace: "pre-wrap",
                }}>{lastCheck.sample_note}</div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
      </div>

      <div style={sectionStyle}>
        <h3 style={hStyle}>Trigger sync</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={resource}
            onChange={(e) => setResource(e.target.value as Resource)}
            style={inputStyle}
          >
            {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: COLORS.T2, fontSize: 12 }}>
            <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} />
            Full
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: COLORS.T2, fontSize: 12 }}>
            <input type="radio" checked={mode === "delta"} onChange={() => setMode("delta")} />
            Delta
          </label>
          <button
            onClick={trigger}
            disabled={!tenant?.id || busy}
            style={{
              background: !tenant?.id || busy ? COLORS.B2 : COLORS.GRN, color: "#fff", border: "none",
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: !tenant?.id || busy ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >{busy ? "Triggering…" : "Trigger"}</button>
        </div>
      </div>
    </div>
  );
}

const hStyle: React.CSSProperties = {
  margin: "0 0 12px", fontSize: 13, color: COLORS.T2,
  textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  background: COLORS.S2, border: "1px solid " + COLORS.B2, color: COLORS.TEXT,
  padding: "6px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ color: COLORS.T3 }}>{label}</div>
      <div style={{ color: COLORS.TEXT }}>{value}</div>
    </>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: COLORS.S2, padding: 12, borderRadius: 8, border: "1px solid " + COLORS.B1 }}>
      <div style={{ color: COLORS.T3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ color: COLORS.GRN, fontSize: 22, fontFamily: "'League Spartan', sans-serif", marginTop: 4 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function NotesPill({ accessible, exist }: { accessible: boolean | null; exist: boolean | null }) {
  let label = "Unknown"; let color = COLORS.T3;
  if (accessible === false) { label = "No scope"; color = COLORS.RED; }
  else if (accessible === true && exist === true) { label = "Yes — has notes"; color = COLORS.GRN; }
  else if (accessible === true && exist === false) { label = "Scope OK — no notes"; color = COLORS.AMB; }
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 6,
      background: color + "20", color, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.4, textTransform: "uppercase",
    }}>{label}</span>
  );
}