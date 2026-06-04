/**
 * AppSwitcher — floating chip in the top-right that lets the user jump to
 * the sibling app or back to the platform launcher.
 *
 * Reads three env vars (all VITE_*, baked at build time):
 *   VITE_OTHER_APP_URL   — e.g. http://localhost:3000
 *   VITE_OTHER_APP_NAME  — e.g. "ACQ Coach"
 *   VITE_LAUNCHER_URL    — e.g. http://localhost:8080
 *
 * If none are set, the component renders nothing.
 * Phase 2 (merge): replace this with a real client-side route switcher.
 */
import { useState } from "react";

const OTHER_APP_URL =  import.meta.env.VITE_OTHER_APP_URL  as string | undefined;
const OTHER_APP_NAME = (import.meta.env.VITE_OTHER_APP_NAME as string | undefined) ?? "Other App";
const LAUNCHER_URL =   import.meta.env.VITE_LAUNCHER_URL   as string | undefined;

export function AppSwitcher() {
  const [open, setOpen] = useState(false);

  if (!OTHER_APP_URL && !LAUNCHER_URL) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        title="Switch app"
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          color: "#222",
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 10px",
          borderRadius: 999,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#00d4ff",
            display: "inline-block",
          }}
        />
        Lead Intel
        <span style={{ opacity: 0.5, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            background: "white",
            color: "#222",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 10,
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            padding: 6,
            fontSize: 13,
          }}
          onMouseLeave={() => setOpen(false)}
        >
          {OTHER_APP_URL && (
            <a
              href={OTHER_APP_URL}
              style={{
                display: "block",
                padding: "8px 10px",
                borderRadius: 6,
                color: "#222",
                textDecoration: "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ↗ Switch to {OTHER_APP_NAME}
            </a>
          )}
          {LAUNCHER_URL && (
            <a
              href={LAUNCHER_URL}
              style={{
                display: "block",
                padding: "8px 10px",
                borderRadius: 6,
                color: "#222",
                textDecoration: "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ⌂ Platform launcher
            </a>
          )}
        </div>
      )}
    </div>
  );
}
