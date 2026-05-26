import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";

export interface ConversationSummary {
  total_messages: number; // inbound + outbound (last 30d)
  last_message_at: string | null;
  last_message_direction: string | null;
  last_message_body: string | null;
  inbound_count_last_30d: number | null;
  outbound_count_last_30d: number | null;
  total_calls: number | null;
}

export interface OpenTask {
  ghl_task_id: string;
  title: string | null;
  body: string | null;
  due_date: string | null;
  ghl_user_id: string | null;
  ghl_date_added: string | null;
}

export function useLeadDetail(ghlContactId: string | null) {
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [tasks, setTasks] = useState<OpenTask[]>([]);
  const [loading, setLoading] = useState(false);
  const { tenantFilter, ready } = useTenantFilter();

  useEffect(() => {
    if (!ghlContactId) {
      setConversation(null);
      setTasks([]);
      return;
    }
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let convQ: any = supabase
        .from("ghl_conversations")
        .select(
          "last_message_at, last_message_direction, last_message_body, inbound_count_last_30d, outbound_count_last_30d, total_calls"
        )
        .eq("ghl_contact_id", ghlContactId);
      if (tenantFilter) convQ = convQ.eq("tenant_id", tenantFilter);
      let tasksQ: any = supabase
        .from("ghl_tasks")
        .select("ghl_task_id, title, body, due_date, ghl_user_id, ghl_date_added")
        .eq("ghl_contact_id", ghlContactId)
        .eq("completed", false);
      if (tenantFilter) tasksQ = tasksQ.eq("tenant_id", tenantFilter);
      const [{ data }, { data: taskData }] = await Promise.all([
        convQ.order("last_message_at", { ascending: false }).limit(1).maybeSingle(),
        tasksQ.order("due_date", { ascending: true, nullsFirst: false }),
      ]);
      if (cancelled) return;
      if (data) {
        setConversation({
          total_messages:
            (data.inbound_count_last_30d ?? 0) + (data.outbound_count_last_30d ?? 0),
          last_message_at: data.last_message_at,
          last_message_direction: data.last_message_direction,
          last_message_body: data.last_message_body,
          inbound_count_last_30d: data.inbound_count_last_30d,
          outbound_count_last_30d: data.outbound_count_last_30d,
          total_calls: data.total_calls,
        });
      } else {
        setConversation(null);
      }
      setTasks((taskData ?? []) as OpenTask[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ghlContactId, tenantFilter, ready]);

  return { conversation, tasks, loading };
}