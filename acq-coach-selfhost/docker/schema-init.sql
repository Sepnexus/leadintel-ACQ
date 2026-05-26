-- Bootstrap Postgres for self-hosted Supabase Auth + PostgREST.
-- Runs once on first container boot, BEFORE user migrations and
-- BEFORE GoTrue runs its own bundled migrations.

-- ─── Extensions ──────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_stat_statements;
-- pg_cron and pg_net are loaded later (post-migrations) if not present
-- supabase_vault is omitted — ACQ Coach does not use it

-- ─── Supabase roles ──────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute format(
      'create role authenticator login password %L noinherit',
      current_setting('app.authenticator_password')
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute format(
      'create role supabase_auth_admin login password %L noinherit createrole',
      current_setting('app.auth_admin_password')
    );
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- ─── Auth schema (owned by GoTrue) ───────────────────────
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;

-- ─── public schema privileges ────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
