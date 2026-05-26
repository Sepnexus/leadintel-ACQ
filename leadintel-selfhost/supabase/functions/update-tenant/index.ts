import { createAdminClient, requireUser, TenantContextError } from "../_shared/tenantContext.ts";
import { validateGhlCredentials } from "../_shared/ghlValidate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_STATUS = new Set(["active", "paused", "disabled"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId } = await requireUser(req);
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role !== "super_admin") {
      return json({ ok: false, error: "super_admin required" }, 403);
    }
    const actorEmail = profile?.email ?? null;

    const body = await req.json().catch(() => ({} as any));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
    const updates = body?.updates ?? {};
    if (!tenantId) return json({ ok: false, error: "tenant_id is required" }, 200);
    if (!updates || typeof updates !== "object") {
      return json({ ok: false, error: "updates object is required" }, 200);
    }

    // Load current tenant
    const { data: existing, error: loadErr } = await admin
      .from("tenants")
      .select("id, name, status, plan_type, ghl_location_id, ghl_pit_token")
      .eq("id", tenantId)
      .maybeSingle();
    if (loadErr || !existing) {
      return json({ ok: false, error: "Tenant not found" }, 200);
    }

    // Validate inputs
    const patch: Record<string, any> = {};
    const changedFields: string[] = [];
    let tokenRotated = false;

    if (typeof updates.name === "string") {
      const v = updates.name.trim();
      if (v.length < 1 || v.length > 100) {
        return json({ ok: false, error: "name must be 1-100 characters" }, 200);
      }
      if (v !== existing.name) {
        patch.name = v;
        changedFields.push("name");
      }
    }

    if (typeof updates.status === "string") {
      if (!ALLOWED_STATUS.has(updates.status)) {
        return json({ ok: false, error: "status must be active|paused|disabled" }, 200);
      }
      if (updates.status !== existing.status) {
        patch.status = updates.status;
        changedFields.push("status");
      }
    }

    if (typeof updates.plan_type === "string") {
      const v = updates.plan_type.trim();
      if (v.length > 50) return json({ ok: false, error: "plan_type too long" }, 200);
      if (v !== existing.plan_type) {
        patch.plan_type = v;
        changedFields.push("plan_type");
      }
    }

    if (typeof updates.ghl_pit_token === "string" && updates.ghl_pit_token.trim()) {
      const newToken = updates.ghl_pit_token.trim();
      if (newToken !== existing.ghl_pit_token) {
        // Validate against GHL using the existing location_id
        if (!existing.ghl_location_id) {
          return json({ ok: false, error: "Tenant has no ghl_location_id; cannot validate token" }, 200);
        }
        const result = await validateGhlCredentials(existing.ghl_location_id, newToken);
        if (!result.ok) {
          return json({ ok: false, error: `Token validation failed: ${result.error}` }, 200);
        }
        patch.ghl_pit_token = newToken;
        tokenRotated = true;
      }
    }

    if (Object.keys(patch).length === 0) {
      return json({ ok: true, tenant: stripToken(existing), note: "no changes" });
    }

    patch.updated_at = new Date().toISOString();

    const { data: updated, error: updErr } = await admin
      .from("tenants")
      .update(patch)
      .eq("id", tenantId)
      .select("id, name, status, plan_type, ghl_location_id, created_at, updated_at")
      .maybeSingle();
    if (updErr || !updated) {
      return json({ ok: false, error: `update failed: ${updErr?.message ?? "unknown"}` }, 500);
    }

    // Audit entries
    const auditRows: any[] = [];
    const nonTokenChanged = changedFields.length > 0;

    if (nonTokenChanged) {
      auditRows.push({
        actor_user_id: userId,
        actor_email: actorEmail,
        action: "tenant.updated",
        target_type: "tenant",
        target_id: tenantId,
        metadata: { changed_fields: changedFields },
      });
      // Special status transitions
      if (changedFields.includes("status")) {
        if (patch.status === "disabled") {
          auditRows.push({
            actor_user_id: userId,
            actor_email: actorEmail,
            action: "tenant.disabled",
            target_type: "tenant",
            target_id: tenantId,
            metadata: { previous_status: existing.status },
          });
        } else if (existing.status === "disabled" && patch.status === "active") {
          auditRows.push({
            actor_user_id: userId,
            actor_email: actorEmail,
            action: "tenant.reactivated",
            target_type: "tenant",
            target_id: tenantId,
            metadata: { previous_status: existing.status },
          });
        }
      }
    }

    if (tokenRotated) {
      auditRows.push({
        actor_user_id: userId,
        actor_email: actorEmail,
        action: "tenant.token_rotated",
        target_type: "tenant",
        target_id: tenantId,
        metadata: {},
      });
    }

    if (auditRows.length) {
      await admin.from("audit_log").insert(auditRows);
    }

    return json({ ok: true, tenant: updated });
  } catch (e) {
    if (e instanceof TenantContextError) {
      return json({ ok: false, error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("update-tenant error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

function stripToken(t: any) {
  const { ghl_pit_token: _omit, ...rest } = t ?? {};
  return rest;
}