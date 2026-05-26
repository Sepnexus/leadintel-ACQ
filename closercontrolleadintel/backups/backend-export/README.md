# Backend export — Closer Control Lead Intel
Generated 2026-05-26. Source: Lovable Cloud / Supabase project `wgnlnorxhfephwshuzvr`.

## Files

| File | Purpose | Restore |
|------|---------|---------|
| `01_public_schema.sql` | Full DDL of `public` schema (tables, indexes, RLS, functions, triggers). | `psql $NEW_DB -f 01_public_schema.sql` |
| `02_public_data_small_inserts.sql` | INSERTs for config/reference tables. | `psql $NEW_DB -f 02_public_data_small_inserts.sql` |
| `03_public_data_big.dump` | Custom-format dump of large GHL tables (contacts, tags, notes, conversations, opportunities, tasks, sync_history). 178 MB. | `pg_restore -d $NEW_DB --data-only 03_public_data_big.dump` |
| `03b_ghl_messages.dump` | Custom-format dump of `ghl_messages` (681k rows, 144 MB). | `pg_restore -d $NEW_DB --data-only 03b_ghl_messages.dump` |
| `06_auth_extract_helper.sql` | Instructions + SQL to extract `auth.users` yourself (see "Auth" below). | See file. |
| `edge-functions/` | Source of all 29 Deno edge functions. | `supabase functions deploy <name>` each. |
| `migrations/` | All 30 historical Lovable migrations. | Use as audit trail; not needed if you restore `01_public_schema.sql`. |
| `supabase-config.toml` | Project config (function-level verify_jwt overrides). | Copy into new `supabase/config.toml`. |

## What is NOT in this export

- **`auth` schema** — the Lovable automation role does not have permission to LOCK `auth.*` tables, so `pg_dump --schema=auth` fails. Run the commands in `06_auth_extract_helper.sql` from the Supabase dashboard (or with the service-role DB URL) to extract users yourself. Bcrypt password hashes are portable to any GoTrue instance.
- **`storage` schema** — same permission issue, BUT this project has **0 storage buckets**, so there is nothing to migrate.
- **Vault secrets** — only one secret (`cron_secret`) is stored in `vault.secrets`. Recreate it on the new side with `select vault.create_secret('<value>', 'cron_secret')`.
- **Edge function env vars** — see "Secrets" section below; re-add to your new platform.

## Sections 3–11 (raw answers)

### 3. Migrations history
30 SQL files in `migrations/`, dated 2026-04-24 → 2026-05-23 (1,640 lines total). Filenames are timestamped. Restoring `01_public_schema.sql` reproduces the same final state — migrations are kept only for audit.

### 4. Edge functions (source)
29 functions in `edge-functions/`:
accept-invitation, ai-analyze, analyze-lead, check-notes-access, create-checkout-session, create-tenant, delete-tenant, discover-tenant-fields, generate-day-briefing, ghl-sync, invite-user, list-tenant-pipelines, log-admin-event, map-all-tenants-fields, payments-webhook, preview-invitation, remove-saved-card, remove-tenant-member, revoke-invitation, save-billing-settings, save-tenant-field-mappings, save-tenant-pipelines, sync-all-tenants-cron, sync-resume-cron, tts-briefing, update-tenant, update-tenant-billing-mode, validate-ghl-credentials, plus `_shared/`.

