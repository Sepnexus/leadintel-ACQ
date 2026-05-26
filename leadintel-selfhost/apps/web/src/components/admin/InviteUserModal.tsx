import { useEffect, useState } from "react";
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
import { useInvalidateTenantUsers } from "@/hooks/useTenantInvitations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; url: string; expiresAt: string };

export function InviteUserModal({ open, onOpenChange, tenantId, tenantName }: Props) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const invalidate = useInvalidateTenantUsers();

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPhase({ kind: "idle" });
    }
  }, [open]);

  async function onCreate() {
    setPhase({ kind: "creating" });
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          tenant_id: tenantId,
          email: email.trim(),
          app_origin: window.location.origin,
        },
      });
      if (error || !data?.ok) {
        toast.error(data?.error ?? error?.message ?? "Failed to create invitation");
        setPhase({ kind: "idle" });
        return;
      }
      setPhase({ kind: "ready", url: data.accept_url, expiresAt: data.expires_at });
      invalidate(tenantId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setPhase({ kind: "idle" });
    }
  }

  async function onCopy() {
    if (phase.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(phase.url);
      toast.success("Magic link copied to clipboard");
    } catch {
      toast.error("Copy failed — select the link and copy manually");
    }
  }

  const canCreate = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && phase.kind !== "creating";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: COLORS.S1, border: "1px solid " + COLORS.B2, color: COLORS.TEXT }}>
        <DialogHeader>
          <DialogTitle style={{ color: COLORS.TEXT }}>Invite user to {tenantName}</DialogTitle>
          <DialogDescription style={{ color: COLORS.T2 }}>
            Generates a magic link valid for 7 days. Send it to the user via SMS, WhatsApp, or any channel.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "ready" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ color: COLORS.GRNL, fontSize: 13 }}>
              ✓ Invitation created. Expires {new Date(phase.expiresAt).toLocaleString()}.
            </div>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>Magic link</Label>
              <textarea
                readOnly
                value={phase.url}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  width: "100%", marginTop: 4, padding: 10, fontSize: 12,
                  background: COLORS.S2, color: COLORS.TEXT, border: "1px solid " + COLORS.B2,
                  borderRadius: 6, fontFamily: "monospace", minHeight: 80, resize: "vertical",
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
            <div>
              <Label style={{ color: COLORS.T2, fontSize: 12 }}>Email address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={phase.kind === "creating"}
                style={{ background: COLORS.S2, borderColor: COLORS.B2, color: COLORS.TEXT, marginTop: 4 }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {phase.kind === "ready" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
              <Button onClick={onCopy}>Copy link</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={onCreate} disabled={!canCreate}>
                {phase.kind === "creating" ? "Creating…" : "Create invitation"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}