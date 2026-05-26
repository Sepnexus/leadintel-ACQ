import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BillingMode = "closer_control" | "tenant";

export interface WalletBalanceState {
  balanceCents: number | null;
  billingMode: BillingMode | null;
  isEmpty: boolean;
  trialActive: boolean;
  trialExpiresAt: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Reads the wallet balance + tenant.billing_mode for a given tenant.
 * Subscribes to Supabase Realtime UPDATEs on wallets so the UI reflects
 * debits/credits as they happen. RLS enforces visibility — Realtime
 * payloads are filtered server-side per the same policies.
 *
 * Pass `null` tenantId to disable (returns idle state, no fetch).
 */
export function useWalletBalance(tenantId: string | null): WalletBalanceState {
  const [state, setState] = useState<WalletBalanceState>({
    balanceCents: null,
    billingMode: null,
    isEmpty: false,
    trialActive: false,
    trialExpiresAt: null,
    loading: !!tenantId,
    error: null,
    refetch: () => {},
  });
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (!tenantId) {
      setState({ balanceCents: null, billingMode: null, isEmpty: false, trialActive: false, trialExpiresAt: null, loading: false, error: null, refetch: () => setRefetchTick((t) => t + 1) });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      const [walletRes, tenantRes] = await Promise.all([
        supabase.from("wallets").select("balance_cents").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("tenants").select("billing_mode, trial_active, trial_expires_at").eq("id", tenantId).maybeSingle(),
      ]);
      if (cancelled) return;
      const err = walletRes.error?.message || tenantRes.error?.message || null;
      const bal = walletRes.data?.balance_cents ?? 0;
      const t = tenantRes.data as { billing_mode?: BillingMode; trial_active?: boolean; trial_expires_at?: string | null } | null;
      const expires = t?.trial_expires_at ?? null;
      const active = !!t?.trial_active && !!expires && new Date(expires).getTime() > Date.now();
      setState({
        balanceCents: bal,
        billingMode: t?.billing_mode ?? null,
        isEmpty: bal <= 0,
        trialActive: active,
        trialExpiresAt: expires,
        loading: false,
        error: err,
        refetch: () => setRefetchTick((t) => t + 1),
      });
    })();

    const channel = supabase
      .channel(`wallet:${tenantId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wallets", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const next = (payload.new as { balance_cents?: number } | null)?.balance_cents;
          if (typeof next === "number") {
            setState((s) => ({ ...s, balanceCents: next, isEmpty: next <= 0 }));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tenants", filter: `id=eq.${tenantId}` },
        (payload) => {
          const t = payload.new as { billing_mode?: BillingMode; trial_active?: boolean; trial_expires_at?: string | null } | null;
          if (!t) return;
          const expires = t.trial_expires_at ?? null;
          const active = !!t.trial_active && !!expires && new Date(expires).getTime() > Date.now();
          setState((s) => ({ ...s, billingMode: t.billing_mode ?? s.billingMode, trialActive: active, trialExpiresAt: expires }));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tenantId, refetchTick]);

  return state;
}

export function formatUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}