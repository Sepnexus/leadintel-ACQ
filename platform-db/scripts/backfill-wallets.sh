#!/usr/bin/env bash
# Phase C1 backfill — snapshot of customer wallet balances + historical
# transaction ledger.
#
# customer_wallet.balance_cents = COALESCE(acq.wallets.balance_cents, 0)
#                               + COALESCE(li.wallets.balance_cents,  0)
#
# wallet_transactions copies historical rows from both apps, tagged with product.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2-)
ACQ_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../acq-coach-selfhost/.env" | tail -1 | cut -d= -f2-)
LI_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../leadintel-selfhost/.env" | tail -1 | cut -d= -f2-)

log() { echo "[backfill-wallets] $*"; }

PLATFORM_PSQL() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" platform-db \
    psql -h 127.0.0.1 -U postgres -d platform "$@"
}

# Wallets
dump_acq_wallets() {
  docker exec -i -e PGPASSWORD="$ACQ_PW" acq-coach \
    psql -h 127.0.0.1 -U postgres -d acqcoach -At -F $'\t' -P null='\N' -c \
    "SELECT account_id, balance_cents FROM wallets;"
}
dump_li_wallets() {
  docker exec -i -e PGPASSWORD="$LI_PW" leadintel \
    psql -h 127.0.0.1 -U postgres -d leadintel -At -F $'\t' -P null='\N' -c \
    "SELECT tenant_id, balance_cents FROM wallets;"
}

# Wallet transactions
dump_acq_tx() {
  docker exec -i -e PGPASSWORD="$ACQ_PW" acq-coach \
    psql -h 127.0.0.1 -U postgres -d acqcoach -At -F $'\t' -P null='\N' -c \
    "SELECT id, account_id, type, amount_cents, balance_after_cents, reason, stripe_session_id, metadata::text, created_at FROM wallet_transactions;"
}
dump_li_tx() {
  docker exec -i -e PGPASSWORD="$LI_PW" leadintel \
    psql -h 127.0.0.1 -U postgres -d leadintel -At -F $'\t' -P null='\N' -c \
    "SELECT id, tenant_id, type, amount_cents, balance_after_cents, description, metadata::text, created_at FROM wallet_transactions;"
}

log "snapshotting wallets"
ACQ_W=$(dump_acq_wallets); log "  ACQ: $(echo "$ACQ_W" | grep -c .) wallets"
LI_W=$(dump_li_wallets);   log "  LI : $(echo "$LI_W" | grep -c .) wallets"

log "snapshotting wallet_transactions"
ACQ_T=$(dump_acq_tx); log "  ACQ: $(echo "$ACQ_T" | grep -c .) tx"
LI_T=$(dump_li_tx);   log "  LI : $(echo "$LI_T" | grep -c .) tx"

TMPSQL="$(mktemp -t platform_backfill_wallets.XXXXXX.sql)"
trap "rm -f $TMPSQL" EXIT

{
  echo "BEGIN;"
  cat <<'SQL'
CREATE TEMP TABLE _w_acq (account_id uuid, balance_cents int) ON COMMIT DROP;
CREATE TEMP TABLE _w_li  (tenant_id uuid, balance_cents int) ON COMMIT DROP;
CREATE TEMP TABLE _t_acq (id uuid, account_id uuid, type text, amount_cents int, balance_after_cents int,
                          reason text, stripe_session_id text, metadata jsonb, created_at timestamptz) ON COMMIT DROP;
CREATE TEMP TABLE _t_li  (id uuid, tenant_id uuid, type text, amount_cents int, balance_after_cents int,
                          description text, metadata jsonb, created_at timestamptz) ON COMMIT DROP;
SQL
  echo "COPY _w_acq FROM stdin;"; printf '%s\n' "$ACQ_W"; echo '\.'
  echo "COPY _w_li FROM stdin;";  printf '%s\n' "$LI_W";  echo '\.'
  echo "COPY _t_acq FROM stdin;"; printf '%s\n' "$ACQ_T"; echo '\.'
  echo "COPY _t_li FROM stdin;";  printf '%s\n' "$LI_T";  echo '\.'

  cat <<'SQL'

-- ── Snapshot wallet balances ──
-- per-customer balance = acq.balance + li.balance (or whichever exists)
INSERT INTO platform.customer_wallet (customer_id, balance_cents, refreshed_at)
SELECT
  c.id,
  COALESCE(a.balance_cents, 0) + COALESCE(l.balance_cents, 0),
  now()
FROM platform.customers c
  LEFT JOIN _w_acq a ON a.account_id = c.acq_account_id
  LEFT JOIN _w_li  l ON l.tenant_id  = c.leadintel_tenant_id
WHERE a.account_id IS NOT NULL OR l.tenant_id IS NOT NULL
ON CONFLICT (customer_id) DO UPDATE
SET balance_cents = EXCLUDED.balance_cents,
    refreshed_at  = EXCLUDED.refreshed_at;

-- ── Backfill transaction ledger ──
INSERT INTO platform.wallet_transactions (id, customer_id, product, type, amount_cents,
                                          balance_after_cents, reason, stripe_session_id,
                                          metadata, created_at)
SELECT t.id, c.id, 'acq_coach'::platform.product,
       t.type, t.amount_cents, t.balance_after_cents,
       t.reason, t.stripe_session_id, COALESCE(t.metadata, '{}'::jsonb), t.created_at
FROM _t_acq t
JOIN platform.customers c ON c.acq_account_id = t.account_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform.wallet_transactions (id, customer_id, product, type, amount_cents,
                                          balance_after_cents, reason, metadata, created_at)
SELECT t.id, c.id, 'lead_intel'::platform.product,
       t.type, t.amount_cents, t.balance_after_cents,
       t.description, COALESCE(t.metadata, '{}'::jsonb), t.created_at
FROM _t_li t
JOIN platform.customers c ON c.leadintel_tenant_id = t.tenant_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform.audit_log (action, metadata)
VALUES (
  'backfill_wallets',
  jsonb_build_object(
    'wallets_after',   (SELECT count(*) FROM platform.customer_wallet),
    'tx_after',        (SELECT count(*) FROM platform.wallet_transactions),
    'platform_total_cents', (SELECT COALESCE(sum(balance_cents),0) FROM platform.customer_wallet)
  )
);

COMMIT;

SELECT 'customer_wallet.total      ' AS metric, count(*) AS n FROM platform.customer_wallet
UNION ALL
SELECT 'platform_total_cents       ', COALESCE(sum(balance_cents),0) FROM platform.customer_wallet
UNION ALL
SELECT 'wallet_transactions.total  ', count(*) FROM platform.wallet_transactions
UNION ALL
SELECT 'wallet_transactions.credit ', count(*) FROM platform.wallet_transactions WHERE type='credit'
UNION ALL
SELECT 'wallet_transactions.debit  ', count(*) FROM platform.wallet_transactions WHERE type='debit';
SQL
} > "$TMPSQL"

log "applying backfill"
PLATFORM_PSQL -v ON_ERROR_STOP=1 < "$TMPSQL"
log "done"
