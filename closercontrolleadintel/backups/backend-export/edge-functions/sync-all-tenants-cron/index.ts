// Cron-triggered: kick off a fresh delta sync for ALL active tenants.
// Auth: requires x-cron-secret header matching CRON_SECRET env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id, name")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[sync-all-tenants-cron] query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dispatched: Array<{ id: string; name: string }> = [];
  for (const t of tenants ?? []) {
    const ts = new Date().toISOString();
    console.log(`[sync-all-tenants-cron] ${ts} dispatching tenant=${t.id} name="${t.name}"`);
    fetch(`${SUPABASE_URL}/functions/v1/ghl-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        tenant_id: t.id,
        resource: "all",
        mode: "delta",
        _internal: true,
        trigger_source: "scheduled_auto",
      }),
    }).catch((e) => console.warn("[sync-all-tenants-cron] dispatch failed", e));
    dispatched.push({ id: t.id, name: t.name });
    await sleep(200);
  }

  return new Response(
    JSON.stringify({ ok: true, count: dispatched.length, tenants: dispatched }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
