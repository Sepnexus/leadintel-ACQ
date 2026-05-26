CREATE OR REPLACE FUNCTION public.unseed_demo_data(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _demo_credit integer := 0;
BEGIN
  SELECT COALESCE(SUM(amount_cents),0)::integer INTO _demo_credit
  FROM public.wallet_transactions
  WHERE account_id = _account_id
    AND (metadata->>'demo' = 'true' OR metadata->>'demo_seed' = 'closer-control-gold');

  DELETE FROM public.usage_events
    WHERE account_id = _account_id
      AND (metadata->>'demo' = 'true' OR metadata->>'demo_seed' = 'closer-control-gold' OR ghl_message_id LIKE 'demo-call-%');

  DELETE FROM public.ghl_calls
    WHERE account_id = _account_id
      AND (ghl_message_id LIKE 'demo-call-%' OR conversation_id LIKE 'demo-call-%-conv');

  DELETE FROM public.ghl_messages
    WHERE account_id = _account_id
      AND (ghl_message_id LIKE 'demo-call-%' OR conversation_id LIKE 'demo-call-%-conv');

  DELETE FROM public.call_scores
    WHERE account_id = _account_id
      AND (rep_ghl_user_id LIKE 'demo-u-%' OR (seller_name IN ('Eleanor Price','Raymond Ortiz','Clara Whitman','Anthony Bell','Nina Coleman','Gerald Moore','Patrice Walker','Victor Hale','Monica Alvarez','Samuel Brooks','Denise Carter','Howard Mills','Janet Cross','Leon Fisher','Amelia Turner','Carl Bennett')));

  DELETE FROM public.ghl_conversations
    WHERE account_id = _account_id
      AND (ghl_conversation_id LIKE 'demo-call-%-conv' OR ghl_conversation_id LIKE 'demo-c-%-conv');

  DELETE FROM public.ghl_contacts
    WHERE account_id = _account_id
      AND ghl_contact_id LIKE 'demo-c-%';

  DELETE FROM public.ghl_users
    WHERE account_id = _account_id
      AND ghl_user_id LIKE 'demo-u-%';

  DELETE FROM public.sync_runs
    WHERE account_id = _account_id
      AND trigger = 'demo-seed';

  DELETE FROM public.wallet_transactions
    WHERE account_id = _account_id
      AND (metadata->>'demo' = 'true' OR metadata->>'demo_seed' = 'closer-control-gold');

  IF _demo_credit > 0 THEN
    UPDATE public.wallets
      SET balance_cents = GREATEST(0, balance_cents - _demo_credit), updated_at = now()
      WHERE account_id = _account_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'unseeded', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_demo_data(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
  _call record;
  _score_id uuid;
  _call_id uuid;
  _users_data jsonb := jsonb_build_array(
    jsonb_build_object('id','demo-u-1','name','Marcus Reed','email','marcus.reed@demo.closercontrol.local','role','sales_rep'),
    jsonb_build_object('id','demo-u-2','name','Jada Rivera','email','jada.rivera@demo.closercontrol.local','role','sales_rep'),
    jsonb_build_object('id','demo-u-3','name','Tyler Knox','email','tyler.knox@demo.closercontrol.local','role','sales_rep'),
    jsonb_build_object('id','demo-u-4','name','Sofia Miles','email','sofia.miles@demo.closercontrol.local','role','sales_rep')
  );
  _contacts_data jsonb := jsonb_build_array(
    jsonb_build_object('id','demo-c-1','name','Eleanor Price','email','eleanor.price@example.com','phone','+1555010101','rep','demo-u-1'),
    jsonb_build_object('id','demo-c-2','name','Raymond Ortiz','email','raymond.ortiz@example.com','phone','+1555010102','rep','demo-u-1'),
    jsonb_build_object('id','demo-c-3','name','Clara Whitman','email','clara.whitman@example.com','phone','+1555010103','rep','demo-u-1'),
    jsonb_build_object('id','demo-c-4','name','Anthony Bell','email','anthony.bell@example.com','phone','+1555010104','rep','demo-u-1'),
    jsonb_build_object('id','demo-c-5','name','Nina Coleman','email','nina.coleman@example.com','phone','+1555010105','rep','demo-u-2'),
    jsonb_build_object('id','demo-c-6','name','Gerald Moore','email','gerald.moore@example.com','phone','+1555010106','rep','demo-u-2'),
    jsonb_build_object('id','demo-c-7','name','Patrice Walker','email','patrice.walker@example.com','phone','+1555010107','rep','demo-u-2'),
    jsonb_build_object('id','demo-c-8','name','Victor Hale','email','victor.hale@example.com','phone','+1555010108','rep','demo-u-2'),
    jsonb_build_object('id','demo-c-9','name','Monica Alvarez','email','monica.alvarez@example.com','phone','+1555010109','rep','demo-u-3'),
    jsonb_build_object('id','demo-c-10','name','Samuel Brooks','email','samuel.brooks@example.com','phone','+1555010110','rep','demo-u-3'),
    jsonb_build_object('id','demo-c-11','name','Denise Carter','email','denise.carter@example.com','phone','+1555010111','rep','demo-u-3'),
    jsonb_build_object('id','demo-c-12','name','Howard Mills','email','howard.mills@example.com','phone','+1555010112','rep','demo-u-3'),
    jsonb_build_object('id','demo-c-13','name','Janet Cross','email','janet.cross@example.com','phone','+1555010113','rep','demo-u-4'),
    jsonb_build_object('id','demo-c-14','name','Leon Fisher','email','leon.fisher@example.com','phone','+1555010114','rep','demo-u-4'),
    jsonb_build_object('id','demo-c-15','name','Amelia Turner','email','amelia.turner@example.com','phone','+1555010115','rep','demo-u-4'),
    jsonb_build_object('id','demo-c-16','name','Carl Bennett','email','carl.bennett@example.com','phone','+1555010116','rep','demo-u-4')
  );
  _calls_data jsonb := jsonb_build_array(
    jsonb_build_object('id','demo-call-1','rep','demo-u-1','contact','demo-c-1','dur',756,'score',86,'grade','B+','seller_type','probate','call_type','first-contact','seller_talk',63,'rep_talk',37,'dir','outbound','offset_hours',3,'transcript',E'Rep: Eleanor, this is Marcus Reed with HomePath Buyers. Did I catch you with a minute?\nSeller: I have a minute. Is this about my mother\'s house?\nRep: Yes ma\'am, the Pine Street property. First, I\'m sorry for your loss. I work with families who inherited homes and are trying to decide whether to keep, list, or sell as-is.\nSeller: We are not sure yet. My brother is in Ohio and I am the one cleaning it out.\nRep: That sounds like a lot to carry by yourself. Walk me through what has been hardest about the property so far.\nSeller: The cleanout and repairs. The roof is older, there are boxes everywhere, and I do not want months of showings.\nRep: If you could wave a wand, would the win be getting a fair number, avoiding repairs, or just getting the responsibility off your plate?\nSeller: Mostly the responsibility. I do not want to keep paying utilities.\nRep: Makes sense. Is there a mortgage or any probate timeline we need to respect?\nSeller: No mortgage, probate should be finished in about three weeks.\nRep: Good. If I can buy it as-is, handle the cleanout, and close after probate clears, would it be worth seeing a written offer?\nSeller: Maybe. I need my brother involved.\nRep: Absolutely. Rather than you relaying everything, what if we set a 15-minute call with both of you tomorrow at 4:30? I can bring a clear range and answer his questions directly.\nSeller: Tomorrow at 4:30 should work.\nRep: Perfect. I\'ll send a summary with the as-is process and call you both then.'),
    jsonb_build_object('id','demo-call-2','rep','demo-u-1','contact','demo-c-2','dur',914,'score',91,'grade','A','seller_type','pre-foreclosure','call_type','follow-up','seller_talk',66,'rep_talk',34,'dir','inbound','offset_hours',18,'transcript',E'Seller: Marcus, this is Raymond. I got your voicemail.\nRep: Raymond, thanks for calling back. Last time you said the bank date was getting close. Where does that stand today?\nSeller: The sale date is posted for next month. I am behind eight months and I hate talking about it.\nRep: I get it. I am not here to judge you. My job is to see if there is a clean exit before the bank takes control. What would a good outcome look like by the end of this week?\nSeller: I need enough to pay the arrears and move. I cannot do repairs.\nRep: Understood. Do you know the payoff or reinstatement number?\nSeller: Reinstatement is about thirty-one thousand. Payoff is around two-twenty.\nRep: Helpful. If we bought it as-is, paid closing costs, and closed before the sale date, what number would make you feel like you can breathe?\nSeller: I was thinking two-sixty, but I know it needs work.\nRep: I hear you. Based on the roof and kitchen, I may not be at two-sixty, but I can structure certainty: no repairs, no commissions, and a closing date before the auction.\nSeller: Certainty matters more right now.\nRep: Then let us do this: I will inspect tomorrow at 11, bring a written offer by 2, and if it solves the arrears we can open escrow same day. Does 11 work?\nSeller: Yes. That is what I needed.'),
    jsonb_build_object('id','demo-call-3','rep','demo-u-1','contact','demo-c-3','dur',682,'score',79,'grade','B','seller_type','absentee-owner','call_type','first-contact','seller_talk',58,'rep_talk',42,'dir','outbound','offset_hours',30,'transcript',E'Rep: Clara, Marcus with HomePath Buyers. I saw you own the Maple Avenue property from out of state. Are you still the right person to talk to?\nSeller: Yes, but I am not desperate to sell.\nRep: Totally fair. Most owners I speak with are not desperate; they are just tired of managing something from a distance. What has the property been like for you lately?\nSeller: Mostly vacant. My cousin checks on it. Taxes keep going up.\nRep: How long has it been vacant?\nSeller: Almost a year.\nRep: What made you hold it instead of selling last year?\nSeller: I thought my son might move there, but he took a job in Texas.\nRep: So the original reason to keep it changed. If you sold, would speed, price, or not traveling back be most important?\nSeller: Not traveling back. I do not want to fly in for repairs and agents.\nRep: That is exactly the type of situation we solve. I can have a local partner walk it, we buy as-is, and you can close remotely.\nSeller: I still need a decent number.\nRep: Of course. I do not want to guess without condition. Can we schedule a walkthrough with your cousin Thursday at noon, then I will give you a written net sheet by Friday morning?\nSeller: That works. Text me what you need.'),
    jsonb_build_object('id','demo-call-4','rep','demo-u-1','contact','demo-c-4','dur',605,'score',73,'grade','B','seller_type','divorce','call_type','offer-presentation','seller_talk',52,'rep_talk',48,'dir','outbound','offset_hours',44,'transcript',E'Rep: Anthony, it is Marcus. I reviewed the photos and title notes. How are you holding up with everything?\nSeller: Honestly I just want this done. My ex keeps changing her mind.\nRep: That sounds exhausting. The cleanest path is usually an offer both parties can understand in writing.\nSeller: She thinks the house is worth more than it is.\nRep: What number does she have in mind?\nSeller: Around 310. I think 285 is more realistic.\nRep: Based on repairs and closing costs, my cash offer is 272. It is lower than retail, but it removes inspection risk, showings, and the back-and-forth.\nSeller: She is going to say no.\nRep: She might. Before that happens, what matters more to her: the top number, or certainty that the house closes before mediation?\nSeller: Probably mediation. The judge wants this resolved.\nRep: Then I should have framed the offer around the mediation date first. Here is my suggestion: I send a one-page net sheet showing sale price, no commissions, and guaranteed close before mediation. Can we review it together with her Friday at 10?\nSeller: Send it. I can probably get her on the phone Friday.\nRep: Great. I will send it today and call Friday at 10 sharp.'),
    jsonb_build_object('id','demo-call-5','rep','demo-u-2','contact','demo-c-5','dur',801,'score',76,'grade','B','seller_type','tired-landlord','call_type','first-contact','seller_talk',61,'rep_talk',39,'dir','inbound','offset_hours',7,'transcript',E'Seller: I got your message about buying rentals.\nRep: Nina, yes. This is Jada Rivera. You mentioned the duplex has been a headache. What has been going on there?\nSeller: One tenant pays late, the other calls every week. I have owned it twelve years and I am tired.\nRep: Sounds like the property used to be an asset and now it feels like another job.\nSeller: Exactly. I work full time. I do not want weekend maintenance calls.\nRep: If you sold, are you trying to maximize price, stop the stress quickly, or avoid dealing with the tenants?\nSeller: Avoid the tenants and get a fair price.\nRep: Are both units occupied right now?\nSeller: Yes, but one lease is month to month.\nRep: Any big repairs coming up?\nSeller: Plumbing and a roof patch.\nRep: Got it. We can buy with tenants in place and handle the repair risk. I would need rent roll, lease terms, and a walkthrough.\nSeller: I do not want tenants disturbed.\nRep: Fair. We can do exterior first and only inspect interiors after we agree on a range. If the range works, we schedule one coordinated visit.\nSeller: That is better.\nRep: I will text you the three items I need, and let us pencil Thursday at 1 for an exterior walkthrough. Does that work?\nSeller: Yes.'),
    jsonb_build_object('id','demo-call-6','rep','demo-u-2','contact','demo-c-6','dur',579,'score',68,'grade','B-','seller_type','probate','call_type','follow-up','seller_talk',54,'rep_talk',46,'dir','outbound','offset_hours',26,'transcript',E'Rep: Gerald, it is Jada checking back on the estate property. Did your sister get a chance to review the options?\nSeller: She thinks we should list it.\nRep: Listing can make sense. What did she like about that route?\nSeller: She thinks we will get more.\nRep: That is possible if the repairs are handled and you are okay with the timeline. What repairs did the agent mention?\nSeller: Paint, flooring, electrical panel, maybe the sewer line.\nRep: Those can add up. Did the agent give you a net number after repairs, commissions, and time?\nSeller: Not really. Just said the market is good.\nRep: I should have brought a side-by-side earlier. My cash offer is not the highest headline number, but it may be close on net if you avoid repairs and holding costs.\nSeller: Maybe, but we do not want to leave money on the table.\nRep: Completely understand. Let us compare apples to apples. Can I send a net sheet tonight and then talk with you and your sister tomorrow at 5:15?\nSeller: Tomorrow is okay.\nRep: Great. I will include retail estimate, repair budget, commissions, and our as-is number so the decision is clear.'),
    jsonb_build_object('id','demo-call-7','rep','demo-u-2','contact','demo-c-7','dur',442,'score',62,'grade','C+','seller_type','cold-unknown','call_type','first-contact','seller_talk',46,'rep_talk',54,'dir','outbound','offset_hours',50,'transcript',E'Rep: Hi Patrice, this is Jada. I was calling about the property on Grant Street.\nSeller: How did you get my number?\nRep: Public records and local property data. I know calls like this are unexpected, so I will be brief. We buy houses in the area as-is.\nSeller: I get ten of these calls a week.\nRep: I understand. Most are probably generic. I wanted to ask if you had any plans for the property this year.\nSeller: Not really.\nRep: Is it occupied or vacant?\nSeller: Occupied.\nRep: Would you consider an offer if it was easy?\nSeller: Depends on the number.\nRep: We usually buy below retail because we handle repairs and closing costs. If I could be around 180, would that interest you?\nSeller: No. You have not even seen it.\nRep: You are right. I jumped too fast. Before any number, I should understand condition and why you would sell. Is there any reason you would even consider moving it?\nSeller: Maybe if the tenant leaves. Not now.\nRep: Fair. Can I check back in 60 days instead of bothering you today?\nSeller: Text me then.\nRep: Will do. Thanks Patrice.'),
    jsonb_build_object('id','demo-call-8','rep','demo-u-2','contact','demo-c-8','dur',708,'score',82,'grade','B+','seller_type','pre-foreclosure','call_type','follow-up','seller_talk',64,'rep_talk',36,'dir','inbound','offset_hours',66,'transcript',E'Seller: Jada, I got the reinstatement letter.\nRep: Victor, good. What number did they give you?\nSeller: Forty-two thousand by the 18th. I do not have it.\nRep: That is a tight timeline. What happens if nothing changes before then?\nSeller: I lose the house and still have nowhere to go.\nRep: Then the goal is not just an offer; it is a plan that protects your move. What do you need cash-wise after payoff to land safely?\nSeller: At least twenty grand.\nRep: Okay. Payoff plus move money. If we can close before the 18th and leave you with that cushion, are you ready to sign this week?\nSeller: If the number works, yes.\nRep: I can commit to speed, but I need one walkthrough and payoff statement.\nSeller: The house needs work.\nRep: That is okay. We buy it as-is. The only question is whether the numbers solve the deadline.\nSeller: I appreciate you saying that directly.\nRep: Let us set inspection tomorrow at 9:30, then I will give you a written offer by noon. If it works, escrow starts same day.\nSeller: Tomorrow works.'),
    jsonb_build_object('id','demo-call-9','rep','demo-u-3','contact','demo-c-9','dur',388,'score',54,'grade','C','seller_type','cold-unknown','call_type','first-contact','seller_talk',35,'rep_talk',65,'dir','outbound','offset_hours',10,'transcript',E'Rep: Monica, Tyler Knox calling about your house on Cedar. Are you interested in selling?\nSeller: Not really. Who is this?\nRep: I work with a local buying group. We can pay cash and close fast.\nSeller: I did not ask for an offer.\nRep: Sure, but if the price was right would you consider it?\nSeller: Everyone says that.\nRep: What number would get your attention?\nSeller: I do not know because I am not planning to sell.\nRep: The property looks older, so we would probably be somewhere around 150 to 160.\nSeller: That is insulting. You have not asked anything.\nRep: I understand. I am just trying to see if there is a fit.\nSeller: There is not.\nRep: Okay, sorry for bothering you.\nSeller: Bye.'),
    jsonb_build_object('id','demo-call-10','rep','demo-u-3','contact','demo-c-10','dur',492,'score',59,'grade','C','seller_type','absentee-owner','call_type','first-contact','seller_talk',42,'rep_talk',58,'dir','outbound','offset_hours',28,'transcript',E'Rep: Samuel, this is Tyler. I saw your Oak Ridge property and wanted to see if you would sell it.\nSeller: Maybe, but I live in Arizona.\nRep: Perfect, we help out-of-state owners. Is the house vacant?\nSeller: My nephew stays there sometimes.\nRep: Okay. We can buy it cash. What were you hoping to get?\nSeller: I have not thought about a number.\nRep: Zillow says around 240, so we might be around 180 depending on repairs.\nSeller: That seems low.\nRep: We pay closing costs and buy as-is.\nSeller: I get that, but you have not asked why I would sell.\nRep: Fair point. What has owning it from Arizona been like?\nSeller: Annoying. Taxes, insurance, family asking to use it.\nRep: That makes sense. If I send you a range and we do a video walkthrough, would you consider it?\nSeller: Maybe. Send details.\nRep: I will text you.'),
    jsonb_build_object('id','demo-call-11','rep','demo-u-3','contact','demo-c-11','dur',641,'score',66,'grade','B-','seller_type','divorce','call_type','follow-up','seller_talk',50,'rep_talk',50,'dir','inbound','offset_hours',46,'transcript',E'Seller: Tyler, I need this house sold but I cannot take a stupid offer.\nRep: Denise, I understand. What number are you hoping for?\nSeller: Two hundred even.\nRep: Okay. If we got close to that, when would you want to close?\nSeller: Yesterday. My ex is dragging everything out.\nRep: That sounds frustrating. Is there a court date or deadline?\nSeller: End of the month.\nRep: So speed matters. The house needs the HVAC replaced, right?\nSeller: Yes, and flooring.\nRep: With those repairs, I am probably around 172.\nSeller: That is too low.\nRep: I hear you. Maybe I can ask my partner to improve it.\nSeller: That does not help me.\nRep: You are right. Let me get specific: if I can show the net, no commissions, and close before court, would you compare that against listing?\nSeller: I will look at it.\nRep: I will send it today and call at 3 tomorrow.\nSeller: Fine.'),
    jsonb_build_object('id','demo-call-12','rep','demo-u-3','contact','demo-c-12','dur',525,'score',61,'grade','C+','seller_type','tired-landlord','call_type','first-contact','seller_talk',44,'rep_talk',56,'dir','outbound','offset_hours',70,'transcript',E'Rep: Howard, Tyler here. I heard you might be open to selling your rental on 9th.\nSeller: Who told you that?\nRep: It came through a property list. If it is wrong, no problem.\nSeller: I am tired of tenants, but I am not giving it away.\nRep: Of course. What are the tenants paying?\nSeller: Why does that matter?\nRep: It helps value it as a rental.\nSeller: They pay below market, but they have been there forever.\nRep: Got it. Would you sell with tenants in place?\nSeller: Maybe if it was easy.\nRep: We can do easy. I could probably make a cash offer after a walkthrough.\nSeller: You sound like everyone else.\nRep: Fair. What would make this conversation actually useful for you?\nSeller: Tell me whether I can sell without kicking them out.\nRep: Yes, you can. We can buy occupied, honor the lease, and handle communication after closing.\nSeller: Send me something in writing.\nRep: I will send it and follow up Friday.'),
    jsonb_build_object('id','demo-call-13','rep','demo-u-4','contact','demo-c-13','dur',736,'score',84,'grade','B+','seller_type','inheritance','call_type','follow-up','seller_talk',62,'rep_talk',38,'dir','outbound','offset_hours',14,'transcript',E'Rep: Janet, Sofia here. Last week you were waiting on the contractor estimate. Did that come back?\nSeller: Yes, and it was worse than I expected. Almost forty thousand.\nRep: That is a big number. How did that change the family conversation?\nSeller: My cousins do not want to put money into the house anymore.\nRep: So the decision shifted from “fix then list” to “what is the cleanest as-is exit.”\nSeller: Exactly.\nRep: What would make the as-is route feel fair to everyone?\nSeller: A clear explanation. They are worried we are leaving money behind.\nRep: Then I will not just send an offer. I will send a side-by-side: retail minus repairs, commissions, utilities, and time compared with our net.\nSeller: That would help.\nRep: Any liens, taxes, or probate items still open?\nSeller: Taxes are current. Probate paperwork is done.\nRep: Great. If the side-by-side makes sense, are you ready to pick a closing date this month?\nSeller: I think so.\nRep: I will send it by 3 today and call you and your cousin tomorrow at noon.\nSeller: Thank you. That is organized.'),
    jsonb_build_object('id','demo-call-14','rep','demo-u-4','contact','demo-c-14','dur',867,'score',88,'grade','B+','seller_type','pre-foreclosure','call_type','offer-presentation','seller_talk',68,'rep_talk',32,'dir','inbound','offset_hours',32,'transcript',E'Seller: Sofia, I talked with my wife. We need certainty more than squeezing every dollar.\nRep: Leon, that clarity helps. Let us make sure the offer solves the full problem. The reinstatement, moving costs, and a date before the bank deadline are the three pieces, right?\nSeller: Yes. And we cannot have people walking through every day.\nRep: Understood. Our offer is 248,000 as-is. We cover closing costs, no repairs, no showings, and we close on the 12th. Based on the payoff you sent, that leaves roughly 24,000 after everything.\nSeller: That is lower than my neighbor said it was worth.\nRep: Your neighbor may be right for a listed, repaired home. The difference here is certainty before the deadline. If you listed and it took 45 days, the bank timeline becomes the risk.\nSeller: That is what scares me.\nRep: Then judge this by net certainty, not headline price. Does the 24,000 cushion get you moved and current?\nSeller: Yes, it does.\nRep: Then the next step is signing the purchase agreement today and opening escrow. I can stay on the phone while you review the first page.\nSeller: Send it. I am ready to look.'),
    jsonb_build_object('id','demo-call-15','rep','demo-u-4','contact','demo-c-15','dur',697,'score',80,'grade','B','seller_type','absentee-owner','call_type','first-contact','seller_talk',60,'rep_talk',40,'dir','outbound','offset_hours',58,'transcript',E'Rep: Amelia, this is Sofia Miles. You own the Birch Lane home but your mailing address is in Nevada. Did I get that right?\nSeller: Yes. I have not been back in years.\nRep: That is exactly why I called. A lot of out-of-state owners reach a point where the property becomes paperwork instead of an asset. Is that true for you?\nSeller: Pretty much. My aunt checks on it, but I pay everything.\nRep: What would need to happen for selling to make sense?\nSeller: I need a fair price and I do not want to fly in.\nRep: Remote closing is easy. The fair price depends on condition. What do you know about repairs?\nSeller: Old plumbing, older roof, and the yard is overgrown.\nRep: If we handle that as-is and coordinate with your aunt, would speed or final net be more important?\nSeller: Final net, but I do not want months of it.\nRep: Then let us not guess. Can your aunt do a video walkthrough Wednesday? I will give you a written offer and a retail net comparison by Thursday.\nSeller: Wednesday afternoon works.\nRep: Perfect. I will send the checklist now.'),
    jsonb_build_object('id','demo-call-16','rep','demo-u-4','contact','demo-c-16','dur',603,'score',77,'grade','B','seller_type','tired-landlord','call_type','follow-up','seller_talk',57,'rep_talk',43,'dir','inbound','offset_hours',82,'transcript',E'Seller: Sofia, I looked at your number. It is not bad, but I wanted closer to 300.\nRep: Carl, I appreciate you reviewing it. Help me understand the 300 target. Is that based on what you need to walk away with, or what similar houses sold for?\nSeller: Mostly similar houses.\nRep: Were those vacant retail sales or tenant-occupied rentals?\nSeller: Vacant, I think.\nRep: That is the key difference. Yours has tenants, deferred maintenance, and we are taking over without you doing make-ready.\nSeller: True, but the tenants are stable.\nRep: Stability helps. If I can improve the price a bit and keep the tenant transition off your plate, would you be ready to move forward?\nSeller: Maybe. What is “a bit”?\nRep: I can request 286 with closing costs covered. Before I do, is there any other term that matters more than price?\nSeller: I need the deposit non-refundable quickly.\nRep: Good ask. I can structure a non-refundable deposit after inspection within five days. If I send 286 with that term, can we sign tomorrow?\nSeller: Send it and I will review it tonight.\nRep: Done. I will send the revision and call tomorrow at 9.' )
  );
BEGIN
  PERFORM public.unseed_demo_data(_account_id);

  INSERT INTO public.ghl_users (account_id, ghl_user_id, name, email, role, raw_data)
  SELECT _account_id, x->>'id', x->>'name', x->>'email', x->>'role', jsonb_build_object('demo', true, 'source', 'gold-seed')
  FROM jsonb_array_elements(_users_data) AS x;

  INSERT INTO public.ghl_contacts (account_id, ghl_contact_id, name, email, phone, assigned_user_id, raw_data)
  SELECT _account_id, x->>'id', x->>'name', x->>'email', x->>'phone', x->>'rep', jsonb_build_object('demo', true, 'source', 'gold-seed')
  FROM jsonb_array_elements(_contacts_data) AS x;

  INSERT INTO public.billing_settings (account_id, auto_recharge_enabled, threshold_cents, topup_amount_cents, min_call_seconds_for_ai, markup_multiplier)
  VALUES (_account_id, true, 1500, 10000, 180, 2.0)
  ON CONFLICT (account_id) DO UPDATE SET
    auto_recharge_enabled = EXCLUDED.auto_recharge_enabled,
    threshold_cents = EXCLUDED.threshold_cents,
    topup_amount_cents = EXCLUDED.topup_amount_cents,
    min_call_seconds_for_ai = EXCLUDED.min_call_seconds_for_ai,
    markup_multiplier = EXCLUDED.markup_multiplier,
    updated_at = now();

  INSERT INTO public.wallets (account_id, balance_cents)
  VALUES (_account_id, 5000)
  ON CONFLICT (account_id) DO UPDATE SET balance_cents = wallets.balance_cents + 5000, updated_at = now();

  INSERT INTO public.wallet_transactions (account_id, type, amount_cents, balance_after_cents, reason, metadata)
  VALUES (_account_id, 'credit', 5000, (SELECT balance_cents FROM public.wallets WHERE account_id = _account_id), 'Demo starter wallet credit', jsonb_build_object('demo', true, 'demo_seed', 'closer-control-gold'));

  FOR _call IN
    SELECT
      x,
      x->>'id' AS id,
      x->>'rep' AS rep,
      x->>'contact' AS contact,
      (x->>'dur')::int AS dur,
      (x->>'score')::int AS score,
      x->>'grade' AS grade,
      x->>'seller_type' AS seller_type,
      x->>'call_type' AS call_type,
      (x->>'seller_talk')::int AS seller_talk,
      (x->>'rep_talk')::int AS rep_talk,
      x->>'dir' AS dir,
      (x->>'offset_hours')::int AS offset_hours,
      x->>'transcript' AS transcript,
      ROW_NUMBER() OVER () AS rn
    FROM jsonb_array_elements(_calls_data) AS x
  LOOP
    INSERT INTO public.call_scores (
      account_id, rep_ghl_user_id, rep_name, seller_name, seller_type, call_type,
      overall_score, grade, verdict, transcript, duration,
      seller_talk_ratio, rep_talk_ratio, category_scores, moments, strengths,
      scored_at, created_at, updated_at
    )
    SELECT
      _account_id,
      _call.rep,
      (SELECT u->>'name' FROM jsonb_array_elements(_users_data) u WHERE u->>'id' = _call.rep),
      (SELECT c->>'name' FROM jsonb_array_elements(_contacts_data) c WHERE c->>'id' = _call.contact),
      _call.seller_type,
      _call.call_type,
      _call.score,
      _call.grade,
      CASE
        WHEN _call.score >= 85 THEN 'High-quality demo call: strong discovery, clear seller motivation, and a confident next step. Useful for showing what good looks like.'
        WHEN _call.score >= 75 THEN 'Solid call with coachable gaps. Discovery is usable, but one or two categories need tighter execution before the close.'
        WHEN _call.score >= 65 THEN 'Mixed call. The rep found some context but missed depth in motivation, money, objections, or next-step control.'
        ELSE 'Coachable low-score call. The rep moved too fast, controlled too much of the talk time, and left major seller signals unexplored.'
      END,
      _call.transcript,
      (_call.dur/60)::text || 'm ' || LPAD((_call.dur%60)::text, 2, '0') || 's',
      _call.seller_talk,
      _call.rep_talk,
      jsonb_build_array(
        jsonb_build_object('name','Introduction and Positioning','score',GREATEST(3,LEAST(10,ROUND((_call.score + 6)/10.0)::int)),'status',CASE WHEN _call.score >= 78 THEN 'strong' WHEN _call.score >= 62 THEN 'ok' ELSE 'weak' END,'oneliner',CASE WHEN _call.score >= 78 THEN 'Clear opener with context, credibility, and a calm reason for the call.' ELSE 'The opener landed, but it needed stronger permission and local credibility.' END),
        jsonb_build_object('name','Rapport Building','score',GREATEST(3,LEAST(10,ROUND((_call.score + 2)/10.0)::int)),'status',CASE WHEN _call.score >= 82 THEN 'strong' WHEN _call.score >= 64 THEN 'ok' ELSE 'weak' END,'oneliner',CASE WHEN _call.score >= 80 THEN 'Rep acknowledged the seller’s emotional or operational pressure before pitching.' ELSE 'Rapport was present but too thin before moving into transaction questions.' END),
        jsonb_build_object('name','Motivation Discovery','score',GREATEST(2,LEAST(10,ROUND((_call.score - 6)/10.0)::int)),'status',CASE WHEN _call.score >= 86 THEN 'strong' WHEN _call.score >= 70 THEN 'ok' WHEN _call.score >= 58 THEN 'weak' ELSE 'critical' END,'oneliner',CASE WHEN _call.score >= 80 THEN 'The rep uncovered why selling now matters and connected the offer to that pain.' ELSE 'Motivation was only partially explored; the rep needed more “why now” follow-up.' END),
        jsonb_build_object('name','Timeline Discovery','score',GREATEST(3,LEAST(10,ROUND((_call.score + 0)/10.0)::int)),'status',CASE WHEN _call.score >= 80 THEN 'strong' WHEN _call.score >= 62 THEN 'ok' ELSE 'weak' END,'oneliner','Timeline was addressed with enough clarity to guide the next step.'),
        jsonb_build_object('name','Financial Discovery','score',GREATEST(2,LEAST(10,ROUND((_call.score - 12)/10.0)::int)),'status',CASE WHEN _call.score >= 88 THEN 'strong' WHEN _call.score >= 74 THEN 'ok' WHEN _call.score >= 62 THEN 'weak' ELSE 'critical' END,'oneliner',CASE WHEN _call.score >= 82 THEN 'Rep tied the conversation to payoff, net, repair cost, or move-money requirements.' ELSE 'Financial pain and net requirement needed deeper probing before discussing price.' END),
        jsonb_build_object('name','Offer Presentation','score',GREATEST(3,LEAST(10,ROUND((_call.score - 2)/10.0)::int)),'status',CASE WHEN _call.score >= 84 THEN 'strong' WHEN _call.score >= 66 THEN 'ok' ELSE 'weak' END,'oneliner','Offer was framed around as-is certainty, speed, and seller-specific tradeoffs.'),
        jsonb_build_object('name','Objection Handling','score',GREATEST(2,LEAST(10,ROUND((_call.score - 5)/10.0)::int)),'status',CASE WHEN _call.score >= 84 THEN 'strong' WHEN _call.score >= 68 THEN 'ok' WHEN _call.score >= 56 THEN 'weak' ELSE 'critical' END,'oneliner',CASE WHEN _call.score >= 78 THEN 'Rep validated resistance and advanced the conversation instead of debating.' ELSE 'The objection response needed more validation and a sharper next question.' END),
        jsonb_build_object('name','First No Recovery','score',GREATEST(2,LEAST(10,ROUND((_call.score - 9)/10.0)::int)),'status',CASE WHEN _call.score >= 88 THEN 'strong' WHEN _call.score >= 72 THEN 'ok' WHEN _call.score >= 60 THEN 'weak' ELSE 'critical' END,'oneliner',CASE WHEN _call.score >= 78 THEN 'The rep recovered from hesitation by reframing around the seller’s desired outcome.' ELSE 'The first “no” was accepted too quickly or handled without enough curiosity.' END),
        jsonb_build_object('name','Next Step Close','score',GREATEST(3,LEAST(10,ROUND((_call.score + 1)/10.0)::int)),'status',CASE WHEN _call.score >= 78 THEN 'strong' WHEN _call.score >= 62 THEN 'ok' ELSE 'weak' END,'oneliner',CASE WHEN _call.score >= 76 THEN 'Clear next step with a specific time, owner, and outcome.' ELSE 'Next step was too loose; rep needed an exact calendar commitment.' END)
      ),
      jsonb_build_array(
        jsonb_build_object('category','Motivation Discovery','status',CASE WHEN _call.score >= 78 THEN 'strong' ELSE 'weak' END,'what','The seller revealed the real pressure point behind the conversation, but the rep needed to decide whether to go deeper or move forward.','why','Demo viewers can see whether the rep connected the offer to the seller’s actual pain instead of only asking surface-level property questions.','rewrite',CASE WHEN _call.score >= 78 THEN '“It sounds like the real win is removing the burden, not just getting a number. What happens if this is still unresolved 60 days from now?”' ELSE '“Before we talk price, help me understand what changed recently that makes selling worth considering now.”' END),
        jsonb_build_object('category','Financial Discovery','status',CASE WHEN _call.score >= 82 THEN 'strong' ELSE 'weak' END,'what','Money, payoff, repairs, rent, or net proceeds came up as a decision driver.','why','Without a financial target, the rep cannot explain why a cash offer is useful or defend a lower as-is number.','rewrite','“What do you need to walk away with after payoff, repairs, commissions, and moving costs for this to actually solve the problem?”'),
        jsonb_build_object('category','Objection Handling','status',CASE WHEN _call.score >= 80 THEN 'strong' ELSE 'weak' END,'what','The seller pushed back on price, trust, timing, or involving another decision maker.','why','This is where reps either create confidence or sound like every other investor. The best response validates first, then advances the process.','rewrite','“That makes sense. Rather than asking you to take my word for it, let me show the net side-by-side and we can decide from real numbers.”'),
        jsonb_build_object('category','Next Step Close','status',CASE WHEN _call.score >= 74 THEN 'strong' ELSE 'weak' END,'what','The rep attempted to secure the next action at the end of the call.','why','A demo call should show pipeline control. A vague “I’ll follow up” makes the deal easy to lose.','rewrite','“Let’s put a real time on it: tomorrow at 4:30 I’ll call with the written offer and net sheet. Does that time work?”')
      ),
      CASE
        WHEN _call.score >= 85 THEN jsonb_build_array('Seller-centered discovery','Financial framing','Specific calendar close')
        WHEN _call.score >= 75 THEN jsonb_build_array('Calm tone','Good timeline control','Useful as-is framing')
        WHEN _call.score >= 65 THEN jsonb_build_array('Maintained conversation','Found partial motivation','Recovered at least one objection')
        ELSE jsonb_build_array('Started the conversation','Identified property interest','Created a coaching opportunity')
      END,
      _now - (_call.offset_hours * interval '1 hour'),
      _now - (_call.offset_hours * interval '1 hour'),
      _now - (_call.offset_hours * interval '1 hour')
    RETURNING id INTO _score_id;

    INSERT INTO public.ghl_conversations (
      account_id, ghl_conversation_id, contact_id, assigned_user_id,
      last_message_body, last_message_type, last_message_date, type, raw_data
    ) VALUES (
      _account_id, _call.id || '-conv', _call.contact, _call.rep,
      'Demo call recording scored by ACQ Coach', 'TYPE_CALL', _now - (_call.offset_hours * interval '1 hour'), 'TYPE_CALL',
      jsonb_build_object('demo', true, 'demo_seed', 'closer-control-gold')
    );

    INSERT INTO public.ghl_calls (
      account_id, ghl_message_id, conversation_id, contact_id, assigned_user_id,
      direction, call_status, call_duration, transcript, body, status, call_date, score_id, raw_data
    ) VALUES (
      _account_id, _call.id || '-msg', _call.id || '-conv', _call.contact, _call.rep,
      _call.dir, 'completed', _call.dur, _call.transcript, 'Demo call recording', 'scored',
      _now - (_call.offset_hours * interval '1 hour'), _score_id,
      jsonb_build_object('demo', true, 'demo_seed', 'closer-control-gold')
    ) RETURNING id INTO _call_id;

    INSERT INTO public.ghl_messages (
      account_id, ghl_message_id, conversation_id, contact_id, user_id,
      message_type, direction, status, body, call_duration, call_status,
      transcript, message_date, raw_data
    ) VALUES (
      _account_id, _call.id || '-msg', _call.id || '-conv', _call.contact, _call.rep,
      'TYPE_CALL', _call.dir, 'completed', 'Demo call recording', _call.dur, 'completed',
      _call.transcript, _now - (_call.offset_hours * interval '1 hour'),
      jsonb_build_object('demo', true, 'demo_seed', 'closer-control-gold')
    );

    INSERT INTO public.usage_events (
      account_id, provider, operation, model, status,
      audio_seconds, tokens_in, tokens_out, provider_cost_cents, billed_cents,
      effective_seconds, markup_multiplier, call_id, ghl_message_id, metadata, created_at
    ) VALUES
    (
      _account_id, 'openai', 'transcribe', 'whisper-1', 'success',
      _call.dur, 0, 0, ROUND((_call.dur / 60.0) * 0.6, 4), GREATEST(1, ROUND((_call.dur / 60.0) * 0.6 * 2)::int),
      _call.dur, 2.0, _call_id, _call.id || '-msg', jsonb_build_object('demo', true, 'demo_seed', 'closer-control-gold'), _now - (_call.offset_hours * interval '1 hour')
    ),
    (
      _account_id, 'openai', 'score', 'gpt-5.4-mini', 'success',
      0, 2400 + (_call.rn * 37), 950 + (_call.rn * 21), 0.42 + (_call.rn * 0.02), 1,
      NULL, 2.0, _call_id, _call.id || '-msg', jsonb_build_object('demo', true, 'demo_seed', 'closer-control-gold'), _now - (_call.offset_hours * interval '1 hour')
    );
  END LOOP;

  INSERT INTO public.sync_runs (account_id, trigger, status, conversations_scanned, conversations_saved, messages_saved, call_messages_found, duration_ms, cursor_before_ms, cursor_after_ms, started_at, finished_at)
  VALUES
    (_account_id, 'demo-seed', 'success', 48, 16, 16, 16, 18420, 0, EXTRACT(EPOCH FROM _now)::bigint * 1000, _now - interval '90 minutes', _now - interval '89 minutes'),
    (_account_id, 'demo-seed', 'success', 22, 4, 4, 4, 7110, EXTRACT(EPOCH FROM (_now - interval '1 day'))::bigint * 1000, EXTRACT(EPOCH FROM _now)::bigint * 1000, _now - interval '1 day', _now - interval '1 day' + interval '2 minutes');

  INSERT INTO public.sync_state (account_id, cursor_ms, last_run_at, last_status, updated_at)
  VALUES (_account_id, EXTRACT(EPOCH FROM _now)::bigint * 1000, _now - interval '89 minutes', 'success', _now)
  ON CONFLICT (account_id) DO UPDATE SET
    cursor_ms = EXCLUDED.cursor_ms,
    last_run_at = EXCLUDED.last_run_at,
    last_status = EXCLUDED.last_status,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('ok', true, 'seeded', true, 'reps', 4, 'contacts', 16, 'calls', 16, 'scorecards', 16);
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_demo_data(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.unseed_demo_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unseed_demo_data(uuid) TO service_role;