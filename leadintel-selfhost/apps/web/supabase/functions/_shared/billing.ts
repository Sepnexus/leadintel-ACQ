// Shared billing/metering helper for all AI edge functions.
//
// Contract:
//   meteredAiCall pre-flight debits the tenant wallet for the marked-up
//   estimate, runs the provided fn, then reconciles based on actual usage.
//   ALL tenants are billed (legacy closer_control mode is gone).
//
// All cents are integer USD cents. Estimates already include 30% markup, so
// debit_wallet operates on the customer-facing amount and matches what the
// UI shows.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type Operation = "analyze_lead" | "generate_briefing" | "tts_briefing" | "ai_analyze";
export type Provider = "anthropic" | "gemini" | "deepgram";

function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Global markup multiplier from platform_settings (default 2.0).
 * Cached per-invocation. Falls back to 2.0 if the lookup fails.
 */
let _cachedMultiplier: number | null = null;
async function getMultiplier(sb: SupabaseClient): Promise<number> {
  if (_cachedMultiplier !== null) return _cachedMultiplier;
  try {
    const { data } = await sb.rpc("get_ai_markup_multiplier");
    const n = Number(data);
    _cachedMultiplier = Number.isFinite(n) && n > 0 ? n : 2.0;
  } catch {
    _cachedMultiplier = 2.0;
  }
  return _cachedMultiplier;
}

/** Apply the configured markup to a raw cost (cents), ceil-rounded. */
export function applyMarkup(rawCents: number, multiplier = 2.0): number {
  if (rawCents <= 0) return 0;
  return Math.ceil(rawCents * multiplier);
}

/**
 * Conservative pre-flight estimate (uses default 2x for static estimates).
 * Reconciliation in meteredAiCall uses the live multiplier from platform_settings.
 * Numbers grounded in published 2024/2025 provider pricing.
 */
export function estimateCostCents(operation: Operation): number {
  switch (operation) {
    case "analyze_lead": return applyMarkup(3, 2.0);
    case "generate_briefing": return applyMarkup(1, 2.0);
    case "tts_briefing": return applyMarkup(3, 2.0);
    case "ai_analyze": return applyMarkup(1, 2.0);
  }
}

/**
 * Compute actual cost from provider response. Returns marked-up cents.
 * Returns 0 when no usable usage data (treated as rule-based fallback).
 */
export function computeActualChargedCents(
  operation: Operation,
  providerResponse: any,
  ttsInputText?: string,
  multiplier = 2.0,
): { rawCents: number; chargedCents: number; tokens: { input?: number; output?: number; chars?: number } } {
  const tokens: { input?: number; output?: number; chars?: number } = {};
  let raw = 0;

  if (operation === "tts_briefing") {
    const chars = (ttsInputText ?? "").length;
    tokens.chars = chars;
    // Deepgram Aura 2: $0.030 per 1,000 characters = 0.003¢ per char
    raw = (chars / 1000) * 3; // cents
  } else if (providerResponse) {
    // Claude shape
    const claudeIn = providerResponse?.usage?.input_tokens;
    const claudeOut = providerResponse?.usage?.output_tokens;
    // Gemini (OpenAI-compatible via Lovable gateway) shape
    const openaiIn = providerResponse?.usage?.prompt_tokens;
    const openaiOut = providerResponse?.usage?.completion_tokens;
    // Native Gemini shape
    const geminiIn = providerResponse?.usageMetadata?.promptTokenCount;
    const geminiOut = providerResponse?.usageMetadata?.candidatesTokenCount;

    const inTok = claudeIn ?? openaiIn ?? geminiIn ?? 0;
    const outTok = claudeOut ?? openaiOut ?? geminiOut ?? 0;
    tokens.input = inTok;
    tokens.output = outTok;

    if (claudeIn != null) {
      // Claude Sonnet 4.5: $3/M input, $15/M output
      raw = (inTok / 1_000_000) * 300 + (outTok / 1_000_000) * 1500;
    } else if (inTok > 0 || outTok > 0) {
      // Gemini 2.5 Flash: $0.30/M input, $2.50/M output
      raw = (inTok / 1_000_000) * 30 + (outTok / 1_000_000) * 250;
    }
  }

  const rawCents = raw > 0 ? Math.ceil(raw) : 0;
  const chargedCents = applyMarkup(rawCents, multiplier);
  return { rawCents, chargedCents, tokens };
}

