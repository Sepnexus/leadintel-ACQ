CREATE TABLE public.ghl_users (
  ghl_user_id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  role TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ghl_date_added TIMESTAMPTZ,
  ghl_date_updated TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_users_location ON public.ghl_users(location_id);

ALTER TABLE public.ghl_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_users_select_anon"
  ON public.ghl_users FOR SELECT TO anon USING (true);

CREATE POLICY "ghl_users_select_authenticated"
  ON public.ghl_users FOR SELECT TO authenticated USING (true);

INSERT INTO public.sync_state (resource, consecutive_failures)
VALUES ('users', 0)
ON CONFLICT (resource) DO NOTHING;