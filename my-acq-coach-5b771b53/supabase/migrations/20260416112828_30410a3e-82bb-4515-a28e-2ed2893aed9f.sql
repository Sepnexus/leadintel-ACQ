
CREATE TABLE public.call_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL,
  rep_ghl_user_id TEXT,
  rep_name TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  seller_type TEXT NOT NULL DEFAULT 'unknown',
  call_type TEXT NOT NULL DEFAULT 'first-contact',
  overall_score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'F',
  category_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  rep_talk_ratio INTEGER NOT NULL DEFAULT 50,
  seller_talk_ratio INTEGER NOT NULL DEFAULT 50,
  transcript TEXT,
  verdict TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  moments JSONB DEFAULT '[]'::jsonb,
  duration TEXT,
  scored_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to call_scores" ON public.call_scores FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_call_scores_account ON public.call_scores(account_id);
CREATE INDEX idx_call_scores_rep ON public.call_scores(rep_ghl_user_id);
CREATE INDEX idx_call_scores_scored_at ON public.call_scores(scored_at);

CREATE TRIGGER update_call_scores_updated_at
  BEFORE UPDATE ON public.call_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
