-- Individual SMS / email messages
CREATE TABLE public.ghl_messages (
  ghl_message_id TEXT PRIMARY KEY,
  ghl_conversation_id TEXT NOT NULL,
  ghl_contact_id TEXT NOT NULL,
  ghl_user_id TEXT,
  location_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT,
  status TEXT,
  date_added TIMESTAMPTZ NOT NULL,
  raw_payload JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_messages_contact_date ON public.ghl_messages(ghl_contact_id, date_added DESC);
CREATE INDEX idx_ghl_messages_conversation ON public.ghl_messages(ghl_conversation_id);

ALTER TABLE public.ghl_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_messages_select_authenticated"
  ON public.ghl_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "ghl_messages_select_anon"
  ON public.ghl_messages FOR SELECT TO anon USING (true);

-- Tasks/reminders against contacts
CREATE TABLE public.ghl_tasks (
  ghl_task_id TEXT PRIMARY KEY,
  ghl_contact_id TEXT NOT NULL,
  ghl_user_id TEXT,
  location_id TEXT NOT NULL,
  title TEXT,
  body TEXT,
  due_date TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT false,
  ghl_date_added TIMESTAMPTZ,
  ghl_date_updated TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ghl_tasks_contact ON public.ghl_tasks(ghl_contact_id);
CREATE INDEX idx_ghl_tasks_due ON public.ghl_tasks(due_date) WHERE completed = false;

ALTER TABLE public.ghl_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_tasks_select_authenticated"
  ON public.ghl_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "ghl_tasks_select_anon"
  ON public.ghl_tasks FOR SELECT TO anon USING (true);

-- AI intelligence cache per contact
CREATE TABLE public.lead_intelligence (
  ghl_contact_id TEXT PRIMARY KEY,
  rationale TEXT,
  opening_line TEXT,
  next_steps JSONB,
  signals JSONB,
  message_count INT,
  last_message_at TIMESTAMPTZ,
  model TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_lead_intelligence_stale ON public.lead_intelligence(stale, generated_at DESC);

ALTER TABLE public.lead_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_intelligence_select_authenticated"
  ON public.lead_intelligence FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_intelligence_select_anon"
  ON public.lead_intelligence FOR SELECT TO anon USING (true);

-- Seed sync_state for new resources
INSERT INTO public.sync_state (resource, consecutive_failures)
VALUES ('messages', 0), ('tasks', 0)
ON CONFLICT (resource) DO NOTHING;