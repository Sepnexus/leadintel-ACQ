#!/usr/bin/env bash
# Phase A1 — Backfill platform.customers from both apps' existing customer tables.
#
# Strategy:
#   1. Read ghl_accounts from acq-coach.
#   2. Read tenants from leadintel.
#   3. Outer join on ghl_location_id (the natural key).
#   4. Upsert one row per unique location_id, with back-pointers populated for
#      whichever apps have that customer.
#   5. Backfill platform.customer_users from:
#        - acq.public.user_roles where account_id IS NOT NULL
#        - leadintel.public.tenant_users
#      Translating per-app auth.users.id → platform.users.id via the back-pointers
#      established by backfill.sh.
#
# Idempotent: re-running upserts on (ghl_location_id) and ON CONFLICT DO NOTHING
# on (customer_id, user_id, product).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2-)
fi
: "${POSTGRES_PASSWORD:?must be set in platform-db/.env}"

ACQ_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../acq-coach-selfhost/.env" | tail -1 | cut -d= -f2-)
LI_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../leadintel-selfhost/.env" | tail -1 | cut -d= -f2-)

log() { echo "[backfill-customers] $*"; }

dump_acq_accounts() {
  docker exec -i -e PGPASSWORD="$ACQ_PW" acq-coach \
    psql -h 127.0.0.1 -U postgres -d acqcoach -At -F $'\t' -P null='\N' -c \
    "SELECT id, name, location_id, company_id, is_active, is_test, demo_mode FROM ghl_accounts;"
}

dump_li_tenants() {
  docker exec -i -e PGPASSWORD="$LI_PW" leadintel \
    psql -h 127.0.0.1 -U postgres -d leadintel -At -F $'\t' -P null='\N' -c \
    "SELECT id, name, ghl_location_id, status, plan_type, trial_active, trial_started_at, trial_expires_at FROM tenants;"
}

dump_acq_user_roles() {
  # Returns: auth_user_id, account_id, role
  docker exec -i -e PGPASSWORD="$ACQ_PW" acq-coach \
    psql -h 127.0.0.1 -U postgres -d acqcoach -At -F $'\t' -P null='\N' -c \
    "SELECT user_id, account_id, role::text FROM user_roles WHERE account_id IS NOT NULL;"
}

dump_li_tenant_users() {
  # Returns: tenant_id, user_id, role
  # Role lives on public.users (global), not per-tenant — Lead Intel's model.
  docker exec -i -e PGPASSWORD="$LI_PW" leadintel \
    psql -h 127.0.0.1 -U postgres -d leadintel -At -F $'\t' -P null='\N' -c \
    "SELECT tu.tenant_id, tu.user_id, COALESCE(u.role, 'tenant_user') FROM tenant_users tu LEFT JOIN public.users u ON u.id = tu.user_id;"
}

PLATFORM_PSQL() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" platform-db \
    psql -h 127.0.0.1 -U postgres -d platform "$@"
}

PLATFORM_PSQL -c "select 'platform-db up' as status" >/dev/null

log "snapshotting ACQ ghl_accounts"
ACQ_DATA=$(dump_acq_accounts)
log "  $(echo "$ACQ_DATA" | grep -c .) rows"

log "snapshotting Lead Intel tenants"
LI_DATA=$(dump_li_tenants)
log "  $(echo "$LI_DATA" | grep -c .) rows"

log "snapshotting ACQ user_roles"
ACQ_ROLES=$(dump_acq_user_roles)
log "  $(echo "$ACQ_ROLES" | grep -c .) rows"

log "snapshotting Lead Intel tenant_users"
LI_TU=$(dump_li_tenant_users)
log "  $(echo "$LI_TU" | grep -c .) rows"

TMPSQL="$(mktemp -t platform_backfill_customers.XXXXXX.sql)"
trap "rm -f $TMPSQL" EXIT

