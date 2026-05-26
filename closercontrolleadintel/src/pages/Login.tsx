import { useState, FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { COLORS } from "@/utils/leadUtils";

export default function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) {
    const dest = (location.state as { from?: string } | null)?.from || "/";
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back to Lead Intel">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Email">
          <input
            type="email" required autoFocus value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Password">
          <input
            type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </Field>
        {error && <ErrorBanner message={error} />}
        <button type="submit" disabled={submitting} style={primaryButton(submitting)}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <Link to="/forgot-password" style={linkStyle}>Forgot password?</Link>
        <div style={{ fontSize: 11, color: COLORS.T3, textAlign: "center", lineHeight: 1.5 }}>
          Need an account? Contact your admin to get one.
        </div>
      </div>
    </AuthShell>
  );
}

// Shared shell + styles used across auth pages

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: COLORS.BG, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "'Open Sans', sans-serif", color: COLORS.TEXT,
    }}>
      <div style={{
        width: "100%", maxWidth: 400,
        background: COLORS.S1, border: "1px solid " + COLORS.B1,
        borderRadius: 16, padding: 32,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <img src="/assets/closer-control-logo.png" alt="Closer Control" style={{ height: 28 }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: COLORS.GRN, background: COLORS.GRN + "15", border: "1px solid " + COLORS.GRN + "25", borderRadius: 4, padding: "1px 6px" }}>AI</span>
        </div>
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 24, fontWeight: 800, margin: 0, color: COLORS.TEXT, letterSpacing: -0.3 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12.5, color: COLORS.T2, margin: "6px 0 22px" }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: COLORS.S3, border: "1px solid " + COLORS.B2, borderRadius: 8,
  color: COLORS.TEXT, fontSize: 13, padding: "10px 14px",
  fontFamily: "'Open Sans', sans-serif", outline: "none",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.T3, letterSpacing: 0.7, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

export function primaryButton(disabled = false): React.CSSProperties {
  return {
    background: COLORS.GRN, border: "none", borderRadius: 10,
    padding: "11px 18px", color: "#000", fontSize: 13, fontWeight: 800,
    cursor: disabled ? "wait" : "pointer", fontFamily: "'League Spartan', sans-serif",
    letterSpacing: 0.3, opacity: disabled ? 0.7 : 1,
  };
}

export const linkStyle: React.CSSProperties = {
  fontSize: 12, color: COLORS.GRN, textDecoration: "none", fontFamily: "'Open Sans', sans-serif",
};

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      background: COLORS.RED + "12", border: "1px solid " + COLORS.RED + "40",
      borderRadius: 8, padding: "8px 12px", color: COLORS.RED, fontSize: 12, lineHeight: 1.5,
    }}>{message}</div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div style={{
      background: COLORS.GRN + "12", border: "1px solid " + COLORS.GRN + "40",
      borderRadius: 8, padding: "8px 12px", color: COLORS.GRN, fontSize: 12, lineHeight: 1.5,
    }}>{message}</div>
  );
}