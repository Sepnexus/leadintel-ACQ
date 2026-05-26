import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { AdminLayout } from "./AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatUsd } from "@/hooks/useWalletBalance";

type Row = {
  tenant_id: string;
  tenant_name: string;
  provider: string;
  model: string | null;
  calls: number;
  raw_cents: number;
  charged_cents: number;
  input_tokens: number;
  output_tokens: number;
  input_chars: number;
};

const RANGES = [
  { label: "Last 24h", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function AdminProviderCostsPage() {
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<"provider" | "tenant" | "model">("provider");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const [savingMult, setSavingMult] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_ai_markup_multiplier");
      const n = Number(data);
      if (Number.isFinite(n) && n > 0) setMultiplier(n);
    })();
  }, []);

  async function applyMultiplier(next: number) {
    setSavingMult(next);
    try {
      const { error } = await supabase
        .from("platform_settings")
        .update({ ai_markup_multiplier: next, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
      setMultiplier(next);
      toast.success(`Margin set to ${next}x. New AI calls will use this rate.`);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingMult(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    (async () => {
      const [evRes, tenantRes] = await Promise.all([
        supabase
          .from("usage_events")
          .select("tenant_id, provider, model, cost_cents, charged_cents, metadata")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10000),
        supabase.from("tenants").select("id, name"),
      ]);
      if (cancelled) return;
      if (evRes.error || tenantRes.error) {
        setErr(evRes.error?.message ?? tenantRes.error?.message ?? "Load failed");
        setLoading(false);
        return;
      }
      const tenantMap = new Map<string, string>();
      (tenantRes.data ?? []).forEach((t: any) => tenantMap.set(t.id, t.name));
      const agg = new Map<string, Row>();
      (evRes.data ?? []).forEach((e: any) => {
        const key = `${e.tenant_id}|${e.provider}|${e.model ?? ""}`;
        const md = (e.metadata ?? {}) as Record<string, any>;
        const cur = agg.get(key) ?? {
          tenant_id: e.tenant_id,
          tenant_name: tenantMap.get(e.tenant_id) ?? "—",
          provider: e.provider,
          model: e.model,
          calls: 0, raw_cents: 0, charged_cents: 0,
          input_tokens: 0, output_tokens: 0, input_chars: 0,
        };
        cur.calls += 1;
        cur.raw_cents += e.cost_cents ?? 0;
        cur.charged_cents += e.charged_cents ?? 0;
        cur.input_tokens += Number(md.input_tokens ?? 0);
        cur.output_tokens += Number(md.output_tokens ?? 0);
        cur.input_chars += Number(md.input_chars ?? 0);
        agg.set(key, cur);
      });
      setRows(Array.from(agg.values()));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const grouped = useMemo(() => {
    const m = new Map<string, Row & { children?: Row[] }>();
    rows.forEach((r) => {
      const key = groupBy === "tenant" ? r.tenant_name : groupBy === "model" ? `${r.provider} · ${r.model ?? "—"}` : r.provider;
      const cur = m.get(key) ?? { ...r, tenant_name: key, calls: 0, raw_cents: 0, charged_cents: 0, input_tokens: 0, output_tokens: 0, input_chars: 0, children: [] };
      cur.calls += r.calls;
      cur.raw_cents += r.raw_cents;
      cur.charged_cents += r.charged_cents;
      cur.input_tokens += r.input_tokens;
      cur.output_tokens += r.output_tokens;
      cur.input_chars += r.input_chars;
      cur.children!.push(r);
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.charged_cents - a.charged_cents);
  }, [rows, groupBy]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      raw: acc.raw + r.raw_cents,
      charged: acc.charged + r.charged_cents,
    }), { calls: 0, raw: 0, charged: 0 }
  ), [rows]);
  const margin = totals.charged - totals.raw;
  const marginPct = totals.charged > 0 ? (margin / totals.charged) * 100 : 0;

  const inputStyle: React.CSSProperties = {
    background: COLORS.S2, border: "1px solid " + COLORS.B2, color: COLORS.TEXT,
    padding: "6px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none",
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'League Spartan', sans-serif", color: COLORS.TEXT }}>Provider Costs</div>
        <div style={{ fontSize: 12, color: COLORS.T3, marginTop: 4 }}>
          Raw provider cost vs. tenant-charged amount across all AI calls. Lovable AI usage may currently be free during the promo period — those rows still show retail-equivalent estimates.
        </div>
      </div>

      {/* Margin multiplier */}
      <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.T2, letterSpacing: 0.7, textTransform: "uppercase" }}>
              Margin multiplier
            </div>
            <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 4 }}>
              Tenants are charged <strong style={{ color: COLORS.TEXT }}>raw cost × multiplier</strong>. Applies to all new AI calls.
              {multiplier != null && <> Current: <strong style={{ color: COLORS.GRN }}>{multiplier}x</strong></>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[1, 2, 3, 5, 7, 10].map((m) => {
              const active = multiplier === m;
              const saving = savingMult === m;
              return (
                <button
                  key={m}
                  onClick={() => applyMultiplier(m)}
                  disabled={savingMult !== null}
                  style={{
                    background: active ? COLORS.GRN : COLORS.S2,
                    border: "1px solid " + (active ? COLORS.GRN : COLORS.B2),
                    color: active ? "#fff" : COLORS.TEXT,
                    borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    fontFamily: "inherit", cursor: savingMult !== null ? "default" : "pointer",
                    opacity: savingMult !== null && !saving ? 0.5 : 1, minWidth: 48,
                  }}
                >
                  {saving ? "…" : `${m}x`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
          {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
        </select>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} style={inputStyle}>
          <option value="provider">Group by provider</option>
          <option value="tenant">Group by tenant</option>
          <option value="model">Group by model</option>
        </select>
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Stat label="AI Calls" value={totals.calls.toLocaleString()} />
        <Stat label="Our Cost (raw)" value={formatUsd(totals.raw)} accent={COLORS.RED} />
        <Stat label="Charged to Tenants" value={formatUsd(totals.charged)} accent={COLORS.GRN} />
        <Stat label="Margin" value={`${formatUsd(margin)} (${marginPct.toFixed(0)}%)`} />
      </div>

      {err && <div style={{ color: COLORS.RED, fontSize: 12, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ color: COLORS.T2, fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: COLORS.S2, color: COLORS.T2, textAlign: "left" }}>
                {[
                  groupBy === "tenant" ? "Tenant" : groupBy === "model" ? "Provider · Model" : "Provider",
                  "Calls", "Input tok", "Output tok", "Chars", "Raw cost", "Charged", "Margin"
                ].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g, i) => {
                const m = g.charged_cents - g.raw_cents;
                return (
                  <tr key={i} style={{ borderTop: "1px solid " + COLORS.B1 }}>
                    <td style={{ padding: "10px 12px", color: COLORS.TEXT }}>{g.tenant_name}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{g.calls.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.T3 }}>{g.input_tokens.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.T3 }}>{g.output_tokens.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.T3 }}>{g.input_chars > 0 ? g.input_chars.toLocaleString() : "—"}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.RED }}>{formatUsd(g.raw_cents)}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.GRN }}>{formatUsd(g.charged_cents)}</td>
                    <td style={{ padding: "10px 12px", color: COLORS.TEXT }}>{formatUsd(m)}</td>
                  </tr>
                );
              })}
              {grouped.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: COLORS.T3 }}>No usage in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: COLORS.T3, lineHeight: 1.6 }}>
        <div>• <b>Anthropic</b> & <b>Deepgram</b>: raw cost is computed from token / character counts × current published pricing — matches actual invoice.</div>
        <div>• <b>Lovable AI (Gemini)</b>: real spend is debited from Workspace → Cloud &amp; AI balance. The number above is a retail-equivalent estimate (currently $0 actual during the free credit period).</div>
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? COLORS.TEXT, fontFamily: "'League Spartan', sans-serif" }}>{value}</div>
    </div>
  );
}