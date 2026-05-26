# Backend Migration Export — acqcoach (Closer Control)

Generated: 2026-05-26

## What's included
- `public_schema.sql` — full pg_dump of public schema (tables, indexes, sequences, views, functions, triggers, RLS policies, ENABLE RLS, grants). 68 MB / 77k lines.
- `public_data.sql` — full data dump as INSERTs (--column-inserts) for every public table. 89 MB.
- `migrations/` — all 28 timestamped migration files from `supabase/migrations/`, in order.
- `functions/` — full source for all 9 edge functions + `_shared/` helpers.
- `config.toml` — `supabase/config.toml`.
- `realtime_tables.txt`, `ER_SUMMARY.md`, `INTEGRATIONS.md`, `ENV_VARS.md`, this README.

## What's NOT included and why

### `auth.*` data (Section 2 of your request)
`pg_dump` against the pooled connection available here returns
`ERROR: permission denied for schema auth`. The pooler role can't read
`auth.users`. You must dump it via one of:

1. Supabase Dashboard → Database → Backups → Logical backup (includes auth).
2. Direct connection using the **service-role** or **postgres** superuser
   credentials (not the pooler). Then run:
   ```bash
   pg_dump "postgresql://postgres:<PW>@db.palblvwzgkmajmwquqah.supabase.co:5432/postgres" \
     --schema=auth --data-only --column-inserts \
     --table=auth.users --table=auth.identities \
     --table=auth.sessions --table=auth.refresh_tokens \
     > auth_data.sql
   ```
3. From the Lovable Cloud project settings, use the "Export" feature if
   exposed, or contact Supabase support for a base backup.

When you reinsert, remember:
- `auth.users.confirmed_at` is GENERATED — drop it from the INSERT column list.
- All `*_token` columns are NOT NULL with default `''`. Replace any NULL
  with empty string: `COALESCE(confirmation_token,'')` etc.

### `cron.job` (Section 6)
Also permission-denied via pooler. The project uses `pg_cron` (extension is
installed). To list jobs, run from the SQL editor in the Supabase dashboard:
```sql
SELECT jobid, jobname, schedule, command, active FROM cron.job;
```
Based on the codebase, expected jobs invoke:
- `cron-sync` edge function (GHL conversation sync)
- `auto-recharge-cron` edge function (Stripe wallet auto-top-up)

### `storage.buckets`
Query returned zero rows — **this project has no storage buckets** and no
storage objects. Nothing to migrate.

### Realtime publication
`supabase_realtime` publication exists but contains 0 tables in this project
(empty result from `pg_publication_tables`). Realtime is not actively used.

## Extensions in use
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
-- supabase_vault is Supabase-specific; on self-host install from
-- https://github.com/supabase/vault, or omit if you're not using vault secrets.
```

## Custom types
```sql
CREATE TYPE public.app_role AS ENUM ('super_admin', 'account_admin', 'rep');
```

## Triggers (all in public)
All are `update_*_updated_at` BEFORE UPDATE triggers calling
`public.update_updated_at_column()`. On:
ghl_users, ghl_contacts, call_scores, ghl_calls, ghl_conversations,
ghl_messages, profiles.

A `handle_new_user()` function exists (SECURITY DEFINER) intended for an
`auth.users` AFTER INSERT trigger — but the trigger itself lives in the
`auth` schema and is NOT included in the public dump. After restore, recreate:
```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Views
- `public.ghl_accounts_safe` — masks `api_key` column
- `public.usage_summary_by_account` — aggregates `usage_events`

Both are in `public_schema.sql`.

## Foreign keys
**None** in the public schema. Cross-table references (e.g. `account_id`,
`user_id`) are by convention only — not enforced by FK constraints.

## Sequences
None. All PKs use `gen_random_uuid()`.

## Auth configuration (Section 7)
Not introspectable via SQL. From the codebase + project context:
- Providers: **email/password** + **Google OAuth**
- Site URL: `https://www.acqcoach.com`
- Redirect URLs: include `https://coach-deploy-magic.lovable.app`,
  `https://acqcoach.com`, `https://www.acqcoach.com`, and Lovable preview URLs
- JWT expiry / refresh rotation: Supabase defaults (3600s / rotating refresh)
- SMTP: Supabase-managed (no custom SMTP configured)
- Email templates: Supabase defaults (no custom templates in repo)

To export the actual current auth config, use the Supabase dashboard →
Authentication → Providers / URL Configuration / Email Templates and copy
each section. There is no SQL surface for it.

## Anything weird (Section 11)

1. **No foreign keys anywhere.** Multi-tenant `account_id` isolation is
   enforced **only** by RLS policies via the `is_account_admin()`,
   `is_account_member()`, and `rep_ghl_user_ids()` SECURITY DEFINER
   functions. If you migrate without replicating these helpers, **every
   table becomes effectively public to authenticated users**.

2. **Multi-tenancy model:** `public.user_roles(user_id, role, account_id)`
   is the source of truth. `app_role` enum has 3 values; `super_admin` rows
   have `account_id = NULL`. RLS policies branch on this enum.

3. **Rep -> GHL user mapping:** `public.rep_assignments` maps a Supabase
   `auth.users.id` to one or more `ghl_user_id` strings. RLS on
   `call_scores`, `ghl_calls`, `ghl_messages` uses
   `rep_ghl_user_ids(auth.uid(), account_id)` to filter rows by which GHL
   users the rep is allowed to see.

4. **Demo data functions:** `seed_demo_data(account_id)` and
   `unseed_demo_data(account_id)` insert/remove ~16 fake calls with
   transcripts, scorecards, and usage events. Tagged via
   `metadata->>'demo' = 'true'` and `ghl_message_id LIKE 'demo-call-%'`.

5. **Wallet money in cents (integers).** `wallets.balance_cents`,
   `wallet_transactions.amount_cents`. All financial logic goes through
   `credit_wallet()` / `debit_wallet()` SECURITY DEFINER functions which
   lock the wallet row. Don't bypass them.

6. **JSON columns with implicit schemas:**
   - `call_scores.category_scores` — array of `{name, score, status, oneliner}`
   - `call_scores.moments` — array of `{category, status, what, why, rewrite}`
   - `call_scores.strengths` — string array
   - `ghl_*.raw_data` — full GHL API payloads (variable shape)
   - `usage_events.metadata`, `wallet_transactions.metadata` — free-form

7. **`api_key` stored in plaintext** in `ghl_accounts.api_key`. The
   `ghl_accounts_safe` view masks it but the base table column is plaintext.
   Consider encrypting on migration.

8. **`app_settings` is a singleton table** — PK column `id boolean DEFAULT
   true`, so only one row can exist.

9. **No soft-delete pattern.** Deletes are hard. `is_active` exists on
   `ghl_accounts` for tenant-level deactivation only.

10. **`supabase_vault` extension is enabled** but not used by any function
    in this codebase (no `vault.decrypted_secrets` reads). Safe to omit
    on self-host.

