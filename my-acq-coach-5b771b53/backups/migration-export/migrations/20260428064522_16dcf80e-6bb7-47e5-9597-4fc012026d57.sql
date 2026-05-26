
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin','account_admin','rep');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ ghl_accounts: forward-only sync columns ============
ALTER TABLE public.ghl_accounts
  ADD COLUMN IF NOT EXISTS integrated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  account_id uuid REFERENCES public.ghl_accounts(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ user_roles ============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  account_id uuid REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, account_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ rep_assignments ============
CREATE TABLE IF NOT EXISTS public.rep_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  ghl_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ghl_user_id)
);
ALTER TABLE public.rep_assignments ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_account_admin(_user_id uuid, _account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND ((role = 'account_admin' AND account_id = _account_id) OR role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_member(_user_id uuid, _account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'
        OR (role IN ('account_admin','rep') AND account_id = _account_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.rep_ghl_user_ids(_user_id uuid, _account_id uuid)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ghl_user_id FROM public.rep_assignments
  WHERE user_id = _user_id AND account_id = _account_id;
$$;

CREATE OR REPLACE FUNCTION public.user_account_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT account_id FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('account_admin','rep')
  ORDER BY created_at ASC LIMIT 1;
$$;

-- ============ RLS: profiles ============
DROP POLICY IF EXISTS "self read profile" ON public.profiles;
CREATE POLICY "self read profile" ON public.profiles FOR SELECT
USING (id = auth.uid() OR public.is_super_admin(auth.uid())
       OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)));

DROP POLICY IF EXISTS "self update profile" ON public.profiles;
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE
USING (id = auth.uid() OR public.is_super_admin(auth.uid())
       OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)));

DROP POLICY IF EXISTS "admin insert profile" ON public.profiles;
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid())
            OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)));

DROP POLICY IF EXISTS "admin delete profile" ON public.profiles;
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE
USING (public.is_super_admin(auth.uid())
       OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)));

-- ============ RLS: user_roles ============
DROP POLICY IF EXISTS "self read role" ON public.user_roles;
CREATE POLICY "self read role" ON public.user_roles FOR SELECT
USING (user_id = auth.uid()
       OR public.is_super_admin(auth.uid())
       OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)));

DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL
USING (public.is_super_admin(auth.uid())
       OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)))
WITH CHECK (public.is_super_admin(auth.uid())
            OR (account_id IS NOT NULL AND public.is_account_admin(auth.uid(), account_id)));

-- ============ RLS: rep_assignments ============
DROP POLICY IF EXISTS "self read assign" ON public.rep_assignments;
CREATE POLICY "self read assign" ON public.rep_assignments FOR SELECT
USING (user_id = auth.uid() OR public.is_account_admin(auth.uid(), account_id));

DROP POLICY IF EXISTS "admin manage assign" ON public.rep_assignments;
CREATE POLICY "admin manage assign" ON public.rep_assignments FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- ============ RLS: ghl_accounts ============
ALTER TABLE public.ghl_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view account" ON public.ghl_accounts;
CREATE POLICY "members view account" ON public.ghl_accounts FOR SELECT
USING (public.is_account_member(auth.uid(), id));

DROP POLICY IF EXISTS "super manage account" ON public.ghl_accounts;
CREATE POLICY "super manage account" ON public.ghl_accounts FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "admin update account" ON public.ghl_accounts;
CREATE POLICY "admin update account" ON public.ghl_accounts FOR UPDATE
USING (public.is_account_admin(auth.uid(), id))
WITH CHECK (public.is_account_admin(auth.uid(), id));

-- ============ RLS: tenant data tables (replace permissive policies) ============
-- ghl_calls
DROP POLICY IF EXISTS "Allow all access to ghl_calls" ON public.ghl_calls;
ALTER TABLE public.ghl_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view calls" ON public.ghl_calls FOR SELECT
USING (
  public.is_account_admin(auth.uid(), account_id)
  OR (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'rep' AND ur.account_id = ghl_calls.account_id)
    AND assigned_user_id IS NOT NULL
    AND assigned_user_id IN (SELECT public.rep_ghl_user_ids(auth.uid(), ghl_calls.account_id))
  )
);
CREATE POLICY "tenant write calls" ON public.ghl_calls FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- call_scores
DROP POLICY IF EXISTS "Allow all access to call_scores" ON public.call_scores;
ALTER TABLE public.call_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view scores" ON public.call_scores FOR SELECT
USING (
  public.is_account_admin(auth.uid(), account_id)
  OR (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'rep' AND ur.account_id = call_scores.account_id)
    AND rep_ghl_user_id IS NOT NULL
    AND rep_ghl_user_id IN (SELECT public.rep_ghl_user_ids(auth.uid(), call_scores.account_id))
  )
);
CREATE POLICY "tenant write scores" ON public.call_scores FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- ghl_contacts
ALTER TABLE public.ghl_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to ghl_contacts" ON public.ghl_contacts;
CREATE POLICY "tenant view contacts" ON public.ghl_contacts FOR SELECT
USING (public.is_account_member(auth.uid(), account_id));
CREATE POLICY "tenant write contacts" ON public.ghl_contacts FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- ghl_conversations
DROP POLICY IF EXISTS "Allow all access to ghl_conversations" ON public.ghl_conversations;
ALTER TABLE public.ghl_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view conv" ON public.ghl_conversations FOR SELECT
USING (public.is_account_admin(auth.uid(), account_id));
CREATE POLICY "tenant write conv" ON public.ghl_conversations FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- ghl_messages
DROP POLICY IF EXISTS "Allow all access to ghl_messages" ON public.ghl_messages;
ALTER TABLE public.ghl_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view msgs" ON public.ghl_messages FOR SELECT
USING (
  public.is_account_admin(auth.uid(), account_id)
  OR (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'rep' AND ur.account_id = ghl_messages.account_id)
    AND user_id IS NOT NULL
    AND user_id IN (SELECT public.rep_ghl_user_ids(auth.uid(), ghl_messages.account_id))
  )
);
CREATE POLICY "tenant write msgs" ON public.ghl_messages FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- ghl_users
ALTER TABLE public.ghl_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant view ghl users" ON public.ghl_users FOR SELECT
USING (public.is_account_member(auth.uid(), account_id));
CREATE POLICY "tenant write ghl users" ON public.ghl_users FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));

-- blocked_numbers
DROP POLICY IF EXISTS "Allow all access to blocked_numbers" ON public.blocked_numbers;
ALTER TABLE public.blocked_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant manage blocks" ON public.blocked_numbers FOR ALL
USING (public.is_account_admin(auth.uid(), account_id))
WITH CHECK (public.is_account_admin(auth.uid(), account_id));
