// Tiny toast notification system for the admin UI.
//
// Usage:
//   import { useToast } from "./Toast";
//   const toast = useToast();
//   toast.success("ACQ disabled for SHC Homes");
//   toast.error("Failed to update token");
//   toast.info("Refreshing customer list");
//
// Auto-dismiss after 5s. Stacks vertically. Click X to dismiss early.

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { COLORS } from "../theme";

type Variant = "success" | "error" | "info";

interface ToastEntry {
  id: number;
  variant: Variant;
  message: string;
  // Optional "undo" callback shown as an inline button.
  undo?: () => void;
}

interface ToastApi {
  success: (msg: string, opts?: { undo?: () => void }) => void;
  error:   (msg: string, opts?: { undo?: () => void }) => void;
  info:    (msg: string, opts?: { undo?: () => void }) => void;
  push:    (variant: Variant, msg: string, opts?: { undo?: () => void }) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems(curr => curr.filter(x => x.id !== id));
  }, []);

  const push = useCallback((variant: Variant, message: string, opts?: { undo?: () => void }) => {
    const id = nextId.current++;
    setItems(curr => [...curr, { id, variant, message, undo: opts?.undo }]);
    // auto-dismiss after 5s (8s if there's an undo, so the user has time to use it)
    setTimeout(() => dismiss(id), opts?.undo ? 8_000 : 5_000);
  }, [dismiss]);

  const api: ToastApi = {
    push,
    success: (m, o) => push("success", m, o),
    error:   (m, o) => push("error",   m, o),
    info:    (m, o) => push("info",    m, o),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 2000,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}>
        {items.map(t => (
          <ToastView key={t.id} entry={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Soft fallback so a missing provider doesn't crash — log instead.
    return {
      success: (m) => console.log("[toast.success]", m),
      error:   (m) => console.error("[toast.error]", m),
      info:    (m) => console.info("[toast.info]", m),
      push:    (v, m) => console.log("[toast]", v, m),
    };
  }
  return ctx;
}

// ── presentational ──

function ToastView({ entry, onClose }: { entry: ToastEntry; onClose: () => void }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setEnter(true)); }, []);

  const accent = entry.variant === "success" ? COLORS.GREEN
                : entry.variant === "error"  ? "#ff7a7a"
                : COLORS.T2;
  const icon = entry.variant === "success" ? "✓"
              : entry.variant === "error"   ? "✕"
              : "ⓘ";

  return (
    <div style={{
      pointerEvents: "auto",
      background: COLORS.S1, border: `1px solid ${COLORS.B3}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8, padding: "10px 14px",
      minWidth: 280, maxWidth: 420,
      fontFamily: FONT, color: COLORS.TEXT, fontSize: 13,
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
      transform: enter ? "translateX(0)" : "translateX(120%)",
      transition: "transform 0.18s ease",
    }}>
      <span style={{ color: accent, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{icon}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{entry.message}</span>
      {entry.undo && (
        <button
          onClick={() => { entry.undo?.(); onClose(); }}
          style={{
            background: "transparent", border: `1px solid ${COLORS.B3}`,
            color: COLORS.T2, borderRadius: 4, padding: "3px 8px",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
          }}
        >Undo</button>
      )}
      <button
        onClick={onClose}
        aria-label="dismiss"
        style={{
          background: "transparent", border: "none",
          color: COLORS.T3, fontSize: 16, cursor: "pointer",
          padding: 0, marginLeft: 4, lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}
