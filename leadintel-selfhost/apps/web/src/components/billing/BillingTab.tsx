import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { COLORS } from "@/utils/leadUtils";
import { useWalletBalance, formatUsd } from "@/hooks/useWalletBalance";
import { useUsageHistory } from "@/hooks/useUsageHistory";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmbeddedTopupCheckout } from "@/components/billing/EmbeddedTopupCheckout";

interface BillingTabProps {
  tenantId: string | null;
  /** Bumping this value forces wallet/billing data to re-fetch (e.g. after a mode flip). */
  refreshKey?: number;
}

/**
 * Tenant-user Billing view. Read-only.
 * - Wallet balance + billing mode (live via Realtime)
 * - Last 30d usage events
 * - Last 50 wallet transactions
 * Stripe top-up / auto-recharge controls arrive in Phase 7b.
 */
export function BillingTab({ tenantId, refreshKey = 0 }: BillingTabProps) {
  const { balanceCents, loading, error, refetch, trialActive, trialExpiresAt } = useWalletBalance(tenantId);
  const usage = useUsageHistory(tenantId);
  const [topupAmount, setTopupAmount] = useState<number>(2500); // $25 default
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Re-pull wallet + billing mode whenever the parent signals a refresh
  // (e.g. after a billing-mode flip in the super-admin tab).
  useEffect(() => {
    if (refreshKey > 0) refetch();
  }, [refreshKey, refetch]);

  // Toast on return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topup");
    if (t === "success") {
      toast.success("Top-up successful — balance will update shortly.");
      refetch();
    } else if (t === "cancel") {
      toast.info("Top-up canceled.");
    }
    if (t) {
      params.delete("topup");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, [refetch]);

  function startTopup() {
    if (!tenantId) return;
    if (topupAmount < 500) {
      toast.error("Minimum top-up is $5.");
      return;
    }
    setCheckoutOpen(true);
  }

  if (!tenantId) {
    return (
      <div style={{ padding: 16, color: COLORS.T3, fontSize: 13, background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10 }}>
        Select a tenant in the header to view billing.
      </div>
    );
  }

  const totalCharged30d = usage.events.reduce((sum, e) => sum + (e.charged_cents || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>Billing</div>
          <div style={{ fontSize: 12, color: COLORS.T3 }}>Wallet balance, AI usage, and transaction history.</div>
        </div>
        <Link
          to="/billing"
          style={{
            background: COLORS.GRN, border: "none", borderRadius: 8,
            padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >Open full Billing →</Link>
      </div>

      {error && (
        <div style={{ marginBottom: 16, fontSize: 12, color: COLORS.RED, background: COLORS.RED + "10", border: "1px solid " + COLORS.RED + "30", borderRadius: 8, padding: "8px 12px" }}>
          {error}
        </div>
      )}

      {trialActive && trialExpiresAt && (
        <div style={{ marginBottom: 16, fontSize: 12, color: COLORS.GRN, background: COLORS.GRN + "10", border: "1px solid " + COLORS.GRN + "40", borderRadius: 8, padding: "10px 14px" }}>
          <strong>Trial active</strong> — {daysRemaining(trialExpiresAt)} day(s) remaining (until {fmtDate(trialExpiresAt)}). All AI features work without balance.
        </div>
      )}

      {/* Balance + mode */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Stat label="Wallet Balance" value={loading ? "…" : formatUsd(balanceCents)} accent={COLORS.GRN} />
        <Stat label="Spent (last 30d)" value={formatUsd(totalCharged30d)} />
      </div>

      {/* Top-up */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.TEXT, marginBottom: 8 }}>Top up wallet</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[2500, 5000, 10000, 25000].map((amt) => (
            <button
              key={amt}
              onClick={() => setTopupAmount(amt)}
              style={{
                background: topupAmount === amt ? COLORS.GRN + "20" : COLORS.S2,
                border: "1px solid " + (topupAmount === amt ? COLORS.GRN : COLORS.B2),
                borderRadius: 8, padding: "6px 12px",
                color: topupAmount === amt ? COLORS.GRN : COLORS.T2,
                fontSize: 12, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              {formatUsd(amt)}
            </button>
          ))}
          <button
            onClick={startTopup}
            style={{
              background: COLORS.GRN, border: "1px solid " + COLORS.GRN,
              borderRadius: 8, padding: "8px 16px", color: "#000",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {`Add ${formatUsd(topupAmount)}`}
          </button>
        </div>
        <div style={{ fontSize: 10, color: COLORS.T3, marginTop: 6 }}>
          Test mode — use Stripe test card 4242 4242 4242 4242.
        </div>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-white">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Add {formatUsd(topupAmount)} to wallet</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {checkoutOpen && <EmbeddedTopupCheckout amountCents={topupAmount} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Usage events */}
      <Section title={`AI usage (last 30 days, ${usage.events.length})`}>
        {usage.loading ? (
          <Empty msg="Loading usage…" />
        ) : usage.events.length === 0 ? (
          <Empty msg="No AI usage in the last 30 days." />
        ) : (
          <ScrollTable>
            <thead>
              <tr>
                <Th>When</Th><Th>Operation</Th>
                <Th>Hint</Th>
                <Th align="right">Charged</Th>
              </tr>
            </thead>
            <tbody>
              {usage.events.slice(0, 100).map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDate(e.created_at)}</Td>
                  <Td>{e.operation}</Td>
                  <Td>{(e.metadata as { caller_hint?: string })?.caller_hint || "—"}</Td>
                  <Td align="right" mono>{formatUsd(e.charged_cents)}</Td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Section>

      {/* Transactions */}
      <Section title={`Wallet transactions (last ${usage.transactions.length})`}>
        {usage.loading ? (
          <Empty msg="Loading transactions…" />
        ) : usage.transactions.length === 0 ? (
          <Empty msg="No wallet transactions yet." />
        ) : (
          <ScrollTable>
            <thead>
              <tr>
                <Th>When</Th><Th>Type</Th><Th>Description</Th><Th align="right">Amount</Th><Th align="right">Balance after</Th>
              </tr>
            </thead>
            <tbody>
              {usage.transactions.map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDate(t.created_at)}</Td>
                  <Td><Pill type={t.type} /></Td>
                  <Td>{t.description}</Td>
                  <Td align="right" mono color={t.type === "debit" ? COLORS.RED : COLORS.GRN}>
                    {t.type === "debit" ? "−" : "+"}{formatUsd(t.amount_cents)}
                  </Td>
                  <Td align="right" mono>{formatUsd(t.balance_after_cents)}</Td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Section>
    </div>
  );
}

function fmtDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function daysRemaining(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? COLORS.TEXT, fontFamily: "'League Spartan', sans-serif" }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.T2, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      <div style={{ background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 10, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ padding: 16, fontSize: 12, color: COLORS.T3 }}>{msg}</div>;
}

function ScrollTable({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxHeight: 360, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>{children}</table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ textAlign: align ?? "left", padding: "10px 12px", color: COLORS.T3, fontWeight: 600, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid " + COLORS.B1, background: COLORS.S3, position: "sticky", top: 0 }}>{children}</th>;
}

function Td({ children, align, mono, color }: { children: React.ReactNode; align?: "left" | "right"; mono?: boolean; color?: string }) {
  return (
    <td style={{
      textAlign: align ?? "left",
      padding: "9px 12px",
      color: color ?? COLORS.TEXT,
      borderBottom: "1px solid " + COLORS.B1,
      fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
      whiteSpace: "nowrap",
    }}>{children}</td>
  );
}

function Pill({ type }: { type: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    debit: { bg: COLORS.RED + "20", fg: COLORS.RED },
    credit: { bg: COLORS.GRN + "20", fg: COLORS.GRN },
    refund: { bg: COLORS.BLU + "20", fg: COLORS.BLU },
    adjustment: { bg: COLORS.AMB + "20", fg: COLORS.AMB },
  };
  const c = palette[type] ?? { bg: COLORS.S3, fg: COLORS.T2 };
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: c.bg, color: c.fg, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{type}</span>;
}