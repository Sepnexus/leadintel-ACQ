-- Deleting a user from the admin panel.
--
-- admin-api connects as platform_admin, which deliberately has only
-- INSERT/SELECT/UPDATE on platform.users and SELECT on auth.users — it should
-- not hold blanket DELETE rights on the auth schema. So, exactly like
-- auth.admin_upsert_user_password (12-admin-set-password.sql), we expose one
-- narrow SECURITY DEFINER function instead of widening the grants.
--
-- Removes the platform-side records only. The caller (routes/users-create.ts
-- deleteUser) clears the ACQ + Lead Intel side first — it connects to those DBs
-- as postgres, so it can delete there directly.

CREATE OR REPLACE FUNCTION platform.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, auth, public
AS $$
BEGIN
  -- Memberships first (they FK to platform.users).
  DELETE FROM platform.customer_users WHERE user_id = p_user_id;
  DELETE FROM platform.users          WHERE id      = p_user_id;

  -- GoTrue's own rows. identities/sessions/refresh_tokens normally cascade from
  -- auth.users, but delete them explicitly so a missing cascade can't leave a
  -- half-deleted login that still resolves.
  DELETE FROM auth.identities     WHERE user_id = p_user_id;
  DELETE FROM auth.sessions       WHERE user_id = p_user_id;
  DELETE FROM auth.users          WHERE id      = p_user_id;
END;
$$;

ALTER FUNCTION platform.admin_delete_user(uuid) OWNER TO postgres;
REVOKE ALL  ON FUNCTION platform.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.admin_delete_user(uuid) TO platform_admin;
