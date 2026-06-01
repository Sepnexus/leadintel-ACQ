import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import closerControlLogo from "@/assets/closer-control-logo.png";
import { FullLeaderboard } from "./FullLeaderboard";
import { RepDrillDown } from "./RepDrillDown";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// AI calls, voice transcription, and seller responses go through backend functions.

const AI_CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;
const AI_CHAT_HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "apikey": SUPABASE_KEY,
};

async function backendTTS(text){
  const res=await fetch(`${SUPABASE_URL}/functions/v1/ai-tts`,{
    method:"POST",headers:AI_CHAT_HEADERS,body:JSON.stringify({text,voice:"onyx"})
  });
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||"TTS failed");}
  return await res.blob();
}

// ── BRAND CONSTANTS ───────────────────────────────────────────────────────────
// ── THEME SYSTEM ─────────────────────────────────────────────────────────────
const THEMES={
  dark:{BG:"#000000",S1:"#0d0d0d",S2:"#141414",B1:"#1c1c1c",B2:"#222222",B3:"#2a2a2a",TEXT:"#f4f4f4",T2:"#999999",T3:"#777777",GREEN:"#4e7d3d",DKGREEN:"#2f721a",RED:"#c0392b",AMBER:"#b7860b"},
  light:{BG:"#f5f7f5",S1:"#ffffff",S2:"#f0f4f0",B1:"#dde8dd",B2:"#c8d8c8",B3:"#b8ccb8",TEXT:"#1a2e1a",T2:"#4a6b4a",T3:"#7a9b7a",GREEN:"#2e7d32",DKGREEN:"#1b5e20",RED:"#c62828",AMBER:"#e65100"},
};
let BG="#000000",S1="#0d0d0d",S2="#141414";
let B1="#1c1c1c",B2="#222222",B3="#2a2a2a";
let TEXT="#f4f4f4",T2="#999999",T3="#777777";
let GREEN="#4e7d3d",DKGREEN="#2f721a";
let RED="#c0392b",AMBER="#b7860b";
function applyTheme(name){
  const c=THEMES[name]||THEMES.dark;
  ({BG,S1,S2,B1,B2,B3,TEXT,T2,T3,GREEN,DKGREEN,RED,AMBER}=c);
  try{localStorage.setItem("acqcoach_theme",name);}catch(e){}
  if(typeof document!=="undefined")document.body.style.background=c.BG;
}
applyTheme(typeof localStorage!=="undefined"?localStorage.getItem("acqcoach_theme")||"dark":"dark");

// ── ROLEPLAY DATA ─────────────────────────────────────────────────────────────
const SELLER_SCENARIOS={
  probate:{
    label:"Probate Seller",
    desc:"Dealing with a recently inherited property. Emotional, cautious, siblings involved.",
    backstory:"Your mother passed away 6 weeks ago, leaving you the family home you grew up in. You're still grieving and haven't had time to sort through her belongings. Your two siblings live out of state and keep calling asking what you plan to do.",
    motivation:"You can't afford the property taxes and upkeep on top of your own mortgage, but you feel deeply guilty about selling the family home.",
    objections:["My siblings need to agree before I can do anything","We'd rather list with a real estate agent and get full market value","No number feels like enough — this house means too much to our family"],
    price_anchor:"$380,000 based on what a neighbor's house sold for last year",
    personality:"emotional",
    opening:"Hello? Who is this calling?",
  },
  "pre-foreclosure":{
    label:"Pre-Foreclosure",
    desc:"3 months behind on payments. Stressed and defensive, doesn't want to admit the situation.",
    backstory:"You're 3 months behind on your mortgage after losing your job at the auto plant in February. Your spouse doesn't fully know how bad it is. You received a notice of default last week.",
    motivation:"You need to sell before the bank forecloses — foreclosure would destroy your credit and you'd walk away with nothing. But you're too proud to admit you're in trouble.",
    objections:["I'm not in foreclosure, I'm just behind a couple payments","How did you even know to call me?","I can catch up once I land another job — I don't need to sell"],
    price_anchor:"$285,000 based on what you owe plus what you think you deserve for your equity",
    personality:"defensive",
    opening:"Yeah... I'm not really looking to sell right now.",
  },
  "tired-landlord":{
    label:"Tired Landlord",
    desc:"Has 3 rentals, done with tenants and maintenance. Open but very price-sensitive.",
    backstory:"You've owned three rental properties for 18 years. Your last tenant at this property trashed the place and left in the middle of the night 2 months ago. You're 61 years old and ready to exit the landlord business entirely.",
    motivation:"You want to cash out before dealing with another nightmare tenant. You're done with 2am maintenance calls, repairs, and property management headaches.",
    objections:["I'm not going to give it away — I know exactly what it's worth","Three other wholesalers called me this week with low numbers","Can't you do better if I'm saving you the agent commission?"],
    price_anchor:"$245,000 based on what you think the rent would support as a valuation",
    personality:"analytical",
    opening:"I've been thinking about it but I don't want to get lowballed.",
  },
  divorce:{
    label:"Divorce Seller",
    desc:"Going through a messy split. Wants a quick, clean exit from the property.",
    backstory:"You and your spouse of 14 years are separating. The divorce is contentious — attorneys are involved and custody is being disputed. The house is the biggest shared asset and your attorney says it must be sold before the court date.",
    motivation:"Your attorney gave you a 6-week deadline to liquidate the property or a judge will decide for you. You just want this done so you can move forward with your life.",
    objections:["My spouse has to agree to any sale — I can't decide alone","Our attorney said we should list with a real estate agent","I need to net enough to cover what we owe plus my legal fees"],
    price_anchor:"$320,000 — what you and your spouse agreed it's worth in mediation",
    personality:"motivated",
    opening:"I just need this handled fast. My attorney keeps pushing me.",
  },
  "absentee-owner":{
    label:"Absentee Owner",
    desc:"Owns property out of state, hasn't seen it in years. Wants cash and simplicity.",
    backstory:"You bought this property as an investment 9 years ago while living across the country. You had a property manager until last year but it's been sitting vacant since the last tenant left. You haven't physically seen it in over 4 years.",
    motivation:"The vacant property is costing you $800 per month in taxes, HOA, and insurance with zero income. You want the cash to invest in something closer to home.",
    objections:["What's your actual number before we waste each other's time?","I had it appraised at $310,000 two years ago","I'd rather just list it on the MLS and see what the market gives me"],
    price_anchor:"$295,000 based on a 2-year-old appraisal you only vaguely remember",
    personality:"analytical",
    opening:"I got your postcard. What are you actually offering?",
  },
  cold:{
    label:"Cold Call",
    desc:"No prior context. Slightly annoyed to receive the call. Needs a strong opener.",
    backstory:"You've owned your home for 23 years and have been getting investor postcards and calls for months. You're irritated by them. You haven't seriously considered selling and aren't sure you even want to.",
    motivation:"No real motivation — you might consider selling only if the number is life-changing, but you have nowhere to go and no financial pressure to act.",
    objections:["I never said I was interested in selling","How did you get this number?","Every investor that calls offers way below market — why are you any different?"],
    price_anchor:"$450,000 based on a Zillow estimate you saw without understanding ARV",
    personality:"defensive",
    opening:"How did you get this number?",
  },
  multiple_heirs:{
    label:"Multiple Heirs",
    desc:"Inherited property with 3 siblings who all need to agree. One wants to sell, two are hesitant.",
    backstory:"Your father passed away 4 months ago leaving the house equally to you and your two siblings. You want to sell and move on. Your brother thinks you should fix it up first, your sister wants to keep it as a rental. Every family call turns into an argument.",
    motivation:"You need your share of the cash — you have credit card debt and you're tired of the family conflict dragging on. A clean sale would end the dispute.",
    objections:["I'd sell today but I need my brother and sister to agree — they're not on the same page","My brother thinks we should renovate first and list with an agent","My sister keeps saying she wants to rent it out and I can't change her mind alone"],
    price_anchor:"$265,000 based on what an agent told you it would list for after repairs",
    personality:"motivated",
    opening:"Well I want to sell but my brother and sister aren't sure yet.",
  },
  hoarder_house:{
    label:"Hoarder House",
    desc:"Severely cluttered property. Seller is embarrassed about condition, defensive about value.",
    backstory:"You've lived in this house for 31 years and have always had trouble letting things go. The condition has gotten out of hand — there are narrow paths between rooms, the garage is completely inaccessible, and the kitchen hasn't been functional in years. You know it's bad.",
    motivation:"Your daughter has been pushing you to move to a smaller place. The house needs to sell but you're terrified investors will laugh at the condition and offer you almost nothing.",
    objections:["I know it has some issues but the land and location alone are worth a lot","I don't want anyone walking through until I've had a chance to clean up a bit","An agent told me it would be worth $320,000 once it's cleaned out"],
    price_anchor:"$300,000 based on what you believe it's worth ignoring the current condition",
    personality:"defensive",
    opening:"I have to warn you, the house needs some work.",
  },
  agent_involved:{
    label:"Agent Already Listed",
    desc:"Seller already has an agent but listing is expiring. Curious but feels loyal.",
    backstory:"You listed your house 5 months ago with an agent from your church. The listing has had two price drops, zero offers, and expires in 3 weeks. You feel guilty even talking to a wholesaler because of your personal relationship with her.",
    motivation:"You accepted a job offer in another city and start in 6 weeks. You can't financially carry two properties while also paying rent somewhere new.",
    objections:["I feel bad going around my agent — she's put a lot of work in","If you can get anywhere close to my listing price I'd consider it","My agent says we just need to be patient and the right buyer will come"],
    price_anchor:"$335,000 — your current listing price, already reduced twice from $365,000",
    personality:"emotional",
    opening:"I already have an agent but my listing expires next month.",
  },
  testing_market:{
    label:"Testing the Market",
    desc:"Not motivated, just curious what they could get. No urgency whatsoever.",
    backstory:"You own a paid-off rental property that's been cash-flowing fine for years. Your tenant just renewed for another year. You've been reading about the real estate market and idly wondered what your property might fetch today.",
    motivation:"Pure curiosity — you'd need a number significantly above your expectation to even consider disrupting your passive income. There is no deadline and no pressure.",
    objections:["I'm really not in a rush at all, I'm just seeing what's out there","My tenant just signed a new lease — I can't just kick them out","I don't think wholesalers can get me what the open market would"],
    price_anchor:"$410,000 — well above market, based on wishful thinking and Zillow",
    personality:"analytical",
    opening:"I'm not in a rush at all, just seeing what's out there.",
  },
};

function buildSellerSys(scenario,difficulty,seedMoment=null){
  const diffMod=difficulty==="easy"
    ?"You can be moved without much resistance. When the rep genuinely acknowledges your concern, soften and move forward. Be willing to engage on the offer once you feel heard."
    :difficulty==="hard"
    ?"You are very resistant and skeptical. Hold your position firmly. Only soften meaningfully after the rep has addressed at least two of your concerns with real substance — not just smooth talk. Attempt to end the call once if the conversation stalls."
    :"You are moderately resistant. You need real answers before softening, but you are not impossible. Genuine empathy and practical responses will move you.";
  const numberedObjns=scenario.objections.map((o,i)=>`${i+1}. ${o}`).join("\n");
  const seed=seedMoment
    ?`\n\nSPECIAL FOCUS: The rep needs to practice "${seedMoment.category}". Challenge: ${seedMoment.challenge}. Context: ${seedMoment.context}. Steer the conversation to test this specific skill.`
    :"";
  return `You are roleplaying as a real seller on a wholesaler outreach call.

CHARACTER: ${scenario.label}
BACKGROUND: ${scenario.backstory}
MOTIVATION: ${scenario.motivation}
PRICE IN YOUR HEAD: ${scenario.price_anchor}
PERSONALITY: ${scenario.personality}

YOUR OBJECTIONS — raise in rough sequence, one at a time:
${numberedObjns}

STRICT RULES:
1. Read the full conversation history before responding. React directly to what the rep just said — not what you planned to say next.
2. NEVER repeat an objection that has already been raised and addressed. Once handled (even partially), move on — raise the next objection or shift to a new concern. Looping on handled objections is not realistic behavior.
3. If the rep gives a weak or evasive answer to your current concern, press on the same point at most ONCE more — then move forward regardless.
4. CONVERSATION STAGES — use the rep turn count in the user message to determine your posture:
   - Turns 1-2: Guarded and brief. Raise objection #1.
   - Turns 3-4: Still resistant but engaging. Move to objection #2 if #1 is handled.
   - Turns 5-6: Growing curious. Move to objection #3. Begin asking what the process looks like.
   - Turns 7+: If the rep has handled your concerns well, shift to cautious interest — ask about timeline, next steps, how closing works. You are not committing, just exploring.
5. If the rep asks you a direct question, answer it (reluctantly if needed) before raising any objection.
6. Each response must advance the conversation. Never say essentially the same thing as your previous turn.

DIFFICULTY: ${diffMod}

IMPORTANT: Always end your response with either a question directed at the rep, an unresolved concern, or a statement that naturally invites a response. Never end with a closed statement that kills the conversation. You are helping the rep practice — give them something to respond to every single time.

Examples of good endings:
- '...but I'm not sure I trust cash buyers. How does this actually work?'
- '...my brother keeps saying we should just wait. What would you say to that?'
- '...I just don't know. What happens if I say no?'

Examples of bad endings (never do these):
- 'Okay, thanks for calling.' [conversation killer]
- 'I'll think about it.' [nothing to respond to]
- 'That makes sense.' [dead end]

Keep responses 2-4 sentences. Stay in character. No stage directions or narration.${seed}`;
}

const ROLEPLAY_SCORE_SYS=`You are ACQ Coach AI. Given a single rep line from a practice call, score it (0-10) and give coaching. Respond ONLY valid JSON, no markdown: {"score":0,"status":"string","feedback":"string","rewrite":"string"}`;
function personalityColor(p){return p==="emotional"?"#8b5cf6":p==="analytical"?"#3b82f6":p==="motivated"?"#4e7d3d":"#c0392b";}

function sc(s){return s==="strong"?GREEN:s==="ok"?AMBER:RED}
function timeAgo(ts){
  if(!ts)return"";
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return"just now";
  if(s<3600)return`${Math.floor(s/60)}m ago`;
  if(s<86400)return`${Math.floor(s/3600)}h ago`;
  return`${Math.floor(s/86400)}d ago`;
}
let _repNotifCounter=0;
function genRepNotifId(type){return`rn_${type}_${Date.now()}_${++_repNotifCounter}`;}

// ── DATA (duplicated to avoid touching ACQCoach.jsx) ──────────────────────────
const INIT_REPS=[
  {id:1,name:"Marcus D.",avatar:"MD",role:"Senior Acq Rep",exp:"experienced",avg:82,trend:6,week:12,total:147,flagged:false,streak:5,
   scores:[74,78,76,80,82,84,82],weak:"Next Step Close",strong:"Rapport Building",
   talks:[{r:42,s:58},{r:40,s:60},{r:38,s:62}],
   history30:[65,68,70,72,74,76,75,77,78,79,80,81,82],
   history90:[55,58,60,62,65,67,68,70,72,74,75,78,79,80,81,82]},
  {id:2,name:"Jada R.",avatar:"JR",role:"Acq Rep",exp:"developing",avg:71,trend:12,week:9,total:84,flagged:false,streak:3,
   scores:[55,59,63,67,69,71,71],weak:"Financial Discovery",strong:"Introduction",
   talks:[{r:55,s:45},{r:52,s:48},{r:48,s:52}],
   history30:[50,52,55,57,59,61,62,63,65,66,68,70,71],
   history90:[40,42,44,47,49,51,52,54,57,59,61,65,68,70,71]},
  {id:3,name:"Tyler K.",avatar:"TK",role:"Junior Acq Rep",exp:"new",avg:54,trend:-3,week:6,total:31,flagged:true,streak:0,
   scores:[58,60,57,55,52,54,54],weak:"Objection Handling",strong:"Rapport Building",
   talks:[{r:68,s:32},{r:65,s:35},{r:62,s:38}],
   history30:[55,56,57,58,59,60,58,57,56,55,54,54,54],
   history90:[45,46,47,48,50,52,54,56,57,58,59,58,57,56,55,54,54]},
  {id:4,name:"Sofia M.",avatar:"SM",role:"VA Screener",exp:"va-screener",avg:77,trend:4,week:22,total:203,flagged:false,streak:8,
   scores:[70,72,73,75,76,77,77],weak:"Offer Presentation",strong:"Motivation Discovery",
   talks:[{r:44,s:56},{r:41,s:59},{r:38,s:62}],
   history30:[65,67,68,70,71,72,73,74,75,76,77,77,77],
   history90:[55,57,59,61,62,64,65,67,68,70,71,73,75,76,77,77]},
];

