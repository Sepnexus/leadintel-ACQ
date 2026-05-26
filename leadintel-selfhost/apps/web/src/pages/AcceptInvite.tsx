import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COLORS } from "@/utils/leadUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State =
  | { kind: "loading" }
  | { kind: "invalid"; reason: string }
  | { kind: "ready"; email: string; tenantName: string | null }
  | { kind: "submitting" }
  | { kind: "done" };

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", reason: "No invitation token in URL" });
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke("preview-invitation", {
        body: { token },
      });
      if (error || !data?.ok) {
        setState({ kind: "invalid", reason: data?.error ?? error?.message ?? "Could not load invitation" });
        return;
      }
      if (data.status !== "active") {
        setState({ kind: "invalid", reason: `This invitation is ${data.status}.` });
        return;
      }
      setState({ kind: "ready", email: data.email, tenantName: data.tenant_name });
    })();
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "ready") return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setState({ kind: "submitting" });
    const { data, error } = await supabase.functions.invoke("accept-invitation", {
      body: { token, full_name: fullName.trim(), password },
    });
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? "Failed to accept invitation");
      // restore form
      setState({ kind: "ready", email: (state as any).email, tenantName: (state as any).tenantName });
      return;
    }
    // Auto-sign in.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: data.email,
      password,
    });
    if (signInErr) {
      toast.success("Account created. Please sign in.");
      navigate("/login", { replace: true });
      return;
    }
    toast.success("Welcome!");
    setState({ kind: "done" });
    navigate("/", { replace: true });
  }

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.BG, color: COLORS.TEXT,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: COLORS.S1, border: "1px solid " + COLORS.B2, borderRadius: 12, padding: 32,
      }}>
        <h1 style={{
          fontFamily: "'League Spartan', sans-serif",
          fontSize: 24, margin: "0 0 8px", color: COLORS.TEXT,
        }}>
          Accept invitation
        </h1>

        {state.kind === "loading" && <p style={{ color: COLORS.T2 }}>Loading…</p>}

        {state.kind === "invalid" && (
          <>
            <p style={{ color: COLORS.RED, margin: "12px 0" }}>{state.reason}</p>
            <Button onClick={() => navigate("/login")}>Go to sign in</Button>
          </>
        )}

        {(state.kind === "ready" || state.kind === "submitting") && (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ color: COLORS.T2, fontSize: 13, margin: "8px 0 4px" }}>
              You&apos;ve been invited{(state as any).tenantName ? <> to <strong style={{ color: COLORS.TEXT }}>{(state as any).tenantName}</strong></> : ""} as <strong style={{ color: COLORS.TEXT }}>{(state as any).email}</strong>.
            </p>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>Full name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
            </div>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
            </div>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>Confirm password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
            </div>
            <Button type="submit" disabled={state.kind === "submitting"}>
              {state.kind === "submitting" ? "Creating account…" : "Accept & sign in"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}