CREATE TABLE public.blocked_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone_number)
);

CREATE INDEX idx_blocked_numbers_account ON public.blocked_numbers(account_id);

ALTER TABLE public.blocked_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to blocked_numbers"
ON public.blocked_numbers
FOR ALL
USING (true)
WITH CHECK (true);