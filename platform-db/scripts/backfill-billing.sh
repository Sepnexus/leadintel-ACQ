#!/usr/bin/env bash
# Phase B3 backfill — populate platform.billing_settings from each app's
# existing billing_settings, deduplicated by customer_id.
#
# Conflict resolution rule:
#   If both apps have a Stripe customer for the same platform customer, prefer
#   Lead Intel's (it's the active app where most billing has happened).
#   Audit the conflict so you can manually merge in Stripe later if needed.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2-)
ACQ_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../acq-coach-selfhost/.env" | tail -1 | cut -d= -f2-)
LI_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../leadintel-selfhost/.env" | tail -1 | cut -d= -f2-)

log() { echo "[backfill-billing] $*"; }

dump_acq_billing() {
  docker exec -i -e PGPASSWORD="$ACQ_PW" acq-coach \
    psql -h 127.0.0.1 -U postgres -d acqcoach -At -F $'\t' -P null='\N' -c \
    "SELECT account_id, stripe_customer_id, default_payment_method_id, card_brand,
            card_last4, card_exp_month, card_exp_year, auto_recharge_enabled,
            threshold_cents, topup_amount_cents
     FROM billing_settings;"
}
dump_li_billing() {
  docker exec -i -e PGPASSWORD="$LI_PW" leadintel \
    psql -h 127.0.0.1 -U postgres -d leadintel -At -F $'\t' -P null='\N' -c \
    "SELECT tenant_id, stripe_customer_id, default_payment_method_id, card_brand,
            card_last4, card_exp_month, card_exp_year, auto_recharge_enabled,
            threshold_cents, topup_amount_cents
     FROM billing_settings;"
}
PLATFORM_PSQL() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" platform-db \
    psql -h 127.0.0.1 -U postgres -d platform "$@"
}

log "snapshotting ACQ billing_settings"
ACQ_DATA=$(dump_acq_billing); log "  $(echo "$ACQ_DATA" | grep -c .) rows"
log "snapshotting Lead Intel billing_settings"
LI_DATA=$(dump_li_billing); log "  $(echo "$LI_DATA" | grep -c .) rows"

TMPSQL="$(mktemp -t platform_backfill_billing.XXXXXX.sql)"
trap "rm -f $TMPSQL" EXIT