const INIT_CALLS=[
  // Marcus D. (repId:1) — 8 calls
  {id:1,repId:1,date:"Today 2:14 PM",seller:"Dorothy M.",type:"Probate",score:74,grade:"C+",dur:"11m 32s",st:42,rt:58,isNew:false,
   categories:[7,8,7,6,5,7,6,5,8]},
  {id:2,repId:1,date:"Yesterday 10:08 AM",seller:"Carlos R.",type:"Pre-foreclosure",score:84,grade:"B+",dur:"9m 14s",st:62,rt:38,isNew:false,
   categories:[8,9,8,7,7,8,8,7,9]},
  {id:5,repId:1,date:"Mon 4:22 PM",seller:"Angela P.",type:"Inherited",score:79,grade:"B",dur:"10m 05s",st:58,rt:42,isNew:false,
   categories:[8,8,7,7,6,8,7,6,8]},
  {id:6,repId:1,date:"Mon 9:45 AM",seller:"Robert L.",type:"Divorce",score:88,grade:"B+",dur:"12m 18s",st:65,rt:35,isNew:false,
   categories:[9,9,8,8,8,9,8,8,9]},
  {id:7,repId:1,date:"Last Fri 2:10 PM",seller:"Maria S.",type:"Probate",score:72,grade:"C+",dur:"8m 40s",st:48,rt:52,isNew:false,
   categories:[7,7,6,7,5,7,6,5,7]},
  {id:8,repId:1,date:"Last Fri 10:00 AM",seller:"James W.",type:"Cold",score:68,grade:"B-",dur:"7m 15s",st:55,rt:45,isNew:false,
   categories:[6,7,6,6,5,6,7,5,7]},
  {id:9,repId:1,date:"Last Thu 3:30 PM",seller:"Linda T.",type:"Tax Lien",score:81,grade:"B",dur:"11m 02s",st:60,rt:40,isNew:false,
   categories:[8,8,8,7,7,8,7,7,8]},
  {id:10,repId:1,date:"Last Wed 11:15 AM",seller:"Frank B.",type:"Pre-foreclosure",score:76,grade:"B",dur:"9m 50s",st:52,rt:48,isNew:false,
   categories:[7,8,7,7,6,7,7,6,8]},

  // Jada R. (repId:2) — 9 calls
  {id:3,repId:2,date:"Today 11:30 AM",seller:"Tamara W.",type:"Inherited",score:71,grade:"C+",dur:"8m 55s",st:52,rt:48,isNew:false,
   categories:[7,7,6,6,5,7,6,5,7]},
  {id:11,repId:2,date:"Yesterday 3:45 PM",seller:"Kevin J.",type:"Probate",score:68,grade:"B-",dur:"9m 30s",st:48,rt:52,isNew:false,
   categories:[6,7,6,6,5,6,6,5,7]},
  {id:12,repId:2,date:"Yesterday 10:20 AM",seller:"Patricia D.",type:"Cold",score:65,grade:"C+",dur:"7m 10s",st:45,rt:55,isNew:false,
   categories:[6,6,5,6,5,6,6,4,7]},
  {id:13,repId:2,date:"Mon 1:00 PM",seller:"George H.",type:"Divorce",score:74,grade:"C+",dur:"10m 22s",st:55,rt:45,isNew:false,
   categories:[7,7,7,7,6,7,6,6,7]},
  {id:14,repId:2,date:"Mon 9:00 AM",seller:"Rachel F.",type:"Inherited",score:78,grade:"B",dur:"11m 05s",st:60,rt:40,isNew:false,
   categories:[8,8,7,7,6,7,7,6,8]},
  {id:15,repId:2,date:"Last Fri 4:00 PM",seller:"Steven C.",type:"Tax Lien",score:62,grade:"C+",dur:"6m 40s",st:40,rt:60,isNew:false,
   categories:[6,6,5,5,4,6,5,4,6]},
  {id:16,repId:2,date:"Last Fri 11:30 AM",seller:"Nancy E.",type:"Pre-foreclosure",score:70,grade:"C+",dur:"8m 50s",st:50,rt:50,isNew:false,
   categories:[7,7,6,6,5,7,6,5,7]},
  {id:17,repId:2,date:"Last Thu 2:15 PM",seller:"Brian A.",type:"Probate",score:75,grade:"B",dur:"9m 45s",st:58,rt:42,isNew:false,
   categories:[7,8,7,7,6,7,7,5,8]},
  {id:18,repId:2,date:"Last Wed 10:00 AM",seller:"Diane K.",type:"Cold",score:66,grade:"B-",dur:"7m 30s",st:44,rt:56,isNew:false,
   categories:[6,6,5,6,5,6,6,5,7]},

  // Tyler K. (repId:3) — 8 calls
  {id:4,repId:3,date:"Today 3:00 PM",seller:"Dave M.",type:"Cold",score:54,grade:"F",dur:"6m 20s",st:32,rt:68,isNew:false,
   categories:[5,6,4,4,3,5,4,3,5]},
  {id:19,repId:3,date:"Yesterday 2:30 PM",seller:"Susan L.",type:"Probate",score:48,grade:"D",dur:"5m 45s",st:30,rt:70,isNew:false,
   categories:[4,5,4,4,3,4,3,3,5]},
  {id:20,repId:3,date:"Yesterday 9:15 AM",seller:"Mark R.",type:"Inherited",score:58,grade:"C",dur:"7m 10s",st:38,rt:62,isNew:false,
   categories:[6,6,5,5,4,5,5,4,6]},
  {id:21,repId:3,date:"Mon 3:45 PM",seller:"Lisa G.",type:"Cold",score:52,grade:"F",dur:"5m 30s",st:28,rt:72,isNew:false,
   categories:[5,5,4,4,3,5,4,3,5]},
  {id:22,repId:3,date:"Mon 10:30 AM",seller:"Paul N.",type:"Tax Lien",score:60,grade:"C",dur:"8m 00s",st:42,rt:58,isNew:false,
   categories:[6,6,5,5,4,6,5,4,6]},
  {id:23,repId:3,date:"Last Fri 1:20 PM",seller:"Karen V.",type:"Divorce",score:50,grade:"D",dur:"6m 05s",st:35,rt:65,isNew:false,
   categories:[5,5,4,4,3,4,4,3,5]},

  // Sofia M. (repId:4) — 10 calls
  {id:24,repId:4,date:"Today 4:10 PM",seller:"Martha J.",type:"Inherited",score:78,grade:"B",dur:"9m 30s",st:58,rt:42,isNew:false,
   categories:[8,8,8,7,6,7,7,6,8]},
  {id:25,repId:4,date:"Today 1:00 PM",seller:"Henry P.",type:"Probate",score:82,grade:"B+",dur:"10m 45s",st:63,rt:37,isNew:false,
   categories:[8,8,8,8,7,7,8,7,9]},
  {id:26,repId:4,date:"Yesterday 3:20 PM",seller:"Gloria W.",type:"Cold",score:74,grade:"C+",dur:"8m 15s",st:52,rt:48,isNew:false,
   categories:[7,7,7,7,6,7,6,6,8]},
  {id:27,repId:4,date:"Yesterday 10:45 AM",seller:"Thomas B.",type:"Pre-foreclosure",score:80,grade:"B",dur:"11m 00s",st:60,rt:40,isNew:false,
   categories:[8,8,8,7,7,8,7,7,8]},
  {id:28,repId:4,date:"Mon 2:30 PM",seller:"Betty S.",type:"Tax Lien",score:76,grade:"B",dur:"9m 10s",st:55,rt:45,isNew:false,
   categories:[7,8,7,7,6,7,7,6,8]},
  {id:29,repId:4,date:"Mon 9:30 AM",seller:"Edward R.",type:"Divorce",score:72,grade:"C+",dur:"8m 40s",st:50,rt:50,isNew:false,
   categories:[7,7,7,6,5,7,6,5,7]},
  {id:30,repId:4,date:"Last Fri 3:15 PM",seller:"Alice M.",type:"Inherited",score:84,grade:"B+",dur:"12m 20s",st:64,rt:36,isNew:false,
   categories:[8,9,8,8,7,8,8,7,9]},
  {id:31,repId:4,date:"Last Fri 10:50 AM",seller:"Roy C.",type:"Cold",score:70,grade:"C+",dur:"7m 55s",st:48,rt:52,isNew:false,
   categories:[7,7,6,6,5,7,6,5,7]},
  {id:32,repId:4,date:"Last Thu 1:40 PM",seller:"Evelyn D.",type:"Probate",score:79,grade:"B",dur:"10m 30s",st:59,rt:41,isNew:false,
   categories:[8,8,7,7,6,8,7,7,8]},
  {id:33,repId:4,date:"Last Wed 11:00 AM",seller:"Oscar T.",type:"Pre-foreclosure",score:75,grade:"B",dur:"9m 25s",st:54,rt:46,isNew:false,
   categories:[7,8,7,7,6,7,7,6,7]},
];

const CATEGORIES=["Introduction and Positioning","Rapport Building","Motivation Discovery","Timeline Discovery","Financial Discovery","Offer Presentation","Objection Handling","First No Recovery","Next Step Close"];

const DRILL_PROMPTS={
  "Introduction and Positioning":{objection:"I'm not interested, who are you?",tip:"Lead with credibility — mention your company, area, and purpose in the first 10 seconds."},
  "Rapport Building":{objection:"Why should I trust you?",tip:"Mirror their tone, ask personal questions, and show empathy before business."},
  "Motivation Discovery":{objection:"We're just testing the market right now.",tip:"Dig deeper: 'What would need to change for you to move forward?'"},
  "Timeline Discovery":{objection:"Maybe in a few months. No rush.",tip:"Create urgency gently: 'What happens if this drags out longer than expected?'"},
  "Financial Discovery":{objection:"I don't want to share my financial situation.",tip:"Frame it as helping them: 'So I can make sure my offer actually helps your situation…'"},
  "Offer Presentation":{objection:"That's way too low. I was expecting more.",tip:"Anchor to their situation, not comps: 'Here's how I got there — and what it means for your net.'"},
  "Objection Handling":{objection:"I need to talk to my attorney first.",tip:"Agree and advance: 'Absolutely — would it help if I sent a summary they can review?'"},
  "First No Recovery":{objection:"No, I don't think this is going to work.",tip:"Reframe: 'Totally understand. Before we hang up — what would a good outcome look like for you?'"},
  "Next Step Close":{objection:"Just call me back whenever.",tip:"Pin it: 'How about Thursday at 2pm? I'll send a calendar invite so neither of us forgets.'"},
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function gc(s){return s>=80?GREEN:s>=65?AMBER:RED}
function grade(s){return s>=90?"A":s>=82?"B+":s>=75?"B":s>=68?"B-":s>=62?"C+":s>=55?"C":s>=48?"D":"F"}
function catStatus(s){return s>=8?"strong":s>=6?"ok":s>=4?"weak":"critical"}
function catColor(st){return st==="strong"?GREEN:st==="ok"?AMBER:RED}
function catLabel(st){return st==="strong"?"Strong":st==="ok"?"Developing":st==="weak"?"Needs Work":"Critical"}

function getRepCategoryScores(rep){
  if(rep?.categoryAverages?.length){
    return rep.categoryAverages.map(cat=>({
      name:cat.name,score:cat.score,status:cat.status||catStatus(cat.score)
    }));
  }
  // Simulate category scores based on rep's average score with variation
  const base=rep.avg;
  const seed=rep.id*7;
  return CATEGORIES.map((name,i)=>{
    const offset=((seed+i*13)%21)-10; // -10 to +10 variation
    const score=Math.max(1,Math.min(10,Math.round((base/10)+offset/3)));
    const status=catStatus(score);
    return{name,score,status};
  });
}

function getTeamRank(repId,reps=INIT_REPS){
  const sorted=[...reps].sort((a,b)=>b.avg-a.avg);
  return sorted.findIndex(r=>r.id===repId)+1;
}

function score10(v){const n=Number(v)||0;return Math.max(0,Math.min(10,n>10?Math.round(n/10):Math.round(n)));}
function callDateLabel(v){try{return new Date(v).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}catch(e){return "Recent";}}
function categoryAverages(scores){
  const by={};
  scores.forEach(s=>(s.category_scores||[]).forEach(c=>{
    const name=c.name||c.category;if(!name)return;
    (by[name] ||= []).push(score10(c.score));
  }));
  return CATEGORIES.map(name=>{
    const vals=by[name]||[];
    const score=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
    return {name,score,status:catStatus(score)};
  }).filter(c=>c.score>0);
}
function mapScoreToCall(s,repId){
  const cats=(s.category_scores||[]).map(c=>score10(c.score));
  return {id:`cs-${s.id}`,repId,date:callDateLabel(s.scored_at),seller:s.seller_name||"Unknown",type:s.seller_type||"Unknown",score:Number(s.overall_score)||0,grade:s.grade||grade(Number(s.overall_score)||0),dur:s.duration||"N/A",st:s.seller_talk_ratio||50,rt:s.rep_talk_ratio||50,isNew:false,categories:cats,scorecard:s,transcript:s.transcript||"",moments:s.moments||[],strengths:s.strengths||[]};
}
function buildDbReps(users,scores){
  const scoresByRep={};
  scores.forEach(s=>{if(s.rep_ghl_user_id)(scoresByRep[s.rep_ghl_user_id] ||= []).push(s);});
  return users.filter(u=>u.role!=="admin").map(u=>{
    const repScores=(scoresByRep[u.ghl_user_id]||[]).sort((a,b)=>new Date(b.scored_at)-new Date(a.scored_at));
    const recent=repScores.slice(0,7).map(s=>Number(s.overall_score)||0);
    const prev=repScores.slice(7,14).map(s=>Number(s.overall_score)||0);
    const avg=recent.length?Math.round(recent.reduce((a,b)=>a+b,0)/recent.length):0;
    const prevAvg=prev.length?Math.round(prev.reduce((a,b)=>a+b,0)/prev.length):avg;
    const initials=(u.name||"Rep").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)||"RP";
    const now=Date.now();
    const scores30=repScores.filter(s=>new Date(s.scored_at).getTime()>now-30*864e5);
    const scores90=repScores.filter(s=>new Date(s.scored_at).getTime()>now-90*864e5);
    const h30=scores30.map(s=>Number(s.overall_score)||0).reverse();
    const h90=scores90.map(s=>Number(s.overall_score)||0).reverse();
    // Fallbacks: if 30d has too few, use most recent N; if 90d empty, use all
    const fallback30=repScores.slice(0,8).map(s=>Number(s.overall_score)||0).reverse();
    const fallback90=repScores.slice(0,16).map(s=>Number(s.overall_score)||0).reverse();
    const history30=h30.length>=2?h30:(fallback30.length?fallback30:[avg||0,avg||0]);
    const history90=h90.length>=2?h90:(fallback90.length?fallback90:[avg||0,avg||0]);
    return {id:`ghl-${u.ghl_user_id}`,ghlUserId:u.ghl_user_id,name:u.name||"Demo Rep",avatar:initials,role:u.role==="sales_rep"?"Sales Rep":"Acq Rep",exp:avg>=78?"experienced":avg>=62?"developing":"new",avg,trend:avg-prevAvg,week:repScores.filter(s=>new Date(s.scored_at)>new Date(Date.now()-7*864e5)).length,total:repScores.length,flagged:avg>0&&avg<55,streak:Math.max(0,recent.filter((v,i)=>i===0||v>=recent[i-1]-3).length-1),scores:recent.length?[...recent].reverse():[0],weak:categoryAverages(repScores).sort((a,b)=>a.score-b.score)[0]?.name||"N/A",strong:categoryAverages(repScores).sort((a,b)=>b.score-a.score)[0]?.name||"N/A",talks:repScores.slice(0,3).map(s=>({r:s.rep_talk_ratio||50,s:s.seller_talk_ratio||50})),history30,history90,categoryAverages:categoryAverages(repScores),calls:repScores.map(s=>mapScoreToCall(s,`ghl-${u.ghl_user_id}`))};
  });
}

// ── RING COMPONENT ────────────────────────────────────────────────────────────
function Ring({score,size=120}){
  const [v,setV]=useState(0);
  useEffect(()=>{
    let cur=0,raf;
    const t=setTimeout(()=>{
      function step(){cur=Math.min(cur+2,score);setV(Math.round(cur));if(cur<score)raf=requestAnimationFrame(step);}
      raf=requestAnimationFrame(step);
    },150);
    return()=>{clearTimeout(t);cancelAnimationFrame(raf);};
  },[score]);
  const r=size/2-7,circ=2*Math.PI*r,color=gc(score);
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={B1} strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={circ*(1-v/100)} strokeLinecap="round"/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:size*.27,fontWeight:800,color,fontFamily:"'Open Sans',sans-serif",lineHeight:1,letterSpacing:"0.04em"}}>{v}</div>
        <div style={{fontSize:size*.13,fontWeight:700,color,marginTop:1,fontFamily:"'Open Sans',sans-serif"}}>{grade(score)}</div>
      </div>
    </div>
  );
}

