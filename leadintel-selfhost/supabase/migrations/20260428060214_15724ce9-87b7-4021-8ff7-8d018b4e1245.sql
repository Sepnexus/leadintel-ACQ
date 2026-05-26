-- Trigger-only functions: revoke all execute
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_role_self_escalation() from public, anon, authenticated;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;

-- Helper functions used in RLS: only authenticated users
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.get_user_tenant_id() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.get_user_tenant_id() to authenticated;