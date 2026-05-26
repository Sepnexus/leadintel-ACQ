import { COLORS } from "@/utils/leadUtils";
import type { Lead, AIResult } from "@/data/leads";

interface HuddleExportProps {
  result: AIResult;
  leads: Lead[];
  onClose: () => void;
}

export function HuddleExport({ result, leads, onClose }: HuddleExportProps) {
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const ranked = result.rankedLeads.slice(0, 10);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#fff",
      zIndex: 300,
      overflowY: "auto",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => window.print()}
            style={{
              background: "#000",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'League Spartan', sans-serif",
            }}
          >
            Print
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "8px 20px",
              color: "#333",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "'Open Sans', sans-serif",
            }}
          >
            Close
          </button>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#000", marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>
          Daily Huddle — {dateStr}
        </h1>
        <div style={{ fontSize: 14, color: "#666", marginBottom: 24, fontFamily: "'Open Sans', sans-serif" }}>
          Pipeline Score: {result.pipelineHealth.score}/100 ({result.pipelineHealth.grade})
        </div>

        {/* Critical Alert */}
        {result.dailyBriefing?.criticalAlert && (
          <div style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            color: "#dc2626",
            fontFamily: "'Open Sans', sans-serif",
          }}>
            ⚠️ {result.dailyBriefing.criticalAlert}
          </div>
        )}

        {/* Briefing */}
        {result.dailyBriefing && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, color: "#000", fontWeight: 600, marginBottom: 8, fontFamily: "'Open Sans', sans-serif" }}>
              {result.dailyBriefing.greeting}
            </div>
            {result.dailyBriefing.bullets?.map((b, i) => (
              <div key={i} style={{ fontSize: 13, color: "#333", marginBottom: 4, fontFamily: "'Open Sans', sans-serif" }}>• {b}</div>
            ))}
          </div>
        )}

        {/* Top 10 Leads */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#000", marginBottom: 12, fontFamily: "'League Spartan', sans-serif" }}>
          Top 10 Leads
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Open Sans', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #000" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>#</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Name</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Stage</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Source</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Reason</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Rep</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const lead = leads.find((l) => l.id === r.id);
              if (!lead) return null;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px", fontWeight: 700, fontFamily: "'League Spartan', sans-serif" }}>{r.priority}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{lead.name}</td>
                  <td style={{ padding: "8px" }}>{lead.stage}</td>
                  <td style={{ padding: "8px" }}>{lead.source}</td>
                  <td style={{ padding: "8px" }}>
                    {r.reason}
                    {r.openingLine && (
                      <div style={{ fontStyle: "italic", color: "#666", marginTop: 2 }}>"{r.openingLine}"</div>
                    )}
                  </td>
                  <td style={{ padding: "8px" }}>{lead.assignedTo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 11, color: "#999", fontFamily: "'Open Sans', sans-serif" }}>
          Generated by Lead Intel | Closer Control
        </div>
      </div>
    </div>
  );
}
