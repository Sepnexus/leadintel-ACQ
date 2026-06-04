#!/bin/bash
# Phase C2 — Auth schema bootstrap.
#
# Creates the `supabase_auth_admin` role + `auth` schema in platform-db
# so the shared GoTrue (platform-auth container) can run its bundled
# migrations against this database. After this script:
#   - role supabase_auth_admin exists (login, creates own tables)
#   - schema auth exists, owned by supabase_auth_admin
#   - anon / authenticated / service_role exist (for future PostgREST against platform-db)
#
# GoTrue then runs `auth migrate` on container start and creates
# auth.users, auth.identities, auth.refresh_tokens, etc.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Roles GoTrue + PostgREST conventionally expect.
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
  END \$\$;

  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
  END \$\$;

  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
  END \$\$;

  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      EXECUTE format(
        'CREATE ROLE supabase_auth_admin LOGIN PASSWORD %L NOINHERIT CREATEROLE',
        '${PLATFORM_AUTH_ADMIN_PASSWORD}'
      );
    END IF;
  END \$\$;

  -- Auth schema (GoTrue creates its tables here on first migrate)
  CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  -- Allow supabase_auth_admin to create extensions in its own schema
  -- (uuid-ossp/pgcrypto are needed for some GoTrue migrations)
  GRANT CREATE ON DATABASE platform TO supabase_auth_admin;
EOSQL

echo "[platform-db init] auth schema bootstrapped (supabase_auth_admin + auth schema)"
