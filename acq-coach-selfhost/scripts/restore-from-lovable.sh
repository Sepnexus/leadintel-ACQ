#!/usr/bin/env bash
# Restore the ACQ Coach Lovable export into the running self-host container.
# Run AFTER the container is up.
#
# Files expected at (created by the Lovable export & dashboard-extract steps):
#   ../my-acq-coach-5b771b53/backups/migration-export/public_schema.sql
#   ../my-acq-coach-5b771b53/backups/migration-export/public_data.sql
#   ../my-acq-coach-5b771b53/backups/migration-export/auth-users-export.sql
#   ../my-acq-coach-5b771b53/backups/migration-export/cron-jobs.sql       (optional)
#
# Run:
#   ./scripts/restore-from-lovable.sh
#
# Env (override if your container/db differs):
#   APP_CONTAINER  default: acq-coach
#   POSTGRES_DB    read from .env if present, else acqcoach
#   BACKUPS_DIR    default: ../my-acq-coach-5b771b53/backups/migration-export

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUPS_DIR="${BACKUPS_DIR:-$ROOT/../my-acq-coach-5b771b53/backups/migration-export}"
APP_CONTAINER="${APP_CONTAINER:-acq-coach}"

# Read POSTGRES_DB + POSTGRES_PASSWORD from .env if it exists.
# Use `tail -1` because .env may contain duplicate keys (last-wins, matching
# Docker Compose env_file semantics).
if [ -f "$ROOT/.env" ]; then
  POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ROOT/.env" | tail -1 | cut -d= -f2- || true)
  POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2- || true)
fi
: "${POSTGRES_DB:=acqcoach}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set (in .env or env var)}"

SCHEMA_SRC="$BACKUPS_DIR/public_schema.sql"
DATA_SRC="$BACKUPS_DIR/public_data.sql"
AUTH_SRC="$BACKUPS_DIR/auth-users-export.sql"
CRON_SRC="$BACKUPS_DIR/cron-jobs.sql"

test -f "$SCHEMA_SRC" || { echo "missing: $SCHEMA_SRC"; exit 1; }
test -f "$DATA_SRC"   || { echo "missing: $DATA_SRC";   exit 1; }
test -f "$AUTH_SRC"   || { echo "missing: $AUTH_SRC";   exit 1; }

# ── ACQ Lovable export QUIRK NOTES ────────────────────
# Compared to the metrics-loom export, ACQ's Lovable export is cleaner:
#   ✓ No empty `TO  USING` clauses — sed fix from metrics-loom not needed.
#   ✓ auth-users-export.sql was reconstructed from dashboard SQL Editor
#     (not pg_dump), so confirmed_at is already absent and NULL tokens are
#     already '' — no sed fix needed.
#   ✓ No FKs to restore.
#   ✓ No sequences.
# We still backfill auth.identities for safety (the dashboard extract DID
# include them, but the helper here is idempotent).

EXEC() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$APP_CONTAINER" \
    psql -h 127.0.0.1 -U postgres -d "$POSTGRES_DB" "$@"
}

# ─── Wipe + restore ───────────────────────────────────
echo "==> Wiping public schema and auth.users (no users → handle_new_user trigger silent)"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DELETE FROM auth.identities;
DELETE FROM auth.users;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

echo "==> Importing auth.users + auth.identities FIRST (public_schema FKs reference auth.users)"
# auth.identities.email is a GENERATED column in modern GoTrue (v2.158.x).
# Strip it from auth.identities INSERTs only (don't touch auth.users rows).
# Pattern: `INSERT INTO auth.identities (...email) VALUES (...,'foo@bar.com');`
sed -E \
    -e '/^INSERT INTO auth\.identities/ s/, email\)/)/' \
    -e "/^INSERT INTO auth\\.identities/ s/,'[^']*'\\);\$/);/" \
    -e '/^INSERT INTO auth\.identities/ s/,NULL\);$/);/' \
    "$AUTH_SRC" \
  | EXEC -v ON_ERROR_STOP=1 >/dev/null

