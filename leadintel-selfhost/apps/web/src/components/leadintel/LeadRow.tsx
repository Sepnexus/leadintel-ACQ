import { useState, useRef, useCallback } from "react";
import { Pill } from "./Pill";
import { COLORS, urgencyColor, urgencyLabel, stageColor, sourceColor, fmt$ } from "@/utils/leadUtils";
import type { Lead, CallLogEntry, LeadIntelData } from "@/data/leads";
import { ALL_STAGES } from "@/data/leads";

interface LeadRowProps {
  lead: Lead;
  rank: number;
  intel: { urgency: string; reason: string; openingLine: string; callType: string; priority: number } | null;
  expanded: boolean;
  onToggle: () => void;
  isHot: boolean;
  onUpdate: (id: number, field: string, value: string) => void;
  callLog: CallLogEntry[];
  onLogCall: (entry: CallLogEntry) => void;
  isMobile: boolean;
  leadIntel: LeadIntelData | null;
  leadIntelLoading: boolean;
  onRefreshIntel: () => void;
  highlighted?: boolean;
  dimmed?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  deepgramApiKey?: string;
  deepgramConnected?: boolean;
  crmConnected?: boolean;
}

export function LeadRow({
  lead, rank, intel, expanded: isExp, onToggle, isHot, onUpdate,
  callLog: _callLog, onLogCall, isMobile, leadIntel, leadIntelLoading: liLoading,
  onRefreshIntel, highlighted, dimmed, selectMode, selected, onSelect,
  deepgramApiKey, deepgramConnected, crmConnected
}: LeadRowProps) {
  const [flash, setFlash] = useState<string | null>(null);
  const [briefPlaying, setBriefPlaying] = useState(false);
  const briefAudioRef = useRef<HTMLAudioElement | null>(null);
  const briefUrlRef = useRef<string | null>(null);

  function triggerFlash(field: string) {
    setFlash(field);
    setTimeout(() => setFlash(null), 1500);
  }
  function handleFieldChange(field: string, value: string) {
    onUpdate(lead.id, field, value);
    triggerFlash(field);
  }

  const urgency = intel ? intel.urgency : lead.motivation === "urgent" ? "hot" : lead.motivation === "high" ? "warm" : "cold";
  const uc = urgencyColor(urgency);

  const canBriefMe = !!deepgramConnected && !!deepgramApiKey;

  const handleBriefMe = useCallback(async () => {
    if (!canBriefMe || !leadIntel) return;

    // If already have cached audio, replay
    if (briefAudioRef.current && briefUrlRef.current) {
      briefAudioRef.current.currentTime = 0;
      briefAudioRef.current.play();
      setBriefPlaying(true);
      return;
    }

    const script = [
      `Lead brief for ${lead.name}.`,
      leadIntel.sentiment ? `Sentiment: ${leadIntel.sentiment}.` : "",
      leadIntel.summary || "",
      lead.daysSince > 0 ? `Last contact was ${lead.daysSince} days ago.` : "Contacted today.",
      leadIntel.riskFactors?.[0] ? `Top risk: ${leadIntel.riskFactors[0]}.` : "",
      leadIntel.openingLine ? `Opening line: ${leadIntel.openingLine}` : "",
    ].filter(Boolean).join(" ");

    try {
      setBriefPlaying(true);
      const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Token " + deepgramApiKey },
        body: JSON.stringify({ text: script }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      if (briefUrlRef.current) URL.revokeObjectURL(briefUrlRef.current);
      const url = URL.createObjectURL(blob);
      briefUrlRef.current = url;
      const audio = new Audio(url);
      briefAudioRef.current = audio;
      audio.onended = () => setBriefPlaying(false);
      audio.onpause = () => setBriefPlaying(false);
      await audio.play();
    } catch (e) {
      console.error("Brief Me TTS error:", e);
      setBriefPlaying(false);
    }
  }, [canBriefMe, leadIntel, lead, deepgramApiKey]);

  return (
    <div
      style={{
        border: "1px solid " + (highlighted ? COLORS.GRN + "50" : isHot ? COLORS.RED + "40" : isExp ? COLORS.B3 : COLORS.B1),
        borderLeft: "3px solid " + (highlighted ? COLORS.GRN : isHot ? COLORS.RED : urgency === "hot" ? COLORS.RED : urgency === "warm" ? COLORS.AMB : COLORS.B2),
        borderRadius: 12,
        overflow: "hidden",
        background: highlighted ? (isExp ? COLORS.S2 : COLORS.GRN + "05") : isExp ? COLORS.S2 : COLORS.S1,
        marginBottom: 6,
        transition: "all .2s",
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {/* Collapsed row */}
      <div
        onClick={selectMode ? onSelect : onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? (selectMode ? "20px 28px 1fr" : "28px 1fr") : (selectMode ? "20px 36px 1fr auto" : "36px 1fr auto"),
          alignItems: "center",
          gap: isMobile ? 8 : 12,
          padding: isMobile ? "10px 12px" : "10px 16px",
          cursor: "pointer",
        }}
      >
        {selectMode && (
          <div
            style={{
              width: 16, height: 16, borderRadius: 4,
              border: "2px solid " + (selected ? COLORS.GRN : COLORS.B2),
              background: selected ? COLORS.GRN : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            {selected && <span style={{ color: "#000", fontSize: 10, fontWeight: 900 }}>✓</span>}
          </div>
        )}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: uc }} className="font-mono">#{rank}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT }}>{lead.name}</span>
            <Pill label={urgencyLabel(urgency)} color={uc} />
            <Pill label={lead.stage} color={stageColor(lead.stage)} />
            <Pill label={lead.source} color={sourceColor(lead.source)} />
            {isHot && <Pill label="GONE HOT" color={COLORS.RED} />}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.T2, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {intel ? intel.reason : lead.situation.slice(0, 90) + "..."}
          </div>
          {isMobile && (
            <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 10, color: lead.daysSince > 14 ? COLORS.RED : lead.daysSince > 7 ? COLORS.AMB : COLORS.T3 }}>
                {lead.daysSince === 0 ? "Today" : lead.daysSince === 1 ? "Yesterday" : lead.daysSince + "d ago"}
              </span>
              {lead.value > 0 && <span style={{ fontSize: 10, color: COLORS.GRN }}>{fmt$(lead.value)}</span>}
            </div>
          )}
        </div>
        <div style={{ display: isMobile ? "none" : "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: COLORS.T3, marginBottom: 1 }}>Last contact</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: lead.daysSince > 14 ? COLORS.RED : lead.daysSince > 7 ? COLORS.AMB : COLORS.T2 }}>
              {lead.daysSince === 0 ? "Today" : lead.daysSince === 1 ? "Yesterday" : lead.daysSince + "d ago"}
            </div>
          </div>
          {lead.value > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: COLORS.T3, marginBottom: 1 }}>Est. value</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.GRN }}>{fmt$(lead.value)}</div>
            </div>
          )}
          <span style={{ fontSize: 11, color: COLORS.T3 }}>{isExp ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded dossier */}
      {isExp && (
        <div style={{ borderTop: "1px solid " + COLORS.B1 }}>
          {/* Lead Header */}
          <div style={{ padding: isMobile ? "14px 14px 0" : "16px 18px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.TEXT, fontFamily: "'League Spartan', sans-serif" }}>{lead.name}</div>
              <div style={{ fontSize: 13, color: COLORS.T2, marginBottom: 2 }}>{lead.phone}</div>
              <div style={{ fontSize: 11, color: COLORS.T3, marginBottom: 12 }}>{lead.address}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.8, textTransform: "uppercase" }}>Notes</div>
                {flash === "notes" && <span style={{ fontSize: 9.5, color: COLORS.GRN, fontWeight: 600 }}>Saved</span>}
              </div>
              <textarea
                defaultValue={lead.notes || ""}
                rows={2}
                onBlur={(e) => { if (e.target.value !== lead.notes) handleFieldChange("notes", e.target.value); }}
                style={{
                  width: "100%", background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8,
                  color: COLORS.T2, fontSize: 11.5, lineHeight: 1.65, padding: "8px 10px",
                  fontFamily: "inherit", resize: "vertical", minHeight: 48, maxHeight: 120, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
              <div>
                {flash === "stage" && <div style={{ fontSize: 9.5, color: COLORS.GRN, fontWeight: 600, textAlign: "right", marginBottom: 2 }}>Updated</div>}
                <select value={lead.stage} onChange={(e) => handleFieldChange("stage", e.target.value)}
                  style={{ background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 6, color: COLORS.TEXT, fontSize: 11, padding: "5px 8px", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  {ALL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                {flash === "motivation" && <div style={{ fontSize: 9.5, color: COLORS.GRN, fontWeight: 600, textAlign: "right", marginBottom: 2 }}>Updated</div>}
                <div style={{ display: "flex", gap: 4 }}>
                  {(["unknown", "medium", "high", "urgent"] as const).map((m) => {
                    const mc = m === "urgent" ? COLORS.RED : m === "high" ? COLORS.AMB : m === "medium" ? COLORS.BLU : COLORS.T3;
                    const active = lead.motivation === m;
                    return (
                      <button key={m} onClick={() => handleFieldChange("motivation", m)}
                        style={{
                          background: active ? mc + "20" : "transparent", border: "1px solid " + (active ? mc : COLORS.B2),
                          borderRadius: 5, padding: "2px 7px", color: active ? mc : COLORS.T3,
                          fontSize: 9.5, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "all .1s",
                        }}>
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {([["Touches", lead.touches], ["Days/Stage", lead.daysInStage], ["Rep", lead.assignedTo.split(" ")[0]]] as const).map((p) => (
                  <div key={p[0]} style={{ background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 7, padding: "5px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 8.5, color: COLORS.T3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 }}>{p[0]}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.TEXT }} className="font-mono">{p[1]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: isMobile ? "12px 14px 16px" : "14px 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* AI Lead Intelligence */}
            <div style={{ background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.GRN, letterSpacing: 0.8, textTransform: "uppercase" }}>Lead Intelligence</div>
                <button onClick={onRefreshIntel}
                  style={{ background: "transparent", border: "none", color: COLORS.T3, fontSize: 10, cursor: "pointer", fontFamily: "inherit", padding: 0, opacity: 0.7 }}>
                  Refresh Intel
                </button>
              </div>
              {liLoading ? (
                <div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
                    {[95, 80, 65].map((w, i) => (
                      <div key={i} style={{ height: 9, borderRadius: 4, background: COLORS.B2, width: w + "%", animation: "pulse-glow 1.5s ease-in-out " + i * 0.18 + "s infinite" }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.T3, fontStyle: "italic" }}>Analyzing lead...</div>
                </div>
              ) : leadIntel && leadIntel.error ? (
                <div>
                  <div style={{ fontSize: 12, color: COLORS.RED, marginBottom: 8 }}>Could not generate intelligence for this lead.</div>
                  <button onClick={onRefreshIntel}
                    style={{ background: "transparent", border: "1px solid " + COLORS.RED + "40", borderRadius: 6, padding: "4px 10px", color: COLORS.RED, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    Try Again
                  </button>
                </div>
              ) : leadIntel ? (
                <div>
                  <div style={{ fontSize: 13, color: COLORS.TEXT, lineHeight: 1.75, marginBottom: 12 }}>{leadIntel.summary}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    {(() => {
                      const sc = leadIntel.sentiment === "cooperative" || leadIntel.sentiment === "eager"
                        ? COLORS.GRN : leadIntel.sentiment === "hesitant" || leadIntel.sentiment === "stalling"
                          ? COLORS.AMB : leadIntel.sentiment === "distressed" ? COLORS.RED : COLORS.T3;
                      return <Pill label={leadIntel.sentiment || "unknown"} color={sc} />;
                    })()}
                    {(leadIntel.riskFactors || []).map((r, i) => <Pill key={"r" + i} label={r} color={COLORS.RED} small />)}
                    {(leadIntel.leveragePoints || []).map((lp, i) => <Pill key={"l" + i} label={lp} color={COLORS.GRN} small />)}
                  </div>

                  {/* Opening line + Brief Me */}
                  {leadIntel.openingLine && (
                    <div style={{ background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.GRN, letterSpacing: 0.5, textTransform: "uppercase" }}>Opening Line</div>
                        <button
                          onClick={handleBriefMe}
                          disabled={!canBriefMe || briefPlaying}
                          title={!canBriefMe ? "Connect Deepgram in Settings to enable voice" : briefPlaying ? "Playing..." : "Brief Me"}
                          style={{
                            background: "transparent",
                            border: "1px solid " + (canBriefMe ? COLORS.GRN + "50" : COLORS.B2),
                            borderRadius: 6,
                            padding: "3px 10px",
                            color: canBriefMe ? COLORS.GRN : COLORS.T3,
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: canBriefMe && !briefPlaying ? "pointer" : "default",
                            fontFamily: "inherit",
                            opacity: canBriefMe ? 1 : 0.4,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {briefPlaying ? "🔊 Playing..." : "🔈 Brief Me"}
                        </button>
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.TEXT, lineHeight: 1.7, fontStyle: "italic" }}>"{leadIntel.openingLine}"</div>
                    </div>
                  )}

                  {/* Talking points */}
                  {leadIntel.talkingPoints && leadIntel.talkingPoints.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Talking Points</div>
                      {leadIntel.talkingPoints.map((pt, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: COLORS.GRN, flexShrink: 0, marginTop: 5 }} />
                          <span style={{ fontSize: 12, color: COLORS.T2, lineHeight: 1.6 }}>{pt}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommendations */}
                  {leadIntel.recommendations && leadIntel.recommendations.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Recommendations</div>
                      {leadIntel.recommendations.map((rec, i) => {
                        const pc = rec.priority === "now" ? COLORS.RED : rec.priority === "today" ? COLORS.AMB : COLORS.T2;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8, padding: "8px 10px" }}>
                            <Pill label={rec.priority} color={pc} />
                            <Pill label={rec.type} color={COLORS.BLU} small />
                            <span style={{ fontSize: 11.5, color: COLORS.T2, lineHeight: 1.5 }}>{rec.action}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: COLORS.T3, fontStyle: "italic" }}>Loading intelligence...</div>
              )}
            </div>

            {/* Touch History */}
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
                Touch History ({lead.touchHistory.length})
              </div>
              {lead.touchHistory.map((touch, i) => {
                const tc = touch.type.includes("call") ? COLORS.BLU : touch.type.includes("email") ? COLORS.PRP : touch.type.includes("sms") ? COLORS.GRN : COLORS.T3;
                const oc = touch.outcome === "connected" ? COLORS.GRN : touch.outcome === "voicemail" ? COLORS.AMB : COLORS.T3;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: i < lead.touchHistory.length - 1 ? "1px solid " + COLORS.B1 : "none" }}>
                    <div style={{ minWidth: 52, flexShrink: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.T2 }}>{touch.date}</div>
                      <Pill label={touch.outcome} color={oc} small />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                        <Pill label={touch.type} color={tc} small />
                        <span style={{ fontSize: 9.5, color: COLORS.T3 }}>{touch.rep}</span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.T2, lineHeight: 1.55 }}>{touch.summary}</div>
                    </div>
                  </div>
                );
              })}
              {lead.touchHistory.length === 0 && (
                <div style={{ fontSize: 11, color: COLORS.T3, fontStyle: "italic" }}>No touch history yet</div>
              )}
            </div>

            {/* Action Buttons */}
            {!crmConnected && (
              <div style={{ background: COLORS.AMB + "15", border: "1px solid " + COLORS.AMB + "30", borderRadius: 8, padding: "8px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <span style={{ fontSize: 11, color: COLORS.AMB, fontFamily: "'Open Sans', sans-serif" }}>CRM not connected — connect GoHighLevel in Settings to call or message leads directly.</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  if (crmConnected) window.open("tel:" + lead.phone, "_self");
                }}
                disabled={!crmConnected}
                style={{
                  background: crmConnected ? COLORS.GRN : COLORS.B2,
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 18px",
                  color: crmConnected ? "#000" : COLORS.T3,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: crmConnected ? "pointer" : "not-allowed",
                  fontFamily: "'League Spartan', sans-serif",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: crmConnected ? 1 : 0.5,
                }}
                title={crmConnected ? "Call via CRM" : "CRM not connected"}
              >
                📞 Call
              </button>
              <button
                onClick={() => {
                  if (crmConnected) window.open("sms:" + lead.phone, "_self");
                }}
                disabled={!crmConnected}
                style={{
                  background: "transparent",
                  border: "1px solid " + (crmConnected ? COLORS.B2 : COLORS.B1),
                  borderRadius: 8,
                  padding: "8px 18px",
                  color: crmConnected ? COLORS.T2 : COLORS.T3,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: crmConnected ? "pointer" : "not-allowed",
                  fontFamily: "'Open Sans', sans-serif",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: crmConnected ? 1 : 0.5,
                }}
                title={crmConnected ? "SMS via CRM" : "CRM not connected"}
              >
                💬 SMS
              </button>
              <button
                onClick={() => {
                  if (crmConnected) {
                    // Future: deep-link to CRM contact page
                    window.open("#", "_blank");
                  }
                }}
                disabled={!crmConnected}
                style={{
                  background: "transparent",
                  border: "1px solid " + (crmConnected ? COLORS.B2 : COLORS.B1),
                  borderRadius: 8,
                  padding: "8px 18px",
                  color: crmConnected ? COLORS.T2 : COLORS.T3,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: crmConnected ? "pointer" : "not-allowed",
                  fontFamily: "'Open Sans', sans-serif",
                  opacity: crmConnected ? 1 : 0.5,
                }}
                title={crmConnected ? "View in CRM" : "CRM not connected"}
              >
                🔗 View in CRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
