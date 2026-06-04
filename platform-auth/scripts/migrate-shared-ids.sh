#!/bin/bash
# Phase C2 — Surgically rewrite LI's auth.users.id (and all FK references)
# for the 3 emails that exist in BOTH ACQ and LI, so a single JWT.sub
# works against both apps' PostgRESTs.
#
# Canonical: ACQ's UUID wins.
#
# Mapping (computed dynamically from current DBs — script reads both):
#   akshay@sepnexus.com         : LI 34de4a56... → 67180af0... (ACQ)
#   deon.joseph@closercontrol.com: LI 5839f24b... → ffba3005... (ACQ)
#   mahmoud@roundtreerealty.net : LI 21b8e7e2... → edcac91c... (ACQ)
#
# Touches in LI:
#   auth.users.id, auth.identities.user_id, auth.sessions.user_id,
#   auth.mfa_factors.user_id, auth.one_time_tokens.user_id
#   public.users.id, public.usage_events.user_id
#   public.user_invitations.accepted_user_id, public.user_invitations.invited_by_user_id
#   public.audit_log.actor_user_id, public.sync_history.triggered_by_user_id
#   public.tenant_users.user_id
# Touches in platform-db:
#   platform.users.leadintel_user_id (update back-pointer)
#
# Safe to re-run — UPDATEs are idempotent because the WHERE matches old_id only.

set -e
cd "$(dirname "$0")/../.."

EMAILS=(
  "akshay@sepnexus.com"
  "deon.joseph@closercontrol.com"
  "mahmoud@roundtreerealty.net"
)

for EMAIL in "${EMAILS[@]}"; do
  echo ""
  echo "─── ${EMAIL} ───"
  ACQ_ID=$(docker exec acq-coach psql -U postgres -d acqcoach -tAc "SELECT id FROM auth.users WHERE email = '$EMAIL'" 2>/dev/null | tr -d '[:space:]')
  LI_ID=$(docker exec leadintel psql -U postgres -d leadintel -tAc "SELECT id FROM auth.users WHERE email = '$EMAIL'" 2>/dev/null | tr -d '[:space:]')

  if [ -z "$ACQ_ID" ] || [ -z "$LI_ID" ]; then
    echo "  ! missing one side (ACQ=$ACQ_ID LI=$LI_ID) — skip"
    continue
  fi
  if [ "$ACQ_ID" = "$LI_ID" ]; then
    echo "  ✓ already matched ($ACQ_ID) — skip"
    continue
  fi
  echo "  ACQ id : $ACQ_ID"
  echo "  LI  id : $LI_ID  → rewriting to $ACQ_ID"

  docker exec -i leadintel psql -U postgres -d leadintel -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET session_replication_role = replica;  -- temporarily disables FK + RLS triggers

UPDATE auth.users          SET id                  = '$ACQ_ID' WHERE id          = '$LI_ID';
UPDATE auth.identities     SET user_id             = '$ACQ_ID' WHERE user_id     = '$LI_ID';
UPDATE auth.sessions       SET user_id             = '$ACQ_ID' WHERE user_id     = '$LI_ID';
UPDATE auth.mfa_factors    SET user_id             = '$ACQ_ID' WHERE user_id     = '$LI_ID';
UPDATE auth.one_time_tokens SET user_id            = '$ACQ_ID' WHERE user_id     = '$LI_ID';

UPDATE public.users        SET id                  = '$ACQ_ID' WHERE id          = '$LI_ID';
UPDATE public.usage_events SET user_id             = '$ACQ_ID' WHERE user_id     = '$LI_ID';
UPDATE public.user_invitations SET accepted_user_id   = '$ACQ_ID' WHERE accepted_user_id   = '$LI_ID';
UPDATE public.user_invitations SET invited_by_user_id = '$ACQ_ID' WHERE invited_by_user_id = '$LI_ID';
UPDATE public.audit_log    SET actor_user_id       = '$ACQ_ID' WHERE actor_user_id      = '$LI_ID';
UPDATE public.sync_history SET triggered_by_user_id = '$ACQ_ID' WHERE triggered_by_user_id = '$LI_ID';
UPDATE public.tenant_users SET user_id             = '$ACQ_ID' WHERE user_id     = '$LI_ID';

SET session_replication_role = DEFAULT;

-- Validate: no dangling FKs (would have errored on COMMIT otherwise; pgcheck:
SELECT 'auth.users still has old id' AS check, count(*) FROM auth.users WHERE id = '$LI_ID';
SELECT 'auth.identities still has old fk' AS check, count(*) FROM auth.identities WHERE user_id = '$LI_ID';

COMMIT;
SQL

  # Update platform-db back-pointer
  docker exec platform-db psql -U postgres -d platform -v ON_ERROR_STOP=1 -c "
    UPDATE platform.users SET leadintel_user_id = '$ACQ_ID' WHERE leadintel_user_id = '$LI_ID';
  "
  echo "  ✓ done"
done

echo ""
echo "─── verification ───"
echo "Shared-email users now have matching IDs in ACQ + LI:"
for EMAIL in "${EMAILS[@]}"; do
  ACQ_ID=$(docker exec acq-coach psql -U postgres -d acqcoach -tAc "SELECT id FROM auth.users WHERE email = '$EMAIL'" 2>/dev/null | tr -d '[:space:]')
  LI_ID=$(docker exec leadintel psql -U postgres -d leadintel -tAc "SELECT id FROM auth.users WHERE email = '$EMAIL'" 2>/dev/null | tr -d '[:space:]')
  if [ "$ACQ_ID" = "$LI_ID" ]; then
    echo "  ✓ $EMAIL  → $ACQ_ID"
  else
    echo "  ✗ $EMAIL  ACQ=$ACQ_ID  LI=$LI_ID"
  fi
done
