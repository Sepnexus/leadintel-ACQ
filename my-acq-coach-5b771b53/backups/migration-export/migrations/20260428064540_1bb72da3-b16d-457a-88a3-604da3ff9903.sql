
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_account_admin(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_account_member(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rep_ghl_user_ids(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_account_id(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
