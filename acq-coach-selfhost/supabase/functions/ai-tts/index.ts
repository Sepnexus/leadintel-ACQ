import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAccessOrDeny } from "../_shared/platform.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const allowedVoices = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Platform gate: auth + acq_coach access ──
  const deny = await requireAccessOrDeny(req, "acq_coach", corsHeaders);
  if (deny) return deny;

  try {
    const { text, voice = "onyx" } = await req.json();
    const cleanText = String(text || "").trim();
    const cleanVoice = allowedVoices.has(String(voice)) ? String(voice) : "onyx";
    if (!cleanText) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (cleanText.length > 4000) {
      return new Response(JSON.stringify({ error: "Text is too long" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Voice service is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice: cleanVoice, input: cleanText }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error("TTS error:", res.status, details);
      return new Response(JSON.stringify({ error: `TTS error ${res.status}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(await res.arrayBuffer(), { headers: { ...corsHeaders, "Content-Type": "audio/mpeg" } });
  } catch (e) {
    console.error("ai-tts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
