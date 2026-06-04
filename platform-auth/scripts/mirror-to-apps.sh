#!/bin/bash
# Phase C2 — Mirror auth.users + auth.identities from platform-auth into
# BOTH apps so any user that authenticates against platform-auth has a
# matching local auth.users row in each app.
#
# This is required because Supabase JS SDK on the frontend calls
# /auth/v1/user (against the app's local GoTrue) to resolve session.user.
# If the row doesn't exist there, the SDK can't hydrate the session.
#
# Uses ON CONFLICT DO NOTHING so it's idempotent and safe to re-run.

set -e

echo "=== Dumping platform-auth users + identities ==="
docker exec platform-db pg_dump -U postgres -d platform \
  --data-only --table=auth.users --table=auth.identities --column-inserts \
  > /tmp/platform-auth.sql 2>&1
echo "  $(wc -l < /tmp/platform-auth.sql) lines"

# Extract INSERTs and add ON CONFLICT
{
  echo "BEGIN;"
  echo "SET session_replication_role = replica;"
  grep "^INSERT INTO auth\." /tmp/platform-auth.sql \
    | sed 's|;$| ON CONFLICT DO NOTHING;|'
  echo "SET session_replication_role = DEFAULT;"
  echo "COMMIT;"
} > /tmp/mirror-payload.sql

echo ""
echo "=== Mirror → ACQ ==="
docker cp /tmp/mirror-payload.sql acq-coach:/tmp/mirror-payload.sql
PRE=$(docker exec acq-coach psql -U postgres -d acqcoach -tAc "SELECT count(*) FROM auth.users")
docker exec acq-coach psql -U postgres -d acqcoach -v ON_ERROR_STOP=1 -f /tmp/mirror-payload.sql > /dev/null
POST=$(docker exec acq-coach psql -U postgres -d acqcoach -tAc "SELECT count(*) FROM auth.users")
echo "  auth.users: $PRE → $POST"

echo ""
echo "=== Mirror → Lead Intel ==="
docker cp /tmp/mirror-payload.sql leadintel:/tmp/mirror-payload.sql
PRE=$(docker exec leadintel psql -U postgres -d leadintel -tAc "SELECT count(*) FROM auth.users")
docker exec leadintel psql -U postgres -d leadintel -v ON_ERROR_STOP=1 -f /tmp/mirror-payload.sql > /dev/null
POST=$(docker exec leadintel psql -U postgres -d leadintel -tAc "SELECT count(*) FROM auth.users")
echo "  auth.users: $PRE → $POST"

echo ""
echo "=== Final state ==="
echo "platform-auth: $(docker exec platform-db psql -U postgres -d platform -tAc "SELECT count(*) FROM auth.users") users"
echo "ACQ:           $(docker exec acq-coach    psql -U postgres -d acqcoach  -tAc "SELECT count(*) FROM auth.users") users"
echo "LI:            $(docker exec leadintel    psql -U postgres -d leadintel -tAc "SELECT count(*) FROM auth.users") users"
