import { useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import type { ConversationSummary as ConvSummary } from "@/hooks/useLeadDetail";
import { relWhenIso } from "./leadDetailUtils";
import { MessageThread } from "./MessageThread";

interface Props {
  conversation: ConvSummary | null;
  loading: boolean;
  ghlContactId: string | null;
}

export function ConversationSummary({ conversation, loading, ghlContactId }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: COLORS.T3,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Conversation summary
      </div>
      <div
        style={{
          background: COLORS.S1,
          border: "1px solid " + COLORS.B1,
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12.5,
          color: COLORS.T2,
          lineHeight: 1.6,
        }}
      >
        {loading ? (
          <span style={{ color: COLORS.T3, fontStyle: "italic" }}>Loading…</span>
        ) : !conversation ? (
          <span style={{ color: COLORS.T3 }}>No conversation history.</span>
        ) : (
          <>
            <div>
              <strong style={{ color: COLORS.TEXT }}>{conversation.total_messages}</strong>{" "}
              messages in last 30 days
              {conversation.total_calls != null && conversation.total_calls > 0 && (
                <> · {conversation.total_calls} calls total</>
              )}
            </div>
            {conversation.last_message_at && (
              <div style={{ marginTop: 4 }}>
                Last message {relWhenIso(conversation.last_message_at)}
                {conversation.last_message_direction && (
                  <>
                    {" "}
                    ·{" "}
                    <span style={{ color: COLORS.T3, textTransform: "capitalize" }}>
                      {conversation.last_message_direction}
                    </span>
                  </>
                )}
              </div>
            )}
            {ghlContactId && (
              <>
                <MessageThread ghlContactId={ghlContactId} expanded={expanded} />
                <button
                  onClick={() => setExpanded((v) => !v)}
                  style={{
                    marginTop: 8,
                    background: "transparent",
                    border: "1px solid " + COLORS.B2,
                    borderRadius: 6,
                    padding: "3px 10px",
                    color: COLORS.T2,
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {expanded ? "Hide full thread" : "Show full thread"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}