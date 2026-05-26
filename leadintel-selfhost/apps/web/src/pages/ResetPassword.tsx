import { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthShell, Field, ErrorBanner, SuccessBanner,
  inputStyle, primaryButton, linkStyle,
} from "./Login";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase parses the hash and fires PASSWORD_RECOVERY on the auth listener.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Fallback: if a session already exists (e.g. user landed via email and hash was processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else if (!window.location.hash.includes("type=recovery")) {
        setRecoveryError("This reset link is invalid or has expired. Please request a new one.");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    }
  }

  return (
    <AuthShell title="Set new password" subtitle="Choose a strong password you don't use anywhere else.">
      {done ? (
        <SuccessBanner message="Password updated. Redirecting…" />
      ) : recoveryError ? (
        <>
          <ErrorBanner message={recoveryError} />
          <div style={{ marginTop: 18, textAlign: "center" }}>
            <Link to="/forgot-password" style={linkStyle}>Request a new link</Link>
          </div>
        </>
      ) : !ready ? (
        <div style={{ fontSize: 12, color: "#959595" }}>Verifying reset link…</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="New password">
            <input type="password" required autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required value={confirm}
              onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
          </Field>
          {error && <ErrorBanner message={error} />}
          <button type="submit" disabled={submitting} style={primaryButton(submitting)}>
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}