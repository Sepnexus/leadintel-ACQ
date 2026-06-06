// Account → Team — list members, invite, remove.
// Available to anyone on the customer (read); write requires account_admin role.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { accountApi, MyCustomer, TeamMember } from "./accountApi";
import { Pill, ErrorBanner } from "../admin/AdminLayout";
import { useToast } from "../admin/Toast";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

export function TeamTab({ cid, customer }: { cid: string; customer: MyCustomer }) {
  const [team, setTeam]   = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const toast = useToast();

  // myRole: stored as the highest customer_users.role on this customer.
  // "account_admin" / "super_admin" can invite/remove; others are read-only.
  const canManage = ["account_admin", "super_admin", "platform_admin"].includes(customer.my_role);

  async function load() {
    setLoading(true);
    const r = await accountApi.listTeam(cid);
    setLoading(false);
    if (r.ok) { setTeam(r.data.team); setError(null); }
    else      setError(r.error);
  }
  useEffect(() => { load(); }, [cid]);

  async function onRemove(uid: string, email: string) {
    if (!confirm(`Remove ${email} from ${customer.name}?`)) return;
    const r = await accountApi.remove(cid, uid);
    if (!r.ok) { toast.error(`Failed: ${r.error}`); return; }
    toast.success(`${email} removed.`);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Team</h2>
          <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 4 }}>
            {team.length} member{team.length === 1 ? "" : "s"} on <strong style={{ color: COLORS.TEXT }}>{customer.name}</strong>
            {!canManage && <> · view-only (account admins can invite/remove)</>}
          </div>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} style={btnPrimary}>+ Invite member</button>
        )}
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(260px, 1.6fr) 1fr 130px 90px",
          padding: "12px 18px", background: COLORS.B2,
          fontSize: 11, color: COLORS.T3, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, gap: 12,
        }}>
          <div>User</div>
          <div>Products · Role</div>
          <div>Joined</div>
          <div style={{ textAlign: "right" }}>{canManage ? "Action" : ""}</div>
        </div>
        {loading && team.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.T3 }}>Loading…</div>
        ) : team.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.T3 }}>No members yet.</div>
        ) : team.map(m => (
          <div key={m.id} style={{
            display: "grid", gridTemplateColumns: "minmax(260px, 1.6fr) 1fr 130px 90px",
            padding: "14px 18px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center", gap: 12,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
              {m.full_name && <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>{m.full_name}</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {m.memberships.map((mb, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <Pill color={mb.product === "acq_coach" ? "#7eb56a" : "#5fb1c9"}>
                    {mb.product === "acq_coach" ? "ACQ" : "Lead Intel"}
                  </Pill>
                  <span style={{ color: COLORS.T2 }}>{prettyRole(mb.role)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: COLORS.T3 }}>—</div>
            <div style={{ textAlign: "right" }}>
              {canManage && (
                <button onClick={() => onRemove(m.id, m.email)} style={btnDanger}>Remove</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showInvite && (
        <InviteModal
          cid={cid}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); load(); }}
        />
      )}
    </div>
  );
}

function InviteModal({ cid, onClose, onInvited }: { cid: string; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail]     = useState("");
  const [fullName, setName]   = useState("");
  const [role, setRole]       = useState("tenant_user");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const toast = useToast();

  async function submit() {
    if (!email.includes("@")) { setErr("Enter a valid email."); return; }
    setBusy(true); setErr(null);
    const r = await accountApi.invite(cid, email.trim().toLowerCase(), role, fullName.trim() || undefined);
    setBusy(false);
    if (!r.ok) { setErr(r.error); toast.error(`Failed: ${r.error}`); return; }
    toast.success(`${email} added to the team. They'll receive a password reset email.`);
    onInvited();
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 12,
        padding: 24, width: 460, maxWidth: "92vw", fontFamily: FONT,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Invite a teammate</div>
        <Field label="Email"     value={email}    onChange={setEmail}    placeholder="name@company.com" autoFocus />
        <Field label="Full name" value={fullName} onChange={setName}     placeholder="(optional)" />
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: COLORS.T3, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{
            width: "100%", background: COLORS.B2, color: COLORS.TEXT,
            border: `1px solid ${COLORS.B3}`, borderRadius: 6, padding: "10px 12px",
            fontSize: 13, fontFamily: FONT,
          }}>
            <option value="tenant_user">Member (default)</option>
            <option value="account_admin">Account Admin (can invite + manage billing)</option>
            <option value="rep">Sales Rep (ACQ-only role)</option>
          </select>
        </div>
        {err && <div style={{ marginBottom: 10 }}><ErrorBanner>{err}</ErrorBanner></div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? "Inviting…" : "Send invite"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: COLORS.T3, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        style={{
          width: "100%", boxSizing: "border-box",
          background: COLORS.B2, color: COLORS.TEXT,
          border: `1px solid ${COLORS.B3}`, borderRadius: 6,
          padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none",
        }}
      />
    </div>
  );
}

function prettyRole(role: string): string {
  switch (role) {
    case "super_admin":   return "Super Admin";
    case "account_admin": return "Account Admin";
    case "tenant_user":   return "Member";
    case "rep":           return "Sales Rep";
    default: return role;
  }
}

const btnGhost: React.CSSProperties = {
  background: COLORS.B2, border: `1px solid ${COLORS.B3}`,
  borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
  fontSize: 12, cursor: "pointer", fontFamily: FONT,
};
const btnPrimary: React.CSSProperties = {
  background: COLORS.GREEN, border: `1px solid ${COLORS.GREEN}`,
  borderRadius: 6, padding: "8px 16px", color: "#fff",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
};
const btnDanger: React.CSSProperties = {
  background: "transparent", border: "1px solid #ff7a7a55",
  borderRadius: 6, padding: "5px 10px", color: "#ff7a7a",
  fontSize: 11, cursor: "pointer", fontFamily: FONT,
};