export interface MeteredCallArgs<T> {
  tenantId: string;
  userId: string | null;
  operation: Operation;
  model: string;
  provider: Provider;
  estimateCents: number;
  metadata?: Record<string, any>;
  /** Frontend-supplied call site identifier. Merged into usage_events.metadata.caller_hint. */
  callerHint?: string | null;
  /** TTS only — provide the input text so character billing can be computed. */
  ttsInputText?: string;
  fn: () => Promise<{ result: T; providerResponse: any; modelUsed?: string }>;
}

export type MeteredCallResult<T> =
  | { ok: true; result: T; charged_cents: number; cost_cents: number; balance_cents?: number }
  | { ok: false; code: "insufficient_balance" | "tenant_not_found" | "provider_error"; error: string; balance_cents?: number };

function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 240 ? msg.slice(0, 240) + "…" : msg;
}

export async function meteredAiCall<T>(args: MeteredCallArgs<T>): Promise<MeteredCallResult<T>> {
  const sb = admin();
  const start = Date.now();
  const callerHint = typeof args.callerHint === "string" && args.callerHint.length > 0 ? args.callerHint : null;
  const baseMeta = { ...(args.metadata ?? {}), caller_hint: callerHint };

  // Verify tenant exists. billing_mode is now always 'tenant' (closer_control retired).
  const { data: tenantRow } = await sb
    .from("tenants")
    .select("id")
    .eq("id", args.tenantId)
    .maybeSingle();
  if (!tenantRow) {
    return { ok: false, code: "tenant_not_found", error: "Tenant not found." };
  }
  const billingMode = "tenant";
  const multiplier = await getMultiplier(sb);

  // 1. Pre-flight debit (RPC short-circuits in closer_control mode and returns ok=true,debited=false)
  const { data: debitResp, error: debitErr } = await sb.rpc("debit_wallet", {
    p_tenant_id: args.tenantId,
    p_amount_cents: args.estimateCents,
    p_description: `${args.operation} estimate`,
    p_metadata: { ...baseMeta, operation: args.operation, model: args.model, phase: "estimate" },
  });
  if (debitErr) {
    console.error("debit_wallet RPC error:", debitErr.message);
    return { ok: false, code: "tenant_not_found", error: "Wallet operation failed." };
  }
  const debit = (debitResp ?? {}) as { ok: boolean; error?: string; balance_cents?: number; debited?: boolean; mode?: string };
  if (!debit.ok) {
    if (debit.error === "insufficient_balance") {
      // Record a usage_event for visibility (zero cost, blocked)
      await sb.from("usage_events").insert({
        tenant_id: args.tenantId,
        user_id: args.userId,
        operation: args.operation,
        provider: args.provider,
        model: args.model,
        cost_cents: 0,
        charged_cents: 0,
        billing_mode: billingMode,
        metadata: { ...baseMeta, blocked: true, reason: "insufficient_balance", success: false },
      });
      return {
        ok: false,
        code: "insufficient_balance",
        error: "Wallet balance is too low. Please top up to continue.",
        balance_cents: debit.balance_cents ?? 0,
      };
    }
    return { ok: false, code: "tenant_not_found", error: debit.error ?? "Tenant not found." };
  }

  const debitedEstimate = !!debit.debited; // always true now on success

  // 2. Run the AI call (capture failure for finally-block usage_events write)
  let result: T | null = null;
  let providerResponse: any = null;
  let modelUsed = args.model;
  let failure: string | null = null;
  try {
    const out = await args.fn();
    result = out.result;
    providerResponse = out.providerResponse;
    if (out.modelUsed) modelUsed = out.modelUsed;
  } catch (e) {
    failure = sanitizeError(e);
  }

  const duration_ms = Date.now() - start;

  // 3. Failure path: refund full estimate (tenant mode), record event, return.
  if (failure || result === null) {
    let refundedBalance: number | undefined;
    if (debitedEstimate) {
      const { data: refundResp } = await sb.rpc("credit_wallet", {
        p_tenant_id: args.tenantId,
        p_amount_cents: args.estimateCents,
        p_type: "refund",
        p_description: `${args.operation} refund — provider failure`,
        p_metadata: { ...baseMeta, operation: args.operation, model: modelUsed, phase: "refund_failure", error: failure },
      });
      refundedBalance = (refundResp as any)?.balance_cents;
    }
    await sb.from("usage_events").insert({
      tenant_id: args.tenantId,
      user_id: args.userId,
      operation: args.operation,
      provider: args.provider,
      model: modelUsed,
      cost_cents: 0,
      charged_cents: 0,
      billing_mode: billingMode,
      metadata: { ...baseMeta, success: false, error_message: failure ?? "unknown failure", duration_ms },
    });
    return {
      ok: false,
      code: "provider_error",
      error: failure ?? "AI provider returned no result.",
      balance_cents: refundedBalance,
    };
  }

  // 4. Success path: compute actual, reconcile delta against estimate.
  const { rawCents, chargedCents, tokens } = computeActualChargedCents(args.operation, providerResponse, args.ttsInputText, multiplier);

  let finalBalance: number | undefined;
  if (debitedEstimate) {
    if (chargedCents < args.estimateCents) {
      const refundDelta = args.estimateCents - chargedCents;
      const { data: refundResp } = await sb.rpc("credit_wallet", {
        p_tenant_id: args.tenantId,
        p_amount_cents: refundDelta,
        p_type: "adjustment",
        p_description: chargedCents === 0
          ? `${args.operation} adjustment — rule-based fallback (no AI cost)`
          : `${args.operation} estimate adjustment`,
        p_metadata: { ...baseMeta, operation: args.operation, model: modelUsed, phase: "reconcile_refund", estimate_cents: args.estimateCents, actual_charged_cents: chargedCents },
      });
      finalBalance = (refundResp as any)?.balance_cents;
    } else if (chargedCents > args.estimateCents) {
      const extra = chargedCents - args.estimateCents;
      const { data: extraResp } = await sb.rpc("debit_wallet", {
        p_tenant_id: args.tenantId,
        p_amount_cents: extra,
        p_description: `${args.operation} estimate top-up`,
        p_metadata: { ...baseMeta, operation: args.operation, model: modelUsed, phase: "reconcile_debit", estimate_cents: args.estimateCents, actual_charged_cents: chargedCents },
      });
      const er = (extraResp ?? {}) as { ok: boolean; balance_cents?: number; error?: string };
      if (!er.ok) {
        // Race: balance went to zero between estimate and reconcile. Accept the small loss.
        console.warn(`Reconcile debit failed for tenant ${args.tenantId}: ${er.error}. Accepting ${extra}¢ loss.`);
        finalBalance = er.balance_cents;
      } else {
        finalBalance = er.balance_cents;
      }
    }
  }

  const isFallback = chargedCents === 0 && rawCents === 0;
  await sb.from("usage_events").insert({
    tenant_id: args.tenantId,
    user_id: args.userId,
    operation: args.operation,
    provider: args.provider,
    model: isFallback ? "rule-based-fallback" : modelUsed,
    cost_cents: rawCents,
    charged_cents: chargedCents,
    billing_mode: billingMode,
    metadata: {
      ...baseMeta,
      success: true,
      duration_ms,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      input_chars: tokens.chars,
      fallback: isFallback || undefined,
      estimate_cents: args.estimateCents,
    },
  });

  return { ok: true, result, charged_cents: chargedCents, cost_cents: rawCents, balance_cents: finalBalance };
}