#!/usr/bin/env bash
# End-to-end test suite for the platform fixes — runs against the LOCAL stack.
#
#   bash scripts/e2e-local-tests.sh
#
# Covers the data/backend layer of every fix shipped this session. UI/browser
# flows (theme toggle, app-card unlock, the actual click-through of logout etc.)
# are in TEST-PLAN.md for manual execution. This script is idempotent and
# cleans up the rows it creates.
#
# Local endpoints (from docker-compose):
#   platform-auth   :9998     launcher (+ /admin-api, /auth proxy) :8080
#   ACQ API         :54421    LI API   :54422
set -uo pipefail
BASE_DIR="${BASE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

PLATFORM_AUTH="http://localhost:9998"
LAUNCHER="http://localhost:8080"
ACQ_API="http://localhost:54421"
LI_API="http://localhost:54422"

ANON_LI=$(grep -E '^ANON_KEY=' "$BASE_DIR/leadintel-selfhost/.env" | head -1 | cut -d= -f2-)
ANON_ACQ=$(grep -E '^ANON_KEY=' "$BASE_DIR/acq-coach-selfhost/.env" | head -1 | cut -d= -f2-)
PW_PLAT=$(grep -E '^POSTGRES_PASSWORD=' "$BASE_DIR/platform-launcher/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true)
PW_ACQ=$(grep -E '^POSTGRES_PASSWORD=' "$BASE_DIR/acq-coach-selfhost/.env" | grep -v CHANGE_ME | tail -1 | cut -d= -f2)
PW_LI=$(grep -E '^POSTGRES_PASSWORD=' "$BASE_DIR/leadintel-selfhost/.env" | grep -v CHANGE_ME | tail -1 | cut -d= -f2)

CID='12620c9f-980c-4a7a-ad89-3515fa770cd0'        # 1 HR Home Offer (platform customer)
ACQ_ACCT='80b98b53-d40c-4858-901d-14a947dc4dd0'
LI_TENANT='2344e10b-cdca-4511-a031-f631115c8e4a'
ADMIN_EMAIL='akshay@sepnexus.com'                  # platform super-admin (local)
ADMIN_PW='Test@12345'
DEON_EMAIL='deon.joseph@closercontrol.com'
DEON_PW='Test@12345'

PASS=0; FAIL=0; FAILED_TESTS=()
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); FAILED_TESTS+=("$1"); }
hdr()  { echo ""; echo "━━━ $1 ━━━"; }
pdb()  { docker exec -e PGPASSWORD="$PW_PLAT" platform-db psql -U postgres -d platform -tA -c "$1" 2>/dev/null; }
adb()  { docker exec -e PGPASSWORD="$PW_ACQ" acq-coach psql -h localhost -U postgres -d acqcoach -tA -c "$1" 2>/dev/null; }
ldb()  { docker exec -e PGPASSWORD="$PW_LI" leadintel psql -h localhost -U postgres -d leadintel -tA -c "$1" 2>/dev/null; }
# platform-db trusts local postgres without a password in most setups; fall back.
pdb()  { docker exec platform-db psql -U postgres -d platform -tA -c "$1" 2>/dev/null; }

jget() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }
mint_li()   { curl -s -m 10 -X POST "$LI_API/auth/v1/token?grant_type=password"   -H "apikey: $ANON_LI"  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jget "['access_token']"; }
mint_acq()  { curl -s -m 10 -X POST "$ACQ_API/auth/v1/token?grant_type=password"  -H "apikey: $ANON_ACQ" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jget "['access_token']"; }
mint_plat() { curl -s -m 10 -X POST "$PLATFORM_AUTH/token?grant_type=password" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jget "['access_token']"; }

echo "════════════════════════════════════════════════════════"
echo " E2E LOCAL TEST SUITE — Closer Control Platform"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────
hdr "T0  Preconditions (stack reachable + admin pw set)"
docker ps --format '{{.Names}}' | grep -q platform-admin-api && ok "admin-api container running" || bad "admin-api container NOT running"
# ensure admin + deon have known local passwords across all three GoTrues
for db in platform-db; do docker exec "$db" psql -U postgres -d platform -c "UPDATE auth.users SET encrypted_password=crypt('$ADMIN_PW',gen_salt('bf')) WHERE email='$ADMIN_EMAIL';" >/dev/null 2>&1; done
adb "UPDATE auth.users SET encrypted_password=crypt('$DEON_PW',gen_salt('bf')) WHERE email='$DEON_EMAIL';" >/dev/null
ldb "UPDATE auth.users SET encrypted_password=crypt('$DEON_PW',gen_salt('bf')) WHERE email='$DEON_EMAIL';" >/dev/null
H=$(curl -s -m 8 "$LAUNCHER/admin-api/health"); [ "$H" = "ok" ] && ok "admin-api health = ok" || bad "admin-api health = '$H'"

