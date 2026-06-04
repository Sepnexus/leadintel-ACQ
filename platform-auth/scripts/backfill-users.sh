#!/bin/bash
# Phase C2 — Backfill platform-auth from both apps.
# Dedupe by email. For shared emails, ACQ's row wins (already aligned by migrate-shared-ids.sh).
# Copies: auth.users, auth.identities. Sessions/factors are NOT copied
# (users will get fresh sessions on first login through platform-auth).

set -e
cd "$(dirname "$0")/.."

ACQ_CONTAINER=acq-coach
LI_CONTAINER=leadintel
ACQ_DB=acqcoach
LI_DB=leadintel

echo "=== Dumping ACQ users + identities ==="
docker exec "$ACQ_CONTAINER" pg_dump -U postgres -d "$ACQ_DB" \
  --data-only --table=auth.users --table=auth.identities \
  --column-inserts > /tmp/acq-auth.sql 2>&1
echo "  $(wc -l < /tmp/acq-auth.sql) lines"

echo "=== Dumping LI users + identities ==="
docker exec "$LI_CONTAINER" pg_dump -U postgres -d "$LI_DB" \
  --data-only --table=auth.users --table=auth.identities \
  --column-inserts > /tmp/li-auth.sql 2>&1
echo "  $(wc -l < /tmp/li-auth.sql) lines"

echo ""
echo "=== Applying ACQ to platform-db (ON CONFLICT skip) ==="
# Strip SETs and convert INSERTs to ON CONFLICT DO NOTHING
{
  echo "BEGIN;"
  echo "SET session_replication_role = replica;"  # skip FK during load
  # ACQ
  grep "^INSERT INTO auth\." /tmp/acq-auth.sql \
    | sed 's|;$| ON CONFLICT DO NOTHING;|'
  # LI (de-duped by ON CONFLICT)
  grep "^INSERT INTO auth\." /tmp/li-auth.sql \
    | sed 's|;$| ON CONFLICT DO NOTHING;|'
  echo "SET session_replication_role = DEFAULT;"
  echo "COMMIT;"
} > /tmp/platform-auth-load.sql

docker cp /tmp/platform-auth-load.sql platform-db:/tmp/platform-auth-load.sql
docker exec platform-db psql -U postgres -d platform -v ON_ERROR_STOP=1 -f /tmp/platform-auth-load.sql 2>&1 | tail -20

echo ""
echo "=== Verification ==="
docker exec platform-db psql -U postgres -d platform -c "
  SELECT count(*) AS users_in_platform_auth FROM auth.users;
"
docker exec platform-db psql -U postgres -d platform -c "
  SELECT count(*) AS identities_in_platform_auth FROM auth.identities;
"
docker exec platform-db psql -U postgres -d platform -tAc "
  SELECT email FROM auth.users ORDER BY email
" | head -40
