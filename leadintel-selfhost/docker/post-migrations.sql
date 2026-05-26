-- Runs AFTER our user migrations (Lovable's 30 Lead Intel migration files) and
-- AFTER GoTrue's bundled migrations.

-- pg_cron IS installed. pg_net and supabase_vault are from-source extensions
-- with no Debian packages — we try them and gracefully no-op if unavailable.
-- That means: cron jobs won't fire automatically (you can run them manually
-- or set up an external cron container later), and vault.cron_secret has to
-- be replaced with a plain env var lookup. Both are non-critical for verifying
-- data + auth + UI locally.
create extension if not exists pg_cron;

do $$ begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not available (no Debian package); cron jobs will be skipped';
  end;
end $$;

do $$ begin
  begin
    create extension if not exists supabase_vault;
  exception when others then
    raise notice 'supabase_vault not available; cron_secret will live in env vars only';
  end;
end $$;

-- If supabase_vault isn't available, the upsert_cron_secret() function in
-- Lovable's migrations will fail when it tries to call vault.create_secret.
-- Replace it with a no-op so the migration sequence can complete.
do $$ begin
  if not exists (
    select 1 from pg_extension where extname = 'supabase_vault'
  ) then
    create or replace function public.upsert_cron_secret(p_secret text)
    returns void language plpgsql security definer as $body$
    begin
      -- vault not available locally; cron secret managed via env var instead
      raise notice 'upsert_cron_secret called but supabase_vault not installed; storing in env only';
    end
    $body$;
  end if;
end $$;

-- Grants
grant select, insert, update, delete on all tables    in schema public to anon, authenticated, service_role;
grant usage, select                  on all sequences in schema public to anon, authenticated, service_role;
grant execute                        on all functions in schema public to anon, authenticated, service_role;
grant select on all tables in schema auth to anon, authenticated, service_role;

-- Lead-Intel-specific: lock the plaintext ghl_pit_token column from anon/authenticated
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tenants'
               and column_name = 'ghl_pit_token') then
    revoke select on public.tenants from anon, authenticated;
    grant select (id, name, status, plan, trial_active, trial_expires_at,
                  ghl_location_id, billing_mode, created_at, updated_at)
      on public.tenants to anon, authenticated;
    grant select on public.tenants to service_role;
  end if;
end $$;
