import { useState } from "react";
import { COLORS } from "@/utils/leadUtils";
import { useGhlUsers, displayName } from "@/hooks/useGhlUsers";
import type { OpenTask } from "@/hooks/useLeadDetail";

interface Props {
  tasks: OpenTask[];
}

function dueLabel(due: string | null): { text: string; color: string } {
  if (!due) return { text: "No due date", color: COLORS.T3 };
  const ms = new Date(due).getTime();
  const now = Date.now();
  const diffDays = Math.floor((ms - now) / 86_400_000);
  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, color: COLORS.RED };
  if (diffDays === 0) return { text: "Due today", color: COLORS.AMB };
  if (diffDays === 1) return { text: "Due tomorrow", color: COLORS.T2 };
  if (diffDays < 14) return { text: `Due in ${diffDays}d`, color: COLORS.T2 };
  if (diffDays < 60) return { text: `Due in ${Math.round(diffDays / 7)}w`, color: COLORS.T2 };
  return { text: `Due in ${Math.round(diffDays / 30)}mo`, color: COLORS.T3 };
}

function statusDot(due: string | null): string {
  if (!due) return COLORS.T3;
  const diffDays = Math.floor((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) return COLORS.RED;
  if (diffDays === 0) return COLORS.AMB;
  return COLORS.T3;
}

export function OpenTasksCard({ tasks }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { userMap } = useGhlUsers();
  if (!tasks || tasks.length === 0) return null;

  const visible = expanded ? tasks : tasks.slice(0, 5);
  const remaining = tasks.length - visible.length;

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
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>Open tasks</span>
        <span style={{ color: COLORS.T2, fontWeight: 500, letterSpacing: 0 }}>
          ({tasks.length})
        </span>
      </div>
      <div
        style={{
          background: COLORS.S1,
          border: "1px solid " + COLORS.B1,
          borderRadius: 10,
          padding: "4px 0",
        }}
      >
        {visible.map((t, idx) => {
          const due = dueLabel(t.due_date);
          const dot = statusDot(t.due_date);
          const user = t.ghl_user_id ? userMap.get(t.ghl_user_id) : null;
          const repName = user ? displayName(user) : "Unassigned";
          const title =
            (t.title && t.title.trim()) ||
            (t.body ? t.body.trim().slice(0, 60) : "(untitled task)");
          const showBody = t.body && t.title && t.body.trim() !== t.title.trim();
          return (
            <div
              key={t.ghl_task_id}
              style={{
                display: "grid",
                gridTemplateColumns: "10px 1fr auto",
                gap: 10,
                padding: "10px 14px",
                alignItems: "start",
                borderTop: idx === 0 ? "none" : "1px solid " + COLORS.B1,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dot,
                  marginTop: 5,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: COLORS.TEXT,
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                  }}
                >
                  {title}
                </div>
                <div style={{ fontSize: 11, color: due.color, marginTop: 2 }}>
                  {due.text}
                </div>
                {showBody && (
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.T2,
                      marginTop: 4,
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {t.body!.slice(0, 200)}
                    {t.body!.length > 200 ? "…" : ""}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.T3,
                  whiteSpace: "nowrap",
                  marginTop: 1,
                }}
              >
                {repName}
              </div>
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.T2,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "6px 0 0 4px",
          }}
        >
          Show {remaining} more
        </button>
      )}
    </div>
  );
}