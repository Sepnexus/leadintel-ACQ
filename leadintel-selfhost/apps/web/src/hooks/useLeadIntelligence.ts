import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LeadIntelligence } from "@/lib/leadIntelligenceTypes";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { handleAiResponseError } from "@/lib/aiErrorToast";

function normalize(row: any): LeadIntelligence | null {
  if (!row) return null;
  return {
    ghl_contact_id: row.ghl_contact_id,
    rationale: row.rationale ?? null,
    opening_line: row.opening_line ?? null,
    next_steps: Array.isArray(row.next_steps) ? row.next_steps : null,
    signals: row.signals ?? null,
    message_count: row.message_count ?? null,
    last_message_at: row.last_message_at ?? null,
    model: row.model ?? null,
    generated_at: row.generated_at,
    stale: !!row.stale,
  };
}

export function useLeadIntelligence(ghlContactId: string | null) {
  const [intelligence, setIntelligence] = useState<LeadIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { tenantFilter, ready } = useTenantFilter();

  const invokeAnalyze = useCallback(
    async (contactId: string, force: boolean) => {
      const { data, error } = await supabase.functions.invoke("analyze-lead", {
        body: {
          contact_id: contactId,
          force,
          tenant_id: tenantId,
          caller_hint: "analyze_lead",
        },
      });
      if (error) {
        console.warn("analyze-lead error", error);
        return;
      }
      if (handleAiResponseError(data as any)) return;
      const next = normalize((data as any)?.intelligence);
      if (next) setIntelligence(next);
    },
    [tenantId],
  );

  const regenerate = useCallback(async () => {
    if (!ghlContactId) return;
    setRefreshing(true);
    try {
      await invokeAnalyze(ghlContactId, true);
    } finally {
      setRefreshing(false);
    }
  }, [ghlContactId, invokeAnalyze]);

  useEffect(() => {
    if (!ghlContactId) {
      setIntelligence(null);
      return;
    }
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setIntelligence(null);
    (async () => {
      let q: any = supabase
        .from("lead_intelligence")
        .select("*")
        .eq("ghl_contact_id", ghlContactId);
      if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
      const { data } = await q.maybeSingle();
      if (cancelled) return;
      const cached = normalize(data);
      setIntelligence(cached);
      setLoading(false);

      // Always trigger background analysis if missing or stale
      if (!cached || cached.stale) {
        setRefreshing(true);
        try {
          await invokeAnalyze(ghlContactId, false);
        } finally {
          if (!cancelled) setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ghlContactId, invokeAnalyze, tenantFilter, ready]);

  return { intelligence, loading, refreshing, regenerate };
}