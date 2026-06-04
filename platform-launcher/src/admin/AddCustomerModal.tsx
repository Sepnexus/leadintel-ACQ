// Modal form: create a new customer.
// Opens from a "+ Add Customer" button on /admin/customers.

import { useState } from "react";
import { COLORS } from "../theme";
import { adminApi, Product } from "./adminApi";
import { ErrorBanner } from "./AdminLayout";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export function AddCustomerModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName]                       = useState("");
  const [ghlLocationId, setGhlLocationId]     = useState("");
  const [ghlCompanyId, setGhlCompanyId]       = useState("");
  const [plan, setPlan]                       = useState("standard");
  const [products, setProducts]               = useState<Product[]>([]);
  const [isTest, setIsTest]                   = useState(false);
  const [trialActive, setTrialActive]         = useState(false);
  const [trialDays, setTrialDays]             = useState("");
  const [notes, setNotes]                     = useState("");
  const [error, setError]                     = useState<string | null>(null);
  const [busy, setBusy]                       = useState(false);

  if (!open) return null;

  function reset() {
    setName(""); setGhlLocationId(""); setGhlCompanyId("");
    setPlan("standard"); setProducts([]); setIsTest(false);
    setTrialActive(false); setTrialDays(""); setNotes(""); setError(null);
  }

  function toggleProduct(p: Product) {
    setProducts(curr => curr.includes(p) ? curr.filter(x => x !== p) : [...curr, p]);
  }

  async function submit() {
    if (!name.trim()) { setError("Name is required."); return; }
    setBusy(true); setError(null);

    let trial_expires_at: string | null = null;
    if (trialActive && trialDays.trim()) {
      const days = parseInt(trialDays);
      if (!isNaN(days) && days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        trial_expires_at = d.toISOString();
      }
    }

    const r = await adminApi.createCustomer({
      name: name.trim(),
      ghl_location_id: ghlLocationId.trim() || null,
      ghl_company_id: ghlCompanyId.trim() || null,
      plan: plan.trim() || "standard",
      is_test: isTest,
      trial_active: trialActive,
      trial_expires_at,
      notes: notes.trim() || null,
      products,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Failed to create customer.");
      return;
    }
    reset();
    onCreated(r.data.id);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.S1, border: `1px solid ${COLORS.B2}`,
          borderRadius: 12, padding: 28, width: 560, maxWidth: "92vw",
          color: COLORS.TEXT, maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <h2 style={{ margin: "0 0 6px 0", fontSize: 20 }}>Add Customer</h2>
        <p style={{ margin: "0 0 22px 0", color: COLORS.T3, fontSize: 13 }}>
          Onboard a new customer organization. GHL token can be set after creation.
        </p>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Field label="Customer name" required>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. SHC Homes"
            style={inputStyle}
          />
        </Field>

        <Row>
          <Field label="GHL Location ID">
            <input
              value={ghlLocationId} onChange={e => setGhlLocationId(e.target.value)}
              placeholder="MSvgr2DX3UIy0XNXWeUU"
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <Field label="GHL Company ID">
            <input
              value={ghlCompanyId} onChange={e => setGhlCompanyId(e.target.value)}
              placeholder="(optional)"
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
        </Row>

        <Field label="Enable products">
          <div style={{ display: "flex", gap: 10 }}>
            <ProductChip
              label="ACQ Coach"
              active={products.includes("acq_coach")}
              onClick={() => toggleProduct("acq_coach")}
            />
            <ProductChip
              label="Lead Intel"
              active={products.includes("lead_intel")}
              onClick={() => toggleProduct("lead_intel")}
            />
          </div>
        </Field>

        <Row>
          <Field label="Plan">
            <input
              value={plan} onChange={e => setPlan(e.target.value)}
              placeholder="standard"
              style={inputStyle}
            />
          </Field>
          <Field label="Flags">
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
              Test account
            </label>
          </Field>
        </Row>

        <Field label="Trial">
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox" checked={trialActive}
              onChange={e => setTrialActive(e.target.checked)}
            />
            On trial
          </label>
          {trialActive && (
            <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={trialDays} onChange={e => setTrialDays(e.target.value)}
                placeholder="14"
                style={{ ...inputStyle, width: 80 }}
                inputMode="numeric"
              />
              <span style={{ color: COLORS.T3, fontSize: 12 }}>days from today</span>
            </div>
          )}
        </Field>

        <Field label="Notes">
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anything the team should know about this customer"
            rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
          />
        </Field>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button
            onClick={() => { reset(); onClose(); }}
            disabled={busy}
            style={btnGhostStyle}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            style={{ ...btnPrimaryStyle, opacity: busy || !name.trim() ? 0.6 : 1 }}
          >{busy ? "Creating…" : "Create Customer"}</button>
        </div>
      </div>
    </div>
  );
}

// ── styled atoms ──

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: COLORS.BG, color: COLORS.TEXT,
  border: `1px solid ${COLORS.B3}`, borderRadius: 6,
  padding: "9px 12px", fontSize: 13, fontFamily: "'Open Sans', system-ui, -apple-system, sans-serif",
  outline: "none",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  fontSize: 13, color: COLORS.TEXT, cursor: "pointer",
};

const btnGhostStyle: React.CSSProperties = {
  background: "transparent", border: `1px solid ${COLORS.B3}`,
  color: COLORS.T2, borderRadius: 6, padding: "8px 16px",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Open Sans', system-ui, sans-serif",
};

const btnPrimaryStyle: React.CSSProperties = {
  background: COLORS.GREEN, border: "none",
  color: COLORS.BG, borderRadius: 6, padding: "8px 18px",
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Open Sans', system-ui, sans-serif",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: COLORS.T3, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}{required && <span style={{ color: COLORS.GREEN }}> *</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{children}</div>;
}

function ProductChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
        background: active ? COLORS.GREEN : "transparent",
        color: active ? COLORS.BG : COLORS.T2,
        border: `1px solid ${active ? COLORS.GREEN : COLORS.B3}`,
        cursor: "pointer", fontFamily: "'Open Sans', system-ui, sans-serif",
      }}
    >{active ? "✓ " : ""}{label}</button>
  );
}
