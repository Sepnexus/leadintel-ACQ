import { resolveTenantContext, createAdminClient, TenantContextError } from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED = new Set(["closer_control", "tenant"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { tenant_id, mode, reason } = body ?? {};

    if (typeof tenant_id !== "string" || !tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof mode !== "string" || !ALLOWED.has(mode)) {
      return new Response(JSON.stringify({ error: "mode must be 'closer_control' or 'tenant'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = await resolveTenantContext(req, { bodyTenantId: tenant_id });
    if (ctx.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "super_admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createAdminClient();
    const { data: existing } = await sb
      .from("tenants").select("id, billing_mode, name").eq("id", tenant_id).maybeSingle();
    if (!existing) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const from = existing.billing_mode as string;
    if (from === mode) {
      return new Response(JSON.stringify({ ok: true, mode, unchanged: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await sb
      .from("tenants").update({ billing_mode: mode }).eq("id", tenant_id);
    if (updErr) {
      console.error("billing_mode update failed:", updErr.message);
      return new Response(JSON.stringify({ error: "Update failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve actor email for audit trail
    const { data: actor } = await sb
      .from("users").select("email").eq("id", ctx.userId).maybeSingle();

    await sb.from("audit_log").insert({
      action: "tenant.billing_mode_changed",
      target_type: "tenant",
      target_id: tenant_id,
      actor_user_id: ctx.userId,
      actor_email: actor?.email ?? null,
      metadata: {
        from,
        to: mode,
        tenant_name: existing.name,
        reason: typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null,
      },
    });

    return new Response(JSON.stringify({ ok: true, mode, from }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("update-tenant-billing-mode error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});