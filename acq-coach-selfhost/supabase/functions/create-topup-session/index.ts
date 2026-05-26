// Direct Stripe integration (BYO account). Uses STRIPE_LIVE_SECRET_KEY or
// STRIPE_TEST_SECRET_KEY based on app_settings.stripe_mode.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@22.0.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: any, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { account_id, amount_cents, return_url } = body || {};
    if (!account_id || !amount_cents || amount_cents < 500) {
      return json({ error: "account_id and amount_cents (min $5) required" }, 400);
    }

    // Auth: super_admin OR account_admin for this account
    const { data: roles } = await admin.from("user_roles").select("role, account_id").eq("user_id", u.user.id);
    const isSuper = !!roles?.some((r: any) => r.role === "super_admin");
    const isAdmin = !!roles?.some((r: any) => r.role === "account_admin" && r.account_id === account_id);
    if (!isSuper && !isAdmin) return json({ error: "Forbidden" }, 403);

    // Read mode from app_settings
    const { data: settings } = await admin.from("app_settings").select("stripe_mode").eq("id", true).maybeSingle();
    const mode: "test" | "live" = settings?.stripe_mode === "live" ? "live" : "test";

    const secretKey = mode === "live"
      ? Deno.env.get("STRIPE_LIVE_SECRET_KEY")
      : Deno.env.get("STRIPE_TEST_SECRET_KEY");
    const publishableKey = mode === "live"
      ? Deno.env.get("STRIPE_LIVE_PUBLISHABLE_KEY")
      : Deno.env.get("STRIPE_TEST_PUBLISHABLE_KEY");
    if (!secretKey || !publishableKey) return json({ error: `Stripe ${mode} keys not configured` }, 500);

    const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

    const { data: acc } = await admin.from("ghl_accounts").select("name").eq("id", account_id).single();

    const baseReturn = (return_url || "").split("?")[0] || "/";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      return_url: `${baseReturn}?view=billing&topup=success&session_id={CHECKOUT_SESSION_ID}`,
      customer_email: u.user.email || undefined,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: { account_id, type: "wallet_topup", user_id: u.user.id, stripe_mode: mode },
      },
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Wallet top-up — ${acc?.name || "Customer"}` },
          unit_amount: Math.round(amount_cents),
        },
        quantity: 1,
      }],
      metadata: {
        account_id,
        type: "wallet_topup",
        amount_cents: String(amount_cents),
        user_id: u.user.id,
        stripe_mode: mode,
      },
    });

    return json({
      clientSecret: session.client_secret,
      session_id: session.id,
      publishableKey,
      mode,
    });
  } catch (e) {
    console.error("[create-topup-session] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
