#!/bin/bash
# Runs ONCE on first platform-db boot (Postgres entrypoint convention).
# Creates the two app-facing roles with passwords from env, leaving the
# postgres superuser for init/migrations only.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- App-facing role used by ACQ + Lead Intel edge functions and the launcher
  -- to read entitlements and write audit rows. Limited grants applied in
  -- 02-grants.sql.
  CREATE ROLE platform_app LOGIN PASSWORD '${PLATFORM_APP_PASSWORD}' NOINHERIT;

  -- Admin role used by the launcher's Admin Console to grant/revoke access
  -- and by backfill / migration scripts. Has all of platform_app's rights
  -- plus mutation on user_product_access.
  CREATE ROLE platform_admin LOGIN PASSWORD '${PLATFORM_ADMIN_PASSWORD}' NOINHERIT;
EOSQL

echo "[platform-db init] roles created (platform_app, platform_admin)"
