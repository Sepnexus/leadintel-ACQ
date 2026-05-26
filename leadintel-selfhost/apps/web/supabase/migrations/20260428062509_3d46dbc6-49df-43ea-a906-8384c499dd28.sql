-- Fix search_path on prevent_role_self_escalation
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  super_admin_count integer;
begin
  if NEW.role is distinct from OLD.role then
    select count(*) into super_admin_count from public.users where role = 'super_admin';
    if super_admin_count = 0 then
      return NEW;
    end if;
    if not is_super_admin() then
      raise exception 'Only super_admins can change user roles';
    end if;
  end if;
  return NEW;
end;
$$;

-- Revoke direct EXECUTE on the trigger function from authenticated/anon (it's only used as a trigger)
revoke execute on function public.prevent_role_self_escalation() from public, anon, authenticated;