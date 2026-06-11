-- Unified transaction history for the in-app billing views.
--
-- The app-local public.wallet_transactions only records THIS app's activity,
-- so after the wallet merge a top-up or charge made via ACQ (e.g. Stripe
-- top-ups, auto-recharge) never appears in Lead Intel's billing tab even
-- though it moved the shared balance. This RPC returns the SHARED platform
-- ledger (both products) for the tenant's customer, read over postgres_fdw
-- via platform_fdw.wallet_transactions_read (created by setup-wallet-fdw.sh).
--
-- SECURITY DEFINER is required: the fdw user-mapping exists only for the
-- `postgres` role, so PostgREST's authenticated role can't query the foreign
-- table directly. Access guard inside: caller must be a super_admin or a
-- member of the tenant. Row shape matches the UI's WalletTransactionRow
-- (description carries an ACQ/LI tag so no component changes are needed).
-- Unlinked tenants fall back to the app-local ledger.

CREATE OR REPLACE FUNCTION public.get_unified_wallet_transactions(
  p_tenant_id uuid,
  p_limit     integer DEFAULT 50
)
RETURNS TABLE (
  id                  uuid,
  created_at          timestamptz,
  type                text,
  amount_cents        integer,
  balance_after_cents integer,
  description         text,
  metadata            jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer uuid;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'not authorized for this tenant';
  END IF;

  SELECT c.id INTO v_customer FROM platform_fdw.customers c WHERE c.leadintel_tenant_id = p_tenant_id;

  IF v_customer IS NULL THEN
    -- Unlinked tenant: original local-only history.
    RETURN QUERY
      SELECT wt.id, wt.created_at, wt.type, wt.amount_cents, wt.balance_after_cents,
             wt.description, wt.metadata
      FROM public.wallet_transactions wt
      WHERE wt.tenant_id = p_tenant_id
      ORDER BY wt.created_at DESC
      LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
    RETURN;
  END IF;

  RETURN QUERY
    SELECT pt.id, pt.created_at, pt.type, pt.amount_cents, pt.balance_after_cents,
           (CASE WHEN pt.product = 'acq_coach' THEN 'ACQ — ' ELSE 'LI — ' END) || coalesce(pt.reason, '') AS description,
           coalesce(pt.metadata, '{}'::jsonb) AS metadata
    FROM platform_fdw.wallet_transactions_read pt
    WHERE pt.customer_id = v_customer
    ORDER BY pt.created_at DESC
    LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
END $function$;

REVOKE ALL ON FUNCTION public.get_unified_wallet_transactions(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_wallet_transactions(uuid, integer) TO authenticated;
