import { useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { useContactNotes } from "@/hooks/useContactNotes";

interface Props {
  ghlContactId: string | null;
  refreshKey?: string | null;
}

const MAX_BODY_CHARS = 300;

function formatNoteDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  color: COLORS.T3,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  marginBottom: 8,
};

export function CallNotesCard({ ghlContactId, refreshKey }: Props) {
  const { notes, loading } = useContactNotes(ghlContactId, refreshKey);
  const [expandedAll, setExpandedAll] = useState(false);
  const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({});

  const visible = expandedAll ? notes : notes.slice(0, 3);
  const hiddenCount = notes.length - 3;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={SECTION_LABEL_STYLE}>Call notes</div>
      <div
        style={{
          background: COLORS.S1,
          border: "1px solid " + COLORS.B1,
          borderRadius: 10,
          padding: notes.length === 0 || loading ? "12px 14px" : "4px 0",
        }}
      >
        {loading && notes.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.T3, fontStyle: "italic" }}>
            Loading notes…
          </div>
        ) : notes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: COLORS.T3 }}>No call notes yet</div>
        ) : (
          <>
            {visible.map((n, i) => (
              <NoteRow
                key={n.ghl_note_id}
                body={n.body_text}
                dateLabel={formatNoteDate(n.date_added)}
                isLast={i === visible.length - 1 && hiddenCount <= 0}
                expanded={!!expandedBodies[n.ghl_note_id]}
                onToggleBody={() =>
                  setExpandedBodies((s) => ({ ...s, [n.ghl_note_id]: !s[n.ghl_note_id] }))
                }
              />
            ))}
            {hiddenCount > 0 && (
              <div
                style={{
                  borderTop: "1px solid " + COLORS.B1,
                  padding: "8px 14px",
                  textAlign: "center",
                }}
              >
                <button
                  onClick={() => setExpandedAll((v) => !v)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: COLORS.GRN,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: 0,
                    letterSpacing: 0.3,
                  }}
                >
                  {expandedAll ? "Show fewer" : `Show ${hiddenCount} more`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NoteRow({
  body,
  dateLabel,
  isLast,
  expanded,
  onToggleBody,
}: {
  body: string;
  dateLabel: string;
  isLast: boolean;
  expanded: boolean;
  onToggleBody: () => void;
}) {
  const isLong = body.length > MAX_BODY_CHARS;
  const display = !expanded && isLong ? body.slice(0, MAX_BODY_CHARS).trimEnd() + "…" : body;

  // Highlight AI LEAD SCORE lines
  const lines = display.split(/\r?\n/);

  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: isLast ? "none" : "1px solid " + COLORS.B1,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: COLORS.T3,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {dateLabel}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: COLORS.TEXT,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {lines.map((line, i) => {
          const isScore = /AI LEAD SCORE:/i.test(line);
          if (isScore) {
            return (
              <div
                key={i}
                style={{
                  background: COLORS.GRN + "1A",
                  borderLeft: "2px solid " + COLORS.GRN,
                  padding: "3px 8px",
                  margin: "3px 0",
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                {line}
              </div>
            );
          }
          return <div key={i}>{line || "\u00A0"}</div>;
        })}
        {isLong && (
          <button
            onClick={onToggleBody}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.BLU,
              fontSize: 11.5,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: 0,
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    </div>
  );
}
