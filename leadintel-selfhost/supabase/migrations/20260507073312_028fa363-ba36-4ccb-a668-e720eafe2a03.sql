CREATE TABLE IF NOT EXISTS public.tenant_custom_field_mappings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  ghl_field_id text NOT NULL,
  ghl_field_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, field_key)
);

ALTER TABLE public.tenant_custom_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_custom_field_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY "tcfm_select" ON public.tenant_custom_field_mappings
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = get_user_tenant_id());

INSERT INTO public.tenant_custom_field_mappings (tenant_id, field_key, ghl_field_id, ghl_field_name) VALUES
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'seller_temperature',  'fZRjwPls61A6pRwzcJKT', 'Seller Temperature'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'last_offer_date',     '89QarYyIqk20IF7JAnie', 'Last Offer Date'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'last_offer_feedback', 'OJr4QimBjk9erymkRFkm', 'Last Offer Feedback'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'last_offer_type',     '5IuLbwdLe4Mg8Hh5mn6X', 'Last Offer Type'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'last_offer_made',     'Nw6E9PXPc0pZt6DkNkIK', 'Last Offer Made'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'timeline',            'RFigS0ILY8x30aeNVYe6', 'Timeline'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'asking_price',        'WLg9Qfm9hc5eeMn8Dkw2', 'Asking Price'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'condition',           'rFECwg0jrirzaDjIJXl4', 'Condition'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'motivation',          'eRA3AJ2TOE8Nq1XiiYTc', 'Motivation'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'seller_note',         'JW3i9wZkuAbJD23JfmoK', 'Seller Notes'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'lead_identity',       'ygI7c1vpEBo4uq47OU4R', 'Lead Identity'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'lead_source',         'rBInsLsDST9J3mct7f0d', 'Lead Source'),
  ('5b9a289f-92ba-4ee6-a233-303ee63099fd', 'personality_type',    'H2h5VJRbgpAzms7hgDew', 'Personality Type (2 required)')
ON CONFLICT (tenant_id, field_key) DO NOTHING;