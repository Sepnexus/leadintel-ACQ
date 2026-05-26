import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

export interface ContactNote {
  ghl_note_id: string;
  body_text: string;
  date_added: string | null;
}

export function useContactNotes(ghlContactId: string | null, refreshKey?: string | null) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [loading, setLoading] = useState(false);
  const { tenantFilter, ready } = useTenantFilter();

  const fetchNotes = useCallback(async () => {
    if (!ghlContactId || !ready) return;
    setLoading(true);
    try {
      let q: any = supabase
        .from("ghl_contact_notes")
        .select("ghl_note_id, body_text, date_added")
        .eq("ghl_contact_id", ghlContactId)
        .not("body_text", "is", null)
        .order("date_added", { ascending: false, nullsFirst: false })
        .limit(10);
      if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
      const { data, error } = await q;
      if (error) {
        console.warn("useContactNotes error", error);
        setNotes([]);
      } else {
        const filtered = (data || []).filter(
          (n: any) => n.body_text && n.body_text.length > 20,
        );
        setNotes(filtered);
      }
    } finally {
      setLoading(false);
    }
  }, [ghlContactId, tenantFilter, ready]);

  useEffect(() => {
    if (!ghlContactId) {
      setNotes([]);
      return;
    }
    fetchNotes();
  }, [ghlContactId, fetchNotes, refreshKey]);

  return { notes, loading, refetch: fetchNotes };
}
