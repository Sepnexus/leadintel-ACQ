// Billing + wallet + usage card for the customer detail page.
// Reads from platform-db (unified) — replaces the read-only ledger view that
// would have required per-app queries.

import { useState } from "react";
import { COLORS } from "../theme";
import { adminApi, CustomerDetail } from "./adminApi";
import { Pill } from "./AdminLayout";
import { useToast } from "./Toast";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function BillingCard({ detail, onChanged }: {
  detail: CustomerDetail;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Comp/test credit — deliberately behind a small form so it can't be fired by
  // a stray click, and always carries a reason (it's audit-logged).
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmt, setCreditAmt] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const toast = useToast();

  async function refresh() {
    setBusy(true);
    const r = await adminApi.refreshWallet(detail.customer.id);
    setBusy(false);
    if (!r.ok) { toast.error(`Refresh failed: ${r.error}`); return; }
    toast.success(`Balance refreshed: ${money(r.data.balance_cents)} (ACQ ${money(r.data.components.acq)} + LI ${money(r.data.components.leadintel)})`);
    onChanged();
  }

  const creditCents = Math.round(parseFloat(creditAmt || "0") * 100);
  const creditOk = Number.isInteger(creditCents) && creditCents > 0 && creditCents <= 100_000;

  async function addCredit() {
    if (!creditOk) return;
    setBusy(true);
    const r = await adminApi.addCredit(detail.customer.id, creditCents, creditReason.trim() || undefined);
    setBusy(false);
    if (!r.ok) { toast.error(`Credit failed: ${r.error}`); return; }
    toast.success(r.data.note);
    setCreditOpen(false); setCreditAmt(""); setCreditReason("");
    onChanged();
  }

  const w = detail.wallet;
  const b = detail.billing;
  const acqUsage = detail.usage_30d.find(u => u.product === "acq_coach");
  const liUsage  = detail.usage_30d.find(u => u.product === "lead_intel");

  return (
    <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Billing & Wallet</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setCreditOpen(v => !v)} disabled={busy}
            style={{
              background: "transparent", border: `1px solid ${COLORS.GREEN}`,
              color: COLORS.GREEN, borderRadius: 6, padding: "5px 12px",
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
              opacity: busy ? 0.5 : 1,
            }}
          >{creditOpen ? "Cancel" : "+ Add credit"}</button>
          <button
            onClick={refresh} disabled={busy}
            style={{
              background: "transparent", border: `1px solid ${COLORS.B3}`,
              color: COLORS.T2, borderRadius: 6, padding: "5px 12px",
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
              opacity: busy ? 0.5 : 1,
            }}
          >{busy ? "Refreshing…" : "↻ Refresh balance"}</button>
        </div>
      </div>

      {/* Comp/test credit — no Stripe charge, audit-logged with the reason. */}
      {creditOpen && (
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`,
          background: "rgba(78,125,61,0.06)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: COLORS.T3 }}>$</span>
          <input
            value={creditAmt} onChange={e => setCreditAmt(e.target.value)}
            placeholder="25.00" inputMode="decimal"
            style={{
              width: 90, padding: "6px 8px", background: COLORS.BG,
              border: `1px solid ${creditAmt && !creditOk ? "#c0392b" : COLORS.B3}`,
              borderRadius: 6, color: COLORS.TEXT, fontSize: 12, fontFamily: FONT,
            }} />
          <input
            value={creditReason} onChange={e => setCreditReason(e.target.value)}
            placeholder="Reason (e.g. onboarding test credit)"
            style={{
              flex: 1, minWidth: 200, padding: "6px 8px", background: COLORS.BG,
              border: `1px solid ${COLORS.B3}`, borderRadius: 6,
              color: COLORS.TEXT, fontSize: 12, fontFamily: FONT,
            }} />
          <button
            onClick={addCredit} disabled={!creditOk || busy}
            style={{
              background: creditOk && !busy ? COLORS.GREEN : COLORS.B2, border: "none", borderRadius: 6,
              padding: "6px 14px", color: creditOk && !busy ? "#fff" : COLORS.T3,
              fontSize: 12, fontWeight: 600, cursor: creditOk && !busy ? "pointer" : "not-allowed", fontFamily: FONT,
            }}
          >{busy ? "Adding…" : "Add credit"}</button>
          <div style={{ width: "100%", fontSize: 11, color: COLORS.T3 }}>
            No card is charged. Goes through the same ledger as a real top-up and is recorded in the audit log. Max $1,000.
          </div>
        </div>
      )}

      {/* Balance & usage */}
      <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${COLORS.B2}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, alignItems: "end" }}>
          <Stat label="Platform Balance" value={money(w?.balance_cents ?? null)} big />
          <Stat label="ACQ usage (30d)" value={money(acqUsage?.billed ?? null)} sub={acqUsage ? `${acqUsage.cnt} calls` : "—"} />
          <Stat label="Lead Intel usage (30d)" value={money(liUsage?.billed ?? null)} sub={liUsage ? `${liUsage.cnt} calls` : "—"} />
        </div>
        {w?.refreshed_at && (
          <div style={{ marginTop: 12, color: COLORS.T3, fontSize: 11 }}>
            Snapshot taken {fmtTime(w.refreshed_at)} — click refresh to recompute from both apps' live wallets.
          </div>
        )}
      </div>

      {/* Stripe / saved card */}
      <Section title="Payment Method (unified Stripe customer)">
        <Row label="Stripe customer">
          {b?.stripe_customer_id
            ? <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: COLORS.TEXT }}>{b.stripe_customer_id}</code>
            : <span style={{ color: COLORS.T3 }}>(not linked yet — created on first top-up)</span>}
        </Row>
        <Row label="Saved card">
          {b?.card_brand
            ? <>
                <span style={{ textTransform: "capitalize", color: COLORS.TEXT }}>{b.card_brand}</span>
                <code style={{ color: COLORS.T2, marginLeft: 8 }}>•••• {b.card_last4}</code>
                {b.card_exp_month != null && b.card_exp_year != null && (
                  <span style={{ color: COLORS.T3, marginLeft: 12, fontSize: 12 }}>
                    exp {String(b.card_exp_month).padStart(2, "0")}/{String(b.card_exp_year).slice(-2)}
                  </span>
                )}
              </>
            : <span style={{ color: COLORS.T3 }}>(no card on file)</span>}
        </Row>
        <Row label="Auto-recharge">
          {b
            ? <>
                {b.auto_recharge_enabled
                  ? <Pill color={COLORS.GREEN}>enabled</Pill>
                  : <Pill color={COLORS.T2}>disabled</Pill>}
                <span style={{ color: COLORS.T3, fontSize: 12, marginLeft: 12 }}>
                  When balance &lt; {money(b.threshold_cents)}, top up {money(b.topup_amount_cents)}
                </span>
              </>
            : <span style={{ color: COLORS.T3 }}>—</span>}
        </Row>
      </Section>

      {/* Recent transactions */}
      <Section title={`Recent Transactions (${detail.recent_transactions.length})`} last>
        {detail.recent_transactions.length === 0 ? (
          <div style={{ padding: 20, color: COLORS.T3, fontSize: 13 }}>No transactions yet.</div>
        ) : detail.recent_transactions.map(t => (
          <div key={t.id} style={{
            display: "grid", gridTemplateColumns: "150px 80px 90px 100px 1fr",
            padding: "10px 20px", borderTop: `1px solid ${COLORS.B2}`,
            alignItems: "center", gap: 10, fontSize: 12,
          }}>
            <span style={{ color: COLORS.T3, fontFamily: "ui-monospace, monospace" }}>{fmtTime(t.created_at)}</span>
            <Pill color={t.product === "acq_coach" ? "#7eb56a" : "#5fb1c9"}>{t.product === "acq_coach" ? "ACQ" : "LI"}</Pill>
            <span style={{
              color: t.type === "credit" ? COLORS.GREEN : t.type === "debit" ? "#ff7a7a" : COLORS.T2,
              fontWeight: 600,
            }}>{t.type === "credit" ? "+" : "−"}{money(Math.abs(t.amount_cents))}</span>
            <span style={{ color: COLORS.T3, fontFamily: "ui-monospace, monospace" }}>
              bal {money(t.balance_after_cents)}
            </span>
            <span style={{ color: COLORS.T2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.reason}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: COLORS.T3, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: big ? 28 : 18, fontWeight: 700, color: COLORS.TEXT, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ borderBottom: last ? "none" : `1px solid ${COLORS.B2}` }}>
      <div style={{ padding: "12px 20px", fontSize: 12, color: COLORS.T3, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "160px 1fr",
      padding: "10px 20px", borderTop: `1px solid ${COLORS.B2}`,
      alignItems: "center", gap: 16, fontSize: 13,
    }}>
      <div style={{ color: COLORS.T3 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
