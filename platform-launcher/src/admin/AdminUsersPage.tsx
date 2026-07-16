// /admin/users — list + per-user detail.

import { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { adminApi, UserRow, UserDetail, UserMembership, Product } from "./adminApi";
import { Pill, ErrorBanner } from "./AdminLayout";

const FONT = "'Open Sans', system-ui, -apple-system, sans-serif";

function roleLabel(role: string): string {
  switch (role) {
    case "super_admin":   return "Super Admin";
    case "account_admin": return "Account Admin";
    case "tenant_user":   return "Member";
    case "rep":           return "Sales Rep";
    default:              return role;
  }
}
function roleColor(role: string): string {
  if (role === "super_admin" || role === "account_admin") return COLORS.GREEN;
  return COLORS.T2;
}

// Compact membership summary for the list view.
function MembershipSummary({ memberships }: { memberships: UserMembership[] }) {
  if (!memberships || memberships.length === 0) {
    return <span style={{ color: COLORS.T3, fontSize: 12 }}>—</span>;
  }
  const byCustomer: Record<string, UserMembership[]> = {};
  for (const m of memberships) (byCustomer[m.name] ??= []).push(m);
  const names = Object.keys(byCustomer);
  const ms = byCustomer[names[0]];
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 13, color: COLORS.TEXT,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={names.join(", ")}>{names[0]}</div>
      <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>
        {names.length > 1
          ? <>+ {names.length - 1} more customer{names.length - 1 === 1 ? "" : "s"}</>
          : ms.map(m => `${m.product === "acq_coach" ? "ACQ" : "LI"}: ${roleLabel(m.role)}`).join(" · ")
        }
      </div>
    </div>
  );
}

function ProductCell({ on, enabled }: { on: boolean; enabled: boolean }) {
  if (!on) return <span style={{ color: COLORS.T3, fontSize: 12 }}>not on app</span>;
  return enabled
    ? <Pill color={COLORS.GREEN}>enabled</Pill>
    : <Pill color="#ff7a7a">disabled</Pill>;
}

export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await adminApi.listUsers(q);
      if (cancelled) return;
      setLoading(false);
      if (r.ok) { setUsers(r.data.users); setError(null); }
      else      setError(r.error);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, reloadKey]);

  if (selected) return <UserDetailView userId={selected} onBack={() => setSelected(null)} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Users</h2>
          <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 4 }}>
            {users.length} user{users.length === 1 ? "" : "s"} · click any row to edit access
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by email or name…"
            style={{
              background: COLORS.B2, color: COLORS.TEXT, border: `1px solid ${COLORS.B3}`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: FONT,
              width: 280, outline: "none",
            }}
          />
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              background: COLORS.GREEN, border: "none", borderRadius: 8,
              padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
            }}
          >+ New user</button>
        </div>
      </div>

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); setReloadKey(k => k + 1); }}
        />
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ border: `1px solid ${COLORS.B2}`, borderRadius: 10, overflow: "hidden", background: COLORS.S1 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1.6fr) minmax(220px, 1.4fr) 130px 130px 100px",
          padding: "12px 18px", background: COLORS.B2,
          fontSize: 11, color: COLORS.T3, letterSpacing: "0.06em",
          textTransform: "uppercase", fontWeight: 700, gap: 12,
        }}>
          <div>User</div>
          <div>Customer · Role</div>
          <div>ACQ Coach</div>
          <div>Lead Intel</div>
          <div style={{ textAlign: "right" }}>Platform</div>
        </div>
        {loading && users.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: COLORS.T3, fontSize: 13 }}>
            {q ? `No users match "${q}".` : "No users yet."}
          </div>
        ) : users.map(u => (
          <div
            key={u.id}
            onClick={() => setSelected(u.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 1.6fr) minmax(220px, 1.4fr) 130px 130px 100px",
              padding: "14px 18px", borderTop: `1px solid ${COLORS.B2}`,
              cursor: "pointer", alignItems: "center", gap: 12,
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = COLORS.B2)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {/* Email always primary. full_name secondary only if present. */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: COLORS.TEXT, fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={u.email}>{u.email}</div>
              {u.full_name && (
                <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 3 }}>{u.full_name}</div>
              )}
            </div>
            <MembershipSummary memberships={u.memberships ?? []} />
            <ProductCell on={u.on_acq} enabled={u.acq_enabled} />
            <ProductCell on={u.on_leadintel} enabled={u.li_enabled} />
            <div style={{ textAlign: "right" }}>
              {u.is_platform_admin && (
                <span style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,200,80,0.12)", color: "#ffc966",
                  border: "1px solid rgba(255,200,80,0.35)",
                  letterSpacing: "0.06em", fontWeight: 700, fontFamily: "ui-monospace, monospace",
                }}>ADMIN</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Per-user detail view
