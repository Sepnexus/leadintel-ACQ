// Account → Connections — GHL integration status (read-only for customer admins).
// Token rotation lives in Platform Admin (Customers page).

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { accountApi, ConnectionsData, MyCustomer } from "./accountApi";
import { Pill, ErrorBanner } from "../admin/AdminLayout";

export function ConnectionsTab({ cid, customer }: { cid: string; customer: MyCustomer }) {
  const [data, setData]   = useState<ConnectionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const r = await accountApi.connections(cid);
      if (r.ok) setData(r.data); else setError(r.error);
    })();
  }, [cid]);

  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: 4, fontSize: 22 }}>Connections</h2>
      <div style={{ color: COLORS.T3, fontSize: 12, marginBottom: 18 }}>
        How {customer.name} connects to external services. Token rotation is a privileged action — contact your platform admin.
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!data ? <div style={{ padding: 24, color: COLORS.T3, textAlign: "center" }}>Loading…</div> : (
        <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>GoHighLevel</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>Used by both ACQ Coach (call sync) and Lead Intel (lead data)</div>
            </div>
            {data.ghl.ghl_token_set
              ? <Pill color={COLORS.GREEN}>connected</Pill>
              : <Pill color="#ff7a7a">not connected</Pill>}
          </div>
          <Row label="Location ID" value={data.ghl.ghl_location_id || "—"} mono />
          <Row label="Company ID"  value={data.ghl.ghl_company_id  || "—"} mono />
          <Row
            label="PIT token"
            value={data.ghl.ghl_token_set
              ? <>•••••••• {data.ghl.ghl_pit_token_last_4 || "????"}</>
              : "(not set)"}
            hint={data.ghl.ghl_pit_token_set_at
              ? `Last rotated ${new Date(data.ghl.ghl_pit_token_set_at).toLocaleString()}`
              : undefined}
            mono
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, hint, mono }: { label: string; value: React.ReactNode; hint?: string; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "12px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 11, color: COLORS.T3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: mono ? "ui-monospace, monospace" : undefined }}>
        {value}
        {hint && <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  );
}
