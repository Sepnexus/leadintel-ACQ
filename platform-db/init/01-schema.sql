-- platform-db schema.
-- This DB is the canonical source of truth for: who the user is, what
-- products they have access to, and what someone did to whose access.
-- It does NOT store passwords or auth tokens — those live in each app's
-- GoTrue. It does NOT store wallets or billing — those live in each app
-- for now. Future: stripe_customer mapping table.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS platform;

-- ────────────────────────────────────────────────────────────────
-- Products this platform supports.
-- Add a new enum value to onboard a new product (e.g. 'green_program').
-- ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE platform.product AS ENUM ('acq_coach', 'lead_intel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────
-- Canonical user identity.
-- One row per real human. `acq_user_id` and `leadintel_user_id` are
-- back-pointers into each app's auth.users.id so apps can quickly join
-- their own row to the platform user.
-- We do NOT store passwords here — those stay in each app's GoTrue.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform.users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  full_name        text,
  -- Back-pointers (nullable: a user might exist in only one app initially)
  acq_user_id      uuid UNIQUE,
  leadintel_user_id uuid UNIQUE,
  -- Operational
  is_platform_admin boolean NOT NULL DEFAULT false,  -- can grant/revoke product access
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON platform.users (lower(email));

-- updated_at trigger
CREATE OR REPLACE FUNCTION platform.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON platform.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON platform.users
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ────────────────────────────────────────────────────────────────
-- Per-user product access.
-- This is the ONE table that answers "can this user use Lead Intel?"
-- Apps check this on login + on every charging edge function.
-- `enabled = false` means "complete pause, no charges, no access".
-- `valid_until` enables trial periods (null = no expiry).
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform.user_product_access (
  user_id      uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  product      platform.product NOT NULL,
  enabled      boolean NOT NULL DEFAULT false,
  valid_until  timestamptz,                          -- null = no expiry (for trials)
  notes        text,                                 -- e.g. "comp'd by Deon for 30d trial"
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES platform.users(id),    -- who did the last change
  PRIMARY KEY (user_id, product)
);

CREATE INDEX IF NOT EXISTS idx_upa_product_enabled
  ON platform.user_product_access (product) WHERE enabled = true;

DROP TRIGGER IF EXISTS trg_upa_updated_at ON platform.user_product_access;
CREATE TRIGGER trg_upa_updated_at BEFORE UPDATE ON platform.user_product_access
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ────────────────────────────────────────────────────────────────
-- Cross-product audit log.
-- Apps write here on access changes, billing events, admin actions.
-- This is what we show to an enterprise prospect when they ask "show me
-- the trail of who granted Lead Intel access to this user".
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid,                                  -- who did it (null = system)
  target_user_id  uuid,                                  -- whose record was affected
  product         platform.product,                      -- which product, if relevant
  action          text NOT NULL,                         -- 'access_granted' / 'access_revoked' / 'login' / etc
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,    -- free-form context
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_target_recent
  ON platform.audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recent
  ON platform.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON platform.audit_log (action, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- Helper functions used by apps via SQL.
-- These are STABLE so PostgREST / app queries can call them cheaply.
-- ────────────────────────────────────────────────────────────────

-- Is this user allowed to use the given product RIGHT NOW?
-- Treats null valid_until as "no expiry". Returns false if no row at all.
CREATE OR REPLACE FUNCTION platform.user_has_access(p_user_id uuid, p_product platform.product)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (
      SELECT enabled AND (valid_until IS NULL OR valid_until > now())
      FROM platform.user_product_access
      WHERE user_id = p_user_id AND product = p_product
    ),
    false
  );
$$;

-- Convenience: look up a platform user by the app-specific auth.users.id.
-- Returns null if no platform user is mapped.
CREATE OR REPLACE FUNCTION platform.user_id_for_acq(p_acq_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM platform.users WHERE acq_user_id = p_acq_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION platform.user_id_for_leadintel(p_leadintel_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM platform.users WHERE leadintel_user_id = p_leadintel_user_id LIMIT 1;
$$;

-- Same checks but starting from app-specific user id (used by edge functions
-- holding only the JWT's `sub` claim from their own GoTrue).
CREATE OR REPLACE FUNCTION platform.acq_user_has_access(p_acq_user_id uuid, p_product platform.product)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT platform.user_has_access(platform.user_id_for_acq(p_acq_user_id), p_product);
$$;

CREATE OR REPLACE FUNCTION platform.leadintel_user_has_access(p_leadintel_user_id uuid, p_product platform.product)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT platform.user_has_access(platform.user_id_for_leadintel(p_leadintel_user_id), p_product);
$$;
