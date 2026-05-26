-- Run this AS THE SUPABASE SERVICE ROLE / SUPERUSER from the Supabase SQL editor
-- to dump the auth schema. The `postgres` role used by Lovable's automation
-- cannot LOCK auth tables, so pg_dump --schema=auth fails from outside.
--
-- Option A (recommended): from your laptop, get the DB connection string with
-- the service role / superuser credentials and run:
--   pg_dump "$DB_URL" --schema=auth --no-owner --no-acl --format=custom \
--     --file=04_auth_full.dump
--   pg_dump "$DB_URL" --schema=storage --no-owner --no-acl --format=custom \
--     --file=05_storage_full.dump
--
-- Option B: extract the rows you actually need into JSON using this script
-- in the Supabase SQL editor, then load them into your new GoTrue instance.

-- Users (core columns GoTrue cares about):
COPY (
  SELECT row_to_json(u) FROM (
    SELECT id, aud, role, email, encrypted_password, email_confirmed_at,
           invited_at, confirmation_token, confirmation_sent_at,
           recovery_token, recovery_sent_at,
           email_change_token_new, email_change, email_change_sent_at,
           last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
           is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
           phone_change, phone_change_token, phone_change_sent_at,
           confirmed_at, email_change_token_current, email_change_confirm_status,
           banned_until, reauthentication_token, reauthentication_sent_at,
           is_sso_user, deleted_at, is_anonymous
    FROM auth.users
  ) u
) TO STDOUT;

-- Identities:
-- COPY (SELECT row_to_json(i) FROM auth.identities i) TO STDOUT;

-- If you only need email + id mapping (for re-issuing passwords on the new
-- side, since you cannot decrypt bcrypt anyway), just do:
--   SELECT id, email FROM auth.users;
