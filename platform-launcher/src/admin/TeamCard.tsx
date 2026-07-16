// Team management for a customer, on the admin customer-detail page.
//
// Deliberately reuses the /me/customer/:cid/team endpoints rather than adding
// admin-only twins: callerCanAccess (routes/me.ts) already returns true for
// platform admins, so a super-admin can manage any customer's team through the
// same code path a customer's own account admin uses. One path, one set of bugs.
//
// Adding someone here creates their platform login if the email is new, and
// grants membership for every product the customer has enabled — so they land in
// ACQ Coach and Lead Intel both, which is what "add a user to this customer"
// is expected to mean.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { accountApi, TeamMember } from "../account/accountApi";
import { Pill } from "./AdminLayout";
import { useToast } from "./Toast";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

const ROLES = [
  { value: "tenant_user",   label: "User — normal access" },
  { value: "account_admin", label: "Account admin — can manage this customer's team" },
];

export function TeamCard({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("tenant_user");
  const [pw, setPw] = useState("");
  const [needPw, setNeedPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    const r = await accountApi.listTeam(customerId);
    setLoading(false);
    if (r.ok) { setTeam(r.data.team); setError(null); }
    else setError(r.error);
  }
  useEffect(() => { setLoading(true); load(); }, [customerId]);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function add() {
    if (!emailOk || busy) return;
    setBusy(true);
    const r = await accountApi.invite(
      customerId, email.trim(), role, fullName.trim() || undefined, pw.trim() || undefined,
    );
    setBusy(false);
    if (!r.ok) {
      // The API tells us when the email is new and needs a password, rather than
      // us pre-checking whether the account exists.
      if (r.error.includes("password")) { setNeedPw(true); toast.info("New person — set a password for them below."); return; }
      toast.error(`Could not add: ${r.error}`);
      return;
    }
    if (r.data.warning) toast.error(r.data.warning);
    else toast.success(`${email.trim()} added to ${customerName}`);
    setAddOpen(false); setEmail(""); setFullName(""); setPw(""); setNeedPw(false); setRole("tenant_user");
    await load();
  }

  async function remove(m: TeamMember) {
    if (busy) return;
    if (!confirm(`Remove ${m.email} from ${customerName}?\n\nThey lose access to this customer's data in both apps. Their login stays — delete it from the Users tab if you want it gone entirely.`)) return;
    setBusy(true);
    const r = await accountApi.remove(customerId, m.id);
    setBusy(false);
    if (!r.ok) { toast.error(`Could not remove: ${r.error}`); return; }
    toast.success(`${m.email} removed from ${customerName}`);
    await load();
  }

  return (
    <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
      <div style={{
        padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Users ({team.length})</div>
        <button
          onClick={() => setAddOpen(v => !v)} disabled={busy}
          style={{
            background: "transparent", border: `1px solid ${COLORS.GREEN}`,
            color: COLORS.GREEN, borderRadius: 6, padding: "5px 12px",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            opacity: busy ? 0.5 : 1,
          }}
        >{addOpen ? "Cancel" : "+ Add user"}</button>
      </div>

      {addOpen && (
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`,
          background: "rgba(78,125,61,0.06)",
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@company.com" autoFocus
              style={{
                flex: 1, minWidth: 200, padding: "7px 10px", background: COLORS.BG,
                border: `1px solid ${email && !emailOk ? "#c0392b" : COLORS.B3}`,
                borderRadius: 6, color: COLORS.TEXT, fontSize: 12, fontFamily: FONT,
              }} />
            <input
              value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Full name (optional)"
              style={{
                width: 180, padding: "7px 10px", background: COLORS.BG,
                border: `1px solid ${COLORS.B3}`, borderRadius: 6,
                color: COLORS.TEXT, fontSize: 12, fontFamily: FONT,
              }} />
            <select
              value={role} onChange={e => setRole(e.target.value)}
              style={{
                padding: "7px 10px", background: COLORS.BG, border: `1px solid ${COLORS.B3}`,
                borderRadius: 6, color: COLORS.TEXT, fontSize: 12, fontFamily: FONT,
              }}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button
              onClick={add} disabled={!emailOk || busy}
              style={{
                background: emailOk && !busy ? COLORS.GREEN : COLORS.B2, border: "none",
                borderRadius: 6, padding: "7px 14px", color: emailOk && !busy ? "#fff" : COLORS.T3,
                fontSize: 12, fontWeight: 600, fontFamily: FONT,
                cursor: emailOk && !busy ? "pointer" : "not-allowed", whiteSpace: "nowrap",
              }}
            >{busy ? "Adding…" : "Add"}</button>
          </div>
          {needPw && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <input
                value={pw} onChange={e => setPw(e.target.value)} autoFocus
                placeholder="Password for the new account (8+ characters)" type="text"
                style={{
                  flex: 1, minWidth: 260, padding: "7px 10px", background: COLORS.BG,
                  border: `1px solid ${pw && pw.trim().length < 8 ? "#c0392b" : COLORS.B3}`,
                  borderRadius: 6, color: COLORS.TEXT, fontSize: 12, fontFamily: FONT,
                }} />
              <span style={{ fontSize: 11, color: COLORS.T3 }}>Shown in the clear — hand it over, they can change it later.</span>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.T3, lineHeight: 1.6 }}>
            An email that already has an account is simply attached to this customer. A new one
            gets a login created across both apps, so you'll be asked for a password. Either way
            they get access to every product this customer has enabled.
          </div>
        </div>
      )}

      {error && <div style={{ padding: "14px 20px", fontSize: 12, color: "#ff7a7a" }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 20, color: COLORS.T3, fontSize: 13 }}>Loading…</div>
      ) : team.length === 0 ? (
        <div style={{ padding: 20, color: COLORS.T3, fontSize: 13 }}>
          No users yet — add one so this customer can sign in.
        </div>
      ) : team.map(m => (
        <div key={m.id} style={{
          display: "grid", gridTemplateColumns: "minmax(200px, 1.6fr) 1fr 90px",
          padding: "12px 20px", borderTop: `1px solid ${COLORS.B2}`,
          alignItems: "center", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: COLORS.TEXT, overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
            {m.full_name && <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 2 }}>{m.full_name}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {m.memberships.map((ms, i) => (
              <Pill key={i} color={ms.product === "acq_coach" ? "#7eb56a" : "#5fb1c9"}>
                {ms.product === "acq_coach" ? "ACQ" : "LI"}
                {ms.role === "account_admin" ? " · admin" : ""}
              </Pill>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => remove(m)} disabled={busy}
              style={{
                background: "transparent", border: `1px solid ${COLORS.B3}`,
                borderRadius: 6, padding: "4px 10px", color: "#ff7a7a",
                fontSize: 11, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT,
              }}
            >Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}
