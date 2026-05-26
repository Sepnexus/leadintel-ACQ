CREATE TABLE public.ghl_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  ghl_contact_id TEXT NOT NULL,
  assigned_user_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, ghl_contact_id)
);

CREATE TRIGGER update_ghl_contacts_updated_at
  BEFORE UPDATE ON public.ghl_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();