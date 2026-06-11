import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UsageEventRow {
  id: string;
  created_at: string;
  operation: string;
  provider: string;
  model: string | null;
  cost_cents: number;
  charged_cents: number;
  billing_mode: string;
  metadata: Record<string, unknown>;
}

export interface WalletTransactionRow {
  id: string;
  created_at: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  metadata: Record<string, unknown>;
}

export interface UsageHistoryState {
  events: UsageEventRow[];
  transactions: WalletTransactionRow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Last 30 days of usage_events + last 50 wallet_transactions for one tenant.
 * RLS scopes the read; super_admin sees the selected tenant's data via tenant_id filter.
 */
export function useUsageHistory(tenantId: string | null): UsageHistoryState {
  const [events, setEvents] = useState<UsageEventRow[]>([]);
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(!!tenantId);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tenantId) {
      setEvents([]); setTransactions([]); setLoading(false); setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    (async () => {
      const [evRes, txRes] = await Promise.all([
        supabase
          .from("usage_events")
          .select("id, created_at, operation, provider, model, cost_cents, charged_cents, billing_mode, metadata")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
        // Unified ledger (both products) via RPC — the app-local
        // wallet_transactions only holds LI's own activity, so an ACQ-side
        // top-up or auto-recharge that moved the SHARED balance would be
        // invisible here. The RPC reads platform.wallet_transactions over fdw
        // and tags each row "ACQ — " / "LI — " in description.
        // deno-lint-ignore no-explicit-any — RPC added by migration, not yet in generated types.
        (supabase.rpc as any)("get_unified_wallet_transactions", {
          p_tenant_id: tenantId,
          p_limit: 50,
        }),
      ]);
      if (cancelled) return;
      const err = evRes.error?.message || txRes.error?.message || null;
      setEvents((evRes.data as UsageEventRow[] | null) ?? []);
      setTransactions((txRes.data as WalletTransactionRow[] | null) ?? []);
      setError(err);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, tick]);

  return { events, transactions, loading, error, refetch: () => setTick((t) => t + 1) };
}