-- Demo seeding helpers. All demo rows use deterministic ids prefixed with 'demo-'
-- so unseeding is safe and never touches real synced data.

CREATE OR REPLACE FUNCTION public.seed_demo_data(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _u text;
  _c text;
  _call record;
  _score_id uuid;
  _call_id uuid;
  _calls_data jsonb := jsonb_build_array(
    jsonb_build_object('id','demo-call-1','rep','demo-u-1','contact','demo-c-1','dur',412,'score',87,'grade','B+','verdict','Strong discovery, missed the close.','dir','outbound'),
    jsonb_build_object('id','demo-call-2','rep','demo-u-1','contact','demo-c-2','dur',638,'score',92,'grade','A','verdict','Excellent objection handling.','dir','inbound'),
    jsonb_build_object('id','demo-call-3','rep','demo-u-2','contact','demo-c-3','dur',305,'score',71,'grade','C+','verdict','Rushed the pitch, weak rapport.','dir','outbound'),
    jsonb_build_object('id','demo-call-4','rep','demo-u-2','contact','demo-c-4','dur',521,'score',84,'grade','B','verdict','Good frame, late on price.','dir','inbound'),
    jsonb_build_object('id','demo-call-5','rep','demo-u-3','contact','demo-c-5','dur',478,'score',78,'grade','B-','verdict','Solid intro, no clear next step.','dir','outbound'),
    jsonb_build_object('id','demo-call-6','rep','demo-u-3','contact','demo-c-6','dur',712,'score',95,'grade','A+','verdict','Textbook close, high urgency.','dir','inbound'),
    jsonb_build_object('id','demo-call-7','rep','demo-u-1','contact','demo-c-3','dur',233,'score',64,'grade','D','verdict','Dropped the prospect''s main concern.','dir','outbound'),
    jsonb_build_object('id','demo-call-8','rep','demo-u-2','contact','demo-c-5','dur',556,'score',81,'grade','B','verdict','Strong tone, weak qualification.','dir','inbound')
  );
  _users_data jsonb := jsonb_build_array(
    jsonb_build_object('id','demo-u-1','name','Marcus Reed','email','marcus@demo.local','role','sales_rep'),
    jsonb_build_object('id','demo-u-2','name','Priya Shah','email','priya@demo.local','role','sales_rep'),
    jsonb_build_object('id','demo-u-3','name','Jordan Kim','email','jordan@demo.local','role','sales_rep'),
    jsonb_build_object('id','demo-u-4','name','Alex Johnson','email','alex@demo.local','role','admin')
  );
  _contacts_data jsonb := jsonb_build_array(
    jsonb_build_object('id','demo-c-1','name','Sarah Mitchell','email','sarah.m@example.com','phone','+15550101','rep','demo-u-1'),
    jsonb_build_object('id','demo-c-2','name','David Lee','email','david.lee@example.com','phone','+15550102','rep','demo-u-1'),
    jsonb_build_object('id','demo-c-3','name','Emma Garcia','email','emma.g@example.com','phone','+15550103','rep','demo-u-2'),
    jsonb_build_object('id','demo-c-4','name','Tom Brown','email','tom.b@example.com','phone','+15550104','rep','demo-u-2'),
    jsonb_build_object('id','demo-c-5','name','Lisa Chen','email','lisa.c@example.com','phone','+15550105','rep','demo-u-3'),
    jsonb_build_object('id','demo-c-6','name','Mike Davis','email','mike.d@example.com','phone','+15550106','rep','demo-u-3')
  );
  _transcript text := 'Rep: Hi, this is Marcus from ACQ. Thanks for jumping on. Prospect: Yeah, no problem. Rep: So tell me, what made you reach out today? Prospect: We''ve been struggling with our outbound — booking calls but not closing. Rep: Got it. Walk me through what a typical week looks like…';
BEGIN
  -- Clean any prior demo rows for this account (idempotent)
  PERFORM public.unseed_demo_data(_account_id);

  -- ghl_users
  INSERT INTO public.ghl_users (account_id, ghl_user_id, name, email, role)
  SELECT _account_id, x->>'id', x->>'name', x->>'email', x->>'role'
  FROM jsonb_array_elements(_users_data) AS x;

  -- ghl_contacts
  INSERT INTO public.ghl_contacts (account_id, ghl_contact_id, name, email, phone, assigned_user_id)
  SELECT _account_id, x->>'id', x->>'name', x->>'email', x->>'phone', x->>'rep'
  FROM jsonb_array_elements(_contacts_data) AS x;

  -- conversations + messages + calls + scores
  FOR _call IN
    SELECT
      (x->>'id')      AS id,
      (x->>'rep')     AS rep,
      (x->>'contact') AS contact,
      (x->>'dur')::int AS dur,
      (x->>'score')::int AS score,
      (x->>'grade')   AS grade,
      (x->>'verdict') AS verdict,
      (x->>'dir')     AS dir,
      ROW_NUMBER() OVER () AS rn
    FROM jsonb_array_elements(_calls_data) AS x
  LOOP
    -- Insert score first, capture id
    INSERT INTO public.call_scores (
      account_id, rep_ghl_user_id, rep_name, seller_name, seller_type, call_type,
      overall_score, grade, verdict, transcript, duration,
      seller_talk_ratio, rep_talk_ratio, category_scores, moments, strengths,
      scored_at, created_at, updated_at
    )
    SELECT
      _account_id, _call.rep,
      (SELECT x->>'name' FROM jsonb_array_elements(_users_data) AS x WHERE x->>'id' = _call.rep),
      (SELECT x->>'name' FROM jsonb_array_elements(_contacts_data) AS x WHERE x->>'id' = _call.contact),
      'warm-lead', 'first-contact',
      _call.score, _call.grade, _call.verdict, _transcript,
      (_call.dur/60)::text || 'm ' || (_call.dur%60)::text || 's',
      45, 55,
      jsonb_build_array(
        jsonb_build_object('name','Introduction','category','Introduction','score', GREATEST(5, LEAST(10, (_call.score/10)+1))),
        jsonb_build_object('name','Rapport','category','Rapport','score', GREATEST(5, LEAST(10, _call.score/10))),
        jsonb_build_object('name','Motivation','category','Motivation','score', GREATEST(5, LEAST(10, (_call.score/10)-1))),
        jsonb_build_object('name','Timeline','category','Timeline','score', GREATEST(5, LEAST(10, _call.score/10))),
        jsonb_build_object('name','Financial','category','Financial','score', GREATEST(5, LEAST(10, (_call.score/10)-2))),
        jsonb_build_object('name','Offer','category','Offer','score', GREATEST(5, LEAST(10, _call.score/10))),
        jsonb_build_object('name','Objection','category','Objection','score', GREATEST(5, LEAST(10, (_call.score/10)-1))),
        jsonb_build_object('name','Next Step','category','Next Step','score', GREATEST(5, LEAST(10, (_call.score/10)-2))),
        jsonb_build_object('name','Closing','category','Closing','score', GREATEST(5, LEAST(10, _call.score/10)))
      ),
      jsonb_build_array(
        jsonb_build_object('time','0:42','type','strength','text','Strong open with a tailored question.'),
        jsonb_build_object('time','2:18','type','weakness','text','Missed signal — prospect mentioned timing.'),
        jsonb_build_object('time','5:05','type','strength','text','Clean pricing reframe.')
      ),
      jsonb_build_array('Tone control','Pacing','Discovery questions'),
      _now - (_call.rn * interval '6 hours'),
      _now - (_call.rn * interval '6 hours'),
      _now - (_call.rn * interval '6 hours')
    RETURNING id INTO _score_id;

    -- Conversation row
    INSERT INTO public.ghl_conversations (
      account_id, ghl_conversation_id, contact_id, assigned_user_id,
      last_message_body, last_message_type, last_message_date, type
    ) VALUES (
      _account_id, _call.id || '-conv', _call.contact, _call.rep,
      'Call recording', 'TYPE_CALL', _now - (_call.rn * interval '6 hours'), 'TYPE_CALL'
    ) ON CONFLICT DO NOTHING;

    -- Call row
    INSERT INTO public.ghl_calls (
      account_id, ghl_message_id, conversation_id, contact_id, assigned_user_id,
      direction, call_status, call_duration, transcript, body, status, call_date, score_id
    ) VALUES (
      _account_id, _call.id || '-msg', _call.id || '-conv', _call.contact, _call.rep,
      _call.dir, 'completed', _call.dur, _transcript, 'Call recording', 'scored',
      _now - (_call.rn * interval '6 hours'), _score_id
    ) RETURNING id INTO _call_id;

    -- Message mirror (call message)
    INSERT INTO public.ghl_messages (
      account_id, ghl_message_id, conversation_id, contact_id, user_id,
      message_type, direction, status, body, call_duration, call_status,
      transcript, message_date
    ) VALUES (
      _account_id, _call.id || '-msg', _call.id || '-conv', _call.contact, _call.rep,
      'TYPE_CALL', _call.dir, 'completed', 'Call recording', _call.dur, 'completed',
      _transcript, _now - (_call.rn * interval '6 hours')
    ) ON CONFLICT DO NOTHING;

    -- Demo usage events: whisper + scoring per call
    INSERT INTO public.usage_events (
      account_id, provider, operation, model, status,
      audio_seconds, tokens_in, tokens_out, provider_cost_cents, billed_cents,
      effective_seconds, markup_multiplier, margin_cents, call_id, ghl_message_id, metadata
    ) VALUES (
      _account_id, 'openai', 'transcribe', 'whisper-1', 'success',
      _call.dur, 0, 0, ROUND((_call.dur/60.0)*0.6, 4), GREATEST(1, ROUND((_call.dur/60.0)*0.6*2)),
      _call.dur, 2.0, GREATEST(1, ROUND((_call.dur/60.0)*0.6*2)) - ROUND((_call.dur/60.0)*0.6, 4),
      _call_id, _call.id || '-msg', '{"demo":true}'::jsonb
    ),
    (
      _account_id, 'openai', 'score', 'gpt-5-mini', 'success',
      0, 1200, 800, 0.5, 1, NULL, 2.0, 0.5, _call_id, _call.id || '-msg', '{"demo":true}'::jsonb
    );
  END LOOP;

  -- Wallet credit ($50 starter)
  PERFORM public.credit_wallet(_account_id, 5000, 'Demo starter credit', NULL, '{"demo":true}'::jsonb, 'credit');

  RETURN jsonb_build_object('ok', true, 'seeded', true);
END $$;


CREATE OR REPLACE FUNCTION public.unseed_demo_data(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Order matters: dependents first
  DELETE FROM public.ghl_calls
    WHERE account_id = _account_id AND ghl_message_id LIKE 'demo-call-%';
  DELETE FROM public.ghl_messages
    WHERE account_id = _account_id AND ghl_message_id LIKE 'demo-call-%';
  DELETE FROM public.call_scores
    WHERE account_id = _account_id AND rep_ghl_user_id LIKE 'demo-u-%';
  DELETE FROM public.ghl_conversations
    WHERE account_id = _account_id AND ghl_conversation_id LIKE 'demo-c-%-conv';
  DELETE FROM public.ghl_contacts
    WHERE account_id = _account_id AND ghl_contact_id LIKE 'demo-c-%';
  DELETE FROM public.ghl_users
    WHERE account_id = _account_id AND ghl_user_id LIKE 'demo-u-%';
  DELETE FROM public.usage_events
    WHERE account_id = _account_id AND (metadata->>'demo')::text = 'true';
  DELETE FROM public.wallet_transactions
    WHERE account_id = _account_id AND (metadata->>'demo')::text = 'true';
  -- Note: we leave the wallets row in place; balance was credited via credit_wallet
  -- and we don't want to silently wipe a real balance. Admins can adjust manually.

  RETURN jsonb_build_object('ok', true, 'unseeded', true);
END $$;

REVOKE ALL ON FUNCTION public.seed_demo_data(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.unseed_demo_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unseed_demo_data(uuid) TO service_role;