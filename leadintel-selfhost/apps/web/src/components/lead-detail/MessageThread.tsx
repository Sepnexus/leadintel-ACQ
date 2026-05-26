import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { COLORS } from "@/utils/leadUtils";
import { useTenantFilter } from "@/hooks/useTenantFilter";

interface Msg {
  ghl_message_id: string;
  date_added: string;
  direction: string;
  body: string | null;
  message_type: string;
}

interface Props {
  ghlContactId: string;
  expanded: boolean;
}

function fmtTs(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}

const PAGE_SIZE = 200;

export function MessageThread({ ghlContactId, expanded }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { tenantFilter, ready } = useTenantFilter();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    (async () => {
      const limit = expanded ? PAGE_SIZE : 5;
      let q: any = supabase
        .from("ghl_messages")
        .select("ghl_message_id, date_added, direction, body, message_type")
        .eq("ghl_contact_id", ghlContactId);
      if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
      const { data } = await q
        .order("date_added", { ascending: false })
        .limit(limit + 1);
      if (cancelled) return;
      const arr = (data ?? []) as Msg[];
      setHasMore(expanded && arr.length > limit);
      setMessages(arr.slice(0, limit).reverse()); // chronological
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ghlContactId, expanded, tenantFilter, ready]);

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingMore(true);
    const oldest = messages[0].date_added;
    let q: any = supabase
      .from("ghl_messages")
      .select("ghl_message_id, date_added, direction, body, message_type")
      .eq("ghl_contact_id", ghlContactId)
      .lt("date_added", oldest);
    if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
    const { data } = await q
      .order("date_added", { ascending: false })
      .limit(PAGE_SIZE + 1);
    const arr = (data ?? []) as Msg[];
    setHasMore(arr.length > PAGE_SIZE);
    setMessages([...arr.slice(0, PAGE_SIZE).reverse(), ...messages]);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: COLORS.T3, fontStyle: "italic", marginTop: 8 }}>
        Loading messages…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div style={{ fontSize: 12, color: COLORS.T3, marginTop: 8 }}>
        No messages cached yet.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxHeight: expanded ? 360 : undefined,
        overflowY: expanded ? "auto" : undefined,
        paddingRight: expanded ? 4 : 0,
      }}
    >
      {expanded && hasMore && (
        <button
          onClick={loadOlder}
          disabled={loadingMore}
          style={{
            background: "transparent",
            border: "1px solid " + COLORS.B2,
            color: COLORS.T2,
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            cursor: loadingMore ? "default" : "pointer",
            alignSelf: "flex-start",
            marginBottom: 4,
          }}
        >
          {loadingMore ? "Loading…" : "Load older"}
        </button>
      )}
      {messages.map((m) => {
        const inbound = m.direction === "inbound";
        return (
          <div
            key={m.ghl_message_id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 12.5,
              lineHeight: 1.45,
            }}
          >
            <span
              style={{
                color: inbound ? COLORS.GRN : COLORS.T3,
                fontWeight: 700,
                flexShrink: 0,
                width: 14,
                textAlign: "center",
              }}
              title={inbound ? "Inbound" : "Outbound"}
            >
              {inbound ? "←" : "→"}
            </span>
            <span style={{ color: COLORS.T3, fontSize: 11, flexShrink: 0, width: 56 }}>
              {fmtTs(m.date_added)}
            </span>
            <span style={{ color: COLORS.T2, flex: 1, wordBreak: "break-word" }}>
              {truncate(m.body || "", expanded ? 1200 : 200)}
            </span>
          </div>
        );
      })}
    </div>
  );
}