// ── MOMENTUM CHART ────────────────────────────────────────────────────────────
function MomentumChart({rep}){
  const [range,setRange]=useState(30);
  const data=range===30?rep.history30:rep.history90;
  const minV=Math.min(...data)-4,maxV=Math.max(...data)+4;
  const W=300,H=72;
  const pts=data.map((v,i)=>{
    const x=(i/(data.length-1))*(W-20)+10;
    const y=H-((v-minV)/(maxV-minV||1))*H;
    return`${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const delta=data[data.length-1]-data[0];
  const col=delta>=0?GREEN:RED;
  return(
    <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:TEXT,textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:"'Open Sans',sans-serif"}}>Momentum Arc</div>
        <div style={{display:"flex",gap:3}}>
          {[30,90].map(d=>(
            <button key={d} onClick={()=>setRange(d)}
              style={{background:"transparent",border:`1px solid ${range===d?"#222":"transparent"}`,borderRadius:6,padding:"3px 9px",color:range===d?TEXT:T3,fontSize:13,fontWeight:600,cursor:"pointer",borderLeft:range===d?`2px solid ${GREEN}`:undefined}}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block",height:H}}>
        <defs>
          <linearGradient id={`rmg${rep.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity=".2"/>
            <stop offset="100%" stopColor={col} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon fill={`url(#rmg${rep.id})`} points={`10,${H} ${pts} ${W-10},${H}`}/>
        <polyline fill="none" stroke={col} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={10} cy={H-((data[0]-minV)/(maxV-minV||1))*H} r="3" fill={T3}/>
        <circle cx={W-10} cy={H-((data[data.length-1]-minV)/(maxV-minV||1))*H} r="3.5" fill={col}/>
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:13,color:T3}}>
        <span>{range}d ago — <span style={{color:TEXT,fontWeight:600,letterSpacing:"0.04em"}}>{data[0]}</span></span>
        <span style={{color:col,fontWeight:700,letterSpacing:"0.04em"}}>{delta>=0?"+":""}{delta} pts</span>
        <span>Now — <span style={{color:col,fontWeight:600,letterSpacing:"0.04em"}}>{data[data.length-1]}</span></span>
      </div>
      {rep.streak>0&&(
        <div style={{marginTop:10,background:"#1a0f00",border:`1px solid ${AMBER}22`,borderRadius:6,padding:"6px 10px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,fontWeight:700,color:AMBER,letterSpacing:"0.04em"}}>{rep.streak}-call improvement streak</span>
        </div>
      )}
    </div>
  );
}

// ── REP NAV ───────────────────────────────────────────────────────────────────
function RepNav({rep,onSwitchRep,onOwnerView,bellNode}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",borderBottom:`1px solid ${B1}`,background:S1}}>
      {/* Left: Logo + branding */}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <img src={closerControlLogo} alt="CC" style={{height:28}}/>
        <div>
          <div style={{fontSize:13,fontWeight:800,fontFamily:"'League Spartan',sans-serif",color:TEXT,letterSpacing:"0.04em",lineHeight:1}}>ACQ COACH</div>
          <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>by Closer Control</div>
        </div>
      </div>
      {/* Center: Rep info */}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:TEXT}}>
          {rep.avatar}
        </div>
        <span style={{fontSize:12,fontWeight:600,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{rep.name}</span>
        <span style={{fontSize:12,fontWeight:700,color:gc(rep.avg),background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"2px 8px",letterSpacing:"0.04em",fontFamily:"'Open Sans',sans-serif"}}>
          {rep.avg} · {grade(rep.avg)}
        </span>
      </div>
      {/* Right: Bell + Actions */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {bellNode}
        {onSwitchRep&&<button onClick={onSwitchRep} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 12px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>Switch Rep</button>}
        <button onClick={onOwnerView} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 12px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>{onSwitchRep?"Owner View":"Sign Out"}</button>
      </div>
    </div>
  );
}

// ── REP SELECTOR ──────────────────────────────────────────────────────────────
function RepSelector({onSelect,reps=INIT_REPS,loading=false,error=""}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:BG,padding:40}} className="fade">
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <img src={closerControlLogo} alt="CC" style={{height:32}}/>
        <div style={{fontSize:18,fontWeight:800,fontFamily:"'League Spartan',sans-serif",color:TEXT,letterSpacing:"0.04em"}}>ACQ COACH</div>
      </div>
      <div style={{fontSize:12,color:T3,marginBottom:32,fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.12em",textTransform:"uppercase"}}>Select Your Profile</div>
      {loading&&<div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif",marginBottom:14}}>Loading demo reps…</div>}
      {error&&<div style={{fontSize:13,color:RED,fontFamily:"'Open Sans',sans-serif",marginBottom:14}}>{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14,maxWidth:480,width:"100%"}}>
        {reps.map(rep=>(
          <button key={rep.id} onClick={()=>onSelect(rep)}
            style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"20px 18px",cursor:"pointer",textAlign:"left",transition:"border-color .15s"}}
            onMouseOver={e=>e.currentTarget.style.borderColor=GREEN}
            onMouseOut={e=>e.currentTarget.style.borderColor=B1}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>
                {rep.avatar}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{rep.name}</div>
                <div style={{fontSize:12,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{rep.role}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16,fontWeight:800,color:gc(rep.avg),fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>{rep.avg}</span>
              <span style={{fontSize:12,fontWeight:600,color:gc(rep.avg),fontFamily:"'Open Sans',sans-serif"}}>{grade(rep.avg)}</span>
              <span style={{fontSize:13,color:rep.trend>=0?GREEN:RED,marginLeft:"auto",fontFamily:"'Open Sans',sans-serif"}}>
                {rep.trend>=0?"↑":"↓"} {Math.abs(rep.trend)}%
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── PATTERN DETECTION ─────────────────────────────────────────────────────────
function PatternDetection({rep}){
  const [patterns,setPatterns]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);
  const hasFetched=useRef(false);

  useEffect(()=>{
    if(hasFetched.current)return;
    hasFetched.current=true;
    setLoading(true);

    const calls=(rep.calls?.length?rep.calls:INIT_CALLS.filter(c=>c.repId===rep.id)).filter(c=>c.categories?.length).slice(0,8);
    if(calls.length<3){setLoading(false);return;}

    const catTotals=CATEGORIES.map((_,i)=>{
      const scores=calls.map(c=>c.categories[i]);
      return{name:CATEGORIES[i],scores,avg:+(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1),
        lowCount:scores.filter(s=>s<=5).length};
    });
    const worst=[...catTotals].sort((a,b)=>a.avg-b.avg).slice(0,2);

    fetch(AI_CHAT_URL,{
      method:"POST",
      headers:AI_CHAT_HEADERS,
      body:JSON.stringify({
        max_tokens:600,
        system:`You are ACQ Coach AI. Analyze scoring patterns for a real estate acquisition rep. Respond ONLY valid JSON: {"patterns":[{"category":"string","insight":"string","callCount":number,"avgScore":number,"severity":"warning|critical"}]}`,
        messages:[{role:"user",content:`Rep: ${rep.name} (${rep.exp})\nAnalyze these 2 weakest categories from their last ${calls.length} calls:\n${worst.map(w=>`${w.name}: scores [${w.scores.join(",")}], avg ${w.avg}/10, scored ≤5 in ${w.lowCount}/${calls.length} calls`).join("\n")}\n\nFor each, write a concise pattern insight (1-2 sentences) explaining what the rep is consistently doing wrong in plain English. Set severity to "critical" if avg<5, otherwise "warning".`}]
      })
    })
    .then(r=>{if(!r.ok)throw new Error();return r.json();})
    .then(data=>{
      try{const parsed=JSON.parse(data.content[0].text);setPatterns(parsed.patterns);}catch(e){setError(true);}
    })
    .catch(()=>setError(true))
    .finally(()=>setLoading(false));
  },[rep]);

  if(error||(!loading&&!patterns))return null;

  return(
    <div style={{marginTop:24}}>
      <div style={{fontSize:12,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,fontFamily:"'Open Sans',sans-serif"}}>Pattern Detection</div>
      {loading&&(
        <div style={{background:"#0d0d0d",border:`1px solid #1c1c1c`,borderRadius:8,padding:"16px 18px",display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:GREEN,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:12,color:T2,fontFamily:"'Open Sans',sans-serif"}}>Analyzing call patterns…</span>
        </div>
      )}
      {patterns&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}} className="fade">
          {patterns.map((p,i)=>{
            const isCritical=p.severity==="critical";
            const accent=isCritical?"#c0392b":"#b7860b";
            return(
              <div key={i} style={{background:"#0d0d0d",border:"1px solid #1c1c1c",borderLeft:`3px solid ${accent}`,borderRadius:8,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.1em"}}>Pattern Detected</span>
                  <span style={{fontSize:12,fontWeight:700,color:accent,background:accent+"18",borderRadius:10,padding:"2px 8px",fontFamily:"'Open Sans',sans-serif"}}>{isCritical?"Critical":"Warning"}</span>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:6,fontFamily:"'Open Sans',sans-serif"}}>{p.category}</div>
                <div style={{fontSize:13,color:T2,lineHeight:1.7,marginBottom:10,fontFamily:"'Open Sans',sans-serif"}}>{p.insight}</div>
                <div style={{display:"flex",gap:16}}>
                  <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>
                    Appeared in <span style={{color:TEXT,fontWeight:700}}>{p.callCount}</span> call{p.callCount!==1?"s":""}
                  </div>
                  <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>
                    Avg score: <span style={{color:accent,fontWeight:700}}>{p.avgScore}/10</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── SCORECARD TAB ─────────────────────────────────────────────────────────────
function ScorecardTab({rep}){
  const cats=getRepCategoryScores(rep);
  const sorted=[...cats].sort((a,b)=>a.score-b.score);
  const focusAreas=sorted.slice(0,3);
  return(
    <div className="fade">
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {cats.map(cat=>{
          const pct=(cat.score/10)*100;
          const color=catColor(cat.status);
          return(
            <div key={cat.name} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:180,fontSize:12,color:TEXT,fontFamily:"'Open Sans',sans-serif",fontWeight:500,flexShrink:0}}>{cat.name}</div>
              <div style={{flex:1,height:18,background:S2,borderRadius:4,overflow:"hidden",position:"relative"}}>
                <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:4,transition:"width .6s"}}/>
              </div>
              <div style={{width:28,fontSize:13,fontWeight:700,color,textAlign:"right",fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>{cat.score}</div>
              <div style={{width:70,fontSize:13,color,fontWeight:600,fontFamily:"'Open Sans',sans-serif"}}>{catLabel(cat.status)}</div>
            </div>
          );
        })}
      </div>
      {/* Focus Areas */}
      <div style={{marginTop:24}}>
        <div style={{fontSize:12,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,fontFamily:"'Open Sans',sans-serif"}}>Your 3 Focus Areas This Week</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {focusAreas.map(cat=>{
            const drill=DRILL_PROMPTS[cat.name];
            return(
              <div key={cat.name} style={{background:cat.status==="critical"?"#0f0a0a":"#0f0d08",border:`1px solid ${B1}`,borderLeft:`3px solid ${catColor(cat.status)}`,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:4,fontFamily:"'Open Sans',sans-serif"}}>{cat.name} — {cat.score}/10</div>
                {drill&&<div style={{fontSize:12,color:T2,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>{drill.tip}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Pattern Detection */}
      <PatternDetection rep={rep}/>
    </div>
  );
}

// ── MY CALLS TAB ──────────────────────────────────────────────────────────────
function MyCallsTab({rep,onPractice=null}){
  const [expandedId,setExpandedId]=useState(null);
  const calls=rep.calls?.length?rep.calls:INIT_CALLS.filter(c=>c.repId===rep.id);
  if(!calls.length) return(
    <div style={{textAlign:"center",padding:"40px 0",color:T3,fontSize:13,fontFamily:"'Open Sans',sans-serif"}} className="fade">No calls recorded yet.</div>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}} className="fade">
      {calls.map(call=>{
        const sellerLow=call.st<60;
        const isExpanded=expandedId===call.id;
        return(
          <div key={call.id} style={{background:S1,border:`1px solid ${isExpanded?B3:B1}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"border-color .15s"}}
            onClick={()=>setExpandedId(isExpanded?null:call.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <span style={{fontSize:13,fontWeight:600,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{call.seller}</span>
                <span style={{fontSize:12,color:T3,marginLeft:8,fontFamily:"'Open Sans',sans-serif"}}>{call.type}</span>
                <span style={{fontSize:13,color:T3,marginLeft:8,fontFamily:"'Open Sans',sans-serif"}}>{call.dur}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{call.date}</span>
                <span style={{fontSize:12,fontWeight:800,color:gc(call.score),fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>{call.score}</span>
                <span style={{fontSize:12,fontWeight:600,color:gc(call.score),fontFamily:"'Open Sans',sans-serif"}}>{call.grade}</span>
                <span style={{fontSize:12,color:T3,transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s",display:"inline-block"}}>▾</span>
              </div>
            </div>
            {/* Talk ratio mini bar */}
            <div style={{height:16,borderRadius:4,overflow:"hidden",display:"flex"}}>
              <div style={{width:`${call.rt}%`,background:"#1e3a1e",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:12,fontWeight:700,color:TEXT,opacity:.7}}>{call.rt}% Rep</span>
              </div>
              <div style={{width:`${call.st}%`,background:GREEN,display:"flex",alignItems:"center",justifyContent:"center",opacity:call.st>=60?.9:.6}}>
                <span style={{fontSize:12,fontWeight:700,color:TEXT}}>{call.st}% Seller</span>
              </div>
            </div>
            {sellerLow&&(
              <div style={{marginTop:6,fontSize:13,color:AMBER,fontWeight:600,fontFamily:"'Open Sans',sans-serif"}}>⚠ Seller talk below 60% — aim to listen more</div>
            )}
            {/* Expanded: per-call category breakdown */}
            {isExpanded&&call.categories&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${B1}`}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:13,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10,fontFamily:"'Open Sans',sans-serif"}}>Performance Breakdown</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {CATEGORIES.map((name,i)=>{
                    const score=call.categories[i];
                    const status=catStatus(score);
                    const color=catColor(status);
                    const pct=(score/10)*100;
                    const isLow=score<6;
                    return(
                      <div key={name} style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:160,fontSize:13,color:TEXT,fontFamily:"'Open Sans',sans-serif",fontWeight:500,flexShrink:0}}>{name}</div>
                        <div style={{flex:1,height:14,background:S2,borderRadius:3,overflow:"hidden",position:"relative"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:3,transition:"width .4s"}}/>
                        </div>
                        <div style={{width:22,fontSize:12,fontWeight:700,color,textAlign:"right",fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>{score}</div>
                        <div style={{width:60,fontSize:12,color,fontWeight:600,fontFamily:"'Open Sans',sans-serif"}}>{catLabel(status)}</div>
                        {isLow&&onPractice&&(
                          <button onClick={e=>{e.stopPropagation();onPractice({category:name,challenge:`You scored ${score}/10 on ${name}. Let's practice this.`,context:`This call was about ${call.type||"real estate acquisition"}`});}}
                            style={{fontSize:11,fontWeight:700,color:AMBER,background:"rgba(183,134,11,0.12)",border:"1px solid rgba(183,134,11,0.35)",borderRadius:10,padding:"2px 9px",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Open Sans',sans-serif",flexShrink:0}}>
                            Practice →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {call.moments?.length>0&&(
                  <div style={{marginTop:14}}>
                    <div style={{fontSize:13,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontFamily:"'Open Sans',sans-serif"}}>Key Moments</div>
                    {call.moments.map((m,i)=>(
                      <div key={i} style={{background:S2,border:`1px solid ${B1}`,borderLeft:`3px solid ${catColor(m.status||"ok")}`,borderRadius:6,padding:"9px 11px",marginBottom:7}}>
                        <div style={{fontSize:12,color:TEXT,lineHeight:1.5}}><strong>What:</strong> {m.what}</div>
                        <div style={{fontSize:12,color:T2,lineHeight:1.5,marginTop:3}}><strong>Why:</strong> {m.why}</div>
                        {m.transcript_quote&&(
                          <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid rgba(255,255,255,0.07)`,borderLeft:"2px solid #555",borderRadius:5,padding:"7px 9px",marginTop:6}}>
                            <div style={{fontSize:10,fontWeight:700,color:"#666",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>What was said</div>
                            <div style={{fontSize:11.5,color:"#888",lineHeight:1.65,fontStyle:"italic"}}>"{m.transcript_quote}"</div>
                          </div>
                        )}
                        {m.rewrite&&(
                          <div style={{marginTop:6,padding:"7px 9px",background:"rgba(78,125,61,0.07)",border:"1px solid rgba(78,125,61,0.2)",borderRadius:5}}>
                            <div style={{fontSize:10,fontWeight:700,color:GREEN,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>What to say instead</div>
                            <div style={{fontSize:11.5,color:GREEN,lineHeight:1.65,fontStyle:"italic"}}>{m.rewrite}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {call.transcript&&(
                  <div style={{marginTop:14}}>
                    <div style={{fontSize:13,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontFamily:"'Open Sans',sans-serif"}}>Transcript</div>
                    <div style={{background:BG,border:`1px solid ${B1}`,borderRadius:6,padding:"10px 12px",fontSize:12,color:T2,lineHeight:1.75,whiteSpace:"pre-wrap",maxHeight:260,overflowY:"auto",fontFamily:"'Open Sans',sans-serif"}}>{call.transcript}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PROGRESS TAB ──────────────────────────────────────────────────────────────
function ProgressTab({rep}){
  const cats=getRepCategoryScores(rep);
  const sorted=[...cats].sort((a,b)=>a.score-b.score);
  const mostImproved=cats.reduce((best,c)=>c.score>best.score?c:best,cats[0]);
  const mostConsistent=cats.reduce((best,c)=>{
    const diff=Math.abs(c.score-rep.avg/10);
    const bestDiff=Math.abs(best.score-rep.avg/10);
    return diff<bestDiff?c:best;
  },cats[0]);
  return(
    <div className="fade">
      <MomentumChart rep={rep}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}>
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6,fontFamily:"'Open Sans',sans-serif"}}>Most Improved</div>
          <div style={{fontSize:12,fontWeight:700,color:GREEN,fontFamily:"'Open Sans',sans-serif"}}>{mostImproved.name}</div>
          <div style={{fontSize:12,color:T2,marginTop:2,fontFamily:"'Open Sans',sans-serif"}}>{mostImproved.score}/10</div>
        </div>
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6,fontFamily:"'Open Sans',sans-serif"}}>Most Consistent</div>
          <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{mostConsistent.name}</div>
          <div style={{fontSize:12,color:T2,marginTop:2,fontFamily:"'Open Sans',sans-serif"}}>{mostConsistent.score}/10</div>
        </div>
      </div>
    </div>
  );
}

// ── PILL COMPONENT ─────────────────────────────────────────────────────────────
function Pill({label,color}){
  let bg,tc,br;
  if(color===GREEN||color===DKGREEN){bg=GREEN;tc=TEXT;br="none";}
  else if(color===RED){bg="#1a0a0a";tc=RED;br=`1px solid ${RED}28`;}
  else if(color===AMBER){bg="#1a0f00";tc=AMBER;br=`1px solid ${AMBER}28`;}
  else{bg="#1e1e1e";tc=T2;br=`1px solid ${B1}`;}
  return(
    <span style={{fontSize:13,fontWeight:700,color:tc,background:bg,border:br,borderRadius:6,padding:"2px 7px",display:"inline-block",whiteSpace:"nowrap",letterSpacing:"0.04em"}}>
      {label}
    </span>
  );
}

// ── MIC BUTTON ────────────────────────────────────────────────────────────────
function MicButton({onTranscribed,disabled}){
  const [recording,setRecording]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const recorderRef=useRef(null);
  const chunksRef=useRef([]);
  const streamRef=useRef(null);

  async function start(){
    setError("");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=stream;
      const mimeType=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":
        MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"";
      const recorder=new MediaRecorder(stream,mimeType?{mimeType}:{});
      chunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        streamRef.current?.getTracks().forEach(t=>t.stop());
        const blob=new Blob(chunksRef.current,{type:recorder.mimeType||"audio/webm"});
        chunksRef.current=[];
        setLoading(true);
        try{
          const form=new FormData();
          form.append("file",blob,"rep-mic.webm");
          form.append("service","whisper");
          const res=await fetch(`${SUPABASE_URL}/functions/v1/transcribe`,{
            method:"POST",headers:{Authorization:`Bearer ${SUPABASE_KEY}`},body:form
          });
          if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||"Whisper error "+res.status);}
          const data=await res.json();
          onTranscribed(data.text.trim());
        }catch(e){
          setError("Mic transcription failed: "+e.message);
        }
        setLoading(false);
      };
      recorder.start();
      recorderRef.current=recorder;
      setRecording(true);
    }catch(e){
      setError(e.name==="NotAllowedError"?"Mic access denied — allow microphone in browser settings.":"Could not start recording: "+e.message);
    }
  }

  function stop(){
    recorderRef.current?.stop();
    recorderRef.current=null;
    setRecording(false);
  }

  const label=loading?"…":recording?"■ Stop":"Mic";
  const borderColor=recording?RED:B3;
  const textColor=recording?RED:T2;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
      <button onClick={recording?stop:start} disabled={loading||disabled}
        style={{background:recording?"#1a0a0a":"transparent",border:`1px solid ${borderColor}`,borderRadius:6,padding:"0 14px",height:54,color:textColor,fontSize:13,fontWeight:700,cursor:"pointer",opacity:loading||disabled?.5:1,whiteSpace:"nowrap",flexShrink:0}}>
        {label}
      </button>
      {error&&<div style={{fontSize:13,color:RED,maxWidth:120,lineHeight:1.4}}>{error}</div>}
    </div>
  );
}

// ── SCORED PHASE WITH AUDIO COACHING ──────────────────────────────────────────
function ScoredPhase({sessionScore,scenario,exchangeScores,messages,onTryAgain,onBack}){
  const [audioState,setAudioState]=useState("idle"); // idle | loading | ready | playing | error
  const [audioUrl,setAudioUrl]=useState(null);
  const [progress,setProgress]=useState(0);
  const [duration,setDuration]=useState(0);
  const audioRef=useRef(null);
  const rafRef=useRef(null);

  const topCoachingPoints=messages.filter(m=>m.role==="seller"&&m.feedback).sort((a,b)=>(a.score||0)-(b.score||0)).slice(0,3);

  const generateAudio=async()=>{
    setAudioState("loading");
    const coachingText=`Session score: ${sessionScore} out of 100. ${scenario.label} seller type. Here are your top coaching points: ${topCoachingPoints.map((m,i)=>`Point ${i+1}: You scored ${m.score} out of 10. ${m.feedback}${m.rewrite?` A better approach: ${m.rewrite}`:""}`).join(". ")}. Overall: ${sessionScore>=80?"Strong session. Keep refining your technique.":sessionScore>=60?"Decent session but you have clear areas to improve.":"This session needs significant improvement. Focus on your weakest exchanges."}`;
    try{
      const blob=await backendTTS(coachingText);
      const url=URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioState("ready");
    }catch(e){setAudioState("error");}
  };

  const togglePlay=()=>{
    const a=audioRef.current;
    if(!a)return;
    if(a.paused){a.play();setAudioState("playing");}
    else{a.pause();setAudioState("ready");}
  };

  const updateProgress=()=>{
    const a=audioRef.current;
    if(a&&a.duration){setProgress(a.currentTime/a.duration);setDuration(a.duration);}
    rafRef.current=requestAnimationFrame(updateProgress);
  };

  useEffect(()=>{return()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current);if(audioUrl)URL.revokeObjectURL(audioUrl);};},[audioUrl]);

  const fmt=s=>{const m=Math.floor(s/60);const sec=Math.floor(s%60);return`${m}:${sec<10?"0":""}${sec}`;};

  return(
    <div style={{overflowY:"auto",flex:1,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 24px 48px"}}>
      <div style={{width:"100%",maxWidth:520}} className="fade">
        <div style={{textAlign:"center",marginBottom:24}}>
          <Ring score={sessionScore} size={130}/>
          <div style={{fontSize:16,fontWeight:700,marginTop:14,marginBottom:4,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",color:TEXT}}>Session Complete</div>
          <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{scenario.label} · {exchangeScores.length} exchange{exchangeScores.length!==1?"s":""} scored</div>

          {/* Audio Coaching Button */}
          <div style={{marginTop:14}}>
            {audioState==="idle"&&(
              <button onClick={generateAudio}
                style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"8px 18px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif",transition:"border-color .15s"}}
                onMouseOver={e=>e.currentTarget.style.borderColor=GREEN}
                onMouseOut={e=>e.currentTarget.style.borderColor=B3}>
                🎧 Listen to Coaching
              </button>
            )}
            {audioState==="loading"&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:GREEN,animation:"pulse 2s infinite"}}/>
                <span style={{fontSize:12,color:T2,fontFamily:"'Open Sans',sans-serif"}}>Generating audio…</span>
              </div>
            )}
            {audioState==="error"&&(
              <div style={{fontSize:12,color:T3,fontFamily:"'Open Sans',sans-serif"}}>
                Failed — voice coaching is temporarily unavailable.
                <button onClick={()=>setAudioState("idle")} style={{background:"transparent",border:"none",color:GREEN,fontSize:12,cursor:"pointer",marginLeft:6,fontFamily:"'Open Sans',sans-serif"}}>Retry</button>
              </div>
            )}
            {(audioState==="ready"||audioState==="playing")&&audioUrl&&(
              <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"10px 14px",marginTop:4}}>
                <audio ref={audioRef} src={audioUrl}
                  onPlay={()=>{setAudioState("playing");rafRef.current=requestAnimationFrame(updateProgress);}}
                  onPause={()=>{setAudioState("ready");if(rafRef.current)cancelAnimationFrame(rafRef.current);}}
                  onEnded={()=>{setAudioState("ready");setProgress(0);if(rafRef.current)cancelAnimationFrame(rafRef.current);}}
                  onLoadedMetadata={e=>setDuration(e.target.duration)}
                />
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={togglePlay}
                    style={{background:"transparent",border:`1px solid ${GREEN}44`,borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:GREEN,fontSize:14}}>
                    {audioState==="playing"?"❚❚":"▶"}
                  </button>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{height:4,background:S2,borderRadius:2,overflow:"hidden",cursor:"pointer"}}
                      onClick={e=>{const r=e.currentTarget.getBoundingClientRect();const p=(e.clientX-r.left)/r.width;if(audioRef.current){audioRef.current.currentTime=p*audioRef.current.duration;setProgress(p);}}}>
                      <div style={{width:`${progress*100}%`,height:"100%",background:GREEN,borderRadius:2,transition:"width .1s linear"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{fmt(audioRef.current?.currentTime||0)}</span>
                      <span style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{fmt(duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 20px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,fontFamily:"'Open Sans',sans-serif"}}>Exchange Breakdown</div>
          {exchangeScores.map((s,i)=>{
            const c=gc(s*10);
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{fontSize:13,color:T3,width:68,flexShrink:0,fontFamily:"'Open Sans',sans-serif"}}>Exchange {i+1}</div>
                <div style={{flex:1,height:5,background:S2,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${s*10}%`,height:"100%",background:c,borderRadius:2,transition:"width .5s"}}/>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:c,width:28,textAlign:"right",letterSpacing:"0.04em",fontFamily:"'Open Sans',sans-serif"}}>{s}/10</div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onTryAgain}
            style={{flex:1,background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"11px",color:T2,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>Try Again</button>
          <button onClick={onBack}
            style={{flex:1,background:GREEN,border:"none",borderRadius:6,padding:"11px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>Back to Dashboard</button>
        </div>
      </div>
    </div>
  );
}

// ── CALL STATUS INDICATOR ──────────────────────────────────────────────────────
function CallStatusIndicator({callPhase}){
  const map={
    idle:{label:"YOUR TURN",color:GREEN},
    recording:{label:"RECORDING…",color:RED,pulse:true},
    transcribing:{label:"TRANSCRIBING…",color:T3},
    thinking:{label:"SELLER RESPONDING…",color:T3},
    speaking:{label:"SELLER SPEAKING…",color:AMBER},
  };
  const cfg=map[callPhase]||map.idle;
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"6px 0"}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:cfg.color,
        ...(cfg.pulse?{animation:"pulse 2s infinite"}:{})}}/>
      <span style={{fontSize:13,fontWeight:700,color:cfg.color,textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:"'Open Sans',sans-serif"}}>{cfg.label}</span>
    </div>
  );
}

// ── HOLD TO SPEAK BUTTON ──────────────────────────────────────────────────────
function HoldToSpeakButton({callPhase,onStart,onStop}){
  const isRecording=callPhase==="recording";
  const isIdle=callPhase==="idle";
  const isDisabled=!isRecording&&!isIdle;
  const borderColor=isRecording?RED:isIdle?GREEN:T3;
  const bgColor=isRecording?"#1a0a0a":isIdle?"#0a1a0a":S1;
  return(
    <div style={{position:"relative",width:96,height:96}}>
      {isRecording&&(
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${RED}`,animation:"pulsRing 1.2s ease-out infinite",pointerEvents:"none"}}/>
      )}
      <button
        onMouseDown={isIdle?onStart:undefined}
        onMouseUp={(isRecording)?onStop:undefined}
        onMouseLeave={(isRecording)?onStop:undefined}
        onTouchStart={isIdle?(e)=>{e.preventDefault();onStart();}:undefined}
        onTouchEnd={(isRecording)?onStop:undefined}
        disabled={isDisabled}
        style={{
          width:96,height:96,borderRadius:"50%",border:`2px solid ${borderColor}`,background:bgColor,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
          cursor:isDisabled?"not-allowed":"pointer",opacity:isDisabled?0.45:1,
          touchAction:"none",position:"relative",zIndex:1,transition:"opacity .2s"
        }}>
        <span style={{fontSize:24}}>{isRecording?"■":"🎙"}</span>
        <span style={{fontSize:12,fontWeight:700,color:isRecording?RED:isIdle?GREEN:T3,textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'Open Sans',sans-serif"}}>
          {isRecording?"RELEASE":"HOLD"}
        </span>
      </button>
    </div>
  );
}

// ── SCORE TOAST ───────────────────────────────────────────────────────────────
function ScoreToast({toast}){
  if(!toast)return null;
  const accent=toast.status==="strong"?GREEN:toast.status==="ok"?AMBER:RED;
  return(
    <div className="fade" style={{
      position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:300,pointerEvents:"none",
      background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${accent}`,borderRadius:8,
      padding:"10px 16px",minWidth:280,maxWidth:400
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:toast.rewrite?4:0}}>
        <span style={{fontSize:16,fontWeight:800,color:accent,fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>{toast.score}/10</span>
        <span style={{fontSize:12,fontWeight:700,color:accent,background:accent+"18",borderRadius:10,padding:"2px 8px",fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase"}}>{toast.status}</span>
        <span style={{fontSize:12,color:T2,flex:1,fontFamily:"'Open Sans',sans-serif"}}>{toast.feedback}</span>
      </div>
      {toast.rewrite&&<div style={{fontSize:12,color:GREEN,fontStyle:"italic",fontFamily:"'Open Sans',sans-serif"}}>Try: "{toast.rewrite}"</div>}
    </div>
  );
}

// ── LIVE ROLEPLAY MODE ────────────────────────────────────────────────────────
function RoleplayMode({onBack,seedMoment=null}){
  const [sellerType,setSellerType]=useState("probate");
  const scenario0=SELLER_SCENARIOS[sellerType];
  // If seeded, open the drill objection (or scenario opening as fallback)
  const seedOpening=seedMoment?(DRILL_PROMPTS[seedMoment.category]?.objection||scenario0.opening):null;
  const [phase,setPhase]=useState(seedMoment?"active":"setup");
  const [brief,setBrief]=useState(null);
  const [briefLoading,setBriefLoading]=useState(false);
  const [messages,setMessages]=useState(seedMoment?[{role:"seller",text:seedOpening,score:null,feedback:null,rewrite:null,status:null}]:[]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [exchangeScores,setExchangeScores]=useState([]);
  const [sessionScore,setSessionScore]=useState(null);
  const chatRef=useRef();
  const scenario=SELLER_SCENARIOS[sellerType];
  const runningAvg=exchangeScores.length?Math.round(exchangeScores.reduce((a,b)=>a+b,0)/exchangeScores.length*10):null;

  // Difficulty + hint state
  const [difficulty,setDifficulty]=useState("medium");
  const [hint,setHint]=useState(null);
  const [hintsLeft,setHintsLeft]=useState(3);
  const [hintLoading,setHintLoading]=useState(false);
  const hintTimer=useRef(null);
  const [sellerBriefOpen,setSellerBriefOpen]=useState(false);

  // Voice mode state
  const [callPhase,setCallPhase]=useState("idle");
  const [voiceMode,setVoiceMode]=useState(true);
  const [toast,setToast]=useState(null);
  const toastTimer=useRef(null);
  const recorderRef2=useRef(null);
  const chunksRef2=useRef([]);
  const streamRef2=useRef(null);
  const audioRef2=useRef(null);
  const audioUnlocked=useRef(false);

  useEffect(()=>{
    return()=>{
      recorderRef2.current?.stop();
      streamRef2.current?.getTracks().forEach(t=>t.stop());
      audioRef2.current?.pause();
      if(toastTimer.current)clearTimeout(toastTimer.current);
      if(hintTimer.current)clearTimeout(hintTimer.current);
    };
  },[]);

  function showToast(scoreData){
    if(toastTimer.current)clearTimeout(toastTimer.current);
    setToast(scoreData);
    toastTimer.current=setTimeout(()=>setToast(null),3500);
  }

  async function playTTS(sellerText){
    setCallPhase("speaking");
    try{
      const blob=await backendTTS(sellerText);
      const url=URL.createObjectURL(blob);
      const audio=new Audio(url);
      audioRef2.current=audio;
      await new Promise((resolve)=>{
        audio.onended=()=>{URL.revokeObjectURL(url);resolve();};
        audio.onerror=()=>{URL.revokeObjectURL(url);resolve();};
        audio.play();
      });
    }catch(e){/* TTS failure is non-fatal */}
  }

  async function handleCallCycle(repText){
    const currentMessages=[...messages,{role:"rep",text:repText}];
    setMessages(currentMessages);
    setCallPhase("thinking");
    const convo=currentMessages.map(m=>`${m.role==="rep"?"Rep":"Seller"}: ${m.text}`).join("\n");
    const repTurns=currentMessages.filter(m=>m.role==="rep").length;
    const prevSellerLine=currentMessages.filter(m=>m.role==="seller").slice(-1)[0]?.text||scenario.opening;
    try{
      const sellerP=fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:buildSellerSys(scenario,difficulty,seedMoment),
          max_tokens:150,messages:[{role:"user",content:`Conversation (rep turn ${repTurns}):\n${convo}\n\nRespond as the seller. React directly to the rep's last line. Do not repeat any concern you have already raised.`}]}),
      }).then(r=>r.json());
      const scoreP=fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:ROLEPLAY_SCORE_SYS,max_tokens:250,
          messages:[{role:"user",content:`Seller type: ${scenario.label}\nSeller said: "${prevSellerLine}"\nRep said: "${repText}"\n\nScore the rep's line. Respond ONLY valid JSON.`}]}),
      }).then(r=>r.json());
      const [sd,rd]=await Promise.all([sellerP,scoreP]);
      const sellerText=(sd.content||[]).map(b=>b.text||"").join("").trim();
      const rawScore=(rd.content||[]).map(b=>b.text||"").join("");
      const mt=rawScore.match(/\{[\s\S]*\}/);
      const scored=mt?JSON.parse(mt[0]):{score:5,status:"ok",feedback:"Keep digging for more discovery.",rewrite:""};
      setExchangeScores(prev=>[...prev,scored.score]);
      setMessages(prev=>[...prev,{role:"seller",text:sellerText,score:scored.score,status:scored.status,feedback:scored.feedback,rewrite:scored.rewrite}]);
      showToast(scored);
      setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},60);
      playTTS(sellerText);
    }catch(e){
      setMessages(prev=>[...prev,{role:"seller",text:"[API error — check backend configuration]",score:null}]);
    }finally{
      setCallPhase("idle");
    }
  }

  async function startRecording(){
    if(!audioUnlocked.current){
      const silence=new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
      silence.play().then(()=>{audioUnlocked.current=true;}).catch(()=>{});
    }
    if(callPhase!=="idle")return;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef2.current=stream;
      const mimeType=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":
        MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"";
      const recorder=new MediaRecorder(stream,mimeType?{mimeType}:{});
      chunksRef2.current=[];
      recorder.ondataavailable=e=>{if(e.data.size>0)chunksRef2.current.push(e.data);};
      recorder.start();
      recorderRef2.current=recorder;
      setCallPhase("recording");
    }catch(e){
      alert(e.name==="NotAllowedError"?"Mic access denied — allow microphone in browser settings.":"Could not start recording: "+e.message);
    }
  }

  function stopAndSend(){
    if(callPhase!=="recording")return;
    const recorder=recorderRef2.current;
    if(!recorder)return;
    recorder.onstop=async()=>{
      streamRef2.current?.getTracks().forEach(t=>t.stop());
      const blob=new Blob(chunksRef2.current,{type:recorder.mimeType||"audio/webm"});
      chunksRef2.current=[];
      setCallPhase("transcribing");
      try{
        const form=new FormData();
        form.append("file",blob,"voice.webm");
        const res=await fetch(`${SUPABASE_URL}/functions/v1/transcribe`,{
          method:"POST",headers:{Authorization:`Bearer ${SUPABASE_KEY}`},body:form
        });
        if(!res.ok)throw new Error();
        const data=await res.json();
        const text=data.text||"";
        if(!text.trim()){setCallPhase("idle");return;}
        await handleCallCycle(text.trim());
      }catch(e){setCallPhase("idle");}
    };
    recorder.stop();
    recorderRef2.current=null;
  }

  function startSession(){
    setMessages([{role:"seller",text:scenario.opening,score:null,feedback:null,rewrite:null,status:null}]);
    setExchangeScores([]);
    setSessionScore(null);
    setCallPhase("idle");
    setToast(null);
    setHint(null);
    setHintsLeft(3);
    setPhase("active");
  }

  async function sendMessage(){
    if(!input.trim()||loading)return;
    const repMsg={role:"rep",text:input.trim()};
    const withRep=[...messages,repMsg];
    setMessages(withRep);
    setInput("");
    setLoading(true);
    const convo=withRep.map(m=>`${m.role==="rep"?"Rep":"Seller"}: ${m.text}`).join("\n");
    const repTurns=withRep.filter(m=>m.role==="rep").length;
    const prevSellerLine=withRep.filter(m=>m.role==="seller").slice(-1)[0]?.text||scenario.opening;
    try{
      const sellerP=fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:buildSellerSys(scenario,difficulty,seedMoment),
          max_tokens:150,messages:[{role:"user",content:`Conversation (rep turn ${repTurns}):\n${convo}\n\nRespond as the seller. React directly to the rep's last line. Do not repeat any concern you have already raised.`}]}),
      }).then(r=>r.json());
      const scoreP=fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:ROLEPLAY_SCORE_SYS,max_tokens:250,
          messages:[{role:"user",content:`Seller type: ${scenario.label}\nSeller said: "${prevSellerLine}"\nRep said: "${repMsg.text}"\n\nScore the rep's line. Respond ONLY valid JSON.`}]}),
      }).then(r=>r.json());
      const [sd,rd]=await Promise.all([sellerP,scoreP]);
      const sellerText=(sd.content||[]).map(b=>b.text||"").join("").trim();
      const rawScore=(rd.content||[]).map(b=>b.text||"").join("");
      const m=rawScore.match(/\{[\s\S]*\}/);
      const scored=m?JSON.parse(m[0]):{score:5,status:"ok",feedback:"Keep digging for more discovery.",rewrite:""};
      const newScores=[...exchangeScores,scored.score];
      setExchangeScores(newScores);
      setMessages([...withRep,{role:"seller",text:sellerText,score:scored.score,status:scored.status,feedback:scored.feedback,rewrite:scored.rewrite}]);
      setLoading(false);
      setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},60);
    }catch(e){
      setLoading(false);
      setMessages(prev=>[...prev,{role:"seller",text:"[API error — check backend configuration]",score:null}]);
    }
  }

  function endSession(){
    if(!exchangeScores.length)return;
    setSessionScore(Math.round(exchangeScores.reduce((a,b)=>a+b,0)/exchangeScores.length*10));
    setPhase("scored");
  }

  async function fetchHint(){
    if(hintsLeft<=0||hintLoading)return;
    setHintLoading(true);
    const last6=messages.slice(-6);
    const ctx=last6.map(m=>`${m.role==="rep"?"Rep":"Seller"}: ${m.text}`).join("\n");
    try{
      const res=await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({
          system:`You are ACQ Coach AI. Based on the conversation, give the rep ONE specific actionable suggestion for their next line. Respond with ONLY: Try asking: "[exact question or statement]" — nothing else. Be specific to what the seller just said.`,
          max_tokens:80,
          messages:[{role:"user",content:`Seller type: ${scenario.label}\n\nRecent exchanges:\n${ctx}\n\nGive one specific hint.`}]
        })
      });
      const data=await res.json();
      const text=(data.content||[]).map(b=>b.text||"").join("").trim();
      setHint(text);
      setHintsLeft(prev=>prev-1);
      if(hintTimer.current)clearTimeout(hintTimer.current);
      hintTimer.current=setTimeout(()=>setHint(null),5000);
    }catch(e){}
    finally{setHintLoading(false);}
  }

  function toggleVoiceMode(){
    if(voiceMode&&callPhase==="recording"){
      recorderRef2.current?.stop();
      streamRef2.current?.getTracks().forEach(t=>t.stop());
      setCallPhase("idle");
    }
    setVoiceMode(!voiceMode);
  }

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}} className="fade">

      {phase==="setup"&&(
        <div style={{overflowY:"auto",flex:1,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 24px 48px"}}>
          <div style={{width:"100%",maxWidth:640}}>
            <button onClick={onBack} style={{background:"transparent",border:"none",color:T3,fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back to Dashboard</button>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",color:TEXT}}>Live Roleplay Mode</div>
              <Pill label="BETA" color={AMBER}/>
            </div>
            <div style={{fontSize:11,color:AMBER,background:"rgba(217,164,65,0.08)",border:`1px solid rgba(217,164,65,0.25)`,borderRadius:6,padding:"8px 12px",marginBottom:14,fontFamily:"'Open Sans',sans-serif",lineHeight:1.6}}>
              Heads up — Roleplay is still in active development. Voice handling, scoring, and seller realism are being tuned. Expect rough edges and occasional hiccups while we improve it.
            </div>
            <div style={{fontSize:12,color:T2,lineHeight:1.85,marginBottom:24,fontFamily:"'Open Sans',sans-serif"}}>
              The AI plays the seller. You practice your pitch. Every rep line is scored live with coaching.
            </div>
            <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10}}>Choose Your Seller Type</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:22}}>
              {Object.entries(SELLER_SCENARIOS).map(([k,v])=>(
                <div key={k} onClick={()=>{setSellerType(k);setBrief(null);}}
                  style={{background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${sellerType===k?GREEN:B2}`,borderRadius:8,padding:"13px 15px",cursor:"pointer",transition:"border-left-color .15s"}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:3,color:sellerType===k?GREEN:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{v.label}</div>
                  <div style={{fontSize:12,color:T3,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>{v.desc}</div>
                </div>
              ))}
            </div>
            <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"13px 16px",marginBottom:20}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5,fontFamily:"'Open Sans',sans-serif"}}>Seller's opening line</div>
              <div style={{fontSize:12.5,fontStyle:"italic",color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>"{SELLER_SCENARIOS[sellerType].opening}"</div>
            </div>
            {/* Difficulty selector */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontFamily:"'Open Sans',sans-serif"}}>Difficulty</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                {[["easy","Easy",GREEN],["medium","Medium",AMBER],["hard","Hard",RED]].map(([k,lbl,col])=>(
                  <button key={k} onClick={()=>setDifficulty(k)}
                    style={{flex:1,background:difficulty===k?col+"18":S1,border:`1px solid ${difficulty===k?col:B1}`,borderRadius:6,padding:"8px",color:difficulty===k?col:T2,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif",transition:"all .15s"}}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div style={{fontSize:12,color:T3,lineHeight:1.5,fontFamily:"'Open Sans',sans-serif"}}>
                {difficulty==="easy"&&"Seller volunteers information and is cooperative. Good for learning the script."}
                {difficulty==="medium"&&"Seller is moderately resistant. Realistic training conditions."}
                {difficulty==="hard"&&"Seller pushes back hard, tries to end the call twice, and inflates their price."}
              </div>
            </div>
            {/* Pre-Call Brief in setup */}
            <div style={{marginBottom:20}}>
              <button onClick={async()=>{
                setBriefLoading(true);setBrief(null);
                try{
                  const scenario=SELLER_SCENARIOS[sellerType];
                  const res=await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
                    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
                    body:JSON.stringify({system:`You are ACQ Coach AI for real estate wholesalers. Generate a pre-call brief. Respond ONLY valid JSON, no markdown: {"questions":["string","string","string"],"objections":[{"objection":"string","rebuttal":"string"},{"objection":"string","rebuttal":"string"}],"tone":"string","neverSay":"string"}`,
                      max_tokens:600,messages:[{role:"user",content:`Seller type: ${scenario.label}\nGenerate a pre-call brief with:\n- 3 key discovery questions specific to ${scenario.label} sellers\n- 2 likely objections with exact rebuttal scripts\n- Recommended emotional tone\n- One thing to NEVER say`}]})
                  });
                  const data=await res.json();
                  const raw=(data.content||[]).map(b=>b.text||"").join("");
                  const mt=raw.match(/\{[\s\S]*\}/);
                  if(mt)setBrief(JSON.parse(mt[0]));
                }catch(e){console.error(e);}
                finally{setBriefLoading(false);}
              }} disabled={briefLoading}
                style={{width:"100%",background:"transparent",border:`1px solid ${B2}`,borderRadius:6,padding:"10px 16px",color:GREEN,fontSize:13,fontWeight:700,cursor:briefLoading?"wait":"pointer",fontFamily:"'Open Sans',sans-serif",opacity:briefLoading?0.6:1,marginBottom:brief?12:0}}>
                {briefLoading?"Generating Brief…":"📋 Generate Pre-Call Brief"}
              </button>
              {brief&&(
                <div className="fade" style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{background:"#0a0f0a",border:"1px solid #4e7d3d22",borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:12,color:GREEN,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6,fontFamily:"'Open Sans',sans-serif"}}>Key Discovery Questions</div>
                    {brief.questions?.map((q,i)=><div key={i} style={{fontSize:13,color:TEXT,lineHeight:1.7,fontFamily:"'Open Sans',sans-serif"}}>{i+1}. {q}</div>)}
                  </div>
                  {brief.objections?.map((o,i)=>(
                    <div key={i} style={{background:"#0f0a0a",border:"1px solid #c0392b22",borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:RED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontFamily:"'Open Sans',sans-serif"}}>Objection {i+1}</div>
                      <div style={{fontSize:13,color:TEXT,fontStyle:"italic",lineHeight:1.6,fontFamily:"'Open Sans',sans-serif",marginBottom:6}}>"{o.objection}"</div>
                      <div style={{fontSize:12,color:GREEN,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:3,fontFamily:"'Open Sans',sans-serif"}}>Rebuttal</div>
                      <div style={{fontSize:13,color:TEXT,fontStyle:"italic",lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>"{o.rebuttal}"</div>
                    </div>
                  ))}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{background:"#0f0d08",border:"1px solid #b7860b22",borderLeft:`3px solid ${AMBER}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:AMBER,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontFamily:"'Open Sans',sans-serif"}}>Tone</div>
                      <div style={{fontSize:13,color:TEXT,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>{brief.tone}</div>
                    </div>
                    <div style={{background:"#0f0a0a",border:"1px solid #c0392b22",borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:RED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontFamily:"'Open Sans',sans-serif"}}>Never Say</div>
                      <div style={{fontSize:13,color:TEXT,fontStyle:"italic",lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>"{brief.neverSay}"</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={startSession} style={{width:"100%",background:GREEN,border:"none",borderRadius:6,padding:"14px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>
              Start Practice Call
            </button>
          </div>
        </div>
      )}

      {phase==="active"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:700,width:"100%",margin:"0 auto",padding:"16px 20px 0",overflow:"hidden"}}>
          {/* Seed moment header */}
          {seedMoment&&(
            <div style={{background:"rgba(183,134,11,0.08)",border:`1px solid ${AMBER}33`,borderRadius:8,padding:"10px 14px",marginBottom:12,flexShrink:0}}>
              <div style={{fontSize:11,fontWeight:800,color:AMBER,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:3,fontFamily:"'Open Sans',sans-serif"}}>
                PRACTICING: {seedMoment.category}
              </div>
              <div style={{fontSize:12,color:T2,fontFamily:"'Open Sans',sans-serif",lineHeight:1.5}}>{seedMoment.challenge}</div>
            </div>
          )}
          {/* Momentum bar */}
          <div style={{height:4,background:S2,borderRadius:2,overflow:"hidden",marginBottom:12,flexShrink:0}}>
            {runningAvg!==null&&(
              <div style={{width:`${runningAvg}%`,height:"100%",background:runningAvg>=65?GREEN:runningAvg>=50?AMBER:RED,borderRadius:2,transition:"width .6s ease, background .6s ease"}}/>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexShrink:0}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{scenario.label}</div>
              <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{scenario.desc}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {runningAvg!==null&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>Running avg</div>
                  <div style={{fontSize:16,fontWeight:800,color:gc(runningAvg),letterSpacing:"0.04em",fontFamily:"'Open Sans',sans-serif"}}>{runningAvg}</div>
                </div>
              )}
              <button onClick={toggleVoiceMode}
                style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"5px 10px",color:T3,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>
                {voiceMode?"TEXT MODE":"VOICE MODE"}
              </button>
              <button onClick={fetchHint} disabled={hintsLeft===0||hintLoading}
                style={{background:"transparent",border:`1px solid ${hintsLeft>0?AMBER+"55":B3}`,borderRadius:6,padding:"5px 10px",color:hintsLeft>0?AMBER:T3,fontSize:12,fontWeight:600,cursor:hintsLeft>0?"pointer":"default",fontFamily:"'Open Sans',sans-serif",opacity:hintLoading?0.6:1}}>
                {hintLoading?"…":`💡 ${hintsLeft} left`}
              </button>
              <button onClick={endSession} style={{background:"#1a0a0a",border:`1px solid ${RED}30`,borderRadius:6,padding:"7px 13px",color:RED,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>End &amp; Score</button>
            </div>
          </div>

          {/* Situation card */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexShrink:0,background:S1,border:`1px solid ${B2}`,borderRadius:8,padding:"7px 12px"}}>
            <span style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{scenario.label}</span>
            <span style={{color:B3,fontSize:12,fontFamily:"'Open Sans',sans-serif"}}>·</span>
            <span style={{fontSize:11,fontWeight:600,color:personalityColor(scenario.personality),textTransform:"capitalize",fontFamily:"'Open Sans',sans-serif"}}>{scenario.personality}</span>
            <span style={{color:B3,fontSize:12,fontFamily:"'Open Sans',sans-serif"}}>·</span>
            <span style={{fontSize:11,fontWeight:600,color:difficulty==="hard"?RED:difficulty==="easy"?GREEN:AMBER,fontFamily:"'Open Sans',sans-serif"}}>{difficulty==="easy"?"Easy":difficulty==="hard"?"Hard":"Medium"} Mode</span>
            <button onClick={()=>setSellerBriefOpen(o=>!o)}
              style={{marginLeft:"auto",background:"transparent",border:`1px solid ${B3}`,borderRadius:5,padding:"2px 10px",color:T3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>
              📋 Brief
            </button>
          </div>

          <div ref={chatRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:8}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="rep"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"76%",background:m.role==="rep"?"#0a1a0a":S1,border:`1px solid ${m.role==="rep"?DKGREEN:B1}`,borderRadius:m.role==="rep"?"8px 8px 3px 8px":"8px 8px 8px 3px",padding:"10px 14px"}}>
                  <div style={{fontSize:12,color:T3,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'Open Sans',sans-serif"}}>{m.role==="rep"?"You (Rep)":"Seller"}</div>
                  <div style={{fontSize:12,lineHeight:1.75,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{m.text}</div>
                </div>
                {m.role==="seller"&&m.score!==null&&(
                  <div style={{maxWidth:"76%",marginTop:4,background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${sc(m.status)}`,borderRadius:6,padding:"6px 11px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:m.rewrite?3:0}}>
                      <span style={{fontSize:13,fontWeight:800,color:sc(m.status),letterSpacing:"0.04em",fontFamily:"'Open Sans',sans-serif"}}>{m.score}/10</span>
                      <span style={{fontSize:12,color:T2,flex:1,fontFamily:"'Open Sans',sans-serif"}}>{m.feedback}</span>
                    </div>
                    {m.rewrite&&<div style={{fontSize:12,color:GREEN,fontStyle:"italic",fontFamily:"'Open Sans',sans-serif"}}>Try: "{m.rewrite}"</div>}
                  </div>
                )}
              </div>
            ))}
            {loading&&!voiceMode&&(
              <div style={{display:"flex",alignItems:"flex-start"}}>
                <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:"8px 8px 8px 3px",padding:"12px 16px"}}>
                  <span style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>Responding…</span>
                </div>
              </div>
            )}
            {voiceMode&&(callPhase==="thinking"||callPhase==="speaking")&&(
              <div style={{display:"flex",alignItems:"flex-start"}}>
                <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:"8px 8px 8px 3px",padding:"12px 16px"}}>
                  <span style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{callPhase==="thinking"?"Seller composing response…":"Seller speaking…"}</span>
                </div>
              </div>
            )}
          </div>

          {voiceMode?(
            <div style={{borderTop:`1px solid ${B1}`,paddingTop:14,paddingBottom:14,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <CallStatusIndicator callPhase={callPhase}/>
              <HoldToSpeakButton callPhase={callPhase} onStart={startRecording} onStop={stopAndSend}/>
              <div style={{fontSize:13,color:T3,fontFamily:"'Open Sans',sans-serif"}}>Hold to speak · release to send</div>
            </div>
          ):(
            <div style={{borderTop:`1px solid ${B1}`,paddingTop:10,paddingBottom:14,flexShrink:0,display:"flex",gap:8,alignItems:"flex-start"}}>
              <MicButton onTranscribed={t=>setInput(prev=>prev?prev+" "+t:t)} disabled={loading}/>
              <textarea value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder="Speak with Mic or type your line… (Enter to send)"
                style={{flex:1,height:54,background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"10px 14px",color:TEXT,fontSize:12,resize:"none",outline:"none",lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}/>
              <button onClick={sendMessage} disabled={loading||!input.trim()}
                style={{background:GREEN,border:"none",borderRadius:8,padding:"0 18px",height:54,color:TEXT,fontSize:22,fontWeight:900,cursor:"pointer",opacity:loading||!input.trim()?.45:1,flexShrink:0,lineHeight:1}}>↑</button>
            </div>
          )}

          <ScoreToast toast={voiceMode?toast:null}/>
          {hint&&(
            <div className="fade" style={{position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",zIndex:400,
              background:S1,border:`1px solid ${AMBER}44`,borderLeft:`3px solid ${AMBER}`,borderRadius:8,
              padding:"10px 16px",minWidth:280,maxWidth:440,pointerEvents:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:AMBER,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontFamily:"'Open Sans',sans-serif"}}>💡 Coaching Hint</div>
              <div style={{fontSize:13,color:TEXT,lineHeight:1.55,fontFamily:"'Open Sans',sans-serif"}}>{hint}</div>
            </div>
          )}
          {/* Seller Brief overlay panel — no backdrop so UI buttons remain clickable */}
          <div style={{position:"fixed",left:sellerBriefOpen?0:-290,top:0,bottom:0,width:280,zIndex:340,
            background:"rgba(13,13,13,0.97)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
            borderRight:`1px solid ${B3}`,display:"flex",flexDirection:"column",
            transition:"left .25s cubic-bezier(.4,0,.2,1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 12px",borderBottom:`1px solid ${B2}`,flexShrink:0}}>
              <div style={{fontSize:11,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:"'Open Sans',sans-serif"}}>📋 Seller Brief</div>
              <button onClick={()=>setSellerBriefOpen(false)}
                style={{background:"transparent",border:"none",color:T3,fontSize:17,cursor:"pointer",padding:"2px 6px",lineHeight:1}}>✕</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:3,fontFamily:"'Open Sans',sans-serif"}}>{scenario.label}</div>
                <div style={{fontSize:12,color:T2,lineHeight:1.5,fontFamily:"'Open Sans',sans-serif"}}>{scenario.desc}</div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontFamily:"'Open Sans',sans-serif"}}>Background</div>
                <div style={{fontSize:12,color:TEXT,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>{scenario.backstory}</div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontFamily:"'Open Sans',sans-serif"}}>Their Motivation</div>
                <div style={{fontSize:12,color:TEXT,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>{scenario.motivation}</div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontFamily:"'Open Sans',sans-serif"}}>Price Expectation</div>
                <div style={{fontSize:12,color:AMBER,fontWeight:600,fontFamily:"'Open Sans',sans-serif"}}>{scenario.price_anchor}</div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontFamily:"'Open Sans',sans-serif"}}>Personality</div>
                <span style={{fontSize:11,fontWeight:600,color:personalityColor(scenario.personality),background:personalityColor(scenario.personality)+"22",borderRadius:4,padding:"3px 9px",textTransform:"capitalize",fontFamily:"'Open Sans',sans-serif"}}>{scenario.personality}</span>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,fontFamily:"'Open Sans',sans-serif"}}>Watch for These Objections</div>
                {scenario.objections.map((obj,i)=>(
                  <div key={i} style={{fontSize:11,color:T2,lineHeight:1.55,marginBottom:6,paddingLeft:10,borderLeft:`2px solid ${B3}`,fontFamily:"'Open Sans',sans-serif"}}>{obj}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {phase==="scored"&&sessionScore!==null&&(
        <ScoredPhase sessionScore={sessionScore} scenario={scenario} exchangeScores={exchangeScores} messages={messages}
          onTryAgain={()=>{
            if(seedMoment){
              setMessages([{role:"seller",text:seedOpening,score:null,feedback:null,rewrite:null,status:null}]);
              setPhase("active");
            } else {
              setPhase("setup");setMessages([]);
            }
            setExchangeScores([]);setSessionScore(null);
          }}
          onBack={onBack}/>
      )}
    </div>
  );
}

// ── AI DRILL CARD ─────────────────────────────────────────────────────────────
function AIDrillCard({drill,onComplete,completed}){
  const isCritical=drill.status==="critical"||drill.status==="weak";
  const borderColor=drill.status==="critical"?RED:AMBER;
  const bgColor=drill.status==="critical"?"#0f0a0a":"#0f0d08";
  const labelColor=drill.status==="critical"?RED:AMBER;
  const labelStyle={fontSize:12,fontWeight:700,color:labelColor,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontFamily:"'Open Sans',sans-serif"};

  return(
    <div style={{
      background:bgColor,border:`1px solid ${borderColor}22`,borderLeft:`3px solid ${borderColor}`,borderRadius:8,padding:"14px 16px",
      opacity:completed?0.4:1,transition:"opacity .3s",position:"relative"
    }}>
      {completed&&(
        <div style={{position:"absolute",top:12,right:14,display:"flex",alignItems:"center",gap:4}}>
          <span style={{color:GREEN,fontSize:12}}>✓</span>
          <span style={{fontSize:13,color:GREEN,fontWeight:600,fontFamily:"'Open Sans',sans-serif"}}>Completed</span>
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:"'Open Sans',sans-serif"}}>{drill.category}</span>
        <span style={{fontSize:12,fontWeight:700,color:labelColor,background:labelColor+"18",borderRadius:10,padding:"2px 8px",fontFamily:"'Open Sans',sans-serif"}}>{drill.status}</span>
      </div>

      {/* SELLER SAYS */}
      <div style={labelStyle}>SELLER SAYS</div>
      <div style={{background:"#0f0a0a",borderLeft:`2px solid ${RED}`,borderRadius:4,padding:"8px 10px",marginBottom:10}}>
        <div style={{fontSize:13,fontStyle:"italic",color:TEXT,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>"{drill.sellerLine}"</div>
      </div>

      {/* YOUR GOAL */}
      <div style={labelStyle}>YOUR GOAL</div>
      <div style={{background:"#0a0f0a",borderLeft:`2px solid ${GREEN}`,borderRadius:4,padding:"8px 10px",marginBottom:10}}>
        <div style={{fontSize:13,color:TEXT,lineHeight:1.7,fontFamily:"'Open Sans',sans-serif"}}>{drill.goal}</div>
      </div>

      {/* COACHING TIP */}
      <div style={labelStyle}>COACHING TIP</div>
      <div style={{background:"#0f0d08",borderLeft:`2px solid ${AMBER}`,borderRadius:4,padding:"8px 10px",marginBottom:10}}>
        <div style={{fontSize:13,color:T2,lineHeight:1.75,fontFamily:"'Open Sans',sans-serif"}}>{drill.tip}</div>
      </div>

      {/* WHAT TO SAY */}
      <div style={labelStyle}>WHAT TO SAY</div>
      <div style={{background:"#0a0f0a",border:`1px solid ${GREEN}22`,borderLeft:`2px solid ${GREEN}`,borderRadius:4,padding:"8px 10px",marginBottom:12}}>
        <div style={{fontSize:12,fontStyle:"italic",color:TEXT,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>"{drill.rewrite}"</div>
      </div>

      {!completed&&(
        <button onClick={onComplete}
          style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 14px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>
          Mark complete
        </button>
      )}
    </div>
  );
}

// ── WEAK SPOT DRILLS (AI-POWERED) ─────────────────────────────────────────────
function WeakSpotDrills({rep}){
  const cats=getRepCategoryScores(rep);
  const weakest=[...cats].sort((a,b)=>a.score-b.score).slice(0,3);
  const [aiDrills,setAiDrills]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);
  const [completed,setCompleted]=useState(()=>{
    try{const s=localStorage.getItem("acqcoach_completed_drills");if(s)return JSON.parse(s);}catch(e){}
    return {};
  });

  const markComplete=(i)=>{
    setCompleted(p=>{const next={...p,[i]:true};try{localStorage.setItem("acqcoach_completed_drills",JSON.stringify(next));}catch(e){}return next;});
  };

  const fetchDrills=()=>{
    setLoading(true);setError(false);setAiDrills(null);
    setCompleted({});try{localStorage.removeItem("acqcoach_completed_drills");}catch(e){}

    const repCalls=INIT_CALLS.filter(c=>c.repId===rep.id);
    const recentCallTypes=[...new Set(repCalls.slice(0,5).map(c=>c.type))].join(", ");
    const lastTalk=rep.talks?.[rep.talks.length-1]||{r:50,s:50};

    fetch(AI_CHAT_URL,{
      method:"POST",
      headers:AI_CHAT_HEADERS,
      body:JSON.stringify({
        max_tokens:1200,
        system:`You are ACQ Coach AI for real estate wholesalers. Generate hyper-specific practice drills for an acquisition rep based on their weak scoring categories. Each drill must be grounded in real acquisition call situations — probate, pre-foreclosure, tired landlord, divorce, absentee owner, or cold calls. Respond ONLY valid JSON, no markdown: {"drills":[{"category":"string","status":"string","sellerLine":"string","goal":"string","tip":"string","rewrite":"string"}]}`,
        messages:[{
          role:"user",
          content:`Rep name: ${rep.name}\nRep experience level: ${rep.exp}\nWeak categories and scores: ${weakest.map(c=>c.name+" — "+c.score+"/10 ("+c.status+")").join(", ")}\nRecent call types: ${recentCallTypes}\nTalk ratio: Rep ${lastTalk.r}% / Seller ${lastTalk.s}%\n\nGenerate one targeted drill per weak category. Make each sellerLine a realistic, specific objection or response that matches the rep's experience level. Make the tip actionable — one specific technique, not generic advice.`
        }]
      })
    })
    .then(r=>{if(!r.ok)throw new Error("API error");return r.json();})
    .then(data=>{
      const text=data.content?.[0]?.text||"";
      const parsed=JSON.parse(text);
      if(parsed.drills&&Array.isArray(parsed.drills)){
        setAiDrills(parsed.drills);
      }else{throw new Error("Bad format");}
      setLoading(false);
    })
    .catch(()=>{setError(true);setLoading(false);});
  };

  useEffect(()=>{
    fetchDrills();
  },[rep.id]);

  // Loading state
  if(loading){
    return(
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 16px",display:"flex",flexDirection:"column"}}>
        <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:10}}>Weak Spot Drills</div>
        <div style={{background:"#0f0a0a",border:`1px solid ${B1}`,borderRadius:8,padding:"24px 16px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:GREEN,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:13,color:T2,fontFamily:"'Open Sans',sans-serif"}}>Generating your drills…</span>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
      </div>
    );
  }

  // AI drills loaded
  if(aiDrills&&!error){
    return(
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 16px",display:"flex",flexDirection:"column"}}>
        <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:10}}>Weak Spot Drills</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,flex:1}}>
          {aiDrills.map((drill,i)=>(
            <AIDrillCard key={i} drill={drill} completed={!!completed[i]} onComplete={()=>markComplete(i)}/>
          ))}
        </div>
        <button onClick={fetchDrills}
          style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"7px 14px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif",marginTop:12,alignSelf:"flex-start"}}>
          Regenerate Drills
        </button>
      </div>
    );
  }

  // Fallback: static drills + error note
  return(
    <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 16px",display:"flex",flexDirection:"column"}}>
      <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:10}}>Weak Spot Drills</div>
      {error&&(
        <div style={{fontSize:13,color:T3,marginBottom:10,fontFamily:"'Open Sans',sans-serif",lineHeight:1.5}}>
          Using standard drills — AI personalization temporarily unavailable.
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
        {weakest.map(cat=>{
          const drill=DRILL_PROMPTS[cat.name];
          const isCritical=cat.status==="critical";
          return(
            <div key={cat.name} style={{background:isCritical?"#0f0a0a":"#0f0d08",borderLeft:`3px solid ${isCritical?RED:AMBER}`,borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:12,fontWeight:700,color:TEXT,marginBottom:3,fontFamily:"'Open Sans',sans-serif"}}>{cat.name}</div>
              {drill&&<div style={{fontSize:13,color:T2,fontStyle:"italic",marginBottom:4,lineHeight:1.5,fontFamily:"'Open Sans',sans-serif"}}>"{drill.objection}"</div>}
              {drill&&<div style={{fontSize:13,color:T3,lineHeight:1.5,fontFamily:"'Open Sans',sans-serif"}}>{drill.tip}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PRE-CALL BRIEF GENERATOR ──────────────────────────────────────────────────
const SELLER_TYPES=["Probate","Pre-Foreclosure","Tired Landlord","Divorce","Absentee Owner","Cold Call"];
function PreCallBrief({rep}){
  const [sellerType,setSellerType]=useState(SELLER_TYPES[0]);
  const [brief,setBrief]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);

  const generate=()=>{
    setLoading(true);setError(false);setBrief(null);
    fetch(AI_CHAT_URL,{
      method:"POST",
      headers:AI_CHAT_HEADERS,
      body:JSON.stringify({
        max_tokens:1200,
        system:`You are ACQ Coach AI for real estate wholesalers. Generate a pre-call brief for a rep about to call a specific seller type. Respond ONLY valid JSON, no markdown: {"questions":["string","string","string"],"objections":[{"objection":"string","rebuttal":"string"},{"objection":"string","rebuttal":"string"}],"tone":"string","neverSay":"string"}`,
        messages:[{role:"user",content:`Rep: ${rep.name} (${rep.exp})\nSeller type: ${sellerType}\nGenerate a pre-call brief with:\n- 3 key discovery questions specific to ${sellerType} sellers\n- 2 likely objections with exact rebuttal scripts\n- Recommended emotional tone for this seller type\n- One thing to NEVER say to this seller type`}]
      })
    })
    .then(r=>{if(!r.ok)throw new Error();return r.json();})
    .then(data=>{
      try{const parsed=JSON.parse(data.content[0].text);setBrief(parsed);}catch(e){setError(true);}
    })
    .catch(()=>setError(true))
    .finally(()=>setLoading(false));
  };

  return(
    <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 16px",display:"flex",flexDirection:"column"}}>
      <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Pre-Call Brief</div>
      <div style={{fontSize:12,color:T2,lineHeight:1.6,marginBottom:12,fontFamily:"'Open Sans',sans-serif"}}>Generate a tailored brief before calling a seller.</div>
      <select value={sellerType} onChange={e=>setSellerType(e.target.value)}
        style={{width:"100%",boxSizing:"border-box",background:BG,border:`1px solid ${B3}`,borderRadius:6,padding:"8px 10px",color:TEXT,fontSize:13,fontFamily:"'Open Sans',sans-serif",marginBottom:10,outline:"none",cursor:"pointer"}}>
        {SELLER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <button onClick={generate} disabled={loading}
        style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 16px",color:TEXT,fontSize:13,fontWeight:700,cursor:loading?"wait":"pointer",fontFamily:"'Open Sans',sans-serif",width:"100%",opacity:loading?0.6:1}}>
        {loading?"Generating…":"Generate Brief"}
      </button>
      {error&&!loading&&<div style={{fontSize:13,color:T3,marginTop:8,fontFamily:"'Open Sans',sans-serif"}}>Failed — please try again.</div>}
      {brief&&!loading&&(
        <div className="fade" style={{marginTop:14,display:"flex",flexDirection:"column",gap:10}}>
          {/* Discovery Questions */}
          <div style={{background:"#0a0f0a",border:"1px solid #4e7d3d22",borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{fontSize:12,color:GREEN,fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Key Discovery Questions</div>
            {brief.questions.map((q,i)=>(
              <div key={i} style={{fontSize:12,color:TEXT,lineHeight:1.7,fontFamily:"'Open Sans',sans-serif",marginBottom:4}}>
                {i+1}. {q}
              </div>
            ))}
          </div>
          {/* Objections & Rebuttals */}
          {brief.objections.map((o,i)=>(
            <div key={i} style={{background:"#0f0a0a",border:"1px solid #c0392b22",borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:12,color:RED,fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Objection {i+1}</div>
              <div style={{fontSize:12,color:TEXT,fontStyle:"italic",lineHeight:1.7,fontFamily:"'Open Sans',sans-serif",marginBottom:8}}>"{o.objection}"</div>
              <div style={{fontSize:12,color:GREEN,fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>Rebuttal</div>
              <div style={{fontSize:12,color:TEXT,fontStyle:"italic",lineHeight:1.7,fontFamily:"'Open Sans',sans-serif"}}>"{o.rebuttal}"</div>
            </div>
          ))}
          {/* Emotional Tone */}
          <div style={{background:"#0f0d08",border:"1px solid #b7860b22",borderLeft:`3px solid ${AMBER}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{fontSize:12,color:AMBER,fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Recommended Tone</div>
            <div style={{fontSize:12,color:TEXT,lineHeight:1.7,fontFamily:"'Open Sans',sans-serif"}}>{brief.tone}</div>
          </div>
          {/* Never Say */}
          <div style={{background:"#0f0a0a",border:"1px solid #c0392b22",borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{fontSize:12,color:RED,fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Never Say</div>
            <div style={{fontSize:12,color:TEXT,fontStyle:"italic",lineHeight:1.7,fontFamily:"'Open Sans',sans-serif"}}>"{brief.neverSay}"</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TRAINING CENTER ───────────────────────────────────────────────────────────
function TrainingCenter({rep,onRoleplay,teamReps=INIT_REPS,onLeaderboard}){
  const sorted=[...teamReps].sort((a,b)=>b.avg-a.avg);
  const myRank=getTeamRank(rep.id,teamReps);
  const topReps=sorted.slice(0,4);
  const meInTop=topReps.some(r=>r.id===rep.id);

  return(
    <div style={{marginTop:24}}>
      <div style={{fontSize:13,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,fontFamily:"'Open Sans',sans-serif"}}>Training Center</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {/* Practice Call */}
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 16px",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Practice Call</div>
          <div style={{fontSize:12,color:T2,lineHeight:1.6,marginBottom:12,flex:1,fontFamily:"'Open Sans',sans-serif"}}>Launch a roleplay scenario to practice your skills against a realistic seller.</div>
          {rep.scores.length>0&&(
            <div style={{fontSize:13,color:T3,marginBottom:10,fontFamily:"'Open Sans',sans-serif"}}>Last score: <span style={{color:gc(rep.scores[rep.scores.length-1]*10),fontWeight:700}}>{rep.scores[rep.scores.length-1]}</span></div>
          )}
          <button onClick={onRoleplay}
            style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 16px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif",width:"100%"}}>
            Start Practice
          </button>
        </div>

        {/* Weak Spot Drills — AI-powered */}
        <WeakSpotDrills rep={rep}/>

        {/* Pre-Call Brief */}
        <PreCallBrief rep={rep}/>

        {/* Leaderboard tile — compact preview with category dots */}
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 16px",display:"flex",flexDirection:"column"}}>
          {/* Tile header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.04em"}}>Leaderboard</div>
            {onLeaderboard&&(
              <button onClick={onLeaderboard}
                style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:5,padding:"3px 9px",color:T2,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>
                Expand →
              </button>
            )}
          </div>
          {/* Rank indicator */}
          <div style={{fontSize:11,color:T3,marginBottom:10,fontFamily:"'Open Sans',sans-serif"}}>
            You rank{" "}
            <span style={{color:TEXT,fontWeight:700}}>#{myRank}</span>
            {" "}of{" "}
            <span style={{color:TEXT,fontWeight:700}}>{teamReps.length}</span>
          </div>
          {/* Top-4 rows */}
          <div style={{display:"flex",flexDirection:"column",gap:5,flex:1}}>
            {topReps.map((r,i)=>{
              const isMe=r.id===rep.id;
              const catScores=getRepCategoryScores(r);
              return(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",background:isMe?S2:"transparent",border:isMe?`1px solid ${B1}`:"1px solid transparent",borderLeft:isMe?`3px solid ${GREEN}`:"3px solid transparent",borderRadius:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:i===0?"#8a6a00":T3,width:14,fontFamily:"'Open Sans',sans-serif"}}>{i+1}</span>
                  <div style={{width:22,height:22,borderRadius:5,background:isMe?GREEN+"22":S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:isMe?GREEN:TEXT,flexShrink:0,letterSpacing:"0.04em"}}>
                    {r.avatar}
                  </div>
                  <span style={{fontSize:11,fontWeight:isMe?700:500,color:isMe?TEXT:T2,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Open Sans',sans-serif"}}>{r.name}</span>
                  <span style={{fontSize:12,fontWeight:700,color:gc(r.avg),letterSpacing:"0.04em",fontFamily:"'Open Sans',sans-serif"}}>{r.avg}</span>
                  <div style={{display:"flex",gap:2,alignItems:"center"}}>
                    {catScores.map((c,ci)=>(
                      <div key={ci} title={`${c.name}: ${c.score}/10`}
                        style={{width:5,height:5,borderRadius:"50%",background:c.score>=8?GREEN:c.score>=6?AMBER:RED,opacity:0.7,flexShrink:0}}/>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Show current rep below fold if outside top 4 */}
            {!meInTop&&(
              <>
                <div style={{textAlign:"center",color:T3,fontSize:11,fontFamily:"'Open Sans',sans-serif"}}>· · ·</div>
                <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",background:S2,border:`1px solid ${B1}`,borderLeft:`3px solid ${GREEN}`,borderRadius:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:T3,width:14,fontFamily:"'Open Sans',sans-serif"}}>#{myRank}</span>
                  <div style={{width:22,height:22,borderRadius:5,background:GREEN+"22",border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:GREEN,flexShrink:0,letterSpacing:"0.04em"}}>
                    {rep.avatar}
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:TEXT,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Open Sans',sans-serif"}}>{rep.name}</span>
                  <span style={{fontSize:12,fontWeight:700,color:gc(rep.avg),letterSpacing:"0.04em",fontFamily:"'Open Sans',sans-serif"}}>{rep.avg}</span>
                  <div style={{display:"flex",gap:2,alignItems:"center"}}>
                    {getRepCategoryScores(rep).map((c,ci)=>(
                      <div key={ci} style={{width:5,height:5,borderRadius:"50%",background:c.score>=8?GREEN:c.score>=6?AMBER:RED,opacity:0.7,flexShrink:0}}/>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS TAB ──────────────────────────────────────────────────────────────
function SettingsTab(){
  return(
    <div style={{maxWidth:480}}>
      <div style={{fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16}}>Voice & AI</div>
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"20px 18px",marginBottom:14,fontSize:12,color:T3,fontFamily:"'Open Sans',sans-serif",lineHeight:1.6}}>
        AI scoring, drills, voice transcription, and seller voice playback are powered by the backend. Reps do not need to add any API key.
      </div>
    </div>
  );
}

// ── COMPETE TAB ───────────────────────────────────────────────────────────────
const CAT_NAMES_R=["Introduction and Positioning","Rapport Building","Motivation Discovery","Timeline Discovery","Financial Discovery","Offer Presentation","Objection Handling","First No Recovery","Next Step Close"];

function compDaysLeftR(endsAt){
  const diff=Math.ceil((new Date(endsAt)-Date.now())/86400000);
  if(diff<0)return"Ended";
  if(diff===0)return"Ends today";
  return`${diff}d left`;
}

function CompeteTab({rep,teamReps,accountId}){
  const [comps,setComps]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!accountId){setLoading(false);return;}
    supabase.from("competitions").select("*").eq("account_id",accountId).order("ends_at",{ascending:false})
      .then(({data})=>setComps(data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[accountId]);

  function getStandings(comp){
    return teamReps.map(r=>{
      let score=0;
      if(comp.metric==="call_count"){score=r.week||0;}
      else if(comp.metric==="improvement"){score=r.trend||0;}
      else{
        if(comp.category_index==null){score=r.avg||0;}
        else{const cat=(r.categoryAverages||[])[comp.category_index];score=cat?cat.score:0;}
      }
      return{id:r.id,score};
    }).sort((a,b)=>b.score-a.score);
  }

  // Badges
  const badges=[];
  if((rep.streak||0)>=3)badges.push({emoji:"🔥",label:"On a Streak",desc:`${rep.streak} calls in a row improving`});
  const topTrend=[...teamReps].sort((a,b)=>(b.trend||0)-(a.trend||0))[0];
  if(topTrend&&topTrend.id===rep.id&&(rep.trend||0)>0)badges.push({emoji:"📈",label:"Most Improved",desc:"Highest trend on the team this week"});
  const teamAvg=teamReps.length?teamReps.reduce((s,r)=>s+(r.avg||0),0)/teamReps.length:0;
  const recent5=(rep.scores||[]).slice(-5);
  if(recent5.length>=5&&recent5.every(s=>s>=teamAvg))badges.push({emoji:"🏅",label:"Consistent Performer",desc:"Last 5 calls all above team average"});

  const now=new Date();
  const activeComps=comps.filter(c=>new Date(c.ends_at)>=now);

  if(loading)return<div style={{padding:"24px 0",color:T3,fontSize:13,fontFamily:"'Open Sans',sans-serif"}}>Loading…</div>;

  return(
    <div>
      {badges.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:T3,marginBottom:10,fontFamily:"'Open Sans',sans-serif"}}>Your Badges</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {badges.map((b,i)=>(
              <div key={i} style={{background:S1,border:`1px solid ${B2}`,borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:20}}>{b.emoji}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{b.label}</div>
                  <div style={{fontSize:10,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:T3,marginBottom:10,fontFamily:"'Open Sans',sans-serif"}}>Active Competitions</div>

      {activeComps.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:T3,fontSize:12,fontFamily:"'Open Sans',sans-serif",lineHeight:1.8}}>
          No active competitions right now.<br/>Check back soon — your manager will create one!
        </div>
      )}

      {activeComps.map(comp=>{
        const standings=getStandings(comp);
        const myRank=standings.findIndex(s=>s.id===rep.id)+1||standings.length;
        const myScore=standings.find(s=>s.id===rep.id)?.score||0;
        const leaderScore=standings[0]?.score||0;
        const pct=leaderScore>0?Math.round((myScore/leaderScore)*100):0;
        const catLabel=comp.category_index!=null?CAT_NAMES_R[comp.category_index]:"Overall";
        const metricLabel={improvement:"Most Improved",absolute:"Highest Score",call_count:"Most Calls"}[comp.metric]||comp.metric;
        return(
          <div key={comp.id} style={{background:S1,border:`1px solid ${B2}`,borderRadius:8,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{comp.title}</div>
                <div style={{fontSize:11,color:T3,fontFamily:"'Open Sans',sans-serif",marginTop:2}}>{catLabel} · {metricLabel}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                {comp.prize_label&&<div style={{fontSize:10,fontWeight:700,color:AMBER,fontFamily:"'Open Sans',sans-serif"}}>🏆 {comp.prize_label}</div>}
                <div style={{fontSize:10,color:GREEN,fontWeight:600,fontFamily:"'Open Sans',sans-serif"}}>{compDaysLeftR(comp.ends_at)}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <div style={{fontSize:22,fontWeight:800,color:myRank===1?AMBER:TEXT,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",lineHeight:1}}>#{myRank}</div>
              <div style={{fontSize:12,color:T2,fontFamily:"'Open Sans',sans-serif"}}>of {standings.length} reps</div>
            </div>
            <div style={{height:6,background:B3,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,height:"100%",background:myRank===1?AMBER:GREEN,borderRadius:3,transition:"width .4s"}}/>
            </div>
            <div style={{fontSize:10,color:T3,fontFamily:"'Open Sans',sans-serif",marginTop:4,textAlign:"right"}}>{pct}% of leader's score</div>
          </div>
        );
      })}
    </div>
  );
}

// ── CHAT DRAWER ───────────────────────────────────────────────────────────────
const CHAT_STARTERS=["What should I focus on this week?","Why is my close rate low?","Give me a drill for objection handling","How do I handle price objections?"];

function ChatDrawer({rep,onClose}){
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const endRef=useRef(null);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  function buildCtx(){
    const cats=rep.categoryAverages||[];
    const bottom3=[...cats].sort((a,b)=>a.score-b.score).slice(0,3);
    return{
      rep_name:rep.name,overall_avg:rep.avg,trend:rep.trend,
      call_count:rep.total||0,
      category_averages:cats.map(c=>({name:c.name,score:Math.round(c.score)})),
      bottom_3_categories:bottom3.map(c=>({name:c.name,score:Math.round(c.score)})),
      recent_call_scores:(rep.scores||[]).slice(-5),
    };
  }

  async function send(text){
    const t=(text||input).trim();
    if(!t||loading)return;
    const next=[...messages,{role:"user",text:t}];
    setMessages(next);setInput("");setLoading(true);
    try{
      const sys=`You are a sales coaching assistant for a real estate acquisitions rep. You have access to their performance data: ${JSON.stringify(buildCtx())}. Give specific, actionable coaching advice based on their actual scores. Be direct and concise — 2-3 sentences max per response.`;
      const res=await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:AI_CHAT_HEADERS,
        body:JSON.stringify({
          system:sys,max_tokens:200,
          messages:next.map(m=>({role:m.role==="user"?"user":"assistant",content:m.text})),
        }),
      });
      const data=await res.json();
      if(!res.ok||data.error)throw new Error(data.error||"AI error");
      const aiText=(data.content||[]).map(b=>b.text||"").join("").trim();
      setMessages(p=>[...p,{role:"ai",text:aiText||"Keep pushing — ask me anything specific about your scores."}]);
    }catch(e){
      setMessages(p=>[...p,{role:"ai",text:"Couldn't connect right now. Try again in a moment."}]);
    }
    setLoading(false);
  }

  const isEmpty=messages.length===0;

  return(
    <>
      <style>{`
        @keyframes chatBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        .chat-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#555;animation:chatBounce 1.2s infinite ease-in-out}
      `}</style>
      {/* Backdrop */}
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000}}/>
      {/* Drawer */}
      <div style={{position:"fixed",top:0,right:0,bottom:0,width:380,maxWidth:"100vw",background:S1,borderLeft:`1px solid ${B2}`,zIndex:1001,display:"flex",flexDirection:"column",fontFamily:"'Open Sans',sans-serif",animation:"slideInRight .22s ease"}}>
        <style>{`@keyframes slideInRight{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
        {/* Header */}
        <div style={{padding:"13px 16px",borderBottom:`1px solid ${B2}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:30,height:30,borderRadius:8,background:GREEN,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>💬</div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:TEXT,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'League Spartan',sans-serif"}}>AI Coach</div>
              <div style={{fontSize:10,color:T3,marginTop:1}}>Based on your performance data</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T3,fontSize:17,cursor:"pointer",padding:"4px 6px",lineHeight:1,borderRadius:4}}>✕</button>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
          {isEmpty&&(
            <div>
              <div style={{textAlign:"center",color:T3,fontSize:12,margin:"20px 0 16px",lineHeight:1.7}}>
                Ask me anything about your<br/>performance and how to improve.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {CHAT_STARTERS.map((p,i)=>(
                  <button key={i} onClick={()=>send(p)} style={{background:B2,border:`1px solid ${B3}`,borderRadius:8,padding:"9px 13px",color:TEXT,fontSize:12,textAlign:"left",cursor:"pointer",fontFamily:"'Open Sans',sans-serif",lineHeight:1.45}}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"86%",background:m.role==="user"?GREEN:B2,border:m.role==="user"?"none":`1px solid ${B3}`,borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"9px 13px",fontSize:13,color:TEXT,lineHeight:1.5,fontFamily:"'Open Sans',sans-serif"}}>
                {m.text}
              </div>
            </div>
          ))}
          {loading&&(
            <div style={{display:"flex",justifyContent:"flex-start"}}>
              <div style={{background:B2,border:`1px solid ${B3}`,borderRadius:"12px 12px 12px 4px",padding:"11px 15px",display:"flex",gap:5,alignItems:"center"}}>
                <span className="chat-dot"/>
                <span className="chat-dot" style={{animationDelay:".2s"}}/>
                <span className="chat-dot" style={{animationDelay:".4s"}}/>
              </div>
            </div>
          )}
          <div ref={endRef}/>
        </div>

        {/* Input */}
        <div style={{padding:"11px 13px",borderTop:`1px solid ${B2}`,display:"flex",gap:8,flexShrink:0}}>
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder="Ask your AI coach…"
            style={{flex:1,background:B1,border:`1px solid ${B2}`,borderRadius:8,padding:"9px 12px",color:TEXT,fontSize:13,fontFamily:"'Open Sans',sans-serif",outline:"none"}}
          />
          <button onClick={()=>send()} disabled={!input.trim()||loading}
            style={{background:GREEN,border:"none",borderRadius:8,width:38,height:38,cursor:!input.trim()||loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,opacity:!input.trim()||loading?0.45:1,flexShrink:0,color:TEXT}}>
            ↑
          </button>
        </div>
      </div>
    </>
  );
}

// ── TRAINING REPORT TAB ───────────────────────────────────────────────────────
function TrainingReportTab({rep,onRoleplay}){
  const now=Date.now();
  const D7=7*864e5;
  const allCalls=rep.calls||[];

  const thisWeek=allCalls.filter(c=>c.scorecard&&(now-new Date(c.scorecard.scored_at).getTime())<D7);
  const prevWeek=allCalls.filter(c=>{
    const age=now-new Date(c.scorecard?.scored_at||0).getTime();
    return age>=D7&&age<2*D7;
  });

  if(thisWeek.length===0){
    return(
      <div style={{textAlign:"center",padding:"52px 0",color:T3,fontFamily:"'Open Sans',sans-serif"}} className="fade">
        <div style={{fontSize:13,marginBottom:6,fontWeight:600}}>No calls scored this week yet.</div>
        <div style={{fontSize:12}}>Score calls to see your weekly training report here.</div>
      </div>
    );
  }

  // Section 1 stats
  const totalCalls=thisWeek.length;
  const avgScore=Math.round(thisWeek.reduce((a,c)=>a+c.score,0)/totalCalls);
  const prevAvg=prevWeek.length?Math.round(prevWeek.reduce((a,c)=>a+c.score,0)/prevWeek.length):null;
  const trend=prevAvg!==null?avgScore-prevAvg:null;
  const avgRepTalk=Math.round(thisWeek.reduce((a,c)=>a+c.rt,0)/totalCalls);
  const avgSellerTalk=100-avgRepTalk;

  // Category analysis (uses categories[] index-mapped to CATEGORIES)
  const catData=CATEGORIES.map((name,idx)=>{
    const thisScores=thisWeek.map(c=>c.categories?.[idx]).filter(s=>s!=null&&s>0);
    const prevScores=prevWeek.map(c=>c.categories?.[idx]).filter(s=>s!=null&&s>0);
    const avg=thisScores.length?Math.round(thisScores.reduce((a,b)=>a+b,0)/thisScores.length):null;
    const prev=prevScores.length?Math.round(prevScores.reduce((a,b)=>a+b,0)/prevScores.length):null;
    let worstCall=null,worstScore=11;
    thisWeek.forEach(c=>{const s=c.categories?.[idx];if(s!=null&&s<worstScore){worstScore=s;worstCall=c;}});
    return{name,avg,prev,worstCall,worstScore};
  }).filter(c=>c.avg!==null);

  const strengths=[...catData].sort((a,b)=>b.avg-a.avg).slice(0,3);
  const weaknesses=[...catData].sort((a,b)=>a.avg-b.avg).slice(0,3);
  const topFocus=weaknesses[0];

  const DRILLS={
    "Introduction and Positioning":"On every call this week, state your name, company, and reason for calling within the first 10 seconds — before asking any questions.",
    "Rapport Building":"Ask one personal question before any business discussion on your next 5 calls. Mirror their tone first.",
    "Motivation Discovery":"Do not mention price until you've asked 'What's driving the timing for you?' on every call.",
    "Timeline Discovery":"Ask 'What happens if this drags past [month]?' within the first 5 minutes of every call.",
    "Financial Discovery":"Frame every financial question as helpful: 'So I can make sure my offer actually helps your situation…' before any money questions.",
    "Offer Presentation":"Anchor your offer to their specific situation, not comps — explain your math out loud on your next 3 calls.",
    "Objection Handling":"Do 2 roleplay sessions this week using the bridge technique: Agree → Clarify → Advance.",
    "First No Recovery":"Practice the reframe: 'Totally understand. Before we hang up — what would a good outcome look like for you?'",
    "Next Step Close":"End every call with a specific date and time for the next conversation — not 'I'll follow up soon.'"
  };

  const STRENGTH_TIPS={
    "Introduction and Positioning":"Your openers are sharp — sellers immediately know who you are and why you're calling.",
    "Rapport Building":"You're earning trust in the first few minutes, which sets up everything else on the call.",
    "Motivation Discovery":"You're consistently finding the real 'why' — this is the most valuable skill in acquisitions.",
    "Timeline Discovery":"You have clear timeline clarity — sellers are telling you exactly where they stand.",
    "Financial Discovery":"You're navigating the money conversation without making sellers uncomfortable.",
    "Offer Presentation":"Your offer presentations are compelling and grounded in the seller's actual situation.",
    "Objection Handling":"You stay in the conversation when sellers push back — that's what separates closers.",
    "First No Recovery":"When sellers say no, you recover and keep the door open. That's how deals get saved.",
    "Next Step Close":"You close with specific next steps every time — no vague 'I'll call you back.'"
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}} className="fade">

      {/* SECTION 1: Weekly Snapshot */}
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 20px"}}>
        <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,fontFamily:"'Open Sans',sans-serif"}}>Weekly Snapshot</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            {label:"Calls This Week",value:String(totalCalls),sub:"",valueColor:TEXT},
            {label:"Avg Score",value:String(avgScore),sub:"",valueColor:gc(avgScore)},
            {label:"Talk Ratio",value:`${avgSellerTalk}/${avgRepTalk}`,sub:"Seller / Rep %",valueColor:avgSellerTalk>=55?GREEN:AMBER},
            trend!==null
              ?{label:"vs Last Week",value:`${trend>=0?"+":""}${trend}`,sub:trend>=0?"▲ Trending up":"▼ Slipping back",valueColor:trend>=0?GREEN:RED}
              :{label:"Last Week",value:"—",sub:"No data",valueColor:T3},
          ].map(({label,value,sub,valueColor})=>(
            <div key={label} style={{background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:11,color:T3,marginBottom:5,fontFamily:"'Open Sans',sans-serif",textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</div>
              <div style={{fontSize:22,fontWeight:800,color:valueColor,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",lineHeight:1,marginBottom:sub?4:0}}>{value}</div>
              {sub&&<div style={{fontSize:11,color:T3,fontFamily:"'Open Sans',sans-serif"}}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: Strengths */}
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 20px"}}>
        <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,fontFamily:"'Open Sans',sans-serif"}}>Your Strengths This Week</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {strengths.map(cat=>(
            <div key={cat.name} style={{background:"#0a0f0a",border:`1px solid ${B1}`,borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{width:38,height:38,borderRadius:8,background:GREEN+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:GREEN,flexShrink:0,fontFamily:"'League Spartan',sans-serif"}}>{cat.avg}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:3,fontFamily:"'Open Sans',sans-serif"}}>{cat.name} <span style={{color:GREEN,fontWeight:600}}>— {cat.avg}/10</span></div>
                <div style={{fontSize:12,color:T2,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif"}}>{STRENGTH_TIPS[cat.name]||"Strong performance this week."}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: Where You Dropped the Ball */}
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 20px"}}>
        <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,fontFamily:"'Open Sans',sans-serif"}}>Where You Dropped the Ball</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {weaknesses.map(cat=>{
            const exampleText=cat.worstCall?`On your ${cat.worstCall.date} call with ${cat.worstCall.seller} you scored ${cat.worstScore}/10 on ${cat.name}. ${DRILL_PROMPTS[cat.name]?.tip||""}`:null;
            return(
              <div key={cat.name} style={{background:"#0f0a0a",border:`1px solid ${B1}`,borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:exampleText?6:0}}>
                  <div style={{fontSize:16,fontWeight:800,color:RED,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",width:28,textAlign:"center",flexShrink:0}}>{cat.avg}</div>
                  <div style={{fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{cat.name} <span style={{color:RED,fontWeight:600}}>— {cat.avg}/10</span></div>
                </div>
                {exampleText&&<div style={{fontSize:12,color:T2,lineHeight:1.6,fontFamily:"'Open Sans',sans-serif",borderTop:`1px solid ${B1}`,paddingTop:8,marginTop:2}}>{exampleText}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Feedback Loop */}
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"18px 20px"}}>
        <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,fontFamily:"'Open Sans',sans-serif"}}>Feedback Loop — What to Do About It</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {weaknesses.map(cat=>{
            const delta=cat.prev!==null?cat.avg-cat.prev:null;
            const trendTxt=delta===null?"—":delta>0?`↑ +${delta} vs last week`:delta<0?`↓ ${delta} vs last week`:"→ Flat vs last week";
            const trendCol=delta===null?T3:delta>0?GREEN:delta<0?RED:T3;
            return(
              <div key={cat.name} style={{background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'Open Sans',sans-serif"}}>{cat.name}</div>
                  <div style={{fontSize:12,fontWeight:700,color:trendCol,fontFamily:"'Open Sans',sans-serif"}}>{trendTxt}</div>
                </div>
                <div style={{background:"#0a0f0a",border:`1px solid ${GREEN}18`,borderLeft:`3px solid ${GREEN}`,borderRadius:6,padding:"10px 12px",marginBottom:onRoleplay?10:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:GREEN,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4,fontFamily:"'Open Sans',sans-serif"}}>This Week's Drill</div>
                  <div style={{fontSize:12,color:TEXT,lineHeight:1.7,fontFamily:"'Open Sans',sans-serif"}}>{DRILLS[cat.name]||"Focus on this category in your next roleplay session."}</div>
                </div>
                {onRoleplay&&(
                  <button
                    onClick={()=>onRoleplay({category:cat.name,challenge:`You scored ${cat.avg}/10 on ${cat.name} this week. Let's drill it.`,context:"Real estate acquisition call"})}
                    style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"5px 12px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif",transition:"all .15s"}}
                    onMouseOver={e=>{e.currentTarget.style.borderColor=GREEN;e.currentTarget.style.color=GREEN;}}
                    onMouseOut={e=>{e.currentTarget.style.borderColor=B3;e.currentTarget.style.color=T2;}}>
                    Start Practice Session →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 5: This Week's One Focus */}
      {topFocus&&(
        <div style={{background:"#080d08",border:`1px solid ${GREEN}33`,borderRadius:10,padding:"24px 24px"}}>
          <div style={{fontSize:11,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontFamily:"'Open Sans',sans-serif"}}>This Week's One Focus</div>
          <div style={{fontSize:24,fontWeight:800,color:TEXT,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",marginBottom:8,textTransform:"uppercase",lineHeight:1.2}}>{topFocus.name}</div>
          <div style={{fontSize:13,color:T2,lineHeight:1.7,marginBottom:18,maxWidth:540,fontFamily:"'Open Sans',sans-serif"}}>{DRILLS[topFocus.name]||`Prioritize improving ${topFocus.name} this week.`}</div>
          {onRoleplay&&(
            <button
              onClick={()=>onRoleplay({category:topFocus.name,challenge:`Your #1 focus this week: ${topFocus.name}. Score: ${topFocus.avg}/10. Let's drill until it's automatic.`,context:"Real estate acquisition call"})}
              style={{background:GREEN,border:"none",borderRadius:6,padding:"11px 24px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em",transition:"opacity .15s"}}
              onMouseOver={e=>e.currentTarget.style.opacity=".85"}
              onMouseOut={e=>e.currentTarget.style.opacity="1"}>
              Start Drill →
            </button>
          )}
        </div>
      )}

    </div>
  );
}

// ── REP DASHBOARD ─────────────────────────────────────────────────────────────
function RepDashboard({rep,onSwitchRep,onOwnerView,teamReps=INIT_REPS,accountId}){
  const [theme,setTheme]=useState(()=>{try{return localStorage.getItem("acqcoach_theme")||"dark";}catch(e){return"dark";}});
  function toggleTheme(){const next=theme==="dark"?"light":"dark";applyTheme(next);setTheme(next);}
  const [tab,setTab]=useState("scorecard");
  const [view,setView]=useState("dashboard");
  const [chatOpen,setChatOpen]=useState(false);
  const [seedMoment,setSeedMoment]=useState(null);
  const [drillRep,setDrillRep]=useState(null);
  const rank=getTeamRank(rep.id,teamReps);
  const tabs=[["scorecard","Scorecard"],["calls","My Calls"],["progress","Progress"],["training","Training Report"],["settings","Settings"],["compete","Compete"]];

  // ── Rep notifications ──────────────────────────────────────────────────────
  const [repNotifs,setRepNotifs]=useState([]);
  const [repNotifOpen,setRepNotifOpen]=useState(false);
  const repNotifBellRef=useRef(null);
  const _repNotifKey=accountId&&rep.id?`acqcoach_rep_notifications_${accountId}_${rep.id}`:null;

  // Load stored notifications + check for newly scored calls
  useEffect(()=>{
    if(!_repNotifKey)return;
    let stored=[];
    try{stored=JSON.parse(localStorage.getItem(_repNotifKey)||"[]");}catch(e){}

    // Check which calls are "new" (scored after last check)
    const checkKey=`acqcoach_rep_notif_check_${accountId}_${rep.id}`;
    let lastCheck=null;
    try{lastCheck=localStorage.getItem(checkKey);}catch(e){}

    const newCalls=lastCheck
      ?(rep.calls||[]).filter(c=>c.scorecard?.scored_at&&new Date(c.scorecard.scored_at)>new Date(lastCheck))
      :[];

    const newNotifs=newCalls.map(c=>{
      const sc2=c.score||0;
      return{
        id:genRepNotifId("call_scored"),
        type:"call_scored",
        title:"Your call was scored",
        body:`You scored ${sc2}/100 (${c.grade||grade(sc2)}). ${sc2>=70?"Strong call!":sc2>=50?"Keep improving.":"Review with your manager."}`,
        callId:c.id,score:sc2,
        timestamp:c.scorecard?.scored_at||new Date().toISOString(),
        read:false,
      };
    });

    try{localStorage.setItem(checkKey,new Date().toISOString());}catch(e){}

    if(newNotifs.length>0){
      const next=[...newNotifs,...stored].slice(0,20);
      try{localStorage.setItem(_repNotifKey,JSON.stringify(next));}catch(e){}
      setRepNotifs(next);
    } else {
      setRepNotifs(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[rep.id,accountId]);

  // Click-outside to close rep bell panel
  useEffect(()=>{
    if(!repNotifOpen)return;
    function onDown(e){if(repNotifBellRef.current&&!repNotifBellRef.current.contains(e.target))setRepNotifOpen(false);}
    document.addEventListener("mousedown",onDown);
    return()=>document.removeEventListener("mousedown",onDown);
  },[repNotifOpen]);

  function dismissRepNotif(id){
    setRepNotifs(prev=>{
      const next=prev.filter(n=>n.id!==id);
      if(_repNotifKey)try{localStorage.setItem(_repNotifKey,JSON.stringify(next));}catch(e){}
      return next;
    });
  }
  function markRepNotifsRead(){
    setRepNotifs(prev=>{
      const next=prev.map(n=>({...n,read:true}));
      if(_repNotifKey)try{localStorage.setItem(_repNotifKey,JSON.stringify(next));}catch(e){}
      return next;
    });
  }
  function markRepNotifRead(id){
    setRepNotifs(prev=>{
      const next=prev.map(n=>n.id===id?{...n,read:true}:n);
      if(_repNotifKey)try{localStorage.setItem(_repNotifKey,JSON.stringify(next));}catch(e){}
      return next;
    });
  }
  function handleRepNotifClick(n){
    markRepNotifRead(n.id);
    setRepNotifOpen(false);
    setView("dashboard");
    setTab("calls");
  }

  // Bell node passed to RepNav (constructed here so it has access to setTab/setView)
  const unreadRepCount=repNotifs.filter(n=>!n.read).length;
  const bellNode=(
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <button onClick={toggleTheme} title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}
        style={{background:"transparent",border:`1px solid ${B1}`,borderRadius:6,padding:"4px 8px",
          cursor:"pointer",fontSize:15,lineHeight:1,transition:"border-color .15s",fontFamily:"'Open Sans',sans-serif"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=B2}
        onMouseLeave={e=>e.currentTarget.style.borderColor=B1}>
        {theme==="dark"?"☀️":"🌙"}
      </button>
      <div ref={repNotifBellRef} style={{position:"relative"}}>
        <button
          onClick={()=>setRepNotifOpen(o=>!o)}
          title="Notifications"
        style={{
          background:"transparent",
          border:`1px solid ${repNotifOpen?GREEN+"55":B1}`,
          borderRadius:6,padding:"4px 7px",
          cursor:"pointer",position:"relative",lineHeight:1,fontSize:15,
          transition:"border-color .15s",
        }}>
        🔔
        {unreadRepCount>0&&(
          <span style={{
            position:"absolute",top:-5,right:-5,
            minWidth:16,height:16,borderRadius:8,
            background:RED,color:TEXT,fontSize:9,fontWeight:800,
            display:"flex",alignItems:"center",justifyContent:"center",
            padding:"0 3px",boxSizing:"border-box",
            border:"2px solid #000",lineHeight:1,pointerEvents:"none",
          }}>{unreadRepCount>9?"9+":unreadRepCount}</span>
        )}
      </button>
      {repNotifOpen&&(
        <div style={{
          position:"absolute",top:"calc(100% + 10px)",right:0,
          width:300,maxHeight:420,
          background:S1,border:`1px solid ${B1}`,borderRadius:10,
          boxShadow:"0 12px 48px rgba(0,0,0,0.85)",
          zIndex:1100,display:"flex",flexDirection:"column",overflow:"hidden",
          fontFamily:"'Open Sans',sans-serif",
        }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",borderBottom:`1px solid ${B1}`,flexShrink:0}}>
            <span style={{fontSize:10,fontWeight:800,color:T3,textTransform:"uppercase",letterSpacing:"0.16em"}}>Notifications</span>
            {repNotifs.length>0&&(
              <button onClick={markRepNotifsRead}
                style={{background:"transparent",border:"none",color:T3,fontSize:11,cursor:"pointer",padding:0,transition:"color .15s"}}
                onMouseEnter={e=>e.currentTarget.style.color=TEXT}
                onMouseLeave={e=>e.currentTarget.style.color=T3}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {repNotifs.length===0?(
              <div style={{padding:"32px 16px",textAlign:"center",color:T3,fontSize:12}}>No notifications yet</div>
            ):repNotifs.map(n=>{
              const icon=n.type==="call_scored"?"✅":n.type==="improvement"?"📈":"🔔";
              return(
                <div key={n.id}
                  onClick={()=>handleRepNotifClick(n)}
                  style={{
                    display:"flex",gap:10,padding:"11px 14px",
                    borderBottom:`1px solid ${B1}`,
                    background:n.read?"transparent":B2+"99",
                    cursor:"pointer",transition:"background .15s",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=B2}
                  onMouseLeave={e=>e.currentTarget.style.background=n.read?"transparent":B2+"99"}>
                  <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:n.read?400:700,color:n.read?T2:TEXT,marginBottom:2,lineHeight:1.3}}>{n.title}</div>
                    <div style={{fontSize:11,color:T3,lineHeight:1.5}}>{n.body}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
                      <span style={{fontSize:10,color:T3,opacity:.7}}>{timeAgo(n.timestamp)}</span>
                      <span style={{fontSize:10,color:GREEN,fontWeight:600}}>View report →</span>
                    </div>
                  </div>
                  <button
                    onClick={e=>{e.stopPropagation();dismissRepNotif(n.id);}}
                    style={{background:"transparent",border:"none",color:T3,fontSize:12,cursor:"pointer",flexShrink:0,padding:"0 3px",lineHeight:1,alignSelf:"flex-start",marginTop:2,transition:"color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.color=RED}
                    onMouseLeave={e=>e.currentTarget.style.color=T3}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </div>
  );

  const handlePractice=(moment)=>{
    setSeedMoment(moment);
    setView("roleplay");
  };

  if(view==="roleplay"){
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100vh",background:BG}}>
        <RepNav rep={rep} onSwitchRep={onSwitchRep} onOwnerView={onOwnerView} bellNode={bellNode}/>
        <RoleplayMode onBack={()=>{setView("dashboard");setSeedMoment(null);}} seedMoment={seedMoment}/>
      </div>
    );
  }

  if(view==="leaderboard"){
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100vh",background:BG}}>
        <RepNav rep={rep} onSwitchRep={onSwitchRep} onOwnerView={onOwnerView} bellNode={bellNode}/>
        <div style={{flex:1,overflowY:"auto",padding:"24px 32px 48px"}}>
          <div style={{maxWidth:920,margin:"0 auto"}} className="fade">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",textTransform:"uppercase",color:TEXT}}>Team Leaderboard</div>
              <button onClick={()=>setView("dashboard")}
                style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 14px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Open Sans',sans-serif"}}>
                ← Back
              </button>
            </div>
            {/* onDrillDown wired: row expand keeps inline breakdown + "Full breakdown →" opens drawer */}
            <FullLeaderboard reps={teamReps} currentRepId={rep.id} onDrillDown={r=>setDrillRep(r)}/>
          </div>
        </div>
        {/* Drill-down drawer (no calls in RepView context — recent calls section will show empty) */}
        {drillRep&&(
          <RepDrillDown
            rep={drillRep}
            reps={teamReps}
            onClose={()=>setDrillRep(null)}
          />
        )}
      </div>
    );
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:BG}}>
      <RepNav rep={rep} onSwitchRep={onSwitchRep} onOwnerView={onOwnerView}/>
      <div style={{flex:1,overflowY:"auto",padding:"24px 32px 48px"}}>
        <div style={{maxWidth:900,margin:"0 auto"}} className="fade">
          {/* Score Overview */}
          <div style={{display:"flex",alignItems:"center",gap:28,marginBottom:28}}>
            <Ring score={rep.avg} size={120}/>
            <div>
              <div style={{fontSize:22,fontWeight:800,color:TEXT,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em",textTransform:"uppercase"}}>{rep.name}</div>
              <div style={{fontSize:13,color:T2,marginTop:4,fontFamily:"'Open Sans',sans-serif"}}>{rep.role}</div>
              <div style={{display:"flex",gap:12,marginTop:8,alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:gc(rep.avg),fontFamily:"'Open Sans',sans-serif",letterSpacing:"0.04em"}}>{grade(rep.avg)}</span>
                <span style={{fontSize:12,color:rep.trend>=0?GREEN:RED,fontFamily:"'Open Sans',sans-serif",fontWeight:600}}>
                  {rep.trend>=0?"↑":"↓"} {Math.abs(rep.trend)}% this week
                </span>
              </div>
              <div style={{fontSize:12,color:T3,marginTop:8,fontFamily:"'Open Sans',sans-serif"}}>
                You rank <span style={{color:TEXT,fontWeight:700}}>#{rank}</span> on the team this week
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${B1}`,marginBottom:18}}>
            {tabs.map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)}
                style={{background:"transparent",border:"none",borderBottom:tab===key?`2px solid ${GREEN}`:"2px solid transparent",
                  padding:"8px 18px",color:tab===key?TEXT:T3,fontSize:13,fontWeight:600,cursor:"pointer",
                  fontFamily:"'Open Sans',sans-serif",transition:"all .15s"}}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab==="scorecard"&&<ScorecardTab rep={rep}/>}
          {tab==="calls"&&<MyCallsTab rep={rep} onPractice={handlePractice}/>}
          {tab==="progress"&&<ProgressTab rep={rep}/>}
          {tab==="training"&&<TrainingReportTab rep={rep} onRoleplay={handlePractice}/>}
          {tab==="settings"&&<SettingsTab/>}
          {tab==="compete"&&<CompeteTab rep={rep} teamReps={teamReps} accountId={accountId}/>}

          {/* Training Center */}
          <TrainingCenter rep={rep} teamReps={teamReps} onRoleplay={()=>setView("roleplay")} onLeaderboard={()=>setView("leaderboard")}/>
        </div>
      </div>

      {/* Floating Chat Button */}
      {!chatOpen&&(
        <button onClick={()=>setChatOpen(true)}
          style={{position:"fixed",bottom:28,right:28,width:52,height:52,borderRadius:"50%",background:GREEN,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",zIndex:900,transition:"transform .15s"}}
          onMouseOver={e=>e.currentTarget.style.transform="scale(1.1)"}
          onMouseOut={e=>e.currentTarget.style.transform="scale(1)"}
          title="Ask your AI coach"
        >💬</button>
      )}

      {/* Chat Drawer */}
      {chatOpen&&<ChatDrawer rep={rep} onClose={()=>setChatOpen(false)}/>}
    </div>
  );
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function RepView({onBack,accountId,repGhlUserIds}){
  const isRepLogin=Array.isArray(repGhlUserIds)&&repGhlUserIds.length>0;
  const [repOptions,setRepOptions]=useState(isRepLogin?[]:INIT_REPS);
  const [loadingReps,setLoadingReps]=useState(false);
  const [repLoadError,setRepLoadError]=useState("");
  const [selectedRep,setSelectedRep]=useState(()=>{
    if(isRepLogin)return null; // wait for DB load to pick the assigned rep
    try{
      const saved=localStorage.getItem("acqcoach_selected_rep");
      if(saved){const found=INIT_REPS.find(r=>r.name===saved);if(found)return found;}
    }catch(e){}
    return null;
  });

  useEffect(()=>{
    if(!accountId){setRepOptions(INIT_REPS);return;}
    let cancelled=false;
    setLoadingReps(true);setRepLoadError("");
    if(!isRepLogin)setSelectedRep(null);
    Promise.all([
      supabase.from("ghl_users").select("*").eq("account_id",accountId).order("name"),
      supabase.from("call_scores").select("*").eq("account_id",accountId).order("scored_at",{ascending:false}).limit(500),
    ]).then(([usersRes,scoresRes])=>{
      if(cancelled)return;
      if(usersRes.error||scoresRes.error)throw usersRes.error||scoresRes.error;
      let users=usersRes.data||[];
      if(isRepLogin){
        const allow=new Set(repGhlUserIds);
        users=users.filter(u=>allow.has(u.ghl_user_id));
      }
      const built=buildDbReps(users,scoresRes.data||[]);
      // For rep logins, never fall back to dummy data — show empty list instead.
      const next=isRepLogin?built:(built.length?built:INIT_REPS);
      setRepOptions(next);
      if(isRepLogin&&next.length===1)setSelectedRep(next[0]);
    }).catch(()=>{if(!cancelled)setRepLoadError("Could not load your data. Please try again.");})
      .finally(()=>{if(!cancelled)setLoadingReps(false);});
    return()=>{cancelled=true;};
  },[accountId,isRepLogin,JSON.stringify(repGhlUserIds||[])]);

  const handleSelect=(rep)=>{
    setSelectedRep(rep);
    try{localStorage.setItem("acqcoach_selected_rep",rep.name);}catch(e){}
  };

  const handleSwitchRep=()=>{
    if(isRepLogin)return; // reps can't switch identity
    setSelectedRep(null);
    try{localStorage.removeItem("acqcoach_selected_rep");localStorage.removeItem("acqcoach_completed_drills");}catch(e){}
  };

  if(isRepLogin&&!loadingReps&&repOptions.length===0&&!repLoadError){
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#000",color:"#d4d4d4",fontFamily:"'Open Sans',sans-serif",gap:14,padding:40,textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:"0.04em"}}>No data yet</div>
        <div style={{fontSize:12,color:"#888",maxWidth:420}}>Your account is set up but no calls have been scored under your assigned rep profile yet. Check back once your manager has synced your activity.</div>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #1c1c1c",color:"#999",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>Sign out</button>
      </div>
    );
  }

  if(!selectedRep){
    return <RepSelector reps={repOptions} loading={loadingReps} error={repLoadError} onSelect={handleSelect}/>;
  }

  return(
    <RepDashboard
      rep={selectedRep}
      teamReps={repOptions}
      onSwitchRep={isRepLogin?undefined:handleSwitchRep}
      onOwnerView={onBack}
      accountId={accountId}
    />
  );
}