All deployed with `verify_jwt = false` (default for Lovable's signing-keys auth) and validate JWTs in code via the `SUPABASE_JWKS` secret. Webhooks (`payments-webhook`) intentionally do not validate JWT and rely on Stripe signature verification.

### 5. Database functions
See `01_public_schema.sql`. The 19 public functions are:
upsert_cron_secret, lowercase_ghl_tag, update_updated_at_column, get_user_tenant_id, handle_new_user, is_super_admin, prevent_role_self_escalation, admin_set_wallet_balance, create_tenant_with_sync_state, admin_tenants_overview, create_wallet_for_new_tenant, get_ai_markup_multiplier, admin_credit_wallet, admin_delete_tenant, credit_wallet, debit_wallet, admin_set_trial.

### 6. Realtime publication
`supabase_realtime` publication exists but contains **no tables**. Realtime is not used by the app — all data is fetched via REST.

### 7. Cron jobs
2 cron jobs run in `pg_cron` (schema is not readable by `postgres` role, so we cannot dump them here, but they are defined by these edge functions and you can recreate them on the new side):
- `sync-all-tenants-cron` — invoked every 5 min, authenticated with `CRON_SECRET`. Triggers GHL delta syncs across all active tenants.
- `sync-resume-cron` — invoked every 1 min, authenticated with `CRON_SECRET`. Resumes interrupted backfills.

To recreate on a new Supabase project, in the SQL editor:
```sql
SELECT cron.schedule('sync-all-tenants', '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://<new-ref>.functions.supabase.co/sync-all-tenants-cron',
    headers:=jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret'))
  )$$);
SELECT cron.schedule('sync-resume', '*/1 * * * *',
  $$SELECT net.http_post(
    url:='https://<new-ref>.functions.supabase.co/sync-resume-cron',
    headers:=jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret'))
  )$$);
```

### 8. Auth config
- Email/password sign-in enabled.
- Auto-confirm email signups: **enabled** (no email verification required).
- Google OAuth: **enabled** as a social provider.
- No SAML/SSO configured.
- No custom JWT claims.

### 9. Secrets / env vars to recreate
Set these on the new platform (values not in this export — they're secrets):

| Name | Used by | Where to get it |
|------|---------|-----------------|
| `ANTHROPIC_API_KEY` | ai-analyze, analyze-lead, generate-day-briefing | console.anthropic.com |
| `DEEPGRAM_API_KEY` | tts-briefing | console.deepgram.com |
| `LOVABLE_API_KEY` | (only if you keep using Lovable AI gateway, otherwise drop) | rotate via Lovable |
| `STRIPE_TEST_SECRET_KEY`, `STRIPE_LIVE_SECRET_KEY` | create-checkout-session, save-billing-settings, remove-saved-card, payments-webhook | dashboard.stripe.com |
| `STRIPE_TEST_PUBLISHABLE_KEY`, `STRIPE_LIVE_PUBLISHABLE_KEY` | frontend | dashboard.stripe.com |
| `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_LIVE_WEBHOOK_SECRET` | payments-webhook | dashboard.stripe.com → Webhooks |
| `CRON_SECRET` | sync-*-cron | generate new; store in `vault.secrets` as `cron_secret` |
| `GHL_PIT_TOKEN`, `GHL_LOCATION_ID` | only for the legacy single-tenant defaults; per-tenant tokens live in `tenants.ghl_pit_token` | GoHighLevel |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY(S)`, `SUPABASE_SECRET_KEYS`, `SUPABASE_JWKS`, `SUPABASE_DB_URL` | all edge functions | Supabase project settings on the new project |

### 10. ER summary
**Roles:** `anon`, `authenticated`, `authenticator`, `dashboard_user`, `postgres`, `sandbox_exec`, `service_role`. Only standard Supabase roles — no custom Postgres roles.

**Schemas in use:** `public` (app data), `auth` (GoTrue), `storage` (empty), `vault` (1 secret), `extensions`, `realtime` (empty publication), `cron`, `net`, `graphql`, `graphql_public`, `supabase_migrations`.

**Extensions:** `pg_cron 1.6.4`, `pg_net 0.20.0`, `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`. All standard Supabase extensions.

**Tables (24, in `public`)** — row counts at export time:

| Table | Rows | What it stores |
|-------|------|----------------|
| `tenants` | 24 | One row per customer org. Owns GHL PIT token + location ID, plan, trial state, billing mode. |
| `users` | 23 | App-level user profile (mirrors `auth.users.id`, adds `role`: `super_admin` or `tenant_user`). |
| `tenant_users` | 21 | Many-to-many: which app user belongs to which tenant. |
| `user_invitations` | 31 | Pending/accepted/revoked invites; token hashed (raw token in URL only). |
| `ghl_contacts` | 126,892 | Contacts synced from GoHighLevel. Composite PK `(tenant_id, ghl_contact_id)`. |
| `ghl_contact_tags` | 813,025 | Tags per contact (lowercased by trigger). |
| `ghl_contact_notes` | 140,705 | Notes per contact. |
| `ghl_conversations` | 62,927 | One row per conversation, with rolling 30-day counters. |
| `ghl_messages` | 710,294 | Every SMS / email / call from GHL. |
| `ghl_opportunities` | 88,878 | Pipeline opportunities per contact. |
| `ghl_tasks` | 30,022 | Tasks per contact. |
| `ghl_users` | 2,368 | Reps mirrored from GHL. |
| `lead_intelligence` | 264 | Cached Claude analyses per contact. |
| `day_briefing_cache` | 82 | Cached daily briefings (4-hour TTL). |
| `tenant_pipelines` | 540 | Which GHL pipelines a tenant has opted into. |
| `tenant_custom_field_mappings` | 284 | Per-tenant mapping of GHL custom field IDs → app keys. |
| `sync_state` | 192 | Per (tenant, resource) cursor + failure counter. |
| `sync_history` | 158,671 | Audit of every sync run. |
| `wallets` | 24 | One per tenant, `balance_cents`. |
| `wallet_transactions` | 905 | Ledger of credits/debits. |
| `billing_settings` | 2 | Stripe customer + default PM per tenant. |
| `usage_events` | 861 | Per-call AI/TTS cost tracking. |
| `audit_log` | 1,177 | Admin actions. |
| `platform_settings` | 1 | Global single-row config (AI markup multiplier). |

**Foreign keys:** 30 FKs, all cascading on tenant delete. Notable:
- `public.users.id → auth.users.id ON DELETE CASCADE` — re-create after restoring `auth.users`.
- `user_invitations.invited_by_user_id / accepted_user_id → auth.users.id` — same.
- `usage_events.user_id → auth.users.id` — same.
- Composite FKs: `ghl_contact_tags`, `ghl_conversations`, `ghl_opportunities` all FK to `ghl_contacts(tenant_id, ghl_contact_id)`.

**Triggers (10, all in `public`):**
- `users`: `prevent_role_self_escalation_trg` + `users_role_guard` (duplicate guards) block non-super-admins from changing `role`. Plus `users_updated_at`.
- `tenants`: `trg_tenants_create_wallet` (auto-creates wallet row), `tenants_updated_at`.
- `ghl_contact_tags`: `trg_ghl_contact_tags_lowercase` (forces tag lowercase on INSERT/UPDATE).
- `billing_settings`, `tenant_pipelines`, `wallets`: `updated_at` triggers.

**No enums, no generated columns, no sequences** in `public` — all PKs are uuid or natural composite keys.

### 11. Non-standard / things to watch out for

1. **Composite natural PKs everywhere on GHL tables** — `(tenant_id, ghl_<resource>_id)`. Not `(id uuid)`. Your ORM has to support this.
2. **No FK from `ghl_messages`/`ghl_tasks`/`ghl_contact_notes`/`ghl_users` to `ghl_contacts`** — by design, because GHL can deliver messages before the contact backfill catches up. They only FK to `tenants`. Orphan rows are possible.
3. **`raw_payload jsonb`** on `ghl_contacts` and `ghl_messages` stores the full GHL API response. No schema enforced.
4. **`ghl_pit_token`** in `tenants` is plaintext, but only `service_role` has SELECT privilege on that column (verified via `information_schema.column_privileges`). Edge functions read it; the frontend never can.
5. **Role storage on `public.users.role`** (not a separate `user_roles` table). Guarded by the `prevent_role_self_escalation` trigger — keep that trigger when you restore.
6. **`handle_new_user` trigger** lives on `auth.users` (not in `public`), so it is NOT in `01_public_schema.sql`. After restoring `auth.users`, recreate it:
   ```sql
   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```
7. **Multi-tenancy isolation** is entirely via RLS using `get_user_tenant_id()` (security-definer, reads `tenant_users`). All app reads go through this; all writes go through service-role edge functions after JWT + tenant-membership validation. INSERT/UPDATE/DELETE policies on most tables are `is_super_admin()` only by design.
8. **Trial bypass** in `debit_wallet`: tenants with `trial_active=true` and unexpired `trial_expires_at` are not charged. Lazy auto-disable on first debit after expiry.
9. **`platform_settings` uses `id boolean PRIMARY KEY DEFAULT true`** trick to enforce a single row.
10. **`vault.create_secret`** is used from `upsert_cron_secret` — requires `supabase_vault` extension on the new side.
11. **`pg_net.http_post`** is used by cron jobs to call edge functions — requires `pg_net` extension.
12. **Soft-delete pattern:** `user_invitations.revoked_at`, `tenants.status='inactive'`, `ghl_users.is_active=false`. No row is hard-deleted except via admin functions.
13. **Two duplicate triggers on `users`** (`prevent_role_self_escalation_trg` and `users_role_guard`) — both call the same function. Cleanup candidate, but harmless.
14. **`audit_log` and `wallet_transactions` are append-only** at the RLS level (no INSERT/UPDATE/DELETE policies for authenticated; written only via security-definer functions).

