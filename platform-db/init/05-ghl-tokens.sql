-- Phase B1 / Path A2 — GHL credentials at the platform layer.
--
-- platform.customers.ghl_pit_token_encrypted stores the encrypted token via
-- pgcrypto's pgp_sym_encrypt. The encryption passphrase NEVER lives in the
-- database — it's injected at call time by admin-api (env var
-- TOKEN_ENCRYPTION_KEY). If platform-db is compromised, attackers see only
-- ciphertext.
--
-- Read path: admin-api calls platform.get_ghl_pit_token(customer_id, passphrase)
-- Write path: admin-api calls platform.set_ghl_pit_token(customer_id, token, passphrase)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE platform.customers
  ADD COLUMN IF NOT EXISTS ghl_pit_token_encrypted bytea,
  ADD COLUMN IF NOT EXISTS ghl_pit_token_set_at    timestamptz,
  ADD COLUMN IF NOT EXISTS ghl_pit_token_set_by    uuid REFERENCES platform.users(id),
  ADD COLUMN IF NOT EXISTS ghl_pit_token_last_4    text;  -- for masked display

-- Setter — passphrase must be supplied at call time.
-- Stored as bytea via pgp_sym_encrypt. Updates fingerprint (last 4 chars) for
-- UI display without needing to decrypt on every list call.
CREATE OR REPLACE FUNCTION platform.set_ghl_pit_token(
  p_customer_id uuid,
  p_token       text,
  p_passphrase  text,
  p_actor_id    uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'token too short';
  END IF;
  UPDATE platform.customers
  SET ghl_pit_token_encrypted = pgp_sym_encrypt(p_token, p_passphrase),
      ghl_pit_token_set_at    = now(),
      ghl_pit_token_set_by    = p_actor_id,
      ghl_pit_token_last_4    = right(p_token, 4)
  WHERE id = p_customer_id;
END
$$;

-- Getter — passphrase must match what was used at set time, else throws.
CREATE OR REPLACE FUNCTION platform.get_ghl_pit_token(
  p_customer_id uuid,
  p_passphrase  text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_blob bytea;
BEGIN
  SELECT ghl_pit_token_encrypted INTO v_blob FROM platform.customers WHERE id = p_customer_id;
  IF v_blob IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(v_blob, p_passphrase);
END
$$;

-- Convenience: just whether a token is set + the last-4 fingerprint, no decrypt.
CREATE OR REPLACE VIEW platform.ghl_token_status AS
SELECT
  id AS customer_id,
  (ghl_pit_token_encrypted IS NOT NULL) AS is_set,
  ghl_pit_token_last_4 AS last_4,
  ghl_pit_token_set_at AS set_at,
  ghl_pit_token_set_by AS set_by
FROM platform.customers;

-- Grants — only platform_admin can read or write the token. platform_app
-- (used by edge functions for entitlement checks) cannot decrypt — that
-- read path goes through admin-api.
REVOKE ALL ON FUNCTION platform.set_ghl_pit_token(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_ghl_pit_token(uuid, text)             FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.set_ghl_pit_token(uuid, text, text, uuid) TO platform_admin;
GRANT EXECUTE ON FUNCTION platform.get_ghl_pit_token(uuid, text)             TO platform_admin;
GRANT SELECT ON platform.ghl_token_status TO platform_app, platform_admin;
