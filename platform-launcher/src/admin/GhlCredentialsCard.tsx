// Editable GHL Credentials section for the customer detail page.
// Shows location ID (editable) + token status (Set / Last 4 / "set 3h ago").
// Actions: Set/Rotate, Validate against GHL, Reveal (with audit warning).

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi, CustomerDetail } from "./adminApi";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export function GhlCredentialsCard({ customer, onChanged }: {
  customer: CustomerDetail["customer"];
  onChanged: () => void;
}) {
  const [editingLoc, setEditingLoc]       = useState(false);
  const [locationDraft, setLocationDraft] = useState(customer.ghl_location_id ?? "");
  const [editingToken, setEditingToken]   = useState(false);
  const [tokenDraft, setTokenDraft]       = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [busy, setBusy]                   = useState(false);
  const [validation, setValidation]       = useState<null | { ok: boolean; detail: string }>(null);
  const [error, setError]                 = useState<string | null>(null);
  // Cooldown timer (seconds) blocking rapid re-validates that would compound
  // GHL's per-token rate limit. Set to 30 after a 429, 5 after a normal call.
  const [cooldown, setCooldown]           = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function saveLocation() {
    setBusy(true); setError(null);
    const r = await adminApi.setGhlCredentials(customer.id, { location_id: locationDraft.trim() || null });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditingLoc(false);
    onChanged();
  }

  async function saveToken() {
    if (tokenDraft.trim().length < 8) {
      setError("Token looks too short."); return;
    }
    setBusy(true); setError(null);
    const r = await adminApi.setGhlCredentials(customer.id, { pit_token: tokenDraft.trim() });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditingToken(false);
    setTokenDraft("");
    setRevealedToken(null);
    onChanged();
  }

  async function validate() {
    // Backend now falls back to the stored encrypted token when none is
    // supplied — so we can validate without triggering a reveal (and the
    // audit row that comes with it). Only pass the draft if the user is
    // mid-edit.
    const draftTok = tokenDraft.trim();
    runValidate(draftTok || revealedToken || "");
  }

  async function runValidate(tok: string) {
    setBusy(true); setValidation(null); setError(null);
    const r = await adminApi.validateGhlCredentials(customer.id, tok);
    setBusy(false);
    if (!r.ok) { setError(r.error); setCooldown(5); return; }
    if (r.data.ok) {
      const summary = (r.data as any).summary ?? `Connected — location: ${r.data.location?.name ?? "(no name)"}`;
      setValidation({ ok: true, detail: summary });
      // Soft cooldown so a happy user doesn't spam GHL by clicking 5 times.
      setCooldown(5);
    } else {
      const msg = (r.data as any).message
        ?? `GHL responded ${r.data.ghl_status ?? "?"}: ${(r.data as any).ghl_response ?? ""}`;
      setValidation({ ok: false, detail: String(msg).slice(0, 280) });
      // 429 → 30s cooldown (matches GHL's typical reset window).
      // Other failures → 10s to give the user a chance to read the message.
      setCooldown(r.data.ghl_status === 429 ? 30 : 10);
    }
  }

  async function reveal() {
    if (!confirm("Reveal the GHL token? This action is logged in the audit log.")) return;
    setBusy(true); setError(null);
    const r = await adminApi.revealGhlToken(customer.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setRevealedToken(r.data.token);
  }

  return (
    <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18 }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, fontSize: 14, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>GHL Credentials</span>
        <button
          onClick={validate}
          disabled={busy || cooldown > 0}
          style={{ ...btnGhost, opacity: (busy || cooldown > 0) ? 0.5 : 1, cursor: (busy || cooldown > 0) ? "not-allowed" : "pointer" }}
          title={cooldown > 0 ? `Wait ${cooldown}s before re-checking (GHL rate window)` : ""}
        >
          {busy ? "Checking…"
            : cooldown > 0 ? `🌐 Try again in ${cooldown}s`
            : "🌐 Validate against GHL"}
        </button>
      </div>

      {error && <div style={{ padding: "10px 20px", color: "#ff7a7a", fontSize: 12, borderBottom: `1px solid ${COLORS.B2}` }}>{error}</div>}

      {validation && (
        <div style={{
          padding: "10px 20px", fontSize: 12,
          color: validation.ok ? COLORS.GREEN : "#ff7a7a",
          borderBottom: `1px solid ${COLORS.B2}`,
        }}>{validation.detail}</div>
      )}

      {/* Location ID */}
      <Row label="Location ID">
        {editingLoc ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={locationDraft} onChange={e => setLocationDraft(e.target.value)}
              placeholder="MSvgr2DX3UIy0XNXWeUU"
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
              autoFocus
            />
            <button onClick={saveLocation} disabled={busy} style={btnPrimary}>Save</button>
            <button onClick={() => { setEditingLoc(false); setLocationDraft(customer.ghl_location_id ?? ""); setError(null); }} style={btnGhost}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "ui-monospace, monospace", color: customer.ghl_location_id ? COLORS.TEXT : COLORS.T3 }}>
              {customer.ghl_location_id ?? "(not set)"}
            </span>
            <button onClick={() => setEditingLoc(true)} style={btnGhostSmall}>Edit</button>
          </div>
        )}
      </Row>

      {/* PIT token */}
      <Row label="PIT Token">
        {editingToken ? (
          <div>
            <input
              type="password"
              value={tokenDraft} onChange={e => setTokenDraft(e.target.value)}
              placeholder="paste new token here"
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
              autoFocus
            />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button onClick={saveToken} disabled={busy || tokenDraft.trim().length < 8} style={{ ...btnPrimary, opacity: (busy || tokenDraft.trim().length < 8) ? 0.5 : 1 }}>
                {busy ? "Saving…" : "Save Token"}
              </button>
              <button onClick={() => { setEditingToken(false); setTokenDraft(""); setError(null); }} style={btnGhost}>Cancel</button>
            </div>
            <div style={{ marginTop: 8, color: COLORS.T3, fontSize: 11 }}>
              Token is encrypted at rest in <code>platform.customers.ghl_pit_token_encrypted</code> and mirrored into{" "}
              {customer.acq_account_id && "acq.ghl_accounts"}
              {customer.acq_account_id && customer.leadintel_tenant_id && " + "}
              {customer.leadintel_tenant_id && "leadintel.tenants"} so edge functions continue to work.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {revealedToken ? (
                <div style={{ fontFamily: "ui-monospace, monospace", color: COLORS.TEXT, fontSize: 12, wordBreak: "break-all" }}>
                  {revealedToken}
                </div>
              ) : customer.ghl_token_set ? (
                <div>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: COLORS.TEXT }}>
                    ••••••••{customer.ghl_token_last_4 ?? ""}
                  </span>
                  {customer.ghl_token_set_at && (
                    <span style={{ fontSize: 11, color: COLORS.T3, marginLeft: 12 }}>
                      set {timeAgo(customer.ghl_token_set_at)}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ color: COLORS.T3 }}>(not set)</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {customer.ghl_token_set && !revealedToken && (
                <button onClick={reveal} disabled={busy} style={btnGhostSmall}>Reveal</button>
              )}
              {revealedToken && (
                <button onClick={() => setRevealedToken(null)} style={btnGhostSmall}>Hide</button>
              )}
              <button onClick={() => { setEditingToken(true); setRevealedToken(null); }} style={btnGhostSmall}>
                {customer.ghl_token_set ? "Rotate" : "Set Token"}
              </button>
            </div>
          </div>
        )}
      </Row>

      {/* Back-pointer info */}
      <Row label="ACQ account ID">
        <span style={{ fontFamily: "ui-monospace, monospace", color: customer.acq_account_id ? COLORS.T2 : COLORS.T3, fontSize: 12 }}>
          {customer.acq_account_id ?? "(not on ACQ)"}
        </span>
      </Row>
      <Row label="Lead Intel tenant ID" last>
        <span style={{ fontFamily: "ui-monospace, monospace", color: customer.leadintel_tenant_id ? COLORS.T2 : COLORS.T3, fontSize: 12 }}>
          {customer.leadintel_tenant_id ?? "(not on Lead Intel)"}
        </span>
      </Row>
    </div>
  );
}

// ── Atoms ──
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: COLORS.BG, color: COLORS.TEXT,
  border: `1px solid ${COLORS.B3}`, borderRadius: 6,
  padding: "8px 12px", fontSize: 13, outline: "none",
};
const btnGhost: React.CSSProperties = {
  background: "transparent", border: `1px solid ${COLORS.B3}`,
  color: COLORS.T2, borderRadius: 6, padding: "6px 12px",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
};
const btnGhostSmall: React.CSSProperties = { ...btnGhost, padding: "4px 10px", fontSize: 11 };
const btnPrimary: React.CSSProperties = {
  background: COLORS.GREEN, border: "none",
  color: COLORS.BG, borderRadius: 6, padding: "6px 14px",
  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
};

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "180px 1fr", gap: 16,
      padding: "14px 20px", borderTop: `1px solid ${COLORS.B2}`,
      alignItems: "center",
      borderBottomLeftRadius: last ? 10 : 0, borderBottomRightRadius: last ? 10 : 0,
    }}>
      <div style={{ color: COLORS.T3, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
