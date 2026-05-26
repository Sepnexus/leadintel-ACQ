-- Backfill usage_events from past wallet debits that silently failed to insert cost rows
-- (root cause: code passed margin_cents which is a generated column, raising an error
-- swallowed by a try/catch).
INSERT INTO public.usage_events (
  account_id, operation, provider, model, call_id, ghl_message_id,
  audio_seconds, effective_seconds, provider_cost_cents, billed_cents,
  markup_multiplier, status, metadata, created_at
)
SELECT
  wt.account_id,
  CASE WHEN wt.reason ILIKE '%whisper%' OR wt.reason ILIKE '%transcrip%' THEN 'transcription'
       WHEN wt.reason ILIKE '%scor%' THEN 'scoring'
       ELSE 'other' END AS operation,
  'openai' AS provider,
  CASE WHEN wt.reason ILIKE '%whisper%' OR wt.reason ILIKE '%transcrip%' THEN 'whisper-1' ELSE 'gpt-4o-mini' END AS model,
  NULLIF((wt.metadata->>'call_id'),'')::uuid AS call_id,
  wt.metadata->>'ghl_message_id' AS ghl_message_id,
  COALESCE((wt.metadata->>'audio_seconds')::int, 0) AS audio_seconds,
  COALESCE((wt.metadata->>'audio_seconds')::int, 0) AS effective_seconds,
  -- Reverse-derive provider cost from billed/markup when possible
  CASE WHEN COALESCE((wt.metadata->>'markup')::numeric, 0) > 0
       THEN ROUND(wt.amount_cents / (wt.metadata->>'markup')::numeric, 4)
       ELSE 0 END AS provider_cost_cents,
  wt.amount_cents AS billed_cents,
  COALESCE((wt.metadata->>'markup')::numeric, 2) AS markup_multiplier,
  'success' AS status,
  jsonb_build_object('source', 'backfill_from_wallet_tx', 'wallet_tx_id', wt.id) AS metadata,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.type = 'debit'
  AND wt.metadata ? 'call_id'
  AND NOT EXISTS (
    SELECT 1 FROM public.usage_events ue
    WHERE ue.call_id = NULLIF((wt.metadata->>'call_id'),'')::uuid
      AND ue.operation = CASE WHEN wt.reason ILIKE '%whisper%' OR wt.reason ILIKE '%transcrip%' THEN 'transcription' ELSE 'scoring' END
      AND ue.billed_cents = wt.amount_cents
  );