// ────────────────────────────────────────────────────────────────
function UserDetailView({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminErr, setAdminErr] = useState<string | null>(null);

  async function load() {
    const r = await adminApi.getUser(userId);
    if (r.ok) { setDetail(r.data); setError(null); }
    else setError(r.error);
  }
  useEffect(() => { load(); }, [userId]);

  if (!detail) {
    return error ? <ErrorBanner>{error}</ErrorBanner> : <div style={{ color: COLORS.T3 }}>Loading…</div>;
  }

  // Customer-derived product access: a user has access to a product IFF they
  // belong to (customer_users) a customer with that product enabled.
  // Platform admins bypass.
  const customerProducts = new Set<Product>();
  for (const c of detail.customers) {
    if (c.customer_acq_enabled) customerProducts.add("acq_coach");
    if (c.customer_li_enabled)  customerProducts.add("lead_intel");
  }
  const isAdmin = detail.user.is_platform_admin;
  const hasAcq = isAdmin || customerProducts.has("acq_coach");
  const hasLi  = isAdmin || customerProducts.has("lead_intel");

  return (
    <div>
      <button onClick={onBack} style={{
        background: "transparent", border: `1px solid ${COLORS.B3}`,
        borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
        fontSize: 12, cursor: "pointer", fontFamily: FONT, marginBottom: 18,
      }}>← All users</button>

      <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, padding: 24, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 22, wordBreak: "break-all" }}>{detail.user.email}</h2>
            {detail.user.full_name && <div style={{ color: COLORS.T2, marginTop: 6, fontSize: 14 }}>{detail.user.full_name}</div>}
            <div style={{ color: COLORS.T3, fontSize: 11, marginTop: 10, fontFamily: "ui-monospace, monospace" }}>
              platform user id: {detail.user.id}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            {isAdmin && (
              <span style={{
                fontSize: 10, padding: "4px 10px", borderRadius: 4,
                background: "rgba(255,200,80,0.12)", color: "#ffc966",
                border: "1px solid rgba(255,200,80,0.35)",
                letterSpacing: "0.06em", fontWeight: 700, fontFamily: "ui-monospace, monospace",
              }}>PLATFORM ADMIN</span>
            )}
            <button
              onClick={() => setPwOpen(true)}
              style={{
                background: COLORS.B2, border: `1px solid ${COLORS.B3}`,
                borderRadius: 6, padding: "6px 12px", color: COLORS.T2,
                fontSize: 12, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
              }}
              title="Force-set this user's password across all backends"
            >🔑 Set password</button>
            <button
              onClick={async () => {
                setAdminErr(null); setAdminBusy(true);
                const r = await adminApi.setPlatformAdmin(userId, !isAdmin);
                setAdminBusy(false);
                if (r.ok) load(); else setAdminErr(r.error);
              }}
              disabled={adminBusy}
              style={{
                background: isAdmin ? "rgba(192,57,43,0.10)" : "rgba(255,200,80,0.10)",
                border: `1px solid ${isAdmin ? "#c0392b" : "rgba(255,200,80,0.5)"}`,
                borderRadius: 6, padding: "6px 12px",
                color: isAdmin ? "#ff7a7a" : "#ffc966",
                fontSize: 12, cursor: adminBusy ? "not-allowed" : "pointer",
                fontFamily: FONT, whiteSpace: "nowrap",
              }}
              title={isAdmin ? "Remove platform super-admin access" : "Grant full platform super-admin access"}
            >{adminBusy ? "Saving…" : isAdmin ? "Revoke platform admin" : "★ Make platform admin"}</button>
          </div>
        </div>
      </div>

      {pwOpen && (
        <SetPasswordModal
          userId={userId}
          email={detail.user.email}
          onClose={() => setPwOpen(false)}
        />
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {adminErr && <ErrorBanner>{adminErr}</ErrorBanner>}

      <Section title="Effective Access (derived from customer)">
        <div style={{ padding: "14px 20px", color: COLORS.T2, fontSize: 12, borderBottom: `1px solid ${COLORS.B2}`, lineHeight: 1.6 }}>
          Access is no longer toggled per user. A user can use a product IF{" "}
          {isAdmin
            ? "they are a Platform Admin (bypass)."
            : "they belong to at least one customer that has the product enabled."}{" "}
          To change a user's access, go to the <strong>Customers</strong> tab and toggle the product on the customer they belong to.
        </div>
        {(["acq_coach", "lead_intel"] as Product[]).map(p => {
          const has = p === "acq_coach" ? hasAcq : hasLi;
          return (
            <div key={p} style={{
              display: "grid", gridTemplateColumns: "200px 1fr 140px",
              padding: "16px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center", gap: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p === "acq_coach" ? "ACQ Coach" : "Lead Intel"}</div>
              <div style={{ fontSize: 12, color: COLORS.T3 }}>
                {has
                  ? isAdmin ? "Granted via Platform Admin role." : "Granted via customer membership."
                  : "User does not belong to any customer with this product enabled."}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {has
                  ? <Pill color={COLORS.GREEN}>granted</Pill>
                  : <Pill color="#ff7a7a">no access</Pill>}
              </div>
            </div>
          );
        })}
      </Section>

      {detail.customers.length > 0 && (
        <Section title={`Customer Memberships (${detail.customers.length})`}>
          {detail.customers.map((c, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 100px 140px",
              padding: "12px 20px", borderTop: `1px solid ${COLORS.B2}`, alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 13, color: COLORS.TEXT }}>{c.name}</div>
              <Pill color={c.product === "acq_coach" ? "#7eb56a" : "#5fb1c9"}>{c.product === "acq_coach" ? "ACQ" : "Lead Intel"}</Pill>
              <span style={{ fontSize: 12, color: roleColor(c.role) }}>{roleLabel(c.role)}</span>
            </div>
          ))}
        </Section>
      )}

      <Section title="Recent Activity">
        {detail.recent_activity.length === 0
          ? <div style={{ padding: 20, color: COLORS.T3, fontSize: 13 }}>No activity yet.</div>
          : detail.recent_activity.map(e => (
            <div key={e.id} style={{ padding: "10px 20px", borderTop: `1px solid ${COLORS.B2}`, fontSize: 12 }}>
              <span style={{ color: COLORS.T3, fontFamily: "ui-monospace, monospace" }}>{new Date(e.created_at).toLocaleString()}</span>
              <span style={{ color: COLORS.TEXT, marginLeft: 12 }}>{e.action}</span>
            </div>
          ))
        }
      </Section>
    </div>
  );
}

