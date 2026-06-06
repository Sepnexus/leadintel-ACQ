// Account → Billing — unified wallet + transactions + 30d usage for this customer.
// Replaces ACQ Billing page + LI billing page.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { accountApi, BillingData, MyCustomer } from "./accountApi";
import { Pill, ErrorBanner } from "../admin/AdminLayout";
import { useToast } from "../admin/Toast";

export function BillingTab({ cid, customer }: { cid: string; customer: MyCustomer }) {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topup, setTopup] = useState<{ amount: number; busy: boolean }>({ amount: 5000, busy: false });
  const [portalBusy, setPortalBusy] = useState(false);
  const toast = useToast();
  async function load() {
    const r = await accountApi.billing(cid);
    if (r.ok) setData(r.data); else setError(r.error);
  }
  useEffect(() => { load(); }, [cid]);

  // If we returned from a successful Stripe checkout, give the webhook a sec
  // and reload the billing data so the new balance shows.
  useEffect(() => {
    if (window.location.hash.includes("topup=success")) {
      toast.success("Top-up succeeded — balance updates within ~10s.");
      setTimeout(load, 4_000);
    } else if (window.location.hash.includes("topup=canceled")) {
      toast.info("Top-up canceled.");
    }
  }, []);

  async function startTopup() {
    setTopup(t => ({ ...t, busy: true }));
    const r = await accountApi.topup(cid, topup.amount);
    setTopup(t => ({ ...t, busy: false }));
    if (!r.ok) { toast.error(friendlyBillingError(r.error)); return; }
    window.location.href = r.data.checkout_url;
  }

  async function openPortal() {
    setPortalBusy(true);
    const r = await accountApi.billingPortal(cid);
    setPortalBusy(false);
    if (!r.ok) { toast.error(friendlyBillingError(r.error)); return; }
    window.location.href = r.data.portal_url;
  }

  // Map raw backend errors to messages a customer admin can act on.
  function friendlyBillingError(err: string): string {
    if (/stripe_misconfigured/i.test(err)) {
      return "Payments aren't set up yet on this platform. Ask your administrator to configure the Stripe key.";
    }
    if (/stripe_customer_failed/i.test(err)) {
      return "We couldn't create your Stripe profile. Try again in a moment, or contact support.";
    }
    if (/stripe_checkout_failed|stripe_portal_failed/i.test(err)) {
      return "Stripe couldn't open the checkout window right now. Try again, or contact support if it keeps failing.";
    }
    return err;
  }

  const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: 4, fontSize: 22 }}>Billing & Wallet</h2>
      <div style={{ color: COLORS.T3, fontSize: 12, marginBottom: 18 }}>
        One wallet, one card, used across <strong style={{ color: COLORS.TEXT }}>ACQ Coach</strong> + <strong style={{ color: COLORS.TEXT }}>Lead Intel</strong> for {customer.name}.
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!data ? <div style={{ padding: 24, color: COLORS.T3, textAlign: "center" }}>Loading…</div> : (
        <>
          {/* Wallet + 30d usage */}
          <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, padding: 22, marginBottom: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.T3, letterSpacing: "0.12em", textTransform: "uppercase" }}>Platform Balance</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{dollars(data.wallet.balance_cents)}</div>
                <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 6 }}>
                  {data.wallet.refreshed_at ? `As of ${new Date(data.wallet.refreshed_at).toLocaleString()}` : "Not yet snapshotted"}
                </div>
              </div>
              {(["acq_coach", "lead_intel"] as const).map(p => {
                const u = data.usage_30d.find(x => x.product === p);
                return (
                  <div key={p}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.T3, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      {p === "acq_coach" ? "ACQ usage (30d)" : "Lead Intel usage (30d)"}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{u ? dollars(u.billed) : "—"}</div>
                    <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 6 }}>
                      {u ? `${u.cnt} call${u.cnt === 1 ? "" : "s"}` : "no activity"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top up wallet */}
          <div style={{
            background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, padding: 22, marginBottom: 18,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Top up wallet</div>
                <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>
                  Credits are deducted from your balance as AI features run.
                </div>
              </div>
              <button onClick={openPortal} disabled={portalBusy} style={{
                background: "transparent", border: `1px solid ${COLORS.B3}`, color: COLORS.T2,
                borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer",
              }}>{portalBusy ? "Opening…" : "Manage payment methods →"}</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {[2000, 5000, 10000, 20000].map(amt => (
                <button key={amt} onClick={() => setTopup({ amount: amt, busy: false })} style={{
                  background: topup.amount === amt ? COLORS.GREEN : COLORS.B2,
                  border: `1px solid ${topup.amount === amt ? COLORS.GREEN : COLORS.B3}`,
                  color: topup.amount === amt ? "#fff" : COLORS.T2,
                  borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                }}>{dollars(amt)}</button>
              ))}
              <input
                type="number" min={5} max={5000} value={topup.amount / 100}
                onChange={e => setTopup({ amount: Math.round(Number(e.target.value || "0") * 100), busy: false })}
                style={{
                  background: COLORS.B2, color: COLORS.TEXT,
                  border: `1px solid ${COLORS.B3}`, borderRadius: 6,
                  padding: "8px 10px", fontSize: 12, width: 80,
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.T3 }}>USD</span>
              <button onClick={startTopup} disabled={topup.busy || topup.amount < 500} style={{
                background: COLORS.GREEN, border: `1px solid ${COLORS.GREEN}`, color: "#fff",
                borderRadius: 6, padding: "8px 18px", fontSize: 12, fontWeight: 700,
                cursor: topup.busy ? "not-allowed" : "pointer", opacity: topup.busy ? 0.5 : 1, marginLeft: 6,
              }}>{topup.busy ? "Redirecting…" : `Top up ${dollars(topup.amount)}`}</button>
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.T3, marginTop: 10 }}>
              Hosted by Stripe. Card is saved for future top-ups + auto-recharge.
            </div>
          </div>

          {/* Payment method */}
          <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, fontSize: 14, fontWeight: 600 }}>
              Payment method
            </div>
            <Row label="Stripe customer" value={data.billing?.stripe_customer_id || "(not linked yet — created on first top-up)"} />
            <Row label="Saved card"
                 value={data.billing?.card_last4
                   ? `${(data.billing.card_brand || "card").toUpperCase()} ending ${data.billing.card_last4} · exp ${data.billing.card_exp_month}/${data.billing.card_exp_year}`
                   : "(no card on file)"} />
            <AutoRechargeRow cid={cid} data={data} onSaved={load} dollars={dollars} />
          </div>

          {/* Recent transactions */}
          <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, fontSize: 14, fontWeight: 600 }}>
              Recent transactions ({data.transactions.length})
            </div>
            {data.transactions.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>No transactions yet.</div>
            ) : data.transactions.slice(0, 20).map((t, i) => (
              <div key={t.id} style={{
                display: "grid", gridTemplateColumns: "200px 90px 110px 110px 1fr",
                padding: "10px 20px", borderTop: i === 0 ? "none" : `1px solid ${COLORS.B2}`,
                fontSize: 12, color: COLORS.T2, alignItems: "center",
              }}>
                <div style={{ fontFamily: "ui-monospace, monospace", color: COLORS.T3 }}>{new Date(t.created_at).toLocaleString()}</div>
                <Pill color={t.product === "acq_coach" ? "#7eb56a" : "#5fb1c9"}>{t.product === "acq_coach" ? "ACQ" : "LI"}</Pill>
                <div style={{ color: t.amount_cents < 0 ? "#ff7a7a" : COLORS.GREEN }}>
                  {t.amount_cents < 0 ? "-" : "+"}{dollars(Math.abs(t.amount_cents))}
                </div>
                <div style={{ color: COLORS.T3 }}>bal {dollars(t.balance_after_cents)}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.reason}>{t.reason}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AutoRechargeRow({ cid, data, onSaved, dollars }: {
  cid: string; data: BillingData; onSaved: () => void; dollars: (c: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(!!data.billing?.auto_recharge_enabled);
  const [threshold, setThreshold] = useState((data.billing?.threshold_cents ?? 500) / 100);
  const [topup, setTopup]         = useState((data.billing?.topup_amount_cents ?? 2000) / 100);
  const [busy, setBusy]           = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    const r = await accountApi.setAutoRecharge(cid, {
      enabled,
      threshold_cents:   Math.round(threshold * 100),
      topup_amount_cents: Math.round(topup * 100),
    });
    setBusy(false);
    if (!r.ok) { toast.error(`Failed: ${r.error}`); return; }
    toast.success(`Auto-recharge ${enabled ? "enabled" : "disabled"}.`);
    setEditing(false);
    onSaved();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "12px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "start", gap: 12 }}>
      <div style={{ fontSize: 11, color: COLORS.T3, textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 4 }}>Auto-recharge</div>
      <div style={{ fontSize: 13 }}>
        {!editing ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {data.billing?.auto_recharge_enabled
                ? <Pill color={COLORS.GREEN}>enabled</Pill>
                : <Pill color="#888">disabled</Pill>}
              <button onClick={() => setEditing(true)} style={{
                background: "transparent", border: `1px solid ${COLORS.B3}`, color: COLORS.T2,
                borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer",
              }}>{data.billing?.auto_recharge_enabled ? "Edit" : "Set up"}</button>
            </div>
            <div style={{ fontSize: 11, color: COLORS.T3 }}>
              {data.billing?.auto_recharge_enabled
                ? `When balance < ${dollars(data.billing.threshold_cents ?? 0)}, top up ${dollars(data.billing.topup_amount_cents ?? 0)}`
                : "Set up auto-recharge to avoid usage interruptions"}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              Enable auto-recharge
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: COLORS.T2 }}>
              When balance drops below $
              <input type="number" min={1} value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={inputSmall} />
              , charge $
              <input type="number" min={5} value={topup} onChange={e => setTopup(Number(e.target.value))} style={inputSmall} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={save} disabled={busy} style={{
                background: COLORS.GREEN, border: "none", color: "#fff",
                borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
              }}>{busy ? "Saving…" : "Save"}</button>
              <button onClick={() => setEditing(false)} disabled={busy} style={{
                background: "transparent", border: `1px solid ${COLORS.B3}`, color: COLORS.T2,
                borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer",
              }}>Cancel</button>
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.T3 }}>
              Requires a saved card. Click "Manage payment methods" above first if you don't have one yet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputSmall: React.CSSProperties = {
  background: COLORS.B2, color: COLORS.TEXT,
  border: `1px solid ${COLORS.B3}`, borderRadius: 4,
  padding: "4px 8px", fontSize: 12, width: 70,
};

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "12px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 11, color: COLORS.T3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 13 }}>
        {value}
        {hint && <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  );
}