{
  echo "BEGIN;"
  cat <<'SQL'
CREATE TEMP TABLE _src_acq (account_id uuid, stripe_customer_id text, default_payment_method_id text,
                            card_brand text, card_last4 text, card_exp_month int, card_exp_year int,
                            auto_recharge_enabled boolean, threshold_cents int, topup_amount_cents int) ON COMMIT DROP;
CREATE TEMP TABLE _src_li (tenant_id uuid, stripe_customer_id text, default_payment_method_id text,
                           card_brand text, card_last4 text, card_exp_month int, card_exp_year int,
                           auto_recharge_enabled boolean, threshold_cents int, topup_amount_cents int) ON COMMIT DROP;
SQL
  echo "COPY _src_acq FROM stdin;"; printf '%s\n' "$ACQ_DATA"; echo '\.'
  echo "COPY _src_li FROM stdin;";  printf '%s\n' "$LI_DATA";  echo '\.'

  cat <<'SQL'

-- Join each source against platform.customers via the back-pointer.
-- For each customer, prefer Lead Intel's row if it has a stripe_customer_id;
-- else fall back to ACQ's row.
WITH joined AS (
  SELECT c.id AS customer_id,
         -- Coalesce by preferring LI's Stripe customer when present
         COALESCE(NULLIF(l.stripe_customer_id, ''), NULLIF(a.stripe_customer_id, '')) AS stripe_customer_id,
         COALESCE(NULLIF(l.default_payment_method_id, ''), NULLIF(a.default_payment_method_id, '')) AS default_payment_method_id,
         COALESCE(NULLIF(l.card_brand, ''), NULLIF(a.card_brand, '')) AS card_brand,
         COALESCE(NULLIF(l.card_last4, ''), NULLIF(a.card_last4, '')) AS card_last4,
         COALESCE(l.card_exp_month, a.card_exp_month) AS card_exp_month,
         COALESCE(l.card_exp_year,  a.card_exp_year)  AS card_exp_year,
         COALESCE(l.auto_recharge_enabled, a.auto_recharge_enabled, false) AS auto_recharge_enabled,
         COALESCE(l.threshold_cents,    a.threshold_cents,    500)   AS threshold_cents,
         COALESCE(l.topup_amount_cents, a.topup_amount_cents, 2000)  AS topup_amount_cents,
         (a.stripe_customer_id IS NOT NULL AND l.stripe_customer_id IS NOT NULL
          AND a.stripe_customer_id <> l.stripe_customer_id)  AS has_conflict,
         a.stripe_customer_id AS acq_stripe_id,
         l.stripe_customer_id AS li_stripe_id
  FROM platform.customers c
    LEFT JOIN _src_acq a ON a.account_id = c.acq_account_id
    LEFT JOIN _src_li  l ON l.tenant_id  = c.leadintel_tenant_id
  WHERE a.account_id IS NOT NULL OR l.tenant_id IS NOT NULL
)
INSERT INTO platform.billing_settings (
  customer_id, stripe_customer_id, default_payment_method_id,
  card_brand, card_last4, card_exp_month, card_exp_year,
  auto_recharge_enabled, threshold_cents, topup_amount_cents
)
SELECT
  customer_id, stripe_customer_id, default_payment_method_id,
  card_brand, card_last4, card_exp_month, card_exp_year,
  auto_recharge_enabled, threshold_cents, topup_amount_cents
FROM joined
ON CONFLICT (customer_id) DO UPDATE
SET stripe_customer_id        = COALESCE(EXCLUDED.stripe_customer_id,        platform.billing_settings.stripe_customer_id),
    default_payment_method_id = COALESCE(EXCLUDED.default_payment_method_id, platform.billing_settings.default_payment_method_id),
    card_brand                = COALESCE(EXCLUDED.card_brand,                platform.billing_settings.card_brand),
    card_last4                = COALESCE(EXCLUDED.card_last4,                platform.billing_settings.card_last4),
    card_exp_month            = COALESCE(EXCLUDED.card_exp_month,            platform.billing_settings.card_exp_month),
    card_exp_year             = COALESCE(EXCLUDED.card_exp_year,             platform.billing_settings.card_exp_year);

-- Audit any conflicts (different Stripe IDs across apps for the same customer)
INSERT INTO platform.audit_log (action, metadata)
SELECT 'billing_backfill_conflict',
       jsonb_build_object('customer_id', customer_id, 'acq_stripe_id', acq_stripe_id, 'li_stripe_id', li_stripe_id, 'kept', li_stripe_id)
FROM (
  SELECT c.id AS customer_id, a.stripe_customer_id AS acq_stripe_id, l.stripe_customer_id AS li_stripe_id
  FROM platform.customers c
    LEFT JOIN _src_acq a ON a.account_id = c.acq_account_id
    LEFT JOIN _src_li  l ON l.tenant_id  = c.leadintel_tenant_id
  WHERE a.stripe_customer_id IS NOT NULL
    AND l.stripe_customer_id IS NOT NULL
    AND a.stripe_customer_id <> l.stripe_customer_id
) conflicts;

INSERT INTO platform.audit_log (action, metadata)
VALUES (
  'backfill_billing',
  jsonb_build_object(
    'acq_source_count',    (SELECT count(*) FROM _src_acq),
    'leadintel_source_count', (SELECT count(*) FROM _src_li),
    'platform_rows_after',  (SELECT count(*) FROM platform.billing_settings),
    'stripe_customers_after', (SELECT count(*) FROM platform.billing_settings WHERE stripe_customer_id IS NOT NULL)
  )
);

COMMIT;

SELECT 'billing_settings.total       ' AS metric, count(*) AS n FROM platform.billing_settings
UNION ALL
SELECT 'with_stripe_customer         ', count(*) FROM platform.billing_settings WHERE stripe_customer_id IS NOT NULL
UNION ALL
SELECT 'with_default_payment_method  ', count(*) FROM platform.billing_settings WHERE default_payment_method_id IS NOT NULL
UNION ALL
SELECT 'auto_recharge_enabled        ', count(*) FROM platform.billing_settings WHERE auto_recharge_enabled;
SQL
} > "$TMPSQL"

log "applying backfill"
PLATFORM_PSQL -v ON_ERROR_STOP=1 < "$TMPSQL"
log "done"
