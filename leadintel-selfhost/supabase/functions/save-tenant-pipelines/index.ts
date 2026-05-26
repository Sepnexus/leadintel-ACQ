import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  resolveTenantContext,
  TenantContextError,
} from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface PipelineMeta { id: string; name: string }

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const ctx = await resolveTenantContext(req, {
      bodyTenantId: body?.tenant_id ?? null,
      requireTenantForAdmin: true,
    });
    const tenantId = ctx.tenantId!;

    const selectedIds: string[] = Array.isArray(body?.selected_pipeline_ids)
      ? body.selected_pipeline_ids.map((x: unknown) => String(x))
      : [];
    const meta: PipelineMeta[] = Array.isArray(body?.pipelines_meta)
      ? body.pipelines_meta
          .filter((p: any) => p && typeof p.id !== "undefined" && typeof p.name === "string")
          .map((p: any) => ({ id: String(p.id), name: String(p.name) }))
      : [];

    if (meta.length === 0) {
      return new Response(JSON.stringify({ error: "pipelines_meta is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const selectedSet = new Set(selectedIds);
    const metaIds = meta.map((p) => p.id);

    // 1. Upsert all rows from meta
    const upsertRows = meta.map((p) => ({
      tenant_id: tenantId,
      ghl_pipeline_id: p.id,
      pipeline_name: p.name,
      selected: selectedSet.has(p.id),
      updated_at: new Date().toISOString(),
    }));
    const { error: upErr } = await admin
      .from("tenant_pipelines")
      .upsert(upsertRows, { onConflict: "tenant_id,ghl_pipeline_id" });
    if (upErr) {
      return new Response(JSON.stringify({ error: `Failed to save: ${upErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Delete orphan rows (pipelines that no longer exist in GHL)
    const { data: existing } = await admin
      .from("tenant_pipelines")
      .select("ghl_pipeline_id")
      .eq("tenant_id", tenantId);
    const orphanIds = (existing ?? [])
      .map((r: any) => r.ghl_pipeline_id)
      .filter((id: string) => !metaIds.includes(id));
    if (orphanIds.length) {
      await admin
        .from("tenant_pipelines")
        .delete()
        .eq("tenant_id", tenantId)
        .in("ghl_pipeline_id", orphanIds);
    }

    // 3. Audit log
    await admin.from("audit_log").insert({
      action: "pipelines.selected",
      actor_user_id: ctx.userId,
      target_type: "tenant",
      target_id: tenantId,
      metadata: {
        selected_count: selectedIds.length,
        total_count: meta.length,
        selected_ids: selectedIds,
      },
    });

    // 4. Fire-and-forget opportunities sync
    const triggerSync = async () => {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/ghl-sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            "Content-Type": "application/json",
            "x-internal-actor": ctx.userId,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            mode: "full",
            resources: ["opportunities"],
            trigger_source: "pipeline_selection_save",
          }),
        });
      } catch (err) {
        console.error("Background sync trigger failed:", err);
      }
    };
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(triggerSync());
    } else {
      // Fallback: don't await
      triggerSync();
    }

    return new Response(
      JSON.stringify({ success: true, sync_triggered: true, selected_count: selectedIds.length }),
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