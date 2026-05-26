import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { COLORS } from "@/utils/leadUtils";
import { AdminLayout } from "./AdminLayout";
import { formatUsd } from "@/hooks/useWalletBalance";

interface Row {
  tenant_id: string;
  tenant_name: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  auto_recharge_enabled: boolean;
  connected_at: string;
  balance_cents: number;
  total_topup_cents: number;
  total_charged_cents: number;
  charged_30d_cents: number;
}

export default function AdminBillingCustomersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const { data: bs, error: bsErr } = await supabase
          .from("billing_settings")
          .select("tenant_id, card_brand, card_last4, card_exp_month, card_exp_year, auto_recharge_enabled, updated_at")
          .not("card_last4", "is", null);
        if (bsErr) throw bsErr;

        const ids = (bs ?? []).map((b: any) => b.tenant_id);
        if (ids.length === 0) {
          if (!cancel) { setRows([]); setLoading(false); }
          return;
        }

        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [txRes, useAllRes, use30dRes, walletRes, tenantsRes] = await Promise.all([
          supabase.from("wallet_transactions").select("tenant_id, amount_cents, type, metadata").in("tenant_id", ids).eq("type", "credit"),
          supabase.from("usage_events").select("tenant_id, charged_cents").in("tenant_id", ids),
          supabase.from("usage_events").select("tenant_id, charged_cents").in("tenant_id", ids).gte("created_at", since30d),
          supabase.from("wallets").select("tenant_id, balance_cents").in("tenant_id", ids),
          supabase.from("tenants").select("id, name").in("id", ids),
        ]);
        const nameMap = new Map<string, string>();
        for (const t of tenantsRes.data ?? []) nameMap.set(t.id as string, (t as any).name ?? "—");

        const topupSum = new Map<string, number>();
        for (const t of txRes.data ?? []) {
          const src = (t as any).metadata?.source;
          if (src !== "stripe_checkout" && src !== "auto_recharge") continue;
          topupSum.set(t.tenant_id, (topupSum.get(t.tenant_id) ?? 0) + (t.amount_cents ?? 0));
        }
        const chargedAll = new Map<string, number>();
        for (const u of useAllRes.data ?? []) chargedAll.set(u.tenant_id, (chargedAll.get(u.tenant_id) ?? 0) + (u.charged_cents ?? 0));
        const charged30d = new Map<string, number>();
        for (const u of use30dRes.data ?? []) charged30d.set(u.tenant_id, (charged30d.get(u.tenant_id) ?? 0) + (u.charged_cents ?? 0));
        const balances = new Map<string, number>();
        for (const w of walletRes.data ?? []) balances.set(w.tenant_id, w.balance_cents ?? 0);

        const out: Row[] = (bs ?? []).map((b: any) => ({
          tenant_id: b.tenant_id,
          tenant_name: nameMap.get(b.tenant_id) ?? "—",
          card_brand: b.card_brand,
          card_last4: b.card_last4,
          card_exp_month: b.card_exp_month,
          card_exp_year: b.card_exp_year,
          auto_recharge_enabled: b.auto_recharge_enabled,
          connected_at: b.updated_at,
          balance_cents: balances.get(b.tenant_id) ?? 0,
          total_topup_cents: topupSum.get(b.tenant_id) ?? 0,
          total_charged_cents: chargedAll.get(b.tenant_id) ?? 0,
          charged_30d_cents: charged30d.get(b.tenant_id) ?? 0,
        }));
        out.sort((a, b) => b.total_charged_cents - a.total_charged_cents);
        if (!cancel) setRows(out);
      } catch (e) {
        if (!cancel) {
          const msg = e instanceof Error ? e.message : (typeof e === "object" ? JSON.stringify(e) : String(e));
          console.error("AdminBillingCustomersPage load error:", e);
          setError(msg);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const totals = rows.reduce(
    (a, r) => ({
      topup: a.topup + r.total_topup_cents,
      charged: a.charged + r.total_charged_cents,
      charged30: a.charged30 + r.charged_30d_cents,
      balance: a.balance + r.balance_cents,
    }),
    { topup: 0, charged: 0, charged30: 0, balance: 0 },
  );

  return (
    <AdminLayout>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontFamily: "'League Spartan', sans-serif", fontSize: 22, color: COLORS.TEXT }}>
          Billing customers
        </h2>
        <div style={{ fontSize: 12, color: COLORS.T3, marginTop: 4 }}>
          Tenants with a saved payment card, total top-ups, and AI charges.
        </div>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <Stat label="Customers with card" value={String(rows.length)} />
          <Stat label="Total topped up" value={formatUsd(totals.topup)} accent={COLORS.GRN} />
          <Stat label="Total AI charged" value={formatUsd(totals.charged)} />
          <Stat label="Charged (30d)" value={formatUsd(totals.charged30)} />
          <Stat label="Current wallet balance" value={formatUsd(totals.balance)} />
        </div>
      )}

      {loading && <div style={{ color: COLORS.T2, fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ color: COLORS.RED, fontSize: 13 }}>{error}</div>}
      {!loading && !error && (
        <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: COLORS.S2, color: COLORS.T2, textAlign: "left" }}>
                {["Tenant", "Card", "Expires", "Auto-recharge", "Connected", "Balance", "Topped up", "Charged 30d", "Charged total", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenant_id} style={{ borderTop: "1px solid " + COLORS.B1, color: COLORS.TEXT }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.tenant_name}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>
                    {(r.card_brand ?? "card").toUpperCase()} •••• {r.card_last4}
                  </td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>
                    {r.card_exp_month && r.card_exp_year ? `${String(r.card_exp_month).padStart(2, "0")}/${r.card_exp_year}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: r.auto_recharge_enabled ? COLORS.GRN : COLORS.T3 }}>
                    {r.auto_recharge_enabled ? "On" : "Off"}
                  </td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>
                    {new Date(r.connected_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "10px 12px", color: COLORS.GRN, fontFamily: "'JetBrains Mono', monospace" }}>{formatUsd(r.balance_cents)}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace" }}>{formatUsd(r.total_topup_cents)}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace" }}>{formatUsd(r.charged_30d_cents)}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", color: COLORS.RED }}>{formatUsd(r.total_charged_cents)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <Link
                      to={`/admin/tenants/${r.tenant_id}/transactions`}
                      style={{ color: COLORS.GRN, textDecoration: "none", border: "1px solid " + COLORS.GRN + "40", padding: "4px 10px", borderRadius: 6, fontSize: 11 }}
                    >Transactions →</Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>No tenants have connected a card yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? COLORS.TEXT, fontFamily: "'League Spartan', sans-serif" }}>{value}</div>
    </div>
  );
}