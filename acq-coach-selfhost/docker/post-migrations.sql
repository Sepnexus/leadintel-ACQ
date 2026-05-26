-- Runs AFTER our user migrations (Lovable's 28 ACQ migration files) and AFTER
-- GoTrue's bundled migrations. Locks down a few things and grants the
-- per-row privileges PostgREST needs to actually serve public tables.

-- pg_cron IS installed. pg_net is NOT (no Debian package). The cron jobs
-- that depend on net.http_post() won't apply — that's OK for local
-- verification; they only matter once you want background sync running.
create extension if not exists pg_cron;

-- pg_net: try, ignore if unavailable. Avoids hard failure on local builds.
do $$ begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not available (no Debian package); cron jobs will be skipped';
  end;
end $$;

-- Grants — PostgREST needs these to actually serve public tables (RLS policies
-- still gate which rows each role can touch).
grant select, insert, update, delete on all tables    in schema public to anon, authenticated, service_role;
grant usage, select                  on all sequences in schema public to anon, authenticated, service_role;
grant execute                        on all functions in schema public to anon, authenticated, service_role;

-- Same for the auth schema so PostgREST can read auth.users in JWT validation
grant select on all tables in schema auth to anon, authenticated, service_role;
