REVOKE ALL ON FUNCTION public.debit_wallet(uuid, integer, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.credit_wallet(uuid, integer, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid, integer, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_wallet(uuid, integer, text, text, jsonb, text) TO service_role;