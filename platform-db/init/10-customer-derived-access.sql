-- Phase: drop per-user entitlement.
--
-- Old model: every user had a row in platform.user_product_access toggling
-- ACQ / LI access independently of the customer they belong to.
-- New model: access is derived purely from customer membership.
--   user has access to product X
--   IFF user is_platform_admin OR
--       user is a member (platform.customer_users) of a customer
--       where customer_product_access(product=X, enabled=true).
--
-- Why: simpler mental model + one less surface to keep in sync. If a customer
-- pays for ACQ Coach, every user under that customer can use ACQ Coach.
--
-- The platform.user_product_access table is KEPT but no longer read by the
-- entitlement function. Existing rows become historical-only. setUserAccess
-- API endpoint is removed; the admin Users page no longer has per-user
-- toggles. Manage access on the Customer detail page instead.

CREATE OR REPLACE FUNCTION platform.user_has_access(p_user_id uuid, p_product platform.product)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- Platform admins bypass — they manage the whole platform.
    COALESCE((SELECT is_platform_admin FROM platform.users WHERE id = p_user_id), false)
    OR EXISTS (
      SELECT 1
      FROM platform.customer_users cu
      JOIN platform.customer_product_access cpa
        ON cpa.customer_id = cu.customer_id
       AND cpa.product = p_product
       AND cpa.enabled = true
       AND (cpa.valid_until IS NULL OR cpa.valid_until > now())
      WHERE cu.user_id = p_user_id
    );
$$;
