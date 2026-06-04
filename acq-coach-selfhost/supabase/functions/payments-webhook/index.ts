// Direct Stripe webhook handler. Routes by ?env=test|live to verify with the
// matching webhook signing secret. Credits the wallet and saves card on file.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@22.0.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const rawEnv = url.searchParams.get("env");
    const mode: "test" | "live" = rawEnv === "live" ? "live" : "test";

    const secretKey = mode === "live"
      ? Deno.env.get("STRIPE_LIVE_SECRET_KEY")
      : Deno.env.get("STRIPE_TEST_SECRET_KEY");
    const webhookSecret = mode === "live"
      ? Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET")
      : Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");

    if (!secretKey || !webhookSecret) {
      console.error("[payments-webhook] missing keys for mode", mode);
      return new Response("missing keys", { status: 500 });
    }

    const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });
    const sig = req.headers.get("stripe-signature") || "";
    const raw = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
    } catch (e) {
      console.error("[payments-webhook] signature verification failed:", e);
      return new Response("bad signature", { status: 400 });
    }

    console.log("[payments-webhook]", mode, event.type, event.id);

    if (event.type === "checkout.session.completed") {
      const session: any = event.data.object;
      if (session.metadata?.type === "wallet_topup" && session.metadata?.account_id) {
        const account_id = session.metadata.account_id;
        const amount_cents = Number(session.metadata.amount_cents || session.amount_total || 0);
        const stripe_session_id = session.id;
        let stripe_customer_id: string | null = session.customer || null;
        const payment_intent_id: string | null = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null;

        let payment_method_id: string | null = null;
        let card_brand: string | null = null;
        let card_last4: string | null = null;
        let card_exp_month: number | null = null;
        let card_exp_year: number | null = null;

        if (payment_intent_id) {
          try {
            const pi = await stripe.paymentIntents.retrieve(payment_intent_id, { expand: ["payment_method"] });
            if (!stripe_customer_id && pi.customer) {
              stripe_customer_id = typeof pi.customer === "string" ? pi.customer : pi.customer.id;
            }
            const pm: any = pi.payment_method;
            if (pm && typeof pm === "object") {
              payment_method_id = pm.id;
              if (pm.card) {
                card_brand = pm.card.brand || null;
                card_last4 = pm.card.last4 || null;
                card_exp_month = pm.card.exp_month || null;
                card_exp_year = pm.card.exp_year || null;
              }
            } else if (typeof pm === "string") {
              payment_method_id = pm;
            }
            if (payment_method_id && stripe_customer_id) {
              try {
                await stripe.paymentMethods.attach(payment_method_id, { customer: stripe_customer_id });
              } catch (attachErr: any) {
                if (!String(attachErr?.message || "").includes("already")) {
                  console.warn("[payments-webhook] attach pm warning:", attachErr?.message);
                }
              }
            }
          } catch (e) {
            console.error("[payments-webhook] retrieve PI error:", e);
          }
        }

        if (amount_cents > 0) {
          const { error } = await admin.rpc("credit_wallet", {
            _account_id: account_id,
            _amount_cents: amount_cents,
            _reason: "Stripe top-up",
            _stripe_session_id: stripe_session_id,
            _metadata: {
              customer_email: session.customer_details?.email || null,
              stripe_customer_id,
              payment_intent_id,
              payment_method_id,
              card_brand,
              card_last4,
              stripe_mode: mode,
            },
            _type: "credit",
          });
          if (error) console.error("credit_wallet error", error);

          // Phase B5 — cross-product audit log entry
          try {
            const { logAudit } = await import("../_shared/platform.ts");
            await logAudit({
              actorPlatformUserId: null,  // webhook called by Stripe, not a user
              product: "acq_coach",
              action: "topup_succeeded",
              metadata: {
                acq_account_id: account_id,
                amount_cents,
                stripe_session_id,
                stripe_customer_id,
                customer_email: session.customer_details?.email || null,
              },
            });
          } catch (auditErr) {
            console.error("[payments-webhook] platform.audit_log write failed:", auditErr);
          }
        }

        const patch: Record<string, unknown> = { account_id, updated_at: new Date().toISOString() };
        if (stripe_customer_id) patch.stripe_customer_id = stripe_customer_id;
        if (payment_method_id) patch.default_payment_method_id = payment_method_id;
        if (card_brand) patch.card_brand = card_brand;
        if (card_last4) patch.card_last4 = card_last4;
        if (card_exp_month) patch.card_exp_month = card_exp_month;
        if (card_exp_year) patch.card_exp_year = card_exp_year;

        const { error: bsErr } = await admin.from("billing_settings").upsert(patch, { onConflict: "account_id" });
        if (bsErr) console.error("[payments-webhook] billing_settings upsert error", bsErr);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[payments-webhook] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500 });
  }
});
