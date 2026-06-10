-- Platform Admin → Set Password support.
--
-- GoTrue restricts auth.users to read-only for every role except its own
-- supabase_auth_admin owner. That's the right default — we don't want app
-- code reaching into the auth schema. But the Platform Admin "Set
-- Password" action needs to upsert encrypted_password for any user
-- (including users invited but not-yet-onboarded who have no auth.users
-- row yet).
--
-- The standard Supabase escape hatch: a SECURITY DEFINER function owned
-- by supabase_auth_admin. The function runs with the owner's privileges
-- so it can modify auth.users, while callers must hold EXECUTE on it.
-- We grant EXECUTE only to platform_admin so the admin-api can call it.
--
-- Returns 'created' if a new row was inserted, 'updated' if an existing
-- row was modified, or 'not_found' if no row exists and we were told not
-- to create one (admin-api currently always passes create_if_missing=true).

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
  -- Hash must look like a bcrypt $2a/$2b string — guards against accidentally
  -- writing a plaintext password.
  IF p_encrypted_password IS NULL OR length(p_encrypted_password) < 50
     OR p_encrypted_password NOT LIKE '$2%' THEN
    RAISE EXCEPTION 'p_encrypted_password must be a bcrypt hash ($2a/$2b/$2y), got %', left(coalesce(p_encrypted_password, ''), 6);
  END IF;

  -- Resolve the existing auth.users row by id FIRST, then fall back to email.
  -- Why the email fallback: the caller passes platform.users.id, which is
  -- *supposed* to equal auth.users.id (Phase C2 identity merger), but for
  -- some pre-merger users it doesn't. Without the email fallback, the id
  -- lookup misses, the function tries to INSERT, and the unique email
  -- constraint throws — so Set Password failed for exactly those users.
  -- We update whichever row actually owns the email and key the identity
  -- row to its real id.
  SELECT id INTO v_existing_id FROM auth.users WHERE id = p_user_id;
  IF v_existing_id IS NULL THEN
    SELECT id INTO v_existing_id FROM auth.users WHERE email = p_email LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    -- COALESCE the NULL-but-must-be-'' token columns to '' alongside the
    -- password update. Heals rows created before this fix landed (where
    -- those columns were left NULL) without needing a separate one-off.
    UPDATE auth.users
       SET encrypted_password    = p_encrypted_password,
           confirmation_token    = COALESCE(confirmation_token,    ''),
           recovery_token        = COALESCE(recovery_token,        ''),
           email_change_token_new = COALESCE(email_change_token_new, ''),
           email_change          = COALESCE(email_change,          ''),
           updated_at            = now()
     WHERE id = v_existing_id;
    -- Fall through to identity-upsert below in case the user was created
    -- before we started provisioning identities (e.g. earlier admin-set
    -- runs without this fix, or backfilled rows from Phase C2). Keyed to
    -- the real auth id (v_existing_id), not the passed-in p_user_id.
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    ) VALUES (
      v_existing_id::text,
      v_existing_id,
      jsonb_build_object(
        'sub',            v_existing_id::text,
        'email',          p_email,
        'email_verified', false,
        'phone_verified', false
      ),
      'email',
      now(),
      now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;
    RETURN 'updated';
  END IF;

  IF NOT p_create_if_missing THEN
    RETURN 'not_found';
  END IF;

  -- Provision a fresh GoTrue user. email_confirmed_at=now() so /token
  -- grant works without an email-confirmation step (the user's email was
  -- already established via the platform invite flow).
  -- IMPORTANT: GoTrue's Go SQL driver scans confirmation_token,
  -- recovery_token, email_change_token_new, and email_change into Go
  -- `string` fields — NULL trips a "converting NULL to string is
  -- unsupported" error at login time and surfaces as the generic
  -- "Database error querying schema" 500. The other token columns
  -- (email_change_token_current, phone_change_token, reauthentication_
  -- token, phone_change) already default to '' in the schema, so we
  -- only need to override the ones that don't.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'authenticated',
    'authenticated',
    p_email,
    p_encrypted_password,
    now(),
    '', '',          -- confirmation_token, recovery_token  (NOT NULL for GoTrue scan)
    '', '',          -- email_change_token_new, email_change
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  );

  -- Ensure an email-provider auth.identities row exists. GoTrue's /token
  -- grant_type=password handler joins users → identities (via user_id)
  -- to resolve the login; if no identity exists for the email provider,
  -- login fails with "Database error querying schema." Idempotent via
  -- the (provider_id, provider) UNIQUE constraint.
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at
  ) VALUES (
    p_user_id::text,
    p_user_id,
    jsonb_build_object(
      'sub',            p_user_id::text,
      'email',          p_email,
      'email_verified', false,
      'phone_verified', false
    ),
    'email',
    now(),
    now()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  RETURN 'created';
END;
$$;

-- Owner must be supabase_auth_admin so SECURITY DEFINER picks up its rights.
ALTER FUNCTION auth.admin_upsert_user_password(uuid, text, text, boolean)
  OWNER TO supabase_auth_admin;

-- Lock down execution. PUBLIC must NOT be able to call this — that would
-- be a privilege escalation surface (any logged-in user could rewrite any
-- other user's password). Only the platform_admin role (admin-api) gets it.
REVOKE ALL ON FUNCTION auth.admin_upsert_user_password(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.admin_upsert_user_password(uuid, text, text, boolean) TO platform_admin;