{
  echo "BEGIN;"
  echo "CREATE TEMP TABLE _src_acq (id uuid, name text, location_id text, company_id text, is_active boolean, is_test boolean, demo_mode boolean) ON COMMIT DROP;"
  echo "CREATE TEMP TABLE _src_li  (id uuid, name text, ghl_location_id text, status text, plan_type text, trial_active boolean, trial_started_at timestamptz, trial_expires_at timestamptz) ON COMMIT DROP;"
  echo "CREATE TEMP TABLE _src_acq_roles (auth_user_id uuid, account_id uuid, role text) ON COMMIT DROP;"
  echo "CREATE TEMP TABLE _src_li_tu    (tenant_id uuid, auth_user_id uuid, role text) ON COMMIT DROP;"

  echo "COPY _src_acq FROM stdin;"; printf '%s\n' "$ACQ_DATA"; echo '\.'
  echo "COPY _src_li FROM stdin;";  printf '%s\n' "$LI_DATA";  echo '\.'
  echo "COPY _src_acq_roles FROM stdin;"; printf '%s\n' "$ACQ_ROLES"; echo '\.'
  echo "COPY _src_li_tu FROM stdin;";    printf '%s\n' "$LI_TU";    echo '\.'

  cat <<'SQL'

-- ── Upsert customers by ghl_location_id ──
-- Pairs ACQ rows with LI rows where the location matches.
WITH paired AS (
  SELECT
    COALESCE(a.location_id, l.ghl_location_id)   AS ghl_location_id,
    COALESCE(a.name,  l.name)                    AS name,
    a.company_id                                 AS ghl_company_id,
    a.id                                         AS acq_account_id,
    l.id                                         AS leadintel_tenant_id,
    -- status: prefer LI's tri-state, else use ACQ's is_active
    COALESCE(l.status, CASE WHEN a.is_active THEN 'active' ELSE 'paused' END) AS status,
    COALESCE(l.plan_type, 'standard')            AS plan,
    COALESCE(a.is_test, false)                   AS is_test,
    COALESCE(a.demo_mode, false)                 AS demo_mode,
    COALESCE(l.trial_active, false)              AS trial_active,
    l.trial_started_at,
    l.trial_expires_at
  FROM _src_acq a
    FULL OUTER JOIN _src_li l ON a.location_id = l.ghl_location_id
)
INSERT INTO platform.customers (
  name, ghl_location_id, ghl_company_id,
  acq_account_id, leadintel_tenant_id,
  status, plan, is_test, demo_mode,
  trial_active, trial_started_at, trial_expires_at
)
SELECT
  name, ghl_location_id, ghl_company_id,
  acq_account_id, leadintel_tenant_id,
  status, plan, is_test, demo_mode,
  trial_active, trial_started_at, trial_expires_at
FROM paired
WHERE ghl_location_id IS NOT NULL  -- skip any orphaned rows missing the natural key
ON CONFLICT (ghl_location_id) DO UPDATE
SET name                = COALESCE(EXCLUDED.name,                platform.customers.name),
    ghl_company_id      = COALESCE(EXCLUDED.ghl_company_id,      platform.customers.ghl_company_id),
    acq_account_id      = COALESCE(EXCLUDED.acq_account_id,      platform.customers.acq_account_id),
    leadintel_tenant_id = COALESCE(EXCLUDED.leadintel_tenant_id, platform.customers.leadintel_tenant_id),
    -- don't clobber operational state on re-run
    is_test             = platform.customers.is_test OR EXCLUDED.is_test,
    demo_mode           = platform.customers.demo_mode OR EXCLUDED.demo_mode;

-- ── Backfill platform.customer_users ──
-- ACQ side: for each user_role, find the platform user (via acq auth id back-pointer)
-- and the platform customer (via acq account_id back-pointer).
INSERT INTO platform.customer_users (customer_id, user_id, product, role)
SELECT
  c.id AS customer_id,
  u.id AS user_id,
  'acq_coach'::platform.product AS product,
  r.role
FROM _src_acq_roles r
JOIN platform.customers c ON c.acq_account_id = r.account_id
JOIN platform.users     u ON u.acq_user_id    = r.auth_user_id
ON CONFLICT (customer_id, user_id, product) DO NOTHING;

-- LI side: same, via leadintel_tenant_id + leadintel_user_id back-pointers
INSERT INTO platform.customer_users (customer_id, user_id, product, role)
SELECT
  c.id AS customer_id,
  u.id AS user_id,
  'lead_intel'::platform.product AS product,
  tu.role
FROM _src_li_tu tu
JOIN platform.customers c ON c.leadintel_tenant_id = tu.tenant_id
JOIN platform.users     u ON u.leadintel_user_id   = tu.auth_user_id
ON CONFLICT (customer_id, user_id, product) DO NOTHING;

-- ── Audit ──
INSERT INTO platform.audit_log (actor_user_id, action, metadata)
VALUES (
  NULL,
  'backfill_customers',
  jsonb_build_object(
    'acq_source_count',           (SELECT count(*) FROM _src_acq),
    'leadintel_source_count',     (SELECT count(*) FROM _src_li),
    'customers_after',            (SELECT count(*) FROM platform.customers),
    'customer_users_after',       (SELECT count(*) FROM platform.customer_users),
    'in_both_apps',               (SELECT count(*) FROM platform.customers WHERE acq_account_id IS NOT NULL AND leadintel_tenant_id IS NOT NULL),
    'run_at',                     to_jsonb(now())
  )
);

COMMIT;

-- ── Readout ──
SELECT 'customers.total           ' AS metric, count(*) AS n FROM platform.customers
UNION ALL
SELECT 'customers.both_apps       ', count(*) FROM platform.customers WHERE acq_account_id IS NOT NULL AND leadintel_tenant_id IS NOT NULL
UNION ALL
SELECT 'customers.acq_only        ', count(*) FROM platform.customers WHERE acq_account_id IS NOT NULL AND leadintel_tenant_id IS NULL
UNION ALL
SELECT 'customers.li_only         ', count(*) FROM platform.customers WHERE acq_account_id IS NULL AND leadintel_tenant_id IS NOT NULL
UNION ALL
SELECT 'customers.test            ', count(*) FROM platform.customers WHERE is_test
UNION ALL
SELECT 'customer_users.total      ', count(*) FROM platform.customer_users
UNION ALL
SELECT 'customer_users.acq        ', count(*) FROM platform.customer_users WHERE product='acq_coach'
UNION ALL
SELECT 'customer_users.leadintel  ', count(*) FROM platform.customer_users WHERE product='lead_intel';
SQL
} > "$TMPSQL"

log "applying backfill"
PLATFORM_PSQL -v ON_ERROR_STOP=1 < "$TMPSQL"

log "done"
