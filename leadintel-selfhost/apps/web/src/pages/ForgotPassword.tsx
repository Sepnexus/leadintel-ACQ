import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthShell, Field, ErrorBanner, SuccessBanner,
  inputStyle, primaryButton, linkStyle,
} from "./Login";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <AuthShell title="Reset password" subtitle="We'll email you a reset link.">
      {sent ? (
        <SuccessBanner message={`If an account exists for ${email}, a reset link is on its way. Check your inbox.`} />
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Email">
            <input
              type="email" required autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </Field>
          {error && <ErrorBanner message={error} />}
          <button type="submit" disabled={submitting} style={primaryButton(submitting)}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <div style={{ marginTop: 18, textAlign: "center" }}>
        <Link to="/login" style={linkStyle}>← Back to sign in</Link>
      </div>
    </AuthShell>
  );
}