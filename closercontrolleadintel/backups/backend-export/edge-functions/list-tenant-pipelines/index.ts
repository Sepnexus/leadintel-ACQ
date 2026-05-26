import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  resolveTenantContext,
  TenantContextError,
} from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const ctx = await resolveTenantContext(req, {
      bodyTenantId: body?.tenant_id ?? null,
      requireTenantForAdmin: true,
    });
    const tenantId = ctx.tenantId!;

    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("ghl_pit_token, ghl_location_id, status")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!tenant.ghl_pit_token || !tenant.ghl_location_id) {
      return new Response(JSON.stringify({ error: "Tenant has no GHL credentials configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch pipelines from GHL
    const ghlUrl = `${GHL_BASE}/opportunities/pipelines?locationId=${encodeURIComponent(tenant.ghl_location_id)}`;
    const res = await fetch(ghlUrl, {
      headers: {
        Authorization: `Bearer ${tenant.ghl_pit_token}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return new Response(
        JSON.stringify({ error: "Token rejected — please contact support" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `GHL returned ${res.status}: ${txt.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = await res.json();
    const rawPipelines: any[] = data?.pipelines ?? [];
    const pipelines = rawPipelines.map((p) => ({
      id: String(p.id),
      name: String(p.name ?? "Unnamed pipeline"),
      stages: Array.isArray(p.stages)
        ? p.stages.map((s: any) => ({ id: String(s.id), name: String(s.name ?? "") }))
        : [],
    }));

    // Read current selections
    const { data: existing } = await admin
      .from("tenant_pipelines")
      .select("ghl_pipeline_id, selected")
      .eq("tenant_id", tenantId);

    const current_selections = (existing ?? [])
      .filter((r: any) => r.selected)
      .map((r: any) => r.ghl_pipeline_id);

    const has_any_config = (existing ?? []).length > 0;

    return new Response(
      JSON.stringify({ pipelines, current_selections, has_any_config }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof TenantContextError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});