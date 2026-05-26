
-- 1) Prevent privilege escalation: account admins cannot create/modify super_admin roles
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;

CREATE POLICY "super manage all roles"
ON public.user_roles
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "account admin manage non-super roles"
ON public.user_roles
FOR ALL
USING (
  account_id IS NOT NULL
  AND public.is_account_admin(auth.uid(), account_id)
  AND role <> 'super_admin'
)
WITH CHECK (
  account_id IS NOT NULL
  AND public.is_account_admin(auth.uid(), account_id)
  AND role <> 'super_admin'
);

-- 2) Restrict GHL account API key visibility to admins only (reps lose SELECT on api_key)
DROP POLICY IF EXISTS "members view account" ON public.ghl_accounts;

CREATE POLICY "admins view account"
ON public.ghl_accounts
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.is_account_admin(auth.uid(), id)
);

-- Reps still need basic account info (name, id) but NOT api_key. Provide a safe view.
CREATE OR REPLACE VIEW public.ghl_accounts_safe
WITH (security_invoker = true) AS
SELECT id, name, location_id, company_id, is_active, is_test, demo_mode, integrated_at, created_at
FROM public.ghl_accounts
WHERE public.is_account_member(auth.uid(), id);

GRANT SELECT ON public.ghl_accounts_safe TO authenticated, anon;