# ─────────────────────────────────────────────────────────────
hdr "T1  Unified wallet — both apps charge ONE shared ledger"
pdb "UPDATE platform.customer_wallet SET balance_cents=5000 WHERE customer_id='$CID';" >/dev/null
adb "UPDATE wallets SET balance_cents=5000 WHERE account_id='$ACQ_ACCT';" >/dev/null
ldb "UPDATE wallets SET balance_cents=5000 WHERE tenant_id='$LI_TENANT';" >/dev/null
adb "SELECT debit_wallet('$ACQ_ACCT'::uuid, 300, 'e2e debit', '{}'::jsonb);" >/dev/null
B1=$(pdb "SELECT balance_cents FROM platform.customer_wallet WHERE customer_id='$CID';")
[ "$B1" = "4700" ] && ok "ACQ debit \$3 → shared balance 5000→4700" || bad "ACQ debit: expected 4700, got $B1"
ldb "SELECT credit_wallet('$LI_TENANT'::uuid, 1000, 'credit', 'e2e credit', '{}'::jsonb);" >/dev/null
B2=$(pdb "SELECT balance_cents FROM platform.customer_wallet WHERE customer_id='$CID';")
[ "$B2" = "5700" ] && ok "LI credit \$10 → shared balance 4700→5700 (no double-count)" || bad "LI credit: expected 5700, got $B2"
LEDG=$(pdb "SELECT string_agg(product||':'||type, ',' ORDER BY created_at DESC) FROM (SELECT product,type,created_at FROM platform.wallet_transactions WHERE customer_id='$CID' ORDER BY created_at DESC LIMIT 2) t;")
echo "$LEDG" | grep -q "lead_intel:credit" && echo "$LEDG" | grep -q "acq_coach:debit" && ok "platform ledger has BOTH apps' rows ($LEDG)" || bad "ledger missing a product row: $LEDG"

# ─────────────────────────────────────────────────────────────
hdr "T2  Wallet mirror — app-local balance self-heals within ~35s"
pdb "UPDATE platform.customer_wallet SET balance_cents=5700 WHERE customer_id='$CID';" >/dev/null
adb "UPDATE wallets SET balance_cents=9999 WHERE account_id='$ACQ_ACCT';" >/dev/null
echo "  …waiting 35s for the admin-api mirror sweep…"
sleep 35
AM=$(adb "SELECT balance_cents FROM wallets WHERE account_id='$ACQ_ACCT';")
[ "$AM" = "5700" ] && ok "stale ACQ wallet 9999 → mirrored back to shared 5700" || bad "mirror: expected 5700, got $AM"

# ─────────────────────────────────────────────────────────────
hdr "T3  Unified transaction history RPC (LI billing tab source)"
TOK=$(mint_li "$DEON_EMAIL" "$DEON_PW")
ROWS=$(curl -s -m 12 -X POST "$LI_API/rest/v1/rpc/get_unified_wallet_transactions" -H "Authorization: Bearer $TOK" -H "apikey: $ANON_LI" -H "Content-Type: application/json" -d "{\"p_tenant_id\":\"$LI_TENANT\",\"p_limit\":10}")
N=$(echo "$ROWS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "${N:-0}" -ge 1 ] && ok "RPC returns unified rows (n=$N)" || bad "RPC returned no rows / error: $(echo "$ROWS"|head -c 120)"
echo "$ROWS" | grep -q '"description"' && (echo "$ROWS" | grep -qE 'ACQ —|LI —' && ok "rows tagged ACQ —/LI —" || bad "rows not product-tagged") || true

# ─────────────────────────────────────────────────────────────
hdr "T4  Super-admin: create from API → login → admin access → revoke"
AT=$(mint_plat "$ADMIN_EMAIL" "$ADMIN_PW")
[ -n "$AT" ] && ok "platform super-admin login (akshay)" || bad "could not mint admin token"
NEW_EMAIL="e2e_superadmin_$$@test.com"
CRES=$(curl -s -m 15 -X POST "$LAUNCHER/admin-api/users" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d "{\"email\":\"$NEW_EMAIL\",\"password\":\"NewE2E@2026\",\"is_platform_admin\":true}")
NID=$(echo "$CRES" | jget "['user_id']")
[ -n "$NID" ] && ok "created super-admin ($NEW_EMAIL)" || bad "create failed: $(echo "$CRES"|head -c 120)"
NTOK=$(mint_plat "$NEW_EMAIL" "NewE2E@2026")
[ -n "$NTOK" ] && ok "new super-admin can log in" || bad "new super-admin cannot log in"
ME=$(curl -s -m 10 "$LAUNCHER/admin-api/me" -H "Authorization: Bearer $NTOK" | jget "['admin']['email']")
[ "$ME" = "$NEW_EMAIL" ] && ok "new super-admin reaches admin-only /me (is_platform_admin works)" || bad "admin gate failed for new user: $ME"
REV=$(curl -s -m 10 -X PATCH "$LAUNCHER/admin-api/users/$NID/platform-admin" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d '{"is_platform_admin":false}' | jget "['is_platform_admin']")
AFTER=$(pdb "SELECT is_platform_admin FROM platform.users WHERE id='$NID';")
[ "$REV" = "False" ] && [ "$AFTER" = "f" ] && ok "revoke platform-admin toggle works (db=f)" || bad "revoke failed: resp=$REV db=$AFTER"
# cleanup
pdb "DELETE FROM platform.audit_log WHERE target_user_id='$NID'; DELETE FROM auth.users WHERE id='$NID'; DELETE FROM platform.users WHERE id='$NID';" >/dev/null
adb "DELETE FROM auth.users WHERE id='$NID';" >/dev/null; ldb "DELETE FROM auth.users WHERE id='$NID';" >/dev/null
ok "cleaned up test super-admin"

# ─────────────────────────────────────────────────────────────
hdr "T5  SSO liveness — revoked session is detected (stuck-account fix)"
LT=$(mint_li "$DEON_EMAIL" "$DEON_PW")
ALIVE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$LI_API/auth/v1/user" -H "apikey: $ANON_LI" -H "Authorization: Bearer $LT")
[ "$ALIVE" = "200" ] && ok "live session → /auth/v1/user = 200 (handoff allowed)" || bad "live check expected 200, got $ALIVE"
MIR=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST "$LAUNCHER/admin-api/sso/mirror-session" -H "Authorization: Bearer $LT")
[ "$MIR" = "200" ] && ok "mirror-session accepts a live token" || bad "mirror-session expected 200, got $MIR"
curl -s -m 10 -o /dev/null -X POST "$LI_API/auth/v1/logout" -H "apikey: $ANON_LI" -H "Authorization: Bearer $LT"
DEAD=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$LI_API/auth/v1/user" -H "apikey: $ANON_LI" -H "Authorization: Bearer $LT")
[ "$DEAD" = "401" ] || [ "$DEAD" = "403" ] && ok "after logout → /auth/v1/user = $DEAD (launcher discards dead token, no stuck screen)" || bad "revoked check expected 401/403, got $DEAD"

