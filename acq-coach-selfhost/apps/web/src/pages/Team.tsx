import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, ArrowLeft, UserPlus, AlertCircle, Trash2, ShieldCheck, Pencil, Check, X } from "lucide-react";
import { AccountMovedBanner } from "@/components/AccountMovedBanner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function TeamPage({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  // Team management has moved to the platform Account page. Show a full-page
  // redirect-style message instead of the legacy in-app team manager.
  return <MovedPage onBack={onBack} what="Team management" tabHint="team" />;
}

function MovedPage({ what, tabHint, onBack }: { what: string; tabHint: "team" | "billing"; onBack: () => void }) {
  const launcherUrl = (() => {
    if (typeof window === "undefined") return `http://localhost:8080/#/account/${tabHint}`;
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? `http://localhost:8080/#/account/${tabHint}` : `/#/account/${tabHint}`;
  })();
  return (
    <div style={{
      minHeight: "100vh", background: "#000", color: "#f4f4f4",
      fontFamily: "'Open Sans', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24,
    }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
          color: "#7eb56a", textTransform: "uppercase", marginBottom: 14 }}>Moved</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>{what} has moved to your Account</h2>
        <p style={{ color: "#999", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 22px" }}>
          Manage your team, billing, and integrations in one place — the same wallet and members apply across ACQ Coach and Lead Intel.
        </p>
        <a href={launcherUrl} style={{
          display: "inline-block", padding: "10px 22px", borderRadius: 8,
          background: "#4e7d3d", color: "#fff", textDecoration: "none",
          fontSize: 13, fontWeight: 700, letterSpacing: "0.02em",
        }}>Open Account → {tabHint === "team" ? "Team" : "Billing"}</a>
        <div>
          <button onClick={onBack} style={{
            marginTop: 16, background: "transparent", border: "1px solid #1c1c1c",
            color: "#999", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
          }}>← Back to ACQ Coach</button>
        </div>
      </div>
    </div>
  );
}

function _LegacyTeamPage({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  const { session } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [ghlUsers, setGhlUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", ghl_user_id: "" });
  const [busy, setBusy] = useState(false);

  const callAdmin = async (b: any) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify(b),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed");
    return d;
  };
  const callProxy = async (b: any) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ghl-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify(b),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed");
    return d;
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [t, u] = await Promise.all([
        callAdmin({ action: "list-team", account_id: accountId }),
        callProxy({ action: "list-users", account_id: accountId }).catch(() => ({ users: [] })),
      ]);
      setTeam(t.team || []);
      setGhlUsers(u.users || []);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [accountId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await callAdmin({ action: "create-rep", account_id: accountId, ...form });
      setForm({ email: "", password: "", ghl_user_id: "" });
      setShowCreate(false);
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const updateAssign = async (user_id: string, ghl_user_ids: string[]) => {
    try {
      await callAdmin({ action: "set-rep-assignment", account_id: accountId, user_id, ghl_user_ids });
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const remove = async (user_id: string) => {
    if (!confirm("Remove this team member?")) return;
    try {
      await callAdmin({ action: "remove-team-member", account_id: accountId, user_id });
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const adminCount = team.filter(m => m.role !== "rep").length;
  const repCount = team.filter(m => m.role === "rep").length;

  return (
    <div className="cc-admin bg-background text-foreground" style={{ fontFamily: "'Open Sans', sans-serif", height: "100vh", overflowY: "auto" }}>
      <AccountMovedBanner what="Team management" />
      {/* Sticky header bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none tracking-wide">Team Management</div>
              <div className="text-[11px] text-muted-foreground mt-1">Reps &amp; admins for this Customer</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onBack} className="h-8">
            <ArrowLeft className="h-3 w-3 mr-1.5" /> Back to dashboard
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 pb-20">
        {/* Stat row + invite CTA */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total members</div>
            <div className="font-display text-2xl font-bold">{team.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Admins</div>
            <div className="font-display text-2xl font-bold">{adminCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reps</div>
            <div className="font-display text-2xl font-bold">{repCount}</div>
          </div>
        </div>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs px-3 py-2 mb-4 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" /> {err}
          </div>
        )}

        {/* Members card */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Members</div>
              <span className="text-xs text-muted-foreground">— {team.length}</span>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreate(s => !s)}
              className="h-8 text-[11px] uppercase tracking-wider font-bold"
            >
              <UserPlus className="h-3 w-3 mr-1.5" /> Invite Rep
            </Button>
          </div>

          {showCreate && (
            <form onSubmit={create} className="px-5 py-4 border-b border-border bg-muted/20 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-center">
              <Input type="email" required placeholder="Rep email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="h-9 text-xs" />
              <Input type="password" required placeholder="Password (min 6)" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="h-9 text-xs" />
              <select
                value={form.ghl_user_id}
                onChange={e => setForm(p => ({ ...p, ghl_user_id: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground"
              >
                <option value="">— Assign GHL user (optional) —</option>
                {ghlUsers.map(u => <option key={u.ghl_user_id} value={u.ghl_user_id}>{u.name || u.email}</option>)}
              </select>
              <Button type="submit" disabled={busy} size="sm" className="h-9 text-[11px] uppercase tracking-wider font-bold">
                {busy ? "…" : "Create"}
              </Button>
            </form>
          )}

          {loading ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground">Loading…</div>
          ) : team.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground">No team members yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {team.map(m => (
                <div key={m.user_id} className="px-5 py-4 grid grid-cols-1 md:grid-cols-[2fr_2fr_auto] gap-4 items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-md bg-muted border border-border flex items-center justify-center text-[11px] font-bold uppercase text-muted-foreground shrink-0">
                      {(m.email || "?").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{m.email}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{m.role}</div>
                    </div>
                  </div>
                  <div>
                    {m.role === "rep" ? (
                      <AssignedGhlUsers
                        member={m}
                        ghlUsers={ghlUsers}
                        onSave={(ids) => updateAssign(m.user_id, ids)}
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Full Customer access
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => remove(m.user_id)}
                    className="h-8 text-[11px] text-destructive hover:text-destructive border-border hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3 mr-1.5" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssignedGhlUsers({ member, ghlUsers, onSave }: { member: any; ghlUsers: any[]; onSave: (ids: string[]) => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(member.ghl_user_ids || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(member.ghl_user_ids || []); }, [member.ghl_user_ids]);

  const nameFor = (id: string) => {
    const u = ghlUsers.find(x => x.ghl_user_id === id);
    return u?.name || u?.email || id;
  };
  const assigned: string[] = member.ghl_user_ids || [];

  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned GHL users</div>
          <button
            type="button"
            onClick={() => { setDraft(assigned); setEditing(true); }}
            className="text-[10px] uppercase tracking-wider text-primary hover:underline flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
        {assigned.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">None assigned</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assigned.map(id => (
              <span key={id} className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                {nameFor(id)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const toggle = (id: string) => {
    setDraft(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Select GHL users</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => { setSaving(true); try { await onSave(draft); setEditing(false); } finally { setSaving(false); } }}
            className="text-[10px] uppercase tracking-wider text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(assigned); setEditing(false); }}
            className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background divide-y divide-border">
        {ghlUsers.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No GHL users available.</div>
        ) : ghlUsers.map(u => {
          const checked = draft.includes(u.ghl_user_id);
          return (
            <label key={u.ghl_user_id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={checked} onChange={() => toggle(u.ghl_user_id)} className="accent-primary" />
              <span className="truncate">{u.name || u.email}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
