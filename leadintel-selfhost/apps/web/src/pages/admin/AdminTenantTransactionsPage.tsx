import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { COLORS } from "@/utils/leadUtils";
import { AdminLayout } from "./AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatUsd } from "@/hooks/useWalletBalance";

interface UsageRow {
  id: string;
  created_at: string;
  operation: string;
  provider: string;
  model: string | null;
  cost_cents: number;
  charged_cents: number;
  billing_mode: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
}

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
] as const;

export default function AdminTenantTransactionsPage() {
  const { id } = useParams<{ id: string }>();
  const [tenantName, setTenantName] = useState<string>("");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<string>("30");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("tenants").select("name").eq("id", id).maybeSingle();
      setTenantName((data?.name as string) ?? "Tenant");
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      let q = supabase
        .from("usage_events")
        .select("id, created_at, operation, provider, model, cost_cents, charged_cents, billing_mode, user_id, metadata")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (range !== "all") {
        const since = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error: err } = await q;
      if (cancelled) return;
      setRows((data as UsageRow[] | null) ?? []);
      setError(err?.message ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, range]);

  const providers = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.provider));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (providerFilter !== "all" && r.provider !== providerFilter) return false;
      if (!s) return true;
      const hint = (r.metadata as { caller_hint?: string })?.caller_hint || "";
      return (
        r.operation.toLowerCase().includes(s) ||
        (r.model || "").toLowerCase().includes(s) ||
        hint.toLowerCase().includes(s)
      );
    });
  }, [rows, providerFilter, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.cost += r.cost_cents;
        acc.charged += r.charged_cents;
        return acc;
      },
      { cost: 0, charged: 0 },
    );
  }, [filtered]);

  const margin = totals.charged - totals.cost;

  function exportCsv() {
    const headers = ["created_at", "provider", "model", "operation", "caller_hint", "cost_cents", "charged_cents", "margin_cents", "billing_mode"];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      const hint = (r.metadata as { caller_hint?: string })?.caller_hint || "";
      lines.push([
        r.created_at, r.provider, r.model ?? "", r.operation,
        `"${hint.replace(/"/g, '""')}"`,
        r.cost_cents, r.charged_cents, r.charged_cents - r.cost_cents, r.billing_mode,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${tenantName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link to={`/admin/tenants/${id}`} style={{
          color: COLORS.T2, textDecoration: "none", fontSize: 12,
          padding: "5px 10px", border: "1px solid " + COLORS.B2, borderRadius: 8,
        }}>← {tenantName || "Tenant"}</Link>
        <h2 style={{ margin: 0, fontFamily: "'League Spartan', sans-serif", fontSize: 22, color: COLORS.TEXT }}>
          Transactions
        </h2>
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Events" value={String(filtered.length)} />
        <Stat label="Raw provider cost" value={formatUsd(totals.cost)} />
        <Stat label="Charged to tenant" value={formatUsd(totals.charged)} accent={COLORS.GRN} />
        <Stat label="Margin" value={formatUsd(margin)} accent={margin >= 0 ? COLORS.GRN : COLORS.RED} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={chipStyle(range === r.key)}>{r.label}</button>
          ))}
        </div>
        <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} style={selectStyle}>
          <option value="all">All providers</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search operation, model, hint…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...selectStyle, flex: 1, minWidth: 200 }}
        />
        <button onClick={exportCsv} style={{
          background: COLORS.GRN, border: "none", borderRadius: 8, padding: "8px 14px",
          color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Export CSV</button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, fontSize: 12, color: COLORS.RED, background: COLORS.RED + "10", border: "1px solid " + COLORS.RED + "30", borderRadius: 8, padding: "8px 12px" }}>
          {error}
        </div>
      )}

      <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 16, fontSize: 12, color: COLORS.T3 }}>Loading transactions…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: COLORS.T3 }}>No transactions match these filters.</div>
        ) : (
          <div style={{ maxHeight: "65vh", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Provider</Th>
                  <Th>Model</Th>
                  <Th>Operation</Th>
                  <Th>Hint</Th>
                  <Th align="right">Raw cost</Th>
                  <Th align="right">Charged</Th>
                  <Th align="right">Margin</Th>
                  <Th align="right">Multiplier</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const m = r.cost_cents > 0 ? (r.charged_cents / r.cost_cents) : 0;
                  const hint = (r.metadata as { caller_hint?: string })?.caller_hint || "—";
                  const diff = r.charged_cents - r.cost_cents;
                  return (
                    <tr key={r.id}>
                      <Td>{fmtDate(r.created_at)}</Td>
                      <Td>{r.provider}</Td>
                      <Td>{r.model || "—"}</Td>
                      <Td>{r.operation}</Td>
                      <Td>{hint}</Td>
                      <Td align="right" mono>{formatUsd(r.cost_cents)}</Td>
                      <Td align="right" mono color={COLORS.GRN}>{formatUsd(r.charged_cents)}</Td>
                      <Td align="right" mono color={diff >= 0 ? COLORS.GRN : COLORS.RED}>{formatUsd(diff)}</Td>
                      <Td align="right" mono>{m ? `${m.toFixed(2)}x` : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const selectStyle: React.CSSProperties = {
  background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8,
  color: COLORS.TEXT, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none",
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? COLORS.GRN + "20" : COLORS.S3,
    border: "1px solid " + (active ? COLORS.GRN + "60" : COLORS.B2),
    color: active ? COLORS.GRN : COLORS.T2,
    borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? COLORS.TEXT, fontFamily: "'League Spartan', sans-serif" }}>{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ textAlign: align ?? "left", padding: "10px 12px", color: COLORS.T3, fontWeight: 600, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid " + COLORS.B1, background: COLORS.S3, position: "sticky", top: 0 }}>{children}</th>;
}

function Td({ children, align, mono, color }: { children: React.ReactNode; align?: "left" | "right"; mono?: boolean; color?: string }) {
  return (
    <td style={{
      textAlign: align ?? "left", padding: "9px 12px",
      color: color ?? COLORS.TEXT,
      borderBottom: "1px solid " + COLORS.B1,
      fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
      whiteSpace: "nowrap",
    }}>{children}</td>
  );
}