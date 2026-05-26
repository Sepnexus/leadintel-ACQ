ALTER TABLE public.users DISABLE TRIGGER USER;
UPDATE public.users SET role = 'super_admin', updated_at = now() WHERE email = 'akshay@sepnexus.com';
ALTER TABLE public.users ENABLE TRIGGER USER;