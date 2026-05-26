import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "@/utils/leadUtils";

interface VoiceBriefingProps {
  briefingText: string;
  deepgramApiKey: string;
  deepgramConnected: boolean;
  voiceWelcome: boolean;
  autoPlay?: boolean;
}

export function VoiceBriefing({ briefingText, deepgramApiKey, deepgramConnected, voiceWelcome, autoPlay }: VoiceBriefingProps) {
  const [playing, setPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const barsRef = useRef<number[]>([0.3, 0.5, 0.7, 0.4, 0.6, 0.8, 0.3, 0.5]);
  const animRef = useRef<number>(0);
  const [bars, setBars] = useState<number[]>([0.3, 0.5, 0.7, 0.4, 0.6, 0.8, 0.3, 0.5]);

  const canSpeak = deepgramConnected && !!deepgramApiKey && voiceWelcome;

  // Animate waveform bars while playing
  useEffect(() => {
    if (!playing) {
      setBars([0.3, 0.5, 0.7, 0.4, 0.6, 0.8, 0.3, 0.5]);
      return;
    }
    let running = true;
    function animate() {
      if (!running) return;
      const newBars = barsRef.current.map(() => 0.2 + Math.random() * 0.8);
      barsRef.current = newBars;
      setBars([...newBars]);
      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [playing]);

  const playAudio = useCallback(async () => {
    if (!canSpeak || !briefingText) return;

    try {
      const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Token " + deepgramApiKey,
        },
        body: JSON.stringify({ text: briefingText }),
      });

      if (!res.ok) throw new Error("TTS failed: " + res.status);

      const blob = await res.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      setAudioReady(true);

      audio.onplay = () => setPlaying(true);
      audio.onended = () => { setPlaying(false); setShowPlayButton(true); };
      audio.onpause = () => setPlaying(false);

      try {
        await audio.play();
      } catch (e: any) {
        if (e.name === "NotAllowedError") {
          setShowPlayButton(true);
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      console.error("Voice briefing error:", e);
      setShowPlayButton(false);
    }
  }, [canSpeak, briefingText, deepgramApiKey]);

  // Auto-play on mount if autoPlay
  useEffect(() => {
    if (autoPlay && canSpeak && briefingText) {
      playAudio();
    }
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, []); // intentionally empty — run once on mount

  const handleManualPlay = () => {
    if (audioRef.current && audioReady) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setShowPlayButton(false);
    } else {
      playAudio();
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
    setShowPlayButton(true);
  };

  if (!canSpeak) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 14px",
      background: COLORS.S2,
      border: "1px solid " + COLORS.B1,
      borderRadius: 10,
      marginBottom: 10,
    }}>
      {playing ? (
        <>
          {/* Waveform bars */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 20 }}>
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: h * 20,
                  background: COLORS.GRN,
                  borderRadius: 2,
                  transition: "height 0.08s ease",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 10, color: COLORS.GRN, fontWeight: 600 }}>Speaking...</span>
          <button
            onClick={handleStop}
            style={{
              background: "transparent",
              border: "1px solid " + COLORS.B2,
              borderRadius: 6,
              padding: "3px 10px",
              color: COLORS.T3,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              marginLeft: "auto",
            }}
          >
            ■ Stop
          </button>
        </>
      ) : (showPlayButton || !autoPlay) ? (
        <>
          <button
            onClick={handleManualPlay}
            style={{
              background: COLORS.GRN + "20",
              border: "1px solid " + COLORS.GRN + "40",
              borderRadius: 6,
              padding: "4px 12px",
              color: COLORS.GRN,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            ▶ Play Briefing
          </button>
          <span style={{ fontSize: 9, color: COLORS.T3 }}>Voice briefing ready</span>
        </>
      ) : null}
    </div>
  );
}
