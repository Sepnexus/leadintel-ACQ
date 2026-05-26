import { COLORS } from "@/utils/leadUtils";
import type { DayBriefing } from "@/hooks/useDayBriefing";
import type { Lead } from "@/data/leads";

interface Props {
  briefing: DayBriefing;
  generatedAt: string | null;
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return "just now";
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function urgencyDot(u: string): string {
  if (u === "act_now") return COLORS.RED;
  if (u === "important") return COLORS.AMB;
  return COLORS.T3;
}

function findLead(leads: Lead[], name: string): Lead | null {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  return (
    leads.find((l) => (l.firstName ?? "").toLowerCase() === target) ??
    leads.find((l) => (l.name ?? "").toLowerCase() === target) ??
    leads.find((l) => (l.name ?? "").toLowerCase().startsWith(target)) ??
    null
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: COLORS.T2,
  letterSpacing: 1,
  textTransform: "uppercase",
  marginBottom: 8,
};

export function FullBriefingPanel({ briefing, generatedAt, leads, onSelectLead, onRegenerate, regenerating }: Props) {
  const isFallback = briefing.model === "rule-based-fallback";

  // Drop any AI-emitted entries whose lead_id doesn't match a real top-lead in the current set.
  // This silently filters hallucinations rather than rendering invented leads.
  const validIds = new Set(
    leads.map((l) => l.ghlContactId).filter((x): x is string => !!x),
  );
  const hasIds = validIds.size > 0;

  const filteredCallouts = hasIds
    ? briefing.top_callouts.filter((c) => !!c.lead_id && validIds.has(c.lead_id))
    : briefing.top_callouts;
  const filteredStartOrder = hasIds
    ? briefing.start_order.filter((s) => !!s.lead_id && validIds.has(s.lead_id))
    : briefing.start_order;
  const filteredThemes = hasIds
    ? briefing.themes.filter((t) => {
        if (!t.lead_ids) return false; // require explicit cross-lead evidence
        return t.lead_ids.length >= 2 && t.lead_ids.every((id) => validIds.has(id));
      })
    : briefing.themes;

  const noCallouts = filteredCallouts.length === 0 && filteredStartOrder.length === 0;
  const empty =
    filteredCallouts.length === 0 &&
    filteredThemes.length === 0 &&
    filteredStartOrder.length === 0 &&
    briefing.watch_for.length === 0;

  const clickable = (name: string) => {
    const lead = findLead(leads, name);
    if (lead) onSelectLead(lead);
  };

  return (
    <div
      style={{
        marginTop: 12,
        background: COLORS.S2,
        border: "1px solid " + COLORS.B1,
        borderRadius: 12,
        padding: "16px 20px",
        animation: "fade-in 0.25s ease-out",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.TEXT, lineHeight: 1.45, marginBottom: 14 }}>
        {briefing.headline}
      </div>

      {empty && (
        <div style={{ fontSize: 12, color: COLORS.T3, fontStyle: "italic", marginBottom: 8 }}>
          No specific patterns detected today — leads ranked by priority score.
        </div>
      )}

      {!empty && noCallouts && (
        <div style={{ fontSize: 12, color: COLORS.T3, fontStyle: "italic", marginBottom: 12 }}>
          No specific callouts today — see prioritized list below.
        </div>
      )}

      {filteredCallouts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeader}>Top callouts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredCallouts.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: urgencyDot(c.urgency),
                  marginTop: 6, flexShrink: 0,
                }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span
                    onClick={() => clickable(c.lead_name)}
                    style={{ fontWeight: 600, color: COLORS.TEXT, cursor: "pointer", fontSize: 13 }}
                  >
                    {c.lead_name}
                  </span>
                  <span style={{ color: COLORS.T2, fontSize: 13, marginLeft: 8 }}>{c.callout}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredThemes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeader}>Themes today</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredThemes.map((t, i) => (
              <div key={i}>
                <div style={{ fontWeight: 600, color: COLORS.TEXT, fontSize: 13 }}>{t.theme}</div>
                <div style={{ color: COLORS.T2, fontSize: 12, marginTop: 2 }}>{t.evidence}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredStartOrder.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeader}>Recommended start order</div>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredStartOrder.map((s, i) => (
              <li key={i} style={{ color: COLORS.T2, fontSize: 13 }}>
                <span
                  onClick={() => clickable(s.lead_name)}
                  style={{ fontWeight: 600, color: COLORS.TEXT, cursor: "pointer" }}
                >
                  {s.lead_name}
                </span>
                <div style={{ color: COLORS.T2, fontSize: 12, marginTop: 2 }}>{s.reason}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {briefing.watch_for.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeader}>Watch for</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {briefing.watch_for.map((w, i) => (
              <span
                key={i}
                style={{
                  background: COLORS.S3,
                  border: "1px solid " + COLORS.B2,
                  borderRadius: 6,
                  padding: "4px 10px",
                  color: COLORS.T2,
                  fontSize: 11.5,
                }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 8, paddingTop: 10, borderTop: "1px solid " + COLORS.B1,
        fontSize: 10.5, color: COLORS.T3,
      }}>
        <div>
          Generated {relTime(generatedAt)} · {briefing.model ?? "ai"}
          {isFallback && " · Rule-based — AI analysis unavailable"}
        </div>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          style={{
            background: "transparent", border: "none", color: COLORS.GRN,
            fontSize: 10.5, cursor: regenerating ? "default" : "pointer",
            fontFamily: "inherit", padding: 0, opacity: regenerating ? 0.5 : 1,
          }}
        >
          ↻ {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
}