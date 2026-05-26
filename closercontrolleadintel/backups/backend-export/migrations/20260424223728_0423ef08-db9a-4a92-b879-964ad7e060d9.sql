-- =========================================================
-- TABLE 1: ghl_contacts
-- =========================================================
CREATE TABLE public.ghl_contacts (
  ghl_contact_id        text PRIMARY KEY,
  family_name           text,
  first_name            text,
  last_name             text,
  primary_phone         text,
  primary_email         text,
  assigned_user_id      text,
  niche_motivation      text,
  county                text,
  campaign_name         text,
  bot_type              text,
  ai_on                 boolean,
  seller_disposition    text,
  call_attempts         integer,
  last_called_date      timestamptz,
  follow_up_due_date    timestamptz,
  estimated_equity      numeric(12,2),
  market_value          numeric(12,2),
  mortgage_balance      numeric(12,2),
  auction_date          timestamptz,
  auction_status        text,
  decedent_name         text,
  decedent_age          integer,
  date_of_death         date,
  mailing_address       text,
  full_address          text,
  ghl_date_added        timestamptz,
  ghl_date_updated      timestamptz,
  raw_payload           jsonb       NOT NULL,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  sync_version          integer     NOT NULL DEFAULT 1
);

CREATE INDEX idx_contacts_disposition ON public.ghl_contacts (seller_disposition);
CREATE INDEX idx_contacts_assigned    ON public.ghl_contacts (assigned_user_id);
CREATE INDEX idx_contacts_updated     ON public.ghl_contacts (ghl_date_updated DESC);
CREATE INDEX idx_contacts_follow_up   ON public.ghl_contacts (follow_up_due_date) WHERE follow_up_due_date IS NOT NULL;
CREATE INDEX idx_contacts_auction     ON public.ghl_contacts (auction_date)       WHERE auction_date       IS NOT NULL;
CREATE INDEX idx_contacts_raw_tags    ON public.ghl_contacts USING GIN ((raw_payload -> 'tags'));

ALTER TABLE public.ghl_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_contacts_select_authenticated"
  ON public.ghl_contacts
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- TABLE 2: ghl_contact_tags
-- =========================================================
CREATE TABLE public.ghl_contact_tags (
  ghl_contact_id text NOT NULL REFERENCES public.ghl_contacts(ghl_contact_id) ON DELETE CASCADE,
  tag            text NOT NULL,
  PRIMARY KEY (ghl_contact_id, tag)
);

CREATE INDEX idx_tag_lookup ON public.ghl_contact_tags (tag);

-- Trigger to enforce lowercase tags
CREATE OR REPLACE FUNCTION public.lowercase_ghl_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.tag = lower(NEW.tag);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ghl_contact_tags_lowercase
BEFORE INSERT OR UPDATE ON public.ghl_contact_tags
FOR EACH ROW
EXECUTE FUNCTION public.lowercase_ghl_tag();

ALTER TABLE public.ghl_contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_contact_tags_select_authenticated"
  ON public.ghl_contact_tags
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- TABLE 3: ghl_opportunities
-- =========================================================
CREATE TABLE public.ghl_opportunities (
  ghl_opportunity_id text PRIMARY KEY,
  ghl_contact_id     text NOT NULL REFERENCES public.ghl_contacts(ghl_contact_id) ON DELETE CASCADE,
  pipeline_id        text NOT NULL,
  pipeline_stage_id  text NOT NULL,
  pipeline_name      text,
  stage_name         text,
  monetary_value     numeric(12,2),
  ghl_date_updated   timestamptz,
  synced_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opps_contact ON public.ghl_opportunities (ghl_contact_id);
CREATE INDEX idx_opps_stage   ON public.ghl_opportunities (pipeline_stage_id);

ALTER TABLE public.ghl_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_opportunities_select_authenticated"
  ON public.ghl_opportunities
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- TABLE 4: ghl_conversations
-- =========================================================
CREATE TABLE public.ghl_conversations (
  ghl_conversation_id        text PRIMARY KEY,
  ghl_contact_id             text NOT NULL REFERENCES public.ghl_contacts(ghl_contact_id) ON DELETE CASCADE,
  last_message_type          text,
  last_message_direction     text,
  last_message_body          text,
  last_message_at            timestamptz,
  inbound_count_last_30d     integer DEFAULT 0,
  outbound_count_last_30d    integer DEFAULT 0,
  longest_call_seconds       integer,
  total_calls                integer DEFAULT 0,
  synced_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_contact ON public.ghl_conversations (ghl_contact_id);

ALTER TABLE public.ghl_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_conversations_select_authenticated"
  ON public.ghl_conversations
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- TABLE 5: sync_state
-- =========================================================
CREATE TABLE public.sync_state (
  resource              text PRIMARY KEY,
  last_full_sync_at     timestamptz,
  last_delta_sync_at    timestamptz,
  last_delta_cursor     text,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  last_error            text,
  last_error_at         timestamptz
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_state_select_authenticated"
  ON public.sync_state
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed sync_state with the 4 resource rows
INSERT INTO public.sync_state (resource, consecutive_failures)
VALUES
  ('contacts',      0),
  ('opportunities', 0),
  ('conversations', 0),
  ('tags',          0);