// ─── CreateUserModal ─────────────────────────────────────────────────────────
// Mint a brand-new platform user with a password — optionally a full platform
// super-admin. Writes platform-auth + ACQ + LI in one call (same plumbing as
// Set Password), so the person can log in at the launcher immediately.
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [superAdmin, setSuperAdmin] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; is_platform_admin: boolean; note: string } | null>(null);
  // A normal (non-admin) user needs a customer — that assignment is what grants
  // product access. Without it they log in and see nothing, which is exactly the
  // "Lead Intel shows but ACQ doesn't" trap.
  const [customerId, setCustomerId] = useState("");
  const [role, setRole] = useState("tenant_user");
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    adminApi.listCustomers().then(r => {
      if (r.ok) setCustomers(r.data.customers.map(c => ({ id: c.id, name: c.name })));
    });
  }, []);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const needsCustomer = !superAdmin && !customerId;
  const canSubmit = !busy && !done && emailOk && pw.length >= 8 && pw === pw2 && !needsCustomer;

  async function submit() {
    setErr(null); setBusy(true);
    const r = await adminApi.createUser({
      email: email.trim(), password: pw,
      full_name: fullName.trim() || undefined,
      is_platform_admin: superAdmin,
      // Super-admins see every customer, so they don't need an assignment.
      ...(superAdmin ? {} : { customer_id: customerId, role }),
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setDone({ email: r.data.email, is_platform_admin: r.data.is_platform_admin, note: r.data.note });
  }

  const inputStyle = (bad: boolean) => ({
    width: "100%", padding: "10px 12px", boxSizing: "border-box" as const,
    background: COLORS.BG, border: `1px solid ${bad ? "#c0392b" : COLORS.B3}`,
    borderRadius: 6, color: COLORS.TEXT, fontSize: 14, fontFamily: FONT, marginBottom: 4,
  });
  const labelStyle = { display: "block", fontSize: 11, color: COLORS.T3, marginTop: 14, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" as const, fontWeight: 600 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, fontFamily: FONT,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.S1, border: `1px solid ${COLORS.B3}`, borderRadius: 12,
        padding: 24, width: 480, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>New user</div>
        <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 4 }}>
          Creates a login across platform-auth + ACQ + LI in one go.
        </div>

        {done ? (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 6, marginTop: 12,
              background: "rgba(78,125,61,0.08)", border: `1px solid ${COLORS.GREEN}`, fontSize: 13,
            }}>
              <div style={{ color: COLORS.TEXT, fontWeight: 600 }}>
                ✓ {done.email} created{done.is_platform_admin ? " as a platform super-admin" : ""}.
              </div>
              <div style={{ color: COLORS.T3, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{done.note}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={onCreated} style={{
                background: COLORS.GREEN, border: "none", borderRadius: 6,
                padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
              }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <label style={{ ...labelStyle, marginTop: 16 }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="new.admin@example.com" autoFocus
              style={inputStyle(email.length > 0 && !emailOk)} />

            <label style={labelStyle}>Full name <span style={{ textTransform: "none", color: COLORS.T3 }}>(optional)</span></label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" style={inputStyle(false)} />

            <label style={labelStyle}>Password</label>
            <input type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)}
              placeholder="At least 8 characters" style={{ ...inputStyle(tooShort), fontFamily: "ui-monospace, monospace" }} />
            {tooShort && <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>Too short — minimum 8 characters.</div>}

            <label style={labelStyle}>Confirm password</label>
            <input type={show ? "text" : "password"} value={pw2} onChange={e => setPw2(e.target.value)}
              placeholder="Type it again" style={{ ...inputStyle(mismatch), fontFamily: "ui-monospace, monospace" }} />
            {mismatch && <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>Passwords don't match.</div>}

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.T3, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} style={{ cursor: "pointer" }} />
              Show password
            </label>

            <label style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 16,
              padding: "12px 14px", borderRadius: 8, cursor: "pointer",
              background: superAdmin ? "rgba(255,200,80,0.08)" : COLORS.B2,
              border: `1px solid ${superAdmin ? "rgba(255,200,80,0.4)" : COLORS.B3}`,
            }}>
              <input type="checkbox" checked={superAdmin} onChange={e => setSuperAdmin(e.target.checked)} style={{ cursor: "pointer" }} />
              <span style={{ color: COLORS.TEXT, fontWeight: 600 }}>Platform super-admin</span>
              <span style={{ color: COLORS.T3, fontSize: 12 }}>— full access to every customer + this admin panel</span>
            </label>

            {!superAdmin && (
              <>
                <label style={labelStyle}>Assign to customer</label>
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                  style={{ ...inputStyle(needsCustomer), cursor: "pointer" }}>
                  <option value="">Select a customer…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: needsCustomer ? "#c0392b" : COLORS.T3, marginBottom: 8, lineHeight: 1.5 }}>
                  Required — this is what grants access. They'll get every product
                  that customer has enabled (ACQ Coach and/or Lead Intel).
                </div>

                <label style={labelStyle}>Role</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  style={{ ...inputStyle(false), cursor: "pointer" }}>
                  <option value="tenant_user">Member — normal user</option>
                  <option value="account_admin">Account admin — can manage this customer's team</option>
                </select>
              </>
            )}

            {err && (
              <div style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 6,
                background: "rgba(192,57,43,0.10)", border: "1px solid #c0392b", color: "#ff7a7a", fontSize: 12,
              }}>{err}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={onClose} disabled={busy} style={{
                background: "transparent", border: `1px solid ${COLORS.B3}`, borderRadius: 6,
                padding: "8px 14px", color: COLORS.T2, fontSize: 13, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT,
              }}>Cancel</button>
              <button onClick={submit} disabled={!canSubmit} style={{
                background: canSubmit ? COLORS.GREEN : COLORS.B2, border: "none", borderRadius: 6,
                padding: "8px 18px", color: canSubmit ? "#fff" : COLORS.T3, fontSize: 13, fontWeight: 600,
                cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: FONT, minWidth: 130,
              }}>{busy ? "Creating…" : "Create user"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18 }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, fontSize: 14, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

