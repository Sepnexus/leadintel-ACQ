import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { COLORS } from "@/utils/leadUtils";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

interface UserMenuProps {
  /** Optional callback to switch the in-app tab to "settings" instead of navigating. */
  onOpenSettings?: () => void;
  compact?: boolean;
}

export function UserMenu({ onOpenSettings, compact }: UserMenuProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { role } = useCurrentTenant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!user) return null;
  const email = user.email ?? "Account";
  const display = compact && email.length > 18 ? email.slice(0, email.indexOf("@")) || email : email;

  async function handleLogout() {
    setOpen(false);
    await signOut();
    // Land on the platform launcher (the "main" login), not this app's own
    // login page. Fallback to /login only when no launcher is configured
    // (e.g. standalone dev).
    const launcher = import.meta.env.VITE_LAUNCHER_URL as string | undefined;
    if (launcher) window.location.href = launcher;
    else navigate("/login", { replace: true });
  }

  function handleChangePassword() {
    setOpen(false);
    if (onOpenSettings) onOpenSettings();
    else navigate("/?tab=settings");
  }

  function handleOpenAdmin() {
    setOpen(false);
    navigate("/admin");
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: COLORS.S2, border: "1px solid " + COLORS.B1,
          borderRadius: 8, padding: "5px 10px",
          color: COLORS.T2, fontSize: 11, cursor: "pointer",
          fontFamily: "'Open Sans', sans-serif", maxWidth: 220,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
        title={email}
      >
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: COLORS.GRN, flexShrink: 0,
        }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span>
        <span style={{ color: COLORS.T3, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          minWidth: 220, background: COLORS.S2, border: "1px solid " + COLORS.B2,
          borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          fontFamily: "'Open Sans', sans-serif",
        }}>
          <div style={{
            padding: "8px 10px", fontSize: 11, color: COLORS.T3,
            borderBottom: "1px solid " + COLORS.B1, marginBottom: 4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={email}>
            Signed in as<br />
            <span style={{ color: COLORS.TEXT, fontWeight: 600 }}>{email}</span>
          </div>
          <MenuItem onClick={handleChangePassword}>Change Password</MenuItem>
          {role === "super_admin" && (
            <MenuItem onClick={handleOpenAdmin}>Admin</MenuItem>
          )}
          <MenuItem onClick={handleLogout} accent={COLORS.RED}>Logout</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: "transparent", border: "none",
        padding: "8px 10px", borderRadius: 6,
        color: accent ?? COLORS.TEXT, fontSize: 12, cursor: "pointer",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.S3)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}