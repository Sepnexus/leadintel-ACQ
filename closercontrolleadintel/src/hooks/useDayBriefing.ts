import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { handleAiResponseError } from "@/lib/aiErrorToast";

export interface DayBriefing {
  headline: string;
  top_callouts: { lead_id?: string; lead_name: string; callout: string; urgency: "act_now" | "important" | "follow_up" }[];
  themes: { theme: string; evidence: string; lead_ids?: string[] }[];
  start_order: { lead_id?: string; lead_name: string; reason: string }[];
  watch_for: string[];
  model?: string;
}

export function useDayBriefing() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [data, setData] = useState<DayBriefing | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedForKey, setGeneratedForKey] = useState<string | null>(null);

  const generate = useCallback(async (leadIds: string[], force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (!tenantId) {
        throw new Error("Select a tenant to generate a briefing.");
      }
      const { data: result, error: e } = await supabase.functions.invoke("generate-day-briefing", {
        body: { lead_ids: leadIds, force, tenant_id: tenantId, caller_hint: "day_briefing" },
      });
      if (e) throw e;
      if (handleAiResponseError(result as any)) {
        setError((result as any)?.error || "AI request failed");
        return;
      }
      if (result?.error) throw new Error(result.error);
      setData(result.briefing as DayBriefing);
      setGeneratedAt(result.generated_at ?? new Date().toISOString());
      setGeneratedForKey([...leadIds].sort().join("|"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  return { data, generatedAt, loading, error, generate, generatedForKey };
}