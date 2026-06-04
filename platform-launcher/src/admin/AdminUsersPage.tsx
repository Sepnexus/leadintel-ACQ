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
  }, [q]);

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
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by email or name…"
          style={{
            background: COLORS.B2, color: COLORS.TEXT, border: `1px solid ${COLORS.B3}`,
            borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: FONT,
            width: 280, outline: "none",
          }}
        />
      </div>

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
          {isAdmin && (
            <span style={{
              fontSize: 10, padding: "4px 10px", borderRadius: 4,
              background: "rgba(255,200,80,0.12)", color: "#ffc966",
              border: "1px solid rgba(255,200,80,0.35)",
              letterSpacing: "0.06em", fontWeight: 700, fontFamily: "ui-monospace, monospace",
            }}>PLATFORM ADMIN</span>
          )}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.S1, border: `1px solid ${COLORS.B2}`, borderRadius: 10, marginBottom: 18 }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.B2}`, fontSize: 14, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}
