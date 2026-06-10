#!/usr/bin/env bash
# Wire each app DB to platform-db via postgres_fdw so the apps' wallet RPCs
# can read/write the SINGLE shared ledger (platform.customer_wallet).
#
#   bash scripts/setup-wallet-fdw.sh
#
# Idempotent. Reads the platform_app DB password from platform-launcher/.env
# (PLATFORM_DB_URL) — written by write-project-envs.sh. Run once per
# environment (local + VPS). After this, apply the app wallet migrations.
#
# What it creates in EACH app DB (acqcoach, leadintel):
#   - extension postgres_fdw
#   - foreign server  platform_srv      → platform-db:5432/platform
#   - user mapping    postgres → platform_app
#   - schema          platform_fdw with foreign tables:
#       customers, customer_wallet, wallet_transactions

set -euo pipefail
BASE_DIR="${BASE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

# platform_app password from the launcher env's PLATFORM_DB_URL.
PG_URL=$(grep -E '^PLATFORM_DB_URL=' "$BASE_DIR/platform-launcher/.env" | head -1 | cut -d= -f2-)
APP_PW=$(printf '%s' "$PG_URL" | sed -E 's|^postgres://[^:]+:([^@]+)@.*|\1|')
if [ -z "$APP_PW" ]; then echo "ERROR: couldn't parse platform_app password from platform-launcher/.env" >&2; exit 1; fi

# Host that the app containers use to reach platform-db. Same docker network.
PLATFORM_HOST="${PLATFORM_DB_HOST:-platform-db}"

# (container, db, local-pw-env-file)
APPS=(
  "acq-coach:acqcoach:$BASE_DIR/acq-coach-selfhost/.env"
  "leadintel:leadintel:$BASE_DIR/leadintel-selfhost/.env"
)

for entry in "${APPS[@]}"; do
  CONT="${entry%%:*}"; rest="${entry#*:}"; DB="${rest%%:*}"; ENVF="${rest##*:}"
  LOCAL_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ENVF" | grep -v CHANGE_ME | tail -1 | cut -d= -f2)
  echo "── $CONT/$DB ─────────────────────────────────────────"
  docker exec -e PGPASSWORD="$LOCAL_PW" -i "$CONT" psql -h localhost -U postgres -d "$DB" <<SQL
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname='platform_srv') THEN
    CREATE SERVER platform_srv FOREIGN DATA WRAPPER postgres_fdw
      OPTIONS (host '${PLATFORM_HOST}', dbname 'platform', port '5432');
  END IF;
END \$\$;

-- (Re)create the user mapping so a rotated password is picked up.
DROP USER MAPPING IF EXISTS FOR postgres SERVER platform_srv;
CREATE USER MAPPING FOR postgres SERVER platform_srv
  OPTIONS (user 'platform_app', password '${APP_PW}');

CREATE SCHEMA IF NOT EXISTS platform_fdw;

DROP FOREIGN TABLE IF EXISTS platform_fdw.customers;
CREATE FOREIGN TABLE platform_fdw.customers (
  id uuid, acq_account_id uuid, leadintel_tenant_id uuid
) SERVER platform_srv OPTIONS (schema_name 'platform', table_name 'customers');

DROP FOREIGN TABLE IF EXISTS platform_fdw.customer_wallet;
CREATE FOREIGN TABLE platform_fdw.customer_wallet (
  customer_id uuid, balance_cents integer, refreshed_at timestamptz
) SERVER platform_srv OPTIONS (schema_name 'platform', table_name 'customer_wallet');

-- Platform ledger — so app-driven credits/debits show in the launcher's
-- unified billing history. 'product' is declared text; the remote column is
-- the platform.product enum (text assigns to enum on insert). id/created_at
-- are remote defaults, omitted here.
DROP FOREIGN TABLE IF EXISTS platform_fdw.wallet_transactions;
CREATE FOREIGN TABLE platform_fdw.wallet_transactions (
  customer_id uuid, product text, type text, amount_cents integer,
  balance_after_cents integer, reason text, stripe_session_id text, metadata jsonb
) SERVER platform_srv OPTIONS (schema_name 'platform', table_name 'wallet_transactions');

-- Smoke test the link.
SELECT 'fdw ok, customers visible: ' || count(*)::text FROM platform_fdw.customers;
SQL
done
echo "✓ fdw wired in both app DBs"
