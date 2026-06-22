-- Per-tenant sync lock: prevents two GHL syncs for the same tenant from running
-- in parallel (the "storm" — scheduled sweep + resume + self-resume all stacking).
-- A sweep claims the lock; other sweeps/resumes skip a tenant that's already
-- locked. The lock auto-expires (TTL) so an edge crash can never deadlock it.

create table if not exists public.sync_locks (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  sweep_id    text        not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- Atomic claim. Returns TRUE if the caller now holds the lock — i.e. there was
-- no lock, the existing lock had expired, or the caller already holds it
-- (re-entrant extend by passing the same sweep_id). Returns FALSE only when a
-- DIFFERENT, still-live sweep holds it.
create or replace function public.try_claim_sync_lock(
  p_tenant uuid,
  p_sweep  text,
  p_ttl_seconds int
) returns boolean
language plpgsql
as $$
declare
  holds boolean;
begin
  insert into public.sync_locks (tenant_id, sweep_id, acquired_at, expires_at)
  values (p_tenant, p_sweep, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (tenant_id) do update
    set sweep_id    = excluded.sweep_id,
        acquired_at = now(),
        expires_at  = excluded.expires_at
    where public.sync_locks.expires_at < now()
       or public.sync_locks.sweep_id   = excluded.sweep_id;

  select exists (
    select 1 from public.sync_locks
    where tenant_id = p_tenant
      and sweep_id  = p_sweep
      and expires_at > now()
  ) into holds;
  return holds;
end;
$$;

grant execute on function public.try_claim_sync_lock(uuid, text, int)
  to anon, authenticated, service_role;
grant select, insert, update, delete on public.sync_locks
  to anon, authenticated, service_role;
