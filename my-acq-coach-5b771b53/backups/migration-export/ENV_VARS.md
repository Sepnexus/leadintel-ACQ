# Environment variables & secrets (names only)

## Frontend (Vite — must start with VITE_)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (= anon key)
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_PAYMENTS_CLIENT_TOKEN` (Lovable Payments — drop if leaving Lovable)

## Edge function secrets (Deno.env.get in `supabase/functions/`)
- `SUPABASE_URL` (auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)
- `SUPABASE_ANON_KEY` (auto-injected)
- `SUPABASE_DB_URL` (auto-injected)
- `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEY` (auto-injected, used for JWT verification)
- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `ANTHROPIC_API_KEY`
- `STRIPE_TEST_SECRET_KEY`
- `STRIPE_TEST_PUBLISHABLE_KEY`
- `STRIPE_TEST_WEBHOOK_SECRET`
- `STRIPE_LIVE_SECRET_KEY`
- `STRIPE_LIVE_PUBLISHABLE_KEY`
- `STRIPE_LIVE_WEBHOOK_SECRET`
- `LOVABLE_API_KEY` (drop after migration off Lovable)
