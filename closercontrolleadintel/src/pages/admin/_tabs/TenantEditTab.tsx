import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { COLORS } from "@/utils/leadUtils";
import { supabase } from "@/integrations/supabase/client";
import type { AdminTenantOverviewRow } from "@/hooks/useAdminTenantsOverview";

export function TenantEditTab({
  tenant,
  onSaved,
}: {
  tenant: AdminTenantOverviewRow;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(tenant.name);
  const [status, setStatus] = useState(tenant.status);
  const [planType, setPlanType] = useState(tenant.plan_type ?? "");
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState("");
  const [tokenState, setTokenState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  async function testToken() {
    setTokenState("testing");
    setTokenError(null);
    try {
      const { data, error } = await supabase.functions.invoke("validate-ghl-credentials", {
        body: { ghl_location_id: tenant.ghl_location_id, ghl_pit_token: token.trim() },
      });
      if (error) throw error;
      if ((data as any)?.ok === true) setTokenState("ok");
      else { setTokenState("fail"); setTokenError((data as any)?.error ?? "Token rejected"); }
    } catch (e: any) {
      setTokenState("fail");
      setTokenError(e?.message ?? "Test failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const updates: any = {};
      if (name !== tenant.name) updates.name = name.trim();
      if (status !== tenant.status) updates.status = status;
      if ((planType || "") !== (tenant.plan_type ?? "")) updates.plan_type = planType.trim();
      if (showToken && token.trim()) {
        if (tokenState !== "ok") {
          toast.error("Test the token before saving.");
          setSaving(false);
          return;
        }
        updates.ghl_pit_token = token.trim();
      }
      if (Object.keys(updates).length === 0) {
        toast.info("No changes to save.");
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("update-tenant", {
        body: { tenant_id: tenant.id, updates },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Update failed");
      toast.success("Tenant updated");
      setToken("");
      setShowToken(false);
      setTokenState("idle");
      onSaved();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const next = tenant.status === "active" ? "disabled" : "active";
    const verb = next === "disabled" ? "Disable" : "Re-enable";
    if (!window.confirm(`${verb} tenant "${tenant.name}"?`)) return;
    setTogglingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-tenant", {
        body: { tenant_id: tenant.id, updates: { status: next } },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Update failed");
      toast.success(`Tenant ${next === "disabled" ? "disabled" : "re-enabled"}`);
      onSaved();
    } catch (e: any) {
      toast.error(`Failed: ${e?.message ?? "unknown"}`);
    } finally {
      setTogglingStatus(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data, error } = await supabase.functions.invoke("delete-tenant", {
        body: { tenant_id: tenant.id },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Delete failed");
      toast.success(`Tenant ${tenant.name} removed successfully`);
      navigate("/admin/tenants");
    } catch (e: any) {
      setDeleteError(e?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <div style={{
      background: COLORS.S1, border: "1px solid " + COLORS.B1, borderRadius: 10, padding: 20,
      maxWidth: 600,
    }}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
      </Field>
      <Field label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="disabled">disabled</option>
        </select>
      </Field>
      <Field label="Plan type">
        <input value={planType} onChange={(e) => setPlanType(e.target.value)} style={input} />
      </Field>
      <Field label="Location ID">
        <div style={{ color: COLORS.T2, fontFamily: "monospace", fontSize: 12 }}>
          {tenant.ghl_location_id}
          <div style={{ color: COLORS.T3, fontFamily: "'Open Sans', sans-serif", fontSize: 11, marginTop: 4 }}>
            Location ID cannot be changed after tenant creation.
          </div>
        </div>
      </Field>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + COLORS.B1 }}>
        <button
          onClick={() => { setShowToken((v) => !v); setTokenState("idle"); setToken(""); }}
          style={{
            background: "transparent", border: "1px solid " + COLORS.B2,
            color: COLORS.T2, padding: "6px 12px", borderRadius: 8, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {showToken ? "Cancel token rotation" : "Rotate GHL token"}
        </button>

        {showToken && (
          <div style={{ marginTop: 12 }}>
            <input
              type="password"
              placeholder="New PIT token"
              value={token}
              onChange={(e) => { setToken(e.target.value); setTokenState("idle"); }}
              style={{ ...input, width: "100%" }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <button
                onClick={testToken}
                disabled={!token.trim() || tokenState === "testing"}
                style={{
                  background: COLORS.S2, border: "1px solid " + COLORS.B2,
                  color: COLORS.TEXT, padding: "6px 12px", borderRadius: 8,
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {tokenState === "testing" ? "Testing…" : "Test before saving"}
              </button>
              {tokenState === "ok" && <span style={{ color: COLORS.GRN, fontSize: 12 }}>✓ Token valid</span>}
              {tokenState === "fail" && <span style={{ color: COLORS.RED, fontSize: 12 }}>✗ {tokenError}</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: COLORS.GRN, color: "#fff", border: "none",
            padding: "10px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >{saving ? "Saving…" : "Save changes"}</button>
      </div>

      <div style={{
        marginTop: 32, paddingTop: 20,
        borderTop: "1px solid " + COLORS.RED + "60",
      }}>
        <div style={{
          color: COLORS.RED, fontSize: 11, textTransform: "uppercase",
          letterSpacing: 0.5, fontWeight: 700, marginBottom: 12,
        }}>Danger Zone</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={toggleStatus}
            disabled={togglingStatus}
            style={{
              background: "transparent", border: "1px solid " + COLORS.B2,
              color: COLORS.T2, padding: "8px 14px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: togglingStatus ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {togglingStatus ? "Working…" : (tenant.status === "active" ? "Disable tenant" : "Re-enable tenant")}
          </button>

          <button
            onClick={() => { setShowDeleteDialog(true); setConfirmText(""); setDeleteError(null); }}
            style={{
              background: COLORS.RED, color: "#fff", border: "none",
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Remove tenant</button>
        </div>

        <div style={{ color: COLORS.T3, fontSize: 11, marginTop: 8 }}>
          Removing a tenant permanently deletes all contacts, messages, notes, and user access.
        </div>
      </div>
    </div>

    {showDeleteDialog && (
      <div
        onClick={() => !deleting && setShowDeleteDialog(false)}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: COLORS.S1, border: "1px solid " + COLORS.RED + "60",
            borderRadius: 12, padding: 24, maxWidth: 480, width: "90%",
          }}
        >
          <div style={{
            fontFamily: "'League Spartan', sans-serif", fontSize: 20,
            color: COLORS.TEXT, marginBottom: 12,
          }}>Remove {tenant.name}?</div>
          <div style={{ color: COLORS.T2, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            This will permanently delete all data for this tenant including contacts,
            messages, notes, opportunities, conversations, and user access. This cannot be undone.
          </div>
          <div style={{ color: COLORS.T2, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Type the tenant name to confirm
          </div>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={tenant.name}
            style={{ ...input, width: "100%", marginBottom: 12 }}
            autoFocus
          />
          {deleteError && (
            <div style={{
              color: COLORS.RED, fontSize: 12, marginBottom: 12,
              padding: 8, background: COLORS.RED + "15", borderRadius: 6,
            }}>{deleteError}</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              style={{
                background: "transparent", border: "1px solid " + COLORS.B2,
                color: COLORS.T2, padding: "8px 14px", borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >Cancel</button>
            <button
              onClick={confirmDelete}
              disabled={deleting || confirmText !== tenant.name}
              style={{
                background: COLORS.RED, color: "#fff", border: "none",
                padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: (deleting || confirmText !== tenant.name) ? "not-allowed" : "pointer",
                opacity: (deleting || confirmText !== tenant.name) ? 0.5 : 1,
                fontFamily: "inherit",
              }}
            >{deleting ? "Removing…" : "Remove tenant"}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

const input: React.CSSProperties = {
  background: COLORS.S2, border: "1px solid " + COLORS.B2, color: COLORS.TEXT,
  padding: "8px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none",
  width: "100%",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: COLORS.T2, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}