echo "==> Importing public schema + data (full pg_dump: DDL + COPY data + FKs in one file)"
# Lovable's dump is from Postgres 17+ — strip incompatible directives:
#   - SET transaction_timeout      (PG 17+ only)
#   - CREATE SCHEMA "public";      (we already re-created it in the wipe step)
sed -E \
    -e '/^SET[[:space:]]+transaction_timeout/d' \
    -e '/^CREATE SCHEMA "?public"?;$/d' \
    "$SCHEMA_SRC" \
  | EXEC -v ON_ERROR_STOP=1 >/dev/null

# public_data.sql is intentionally NOT imported — it's a redundant INSERT-form
# copy of the same data already loaded by public_schema.sql's COPY blocks.
# Importing it would cause PK violations.
echo "    (skipped public_data.sql — already loaded via COPY in public_schema.sql)"

echo "==> Re-applying grants so PostgREST can serve the freshly-created tables"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
SQL

echo "==> Belt-and-braces: COALESCE any NULL auth.users token columns to '' (GoTrue scans these into Go strings, NULL→500)"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '');
SQL

echo "==> Belt-and-braces: backfill any missing auth.identities for password login"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  u.last_sign_in_at,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM auth.users u
WHERE u.encrypted_password IS NOT NULL
  AND length(u.encrypted_password) > 0
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );
SQL

echo "==> Restoring PKs / UNIQUEs (idempotent — Lovable's export usually inlines them but this is the safety net)"
EXEC < "$ROOT/docker/restore-constraints.sql"

echo "==> Re-creating on_auth_user_created trigger (Lovable export omits triggers in auth schema)"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
SQL

if [ -f "$CRON_SRC" ]; then
  echo "==> Skipping pg_cron jobs ($CRON_SRC)"
  echo "    pg_net isn't installed locally so net.http_post() calls would fail."
  echo "    The file also still has the old supabase.co URL + the production cron secret."
  echo "    Apply manually once you've edited it:"
  echo "      docker exec -i $APP_CONTAINER psql -U postgres -d $POSTGRES_DB < $CRON_SRC"
fi

echo "==> Row counts:"
EXEC -At -F $'\t' <<'SQL'
SELECT 'auth.users',          count(*) FROM auth.users;
SELECT 'auth.identities',     count(*) FROM auth.identities;
SELECT 'ghl_accounts',        count(*) FROM public.ghl_accounts;
SELECT 'profiles',            count(*) FROM public.profiles;
SELECT 'user_roles',          count(*) FROM public.user_roles;
SELECT 'rep_assignments',     count(*) FROM public.rep_assignments;
SELECT 'ghl_users',           count(*) FROM public.ghl_users;
SELECT 'ghl_contacts',        count(*) FROM public.ghl_contacts;
SELECT 'ghl_conversations',   count(*) FROM public.ghl_conversations;
SELECT 'ghl_messages',        count(*) FROM public.ghl_messages;
SELECT 'ghl_calls',           count(*) FROM public.ghl_calls;
SELECT 'call_scores',         count(*) FROM public.call_scores;
SELECT 'wallets',             count(*) FROM public.wallets;
SELECT 'wallet_transactions', count(*) FROM public.wallet_transactions;
SELECT 'billing_settings',    count(*) FROM public.billing_settings;
SELECT 'app_settings',        count(*) FROM public.app_settings;
SELECT 'usage_events',        count(*) FROM public.usage_events;
SELECT 'sync_runs',           count(*) FROM public.sync_runs;
SELECT 'sync_state',          count(*) FROM public.sync_state;
SELECT 'blocked_numbers',     count(*) FROM public.blocked_numbers;
SELECT 'rls_policies',        count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'public_functions',    count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public';
SELECT 'public_triggers',     count(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid=c.oid JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND NOT t.tgisinternal;
SQL

echo "==> Done."
echo "==> Expected counts (from Lovable export):"
echo "      auth.users=8, auth.identities=8, rls_policies=35, public_triggers=7"
echo "==> Now try a login at: $(grep ^SITE_URL "$ROOT/.env" | cut -d= -f2-)"
echo "==> Test user: akshay@sepnexus.com (password unchanged from production)"
