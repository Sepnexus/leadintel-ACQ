#!/usr/bin/env bash
# Restore the Closer Control Lead Intel Lovable export into the running container.
# Run AFTER the container is up.
#
# Files expected at (extracted by the Lovable backend export):
#   ../closercontrolleadintel/backups/backend-export/01_public_schema.sql
#   ../closercontrolleadintel/backups/backend-export/02_public_data_small_inserts.sql
#   ../closercontrolleadintel/backups/backend-export/03_public_data_big.dump
#   ../closercontrolleadintel/backups/backend-export/03b_ghl_messages.dump
#   ../closercontrolleadintel/backups/backend-export/auth-users-export.sql
#   ../closercontrolleadintel/backups/backend-export/cron-jobs.sql            (optional)
#   ../closercontrolleadintel/backups/backend-export/vault-secrets.md         (read manually)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUPS_DIR="${BACKUPS_DIR:-$ROOT/../closercontrolleadintel/backups/backend-export}"
APP_CONTAINER="${APP_CONTAINER:-leadintel}"

if [ -f "$ROOT/.env" ]; then
  POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ROOT/.env" | tail -1 | cut -d= -f2- || true)
  POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2- || true)
  CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ROOT/.env" | tail -1 | cut -d= -f2- || true)
fi
: "${POSTGRES_DB:=leadintel}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set (in .env or env var)}"
: "${CRON_SECRET:?CRON_SECRET must be set (in .env or env var) — used to recreate the vault.cron_secret on the new side}"

SCHEMA_SRC="$BACKUPS_DIR/01_public_schema.sql"
SMALL_DATA_SRC="$BACKUPS_DIR/02_public_data_small_inserts.sql"
BIG_DATA_SRC="$BACKUPS_DIR/03_public_data_big.dump"
MSGS_DATA_SRC="$BACKUPS_DIR/03b_ghl_messages.dump"
AUTH_SRC="$BACKUPS_DIR/auth-users-export.sql"
CRON_SRC="$BACKUPS_DIR/cron-jobs.sql"

test -f "$SCHEMA_SRC"     || { echo "missing: $SCHEMA_SRC";     exit 1; }
test -f "$SMALL_DATA_SRC" || { echo "missing: $SMALL_DATA_SRC"; exit 1; }
test -f "$BIG_DATA_SRC"   || { echo "missing: $BIG_DATA_SRC";   exit 1; }
test -f "$MSGS_DATA_SRC"  || { echo "missing: $MSGS_DATA_SRC";  exit 1; }
test -f "$AUTH_SRC"       || { echo "missing: $AUTH_SRC";       exit 1; }

EXEC() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$APP_CONTAINER" \
    psql -h 127.0.0.1 -U postgres -d "$POSTGRES_DB" "$@"
}

PGRESTORE() {
  # Lovable's .dump files are pg_dump format v1.16 (Postgres 17+). Our app
  # container runs Postgres 15. Workaround: spin up a one-shot postgres:17
  # container to convert custom-format → plain SQL on stdout, strip PG17-only
  # directives, then pipe into PG 15. pipefail OFF so a single bad COPY row
  # doesn't kill the whole import.
  local dump_file=$1
  set +o pipefail 2>/dev/null || true
  docker run --rm \
    -v "$dump_file:/dump:ro" \
    postgres:17 \
    pg_restore --data-only --no-owner --no-acl --disable-triggers -f - /dump 2>/dev/null \
  | sed -E -e '/^SET[[:space:]]+transaction_timeout/d' \
  | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$APP_CONTAINER" \
      psql -h 127.0.0.1 -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=0 2>&1 \
  | grep -vE '^(SET|ALTER TABLE|COPY [0-9])' || true
  set -o pipefail 2>/dev/null || true
}

# ─── Wipe + restore ───────────────────────────────────
echo "==> Wiping public schema and auth tables"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
-- Drop trigger first so handle_new_user doesn't fire during user import
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.users;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

echo "==> Importing auth.users + auth.identities FIRST (public.users FKs to auth.users)"
# auth.identities.email is a GENERATED column in GoTrue v2.158.x.
sed -E \
    -e '/^INSERT INTO auth\.identities/ s/, email\)/)/' \
    -e "/^INSERT INTO auth\\.identities/ s/,'[^']*'\\);\$/);/" \
    -e '/^INSERT INTO auth\.identities/ s/,NULL\);$/);/' \
    "$AUTH_SRC" \
  | EXEC -v ON_ERROR_STOP=1 >/dev/null

echo "==> Importing public schema (DDL only — Lead Intel's 01 file is DDL, data is in 02/03/03b)"
sed -E \
    -e '/^SET[[:space:]]+transaction_timeout/d' \
    -e '/^CREATE SCHEMA "?public"?;$/d' \
    "$SCHEMA_SRC" \
  | EXEC -v ON_ERROR_STOP=1 >/dev/null

echo "==> Disabling user triggers (otherwise trg_tenants_create_wallet fires on tenant inserts and collides with explicit wallet rows)"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
ALTER TABLE public.tenants               DISABLE TRIGGER USER;
ALTER TABLE public.users                 DISABLE TRIGGER USER;
ALTER TABLE public.ghl_contact_tags      DISABLE TRIGGER USER;
ALTER TABLE public.ghl_contacts          DISABLE TRIGGER USER;
ALTER TABLE public.ghl_messages          DISABLE TRIGGER USER;
ALTER TABLE public.wallets               DISABLE TRIGGER USER;
ALTER TABLE public.billing_settings      DISABLE TRIGGER USER;
ALTER TABLE public.tenant_pipelines      DISABLE TRIGGER USER;
SQL

