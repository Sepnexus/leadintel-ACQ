#!/usr/bin/env bash
# Phase B2 backfill — copy historical usage_events from both apps into
# platform.usage_events. Product-specific fields go into metadata.
#
# Idempotent via INSERT ... ON CONFLICT DO NOTHING (id is preserved).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | tail -1 | cut -d= -f2-)
ACQ_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../acq-coach-selfhost/.env" | tail -1 | cut -d= -f2-)
LI_PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/../leadintel-selfhost/.env" | tail -1 | cut -d= -f2-)

log() { echo "[backfill-usage] $*"; }

PLATFORM_PSQL() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" platform-db \
    psql -h 127.0.0.1 -U postgres -d platform "$@"
}

# Dump ACQ usage_events as TSV with a JSON metadata column carrying ACQ-specific fields.
dump_acq() {
  docker exec -i -e PGPASSWORD="$ACQ_PW" acq-coach \
    psql -h 127.0.0.1 -U postgres -d acqcoach -At -F $'\t' -P null='\N' -c "
    SELECT
      id, account_id, COALESCE(operation,'unknown'), COALESCE(provider,'unknown'), model,
      provider_cost_cents, billed_cents,
      jsonb_build_object(
        'audio_seconds',     audio_seconds,
        'tokens_in',         tokens_in,
        'tokens_out',        tokens_out,
        'margin_cents',      margin_cents,
        'call_id',           call_id,
        'ghl_message_id',    ghl_message_id,
        'status',            status,
        'error_message',     error_message,
        'effective_seconds', effective_seconds,
        'markup_multiplier', markup_multiplier
      )::text,
      created_at
    FROM usage_events;"
}
dump_li() {
  docker exec -i -e PGPASSWORD="$LI_PW" leadintel \
    psql -h 127.0.0.1 -U postgres -d leadintel -At -F $'\t' -P null='\N' -c "
    SELECT
      id, tenant_id, user_id, COALESCE(operation,'unknown'), COALESCE(provider,'unknown'), model,
      cost_cents, charged_cents,
      jsonb_build_object('billing_mode', billing_mode)::text,
      created_at
    FROM usage_events;"
}

log "snapshotting ACQ usage_events"
ACQ_DATA=$(dump_acq); log "  $(echo "$ACQ_DATA" | grep -c .) rows"
log "snapshotting Lead Intel usage_events"
LI_DATA=$(dump_li); log "  $(echo "$LI_DATA" | grep -c .) rows"

TMPSQL="$(mktemp -t platform_backfill_usage.XXXXXX.sql)"
trap "rm -f $TMPSQL" EXIT

{
  echo "BEGIN;"
  cat <<'SQL'
CREATE TEMP TABLE _src_acq (
  id uuid, account_id uuid, operation text, provider text, model text,
  provider_cost_cents numeric, billed_cents integer, metadata jsonb,
  created_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE _src_li (
  id uuid, tenant_id uuid, user_id uuid, operation text, provider text, model text,
  cost_cents integer, charged_cents integer, metadata jsonb, created_at timestamptz
) ON COMMIT DROP;
SQL
  echo "COPY _src_acq FROM stdin;"; printf '%s\n' "$ACQ_DATA"; echo '\.'
  echo "COPY _src_li FROM stdin;";  printf '%s\n' "$LI_DATA";  echo '\.'

  cat <<'SQL'

-- ACQ rows
INSERT INTO platform.usage_events (id, customer_id, product, user_id, operation, provider, model,
                                   provider_cost_cents, billed_cents, metadata, created_at)
SELECT
  a.id,
  c.id,
  'acq_coach'::platform.product,
  NULL,
  a.operation,
  a.provider,
  a.model,
  a.provider_cost_cents,
  a.billed_cents,
  a.metadata,
  a.created_at
FROM _src_acq a
JOIN platform.customers c ON c.acq_account_id = a.account_id
ON CONFLICT (id) DO NOTHING;

-- LI rows — map user_id via the leadintel_user_id back-pointer
INSERT INTO platform.usage_events (id, customer_id, product, user_id, operation, provider, model,
                                   provider_cost_cents, billed_cents, metadata, created_at)
SELECT
  l.id,
  c.id,
  'lead_intel'::platform.product,
  (SELECT id FROM platform.users WHERE leadintel_user_id = l.user_id LIMIT 1),
  l.operation,
  l.provider,
  l.model,
  l.cost_cents,
  l.charged_cents,
  l.metadata,
  l.created_at
FROM _src_li l
JOIN platform.customers c ON c.leadintel_tenant_id = l.tenant_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform.audit_log (action, metadata)
VALUES (
  'backfill_usage_events',
  jsonb_build_object(
    'acq_source',  (SELECT count(*) FROM _src_acq),
    'li_source',   (SELECT count(*) FROM _src_li),
    'platform_total_after', (SELECT count(*) FROM platform.usage_events)
  )
);

COMMIT;

SELECT 'usage_events.total       ' AS metric, count(*) AS n FROM platform.usage_events
UNION ALL
SELECT 'usage_events.acq         ', count(*) FROM platform.usage_events WHERE product='acq_coach'
UNION ALL
SELECT 'usage_events.leadintel   ', count(*) FROM platform.usage_events WHERE product='lead_intel'
UNION ALL
SELECT 'sum billed_cents (acq)   ', COALESCE(sum(billed_cents),0) FROM platform.usage_events WHERE product='acq_coach'
UNION ALL
SELECT 'sum billed_cents (li)    ', COALESCE(sum(billed_cents),0) FROM platform.usage_events WHERE product='lead_intel';
SQL
} > "$TMPSQL"

log "applying backfill"
PLATFORM_PSQL -v ON_ERROR_STOP=1 < "$TMPSQL"
log "done"
