// redeploy: 2026-04-30 (force pickup of _shared/billing.ts changes)
import { requireUser, createAdminClient, TenantContextError } from "../_shared/tenantContext.ts";
import { meteredAiCall, estimateCostCents } from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let userId: string | null = null;
    try {
      const u = await requireUser(req);
      userId = u.userId;
    } catch (e) {
      if (e instanceof TenantContextError) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: e.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }

    const body = await req.json();
    const { system, messages, max_tokens = 4000, model, tenant_id } = body;
    const callerHint: string | null = typeof body?.caller_hint === "string"
      ? body.caller_hint
      : (typeof body?.metadata?.caller_hint === "string" ? body.metadata.caller_hint : null);

    if (!system || !messages) {
      return new Response(
        JSON.stringify({ error: "Missing system or messages" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (tenant_id === null || tenant_id === undefined) {
      return new Response(
        JSON.stringify({ ok: false, code: "no_tenant", message: "Select a tenant first." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (typeof tenant_id !== "string" || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tenant must be active
    const adminSb = createAdminClient();
    const { data: tenantRow } = await adminSb
      .from("tenants").select("status").eq("id", tenant_id).maybeSingle();
    if (!tenantRow || tenantRow.status !== "active") {
      return new Response(JSON.stringify({ error: "Tenant is not active" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const usedModel = model || "google/gemini-2.5-flash";
    const metered = await meteredAiCall({
      tenantId: tenant_id,
      userId,
      operation: "ai_analyze",
      model: usedModel,
      provider: "gemini",
      estimateCents: estimateCostCents("ai_analyze"),
      callerHint,
      metadata: { max_tokens },
      fn: async () => {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: usedModel,
            messages: [{ role: "system", content: system }, ...messages],
            max_tokens,
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AI gateway ${response.status}: ${errText.slice(0, 200)}`);
        }
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "";
        return { result: { text }, providerResponse: data };
      },
    });

    if (!metered.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: metered.error, code: metered.code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify(metered.result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
