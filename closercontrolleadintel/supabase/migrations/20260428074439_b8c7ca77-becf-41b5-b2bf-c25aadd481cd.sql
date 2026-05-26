
-- Atomic tenant creation: insert tenant + seed 6 sync_state rows.
-- SECURITY DEFINER so it bypasses RLS for the inserts, but self-checks
-- auth + super_admin role as defense in depth.
create or replace function public.create_tenant_with_sync_state(
  p_name text,
  p_location_id text,
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_resource text;
  v_resources text[] := array['users','contacts','opportunities','conversations','messages','tasks'];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not is_super_admin() then
    raise exception 'super_admin required';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'name is required';
  end if;
  if p_location_id is null or length(btrim(p_location_id)) = 0 then
    raise exception 'ghl_location_id is required';
  end if;
  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception 'ghl_pit_token is required';
  end if;

  if exists (select 1 from public.tenants where ghl_location_id = p_location_id) then
    raise exception 'duplicate_location_id';
  end if;

  insert into public.tenants (name, ghl_location_id, ghl_pit_token, status, plan_type)
  values (btrim(p_name), p_location_id, p_token, 'active', 'standard')
  returning id into v_tenant_id;

  foreach v_resource in array v_resources loop
    insert into public.sync_state (tenant_id, resource, consecutive_failures)
    values (v_tenant_id, v_resource, 0);
  end loop;

  return v_tenant_id;
end;
$$;

revoke all on function public.create_tenant_with_sync_state(text, text, text) from public;
grant execute on function public.create_tenant_with_sync_state(text, text, text) to authenticated;

-- Defense in depth: hide the PIT token column from the authenticated role.
-- RLS still governs row visibility, but this prevents the column from ever
-- being returned to a non-service-role caller even if RLS were misconfigured.
revoke select (ghl_pit_token) on public.tenants from authenticated;
