import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import type { AdminTenantOverviewRow } from "@/hooks/useAdminTenantsOverview";
import { BillingTab } from "@/components/billing/BillingTab";
import { useWalletBalance, formatUsd } from "@/hooks/useWalletBalance";

/**
 * Super-admin Billing tab.
 * - Shows internal columns (raw cost, model)
 * - Lets admin manually credit the tenant wallet (audit-logged via admin_credit_wallet RPC)
 */
export function TenantBillingTab({ tenant }: { tenant: AdminTenantOverviewRow }) {
  const { balanceCents, refetch, trialActive, trialExpiresAt } = useWalletBalance(tenant.id);
  const [newBalance, setNewBalance] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [childRefreshKey, setChildRefreshKey] = useState(0);

  async function applySetBalance() {
    const dollars = Number(newBalance);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast.error("Enter a non-negative amount in dollars.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Reason is required (min 3 chars).");
      return;
    }
    setBusy(true);
    try {
      const cents = Math.round(dollars * 100);
      const { data, error } = await supabase.rpc("admin_set_wallet_balance", {
        p_tenant_id: tenant.id,
        p_new_balance_cents: cents,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      const resp = (data ?? {}) as { ok?: boolean };
      if (!resp.ok) throw new Error("Update failed");
      toast.success(`Wallet for ${tenant.name} set to ${formatUsd(cents)}.`);
      setNewBalance(""); setReason("");
      refetch();
      setChildRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTrial(enable: boolean) {
    setTrialBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_trial", {
        p_tenant_id: tenant.id,
        p_enabled: enable,
      });
      if (error) throw error;
      const resp = (data ?? {}) as { ok?: boolean };
      if (!resp.ok) throw new Error("Trial update failed");
      toast.success(enable ? "7-day trial enabled." : "Trial disabled.");
      refetch();
    } catch (e) {
      toast.error(`Trial update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTrialBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8,
    color: COLORS.TEXT, fontSize: 12, padding: "8px 10px",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  const trialDaysLeft = trialExpiresAt
    ? Math.max(0, Math.ceil((new Date(trialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link
          to={`/admin/tenants/${tenant.id}/transactions`}
          style={{
            display: "inline-block", background: COLORS.S2, border: "1px solid " + COLORS.B2,
            borderRadius: 8, padding: "8px 14px", color: COLORS.GRN, fontSize: 12,
            fontWeight: 600, textDecoration: "none",
          }}
        >
          View detailed transactions →
        </Link>
      </div>

      {/* Trial mode */}
      <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.T2, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 4 }}>
              Trial mode
            </div>
            <div style={{ fontSize: 12, color: COLORS.T3 }}>
              {trialActive
                ? <>Active — <strong style={{ color: COLORS.GRN }}>{trialDaysLeft} day(s) remaining</strong> (until {trialExpiresAt ? new Date(trialExpiresAt).toLocaleString() : "—"}). All AI works without balance.</>
                : <>Off — payment required. Enabling grants 7 days of unlimited AI without balance checks.</>}
            </div>
          </div>
          <button
            onClick={() => toggleTrial(!trialActive)}
            disabled={trialBusy}
            style={{
              background: trialActive ? "transparent" : COLORS.GRN,
              border: "1px solid " + COLORS.GRN,
              borderRadius: 8, padding: "8px 16px",
              color: trialActive ? COLORS.GRN : "#fff",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              cursor: trialBusy ? "default" : "pointer",
              opacity: trialBusy ? 0.5 : 1, whiteSpace: "nowrap",
            }}
          >
            {trialBusy ? "Working…" : trialActive ? "Disable trial" : "Enable 7-day trial"}
          </button>
        </div>
      </div>

      {/* Set wallet balance */}
      <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.T2, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 4 }}>
          Set wallet balance
        </div>
        <div style={{ fontSize: 11, color: COLORS.T3, marginBottom: 12 }}>
          Current balance: <strong style={{ color: COLORS.GRN }}>{formatUsd(balanceCents)}</strong>
          {" — "}enter the new balance in dollars (can be lower, higher, or zero).
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 10, alignItems: "start" }}>
          <input
            type="number" min="0" step="0.01"
            placeholder="$ new balance"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Reason (audit-logged) — e.g. Refund, correction, onboarding"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={applySetBalance}
            disabled={busy}
            style={{
              background: COLORS.GRN, border: "none", borderRadius: 8,
              padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 600,
              fontFamily: "inherit", cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1, whiteSpace: "nowrap",
            }}
          >
            {busy ? "Saving…" : "Set balance"}
          </button>
        </div>
      </div>

      {/* Reuse the tenant-user view for balance/usage/transactions, with internals visible */}
      <BillingTab tenantId={tenant.id} refreshKey={childRefreshKey} />
    </div>
  );
}
