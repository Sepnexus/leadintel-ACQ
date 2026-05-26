
CREATE OR REPLACE FUNCTION public.admin_delete_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  -- Allow up to 10 minutes for the cascade
  PERFORM set_config('statement_timeout', '600000', true);

  SELECT name INTO v_name FROM public.tenants WHERE id = p_tenant_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant not found');
  END IF;

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_tenant(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_tenant(uuid) TO service_role;
