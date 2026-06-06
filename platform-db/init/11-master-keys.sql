-- Phase: editable master keys.
--
-- One global namespace of "master" API keys (OpenAI, Anthropic, Deepgram,
-- Stripe, Resend, etc.) shared by both apps' edge functions. Stored in
-- platform-db so the launcher's admin UI can write them without SSH.
--
-- Edge fns read via a helper: env var wins (for deployment-time overrides),
-- DB value is the fallback. Cached 60s in-process to avoid DB roundtrip
-- on every call.
--
-- Values are stored in plain text (not encrypted at rest). They're as
-- sensitive as the platform-db credentials themselves — protect the DB,
-- not the cell. Future enhancement: pgp_sym_encrypt with KEK like
-- the GHL tokens (init/05-ghl-tokens.sql).

CREATE TABLE IF NOT EXISTS platform.master_keys (
  key_name    text PRIMARY KEY,
  key_value   text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES platform.users(id) ON DELETE SET NULL
);

-- Read access: app + admin can both read (edge fns need it).
GRANT SELECT ON platform.master_keys TO platform_app, platform_admin;
-- Write access: admin only.
GRANT INSERT, UPDATE, DELETE ON platform.master_keys TO platform_admin;

-- Convenience function the edge-fn helper calls.
CREATE OR REPLACE FUNCTION platform.get_master_key(p_key_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT key_value FROM platform.master_keys WHERE key_name = p_key_name;
$$;

-- Setter (admin only — checked by admin-api route).
CREATE OR REPLACE FUNCTION platform.set_master_key(
  p_key_name text,
  p_key_value text,
  p_updated_by uuid
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO platform.master_keys (key_name, key_value, updated_at, updated_by)
  VALUES (p_key_name, p_key_value, now(), p_updated_by)
  ON CONFLICT (key_name) DO UPDATE
  SET key_value  = EXCLUDED.key_value,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;
$$;
