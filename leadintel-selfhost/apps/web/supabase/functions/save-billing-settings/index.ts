import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

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
    const auto_recharge_enabled = !!body.auto_recharge_enabled;
    const threshold_cents = Number.isFinite(body.threshold_cents) ? Math.max(100, Math.floor(body.threshold_cents)) : 500;
    const topup_amount_cents = Number.isFinite(body.topup_amount_cents) ? Math.max(500, Math.floor(body.topup_amount_cents)) : 2000;

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Resolve tenant for caller (or accept explicit tenant_id if super admin)
    let tenantId: string | null = null;
    const { data: profile } = await admin.from("users").select("role").eq("id", u.user.id).maybeSingle();
    const isSuper = profile?.role === "super_admin";
    if (isSuper && typeof body.tenant_id === "string") {
      tenantId = body.tenant_id;
    } else {
      const { data: tu } = await admin.from("tenant_users").select("tenant_id").eq("user_id", u.user.id).limit(1).maybeSingle();
      tenantId = (tu?.tenant_id as string | undefined) ?? null;
    }
    if (!tenantId) return json({ error: "No tenant for user" }, 403);

    // If enabling auto-recharge, require a saved card
    if (auto_recharge_enabled) {
      const { data: bs } = await admin.from("billing_settings").select("default_payment_method_id").eq("tenant_id", tenantId).maybeSingle();
      if (!bs?.default_payment_method_id) {
        return json({ error: "Save a card first by making a top-up." }, 400);
      }
    }

    const { error } = await admin.from("billing_settings").upsert(
      {
        tenant_id: tenantId,
        auto_recharge_enabled,
        threshold_cents,
        topup_amount_cents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    console.error("save-billing-settings error:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});