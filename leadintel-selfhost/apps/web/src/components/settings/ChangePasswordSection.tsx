import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { COLORS } from "@/utils/leadUtils";

export function ChangePasswordSection() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (!user?.email) { setError("Not signed in."); return; }

    setSubmitting(true);
    // Re-verify current password by signing in again — Supabase has no direct "verify" RPC.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (reauthError) {
      setSubmitting(false);
      setError("Current password is incorrect.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setSuccess(false), 3500);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8,
    color: COLORS.TEXT, fontSize: 13, padding: "10px 14px",
    fontFamily: "'Open Sans', sans-serif", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9.5, fontWeight: 600, color: COLORS.T3,
    letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 5,
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT, marginBottom: 4, fontFamily: "'League Spartan', sans-serif" }}>
        Change Password
      </div>
      <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 16 }}>
        Update the password you use to sign in.
      </div>
      <form onSubmit={handleSubmit} style={{
        background: COLORS.S2, border: "1px solid " + COLORS.B1, borderRadius: 12,
        padding: 20, display: "flex", flexDirection: "column", gap: 14, maxWidth: 460,
      }}>
        <div>
          <div style={labelStyle}>Current Password</div>
          <input type="password" required value={current}
            onChange={(e) => setCurrent(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>New Password</div>
          <input type="password" required value={next}
            onChange={(e) => setNext(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Confirm New Password</div>
          <input type="password" required value={confirm}
            onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
        </div>
        {error && (
          <div style={{ background: COLORS.RED + "12", border: "1px solid " + COLORS.RED + "40", borderRadius: 8, padding: "8px 12px", color: COLORS.RED, fontSize: 12 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: COLORS.GRN + "12", border: "1px solid " + COLORS.GRN + "40", borderRadius: 8, padding: "8px 12px", color: COLORS.GRN, fontSize: 12 }}>
            Password updated ✓
          </div>
        )}
        <button type="submit" disabled={submitting} style={{
          background: COLORS.GRN, border: "none", borderRadius: 10,
          padding: "10px 18px", color: "#000", fontSize: 13, fontWeight: 800,
          cursor: submitting ? "wait" : "pointer", fontFamily: "'League Spartan', sans-serif",
          letterSpacing: 0.3, opacity: submitting ? 0.7 : 1, alignSelf: "flex-start",
        }}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}