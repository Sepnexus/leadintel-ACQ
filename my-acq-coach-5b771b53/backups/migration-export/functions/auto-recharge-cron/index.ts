// Runs every 5 min. For each account with auto_recharge_enabled where balance
// is below threshold and a default payment method is on file, creates an
// off-session PaymentIntent on the saved card. The payments-webhook then
// credits the wallet when the charge succeeds.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@22.0.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: any, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: settingsRow } = await admin.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle();
    const mode: "test" | "live" = settingsRow?.stripe_mode === "live" ? "live" : "test";
    const secretKey = mode === "live" ? Deno.env.get("STRIPE_LIVE_SECRET_KEY") : Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!secretKey) return json({ error: `Stripe ${mode} key not configured` }, 500);
    const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

    // Pull eligible accounts. Filter in JS to combine with wallet balance.
    const { data: settings } = await admin.from("billing_settings")
      .select("account_id, auto_recharge_enabled, threshold_cents, topup_amount_cents, default_payment_method_id, stripe_customer_id")
      .eq("auto_recharge_enabled", true)
      .not("default_payment_method_id", "is", null)
      .not("stripe_customer_id", "is", null);

    const ids = (settings || []).map(s => s.account_id);
    if (ids.length === 0) return json({ ok: true, charged: 0, reason: "no eligible accounts" });

    const { data: wallets } = await admin.from("wallets").select("account_id, balance_cents").in("account_id", ids);
    const balByAcc = new Map((wallets || []).map(w => [w.account_id, w.balance_cents]));
    const { data: accs } = await admin.from("ghl_accounts").select("id, name").in("id", ids);
    const nameByAcc = new Map((accs || []).map(a => [a.id, a.name]));

    let charged = 0; let skipped = 0; const errors: any[] = [];
    for (const s of settings || []) {
      const balance = balByAcc.get(s.account_id) ?? 0;
      if (balance >= s.threshold_cents) { skipped++; continue; }

      // Throttle: skip if a recharge attempt was made in last 10 min
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recent } = await admin.from("wallet_transactions")
        .select("id").eq("account_id", s.account_id)
        .gte("created_at", tenMinAgo)
        .or("reason.eq.Auto-recharge attempt,reason.eq.Stripe top-up")
        .limit(1);
      if (recent && recent.length) { skipped++; continue; }

      try {
        const amount = Math.max(500, s.topup_amount_cents);
        const pi = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          customer: s.stripe_customer_id!,
          payment_method: s.default_payment_method_id!,
          off_session: true,
          confirm: true,
          description: `Auto-recharge — ${nameByAcc.get(s.account_id) || s.account_id}`,
          metadata: {
            account_id: s.account_id,
            type: "wallet_topup",
            amount_cents: String(amount),
            stripe_mode: mode,
            source: "auto_recharge_cron",
          },
        });

        if (pi.status === "succeeded") {
          // Credit immediately (webhook may also fire — credit_wallet de-dupes via stripe_session_id, but we use PI id here as session id substitute prefix to avoid collision)
          await admin.rpc("credit_wallet", {
            _account_id: s.account_id,
            _amount_cents: amount,
            _reason: "Auto-recharge (saved card)",
            _stripe_session_id: `pi_auto_${pi.id}`,
            _metadata: {
              source: "auto_recharge_cron",
              payment_intent_id: pi.id,
              stripe_customer_id: s.stripe_customer_id,
              stripe_mode: mode,
            },
            _type: "credit",
          });
          charged++;
        } else {
          errors.push({ account_id: s.account_id, status: pi.status });
        }
      } catch (e: any) {
        console.error("[auto-recharge] error", s.account_id, e?.message);
        // Disable auto-recharge if card is permanently broken
        const code = e?.code || "";
        const isAuthFail = ["authentication_required", "card_declined"].includes(code);
        if (isAuthFail) {
          await admin.from("billing_settings").update({
            auto_recharge_enabled: false,
            updated_at: new Date().toISOString(),
          }).eq("account_id", s.account_id);
        }
        await admin.from("wallet_transactions").insert({
          account_id: s.account_id,
          type: "adjustment",
          amount_cents: 0,
          balance_after_cents: balance,
          reason: `Auto-recharge failed: ${code || e?.message || "unknown"}`,
          metadata: { source: "auto_recharge_cron", error: e?.message, code, disabled_auto: isAuthFail },
        });
        errors.push({ account_id: s.account_id, error: e?.message });
      }
    }

    return json({ ok: true, charged, skipped, errors });
  } catch (e) {
    console.error("[auto-recharge-cron] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
