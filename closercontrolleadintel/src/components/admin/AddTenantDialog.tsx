import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COLORS } from "@/utils/leadUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TENANTS_LIST_KEY } from "@/hooks/useTenantsList";
import { SUPER_ADMIN_TENANT_KEY } from "@/hooks/useCurrentTenant";

type Phase =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "tested_ok"; locationName: string }
  | { kind: "tested_failed"; error: string }
  | { kind: "creating" }
  | { kind: "sync_started"; tenantName: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTenantDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (!open) {
      setName("");
      setLocationId("");
      setToken("");
      setPhase({ kind: "idle" });
    }
  }, [open]);

  // Any field edit invalidates a passing test.
  const onField = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (phase.kind === "tested_ok" || phase.kind === "tested_failed") {
      setPhase({ kind: "idle" });
    }
  };

  const canTest =
    name.trim().length > 0 &&
    locationId.trim().length > 0 &&
    !/\s/.test(locationId.trim()) &&
    token.trim().length > 0 &&
    phase.kind !== "testing" &&
    phase.kind !== "creating";

  const canCreate = phase.kind === "tested_ok";

  async function onTest() {
    setPhase({ kind: "testing" });
    try {
      const { data, error } = await supabase.functions.invoke("validate-ghl-credentials", {
        body: {
          ghl_location_id: locationId.trim(),
          ghl_pit_token: token.trim(),
        },
      });
      if (error) {
        setPhase({ kind: "tested_failed", error: error.message ?? "Validation failed" });
        return;
      }
      if (data?.ok) {
        setPhase({ kind: "tested_ok", locationName: data.location?.name ?? "Unnamed location" });
      } else {
        setPhase({ kind: "tested_failed", error: data?.error ?? "Validation failed" });
      }
    } catch (e) {
      setPhase({ kind: "tested_failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function onCreate() {
    setPhase({ kind: "creating" });
    try {
      const { data, error } = await supabase.functions.invoke("create-tenant", {
        body: {
          name: name.trim(),
          ghl_location_id: locationId.trim(),
          ghl_pit_token: token.trim(),
        },
      });
      if (error || !data?.ok) {
        const msg = data?.error ?? error?.message ?? "Failed to create tenant";
        setPhase({ kind: "tested_ok", locationName: data?.location?.name ?? "" });
        toast.error(msg);
        return;
      }
      const newTenantId: string = data.tenant_id;
      const tenantName: string = data.name;
      // Refresh tenants list so the switcher shows the new entry.
      await qc.invalidateQueries({ queryKey: TENANTS_LIST_KEY });
      // Auto-select the new tenant for the current super admin.
      localStorage.setItem(SUPER_ADMIN_TENANT_KEY, newTenantId);
      toast.success("Tenant created. Running initial sync…");
      // Fire-and-forget the initial full sync.
      supabase.functions
        .invoke("ghl-sync", {
          body: {
            tenant_id: newTenantId,
            mode: "full",
            resource: "all",
            trigger_initial: true,
          },
        })
        .catch((e) => console.warn("initial sync invoke failed", e));
      setPhase({ kind: "sync_started", tenantName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setPhase({ kind: "tested_ok", locationName: "" });
    }
  }

  const inputsDisabled = phase.kind === "creating" || phase.kind === "sync_started";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: COLORS.S1,
          border: "1px solid " + COLORS.B2,
          color: COLORS.TEXT,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: COLORS.TEXT }}>Add new tenant</DialogTitle>
          <DialogDescription style={{ color: COLORS.T2 }}>
            Connect a GHL sub-account. Test the credentials before creating.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "sync_started" ? (
          <div style={{ padding: "12px 0" }}>
            <p style={{ color: COLORS.TEXT, marginBottom: 8 }}>
              ✓ <strong>{phase.tenantName}</strong> created.
            </p>
            <p style={{ color: COLORS.T2, fontSize: 13 }}>
              Initial sync running — this can take 1-2 minutes. You can close this dialog;
              the new tenant is now selected in the switcher.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>Tenant name</Label>
              <Input
                value={name}
                onChange={(e) => onField(setName)(e.target.value)}
                placeholder="Acme Properties"
                maxLength={100}
                disabled={inputsDisabled}
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
            </div>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>GHL Location ID</Label>
              <Input
                value={locationId}
                onChange={(e) => onField(setLocationId)(e.target.value)}
                placeholder="abc123XYZ..."
                disabled={inputsDisabled}
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
            </div>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>GHL Private Integration Token</Label>
              <Input
                type="password"
                value={token}
                onChange={(e) => onField(setToken)(e.target.value)}
                placeholder="pit-..."
                disabled={inputsDisabled}
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
              <p style={{ color: COLORS.T3, fontSize: 11, marginTop: 4 }}>
                Token starts with <code>pit-</code> — generated in the tenant&apos;s GHL Settings → Private Integrations.
              </p>
            </div>

            {phase.kind === "tested_ok" && (
              <div style={{ color: COLORS.GRNL, fontSize: 13 }}>
                ✓ Connected to: <strong>{phase.locationName}</strong>
              </div>
            )}
            {phase.kind === "tested_failed" && (
              <div style={{ color: COLORS.RED, fontSize: 13 }}>
                {phase.error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase.kind === "sync_started" ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={onTest}
                disabled={!canTest}
              >
                {phase.kind === "testing" ? "Testing…" : "Test connection"}
              </Button>
              <Button onClick={onCreate} disabled={!canCreate}>
                Create tenant
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}