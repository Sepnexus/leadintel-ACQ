// Cron-triggered resume function. Scans sync_state for partial syncs
// (last_delta_cursor IS NOT NULL) within the last 48h and fires background
// _internal invocations of ghl-sync to continue them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

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

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("sync_state")
    .select("tenant_id, resource, last_delta_sync_at, last_full_sync_at")
    .not("last_delta_cursor", "is", null)
    .or(`last_delta_sync_at.gt.${cutoff},last_full_sync_at.gt.${cutoff}`);

  if (error) {
    console.error("[sync-resume-cron] query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resumed: Array<{ tenant_id: string; resource: string }> = [];
  for (const row of rows ?? []) {
    const ts = new Date().toISOString();
    console.log(`[sync-resume-cron] ${ts} resuming tenant=${row.tenant_id} resource=${row.resource}`);
    fetch(`${SUPABASE_URL}/functions/v1/ghl-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        mode: "delta",
        resource: row.resource,
        tenant_id: row.tenant_id,
        _internal: true,
        trigger_source: "cron_resume",
      }),
    }).catch((e) => console.warn("[sync-resume-cron] dispatch failed", e));
    resumed.push({ tenant_id: row.tenant_id, resource: row.resource });
  }

  return new Response(
    JSON.stringify({ ok: true, count: resumed.length, resumed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});