import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── Auth: identify caller ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
    const user = userData.user;

    // ── Parse body ──
    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty */ }

    const env = (body.env === "live" ? "live" : "test") as "test" | "live";
    const mode = (body.mode === "setup" ? "setup" : "payment") as "payment" | "setup";
    const uiMode = (body.ui_mode === "embedded" ? "embedded" : "hosted") as "embedded" | "hosted";
    const amountCents = Number.isFinite(body.amount_cents) ? Math.floor(body.amount_cents) : 0;
    const successUrl: string | undefined = body.success_url;
    const cancelUrl: string | undefined = body.cancel_url;
    const returnUrl: string | undefined = body.return_url;

    if (uiMode === "embedded") {
      if (!returnUrl) return json({ error: "return_url is required for embedded mode" }, 400);
    } else {
      if (!successUrl || !cancelUrl) {
        return json({ error: "success_url and cancel_url are required" }, 400);
      }
    }
    if (mode === "payment" && (amountCents < 500 || amountCents > 10_000_00)) {
      return json({ error: "amount_cents must be between 500 and 1,000,000" }, 400);
    }

    // ── Stripe config ──
    const isLive = env === "live";
    const secretKey = isLive
      ? Deno.env.get("STRIPE_LIVE_SECRET_KEY")
      : Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!secretKey) return json({ error: `Stripe not configured for env: ${env}` }, 500);
    const publishableKey = isLive
      ? Deno.env.get("STRIPE_LIVE_PUBLISHABLE_KEY")
      : Deno.env.get("STRIPE_TEST_PUBLISHABLE_KEY");
    if (uiMode === "embedded" && !publishableKey) {
      return json({ error: `Stripe publishable key not configured for env: ${env}` }, 500);
    }
    const stripe = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });

    // ── Resolve tenant for caller (service role: bypass RLS) ──
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: tu, error: tuErr } = await admin
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (tuErr) return json({ error: "Failed to resolve tenant" }, 500);
    if (!tu?.tenant_id) return json({ error: "No tenant for user" }, 403);
    const tenantId = tu.tenant_id as string;

    // ── Find or create Stripe customer ──
    const { data: bs } = await admin
      .from("billing_settings")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    let customerId = bs?.stripe_customer_id ?? null;
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as any)?.deleted) customerId = null;
      } catch (e: any) {
        if (e?.code === "resource_missing" || e?.statusCode === 404) {
          customerId = null;
        } else {
          throw e;
        }
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { tenant_id: tenantId, user_id: user.id, env },
      });
      customerId = customer.id;
      await admin
        .from("billing_settings")
        .upsert(
          {
            tenant_id: tenantId,
            stripe_customer_id: customerId,
            default_payment_method_id: null,
            card_brand: null,
            card_last4: null,
            card_exp_month: null,
            card_exp_year: null,
          },
          { onConflict: "tenant_id" },
        );
    }

    // ── Create checkout session ──
    const baseParams: Stripe.Checkout.SessionCreateParams =
      mode === "setup"
        ? {
            mode: "setup",
            customer: customerId,
            payment_method_types: ["card"],
            metadata: { tenant_id: tenantId, user_id: user.id, env, purpose: "save_card" },
          }
        : {
            mode: "payment",
            customer: customerId,
            payment_method_types: ["card"],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: amountCents,
                  product_data: {
                    name: "Wallet top-up",
                    description: "Closer Control AI credits",
                  },
                },
              },
            ],
            payment_intent_data: {
              setup_future_usage: "off_session",
              metadata: { tenant_id: tenantId, user_id: user.id, env, source: "wallet_topup" },
            },
            metadata: { tenant_id: tenantId, user_id: user.id, env, purpose: "wallet_topup" },
          };

    const sessionParams: Stripe.Checkout.SessionCreateParams =
      uiMode === "embedded"
        ? { ...baseParams, ui_mode: "embedded", return_url: returnUrl }
        : { ...baseParams, success_url: successUrl!, cancel_url: cancelUrl! };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({
      url: session.url,
      id: session.id,
      client_secret: session.client_secret,
      publishable_key: uiMode === "embedded" ? publishableKey : undefined,
    });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});