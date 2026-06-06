-- Bridge for Platform Admin → Set Password. See platform-db/init/12-* for
-- the canonical comment. This is the same function, scoped to ACQ's auth
-- schema, so the admin-api can upsert ACQ-side encrypted_password using
-- the ACQ DB connection (which connects as `postgres`).
--
-- Why a function instead of granting INSERT/UPDATE to postgres? Defence in
-- depth: any future code path that ends up running as `postgres` (cron
-- jobs, ad-hoc tooling) shouldn't be casually able to set passwords. The
-- function gives us a single audited entrypoint with hash-format validation.

CREATE OR REPLACE FUNCTION auth.admin_upsert_user_password(
  p_user_id            uuid,
  p_email              text,
  p_encrypted_password text,
  p_create_if_missing  boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF p_encrypted_password IS NULL OR length(p_encrypted_password) < 50
     OR p_encrypted_password NOT LIKE '$2%' THEN
    RAISE EXCEPTION 'p_encrypted_password must be a bcrypt hash ($2a/$2b/$2y), got %', left(coalesce(p_encrypted_password, ''), 6);
  END IF;

  SELECT id INTO v_existing_id FROM auth.users WHERE id = p_user_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE auth.users
       SET encrypted_password = p_encrypted_password,
           updated_at         = now()
     WHERE id = p_user_id;
    RETURN 'updated';
  END IF;

  IF NOT p_create_if_missing THEN
    RETURN 'not_found';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'authenticated',
    'authenticated',
    p_email,
    p_encrypted_password,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  );
  RETURN 'created';
END;
$$;

ALTER FUNCTION auth.admin_upsert_user_password(uuid, text, text, boolean)
  OWNER TO supabase_auth_admin;

REVOKE ALL ON FUNCTION auth.admin_upsert_user_password(uuid, text, text, boolean) FROM PUBLIC;
-- ACQ DB connection from admin-api uses the `postgres` superuser role.
GRANT EXECUTE ON FUNCTION auth.admin_upsert_user_password(uuid, text, text, boolean) TO postgres;
