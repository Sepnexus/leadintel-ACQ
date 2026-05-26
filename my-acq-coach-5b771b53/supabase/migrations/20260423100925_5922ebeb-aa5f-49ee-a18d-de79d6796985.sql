
CREATE TABLE public.ghl_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  ghl_message_id text NOT NULL,
  contact_id text,
  conversation_id text,
  assigned_user_id text,
  direction text NOT NULL DEFAULT 'inbound',
  call_status text,
  call_duration integer DEFAULT 0,
  transcript text,
  body text,
  status text NOT NULL DEFAULT 'pending',
  call_date timestamptz,
  score_id uuid REFERENCES public.call_scores(id),
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, ghl_message_id)
);

ALTER TABLE public.ghl_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ghl_calls" ON public.ghl_calls FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_ghl_calls_updated_at
  BEFORE UPDATE ON public.ghl_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
