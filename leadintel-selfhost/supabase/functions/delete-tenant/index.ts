import { createAdminClient, requireUser } from "../_shared/tenantContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

type DeleteStep = {
  table: string;
  batch: boolean;
  batchSize?: number;
};

const DELETE_STEPS: DeleteStep[] = [
  { table: "ghl_messages", batch: true, batchSize: 1000 },
  { table: "ghl_contact_notes", batch: true, batchSize: 1000 },
  { table: "ghl_contact_tags", batch: true, batchSize: 1000 },
  { table: "ghl_conversations", batch: false },
  { table: "ghl_opportunities", batch: false },
  { table: "ghl_contacts", batch: false },
  { table: "ghl_users", batch: false },
  { table: "ghl_tasks", batch: false },
  { table: "lead_intelligence", batch: false },
  { table: "day_briefing_cache", batch: false },
  { table: "sync_state", batch: false },
  { table: "sync_history", batch: false },
  { table: "tenant_pipelines", batch: false },
  { table: "user_invitations", batch: false },
  { table: "wallets", batch: false },
  { table: "wallet_transactions", batch: false },
  { table: "billing_settings", batch: false },
  { table: "usage_events", batch: false },
  { table: "tenant_users", batch: false },
];

async function deleteTenantRows(admin: ReturnType<typeof createAdminClient>, tenantId: string) {
  const deleted: Record<string, number> = {};

  for (const step of DELETE_STEPS) {
    let total = 0;

    let keepDeleting = true;
    while (keepDeleting) {
      const query = admin
        .from(step.table)
        .delete({ count: "exact" })
        .eq("tenant_id", tenantId);
      const { count, error } = step.batch
        ? await query.limit(step.batchSize ?? 1000)
        : await query;

      if (error) {
        throw new Error(`Failed deleting ${step.table}: ${error.message}`);
      }

      const removed = count ?? 0;
      total += removed;
      keepDeleting = step.batch && removed >= (step.batchSize ?? 1000);
    }

    deleted[step.table] = total;
    console.log(`[delete-tenant] deleted ${total} rows from ${step.table}`);
  }

  const { count: tenantCount, error: tenantDeleteError } = await admin
    .from("tenants")
    .delete({ count: "exact" })
    .eq("id", tenantId);

  if (tenantDeleteError) {
    throw new Error(`Failed deleting tenant: ${tenantDeleteError.message}`);
  }
  if ((tenantCount ?? 0) === 0) {
    throw new Error("tenant not found");
  }

  deleted.tenants = tenantCount ?? 0;
  return deleted;
}

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
      return json({ ok: false, error: "super_admin required" });
    }
    const actorEmail = profile?.email ?? null;

    const body = await req.json().catch((): Record<string, unknown> => ({}));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id.trim() : "";
    if (!tenantId) return json({ ok: false, error: "tenant_id is required" });

    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, name, ghl_location_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr) return json({ ok: false, error: tErr.message }, 500);
    if (!tenant) return json({ ok: false, error: "tenant not found" });

    const { data: ownMembership } = await admin
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownMembership) {
      return json({ ok: false, error: "Cannot delete your own tenant" });
    }

    const { data: members } = await admin
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId);
    const memberIds = (members ?? []).map((m) => m.user_id);

    const deleted = await deleteTenantRows(admin, tenantId);

    await admin.from("audit_log").insert({
      action: "tenant.deleted",
      target_type: "tenant",
      target_id: tenant.id,
      actor_user_id: userId,
      actor_email: actorEmail,
      metadata: {
        name: tenant.name,
        ghl_location_id: tenant.ghl_location_id,
        deleted_at: new Date().toISOString(),
      },
    });

    const orphans: string[] = [];
    try {
      for (const uid of memberIds) {
        const { data: stillMember } = await admin
          .from("tenant_users")
          .select("tenant_id")
          .eq("user_id", uid)
          .limit(1);
        if (!stillMember || stillMember.length === 0) {
          const { data: u } = await admin.from("users").select("role").eq("id", uid).maybeSingle();
          if (u?.role === "super_admin") continue;
          const { error: authErr } = await admin.auth.admin.deleteUser(uid);
          if (authErr) {
            console.warn(`[delete-tenant] failed to delete auth user ${uid}:`, authErr.message);
          } else {
            orphans.push(uid);
          }
        }
      }
    } catch (e) {
      console.warn("[delete-tenant] orphan cleanup error (non-fatal):", e);
    }

    return json({ ok: true, name: tenant.name, orphans_removed: orphans.length, deleted });
  } catch (e: unknown) {
    return json({ ok: false, error: errorMessage(e) });
  }
});
