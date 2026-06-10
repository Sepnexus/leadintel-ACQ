#!/usr/bin/env bash
# One-time backfill after switching to the unified wallet. platform.customer_wallet
# already holds each customer's correct total (the old aggregation summed the app
# wallets, which IS the unified balance). This mirrors that authoritative balance
# into BOTH app wallets so each app shows + spends the shared total.
#
#   bash scripts/backfill-unified-wallet.sh
#
# Idempotent + data-safe. Run once per environment AFTER setup-wallet-fdw.sh and
# the app migrations. Uses each app's fdw link to pull the shared balance.

set -euo pipefail
BASE_DIR="${BASE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

PW_ACQ=$(grep -E '^POSTGRES_PASSWORD=' "$BASE_DIR/acq-coach-selfhost/.env" | grep -v CHANGE_ME | tail -1 | cut -d= -f2)
PW_LI=$(grep -E '^POSTGRES_PASSWORD=' "$BASE_DIR/leadintel-selfhost/.env" | grep -v CHANGE_ME | tail -1 | cut -d= -f2)

echo "── ACQ: mirror shared balance into acq.wallets ──"
docker exec -e PGPASSWORD="$PW_ACQ" acq-coach psql -h localhost -U postgres -d acqcoach -c "
  UPDATE public.wallets w
  SET balance_cents = pw.balance_cents, updated_at = now()
  FROM platform_fdw.customer_wallet pw
  JOIN platform_fdw.customers c ON c.id = pw.customer_id
  WHERE w.account_id = c.acq_account_id;
  INSERT INTO public.wallets (account_id, balance_cents)
  SELECT c.acq_account_id, pw.balance_cents
  FROM platform_fdw.customer_wallet pw
  JOIN platform_fdw.customers c ON c.id = pw.customer_id
  WHERE c.acq_account_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.account_id = c.acq_account_id);
"

echo "── Lead Intel: mirror shared balance into li.wallets ──"
docker exec -e PGPASSWORD="$PW_LI" leadintel psql -h localhost -U postgres -d leadintel -c "
  UPDATE public.wallets w
  SET balance_cents = pw.balance_cents, updated_at = now()
  FROM platform_fdw.customer_wallet pw
  JOIN platform_fdw.customers c ON c.id = pw.customer_id
  WHERE w.tenant_id = c.leadintel_tenant_id;
  INSERT INTO public.wallets (tenant_id, balance_cents)
  SELECT c.leadintel_tenant_id, pw.balance_cents
  FROM platform_fdw.customer_wallet pw
  JOIN platform_fdw.customers c ON c.id = pw.customer_id
  WHERE c.leadintel_tenant_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.tenant_id = c.leadintel_tenant_id);
"
echo "✓ both app wallets mirror the unified balance"