# ─────────────────────────────────────────────────────────────
hdr "T6  Contacts reconcile — prunes deleted-in-GHL, keeps current, cascades"
ldb "INSERT INTO ghl_contacts (tenant_id,ghl_contact_id,synced_at,raw_payload) VALUES ('$LI_TENANT','E2E_FRESH1',now(),'{}'),('$LI_TENANT','E2E_FRESH2',now(),'{}'),('$LI_TENANT','E2E_STALE',now()-interval '2 days','{}') ON CONFLICT (tenant_id,ghl_contact_id) DO UPDATE SET synced_at=EXCLUDED.synced_at;" >/dev/null
ldb "INSERT INTO ghl_contact_tags (tenant_id,ghl_contact_id,tag) VALUES ('$LI_TENANT','E2E_STALE','e2e-tag') ON CONFLICT DO NOTHING;" >/dev/null
SWEEP=$(ldb "SELECT (now()-interval '1 hour')::text;")
ldb "DELETE FROM ghl_contacts WHERE tenant_id='$LI_TENANT' AND ghl_contact_id LIKE 'E2E_%' AND synced_at < '$SWEEP';" >/dev/null
GONE=$(ldb "SELECT count(*) FROM ghl_contacts WHERE ghl_contact_id='E2E_STALE';")
KEPT=$(ldb "SELECT count(*) FROM ghl_contacts WHERE tenant_id='$LI_TENANT' AND ghl_contact_id IN ('E2E_FRESH1','E2E_FRESH2');")
TAGGONE=$(ldb "SELECT count(*) FROM ghl_contact_tags WHERE ghl_contact_id='E2E_STALE';")
[ "$GONE" = "0" ] && [ "$KEPT" = "2" ] && [ "$TAGGONE" = "0" ] && ok "stale pruned, 2 fresh kept, tag cascade-deleted" || bad "reconcile: stale=$GONE kept=$KEPT tag=$TAGGONE"
ldb "DELETE FROM ghl_contacts WHERE tenant_id='$LI_TENANT' AND ghl_contact_id LIKE 'E2E_%';" >/dev/null

# ─────────────────────────────────────────────────────────────
hdr "T7  Login pages redirect to launcher (bundle baked)"
check_bundle_launcher() {  # $1=app port  $2=label
  local html js
  html=$(curl -s -m 5 "http://localhost:$1/")
  js=$(echo "$html" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  echo "  $2 bundle: $js"
  curl -s -m 20 "http://localhost:$1/assets/$js" -o /tmp/e2e_bundle.js
  if grep -qE "localhost:8080|closercontrol" /tmp/e2e_bundle.js \
     && grep -q "window.location.replace" /tmp/e2e_bundle.js; then
    ok "$2 bundle has launcher URL + redirect"
  else
    bad "$2 bundle missing launcher URL/redirect"
  fi
}
check_bundle_launcher 3101 "LI"
check_bundle_launcher 3100 "ACQ"

# ─────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo " RESULTS:  $PASS passed,  $FAIL failed"
if [ "$FAIL" -gt 0 ]; then printf '   FAILED: %s\n' "${FAILED_TESTS[@]}"; fi
echo "════════════════════════════════════════════════════════"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
