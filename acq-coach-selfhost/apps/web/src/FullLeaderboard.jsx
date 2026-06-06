import { useState } from "react";

// ── Palette (same tokens as ACQCoach / RepView) ───────────────────────────────
const BG     = "#000000";
const S1     = "#0d0d0d";
const S2     = "#141414";
const B1     = "#1c1c1c";
const B3     = "#2a2a2a";
const TEXT   = "#f4f4f4";
const T2     = "#999999";
const T3     = "#777777";
const GREEN  = "#4e7d3d";
const RED    = "#c0392b";
const AMBER  = "#b7860b";
const GOLD   = "#8a6a00";
const SILVER = "#7a8ea0";

// ── Category labels ───────────────────────────────────────────────────────────
const CAT_SHORT = ["Intro","Rapport","Motivation","Timeline","Financial","Offer","Objection","1st No","Close"];
const CAT_FULL  = [
  "Introduction and Positioning",
  "Rapport Building",
  "Motivation Discovery",
  "Timeline Discovery",
  "Financial Discovery",
  "Offer Presentation",
  "Objection Handling",
  "First No Recovery",
  "Next Step Close",
];

// Offsets used to simulate category scores when real data is unavailable
// (matches the CAT_OFFSETS in ACQCoach's repCatScore)
const CAT_OFFSETS = [0.3, -0.4, 0.2, -0.2, 0.5, -0.3, 0.4, -0.5, 0.3];

// ── Helpers ───────────────────────────────────────────────────────────────────
function gc(s)       { return s >= 80 ? GREEN : s >= 65 ? AMBER : RED; }
function dotColor(s) { return s >= 8  ? GREEN : s >= 6  ? AMBER : RED; }

/**
 * Returns a 9-element array of integer category scores (0–10) for a rep.
 *
 * Priority:
 *   1. rep.categoryAverages — [{name, score, status}] from buildDbReps (RepView)
 *   2. Simulation via rep.avg + CAT_OFFSETS (ACQCoach reps / INIT_REPS)
 */
