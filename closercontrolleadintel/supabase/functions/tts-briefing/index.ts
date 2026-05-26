// redeploy: 2026-04-30 (force pickup of _shared/billing.ts changes)
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireUser, createAdminClient, TenantContextError } from "../_shared/tenantContext.ts";
import { meteredAiCall, estimateCostCents } from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    if (!DEEPGRAM_API_KEY) {
      return new Response(JSON.stringify({ error: "DEEPGRAM_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reqBody = await req.json();
    const { text, voice, tenant_id } = reqBody;
    const callerHint: string | null = typeof reqBody?.caller_hint === "string"
      ? reqBody.caller_hint
      : (typeof reqBody?.metadata?.caller_hint === "string" ? reqBody.metadata.caller_hint : null);

    // If a tenant_id is supplied, enforce that the tenant is active.
    if (typeof tenant_id !== "string" || !tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminSb = createAdminClient();
    const { data: tenantRow } = await adminSb
      .from("tenants")
      .select("status")
      .eq("id", tenant_id)
      .maybeSingle();
    if (!tenantRow || tenantRow.status !== "active") {
      return new Response(JSON.stringify({ error: "Tenant is not active" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deepgram caps text per request; trim defensively.
    const cleanText = text.trim().slice(0, 1800);
    const model = voice || "aura-asteria-en";

    const metered = await meteredAiCall({
      tenantId: tenant_id,
      userId,
      operation: "tts_briefing",
      model,
      provider: "deepgram",
      estimateCents: estimateCostCents("tts_briefing"),
      ttsInputText: cleanText,
      callerHint,
      metadata: { char_count: cleanText.length, voice: model },
      fn: async () => {
        const dgRes = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`, {
          method: "POST",
          headers: {
            Authorization: "Token " + DEEPGRAM_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: cleanText }),
        });
        if (!dgRes.ok) {
          const errText = await dgRes.text();
          throw new Error(`Deepgram ${dgRes.status}: ${errText.slice(0, 200)}`);
        }
        const audioBuffer = await dgRes.arrayBuffer();
        const audioBase64 = base64Encode(audioBuffer);
        return {
          result: { audioContent: audioBase64, mime: "audio/mpeg" },
          providerResponse: { byteLength: audioBuffer.byteLength },
        };
      },
    });

    if (!metered.ok) {
      return new Response(JSON.stringify({ ok: false, error: metered.error, code: metered.code }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(metered.result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tts-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});