echo "==> Importing small reference data (3 MB)"
sed -E '/^SET[[:space:]]+transaction_timeout/d' "$SMALL_DATA_SRC" \
  | EXEC -v ON_ERROR_STOP=1 >/dev/null

echo "==> Restoring big pg_dump (178 MB — contacts, tags, notes, conversations, opportunities, tasks, sync_history). This takes a few minutes."
PGRESTORE "$BIG_DATA_SRC"

echo "==> Restoring ghl_messages pg_dump (144 MB, 710k rows). Patience."
PGRESTORE "$MSGS_DATA_SRC"

echo "==> Re-enabling user triggers"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
ALTER TABLE public.tenants               ENABLE TRIGGER USER;
ALTER TABLE public.users                 ENABLE TRIGGER USER;
ALTER TABLE public.ghl_contact_tags      ENABLE TRIGGER USER;
ALTER TABLE public.ghl_contacts          ENABLE TRIGGER USER;
ALTER TABLE public.ghl_messages          ENABLE TRIGGER USER;
ALTER TABLE public.wallets               ENABLE TRIGGER USER;
ALTER TABLE public.billing_settings      ENABLE TRIGGER USER;
ALTER TABLE public.tenant_pipelines      ENABLE TRIGGER USER;
SQL

echo "==> Re-applying grants for PostgREST"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
SQL

echo "==> Belt-and-braces: COALESCE NULL auth.users token columns to '' (GoTrue 500 protection)"
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

echo "==> Belt-and-braces: backfill any missing auth.identities"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email,
                     'email_verified', true, 'phone_verified', false),
  'email', u.last_sign_in_at,
  COALESCE(u.created_at, now()), COALESCE(u.updated_at, now())
FROM auth.users u
WHERE u.encrypted_password IS NOT NULL
  AND length(u.encrypted_password) > 0
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');
SQL

echo "==> Restoring PKs + FKs + UNIQUEs (idempotent, 30 FKs)"
EXEC < "$ROOT/docker/restore-constraints.sql"

echo "==> Re-creating on_auth_user_created trigger"
EXEC -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
SQL

echo "==> Recreating vault.cron_secret (skipped if vault not installed)"
EXEC -v ON_ERROR_STOP=0 >/dev/null <<SQL
DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    DELETE FROM vault.secrets WHERE name = 'cron_secret';
    PERFORM vault.create_secret('${CRON_SECRET}', 'cron_secret', 'Cron auth secret for sync-resume-cron');
    RAISE NOTICE 'vault.cron_secret created';
  ELSE
    RAISE NOTICE 'supabase_vault not installed; cron_secret lives in env var only';
  END IF;
END \$\$;
SQL

if [ -f "$CRON_SRC" ]; then
  echo "==> Skipping pg_cron jobs ($CRON_SRC)"
  echo "    pg_net isn't installed locally and the URLs/secret need editing."
  echo "    Apply manually later:"
  echo "      docker exec -i $APP_CONTAINER psql -U postgres -d $POSTGRES_DB < $CRON_SRC"
fi

echo "==> Row counts (expected from export README):"
EXEC -At -F $'\t' <<'SQL'
SELECT 'auth.users',          count(*) FROM auth.users;
SELECT 'auth.identities',     count(*) FROM auth.identities;
SELECT 'tenants',             count(*) FROM public.tenants;
SELECT 'users',               count(*) FROM public.users;
SELECT 'tenant_users',        count(*) FROM public.tenant_users;
SELECT 'user_invitations',    count(*) FROM public.user_invitations;
SELECT 'ghl_contacts',        count(*) FROM public.ghl_contacts;
SELECT 'ghl_contact_tags',    count(*) FROM public.ghl_contact_tags;
SELECT 'ghl_contact_notes',   count(*) FROM public.ghl_contact_notes;
SELECT 'ghl_conversations',   count(*) FROM public.ghl_conversations;
SELECT 'ghl_messages',        count(*) FROM public.ghl_messages;
SELECT 'ghl_opportunities',   count(*) FROM public.ghl_opportunities;
SELECT 'ghl_tasks',           count(*) FROM public.ghl_tasks;
SELECT 'ghl_users',           count(*) FROM public.ghl_users;
SELECT 'lead_intelligence',   count(*) FROM public.lead_intelligence;
SELECT 'day_briefing_cache',  count(*) FROM public.day_briefing_cache;
SELECT 'tenant_pipelines',    count(*) FROM public.tenant_pipelines;
SELECT 'sync_state',          count(*) FROM public.sync_state;
SELECT 'sync_history',        count(*) FROM public.sync_history;
SELECT 'wallets',             count(*) FROM public.wallets;
SELECT 'wallet_transactions', count(*) FROM public.wallet_transactions;
SELECT 'billing_settings',    count(*) FROM public.billing_settings;
SELECT 'usage_events',        count(*) FROM public.usage_events;
SELECT 'audit_log',           count(*) FROM public.audit_log;
SELECT 'platform_settings',   count(*) FROM public.platform_settings;
SELECT 'rls_policies',        count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'fks',                 count(*) FROM pg_constraint WHERE contype='f' AND connamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');
SQL

echo "==> Done."
echo "==> Expected: auth.users=23, tenants=24, ghl_contacts=126892, ghl_messages=710294,"
echo "             rls_policies=70, fks=30"
echo "==> Test login: deon.joseph@closercontrol.com (existing super_admin)"
