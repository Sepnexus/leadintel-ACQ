CREATE OR REPLACE FUNCTION public.upsert_cron_secret(p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'cron_secret', 'Cron auth secret for sync-resume-cron');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, 'cron_secret', 'Cron auth secret for sync-resume-cron');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cron_secret(text) TO service_role;