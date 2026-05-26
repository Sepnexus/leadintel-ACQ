# ER / Schema Summary

No foreign-key constraints exist. References below are by-convention only
(enforced via RLS helper functions, not DB constraints).

## Tenancy / auth

### `ghl_accounts` — one row per Customer (organization). [10 cols]
PK `id uuid`. Cols: name, location_id, company_id, api_key (GHL),
integrated_at, is_active, is_test, demo_mode, created_at.

### `profiles` — per-user display info; mirrors `auth.users`. [6 cols]
PK `id uuid` (= auth.users.id). Cols: full_name, account_id (→ ghl_accounts.id),
created_by, created_at, updated_at.

### `user_roles` — RBAC. [5 cols]
PK `id`. Cols: user_id (→ auth.users.id), role (app_role enum),
account_id (→ ghl_accounts.id, NULL for super_admin), created_at.

### `rep_assignments` — maps Supabase user → one or more GHL user IDs. [5 cols]
PK `id`. Cols: user_id, account_id, ghl_user_id (text, → ghl_users.ghl_user_id),
created_at.

## GHL mirror (synced from GoHighLevel)

### `ghl_users` — sales reps in GHL. [10 cols]
PK `id`. Cols: account_id, ghl_user_id (unique per account), name, email,
phone, role, raw_data jsonb, timestamps.

### `ghl_contacts` — leads/sellers. [10 cols]
PK `id`. Cols: account_id, ghl_contact_id, assigned_user_id (text →
ghl_users.ghl_user_id), name, email, phone, raw_data, timestamps.

### `ghl_conversations` — conversation threads. [13 cols]
PK `id`. Cols: account_id, ghl_conversation_id, contact_id, assigned_user_id,
last_message_*, type, unread_count, raw_data, timestamps.

### `ghl_messages` — all messages (SMS/email/calls). [18 cols]
PK `id`. Cols: account_id, ghl_message_id, conversation_id, contact_id,
user_id, message_type, direction, status, body, call_duration, call_status,
recording_url, transcript, message_date, raw_data, timestamps.

### `ghl_calls` — TYPE_CALL messages, scored pipeline. [17 cols]
PK `id`. Cols: account_id, ghl_message_id, conversation_id, contact_id,
assigned_user_id, direction, call_status, call_duration, transcript, body,
status (pending|success|no_transcript|error|scored), call_date, score_id
(→ call_scores.id), raw_data, timestamps.

## AI scoring

### `call_scores` — ACQ Coach scorecards. [20 cols]
PK `id`. Cols: account_id, rep_ghl_user_id, rep_name, seller_name,
seller_type, call_type, overall_score (int 0-100), grade, verdict (text),
category_scores jsonb, moments jsonb, strengths jsonb, transcript,
rep_talk_ratio, seller_talk_ratio, duration (text "Xm YYs"),
scored_at, timestamps.

## Billing / wallet (cents-based)

### `wallets` — prepaid balance per Customer. [3 cols]
PK `account_id`. Cols: balance_cents (int), updated_at.

### `wallet_transactions` — ledger. [10 cols]
PK `id`. Cols: account_id, type (credit|debit|refund|adjustment),
amount_cents, balance_after_cents, reason, stripe_session_id (unique for
dedup), created_by, metadata, created_at.

### `billing_settings` — Stripe customer + auto-recharge config. [13 cols]
PK `account_id`. Cols: stripe_customer_id, default_payment_method_id,
card_brand/last4/exp_month/exp_year, auto_recharge_enabled,
threshold_cents, topup_amount_cents, min_call_seconds_for_ai,
markup_multiplier, updated_at.

### `app_settings` — global pricing (singleton, PK = boolean `true`). [8 cols]
Cols: stripe_mode (test|live), whisper_cents_per_minute,
openai_input_cents_per_1k, openai_output_cents_per_1k,
default_min_call_seconds_for_ai, default_markup_multiplier, updated_at.

### `usage_events` — per-AI-call cost ledger. [19 cols]
PK `id`. Cols: account_id, provider (openai|deepgram|anthropic),
operation (transcribe|score|chat|tts), model, status, audio_seconds,
tokens_in, tokens_out, provider_cost_cents, billed_cents,
effective_seconds, markup_multiplier, margin_cents, call_id (→ ghl_calls.id),
ghl_message_id, error_message, metadata, created_at.

## Sync / ops

### `sync_runs` — every cron-sync invocation. [14 cols]
PK `id`. Cols: account_id, trigger (cron|manual|demo-seed|backfill|...),
status (running|success|error), conversations_scanned/saved, messages_saved,
call_messages_found, cursor_before_ms, cursor_after_ms, duration_ms,
error_message, started_at, finished_at.

### `sync_state` — last-seen cursor per Customer. [5 cols]
PK `account_id`. Cols: cursor_ms (bigint), last_run_at, last_status, updated_at.

### `blocked_numbers` — per-tenant phone blocklist. [5 cols]
PK `id`. Cols: account_id, phone_number, reason, created_at.
