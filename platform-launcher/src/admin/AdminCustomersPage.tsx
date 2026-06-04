// /admin/customers — list + per-customer detail.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi, CustomerRow, CustomerDetail, Product } from "./adminApi";
import { Pill, Toggle, ErrorBanner } from "./AdminLayout";
import { AddCustomerModal } from "./AddCustomerModal";
import { GhlCredentialsCard } from "./GhlCredentialsCard";
import { BillingCard } from "./BillingCard";
import { useToast } from "./Toast";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export function AdminCustomersPage() {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await adminApi.listCustomers(q);
      if (cancelled) return;
      if (r.ok) { setCustomers(r.data.customers); setError(null); }
      else setError(r.error);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, reloadKey]);

  if (selected) {
    return <CustomerDetailView customerId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Customers</h2>
          <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 4 }}>
            {customers.length} customer{customers.length === 1 ? "" : "s"} · click any row to manage
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by name or GHL location ID…"
            style={{
              background: COLORS.B2, color: COLORS.TEXT, border: `1px solid ${COLORS.B3}`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: FONT,
              width: 280, outline: "none",
            }}
          />
          <button
            onClick={() => setAddOpen(true)}
            style={{
              background: COLORS.GREEN, color: COLORS.BG,
              border: "none", borderRadius: 8,
              padding: "10px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT,
            }}
          >+ Add Customer</button>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(newId) => {
          setAddOpen(false);
          setReloadKey(k => k + 1);
          setSelected(newId); // jump straight into the new customer's detail page
        }}
      />

      <div style={{ border: `1px solid ${COLORS.B2}`, borderRadius: 10, overflow: "hidden", background: COLORS.S1 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1.6fr) minmax(180px, 1fr) 80px 130px 130px 90px",
          padding: "12px 18px", background: COLORS.B2, fontSize: 11,
          color: COLORS.T3, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, gap: 12,
        }}>
          <div>Customer / GHL Account</div>
          <div>GHL Location ID</div>
          <div>Users</div>
          <div>ACQ Coach</div>
          <div>Lead Intel</div>
          <div style={{ textAlign: "right" }}>Flags</div>
        </div>
        {customers.map(c => (
          <div
            key={c.id}
            onClick={() => setSelected(c.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 1.6fr) minmax(180px, 1fr) 80px 130px 130px 90px",
              padding: "14px 18px", borderTop: `1px solid ${COLORS.B2}`,
              cursor: "pointer", alignItems: "center", gap: 12,
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = COLORS.B2)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: COLORS.TEXT,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={c.name}>{c.name}</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>
                status: <span style={{ color: c.status === "active" ? COLORS.GREEN : COLORS.T2 }}>{c.status}</span>
                {c.ghl_company_id && <> · company {c.ghl_company_id.slice(0, 8)}…</>}
              </div>
            </div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: COLORS.T3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.ghl_location_id ?? ""}>
              {c.ghl_location_id ?? "—"}
            </div>
            <div style={{ fontSize: 13, color: COLORS.T2, fontFamily: "ui-monospace, monospace" }}>
              {c.user_count}
            </div>
            <div>{c.on_acq
              ? (c.acq_enabled ? <Pill color={COLORS.GREEN}>enabled</Pill> : <Pill color="#ff7a7a">disabled</Pill>)
              : <span style={{ color: COLORS.T3, fontSize: 12 }}>not on app</span>}</div>
            <div>{c.on_leadintel
              ? (c.li_enabled ? <Pill color={COLORS.GREEN}>enabled</Pill> : <Pill color="#ff7a7a">disabled</Pill>)
              : <span style={{ color: COLORS.T3, fontSize: 12 }}>not on app</span>}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" }}>
              {c.is_test      && <Pill color="#ffc966">TEST</Pill>}
              {c.demo_mode    && <Pill color="#ffc966">DEMO</Pill>}
              {c.trial_active && <Pill color={COLORS.GREEN}>TRIAL</Pill>}
            </div>
          </div>
        ))}
        {customers.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>
            {q ? `No customers match "${q}".` : "No customers yet."}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerDetailView({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Product | null>(null);
  const toast = useToast();

  async function load() {
    const r = await adminApi.getCustomer(customerId);
    if (r.ok) { setDetail(r.data); setError(null); }
    else setError(r.error);
  }

  useEffect(() => { load(); }, [customerId]);

  async function toggle(product: Product, currentEnabled: boolean) {
    if (busy) return;
    setBusy(product);
    const r = await adminApi.setCustomerAccess(customerId, product, !currentEnabled);
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      toast.error(`Failed: ${r.error}`);
      return;
    }
    const productName = product === "acq_coach" ? "ACQ Coach" : "Lead Intel";
    const action = !currentEnabled ? "enabled" : "disabled";
    const name = detail?.customer.name ?? "customer";
    toast.success(`${productName} ${action} for ${name}`, {
      undo: async () => {
        await adminApi.setCustomerAccess(customerId, product, currentEnabled);
        await load();
        toast.info("Reverted");
      },
    });
    await load();
  }

  if (!detail) {
    return error ? <ErrorBanner>{error}</ErrorBanner> : <div style={{ color: COLORS.T3 }}>Loading…</div>;
  }

  const accessByProduct = Object.fromEntries(detail.access.map(a => [a.product, a]));
  const c = detail.customer;

  return (
    <div>
      <button onClick={onBack} style={{
        background: "transparent", border: `1px solid ${COLORS.B3}`,
        borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
        fontSize: 12, cursor: "pointer", fontFamily: FONT, marginBottom: 18,
      }}>← All customers</button>

      {/* Header */}
      <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, padding: 24, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>{c.name}</h2>
            <div style={{ marginTop: 8, color: COLORS.T2, fontSize: 13 }}>
              status: <strong>{c.status}</strong> · plan: <strong>{c.plan}</strong>
              {c.trial_active && c.trial_expires_at && <> · trial ends <strong>{new Date(c.trial_expires_at).toLocaleDateString()}</strong></>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {c.is_test && <Pill color="#ffc">TEST</Pill>}
            {c.demo_mode && <Pill color="#ffc">DEMO</Pill>}
            {c.trial_active && <Pill color={COLORS.GREEN}>TRIAL</Pill>}
          </div>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* GHL credentials — editable */}
      <GhlCredentialsCard customer={c} onChanged={load} />

      {/* Billing + Wallet + Usage (Phase B3 + B2 + C1) */}
      <BillingCard detail={detail} onChanged={load} />

      {/* Module access */}
      <Section title="Module Access">
        {(["acq_coach", "lead_intel"] as Product[]).map(p => {
          const a = accessByProduct[p];
          const enabled = !!a?.enabled;
          const onApp = p === "acq_coach" ? c.acq_account_id : c.leadintel_tenant_id;
          return (
            <div key={p} style={{
              display: "grid", gridTemplateColumns: "160px 1fr 120px",
              padding: "16px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center", gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p === "acq_coach" ? "ACQ Coach" : "Lead Intel"}</div>
                <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>
                  {onApp ? "linked" : "no account on this app"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.T3 }}>
                {a?.valid_until && <>Expires: {new Date(a.valid_until).toLocaleString()}<br/></>}
                {a?.notes && <>Notes: {a.notes}</>}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Toggle
                  value={enabled}
                  onChange={() => toggle(p, enabled)}
                  label={busy === p ? "saving…" : enabled ? "enabled" : "disabled"}
                />
              </div>
            </div>
          );
        })}
      </Section>

      {/* Users */}
      {detail.users.length > 0 && (
        <Section title={`Users (${detail.users.length})`}>
          {detail.users.map((u, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 120px 100px",
              padding: "10px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center",
            }}>
              <div style={{ fontSize: 13 }}>{u.email}</div>
              <Pill>{u.product === "acq_coach" ? "ACQ" : "Lead Intel"}</Pill>
              <span style={{ fontSize: 12, color: COLORS.T2 }}>{u.role}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Recent activity */}
      <Section title="Recent Activity">
        {detail.recent_activity.length === 0
          ? <div style={{ padding: 20, color: COLORS.T3, fontSize: 13 }}>No activity yet.</div>
          : detail.recent_activity.map(e => (
            <div key={e.id} style={{ padding: "10px 20px", borderTop: `1px solid ${COLORS.B2}`, fontSize: 12 }}>
              <span style={{ color: COLORS.T3, fontFamily: "ui-monospace, monospace" }}>{new Date(e.created_at).toLocaleString()}</span>
              <span style={{ color: COLORS.TEXT, marginLeft: 12 }}>{e.action}</span>
            </div>
          ))
        }
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18,
    }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, fontSize: 14, fontWeight: 600 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", padding: "10px 20px", borderTop: `1px solid ${COLORS.B2}`, fontSize: 13 }}>
      <div style={{ color: COLORS.T3 }}>{label}</div>
      <div style={{ color: COLORS.TEXT, fontFamily: mono ? "ui-monospace, monospace" : undefined, fontSize: mono ? 12 : 13 }}>{value}</div>
    </div>
  );
}
