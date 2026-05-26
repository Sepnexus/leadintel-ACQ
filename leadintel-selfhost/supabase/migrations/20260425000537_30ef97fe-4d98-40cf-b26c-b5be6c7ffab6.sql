CREATE POLICY "sync_state_select_anon" ON public.sync_state
  FOR SELECT TO anon USING (true);