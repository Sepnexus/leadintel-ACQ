#!/usr/bin/env bash
# Generates POSTGRES_PASSWORD, AUTHENTICATOR_PASSWORD, AUTH_ADMIN_PASSWORD,
# JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, CRON_SECRET and prints them in .env
# format so you can paste straight into your .env file.

set -euo pipefail

JWT_SECRET=$(openssl rand -hex 32)
PG_PW=$(openssl rand -hex 24)
AUTHENTICATOR_PW=$(openssl rand -hex 24)
AUTH_ADMIN_PW=$(openssl rand -hex 24)
CRON_SECRET=$(openssl rand -hex 32)

mk_jwt() {
  local role=$1
  python3 - "$JWT_SECRET" "$role" <<'PY'
import sys, hmac, hashlib, base64, json, time
secret, role = sys.argv[1], sys.argv[2]

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

header  = b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(',',':')).encode())
now = int(time.time())
payload = b64(json.dumps({
    "role": role,
    "iss":  "supabase",
    "iat":  now,
    "exp":  now + 60*60*24*365*10,   # 10 years
}, separators=(',',':')).encode())
signing_input = f"{header}.{payload}".encode()
sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
print(f"{header}.{payload}.{b64(sig)}")
PY
}

ANON=$(mk_jwt anon)
SVC=$(mk_jwt service_role)

cat <<EOF
# Paste these into your .env (overwrites the CHANGE_ME values):

POSTGRES_PASSWORD=$PG_PW
AUTHENTICATOR_PASSWORD=$AUTHENTICATOR_PW
AUTH_ADMIN_PASSWORD=$AUTH_ADMIN_PW
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON
SERVICE_ROLE_KEY=$SVC

# Cron auth (used by pg_cron jobs calling sync-resume-cron + sync-all-tenants-cron):
CRON_SECRET=$CRON_SECRET
EOF
