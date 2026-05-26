# External Integrations

| Service | Used in | Purpose |
|---|---|---|
| **OpenAI** (`api.openai.com`) | `supabase/functions/ai-chat`, `ai-tts` | gpt-5.4-mini scoring/chat, TTS (`tts-1`, voice=onyx) |
| **Deepgram** (`api.deepgram.com`) | `supabase/functions/transcribe` | Nova-3 transcription with diarization |
| **Stripe** (`api.stripe.com` via `connector-gateway.lovable.dev/stripe`) | `create-topup-session`, `payments-webhook`, `auto-recharge-cron`, `_shared/stripe.ts` | Wallet top-ups, saved cards, auto-recharge. Both test + live keys. Webhook signed by `STRIPE_*_WEBHOOK_SECRET`. **Currently routed through Lovable's connector gateway — replace with direct Stripe SDK on self-host.** |
| **GoHighLevel** (`services.leadconnectorhq.com`) | `supabase/functions/ghl-proxy`, `cron-sync` | Conversation + message sync, contact/user mirror. API key stored per-tenant in `ghl_accounts.api_key`. |
| **Anthropic** (`ANTHROPIC_API_KEY` env exists) | Fallback in scoring path | Listed in secrets but primary path is OpenAI. |
| **Lovable AI Gateway** (`LOVABLE_API_KEY`) | `_shared/stripe.ts` header | Required by Lovable's Stripe connector proxy. **Remove on self-host** and call Stripe directly. |
| **Lovable Payments Client** (`VITE_PAYMENTS_CLIENT_TOKEN`) | Frontend `TopupCheckout.tsx` | Lovable-hosted checkout widget. Replace with Stripe Checkout/Elements on self-host. |
