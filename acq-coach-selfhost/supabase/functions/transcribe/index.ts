import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAccessOrDeny } from "../_shared/platform.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Deepgram pricing (Nova-3 pay-as-you-go): ~$0.0043/min ≈ 0.43¢/min
const DEEPGRAM_CENTS_PER_MIN = 0.43;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Platform gate: auth + acq_coach access ──
  const deny = await requireAccessOrDeny(req, "acq_coach", corsHeaders);
  if (deny) return deny;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dgKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!dgKey) {
      return new Response(JSON.stringify({ error: "DEEPGRAM_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream audio bytes directly to Deepgram. Much faster than Whisper, no 150s timeout risk.
    const url = "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&diarize=true&utterances=true";
    const audioBuf = await file.arrayBuffer();
    const contentType = file.type || "audio/mpeg";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${dgKey}`,
        "Content-Type": contentType,
      },
      body: audioBuf,
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("Deepgram error:", res.status, t);
      return new Response(JSON.stringify({ error: `Deepgram error ${res.status}: ${t}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const channel = data?.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    const utterances = data?.results?.utterances || [];

    // Prefer diarized utterances; fall back to flat transcript.
    let text: string = "";
    if (utterances.length) {
      text = utterances.map((u: any) => `Speaker ${u.speaker ?? 0}: ${u.transcript}`).join("\n");
    } else {
      text = alt?.transcript || "";
    }

    const durationSec: number = Math.round(data?.metadata?.duration || 0);
    const costCents = (durationSec / 60) * DEEPGRAM_CENTS_PER_MIN;

    return new Response(JSON.stringify({
      text,
      duration_seconds: durationSec,
      cost_cents: costCents,
      model: "deepgram-nova-3",
      provider: "deepgram",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
