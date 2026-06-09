#!/usr/bin/env bash
# Generate a complete set of secrets for a fresh Sepnexus VPS deployment.
# Prints them to stdout — copy/paste the block into .env.vps.
#
# Usage:
#   bash scripts/gen-vps-secrets.sh
#
# What it generates:
#   - JWT_SECRET                 — shared by all 4 GoTrue instances + admin-api
#   - ANON_KEY / SERVICE_ROLE_KEY (×3) — derived from JWT_SECRET, one set per app
#   - TOKEN_ENCRYPTION_KEY       — pgp_sym_encrypt key for GHL PIT tokens
#   - POSTGRES passwords         — one per DB (platform-db, acq, leadintel)
#
# Why these specifically:
#   - JWT_SECRET is SHARED across platform-auth + ACQ GoTrue + LI GoTrue. That's
#     what makes cross-app SSO work — a token issued by platform-auth validates
#     against the apps' GoTrues.
#   - Each app's GoTrue still needs its OWN anon + service_role keys (signed
#     with that same JWT_SECRET but with different role claims).
#   - TOKEN_ENCRYPTION_KEY lives ONLY in platform-admin-api's env. If you lose
#     it, every customer's GHL PIT token has to be re-entered manually.

set -e

# require openssl (we shell out for JWT signing too)
if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required but not installed." >&2
  exit 1
fi

# Sign a JWT with HS256 using openssl. Args: $1=payload-json $2=secret
sign_jwt() {
  local payload="$1"
  local secret="$2"
  local header='{"alg":"HS256","typ":"JWT"}'
  local b64h b64p sig
  b64h=$(printf '%s' "$header"  | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
  b64p=$(printf '%s' "$payload" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
  sig=$(printf '%s.%s' "$b64h" "$b64p" \
        | openssl dgst -binary -sha256 -hmac "$secret" \
        | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
  printf '%s.%s.%s\n' "$b64h" "$b64p" "$sig"
}

# Random URL-safe-ish string. $1 = byte count (32 → ~43 chars).
rand() { openssl rand -hex "$1"; }

JWT_SECRET=$(rand 32)
TOKEN_ENCRYPTION_KEY=$(rand 32)

POSTGRES_PASSWORD_PLATFORM=$(rand 24)
POSTGRES_PASSWORD_ACQ=$(rand 24)
POSTGRES_PASSWORD_LEADINTEL=$(rand 24)

AUTHENTICATOR_PASSWORD=$(rand 24)
AUTH_ADMIN_PASSWORD=$(rand 24)

# Anon + service-role JWTs for each app's GoTrue + PostgREST.
# Iat: 2026-01-01,  Exp: 2036-01-01. Signed with the shared JWT_SECRET.
# `role: anon` for public/anon, `role: service_role` for server-side.
IAT=1767225600   # 2026-01-01T00:00:00Z
EXP=2082758400   # 2036-01-01T00:00:00Z

# ACQ
ACQ_ANON_KEY=$(sign_jwt        "{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"          "$JWT_SECRET")
ACQ_SERVICE_ROLE_KEY=$(sign_jwt "{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}" "$JWT_SECRET")

# Lead Intel
LI_ANON_KEY=$(sign_jwt        "{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}"          "$JWT_SECRET")
LI_SERVICE_ROLE_KEY=$(sign_jwt "{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}" "$JWT_SECRET")

# Same keys (string-identical) because both GoTrues share the same JWT_SECRET
# and we use identical claims. That's fine — they're scoped to their own DB.
# Kept separate vars below for clarity in the .env file.

cat <<EOF

# ═══════════════════════════════════════════════════════════════════════════
# Generated secrets — paste the lines below into .env.vps
# ═══════════════════════════════════════════════════════════════════════════

# ─── Shared across all 4 backends ───────────────────────────────────────────
JWT_SECRET=$JWT_SECRET

# ─── platform-admin-api only ────────────────────────────────────────────────
TOKEN_ENCRYPTION_KEY=$TOKEN_ENCRYPTION_KEY

# ─── platform-db ────────────────────────────────────────────────────────────
PLATFORM_POSTGRES_PASSWORD=$POSTGRES_PASSWORD_PLATFORM

# ─── ACQ Coach DB ───────────────────────────────────────────────────────────
ACQ_POSTGRES_PASSWORD=$POSTGRES_PASSWORD_ACQ
ACQ_AUTHENTICATOR_PASSWORD=$AUTHENTICATOR_PASSWORD
ACQ_AUTH_ADMIN_PASSWORD=$AUTH_ADMIN_PASSWORD
ACQ_ANON_KEY=$ACQ_ANON_KEY
ACQ_SERVICE_ROLE_KEY=$ACQ_SERVICE_ROLE_KEY

# ─── Lead Intel DB ──────────────────────────────────────────────────────────
LEADINTEL_POSTGRES_PASSWORD=$POSTGRES_PASSWORD_LEADINTEL
LEADINTEL_AUTHENTICATOR_PASSWORD=$AUTHENTICATOR_PASSWORD
LEADINTEL_AUTH_ADMIN_PASSWORD=$AUTH_ADMIN_PASSWORD
LEADINTEL_ANON_KEY=$LI_ANON_KEY
LEADINTEL_SERVICE_ROLE_KEY=$LI_SERVICE_ROLE_KEY

# ═══════════════════════════════════════════════════════════════════════════
# Save these somewhere safe (1Password / Bitwarden / sealed env file).
# Losing JWT_SECRET = every user has to re-login.
# Losing TOKEN_ENCRYPTION_KEY = every customer's GHL token has to be re-set.
# ═══════════════════════════════════════════════════════════════════════════
EOF
