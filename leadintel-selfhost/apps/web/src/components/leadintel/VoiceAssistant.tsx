import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import { VOICE_ASSISTANT_PROMPT } from "@/data/prompts";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { handleAiResponseError } from "@/lib/aiErrorToast";

interface VoiceAssistantProps {
  deepgramApiKey: string;
  deepgramConnected: boolean;
  leads: any[];
  rankedTopLeads?: { lead: any; tier: string; rationale: string }[];
  onResponse?: (response: any) => void;
  isMobile: boolean;
  onHighlightLeads?: (ids: number[]) => void;
  onExpandLead?: (id: number) => void;
  onChangeTab?: (tab: string) => void;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// Check for browser SpeechRecognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function VoiceAssistant({
  deepgramApiKey, deepgramConnected, leads, rankedTopLeads, onResponse, isMobile,
  onHighlightLeads, onExpandLead, onChangeTab
}: VoiceAssistantProps) {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [spacebarHintShown, setSpacebarHintShown] = useState(() => {
    try { return localStorage.getItem("leadIntel_spacebarHintShown") === "true"; } catch { return false; }
  });
  const [showSpaceHint, setShowSpaceHint] = useState(false);
  const conversationRef = useRef<ConversationMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceDownRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  const useDeepgram = deepgramConnected && !!deepgramApiKey;
  const hasBrowserSTT = !!SpeechRecognition;
  const canVoice = useDeepgram || hasBrowserSTT;

  // Show spacebar hint on first use
  useEffect(() => {
    if (canVoice && !spacebarHintShown) {
      setShowSpaceHint(true);
      const timer = setTimeout(() => {
        setShowSpaceHint(false);
        setSpacebarHintShown(true);
        try { localStorage.setItem("leadIntel_spacebarHintShown", "true"); } catch {}
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [canVoice, spacebarHintShown]);

  // Spacebar hold to record
  useEffect(() => {
    if (!canVoice) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !spaceDownRef.current && !e.repeat && !(e.target as HTMLElement)?.matches?.("input,textarea,select,[contenteditable]")) {
        e.preventDefault();
        spaceDownRef.current = true;
        spaceHoldRef.current = setTimeout(() => {
          startRecording();
        }, 500);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && spaceDownRef.current) {
        spaceDownRef.current = false;
        if (spaceHoldRef.current) clearTimeout(spaceHoldRef.current);
        if (recording) stopRecording();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [canVoice, recording]);

  // --- Browser SpeechRecognition fallback ---
  const startBrowserSTT = useCallback(() => {
    if (!SpeechRecognition || recording) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalText = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += (finalText ? " " : "") + t;
          setTranscript(finalText);
          setInterimTranscript("");
        } else {
          interim += t;
        }
      }
      if (interim) setInterimTranscript(interim);
    };

    recognition.onerror = (e: any) => {
      console.error("SpeechRecognition error:", e.error);
      stopRecording();
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognition.start();
    setRecording(true);
    setTranscript("");
    setInterimTranscript("");
  }, [recording]);

  // --- Deepgram recording ---
  const startDeepgramSTT = useCallback(async () => {
    if (!useDeepgram || recording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket(
        "wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true",
        ["token", deepgramApiKey]
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setRecording(true);
        setTranscript("");
        setInterimTranscript("");

        const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };

        mediaRecorder.start(250);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const result = data?.channel?.alternatives?.[0];
        if (!result) return;

        const text = result.transcript || "";
        const isFinal = data.is_final;

        if (isFinal && text) {
          setTranscript((prev) => (prev ? prev + " " + text : text));
          setInterimTranscript("");
        } else if (text) {
          setInterimTranscript(text);
        }
      };

      ws.onerror = () => {
        console.error("Deepgram WebSocket error");
        stopRecording();
      };

      ws.onclose = () => {
        setRecording(false);
      };
    } catch (e) {
      console.error("Microphone access denied:", e);
    }
  }, [useDeepgram, recording, deepgramApiKey]);

  const startRecording = useCallback(() => {
    if (useDeepgram) {
      startDeepgramSTT();
    } else if (hasBrowserSTT) {
      startBrowserSTT();
    }
  }, [useDeepgram, hasBrowserSTT, startDeepgramSTT, startBrowserSTT]);

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Stop browser STT
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    // Stop Deepgram
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    setRecording(false);
  }, []);

  // Send transcript to AI when recording stops with final text
  useEffect(() => {
    if (!recording && transcript && !aiLoading) {
      sendToAI(transcript);
    }
  }, [recording, transcript]);

  const sendToAI = async (query: string) => {
    setAiLoading(true);
    try {
      const context = leads.map((l) => `ID:${l.id} ${l.name} - ${l.stage} - ${l.source} - ${l.situation} - Days since: ${l.daysSince} - Rep: ${l.assignedTo}`).join("\n");

      const rankedBlock = rankedTopLeads && rankedTopLeads.length > 0
        ? "AUTHORITATIVE TODAY RANKING (use this exact order for any question about priority, who to call first, hottest lead, #1, or top N — do NOT re-rank):\n" +
          rankedTopLeads.map((r, i) =>
            `#${i + 1} ID:${r.lead.id} ${r.lead.name} — tier:${r.tier} — disposition:${r.lead.sellerDisposition ?? "n/a"} — ${r.rationale}`
          ).join("\n") + "\n\n"
        : "";

      conversationRef.current.push({ role: "user", content: query });

      if (conversationRef.current.length > 12) {
        conversationRef.current = conversationRef.current.slice(-12);
      }

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          system: VOICE_ASSISTANT_PROMPT + "\n\n" + rankedBlock + "PIPELINE DATA:\n" + context,
          messages: conversationRef.current,
          max_tokens: 2000,
          tenant_id: tenantId,
          caller_hint: "voice_assistant",
        },
      });
      if (error) throw error;
      if (handleAiResponseError(data as any)) { setAiResponse((data as any)?.error || "AI error"); return; }
      const text = (data?.text || "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

      try {
        const parsed = JSON.parse(text);
        const spoken = parsed.spokenResponse || text;
        setAiResponse(spoken);

        conversationRef.current.push({ role: "assistant", content: spoken });

        if (parsed.action) {
          const { type, payload } = parsed.action;
          if (type === "expandLead" && payload?.leadId && onExpandLead) {
            onExpandLead(payload.leadId);
          } else if (type === "changeTab" && payload?.tab && onChangeTab) {
            onChangeTab(payload.tab);
          } else if (type === "filter" && payload?.tabSwitch && onChangeTab) {
            onChangeTab(payload.tabSwitch);
          } else if (type === "showMultiple" && payload?.leadIds && onHighlightLeads) {
            onHighlightLeads(payload.leadIds);
          }
        }

        onResponse?.(parsed);
      } catch {
        setAiResponse(text);
        conversationRef.current.push({ role: "assistant", content: text });
        onResponse?.(text);
      }
    } catch (e: any) {
      const errMsg = "Sorry, I couldn't process that. " + (e.message || "");
      setAiResponse(errMsg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    setTranscript(textInput.trim());
    setTextInput("");
    sendToAI(textInput.trim());
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopRecording();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  return (
    <div style={{
      background: COLORS.S1,
      border: "1px solid " + COLORS.B1,
      borderRadius: 12,
      padding: isMobile ? "10px 12px" : "12px 16px",
      marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: transcript || aiResponse ? 10 : 0 }}>
        {canVoice ? (
          <div style={{ position: "relative" }}>
            <button
              onClick={recording ? stopRecording : startRecording}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: "none",
                background: recording ? COLORS.RED : COLORS.GRN + "20",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .15s", animation: recording ? "pulse-glow 1s infinite" : "none", flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 16, color: recording ? "#fff" : COLORS.GRN }}>
                {recording ? "⏹" : "🎤"}
              </span>
            </button>
            {showSpaceHint && (
              <div style={{
                position: "absolute",
                top: -30,
                left: "50%",
                transform: "translateX(-50%)",
                background: COLORS.S3,
                border: "1px solid " + COLORS.B2,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 9,
                color: COLORS.T2,
                whiteSpace: "nowrap",
                zIndex: 10,
                animation: "fadeIn 0.3s ease-out",
              }}>
                Hold space to talk
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowInput(!showInput)}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "1px solid " + COLORS.B2,
              background: COLORS.S2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 14, color: COLORS.T3 }}>💬</span>
          </button>
        )}

        <div style={{ flex: 1 }}>
          {recording ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.RED, animation: "pulse-glow 1s infinite" }} />
              <span style={{ fontSize: 11, color: COLORS.RED, fontWeight: 600 }}>Listening...</span>
              {interimTranscript && (
                <span style={{ fontSize: 11, color: COLORS.T3, fontStyle: "italic" }}>{interimTranscript}</span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 10, color: COLORS.T3 }}>
              {canVoice ? "Click mic or hold Space to ask a question" : "Type a question about your pipeline"}
            </span>
          )}
        </div>
      </div>

      {(!canVoice || showInput) && !recording && (
        <form onSubmit={handleTextSubmit} style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Ask about your pipeline..."
            style={{
              flex: 1, background: COLORS.S2, border: "1px solid " + COLORS.B2, borderRadius: 8,
              padding: "8px 12px", color: COLORS.TEXT, fontSize: 11, fontFamily: "inherit", outline: "none",
            }}
          />
          <button type="submit" disabled={aiLoading}
            style={{
              background: COLORS.GRN, border: "none", borderRadius: 8, padding: "8px 16px",
              color: "#000", fontSize: 11, fontWeight: 700, cursor: aiLoading ? "default" : "pointer",
              fontFamily: "inherit", opacity: aiLoading ? 0.5 : 1,
            }}>
            {aiLoading ? "..." : "Ask"}
          </button>
        </form>
      )}

      {transcript && !recording && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.S2, borderRadius: 8, border: "1px solid " + COLORS.B1 }}>
          <div style={{ fontSize: 9, color: COLORS.T3, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>You said:</div>
          <div style={{ fontSize: 11, color: COLORS.TEXT, lineHeight: 1.5 }}>{transcript}</div>
        </div>
      )}

      {aiLoading && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.GRN + "08", borderRadius: 8, border: "1px solid " + COLORS.GRN + "20" }}>
          <span style={{ fontSize: 11, color: COLORS.GRN }}>Thinking...</span>
        </div>
      )}
      {aiResponse && !aiLoading && (pinned || transcript) && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.GRN + "08", borderRadius: 8, border: "1px solid " + COLORS.GRN + "20" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 9, color: COLORS.GRN, fontWeight: 600, textTransform: "uppercase" }}>Lead Intel AI:</div>
            <button
              onClick={() => setPinned(!pinned)}
              title={pinned ? "Unpin response" : "Pin response"}
              style={{
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
                color: pinned ? COLORS.GRN : COLORS.T3, fontSize: 12,
              }}
            >
              📌
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.TEXT, lineHeight: 1.6 }}>{aiResponse}</div>
        </div>
      )}
    </div>
  );
}
