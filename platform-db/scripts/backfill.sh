#!/usr/bin/env bash
# Backfill platform.users + platform.user_product_access from the existing
# ACQ + Lead Intel auth.users tables. Idempotent: re-runs upsert by email.
#
# Strategy:
#   1. Read auth.users (id, email, full_name) from acq-coach
#   2. Read auth.users (id, email, full_name) from leadintel
#   3. For each unique email:
#        upsert platform.users with acq_user_id and/or leadintel_user_id
#   4. For each user row that has an acq_user_id, ensure
#        user_product_access(acq_coach, enabled=true) exists.
#      Same for leadintel.
#   5. Tag platform_admin = true for emails listed in PLATFORM_ADMIN_EMAILS.
#
# No row is ever deleted by this script.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env (platform-db)
if [ -f "$ROOT/.env" ]; then
  POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2-)
fi
: "${POSTGRES_PASSWORD:?must be set in platform-db/.env}"

# Pull passwords for the other two stacks too (we need to read their auth.users)
ACQ_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../acq-coach-selfhost/.env" | tail -1 | cut -d= -f2-)
LI_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../leadintel-selfhost/.env" | tail -1 | cut -d= -f2-)

# Default super-admins to grant platform_admin=true (override via env)
PLATFORM_ADMIN_EMAILS="${PLATFORM_ADMIN_EMAILS:-akshay@sepnexus.com,deon.joseph@closercontrol.com}"

log() { echo "[backfill] $*"; }

# Helper: dump auth.users from a stack as TSV
dump_auth_users() {
  local container=$1 pw=$2 dbname=$3
  docker exec -i -e PGPASSWORD="$pw" "$container" \
    psql -h 127.0.0.1 -U postgres -d "$dbname" -At -F $'\t' -c \
    "select id, email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', null) from auth.users order by created_at;"
}

PLATFORM_PSQL() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" platform-db \
    psql -h 127.0.0.1 -U postgres -d platform "$@"
}

# Sanity: platform-db is up
PLATFORM_PSQL -c "select 'platform-db up' as status" >/dev/null

# ─── Snapshot inputs ────────────────────────────────────────
log "snapshotting ACQ auth.users"
ACQ_USERS=$(dump_auth_users acq-coach   "$ACQ_PW" acqcoach)
ACQ_COUNT=$(echo "$ACQ_USERS" | grep -c . || true)
log "  $ACQ_COUNT rows"

log "snapshotting Lead Intel auth.users"
LI_USERS=$(dump_auth_users leadintel "$LI_PW"  leadintel)
LI_COUNT=$(echo "$LI_USERS" | grep -c . || true)
log "  $LI_COUNT rows"

# ─── Build a temp upsert file ───────────────────────────────
TMPSQL="$(mktemp -t platform_backfill.XXXXXX.sql)"
trap "rm -f $TMPSQL" EXIT

{
  echo "BEGIN;"
  echo "CREATE TEMP TABLE _src_acq(id uuid, email text, full_name text) ON COMMIT DROP;"
  echo "CREATE TEMP TABLE _src_li (id uuid, email text, full_name text) ON COMMIT DROP;"

  echo "COPY _src_acq FROM stdin;"
  printf '%s\n' "$ACQ_USERS"
  echo '\.'

  echo "COPY _src_li FROM stdin;"
  printf '%s\n' "$LI_USERS"
  echo '\.'

  cat <<'SQL'

-- ── upsert platform.users by email (case-insensitive) ──
INSERT INTO platform.users (email, acq_user_id, leadintel_user_id, full_name)
SELECT
  COALESCE(a.email, l.email)               AS email,
  a.id                                     AS acq_user_id,
  l.id                                     AS leadintel_user_id,
  COALESCE(a.full_name, l.full_name)       AS full_name
FROM _src_acq a
  FULL OUTER JOIN _src_li l ON lower(a.email) = lower(l.email)
ON CONFLICT (email) DO UPDATE
SET acq_user_id      = COALESCE(EXCLUDED.acq_user_id,      platform.users.acq_user_id),
    leadintel_user_id= COALESCE(EXCLUDED.leadintel_user_id,platform.users.leadintel_user_id),
    full_name        = COALESCE(EXCLUDED.full_name,        platform.users.full_name);

-- ── grant access to whichever products they're already on ──
INSERT INTO platform.user_product_access (user_id, product, enabled)
SELECT u.id, 'acq_coach'::platform.product, true
FROM platform.users u
WHERE u.acq_user_id IS NOT NULL
ON CONFLICT (user_id, product) DO NOTHING;

INSERT INTO platform.user_product_access (user_id, product, enabled)
SELECT u.id, 'lead_intel'::platform.product, true
FROM platform.users u
WHERE u.leadintel_user_id IS NOT NULL
ON CONFLICT (user_id, product) DO NOTHING;

-- ── flag platform_admins ──
SQL

  IFS=',' read -ra ADMIN_EMAIL_ARR <<< "$PLATFORM_ADMIN_EMAILS"
  for em in "${ADMIN_EMAIL_ARR[@]}"; do
    em_trimmed=$(echo "$em" | xargs)
    [ -z "$em_trimmed" ] && continue
    echo "UPDATE platform.users SET is_platform_admin = true WHERE lower(email) = lower('$em_trimmed');"
  done

  cat <<'SQL'

-- ── audit row ──
INSERT INTO platform.audit_log (actor_user_id, action, metadata)
VALUES (
  NULL,
  'backfill_users',
  jsonb_build_object(
    'acq_source_count',       (SELECT count(*) FROM _src_acq),
    'leadintel_source_count', (SELECT count(*) FROM _src_li),
    'platform_users_after',   (SELECT count(*) FROM platform.users),
    'access_grants_after',    (SELECT count(*) FROM platform.user_product_access WHERE enabled),
    'run_at',                 to_jsonb(now())
  )
);

COMMIT;

-- ── summary readout ──
SELECT 'platform.users           '   AS what, count(*) AS rows FROM platform.users
UNION ALL
SELECT 'platform.user_product_access', count(*) FROM platform.user_product_access
UNION ALL
SELECT 'with acq_user_id        ',     count(*) FROM platform.users WHERE acq_user_id IS NOT NULL
UNION ALL
SELECT 'with leadintel_user_id   ',    count(*) FROM platform.users WHERE leadintel_user_id IS NOT NULL
UNION ALL
SELECT 'in both apps             ',    count(*) FROM platform.users WHERE acq_user_id IS NOT NULL AND leadintel_user_id IS NOT NULL
UNION ALL
SELECT 'platform admins          ',    count(*) FROM platform.users WHERE is_platform_admin;
SQL
} > "$TMPSQL"

# ─── Apply ───────────────────────────────────────────────────
log "applying backfill"
PLATFORM_PSQL -v ON_ERROR_STOP=1 < "$TMPSQL"

log "done"
