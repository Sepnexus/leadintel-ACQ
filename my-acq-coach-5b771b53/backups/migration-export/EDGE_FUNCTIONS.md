# Edge function inventory

All functions live in `functions/` (copied from `supabase/functions/`).
None use `deno.json` or import maps — all deps resolved via inline
`https://...` / `npm:` specifiers.

| Function | verify_jwt | Method | Reads secrets | Purpose |
|---|---|---|---|---|
| `admin-api` | true (default) | POST | service role | Super-admin & account-admin CRUD (customers, users, balances, sync). Auth checked via JWT + `is_super_admin()` / `is_account_admin()` in code. |
| `ai-chat` | true | POST | OPENAI_API_KEY | gpt-5.4-mini chat completions, returns Anthropic-shaped response. |
| `ai-tts` | true | POST | OPENAI_API_KEY | OpenAI tts-1, voice=onyx. Returns audio/mpeg. |
| `auto-recharge-cron` | **false** (see config.toml) | POST | STRIPE_*, service role | Scans `billing_settings.auto_recharge_enabled` + threshold, charges saved card. |
| `create-topup-session` | **false** | POST | STRIPE_*, service role | Creates Stripe Checkout Session for wallet top-up. |
| `cron-sync` | **false** | POST | service role + per-tenant GHL api_key | Pulls GHL conversations since `sync_state.cursor_ms`, saves messages, kicks scoring. |
| `ghl-proxy` | true | POST | service role + per-tenant GHL api_key | Action-routed proxy: whoami, list contacts/users, get conversation, etc. |
| `payments-webhook` | **false** | POST `?env=test\|live` | STRIPE_*_WEBHOOK_SECRET, service role | Stripe webhook. Verifies signature, credits wallet, saves card. |
| `transcribe` | true | POST (multipart) | DEEPGRAM_API_KEY | Deepgram Nova-3 with diarization, returns transcript + duration + cost. |
| `_shared/stripe.ts` | n/a | — | LOVABLE_API_KEY + STRIPE_*_API_KEY | Helper. Routes Stripe SDK through Lovable connector gateway. **Replace on self-host.** |
