import { useState, useEffect } from "react";
import { COLORS, healthColor } from "@/utils/leadUtils";

interface HealthRingProps {
  score: number;
  size?: number;
}

export function HealthRing({ score, size = 100 }: HealthRingProps) {
  const [v, setV] = useState(0);

  useEffect(() => {
    let cur = 0;
    let raf: number;
    const t = setTimeout(() => {
      function step() {
        cur = Math.min(cur + 1.5, score);
        setV(Math.round(cur));
        if (cur < score) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
    }, 300);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [score]);

  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const color = healthColor(score);
  const grade = score >= 80 ? "A" : score >= 68 ? "B" : score >= 55 ? "C" : score >= 42 ? "D" : "F";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS.B2} strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.04s linear" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: size * 0.26, fontWeight: 900, color, lineHeight: 1 }} className="font-mono">
          {v}
        </div>
        <div style={{ fontSize: size * 0.12, fontWeight: 700, color }}>{grade}</div>
      </div>
    </div>
  );
}
