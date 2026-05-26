import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const env = (url.searchParams.get("env") || "test").toLowerCase();
  const isLive = env === "live";

  const secretKey = isLive
    ? Deno.env.get("STRIPE_LIVE_SECRET_KEY")
    : Deno.env.get("STRIPE_TEST_SECRET_KEY");
  const webhookSecret = isLive
    ? Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET")
    : Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET");

  if (!secretKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe not configured for env: " + env }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig!, webhookSecret);
  } catch (err) {
    console.error("Signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("Stripe event:", event.type, "env:", env);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const amountCents = session.amount_total ?? 0;

        if (tenantId && amountCents > 0 && session.payment_status === "paid") {
          await supabase.rpc("credit_wallet", {
            p_tenant_id: tenantId,
            p_amount_cents: amountCents,
            p_type: "credit",
            p_description: `Stripe top-up (${env})`,
            p_metadata: {
              source: "stripe_checkout",
              env,
              checkout_session_id: session.id,
              payment_intent: session.payment_intent,
            },
          });
        }

        // Save customer + payment method for auto-recharge
        if (tenantId && session.customer && session.setup_intent) {
          const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string);
          const pmId = setupIntent.payment_method as string | null;
          if (pmId) {
            const pm = await stripe.paymentMethods.retrieve(pmId);
            await supabase.from("billing_settings").upsert({
              tenant_id: tenantId,
              stripe_customer_id: session.customer as string,
              default_payment_method_id: pmId,
              card_brand: pm.card?.brand ?? null,
              card_last4: pm.card?.last4 ?? null,
              card_exp_month: pm.card?.exp_month ?? null,
              card_exp_year: pm.card?.exp_year ?? null,
            }, { onConflict: "tenant_id" });
          }
        } else if (tenantId && session.customer && session.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
          const pmId = pi.payment_method as string | null;
          if (pmId) {
            const pm = await stripe.paymentMethods.retrieve(pmId);
            await supabase.from("billing_settings").upsert({
              tenant_id: tenantId,
              stripe_customer_id: session.customer as string,
              default_payment_method_id: pmId,
              card_brand: pm.card?.brand ?? null,
              card_last4: pm.card?.last4 ?? null,
              card_exp_month: pm.card?.exp_month ?? null,
              card_exp_year: pm.card?.exp_year ?? null,
            }, { onConflict: "tenant_id" });
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const tenantId = pi.metadata?.tenant_id;
        const isAutoRecharge = pi.metadata?.source === "auto_recharge";
        if (tenantId && isAutoRecharge && pi.amount > 0) {
          await supabase.rpc("credit_wallet", {
            p_tenant_id: tenantId,
            p_amount_cents: pi.amount,
            p_type: "credit",
            p_description: `Auto-recharge (${env})`,
            p_metadata: { source: "auto_recharge", env, payment_intent: pi.id },
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});