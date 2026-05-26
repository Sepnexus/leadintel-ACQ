-- Conversations table
CREATE TABLE public.ghl_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  ghl_conversation_id text NOT NULL,
  contact_id text,
  assigned_user_id text,
  last_message_body text,
  last_message_type text,
  last_message_date timestamptz,
  unread_count integer DEFAULT 0,
  type text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, ghl_conversation_id)
);

CREATE INDEX idx_ghl_conversations_account ON public.ghl_conversations(account_id);
CREATE INDEX idx_ghl_conversations_contact ON public.ghl_conversations(contact_id);

ALTER TABLE public.ghl_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to ghl_conversations" ON public.ghl_conversations FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_ghl_conversations_updated_at
BEFORE UPDATE ON public.ghl_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages table
CREATE TABLE public.ghl_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  conversation_id text NOT NULL,
  ghl_message_id text NOT NULL,
  contact_id text,
  user_id text,
  message_type text,
  direction text,
  status text,
  body text,
  call_duration integer,
  call_status text,
  recording_url text,
  transcript text,
  message_date timestamptz,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, ghl_message_id)
);

CREATE INDEX idx_ghl_messages_account ON public.ghl_messages(account_id);
CREATE INDEX idx_ghl_messages_conv ON public.ghl_messages(conversation_id);
CREATE INDEX idx_ghl_messages_contact ON public.ghl_messages(contact_id);
CREATE INDEX idx_ghl_messages_type ON public.ghl_messages(message_type);

ALTER TABLE public.ghl_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to ghl_messages" ON public.ghl_messages FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_ghl_messages_updated_at
BEFORE UPDATE ON public.ghl_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();