function getRepCatScores(rep) {
  if (rep?.categoryAverages?.length) {
    // Pad to 9 in case a rep has fewer scored categories
    const out = Array(9).fill(0);
    rep.categoryAverages.forEach((c, i) => { if (i < 9) out[i] = Number(c.score) || 0; });
    return out;
  }
  return CAT_OFFSETS.map(o => {
    const raw = (rep?.avg || 0) / 10 + o * (rep?.exp === "new" ? -1 : 1);
    return Math.round(Math.min(10, Math.max(1, raw)));
  });
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ data, width = 70, height = 24 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min   = Math.min(...data) - 2;
  const max   = Math.max(...data) + 2;
  const range = max - min || 1;
  const pts   = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((v - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trend = data[data.length - 1] - data[0];
  const color = trend >= 2 ? GREEN : trend <= -2 ? RED : AMBER;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── FullLeaderboard ───────────────────────────────────────────────────────────
/**
 * Full-featured leaderboard with:
 *   • Category filter dropdown (All + 9 individual categories)
 *   • Time-period pills  (7d / 30d / 90d  — drives sparkline window)
 *   • Sort dropdown      (Overall / Most Improved / Most Calls)
 *   • Table rows with rank badge, initials, overall score, trend/category score,
 *     calls, 9 colour-coded category dots, sparkline
 *   • Click row to expand → full horizontal category-bar breakdown
 *   • Active category filter:  highlighted column header, larger dot,
 *     glow on bar, sort by that category score
 *
 * Props
 * ─────
 * reps          array   rep objects from buildDbReps / ACQCoach buildRep / INIT_REPS
 * currentRepId  any     rep.id to highlight with "YOU" badge (RepView)
 * onSelectRep   fn|null (rep) => void — navigate to rep on click (ACQCoach)
 *                       When null, clicking expands the row instead
 * title         string  section heading (omit or pass "" to hide)
 */
export function FullLeaderboard({
  reps         = [],
  currentRepId = null,
  onSelectRep  = null,
  onDrillDown  = null,   // fn(rep) — opens RepDrillDown drawer (RepView full-screen mode)
  title        = "Team Leaderboard",
}) {
  const [catFilter, setCatFilter] = useState(-1);           // -1 = all categories
  const [period,    setPeriod   ] = useState(30);           // 7 | 30 | 90
  const [sortBy,    setSortBy   ] = useState("overall");    // overall | improvement | calls
  const [expanded,  setExpanded ] = useState(null);         // rep.id | null

  const safeReps = (reps || []).filter(Boolean);

  // ── Sorting ────────────────────────────────────────────────────────────────
  function sortKey(rep) {
    if (sortBy === "calls")       return rep.week  || 0;
    if (sortBy === "improvement") return rep.trend || 0;
    if (catFilter >= 0)           return getRepCatScores(rep)[catFilter] || 0;
    return rep.avg || 0;
  }
  const sorted = safeReps.slice().sort((a, b) => sortKey(b) - sortKey(a));

  const PERIODS = [[7, "7d"], [30, "30d"], [90, "90d"]];
  const SORTS   = [
    ["overall",     "Overall Score"],
    ["improvement", "Most Improved"],
    ["calls",       "Most Calls"],
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Open Sans',sans-serif" }}>

      {/* Header */}
      {title ? (
        <div style={{
          fontSize: 15, fontWeight: 700,
          fontFamily: "'League Spartan',sans-serif",
          letterSpacing: "0.04em", color: TEXT, marginBottom: 14,
        }}>
          {title}
        </div>
      ) : null}

      {/* ── Filter bar ── */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center",
        marginBottom: 14, flexWrap: "wrap",
      }}>
        {/* Category */}
        <select
          value={catFilter}
          onChange={e => { setCatFilter(Number(e.target.value)); setSortBy("overall"); }}
          style={{
            background: S2,
            border: `1px solid ${catFilter >= 0 ? GREEN : B1}`,
            borderRadius: 6, padding: "6px 10px",
            color: catFilter >= 0 ? GREEN : TEXT,
            fontSize: 12, fontWeight: catFilter >= 0 ? 700 : 500,
            outline: "none", cursor: "pointer", minWidth: 175,
          }}
        >
          <option value={-1}>All Categories</option>
          {CAT_FULL.map((c, i) => (
            <option key={i} value={i}>{c}</option>
          ))}
        </select>

        {/* Period pills */}
        <div style={{
          background: S1, border: `1px solid ${B1}`,
          borderRadius: 6, padding: 3, display: "flex", gap: 2,
        }}>
          {PERIODS.map(([p, l]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? S2 : "transparent",
                border: period === p ? `1px solid ${B3}` : "1px solid transparent",
                borderRadius: 4, padding: "4px 10px",
                color: period === p ? TEXT : T3,
                fontSize: 12, fontWeight: period === p ? 700 : 400,
                cursor: "pointer", transition: "all .1s",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            background: S2, border: `1px solid ${B1}`,
            borderRadius: 6, padding: "6px 10px",
            color: TEXT, fontSize: 12,
            outline: "none", cursor: "pointer",
          }}
        >
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {catFilter >= 0 && (
          <button
            onClick={() => setCatFilter(-1)}
            style={{
              background: "transparent", border: "none",
              color: T3, fontSize: 11, cursor: "pointer",
              textDecoration: "underline", padding: "4px 2px",
            }}
          >
            clear filter
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ border: `1px solid ${B1}`, borderRadius: 8, overflow: "hidden", background: BG }}>

        {/* Header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "30px 1fr 58px 68px 42px 98px 72px",
          gap: 8, padding: "8px 16px",
          background: S1, borderBottom: `1px solid ${B1}`,
          fontSize: 10, color: T3,
          textTransform: "uppercase", letterSpacing: "0.10em", fontWeight: 700,
        }}>
          <span>#</span>
          <span>Rep</span>
          <span>Score</span>
          <span style={{ color: catFilter >= 0 ? GREEN : T3, transition: "color .15s" }}>
            {catFilter >= 0 ? CAT_SHORT[catFilter] : "Trend"}
          </span>
          <span>Calls</span>
          <span style={{ color: catFilter >= 0 ? GREEN : T3, transition: "color .15s" }}>
            {catFilter >= 0 ? "9 Skills ●" : "9 Skills"}
          </span>
          <span>{period}d</span>
        </div>

        {/* Data rows */}
        {sorted.map((rep, i) => {
          const isMe     = rep.id === currentRepId;
          const color    = gc(rep.avg);
          const scores   = getRepCatScores(rep);
          const raw30    = rep.history30 || [];
          const raw90    = rep.history90 || raw30;
          const hist     =
            period === 90 ? raw90 :
            period === 7  ? raw30.slice(-7) :
            raw30;
          const isExp    = expanded === rep.id;
          const isLast   = i === sorted.length - 1;
          const rankMedal =
            i === 0 ? GOLD :
            i === 1 ? SILVER :
            i === 2 ? AMBER :
            T3;

          return (
            <div key={rep.id}>
              {/* Main row */}
              <div
                onClick={() => {
                  if (onSelectRep) { onSelectRep(rep); return; }
                  setExpanded(isExp ? null : rep.id);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "30px 1fr 58px 68px 42px 98px 72px",
                  gap: 8, padding: "11px 16px",
                  borderBottom: (!isLast || isExp) ? `1px solid ${B1}` : "none",
                  alignItems: "center",
                  cursor: "pointer",
                  background: isMe ? "#080e08" : BG,
                  borderLeft: `3px solid ${isMe ? GREEN : rep.flagged ? RED : "transparent"}`,
                  transition: "background .12s",
                }}
                onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = S1; }}
                onMouseLeave={e => { e.currentTarget.style.background = isMe ? "#080e08" : BG; }}
              >
                {/* Rank */}
                <div style={{
                  fontSize: 13, fontWeight: 800,
                  fontFamily: "'League Spartan',sans-serif",
                  color: rankMedal, textAlign: "center",
                }}>
                  {i + 1}
                </div>

                {/* Identity */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: S2, border: `1px solid ${B1}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color, flexShrink: 0, letterSpacing: "0.04em",
                  }}>
                    {rep.avatar}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: TEXT,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {rep.name}
                    </div>
                    {rep.role && (
                      <div style={{ fontSize: 10, color: T3, marginTop: 1 }}>{rep.role}</div>
                    )}
                  </div>
                  {isMe && (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      background: GREEN + "22", color: GREEN,
                      border: `1px solid ${GREEN}40`,
                      borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                    }}>
                      YOU
                    </span>
                  )}
                </div>

                {/* Overall score */}
                <div style={{
                  fontSize: 18, fontWeight: 800, color,
                  letterSpacing: "0.04em", fontFamily: "'Open Sans',sans-serif",
                }}>
                  {rep.avg}
                </div>

                {/* Trend OR highlighted category score */}
                {catFilter >= 0 ? (
                  <div style={{
                    fontSize: 16, fontWeight: 800,
                    color: dotColor(scores[catFilter] || 0), letterSpacing: "0.04em",
                  }}>
                    {scores[catFilter]}
                  </div>
                ) : (
                  <div style={{
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                    color: (rep.trend || 0) >= 0 ? GREEN : RED,
                  }}>
                    {(rep.trend || 0) >= 0 ? "+" : ""}{rep.trend || 0}
                  </div>
                )}

                {/* Calls this week */}
                <div style={{ fontSize: 13, fontWeight: 600, color: T2 }}>
                  {rep.week || 0}
                </div>

                {/* 9 category dots */}
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {scores.map((s, ci) => {
                    const dc = dotColor(s);
                    const hl = catFilter === ci;
                    return (
                      <div
                        key={ci}
                        title={`${CAT_FULL[ci]}: ${s}/10`}
                        style={{
                          width:  hl ? 9 : 7,
                          height: hl ? 9 : 7,
                          borderRadius: "50%",
                          background: dc,
                          opacity: hl ? 1 : 0.65,
                          flexShrink: 0,
                          boxShadow: hl ? `0 0 5px ${dc}90` : "none",
                          border:    hl ? `1px solid ${dc}` : "none",
                          transition: "all .15s",
                        }}
                      />
                    );
                  })}
                </div>

                {/* Sparkline */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Sparkline data={hist} width={70} height={24} />
                </div>
              </div>

              {/* ── Expanded breakdown ── */}
              {isExp && (
                <div
                  className="fade"
                  style={{
                    padding: "14px 20px 18px",
                    background: S1,
                    borderBottom: isLast ? "none" : `1px solid ${B1}`,
                    borderLeft: `3px solid ${isMe ? GREEN : "transparent"}`,
                  }}
                >
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: T3,
                    textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12,
                  }}>
                    Category Breakdown — {rep.name}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {CAT_FULL.map((cat, ci) => {
                      const s  = scores[ci];
                      const dc = dotColor(s);
                      const hl = catFilter === ci;
                      return (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            fontSize: 11, width: 145, flexShrink: 0,
                            color: hl ? GREEN : T3,
                            fontWeight: hl ? 700 : 400,
                            transition: "color .15s",
                          }}>
                            {cat}
                          </div>
                          <div style={{
                            flex: 1, height: 5, background: S2,
                            borderRadius: 2, overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${s * 10}%`, height: "100%",
                              background: dc, borderRadius: 2,
                              transition: "width .35s",
                              boxShadow: hl ? `0 0 6px ${dc}70` : "none",
                            }} />
                          </div>
                          <div style={{
                            fontSize: 12, fontWeight: 700, color: dc,
                            width: 22, textAlign: "right", letterSpacing: "0.04em",
                          }}>
                            {s}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* "Full breakdown →" link — only when onDrillDown is wired (RepView) */}
                  {onDrillDown && (
                    <button
                      onClick={e => { e.stopPropagation(); onDrillDown(rep); }}
                      style={{
                        marginTop: 12, background: "transparent",
                        border: `1px solid #2a2a2a`, borderRadius: 5,
                        padding: "5px 12px", color: "#777777",
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                        transition: "color .15s, border-color .15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = GREEN; e.currentTarget.style.borderColor = GREEN; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#777777"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
                    >
                      Full breakdown →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", fontSize: 12, color: T3 }}>
            No rep data yet.
          </div>
        )}
      </div>
    </div>
  );
}