// ─── SetPasswordModal ────────────────────────────────────────────────────────
// Force-set a user's password from Platform Admin. Pre-validates length so
// the user sees an inline error before the request fires. After success,
// surfaces per-DB bridge results: a typical success looks "✓ all 3 backends
// updated" — a partial failure (e.g. user missing from ACQ auth.users)
// shows which side failed and lets the admin act on it.
function SetPasswordModal({
  userId, email, onClose,
}: { userId: string; email: string; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    platform_auth: { ok: boolean; created?: boolean; error?: string };
    bridges: {
      acq:       { ok: boolean; created?: boolean; error?: string };
      leadintel: { ok: boolean; created?: boolean; error?: string };
    };
    note: string;
  } | null>(null);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit = !busy && !result && pw.length >= 8 && pw === pw2;

  async function submit() {
    setErr(null);
    setBusy(true);
    const r = await adminApi.setUserPassword(userId, pw);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult({
      platform_auth: r.data.platform_auth,
      bridges: r.data.bridges,
      note: r.data.note,
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      fontFamily: FONT,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.S1, border: `1px solid ${COLORS.B3}`,
        borderRadius: 12, padding: 24, width: 480, maxWidth: "90vw",
        boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Set password</div>
        <div style={{ fontSize: 12, color: COLORS.T3, marginBottom: 18, wordBreak: "break-all" }}>
          For <strong style={{ color: COLORS.T2 }}>{email}</strong>. Writes to platform-auth + ACQ + LI in one go.
        </div>

        {result ? (
          // Success view — show per-backend outcome.
          <>
            {[
              { name: "Platform Auth", r: result.platform_auth },
              { name: "ACQ Coach",     r: result.bridges.acq },
              { name: "Lead Intel",    r: result.bridges.leadintel },
            ].map(({ name, r }) => (
              <div key={name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderRadius: 6, marginBottom: 8,
                background: r.ok ? "rgba(78,125,61,0.08)" : "rgba(192,57,43,0.10)",
                border: `1px solid ${r.ok ? COLORS.GREEN : "#c0392b"}`,
                fontSize: 12,
              }}>
                <span style={{ color: COLORS.TEXT }}>{name}</span>
                <span style={{ color: r.ok ? COLORS.GREEN : "#c0392b" }}>
                  {r.ok
                    ? (r.created ? "✓ provisioned" : "✓ updated")
                    : `✗ ${r.error || "failed"}`}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: COLORS.T3, marginTop: 12, lineHeight: 1.5 }}>
              {result.note}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={onClose} style={{
                background: COLORS.GREEN, border: "none", borderRadius: 6,
                padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: FONT,
              }}>Done</button>
            </div>
          </>
        ) : (
          // Input view
          <>
            <label style={{ display: "block", fontSize: 11, color: COLORS.T3, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
              New password
            </label>
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
              style={{
                width: "100%", padding: "10px 12px", boxSizing: "border-box",
                background: COLORS.BG, border: `1px solid ${tooShort ? "#c0392b" : COLORS.B3}`,
                borderRadius: 6, color: COLORS.TEXT, fontSize: 14,
                fontFamily: "ui-monospace, monospace", marginBottom: 4,
              }}
            />
            {tooShort && (
              <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>
                Too short — minimum 8 characters.
              </div>
            )}

            <label style={{ display: "block", fontSize: 11, color: COLORS.T3, marginTop: 14, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
              Confirm password
            </label>
            <input
              type={show ? "text" : "password"}
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              placeholder="Type it again"
              style={{
                width: "100%", padding: "10px 12px", boxSizing: "border-box",
                background: COLORS.BG, border: `1px solid ${mismatch ? "#c0392b" : COLORS.B3}`,
                borderRadius: 6, color: COLORS.TEXT, fontSize: 14,
                fontFamily: "ui-monospace, monospace", marginBottom: 4,
              }}
            />
            {mismatch && (
              <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>
                Passwords don't match.
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.T3, marginTop: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={show}
                onChange={e => setShow(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Show password
            </label>

            {err && (
              <div style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 6,
                background: "rgba(192,57,43,0.10)", border: "1px solid #c0392b",
                color: "#ff7a7a", fontSize: 12,
              }}>{err}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={onClose} disabled={busy} style={{
                background: "transparent", border: `1px solid ${COLORS.B3}`,
                borderRadius: 6, padding: "8px 14px", color: COLORS.T2,
                fontSize: 13, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT,
              }}>Cancel</button>
              <button onClick={submit} disabled={!canSubmit} style={{
                background: canSubmit ? COLORS.GREEN : COLORS.B2,
                border: "none", borderRadius: 6, padding: "8px 18px",
                color: canSubmit ? "#fff" : COLORS.T3,
                fontSize: 13, fontWeight: 600,
                cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: FONT,
                minWidth: 140,
              }}>
                {busy ? "Saving…" : "Set password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
