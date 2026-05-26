-- Prevent non-super-admin users from changing their own role (privilege escalation fix)
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_self_escalation_trg ON public.users;
CREATE TRIGGER prevent_role_self_escalation_trg
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_self_escalation();