import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return json({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const env = (body.env === "live" ? "live" : "test") as "test" | "live";
    const admin = createClient(SUPABASE_URL, SERVICE);

    let tenantId: string | null = null;
    const { data: profile } = await admin.from("users").select("role").eq("id", u.user.id).maybeSingle();
    if (profile?.role === "super_admin" && typeof body.tenant_id === "string") {
      tenantId = body.tenant_id;
    } else {
      const { data: tu } = await admin.from("tenant_users").select("tenant_id").eq("user_id", u.user.id).limit(1).maybeSingle();
      tenantId = (tu?.tenant_id as string | undefined) ?? null;
    }
    if (!tenantId) return json({ error: "No tenant for user" }, 403);

    const { data: bs } = await admin
      .from("billing_settings")
      .select("default_payment_method_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const pmId = bs?.default_payment_method_id ?? null;
    if (pmId) {
      const secretKey = env === "live"
        ? Deno.env.get("STRIPE_LIVE_SECRET_KEY")
        : Deno.env.get("STRIPE_TEST_SECRET_KEY");
      if (secretKey) {
        try {
          const stripe = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
          await stripe.paymentMethods.detach(pmId);
        } catch (e) {
          console.warn("Stripe detach warning:", (e as Error).message);
        }
      }
    }

    const { error } = await admin.from("billing_settings").upsert(
      {
        tenant_id: tenantId,
        default_payment_method_id: null,
        card_brand: null,
        card_last4: null,
        card_exp_month: null,
        card_exp_year: null,
        auto_recharge_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    console.error("remove-saved-card error:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});