CREATE POLICY "ghl_contacts_select_anon" ON public.ghl_contacts
  FOR SELECT TO anon USING (true);

CREATE POLICY "ghl_contact_tags_select_anon" ON public.ghl_contact_tags
  FOR SELECT TO anon USING (true);

CREATE POLICY "ghl_opportunities_select_anon" ON public.ghl_opportunities
  FOR SELECT TO anon USING (true);

CREATE POLICY "ghl_conversations_select_anon" ON public.ghl_conversations
  FOR SELECT TO anon USING (true);