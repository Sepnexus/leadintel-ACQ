import { useState } from "react";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  useTenantInvitations,
  useTenantMembers,
  useInvalidateTenantUsers,
  type UserInvitation,
} from "@/hooks/useTenantInvitations";
import { InviteUserModal } from "@/components/admin/InviteUserModal";

interface Props {
  tenantId: string;
  tenantName: string;
}

function invitationStatus(inv: UserInvitation): "pending" | "accepted" | "revoked" | "expired" {
  if (inv.revoked_at) return "revoked";
  if (inv.accepted_at) return "accepted";
  if (new Date(inv.expires_at).getTime() < Date.now()) return "expired";
  return "pending";
}

function statusBadgeColor(s: string): string {
  if (s === "pending") return COLORS.AMB;
  if (s === "accepted") return COLORS.GRNL;
  if (s === "revoked") return COLORS.T3;
  if (s === "expired") return COLORS.RED;
  return COLORS.T2;
}

export function TenantUsersTab({ tenantId, tenantName }: Props) {
  const members = useTenantMembers(tenantId);
  const invitations = useTenantInvitations(tenantId);
  const invalidate = useInvalidateTenantUsers();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  async function onRemoveMember(userId: string, email: string | null, mode: "revoke_access" | "delete_account") {
    const label = email ?? "this user";
    const msg = mode === "delete_account"
      ? `Permanently DELETE the account for ${label}?\n\nThis removes them from the tenant AND deletes their login. They will not be able to sign in again unless re-invited and re-registered. This cannot be undone.`
      : `Remove ${label} from this tenant?\n\nTheir login stays intact, but they will lose access to this tenant's data immediately.`;
    if (!confirm(msg)) return;
    setRemovingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("remove-tenant-member", {
        body: { tenant_id: tenantId, user_id: userId, mode },
      });
      if (error || !data?.ok) {
        toast.error(data?.error ?? error?.message ?? "Failed to remove user");
        return;
      }
      toast.success(mode === "delete_account" ? "User account deleted" : "User removed from tenant");
      invalidate(tenantId);
    } finally {
      setRemovingUserId(null);
    }
  }

  async function onRevoke(invitationId: string) {
    if (!confirm("Revoke this invitation? The magic link will stop working immediately.")) return;
    setRevokingId(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke("revoke-invitation", {
        body: { invitation_id: invitationId },
      });
      if (error || !data?.ok) {
        toast.error(data?.error ?? error?.message ?? "Failed to revoke");
        return;
      }
      toast.success("Invitation revoked");
      invalidate(tenantId);
    } finally {
      setRevokingId(null);
    }
  }

  const memberRows = members.data ?? [];
  const inviteRows = invitations.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontFamily: "'League Spartan', sans-serif", fontSize: 16, color: COLORS.TEXT }}>
          Members ({memberRows.length})
        </h3>
        <Button onClick={() => setInviteOpen(true)}>+ Invite user</Button>
      </div>

      <section>
        <div style={{ border: "1px solid " + COLORS.B1, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: COLORS.S2 }}>
              <tr style={{ color: COLORS.T2, textAlign: "left" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Joined</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.isLoading && (
                <tr><td colSpan={4} style={{ padding: 16, color: COLORS.T2 }}>Loading…</td></tr>
              )}
              {!members.isLoading && memberRows.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 16, color: COLORS.T2 }}>No members yet.</td></tr>
              )}
              {memberRows.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid " + COLORS.B1, color: COLORS.TEXT }}>
                  <td style={{ padding: "10px 12px" }}>{m.email ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>{m.full_name ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: COLORS.T2 }}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                      <Button
                        variant="outline"
                        onClick={() => onRemoveMember(m.user_id, m.email, "revoke_access")}
                        disabled={removingUserId === m.user_id}
                        title="Remove from tenant (keeps their login)"
                      >
                        {removingUserId === m.user_id ? "Working…" : "Remove from tenant"}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => onRemoveMember(m.user_id, m.email, "delete_account")}
                        disabled={removingUserId === m.user_id}
                        title="Permanently delete this user's account"
                      >
                        Delete account
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 style={{
          margin: "0 0 12px", fontFamily: "'League Spartan', sans-serif",
          fontSize: 16, color: COLORS.TEXT,
        }}>
          Invitations ({inviteRows.length})
        </h3>
        <div style={{ border: "1px solid " + COLORS.B1, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: COLORS.S2 }}>
              <tr style={{ color: COLORS.T2, textAlign: "left" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Created</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Expires</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.isLoading && (
                <tr><td colSpan={5} style={{ padding: 16, color: COLORS.T2 }}>Loading…</td></tr>
              )}
              {!invitations.isLoading && inviteRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 16, color: COLORS.T2 }}>No invitations yet.</td></tr>
              )}
              {inviteRows.map((inv) => {
                const status = invitationStatus(inv);
                return (
                  <tr key={inv.id} style={{ borderTop: "1px solid " + COLORS.B1, color: COLORS.TEXT }}>
                    <td style={{ padding: "10px 12px" }}>{inv.email}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        color: statusBadgeColor(status),
                        fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                      }}>{status}</span>
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.T2 }}>
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px", color: COLORS.T2 }}>
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {status === "pending" && (
                        <Button
                          variant="outline"
                          onClick={() => onRevoke(inv.id)}
                          disabled={revokingId === inv.id}
                        >
                          {revokingId === inv.id ? "Revoking…" : "Revoke"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <InviteUserModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tenantId={tenantId}
        tenantName={tenantName}
      />
    </div>
  );
}