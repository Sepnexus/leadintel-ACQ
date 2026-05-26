// make sure all of this is added
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import closerControlLogo from "@/assets/closer-control-logo.png";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const BG="#000000",S1="#0d0d0d",S2="#141414",S3="#141414";
const B1="#1c1c1c",B2="#222222",B3="#2a2a2a";
const TEXT="#f4f4f4",T2="#999999",T3="#777777";
const GREEN="#4e7d3d",DKGREEN="#2f721a";
const RED="#c0392b",AMBER="#b7860b",GOLD="#8a6a00";

const SAMPLE=`Rep: Hi, is this Dorothy?
Seller: Yes, who's this?
Rep: Hi Dorothy, my name is Marcus, I'm a real estate investor in the area. I came across your property on Elm Street. Is now an okay time to chat for a couple minutes?
Seller: I guess so.
Rep: How are you holding up? I work with families dealing with estates.
Seller: It's been hard. My mother passed two months ago.
Rep: I'm sorry for your loss. Are you thinking about selling the property?
Seller: Yeah we think so. None of us live there.
Rep: Any idea on your timeline?
Seller: Maybe a few months. We haven't really talked about it.
Rep: Is there still a mortgage on the property?
Seller: I believe it was paid off years ago.
Rep: We buy properties directly, no agents, no repairs, close in 2-3 weeks. I could offer somewhere around one sixty to one seventy. What do you think?
Seller: That seems a little low. I was thinking it was worth more.
Rep: I understand. These offers are based on condition and market but I can see what I can do.
Seller: I think I need to think about it and talk to my siblings.
Rep: Of course, take all the time you need. I'll give you a call next week.
Seller: Okay sure.
Rep: Great, talk soon Dorothy.`;

// ── AI SYSTEM PROMPTS ─────────────────────────────────────────────────────────
const SYS=`You are ACQ Coach AI for real estate wholesalers. Analyze this acquisition call transcript.

Detect: sellerType (probate/inherited/pre-foreclosure/tired-landlord/divorce/absentee-owner/cold-unknown), repExperience (new/developing/experienced/va-screener/owner-operator), callType (first-contact/follow-up/re-engagement/offer-presentation), and estimate talk ratios.

Score 0-10 each category: Introduction and Positioning, Rapport Building, Motivation Discovery, Timeline Discovery, Financial Discovery, Offer Presentation, Objection Handling, First No Recovery, Next Step Close.

Status per category: strong (8-10), ok (6-7.9), weak (4-5.9), critical (0-3.9).

Coaching rules: seller should talk 60%+, never give price before situation discovery, end with specific next step time.

Respond ONLY valid JSON, no markdown:
{"detected":{"sellerType":"string","sellerTypeLabel":"string","repExperience":"string","repExperienceLabel":"string","callType":"string","callTypeLabel":"string","sellerTalkRatio":"string","repTalkRatio":"string"},"score":{"overall":0,"grade":"string","categories":[{"name":"string","score":0,"status":"string","oneliner":"string"}]},"verdict":"string","moments":[{"category":"string","status":"string","what":"string","why":"string","rewrite":"string"}],"drill":{"title":"string","sellerLine":"string","goal":"string","tip":"string"},"strengths":["string"]}`;

const ROLEPLAY_SELLER_SYS=`You are playing a realistic real estate seller in a training call for acquisition reps. Respond naturally as this seller type would. Keep responses 1-4 sentences. Be moderately resistant — don't volunteer information freely, but don't be impossible. React emotionally and realistically. Stay in character no matter what the rep says.`;

const ROLEPLAY_SCORE_SYS=`You are ACQ Coach AI. Given a single rep line from a practice call, score it (0-10) and give coaching. Respond ONLY valid JSON, no markdown: {"score":0,"status":"string","feedback":"string","rewrite":"string"}`;

// ── INIT DATA ─────────────────────────────────────────────────────────────────
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
  {id:1,repId:1,date:"Today 2:14 PM",seller:"Dorothy M.",type:"Probate",score:74,grade:"C+",dur:"11m 32s",st:42,rt:58,isNew:false},
  {id:2,repId:1,date:"Yesterday 10:08 AM",seller:"Carlos R.",type:"Pre-foreclosure",score:84,grade:"B+",dur:"9m 14s",st:62,rt:38,isNew:false},
  {id:3,repId:2,date:"Today 11:30 AM",seller:"Tamara W.",type:"Inherited",score:71,grade:"C+",dur:"8m 55s",st:52,rt:48,isNew:false},
  {id:4,repId:3,date:"Today 3:00 PM",seller:"Dave M.",type:"Cold",score:54,grade:"F",dur:"6m 20s",st:32,rt:68,isNew:false},
];

const SELLER_SCENARIOS={
  probate:{label:"Probate Seller",desc:"Dealing with a recently inherited property. Emotional, cautious, siblings involved.",opening:"Hello? Who is this calling?"},
  "pre-foreclosure":{label:"Pre-Foreclosure",desc:"3 months behind on payments. Stressed and defensive, doesn't want to admit the situation.",opening:"Yeah... I'm not really looking to sell right now."},
  "tired-landlord":{label:"Tired Landlord",desc:"Has 3 rentals, done with tenants and maintenance. Open but very price-sensitive.",opening:"I've been thinking about it but I don't want to get lowballed."},
  divorce:{label:"Divorce Seller",desc:"Going through a messy split. Wants a quick, clean exit from the property.",opening:"I just need this handled fast. My attorney keeps pushing me."},
  "absentee-owner":{label:"Absentee Owner",desc:"Owns property out of state, hasn't seen it in years. Wants cash and simplicity.",opening:"I got your postcard. What are you actually offering?"},
  cold:{label:"Cold Call",desc:"No prior context. Slightly annoyed to receive the call. Needs a strong opener.",opening:"How did you get this number?"},
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function gc(s){return s>=80?GREEN:s>=65?AMBER:RED}
function sc(s){return s==="strong"?GREEN:s==="ok"?AMBER:RED}
function sl(s){return s==="strong"?"Strong":s==="ok"?"Developing":s==="weak"?"Needs Work":"Critical"}
function eb(e){const m={experienced:{l:"Experienced",c:GREEN},developing:{l:"Developing",c:AMBER},new:{l:"New Rep",c:RED},"va-screener":{l:"VA Screener",c:T2},"owner-operator":{l:"Owner",c:GREEN}};return m[e]||{l:e,c:T2}}
function grade(s){return s>=90?"A":s>=82?"B+":s>=75?"B":s>=68?"B-":s>=62?"C+":s>=55?"C":s>=48?"D":"F"}
function nowLabel(){return new Date().toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
function normalizeAiStatus(status,score){
  const s=String(status||"").toLowerCase();
  if(["strong","ok","weak","critical"].includes(s))return s;
  if(["good","great","excellent"].includes(s))return "strong";
  if(["average","developing","fair"].includes(s))return "ok";
  if(["needs work","miss","missed","poor"].includes(s))return "weak";
  const n=Number(score)||0;return n>=8?"strong":n>=6?"ok":n>=4?"weak":"critical";
}

function calcTalk(text){
  const lines=text.split("\n").filter(l=>l.trim());
  let r=0,s=0;
  lines.forEach(l=>{const w=l.replace(/^(Rep|Seller):\s*/i,"").split(/\s+/).filter(Boolean).length;if(/^rep:/i.test(l.trim()))r+=w;else if(/^seller:/i.test(l.trim()))s+=w;});
  const t=r+s||1;
  return{rep:Math.round(r/t*100),seller:Math.round(s/t*100)};
}

function parseSegments(text){
  return text.split("\n").filter(l=>l.trim()).map(l=>{
    const isRep=/^rep:/i.test(l.trim());
    const words=l.replace(/^(Rep|Seller):\s*/i,"").split(/\s+/).filter(Boolean).length;
    return{isRep,words};
  });
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css=`
  @import url('https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700;800;900&family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Open Sans',sans-serif;background:#000000;color:#f4f4f4;height:100vh;overflow:hidden}
  ::-webkit-scrollbar{width:2px}
  ::-webkit-scrollbar-track{background:#1c1c1c}
  ::-webkit-scrollbar-thumb{background:#2f721a;border-radius:2px}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .fade{animation:fadeUp .2s ease both}
  textarea,input,select,button{font-family:'Open Sans',sans-serif}
  input[type=file]{display:none}
  .lb-row:hover{background:#0a0a0a !important}
`;

const PLAYBOOK_TEMPLATES=[
  {label:"Probate Script",val:`Probate / Inherited Seller Playbook:\n- Lead with empathy FIRST — acknowledge the loss before any business\n- Ask 3+ motivation questions before any mention of price\n- "Walk me through the situation with the property..." opens better than "Are you selling?"\n- Objection: "I need to talk to my siblings" → "Absolutely. What's the best way to get everyone on one call together? I can make it easy."\n- Never rush — let them set the pace. Slow is smooth, smooth is fast.\n- Close EVERY call with a specific day + time for follow-up, not "I'll call you sometime next week"`},
  {label:"Pre-Foreclosure",val:`Pre-Foreclosure Seller Playbook:\n- Acknowledge stress without judgment — they're embarrassed\n- Establish urgency naturally: "The timeline on these situations can get tight fast"\n- Ask the payoff amount BEFORE discussing purchase price\n- Objection: "I need more money" → "I hear you. Walk me through your number — what does a clean exit look like for you?"\n- Benefits to lean on: certainty, speed, no repairs, no commissions\n- Close with: "I can have a formal offer in your email by [specific time] — does that work?"`},
];

const INTEGRATION_LIST=[
  {id:"ghl",name:"GoHighLevel (GHL)",desc:"Auto-import recorded call URLs from GHL pipelines. Supports Twilio, LeadConnector, and native GHL calls.",fields:[{key:"apiKey",label:"GHL API Key",ph:"sk-..."},{key:"locationId",label:"Location ID",ph:"loc_..."}]},
  {id:"resimpli",name:"REsimpli",desc:"Pull call recordings directly from REsimpli dialer sessions for automatic transcription and scoring.",fields:[{key:"apiKey",label:"REsimpli API Key",ph:"rsk_..."},{key:"teamId",label:"Team ID",ph:"team_..."}]},
  {id:"callrail",name:"CallRail",desc:"Connect CallRail to auto-import inbound and outbound call recordings tagged by campaign.",fields:[{key:"apiKey",label:"CallRail API Token",ph:"ca0..."},{key:"accountId",label:"Account ID",ph:"ACC..."}]},
  {id:"smrtphone",name:"Smrtphone.io",desc:"Import dialer recordings from Smrtphone multi-line sessions with rep tagging.",fields:[{key:"apiKey",label:"Smrtphone API Key",ph:"sp_..."}]},
  {id:"openphone",name:"OpenPhone",desc:"Sync OpenPhone call recordings and voicemails. Rep is auto-matched by phone number.",fields:[{key:"apiKey",label:"OpenPhone API Key",ph:"op_..."}]},
];

const ROLE_OPTIONS=["Owner / Manager","Senior Acq Rep","Acq Rep","Junior Acq Rep","VA Screener","ISA"];
const EXP_OPTIONS=[["experienced","Experienced"],["developing","Developing"],["new","New Rep"],["va-screener","VA Screener"],["owner-operator","Owner"]];

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────

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

function Ring({score,size=96}){
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

function Bars({scores,height=56}){
  const min=40,range=60;
  return(
    <div style={{display:"flex",gap:3,alignItems:"flex-end",height}}>
      {scores.map((v,i)=>{
        const h=Math.max(((v-min)/range)*height,4);
        const isLast=i===scores.length-1;
        return(
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            {isLast&&<div style={{fontSize:12,color:GREEN,fontWeight:700,letterSpacing:"0.06em"}}>{v}</div>}
            <div style={{width:"100%",height:h,background:isLast?GREEN:"#1e2e1e",borderRadius:"2px 2px 0 0"}}/>
          </div>
        );
      })}
    </div>
  );
}

function TalkBar({rep,seller,showLegend=true}){
  const selOk=seller>=60;
  return(
    <div>
      {showLegend&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:13,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Talk Ratio</span>
          <span style={{fontSize:13,color:selOk?GREEN:AMBER,fontWeight:600}}>{selOk?`✓ Seller ${seller}%`:`Seller ${seller}% — aim 60%+`}</span>
        </div>
      )}
      <div style={{height:24,borderRadius:5,overflow:"hidden",display:"flex",position:"relative"}}>
        <div style={{width:`${rep}%`,background:"#1e3a1e",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6,transition:"width .6s"}}>
          <span style={{fontSize:13,fontWeight:700,color:TEXT,whiteSpace:"nowrap",opacity:.7}}>{rep}% Rep</span>
        </div>
        <div style={{width:`${seller}%`,background:GREEN,display:"flex",alignItems:"center",paddingLeft:6,transition:"width .6s",opacity:selOk?.9:.6}}>
          <span style={{fontSize:13,fontWeight:700,color:TEXT,whiteSpace:"nowrap"}}>{seller}% Seller</span>
        </div>
        <div style={{position:"absolute",left:"40%",top:0,bottom:0,width:1,background:GREEN,opacity:.3}}/>
      </div>
      {showLegend&&(
        <div style={{display:"flex",gap:12,marginTop:4}}>
          {[["#1e3a1e","Rep"],["#4e7d3d","Seller"],["#4e7d3d","60% target"]].map(([c,l],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:13,color:T3}}>
              <div style={{width:i===2?2:7,height:i===2?10:7,background:c,border:`1px solid ${B1}`,borderRadius:i===2?1:2}}/>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CONVERSATION FLOW WAVEFORM ─────────────────────────────────────────────────
function WaveformBar({transcript}){
  const segs=parseSegments(transcript||"");
  if(!segs.length)return null;
  const total=segs.reduce((a,s)=>a+s.words,0)||1;
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:13,fontWeight:600,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Conversation Flow</span>
        <span style={{fontSize:13,color:T3}}>{segs.length} exchanges</span>
      </div>
      <div style={{height:36,display:"flex",borderRadius:5,overflow:"hidden",gap:.5,alignItems:"stretch"}}>
        {segs.map((s,i)=>{
          const pct=Math.max((s.words/total)*100,0.4);
          return(
            <div key={i} title={`${s.isRep?"Rep":"Seller"}: ${s.words} words`}
              style={{flex:`0 0 ${pct}%`,background:s.isRep?"#1e3a1e":GREEN+(s.isRep?"":"50"),
                borderTop:`2px solid ${s.isRep?DKGREEN:GREEN}`,minWidth:1.5,cursor:"default"}}/>
          );
        })}
      </div>
      <div style={{display:"flex",gap:16,marginTop:5}}>
        {[["#1e3a1e","Rep talk"],[GREEN,"Seller talk"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:T3}}>
            <div style={{width:7,height:7,background:c,border:`1px solid ${B1}`,borderRadius:2}}/>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MOMENTUM ARC CHART ────────────────────────────────────────────────────────
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
        <div style={{fontSize:12,fontWeight:700,color:TEXT,textTransform:"uppercase",letterSpacing:"0.12em"}}>Momentum Arc</div>
        <div style={{display:"flex",gap:3}}>
          {[30,90].map(d=>(
            <button key={d} onClick={()=>setRange(d)}
              style={{background:"transparent",border:`1px solid ${range===d?B2:"transparent"}`,borderRadius:6,padding:"3px 9px",color:range===d?TEXT:T3,fontSize:13,fontWeight:600,cursor:"pointer",borderLeft:range===d?`2px solid ${GREEN}`:undefined}}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block",height:H}}>
        <defs>
          <linearGradient id={`mg${rep.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity=".2"/>
            <stop offset="100%" stopColor={col} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon fill={`url(#mg${rep.id})`} points={`10,${H} ${pts} ${W-10},${H}`}/>
        <polyline fill="none" stroke={col} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={(0/(data.length-1))*(W-20)+10} cy={H-((data[0]-minV)/(maxV-minV||1))*H} r="3" fill={T3}/>
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

// ── AUDIO UPLOAD (OpenAI Whisper) ─────────────────────────────────────────────
async function transcribeWithWhisper(file,onStatus){
  const form=new FormData();
  form.append("file",file,file.name);
  onStatus("Transcribing with Whisper…");
  const res=await fetch(`${SUPABASE_URL}/functions/v1/transcribe`,{
    method:"POST",headers:{Authorization:`Bearer ${SUPABASE_KEY}`},body:form
  });
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||"Whisper error "+res.status);}
  const data=await res.json();
  return{transcript:data.text||"",diarized:false};
}

function AudioUpload({onTranscribed,disabled}){
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const ref=useRef();

  async function handleFile(file){
    if(!file)return;
    if(!file.name.match(/\.(mp3|mp4|wav|m4a|webm|ogg)$/i)){setError("Supported formats: MP3, MP4, WAV, M4A, WebM.");return;}
    setError("");setLoading(true);setStatus("Reading file…");
    try{
      const result=await transcribeWithWhisper(file,setStatus);
      setStatus("✓ Transcribed — review, then score");
      setLoading(false);
      onTranscribed(result.transcript);
    }catch(e){
      setLoading(false);
      setError(`Transcription failed (${e.message}). Check backend configuration and try again.`);
    }
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:600,color:T2}}>Upload a recorded call</span>
        <span style={{fontSize:13,color:T3}}>.mp3 · .mp4 · .wav · .m4a</span>
        <span style={{fontSize:13,color:GREEN,fontWeight:600}}>Whisper</span>
        {status&&!error&&<span style={{fontSize:13,color:GREEN,marginLeft:"auto"}}>{status}</span>}
      </div>
      <input ref={ref} type="file" accept=".mp3,.mp4,.wav,.m4a,.webm,audio/*" onChange={e=>handleFile(e.target.files[0])} style={{display:"none"}}/>
      <button onClick={()=>ref.current?.click()} disabled={loading||disabled}
        style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"7px 14px",color:T2,fontSize:13,fontWeight:600,cursor:"pointer",opacity:loading||disabled?.5:1}}>
        {loading?"Transcribing…":"Upload Audio"}
      </button>
      {error&&<div style={{background:"#1a0a0a",border:`1px solid ${RED}22`,borderRadius:6,padding:"7px 10px",fontSize:12,color:RED,marginTop:8}}>{error}</div>}
    </div>
  );
}

// ── MANAGER ANNOTATION PANEL ──────────────────────────────────────────────────
function AnnotationPanel({callId,annotations,onAdd,onClose}){
  const [text,setText]=useState("");
  const notes=annotations[callId]||[];
  function submit(){
    if(!text.trim())return;
    onAdd(callId,text.trim());
    setText("");
  }
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"24px",width:480,maxHeight:"72vh",display:"flex",flexDirection:"column",gap:14}} className="fade">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:13,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Manager Annotations</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T3,fontSize:17,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,minHeight:60}}>
          {notes.length===0
            ?<div style={{fontSize:13,color:T3,textAlign:"center",padding:"20px 0"}}>No annotations yet. Add coaching notes below.</div>
            :notes.map((n,i)=>(
              <div key={i} style={{background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:"10px 13px"}}>
                <div style={{fontSize:13,color:T3,marginBottom:4,letterSpacing:"0.06em"}}>{n.date} · {n.author}</div>
                <div style={{fontSize:13,color:TEXT,lineHeight:1.75}}>{n.text}</div>
              </div>
            ))
          }
        </div>
        <div style={{display:"flex",gap:8}}>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder={`e.g. Reviewed with Marcus ${new Date().toLocaleDateString("en-US",{month:"numeric",day:"numeric"})} — focus on financial discovery this week`}
            style={{flex:1,height:68,background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"8px 10px",color:TEXT,fontSize:13,resize:"none",outline:"none",lineHeight:1.7}}/>
          <button onClick={submit} style={{background:GREEN,border:"none",borderRadius:6,padding:"0 14px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── CALL SCORE CARD ───────────────────────────────────────────────────────────
function CallScoreCard({score}){
  const cats=Array.isArray(score?.category_scores)?score.category_scores:[];
  const moments=Array.isArray(score?.moments)?score.moments:[];
  const strengths=Array.isArray(score?.strengths)?score.strengths:[];
  const overall=Number(score?.overall_score)||0;
  return(
    <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:16,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:14,flexWrap:"wrap"}}>
        <Ring score={overall} size={88}/>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontSize:11,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:600,marginBottom:3}}>Overall Score</div>
          <div style={{fontSize:18,fontWeight:800,color:TEXT,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>{score.seller_name||"Unknown Seller"}</div>
          <div style={{fontSize:12,color:T3,marginTop:2}}>{score.call_type||""} · {score.seller_type||""} · {score.duration||""}</div>
          <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:T2}}>
            <span>Rep talk: <strong style={{color:TEXT}}>{score.rep_talk_ratio}%</strong></span>
            <span>Seller talk: <strong style={{color:(score.seller_talk_ratio||0)>=60?GREEN:AMBER}}>{score.seller_talk_ratio}%</strong></span>
          </div>
        </div>
      </div>

      {score.verdict&&(
        <div style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"10px 12px",marginBottom:12,fontSize:12,color:T2,lineHeight:1.6}}>
          <div style={{fontSize:10,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:4}}>Coach Verdict</div>
          {score.verdict}
        </div>
      )}

      {cats.length>0&&(
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:8}}>9-Category Scorecard</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
            {cats.map((cat,i)=>(
              <div key={i} style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"8px 10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:3}}>
                  <span style={{fontSize:11,fontWeight:700,color:TEXT}}>{cat.name}</span>
                  <span style={{fontSize:12,fontWeight:800,color:sc(cat.status)}}>{Number(cat.score)||0}</span>
                </div>
                <div style={{fontSize:10,color:T3,lineHeight:1.5}}>{cat.oneliner}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {strengths.length>0&&(
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:GREEN,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:6}}>Strengths</div>
          <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:4}}>
            {strengths.map((s,i)=>(
              <li key={i} style={{fontSize:12,color:T2,paddingLeft:14,position:"relative"}}>
                <span style={{position:"absolute",left:0,color:GREEN}}>✓</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {moments.length>0&&(
        <div>
          <div style={{fontSize:10,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:6}}>Key Moments</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {moments.map((m,i)=>(
              <div key={i} style={{background:S2,border:`1px solid ${sc(m.status)}33`,borderRadius:6,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:700,color:sc(m.status),marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em"}}>{m.category} · {m.status}</div>
                <div style={{fontSize:12,color:TEXT,marginBottom:4,lineHeight:1.5}}><strong>What:</strong> {m.what}</div>
                <div style={{fontSize:12,color:T2,marginBottom:4,lineHeight:1.5}}><strong>Why:</strong> {m.why}</div>
                {m.rewrite&&<div style={{fontSize:12,color:GREEN,lineHeight:1.5}}><strong>Try:</strong> {m.rewrite}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ACCOUNT MANAGEMENT ────────────────────────────────────────────────────────
function AccountManagement({onBack,isSuperAdmin=false}){
  const [accounts,setAccounts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false);
  const [form,setForm]=useState({name:"",api_key:"",location_id:"",company_id:""});
  const [error,setError]=useState("");
  const [detailAccount,setDetailAccount]=useState(null);

  const call=async(body)=>{
    try{
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return { ok: false, error: "Not signed in" };
      const res=await fetch(`${SUPABASE_URL}/functions/v1/ghl-proxy`,{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,apikey: SUPABASE_KEY},
        body:JSON.stringify(body),
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok)return{ok:false,error:data.error||`Backend temporarily unavailable (${res.status}). Please retry in a moment.`,retryable:res.status>=500};
      return data;
    }catch(e){
      return{ok:false,error:"Backend temporarily unavailable. Please retry in a moment.",retryable:true};
    }
  };

  useEffect(()=>{
    call({action:"list-accounts"}).then(d=>{setAccounts(d.accounts||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);

  async function addAccount(){
    if(!form.name.trim()||!form.api_key.trim()||!form.location_id.trim()||!form.company_id.trim()){setError("All fields required");return;}
    setAdding(true);setError("");
    try{
      const d=await call({action:"add-account",...form});
      if(d.error){setError(d.error);setAdding(false);return;}
      setAccounts(p=>[d.account,...p]);
      setForm({name:"",api_key:"",location_id:"",company_id:""});
    }catch(e){setError(e.message);}
    setAdding(false);
  }

  async function deleteAccount(accountId){
    if(!confirm("Delete this account and all its users/contacts?"))return;
    await call({action:"delete-account",account_id:accountId});
    setAccounts(p=>p.filter(a=>a.id!==accountId));
  }

  // For non-super users: auto-open the only account they have access to (skip the list view)
  const autoAccount=!isSuperAdmin&&!detailAccount&&!loading&&accounts.length>=1?accounts[0]:null;
  const effectiveDetail=detailAccount||autoAccount;
  if(effectiveDetail){
    return <AccountDetail account={effectiveDetail} onBack={isSuperAdmin?()=>setDetailAccount(null):onBack} callApi={call} isSuperAdmin={isSuperAdmin}/>;
  }

  return(
    <div style={{overflowY:"auto",flex:1,padding:"20px 24px 48px"}} className="fade">
      <div style={{maxWidth:860,width:"100%",margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Account Management</div>
            <div style={{fontSize:12,color:T3}}>Connect GoHighLevel accounts · Sync & manage team</div>
          </div>
          <button onClick={onBack} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 13px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>
        </div>

        {error&&<div style={{background:"#1a0a0a",border:`1px solid ${RED}44`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:RED}}>{error}<button onClick={()=>setError("")} style={{float:"right",background:"none",border:"none",color:RED,cursor:"pointer",fontSize:12}}>✕</button></div>}

        {/* Add Account Form (super only) */}
        {isSuperAdmin&&(
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"16px 18px",marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12}}>Add GHL Account</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:"1 1 180px",display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Account Name</div>
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Main Office"
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none",width:"100%"}}/>
            </div>
            <div style={{flex:"1 1 220px",display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>API Key</div>
              <input type="password" value={form.api_key} onChange={e=>setForm(p=>({...p,api_key:e.target.value}))} placeholder="GHL API Key"
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none",width:"100%"}}/>
            </div>
            <div style={{flex:"1 1 160px",display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Location ID</div>
              <input value={form.location_id} onChange={e=>setForm(p=>({...p,location_id:e.target.value}))} placeholder="Sub-account / Location ID"
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none",width:"100%"}}/>
            </div>
            <div style={{flex:"1 1 160px",display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Company ID</div>
              <input value={form.company_id} onChange={e=>setForm(p=>({...p,company_id:e.target.value}))} placeholder="Agency / Company ID"
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none",width:"100%"}}/>
            </div>
            <button onClick={addAccount} disabled={adding}
              style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 18px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",opacity:adding?.5:1,flexShrink:0}}>
              {adding?"Adding...":"+ Add Account"}
            </button>
          </div>
        </div>
        )}

        {/* Account List */}
        {loading?<div style={{textAlign:"center",color:T3,padding:40,fontSize:11}}>Loading accounts...</div>:
          accounts.length===0?<div style={{textAlign:"center",color:T3,padding:40,fontSize:11}}>No accounts connected yet. Add one above.</div>:
          accounts.map(acc=>(
            <div key={acc.id} onClick={()=>setDetailAccount(acc)} style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,marginBottom:10,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"border-color .15s"}}
              onMouseOver={e=>e.currentTarget.style.borderColor=GREEN+"44"}
              onMouseOut={e=>e.currentTarget.style.borderColor=B1}>
              <div style={{width:36,height:36,borderRadius:8,background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:GREEN}}>
                {acc.name.slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700}}>{acc.name}</div>
                <div style={{fontSize:12,color:T3}}>Location: {acc.location_id}</div>
              </div>
              {isSuperAdmin&&(<button onClick={e=>{e.stopPropagation();deleteAccount(acc.id);}}
                style={{background:"transparent",border:`1px solid ${B2}`,borderRadius:6,padding:"5px 10px",color:T3,fontSize:12,cursor:"pointer"}}>✕</button>)}
              <span style={{fontSize:12,color:T3}}>→</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── ACCOUNT DETAIL PAGE ───────────────────────────────────────────────────────
function AccountDetail({account,onBack,callApi,isSuperAdmin=false}){
  const [tab,setTab]=useState("overview");
  const [users,setUsers]=useState([]);
  const [contacts,setContacts]=useState([]);
  const [contactCounts,setContactCounts]=useState({});
  const [totalContacts,setTotalContacts]=useState(0);
  const [filteredContactsTotal,setFilteredContactsTotal]=useState(0);
  const [syncingUsers,setSyncingUsers]=useState(false);
  const [syncingContacts,setSyncingContacts]=useState(false);
  const [contactFilter,setContactFilter]=useState("");
  const [error,setError]=useState("");
  const [fetchProgress,setFetchProgress]=useState("");
  const [contactsPage,setContactsPage]=useState(1);
  const CONTACTS_PER_PAGE=50;

  // Calls state
  const [calls,setCalls]=useState([]);
  const [totalCalls,setTotalCalls]=useState(0);
  const [indexedCalls,setIndexedCalls]=useState(0);
  const [pendingCalls,setPendingCalls]=useState(0);
  const [scoredCalls,setScoredCalls]=useState(0);
  const [noTranscriptCalls,setNoTranscriptCalls]=useState(0);
  const [callsPage,setCallsPage]=useState(1);
  const [fetchingCalls,setFetchingCalls]=useState(false);
  const [fetchingTranscripts,setFetchingTranscripts]=useState(false);
  const [transcribingRecordings,setTranscribingRecordings]=useState(false);
  const [scoringCalls,setScoringCalls]=useState(false);
  const [callProgress,setCallProgress]=useState("");
  const [callFilter,setCallFilter]=useState("");
  const [expandedCallId,setExpandedCallId]=useState(null);
  const [callScores,setCallScores]=useState({}); // call_id -> score record (or null)
  const [loadingScoreId,setLoadingScoreId]=useState(null);
  const [scoringSingleId,setScoringSingleId]=useState(null);
  const [conversations,setConversations]=useState([]);
  const [totalConversations,setTotalConversations]=useState(0);
  const [totalMessages,setTotalMessages]=useState(0);
  const [totalCallMessages,setTotalCallMessages]=useState(0);
  const [convMessages,setConvMessages]=useState([]);
  const [expandedConvId,setExpandedConvId]=useState(null);
  const [loadingConvMsgs,setLoadingConvMsgs]=useState(false);
  const [blockedNumbers,setBlockedNumbers]=useState([]);
  const [showBlockedPanel,setShowBlockedPanel]=useState(false);
  const [newBlockedNumber,setNewBlockedNumber]=useState("");
  const [newBlockedReason,setNewBlockedReason]=useState("");
  const [blockingNumberId,setBlockingNumberId]=useState(null);
  const CALLS_PER_PAGE=25;

  // Normalize a phone string for comparison (last 10 digits)
  const normPhone=(p)=>{const d=String(p||"").replace(/\D/g,"");return d.length>10?d.slice(-10):d;};
  const blockedSet=React.useMemo(()=>new Set(blockedNumbers.map(b=>normPhone(b.phone_number))),[blockedNumbers]);

  async function loadConversations(){
    const d=await callApi({action:"list-conversations",account_id:account.id,page:1,page_size:50});
    if(d.error){setError(d.error);return;}
    setConversations(d.conversations||[]);
    setTotalConversations(d.total||0);
    setTotalMessages(d.total_messages||0);
    setTotalCallMessages(d.total_calls||0);
  }

  async function loadConvMessages(convId){
    if(expandedConvId===convId){setExpandedConvId(null);setConvMessages([]);return;}
    setExpandedConvId(convId);setLoadingConvMsgs(true);setConvMessages([]);
    const d=await callApi({action:"list-messages",account_id:account.id,conversation_id:convId});
    setConvMessages(d.messages||[]);
    setLoadingConvMsgs(false);
  }

  async function loadBlockedNumbers(){
    const d=await callApi({action:"list-blocked-numbers",account_id:account.id});
    if(d.blocked)setBlockedNumbers(d.blocked);
  }

  async function addBlockedNumber(phone,reason){
    const phoneToBlock=phone||newBlockedNumber;
    if(!phoneToBlock.trim())return;
    const d=await callApi({action:"add-blocked-number",account_id:account.id,phone_number:phoneToBlock,reason:reason||newBlockedReason||null});
    if(d.error){setError(d.error);return;}
    if(!phone){setNewBlockedNumber("");setNewBlockedReason("");}
    await loadBlockedNumbers();
  }

  async function removeBlockedNumber(blockedId){
    const d=await callApi({action:"remove-blocked-number",account_id:account.id,blocked_id:blockedId});
    if(d.error){setError(d.error);return;}
    await loadBlockedNumbers();
  }

  async function blockCallNumber(call){
    const phone=call.phone||call.from||call.to;
    if(!phone)return;
    setBlockingNumberId(call.id);
    await addBlockedNumber(phone,"Blocked from call list");
    setBlockingNumberId(null);
  }

  useEffect(()=>{
    loadUsers();
    loadContacts();
    loadCalls();
    loadConversations();
    loadBlockedNumbers();
  },[]);

  async function loadUsers(){
    const d=await callApi({action:"list-users",account_id:account.id});
    setUsers(d.users||[]);
  }

  async function loadContacts(filterUserId,page=1){
    const body={action:"list-contacts",account_id:account.id,page,page_size:CONTACTS_PER_PAGE};
    if(filterUserId)body.assigned_user_id=filterUserId;
    const d=await callApi(body);
    if(d.error){setError(d.error);return d;}
    setContacts(d.contacts||[]);
    if(d.counts)setContactCounts(d.counts);
    if(d.total!==undefined)setTotalContacts(d.total);
    if(d.filtered_total!==undefined)setFilteredContactsTotal(d.filtered_total);
    setContactsPage(page);
    return d;
  }

  async function loadCalls(filterUserId,page=1){
    const body={action:"list-calls",account_id:account.id,page,page_size:CALLS_PER_PAGE};
    if(filterUserId)body.assigned_user_id=filterUserId;
    const d=await callApi(body);
    if(d.error){setError(d.error);return;}
    setCalls(d.calls||[]);
    setTotalCalls(d.total||0);
    setIndexedCalls(d.indexed||0);
    setPendingCalls(d.pending||0);
    setScoredCalls(d.scored||0);
    setNoTranscriptCalls(d.no_transcript||0);
    setCallsPage(page);
  }

  async function fetchUsers(){
    setSyncingUsers(true);setError("");
    try{
      const d=await callApi({action:"fetch-users",account_id:account.id});
      if(d.error){setError(d.error);setSyncingUsers(false);return;}
      setUsers(d.users||[]);
    }catch(e){setError(e.message);}
    setSyncingUsers(false);
  }

  const MAX_FETCH_BATCHES=20;
  async function fetchContacts(){
    setSyncingContacts(true);setError("");setFetchProgress("Starting fetch...");
    let cursor=null;
    let cursorId=null;
    let totalFetched=0;
    let batchNum=0;
    let latestStoredTotal=totalContacts;
    try{
      while(batchNum<MAX_FETCH_BATCHES){
        batchNum++;
        const d=await callApi({action:"fetch-contacts",account_id:account.id,cursor,cursor_id:cursorId});
        if(d.error){setError(d.retryable?`${d.error} Progress was saved; click Fetch Contacts again to continue.`:d.error);break;}
        totalFetched+=d.fetched||0;
        if(d.stored_total!==undefined)latestStoredTotal=d.stored_total;
        if(d.hasMore && (d.cursor || d.cursor_id)){
          setFetchProgress(`Fetched ${totalFetched} so far · ${latestStoredTotal} total stored`);
          cursor=d.cursor;
          cursorId=d.cursor_id;
        }else{
          setFetchProgress(`✓ Done! ${totalFetched} synced · ${latestStoredTotal} total contacts stored.`);
          break;
        }
      }
      if(batchNum>=MAX_FETCH_BATCHES){
        setFetchProgress(`✓ Stopped after ${totalFetched} synced · ${latestStoredTotal} total stored.`);
      }
      const latest=await loadContacts(contactFilter||undefined,1);
      if(latest?.total!==undefined)setTotalContacts(latest.total);
      setTimeout(()=>setFetchProgress(""),5000);
    }catch(e){setError(e.message);setFetchProgress("");}
    setSyncingContacts(false);
  }

  async function fetchCalls(){
    setFetchingCalls(true);setError("");
      const BATCH=25;

    try{
      let offset=0;
      let hasMore=true;
      let totalContacts=0;
      let totalConvs=0;
      let totalMsgs=0;
      let totalCalls=0;
      let safety=0;
      const seenOffsets=new Set();

      while(hasMore && safety<200){
        safety++;
        if(seenOffsets.has(offset)){
          hasMore=false;
          break;
        }
        seenOffsets.add(offset);
        setCallProgress(`Fetching conversations: recent call page ${safety}... (${totalConvs} convs, ${totalMsgs} msgs, ${totalCalls} calls so far)`);
        const d=await callApi({action:"fetch-conversations",account_id:account.id,batch_offset:offset,batch_limit:BATCH});
        if(d.error){setError(d.error);setCallProgress("");setFetchingCalls(false);return;}
        totalContacts=d.total_contacts||0;
        totalConvs=d.stored_conversations||0;
        totalMsgs=d.stored_messages||0;
        totalCalls=d.stored_call_messages||0;
        hasMore=!!d.has_more;
        const nextOffset=d.next_offset ?? (offset+BATCH);
        if(nextOffset===offset)hasMore=false;
        offset=nextOffset;
      }

      setCallProgress(`✓ Done. ${totalConvs} conversations · ${totalMsgs} messages · ${totalCalls} call messages saved. Now click "2) Fetch Transcripts" to pull transcripts for the calls.`);
      await loadCalls(callFilter||undefined,1);
      await loadConversations();
      setTimeout(()=>setCallProgress(""),12000);
    }catch(e){setError(e.message);setCallProgress("");}
    setFetchingCalls(false);
  }

  async function fetchTranscripts(){
    setFetchingTranscripts(true);setError("");
    const BATCH=100;

    try{
      setCallProgress(`Step 2/2: fetching transcripts for up to ${BATCH} indexed calls...`);
      const d=await callApi({action:"fetch-transcripts",account_id:account.id,batch_offset:0,batch_limit:BATCH});
      if(d.error){setError(d.error);setCallProgress("");setFetchingTranscripts(false);return;}
      setCallProgress(`✓ ${d.transcripts_fetched||0} transcripts fetched · ${d.missing_transcripts||0} missing · ${d.pending_scoring||0} ready to score · ${d.indexed_remaining||0} still indexed`);
      await loadCalls(callFilter||undefined,1);
      setTimeout(()=>setCallProgress(""),8000);
    }catch(e){setError(e.message);setCallProgress("");}
    setFetchingTranscripts(false);
  }

  async function transcribeRecordings(){
    setTranscribingRecordings(true);setError("");
    try{
      setCallProgress("Transcribing the next recordings... click again for the next batch.");
      const d=await callApi({action:"transcribe-recordings",account_id:account.id,batch_limit:2});
      if(d.error){setError(d.error);setCallProgress("");setTranscribingRecordings(false);return;}
      setCallProgress(`✓ ${d.transcribed||0}/${d.processed||0} transcribed · ${d.failed||0} failed${d.blocked_skipped?` · ${d.blocked_skipped} blocked skipped`:""}${d.errors&&d.errors.length?" · "+d.errors[0]:""}`);
      await loadCalls(callFilter||undefined,1);
      setTimeout(()=>setCallProgress(""),12000);
    }catch(e){setError(e.message);setCallProgress("");}
    setTranscribingRecordings(false);
  }

  async function scoreAllPending(){
    setScoringCalls(true);setError("");
    const pendingCallsList=calls.filter(c=>c.status==="pending");
    const callsToScore=pendingCallsList.length?pendingCallsList:(await callApi({action:"list-calls",account_id:account.id,page:1,page_size:100})).calls?.filter(c=>c.status==="pending")||[];
    if(callsToScore.length===0){setCallProgress("No calls to score.");setScoringCalls(false);setTimeout(()=>setCallProgress(""),3000);return;}

    let scored=0,skipped=0,failed=0;
    for(const c of callsToScore){
      setCallProgress(`Scoring call ${scored+skipped+failed+1}/${callsToScore.length}...`);
      try{
        const r=await callApi({action:"score-call",call_id:c.id});
        if(r.ok)scored++;
        else if(r.status==="no_transcript")skipped++;
        else{failed++;console.warn("Score failed for",c.id,r.error||r);}
      }catch(e){failed++;console.error("Score error:",e);}
    }
    setCallProgress(`✓ Scored ${scored}/${callsToScore.length}${skipped?` · ${skipped} skipped (no transcript)`:""}${failed?` · ${failed} failed`:""}`);
    await loadCalls(callFilter||undefined,1);
    setScoringCalls(false);
    setTimeout(()=>setCallProgress(""),5000);
  }

  async function loadScoreForCall(callId){
    if(callScores[callId]!==undefined)return;
    setLoadingScoreId(callId);
    try{
      const d=await callApi({action:"get-score",call_id:callId});
      setCallScores(p=>({...p,[callId]:d.score||null}));
    }catch(e){console.error("get-score error:",e);}
    setLoadingScoreId(null);
  }

  async function toggleExpandedCall(call){
    const next=expandedCallId===call.id?null:call.id;
    setExpandedCallId(next);
    if(next&&call.score_id&&callScores[call.id]===undefined){
      loadScoreForCall(call.id);
    }
  }

  async function scoreSingleCall(callId){
    setScoringSingleId(callId);setError("");
    try{
      const r=await callApi({action:"score-call",call_id:callId});
      if(r.ok){
        setCallScores(p=>({...p,[callId]:r.score}));
        await loadCalls(callFilter||undefined,callsPage);
      }else{
        setError(r.error||"Scoring failed");
      }
    }catch(e){setError(e.message);}
    setScoringSingleId(null);
  }

  async function updateRole(userId,role){
    await callApi({action:"update-role",user_id:userId,role});
    setUsers(p=>p.map(u=>u.id===userId?{...u,role}:u));
  }

  function handleContactFilter(ghlUserId){
    setContactFilter(ghlUserId);
    if(ghlUserId){
      loadContacts(ghlUserId,1);
    }else{
      loadContacts(undefined,1);
    }
    setTab("contacts");
  }

  const roleLabel={unassigned:"Unassigned",sales_rep:"Sales Rep",admin:"Admin"};
  const roleColor={unassigned:T3,sales_rep:GREEN,admin:AMBER};
  const visibleContactsTotal=contactFilter?filteredContactsTotal:totalContacts;
  const totalContactPages=Math.max(1,Math.ceil(visibleContactsTotal/CONTACTS_PER_PAGE));
  const totalCallPages=Math.max(1,Math.ceil(totalCalls/CALLS_PER_PAGE));

  const userNameMap={};
  users.forEach(u=>{userNameMap[u.ghl_user_id]=u.name;});

  const tabs=[["overview","Overview"],["users","Users ("+users.length+")"],["contacts","Contacts ("+totalContacts+")"],["conversations","Conversations ("+totalConversations+")"],["calls","Calls ("+totalCalls+")"]];

  function formatDuration(secs){
    if(!secs)return "—";
    const m=Math.floor(secs/60);
    const s=secs%60;
    return m>0?`${m}m ${s}s`:`${s}s`;
  }

  function formatCallDate(d){
    if(!d)return "—";
    const dt=new Date(d);
    const now=new Date();
    const diff=now-dt;
    if(diff<86400000){
      return "Today "+dt.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    }
    if(diff<172800000){
      return "Yesterday "+dt.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    }
    return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})+" "+dt.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
  }

  const statusColors={indexed:T2,pending:AMBER,scored:GREEN,failed:RED,no_transcript:T3,skipped:T3};
  const statusLabels={indexed:"Indexed",pending:"Pending",scored:"Scored",failed:"Failed",no_transcript:"No Transcript",skipped:"Skipped"};

  return(
    <div style={{overflowY:"auto",flex:1,padding:"20px 24px 48px"}} className="fade">
      <div style={{maxWidth:920,width:"100%",margin:"0 auto"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
          <button onClick={onBack} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 13px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>
          <div style={{width:40,height:40,borderRadius:8,background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:GREEN}}>
            {account.name.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>{account.name}</div>
            <div style={{fontSize:12,color:T3}}>Location: {account.location_id}</div>
          </div>
        </div>

        {error&&<div style={{background:"#1a0a0a",border:`1px solid ${RED}44`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:RED}}>{error}<button onClick={()=>setError("")} style={{float:"right",background:"none",border:"none",color:RED,cursor:"pointer",fontSize:12}}>✕</button></div>}

        {/* Tab Bar */}
        <div style={{display:"flex",gap:2,background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:3,marginBottom:18}}>
          {tabs.map(([k,l])=>(
            <button key={k} onClick={()=>{setTab(k);if(k==="contacts"&&!contactFilter)loadContacts(undefined,1);if(k==="calls")loadCalls(callFilter||undefined,1);if(k==="conversations")loadConversations();}}
              style={{flex:1,background:"transparent",border:"none",borderBottom:`2px solid ${tab===k?GREEN:"transparent"}`,padding:"7px 0",color:tab===k?GREEN:T3,fontSize:13,fontWeight:tab===k?600:400,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab==="overview"&&(
          <div className="fade">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:18}}>
              {[
                ["Total Users",users.length,GREEN],
                ["Total Contacts",totalContacts,AMBER],
                ["Total Calls",totalCalls,T2],
                ["Scored Calls",scoredCalls,GREEN],
              ].map(([label,value,color])=>(
                <div key={label} style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"16px 18px",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color,letterSpacing:"0.04em"}}>{value}</div>
                  <div style={{fontSize:12,color:T3,marginTop:4,textTransform:"uppercase",letterSpacing:"0.10em"}}>{label}</div>
                </div>
              ))}
            </div>
            {isSuperAdmin&&(
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={fetchUsers} disabled={syncingUsers}
                style={{background:"transparent",border:`1px solid ${GREEN}`,borderRadius:6,padding:"8px 18px",color:GREEN,fontSize:13,fontWeight:600,cursor:"pointer",opacity:syncingUsers?.5:1}}>
                {syncingUsers?"Syncing Users...":"⟳ Sync Users from GHL"}
              </button>
              <button onClick={fetchContacts} disabled={syncingContacts}
                style={{background:"transparent",border:`1px solid ${GREEN}`,borderRadius:6,padding:"8px 18px",color:GREEN,fontSize:13,fontWeight:600,cursor:"pointer",opacity:syncingContacts?.5:1}}>
                {syncingContacts?"Fetching Contacts...":"⟳ Fetch Contacts"}
              </button>
              <button onClick={fetchCalls} disabled={fetchingCalls}
                style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 18px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",opacity:fetchingCalls?.5:1}}>
                {fetchingCalls?"Fetching Conversations...":"1) Fetch Conversations"}
              </button>
              <button onClick={fetchTranscripts} disabled={fetchingTranscripts}
                style={{background:AMBER,border:"none",borderRadius:6,padding:"8px 18px",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",opacity:fetchingTranscripts?.5:1}}>
                {fetchingTranscripts?"Fetching Transcripts...":"2) Fetch Transcripts"}
              </button>
              <button onClick={transcribeRecordings} disabled={transcribingRecordings}
                style={{background:"transparent",border:`1px solid ${AMBER}`,borderRadius:6,padding:"8px 18px",color:AMBER,fontSize:13,fontWeight:700,cursor:"pointer",opacity:transcribingRecordings?.5:1}}>
                {transcribingRecordings?"Transcribing...":"🎙 Transcribe Next Recordings"}
              </button>
              {pendingCalls>0&&(
                <button onClick={scoreAllPending} disabled={scoringCalls}
                  style={{background:AMBER,border:"none",borderRadius:6,padding:"8px 18px",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",opacity:scoringCalls?.5:1}}>
                  {scoringCalls?"Scoring...":` Score ${pendingCalls} Pending Calls`}
                </button>
              )}
            </div>
            )}
            {fetchProgress&&(
              <div style={{marginTop:12,background:S2,border:`1px solid ${fetchProgress.startsWith("✓")?GREEN+"44":B1}`,borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                {!fetchProgress.startsWith("✓")&&<div style={{width:6,height:6,borderRadius:"50%",background:GREEN,animation:"pulse 1.5s infinite",flexShrink:0}}/>}
                {fetchProgress.startsWith("✓")&&<span style={{color:GREEN,fontSize:14,flexShrink:0}}>✓</span>}
                <div style={{fontSize:13,color:fetchProgress.startsWith("✓")?GREEN:T2,fontWeight:600}}>{fetchProgress}</div>
              </div>
            )}
            {callProgress&&(
              <div style={{marginTop:12,background:S2,border:`1px solid ${callProgress.startsWith("✓")?GREEN+"44":B1}`,borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                {!callProgress.startsWith("✓")&&<div style={{width:6,height:6,borderRadius:"50%",background:AMBER,animation:"pulse 1.5s infinite",flexShrink:0}}/>}
                {callProgress.startsWith("✓")&&<span style={{color:GREEN,fontSize:14,flexShrink:0}}>✓</span>}
                <div style={{fontSize:13,color:callProgress.startsWith("✓")?GREEN:T2,fontWeight:600}}>{callProgress}</div>
              </div>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab==="users"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Team Members</div>
              <button onClick={fetchUsers} disabled={syncingUsers}
                style={{background:"transparent",border:`1px solid ${GREEN}`,borderRadius:6,padding:"5px 12px",color:GREEN,fontSize:12,fontWeight:600,cursor:"pointer",opacity:syncingUsers?.5:1}}>
                {syncingUsers?"Syncing...":"⟳ Fetch Users"}
              </button>
            </div>
            {users.length===0?
              <div style={{textAlign:"center",color:T3,padding:28,fontSize:11}}>No users synced yet. Click "Fetch Users" to pull from GHL.</div>:
              <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${B1}`}}>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Name</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Email</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Phone</th>
                      <th style={{textAlign:"center",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Contacts</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u=>{
                      const cnt=contactCounts[u.ghl_user_id]||0;
                      return(
                        <tr key={u.id} style={{borderBottom:`1px solid ${B1}22`}} className="lb-row">
                          <td style={{padding:"10px 12px",fontWeight:600,fontSize:13}}>{u.name||"—"}</td>
                          <td style={{padding:"10px 12px",color:T2,fontSize:13}}>{u.email||"—"}</td>
                          <td style={{padding:"10px 12px",color:T2,fontSize:13}}>{u.phone||"—"}</td>
                          <td style={{padding:"10px 12px",textAlign:"center"}}>
                            {cnt>0?(
                              <button onClick={()=>handleContactFilter(u.ghl_user_id)}
                                style={{background:"transparent",border:`1px solid ${GREEN}44`,borderRadius:5,padding:"2px 10px",color:GREEN,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                                {cnt}
                              </button>
                            ):(
                              <span style={{color:T3,fontSize:13}}>0</span>
                            )}
                          </td>
                          <td style={{padding:"10px 12px"}}>
                            <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)}
                              style={{background:S2,border:`1px solid ${roleColor[u.role]||B1}44`,borderRadius:5,padding:"4px 8px",color:roleColor[u.role]||T2,fontSize:12,fontWeight:600,outline:"none",cursor:"pointer"}}>
                              <option value="unassigned">Unassigned</option>
                              <option value="sales_rep">Sales Rep</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            }
          </div>
        )}

        {/* CONTACTS TAB */}
        {tab==="contacts"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Contacts</div>
                {contactFilter&&(
                  <div style={{display:"flex",alignItems:"center",gap:4,background:S2,border:`1px solid ${GREEN}44`,borderRadius:6,padding:"3px 10px"}}>
                    <span style={{fontSize:12,color:GREEN,fontWeight:600}}>Filtered: {userNameMap[contactFilter]||contactFilter}</span>
                    <button onClick={()=>{setContactFilter("");loadContacts(undefined,1);}} style={{background:"none",border:"none",color:GREEN,cursor:"pointer",fontSize:12,fontWeight:700}}>✕</button>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {users.length>0&&(
                  <select value={contactFilter} onChange={e=>handleContactFilter(e.target.value)}
                    style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"5px 10px",color:TEXT,fontSize:12,outline:"none",cursor:"pointer"}}>
                    <option value="">All Reps</option>
                    {users.map(u=><option key={u.ghl_user_id} value={u.ghl_user_id}>{u.name} ({contactCounts[u.ghl_user_id]||0})</option>)}
                  </select>
                )}
                <button onClick={fetchContacts} disabled={syncingContacts}
                  style={{background:GREEN,border:"none",borderRadius:6,padding:"6px 14px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer",opacity:syncingContacts?.5:1}}>
                  {syncingContacts?"Fetching...":"⟳ Fetch Contacts"}
                </button>
              </div>
            </div>
            {contacts.length===0?
              <div style={{textAlign:"center",color:T3,padding:28,fontSize:11}}>No contacts found. Click "Fetch Contacts" to pull from GHL.</div>:
              <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${B1}`}}>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Name</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Email</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Phone</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Assigned Rep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(()=>{
                      return contacts.map(c=>(
                        <tr key={c.id} style={{borderBottom:`1px solid ${B1}22`}} className="lb-row">
                          <td style={{padding:"10px 12px",fontWeight:600,fontSize:13}}>{c.name||"—"}</td>
                          <td style={{padding:"10px 12px",color:T2,fontSize:13}}>{c.email||"—"}</td>
                          <td style={{padding:"10px 12px",color:T2,fontSize:13}}>{c.phone||"—"}</td>
                          <td style={{padding:"10px 12px",fontSize:13}}>
                            {c.assigned_user_id?(
                              <span style={{color:GREEN,fontWeight:600}}>{userNameMap[c.assigned_user_id]||c.assigned_user_id}</span>
                            ):(
                              <span style={{color:T3}}>Unassigned</span>
                            )}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
                {/* Pagination */}
                {visibleContactsTotal>CONTACTS_PER_PAGE&&(
                  <div style={{padding:"10px 14px",borderTop:`1px solid ${B1}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,color:T3}}>
                      Showing {((contactsPage-1)*CONTACTS_PER_PAGE)+1}–{Math.min(contactsPage*CONTACTS_PER_PAGE,visibleContactsTotal)} of {visibleContactsTotal}
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>loadContacts(contactFilter||undefined,Math.max(1,contactsPage-1))} disabled={contactsPage===1}
                        style={{background:S2,border:`1px solid ${B1}`,borderRadius:5,padding:"4px 10px",color:contactsPage===1?T3:TEXT,fontSize:12,fontWeight:600,cursor:contactsPage===1?"default":"pointer",opacity:contactsPage===1?.4:1}}>
                        ← Prev
                      </button>
                      {(()=>{
                        const pages=[];
                        for(let i=Math.max(1,contactsPage-2);i<=Math.min(totalContactPages,contactsPage+2);i++){pages.push(i);}
                        return pages.map(p=>(
                          <button key={p} onClick={()=>loadContacts(contactFilter||undefined,p)}
                            style={{background:p===contactsPage?GREEN:S2,border:`1px solid ${p===contactsPage?GREEN:B1}`,borderRadius:5,padding:"4px 8px",color:p===contactsPage?TEXT:T3,fontSize:12,fontWeight:p===contactsPage?700:400,cursor:"pointer",minWidth:28}}>
                            {p}
                          </button>
                        ));
                      })()}
                      <button onClick={()=>loadContacts(contactFilter||undefined,Math.min(totalContactPages,contactsPage+1))} disabled={contactsPage>=totalContactPages}
                        style={{background:S2,border:`1px solid ${B1}`,borderRadius:5,padding:"4px 10px",color:contactsPage>=totalContactPages?T3:TEXT,fontSize:12,fontWeight:600,cursor:contactsPage>=totalContactPages?"default":"pointer",opacity:contactsPage>=totalContactPages?.4:1}}>
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            }
          </div>
        )}

        {/* CONVERSATIONS TAB */}
        {tab==="conversations"&&(
          <div className="fade">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                ["Conversations",totalConversations,GREEN],
                ["Total Messages",totalMessages,T2],
                ["Call Messages",totalCallMessages,AMBER],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                  <div style={{fontSize:11,color:T3,marginTop:2,textTransform:"uppercase",letterSpacing:"0.10em"}}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <button onClick={fetchCalls} disabled={fetchingCalls}
                style={{background:GREEN,border:"none",borderRadius:6,padding:"6px 14px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer",opacity:fetchingCalls?.5:1}}>
                {fetchingCalls?"Fetching...":"⟳ Fetch Conversations from GHL"}
              </button>
              <button onClick={loadConversations}
                style={{background:"transparent",border:`1px solid ${B1}`,borderRadius:6,padding:"6px 14px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                Refresh
              </button>
            </div>

            {callProgress&&(
              <div style={{marginBottom:12,background:S2,border:`1px solid ${callProgress.startsWith("✓")?GREEN+"44":B1}`,borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                {!callProgress.startsWith("✓")&&<div style={{width:6,height:6,borderRadius:"50%",background:AMBER,animation:"pulse 1.5s infinite",flexShrink:0}}/>}
                {callProgress.startsWith("✓")&&<span style={{color:GREEN,fontSize:14,flexShrink:0}}>✓</span>}
                <div style={{fontSize:13,color:callProgress.startsWith("✓")?GREEN:T2,fontWeight:600}}>{callProgress}</div>
              </div>
            )}

            {conversations.length===0?
              <div style={{textAlign:"center",color:T3,padding:28,fontSize:11}}>No conversations saved yet. Click "Fetch Conversations from GHL" to start.</div>:
              <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,overflow:"hidden"}}>
                {conversations.map(conv=>(
                  <div key={conv.id} style={{borderBottom:`1px solid ${B1}`}}>
                    <div onClick={()=>loadConvMessages(conv.ghl_conversation_id)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:T2,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {conv.last_message_body||"(no preview)"}
                        </div>
                        <div style={{fontSize:11,color:T3,marginTop:3,display:"flex",gap:8,flexWrap:"wrap"}}>
                          <span>Type: {conv.last_message_type||conv.type||"—"}</span>
                          <span>•</span>
                          <span>{conv.last_message_date?new Date(conv.last_message_date).toLocaleString():""}</span>
                          {conv.unread_count>0&&<span style={{color:AMBER}}>• {conv.unread_count} unread</span>}
                        </div>
                      </div>
                      <span style={{color:T3,fontSize:14}}>{expandedConvId===conv.ghl_conversation_id?"▾":"▸"}</span>
                    </div>
                    {expandedConvId===conv.ghl_conversation_id&&(
                      <div style={{background:S2,padding:"10px 14px",borderTop:`1px solid ${B1}`}}>
                        {loadingConvMsgs?<div style={{color:T3,fontSize:11}}>Loading messages...</div>:
                          convMessages.length===0?<div style={{color:T3,fontSize:11}}>No messages.</div>:
                          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:400,overflowY:"auto"}}>
                            {convMessages.map(m=>{
                              const isCall=(m.message_type||"").toUpperCase().includes("CALL");
                              return (
                                <div key={m.id} style={{background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:"8px 10px"}}>
                                  <div style={{display:"flex",gap:8,fontSize:10,color:T3,marginBottom:4,flexWrap:"wrap"}}>
                                    <span style={{color:isCall?AMBER:GREEN,fontWeight:700}}>{m.message_type||"MSG"}</span>
                                    <span>•</span>
                                    <span>{m.direction||"—"}</span>
                                    {m.call_duration?<><span>•</span><span>{Math.floor(m.call_duration/60)}m {m.call_duration%60}s</span></>:null}
                                    {m.call_status?<><span>•</span><span>{m.call_status}</span></>:null}
                                    <span style={{marginLeft:"auto"}}>{m.message_date?new Date(m.message_date).toLocaleString():""}</span>
                                  </div>
                                  {m.body&&<div style={{fontSize:12,color:T2,whiteSpace:"pre-wrap"}}>{m.body}</div>}
                                  {m.transcript&&<div style={{fontSize:11,color:T2,marginTop:6,padding:"6px 8px",background:"#0a0a0a",border:`1px solid ${B1}`,borderRadius:4,whiteSpace:"pre-wrap"}}>{m.transcript}</div>}
                                </div>
                              );
                            })}
                          </div>
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
            }
          </div>
        )}

        {/* CALLS TAB */}
        {tab==="calls"&&(
          <div className="fade">
            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                ["Total",totalCalls,T2],
                ["Indexed",indexedCalls,T2],
                ["Pending",pendingCalls,AMBER],
                ["Scored",scoredCalls,GREEN],
                ["No Transcript",noTranscriptCalls,T3],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                  <div style={{fontSize:11,color:T3,marginTop:2,textTransform:"uppercase",letterSpacing:"0.10em"}}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {users.length>0&&(
                  <select value={callFilter} onChange={e=>{setCallFilter(e.target.value);loadCalls(e.target.value||undefined,1);}}
                    style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"5px 10px",color:TEXT,fontSize:12,outline:"none",cursor:"pointer"}}>
                    <option value="">All Reps</option>
                    {users.map(u=><option key={u.ghl_user_id} value={u.ghl_user_id}>{u.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>setShowBlockedPanel(s=>!s)}
                  style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"6px 12px",color:T2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  🚫 Blocked ({blockedNumbers.length})
                </button>
                <button onClick={fetchCalls} disabled={fetchingCalls}
                  style={{background:GREEN,border:"none",borderRadius:6,padding:"6px 14px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer",opacity:fetchingCalls?.5:1}}>
                  {fetchingCalls?"Fetching...":"1) Fetch Conversations"}
                </button>
                <button onClick={fetchTranscripts} disabled={fetchingTranscripts}
                  style={{background:AMBER,border:"none",borderRadius:6,padding:"6px 14px",color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",opacity:fetchingTranscripts?.5:1}}>
                  {fetchingTranscripts?"Fetching...":"2) Fetch Transcripts"}
                </button>
                <button onClick={transcribeRecordings} disabled={transcribingRecordings}
                  style={{background:"#7c5cff",border:"none",borderRadius:6,padding:"6px 14px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer",opacity:transcribingRecordings?.5:1}}>
                  {transcribingRecordings?"Transcribing...":"3) Transcribe Recordings"}
                </button>
                {pendingCalls>0&&(
                  <button onClick={scoreAllPending} disabled={scoringCalls}
                    style={{background:AMBER,border:"none",borderRadius:6,padding:"6px 14px",color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",opacity:scoringCalls?.5:1}}>
                    {scoringCalls?"Scoring...":`⚡ Score ${pendingCalls} Calls`}
                  </button>
                )}
              </div>
            </div>

            {showBlockedPanel&&(
              <div style={{marginBottom:14,background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:14}}>
                <div style={{fontSize:12,fontWeight:700,color:T2,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>🚫 Blocked Numbers ({blockedNumbers.length})</div>
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  <input value={newBlockedNumber} onChange={e=>setNewBlockedNumber(e.target.value)} placeholder="Phone (e.g. +18607101427)"
                    style={{flex:"1 1 200px",background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:"6px 10px",color:TEXT,fontSize:12,outline:"none"}}/>
                  <input value={newBlockedReason} onChange={e=>setNewBlockedReason(e.target.value)} placeholder="Reason (optional)"
                    style={{flex:"1 1 200px",background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:"6px 10px",color:TEXT,fontSize:12,outline:"none"}}/>
                  <button onClick={()=>addBlockedNumber()}
                    style={{background:GREEN,border:"none",borderRadius:6,padding:"6px 14px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    Block
                  </button>
                </div>
                {blockedNumbers.length===0?
                  <div style={{fontSize:12,color:T3,fontStyle:"italic"}}>No numbers blocked yet. Blocked numbers are skipped during transcription and scoring.</div>:
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {blockedNumbers.map(b=>(
                      <div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:"6px 10px"}}>
                        <div style={{display:"flex",gap:14,alignItems:"center"}}>
                          <span style={{fontFamily:"monospace",fontSize:13,color:TEXT,fontWeight:700}}>{b.phone_number}</span>
                          {b.reason&&<span style={{fontSize:11,color:T3}}>{b.reason}</span>}
                        </div>
                        <button onClick={()=>removeBlockedNumber(b.id)}
                          style={{background:"transparent",border:`1px solid ${B1}`,borderRadius:5,padding:"3px 8px",color:T3,fontSize:11,cursor:"pointer"}}>
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )}

            {callProgress&&(
              <div style={{marginBottom:12,background:S2,border:`1px solid ${callProgress.startsWith("✓")?GREEN+"44":B1}`,borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                {!callProgress.startsWith("✓")&&<div style={{width:6,height:6,borderRadius:"50%",background:AMBER,animation:"pulse 1.5s infinite",flexShrink:0}}/>}
                {callProgress.startsWith("✓")&&<span style={{color:GREEN,fontSize:14,flexShrink:0}}>✓</span>}
                <div style={{fontSize:13,color:callProgress.startsWith("✓")?GREEN:T2,fontWeight:600}}>{callProgress}</div>
              </div>
            )}

            {calls.length===0?
              <div style={{textAlign:"center",color:T3,padding:28,fontSize:11}}>No calls found yet. Click "1) Index Calls" first, then "2) Fetch Transcripts".</div>:
              <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${B1}`}}>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Date</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Rep</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Phone</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Direction</th>
                      <th style={{textAlign:"center",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Duration</th>
                      <th style={{textAlign:"center",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Status</th>
                      <th style={{textAlign:"center",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Score</th>
                      <th style={{textAlign:"left",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}>Transcript</th>
                      <th style={{textAlign:"center",padding:"10px 12px",color:T3,fontWeight:600,fontSize:13,textTransform:"uppercase",letterSpacing:"0.1em"}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map(c=>{
                      const cachedScore=callScores[c.id];
                      const hasTranscript=!!(c.transcript&&c.transcript.trim().length>=50);
                      const phone=c.phone||(c.direction==="outbound"?c.to:c.from)||null;
                      const isBlocked=phone&&blockedSet.has(normPhone(phone));
                      return(
                      <React.Fragment key={c.id}>
                      <tr style={{borderBottom:`1px solid ${B1}22`,cursor:"pointer",opacity:isBlocked?.45:1}} className="lb-row" onClick={()=>toggleExpandedCall(c)}>
                        <td style={{padding:"10px 12px",fontSize:13,color:T2}}>{formatCallDate(c.call_date)}</td>
                        <td style={{padding:"10px 12px",fontWeight:600,fontSize:13}}>{userNameMap[c.assigned_user_id]||c.assigned_user_id||"—"}</td>
                        <td style={{padding:"10px 12px",fontSize:12,color:isBlocked?"#ff6b6b":T2,fontFamily:"monospace"}}>{phone||"—"}{isBlocked&&" 🚫"}</td>
                        <td style={{padding:"10px 12px",fontSize:13,color:c.direction==="outbound"?GREEN:AMBER}}>{c.direction==="outbound"?"↗ Out":"↙ In"}</td>
                        <td style={{padding:"10px 12px",textAlign:"center",fontSize:13,color:T2}}>{formatDuration(c.call_duration)}</td>
                        <td style={{padding:"10px 12px",textAlign:"center"}}>
                          <span style={{fontSize:11,fontWeight:700,color:statusColors[c.status]||T3,background:S2,border:`1px solid ${statusColors[c.status]||B1}44`,borderRadius:5,padding:"2px 8px"}}>
                            {statusLabels[c.status]||c.status}
                          </span>
                        </td>
                        <td style={{padding:"10px 12px",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                          {c.score_id?(
                            <span style={{fontSize:13,fontWeight:800,color:gc(cachedScore?.overall_score??0),fontFamily:"'Open Sans',sans-serif"}}>
                              {cachedScore?`${cachedScore.overall_score} · ${cachedScore.grade}`:"View"}
                            </span>
                          ):hasTranscript?(
                            <button onClick={()=>scoreSingleCall(c.id)} disabled={scoringSingleId===c.id}
                              style={{background:GREEN,border:"none",borderRadius:5,padding:"4px 10px",color:TEXT,fontSize:11,fontWeight:700,cursor:"pointer",opacity:scoringSingleId===c.id?.5:1}}>
                              {scoringSingleId===c.id?"Scoring...":"⚡ Score"}
                            </button>
                          ):(
                            <span style={{fontSize:11,color:T3}}>—</span>
                          )}
                        </td>
                        <td style={{padding:"10px 12px",fontSize:12,color:T3,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {c.transcript?c.transcript.slice(0,60)+"...":c.status==="indexed"?"Indexed only — fetch transcript":"—"}
                        </td>
                        <td style={{padding:"10px 12px",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                          {phone&&!isBlocked&&(
                            <button onClick={()=>blockCallNumber(c)} disabled={blockingNumberId===c.id} title={`Block ${phone}`}
                              style={{background:"transparent",border:`1px solid ${B1}`,borderRadius:5,padding:"3px 7px",color:T3,fontSize:11,cursor:"pointer",opacity:blockingNumberId===c.id?.5:1}}>
                              🚫
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedCallId===c.id&&(
                        <tr style={{background:S2}}>
                          <td colSpan={9} style={{padding:0}}>
                            <div style={{padding:"16px 20px",maxHeight:560,overflowY:"auto"}}>
                              <div style={{display:"flex",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                                <div style={{fontSize:11,color:T3}}>Contact: <span style={{color:TEXT,fontWeight:600}}>{c.contact_id||"—"}</span></div>
                                <div style={{fontSize:11,color:T3}}>Conversation: <span style={{color:TEXT,fontWeight:600}}>{c.conversation_id||"—"}</span></div>
                                <div style={{fontSize:11,color:T3}}>Duration: <span style={{color:TEXT,fontWeight:600}}>{formatDuration(c.call_duration)}</span></div>
                                <div style={{fontSize:11,color:T3}}>Direction: <span style={{color:c.direction==="outbound"?GREEN:AMBER,fontWeight:600}}>{c.direction}</span></div>
                              </div>

                              {c.score_id&&(
                                loadingScoreId===c.id&&!cachedScore?
                                  <div style={{color:T3,fontSize:12,fontStyle:"italic",marginBottom:14}}>Loading scorecard...</div>:
                                cachedScore?<CallScoreCard score={cachedScore}/>:null
                              )}

                              <div style={{fontSize:12,fontWeight:700,color:GREEN,marginBottom:8,marginTop:cachedScore?16:0}}>Transcript</div>
                              {c.transcript?(
                                <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:14,fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap",color:TEXT,fontFamily:"monospace"}}>
                                  {c.transcript.split("\n").map((line,i)=>{
                                    const isRep=line.startsWith("Rep:");
                                    const isSeller=line.startsWith("Seller:");
                                    return <div key={i} style={{marginBottom:4,color:isRep?GREEN:isSeller?AMBER:T2}}>{line}</div>;
                                  })}
                                </div>
                              ):(
                                <div style={{color:T3,fontSize:12,fontStyle:"italic"}}>{c.status==="indexed"?"Call indexed successfully. Run \"2) Fetch Transcripts\" to pull the transcription.":"No transcript available for this call."}</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {/* Pagination */}
                {totalCalls>CALLS_PER_PAGE&&(
                  <div style={{padding:"10px 14px",borderTop:`1px solid ${B1}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,color:T3}}>
                      Showing {((callsPage-1)*CALLS_PER_PAGE)+1}–{Math.min(callsPage*CALLS_PER_PAGE,totalCalls)} of {totalCalls}
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>loadCalls(callFilter||undefined,Math.max(1,callsPage-1))} disabled={callsPage===1}
                        style={{background:S2,border:`1px solid ${B1}`,borderRadius:5,padding:"4px 10px",color:callsPage===1?T3:TEXT,fontSize:12,fontWeight:600,cursor:callsPage===1?"default":"pointer",opacity:callsPage===1?.4:1}}>
                        ← Prev
                      </button>
                      {(()=>{
                        const pages=[];
                        for(let i=Math.max(1,callsPage-2);i<=Math.min(totalCallPages,callsPage+2);i++){pages.push(i);}
                        return pages.map(p=>(
                          <button key={p} onClick={()=>loadCalls(callFilter||undefined,p)}
                            style={{background:p===callsPage?GREEN:S2,border:`1px solid ${p===callsPage?GREEN:B1}`,borderRadius:5,padding:"4px 8px",color:p===callsPage?TEXT:T3,fontSize:12,fontWeight:p===callsPage?700:400,cursor:"pointer",minWidth:28}}>
                            {p}
                          </button>
                        ));
                      })()}
                      <button onClick={()=>loadCalls(callFilter||undefined,Math.min(totalCallPages,callsPage+1))} disabled={callsPage>=totalCallPages}
                        style={{background:S2,border:`1px solid ${B1}`,borderRadius:5,padding:"4px 10px",color:callsPage>=totalCallPages?T3:TEXT,fontSize:12,fontWeight:600,cursor:callsPage>=totalCallPages?"default":"pointer",opacity:callsPage>=totalCallPages?.4:1}}>
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── TEAM ROW (editable role + experience) ────────────────────────────────────
function TeamRow({rep,isLast,onUpdate,onRemove,selStyle}){
  const [role,setRole]=useState(rep.role||"Acq Rep");
  const [exp,setExp]=useState(rep.exp||"developing");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  useEffect(()=>{setRole(rep.role||"Acq Rep");setExp(rep.exp||"developing");},[rep.role,rep.exp]);
  const dirty=role!==rep.role||exp!==rep.exp;
  const color=gc(rep.avg||0);
  const badge=eb(exp);

  async function save(){
    if(!dirty||saving)return;
    setSaving(true);
    try{
      // Persist experience locally per ghl_user_id
      if(rep.ghlUserId){
        try{
          const all=JSON.parse(localStorage.getItem("cc:rep_exp_overrides")||"{}")||{};
          all[rep.ghlUserId]=exp;
          localStorage.setItem("cc:rep_exp_overrides",JSON.stringify(all));
        }catch(e){}
      }
      // Persist role to ghl_users via ghl-proxy
      if(rep.ghlUserId&&role!==rep.role){
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        // Map UI role label back to ghl_users.role token
        const ghlRole=role==="Admin"?"admin":role==="Sales Rep"||role==="Acq Rep"?"sales_rep":"unassigned";
        // account_id is account_admin's account — derive from ghlUserId via ghl_users table
        const { data: gu } = await supabase.from("ghl_users").select("account_id").eq("ghl_user_id",rep.ghlUserId).limit(1).maybeSingle();
        if(gu?.account_id){
          await fetch(`${SUPABASE_URL}/functions/v1/ghl-proxy`,{
            method:"POST",
            headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,apikey:SUPABASE_KEY},
            body:JSON.stringify({action:"update-ghl-user-role",account_id:gu.account_id,ghl_user_id:rep.ghlUserId,role:ghlRole}),
          });
        }
      }
      onUpdate&&onUpdate(rep.id,{role,exp});
      setSaved(true);setTimeout(()=>setSaved(false),1800);
    }catch(e){console.error("save team row failed",e);}
    setSaving(false);
  }

  return(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 18px",borderBottom:isLast?"none":`1px solid ${B1}`,flexWrap:"wrap"}}>
      <div style={{width:34,height:34,borderRadius:8,background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color,flexShrink:0,letterSpacing:"0.04em"}}>{rep.avatar}</div>
      <div style={{flex:"1 1 180px",minWidth:140}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
          <span style={{fontSize:12,fontWeight:700}}>{rep.name}</span>
          <Pill label={badge.l} color={badge.c}/>
          {rep.flagged&&<Pill label="FLAGGED" color={RED}/>}
        </div>
        <div style={{fontSize:12,color:T3}}>{rep.email?rep.email:""}{rep.phone?` · ${rep.phone}`:""}</div>
      </div>
      <select value={role} onChange={e=>setRole(e.target.value)} style={{...selStyle,width:130,padding:"5px 8px",fontSize:12}}>
        {ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
      </select>
      <select value={exp} onChange={e=>setExp(e.target.value)} style={{...selStyle,width:140,padding:"5px 8px",fontSize:12}}>
        {EXP_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <div style={{textAlign:"right",marginRight:6,minWidth:60}}>
        <div style={{fontSize:16,fontWeight:800,color,lineHeight:1,letterSpacing:"0.04em"}}>{rep.avg||"—"}</div>
        <div style={{fontSize:11,color:T3}}>{rep.total||0} calls</div>
      </div>
      <button onClick={save} disabled={!dirty||saving}
        style={{background:saved?"transparent":dirty?GREEN:"transparent",border:`1px solid ${dirty||saved?GREEN:B2}`,borderRadius:6,padding:"5px 11px",color:saved?GREEN:dirty?TEXT:T3,fontSize:11,fontWeight:700,cursor:dirty&&!saving?"pointer":"default",flexShrink:0,opacity:saving?0.6:1}}>
        {saving?"…":saved?"✓ Saved":"Save"}
      </button>
      <button onClick={()=>onRemove&&onRemove(rep.id)}
        style={{background:"transparent",border:`1px solid ${B2}`,borderRadius:6,padding:"5px 9px",color:T3,fontSize:11,cursor:"pointer",flexShrink:0}}>Remove</button>
    </div>
  );
}

// ── SETTINGS VIEW ─────────────────────────────────────────────────────────────
function SettingsView({playbook,onSavePlaybook,reps,onAddRep,onRemoveRep,onUpdateRep,integrations,onSaveIntegration,onBack,isSuperAdmin=false}){
  const [tab,setTab]=useState("team");
  const [saved,setSaved]=useState({});
  const [pbText,setPbText]=useState(playbook||"");
  const [pbSaved,setPbSaved]=useState(false);
  const [newRep,setNewRep]=useState({name:"",role:"Acq Rep",exp:"developing",phone:"",email:""});
  const [intVals,setIntVals]=useState(integrations||{});

  function saveInt(id){
    onSaveIntegration(id,intVals[id]||{});
    setSaved(p=>({...p,[id]:true}));
    setTimeout(()=>setSaved(p=>({...p,[id]:false})),2000);
    const vals=intVals[id]||{};
    // API keys are now stored as backend secrets, not in browser
    if(id==="deepgram"&&vals.deepgramKey)window.PREFER_DEEPGRAM=true;
  }

  function savePlaybook(){
    onSavePlaybook(pbText.trim());
    setPbSaved(true);
    setTimeout(()=>setPbSaved(false),2200);
  }

  function addRep(){
    if(!newRep.name.trim())return;
    onAddRep({...newRep,id:Date.now(),avatar:newRep.name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2),avg:0,trend:0,week:0,total:0,flagged:false,streak:0,scores:[],talks:[],history30:[],history90:[]});
    setNewRep({name:"",role:"Acq Rep",exp:"developing",phone:"",email:""});
  }

  const inp=(val,onChange,ph)=>(
    <input value={val} onChange={e=>onChange(e.target.value)} placeholder={ph}
      style={{flex:1,background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none"}}/>
  );

  const tabs=isSuperAdmin?[["integrations","Integrations"],["team","Team Members"]]:[["team","Team Members"]];
  const selStyle={background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none",width:"100%"};

  return(
    <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",padding:"20px 24px 48px"}} className="fade">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,maxWidth:820,width:"100%",alignSelf:"center"}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:3,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Settings</div>
          <div style={{fontSize:12,color:T3}}>{isSuperAdmin?"Connect platforms · Manage your team":"Manage your team"}</div>
        </div>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 13px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>
      </div>

      <div style={{display:"flex",gap:2,background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:3,marginBottom:20,maxWidth:820,width:"100%",alignSelf:"center"}}>
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{flex:1,background:"transparent",border:"none",borderBottom:`2px solid ${tab===k?GREEN:"transparent"}`,padding:"7px 0",color:tab===k?GREEN:T3,fontSize:13,fontWeight:tab===k?600:400,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>

      <div style={{maxWidth:820,width:"100%",alignSelf:"center"}}>

        {isSuperAdmin&&tab==="integrations"&&(
          <div className="fade">
            <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"12px 15px",marginBottom:18,fontSize:13,color:T2,lineHeight:1.75}}>
              <span style={{fontWeight:700,color:TEXT}}>How integrations work: </span>
              Connect your dialer or CRM below. ACQ Coach will auto-pull call recordings, transcribe them with Whisper, and score them without any manual steps. API keys are stored locally in your browser session.
            </div>
            {INTEGRATION_LIST.map(intg=>{
              const isActive=Object.values(intVals[intg.id]||{}).some(v=>v?.trim());
              return(
                <div key={intg.id} style={{background:S1,border:`1px solid ${isActive?GREEN+"30":B1}`,borderLeft:`3px solid ${isActive?GREEN:B2}`,borderRadius:8,padding:"16px 18px",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{fontSize:13,fontWeight:700}}>{intg.name}</span>
                        {isActive&&<Pill label="Connected" color={GREEN}/>}
                      </div>
                      <div style={{fontSize:12,color:T3,lineHeight:1.7}}>{intg.desc}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                    {intg.fields.map(f=>(
                      <div key={f.key} style={{flex:"1 1 220px",display:"flex",flexDirection:"column",gap:4}}>
                        <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>{f.label}</div>
                        <input type={f.key.toLowerCase().includes("key")?"password":"text"}
                          value={(intVals[intg.id]||{})[f.key]||""}
                          onChange={e=>setIntVals(p=>({...p,[intg.id]:{...(p[intg.id]||{}),[f.key]:e.target.value}}))}
                          placeholder={f.ph}
                          style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"7px 10px",color:TEXT,fontSize:13,outline:"none",width:"100%"}}/>
                      </div>
                    ))}
                    <button onClick={()=>saveInt(intg.id)}
                      style={{background:saved[intg.id]?"transparent":GREEN,border:`1px solid ${saved[intg.id]?GREEN:GREEN}`,borderRadius:6,padding:"8px 16px",color:saved[intg.id]?GREEN:TEXT,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,alignSelf:"flex-end"}}>
                      {saved[intg.id]?"✓ Saved":"Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab==="team"&&(
          <div className="fade">
            <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"16px 18px",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12}}>Add Team Member</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                <div style={{flex:"1 1 180px",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Full Name *</div>
                  {inp(newRep.name,v=>setNewRep(p=>({...p,name:v})),"e.g. Jordan Smith")}
                </div>
                <div style={{flex:"1 1 150px",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Phone</div>
                  {inp(newRep.phone,v=>setNewRep(p=>({...p,phone:v})),"(555) 000-0000")}
                </div>
                <div style={{flex:"1 1 180px",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Email</div>
                  {inp(newRep.email,v=>setNewRep(p=>({...p,email:v})),"rep@company.com")}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 160px",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Role</div>
                  <select value={newRep.role} onChange={e=>setNewRep(p=>({...p,role:e.target.value}))} style={selStyle}>
                    {ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{flex:"1 1 160px",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Experience Level</div>
                  <select value={newRep.exp} onChange={e=>setNewRep(p=>({...p,exp:e.target.value}))} style={selStyle}>
                    {EXP_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <button onClick={addRep}
                  style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 18px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0,alignSelf:"flex-end"}}>
                  + Add Rep
                </button>
              </div>
            </div>

            <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"12px 18px",borderBottom:`1px solid ${B1}`,fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>
                Current Team — {reps.length} members
              </div>
              {reps.map((rep,i)=>(
                <TeamRow key={rep.id} rep={rep} isLast={i===reps.length-1}
                  onUpdate={onUpdateRep} onRemove={onRemoveRep} selStyle={selStyle}/>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── MIC BUTTON (browser mic → Whisper → text) ─────────────────────────────────
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

// ── CALL STATUS INDICATOR (OWNER) ──────────────────────────────────────────────
function OwnerCallStatusIndicator({callPhase}){
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
      <span style={{fontSize:13,fontWeight:700,color:cfg.color,textTransform:"uppercase",letterSpacing:"0.12em"}}>{cfg.label}</span>
    </div>
  );
}

// ── HOLD TO SPEAK BUTTON (OWNER) ──────────────────────────────────────────────
function OwnerHoldToSpeakButton({callPhase,onStart,onStop}){
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
        onMouseUp={isRecording?onStop:undefined}
        onMouseLeave={isRecording?onStop:undefined}
        onTouchStart={isIdle?(e)=>{e.preventDefault();onStart();}:undefined}
        onTouchEnd={isRecording?onStop:undefined}
        disabled={isDisabled}
        style={{
          width:96,height:96,borderRadius:"50%",border:`2px solid ${borderColor}`,background:bgColor,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
          cursor:isDisabled?"not-allowed":"pointer",opacity:isDisabled?0.45:1,
          touchAction:"none",position:"relative",zIndex:1,transition:"opacity .2s"
        }}>
        <span style={{fontSize:24}}>{isRecording?"■":"🎙"}</span>
        <span style={{fontSize:12,fontWeight:700,color:isRecording?RED:isIdle?GREEN:T3,textTransform:"uppercase",letterSpacing:"0.1em"}}>
          {isRecording?"RELEASE":"HOLD"}
        </span>
      </button>
    </div>
  );
}

// ── SCORE TOAST (OWNER) ───────────────────────────────────────────────────────
function OwnerScoreToast({toast}){
  if(!toast)return null;
  const accent=toast.status==="strong"?GREEN:toast.status==="ok"?AMBER:RED;
  return(
    <div className="fade" style={{
      position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:300,pointerEvents:"none",
      background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${accent}`,borderRadius:8,
      padding:"10px 16px",minWidth:280,maxWidth:400
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:toast.rewrite?4:0}}>
        <span style={{fontSize:16,fontWeight:800,color:accent,letterSpacing:"0.04em"}}>{toast.score}/10</span>
        <span style={{fontSize:12,fontWeight:700,color:accent,background:accent+"18",borderRadius:10,padding:"2px 8px",textTransform:"uppercase"}}>{toast.status}</span>
        <span style={{fontSize:12,color:T2,flex:1}}>{toast.feedback}</span>
      </div>
      {toast.rewrite&&<div style={{fontSize:12,color:GREEN,fontStyle:"italic"}}>Try: "{toast.rewrite}"</div>}
    </div>
  );
}

// ── LIVE ROLEPLAY MODE ────────────────────────────────────────────────────────
function RoleplayMode({onBack}){
  const [phase,setPhase]=useState("setup");
  const [sellerType,setSellerType]=useState("probate");
  const [brief,setBrief]=useState(null);
  const [briefLoading,setBriefLoading]=useState(false);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [exchangeScores,setExchangeScores]=useState([]);
  const [sessionScore,setSessionScore]=useState(null);
  const chatRef=useRef();
  const scenario=SELLER_SCENARIOS[sellerType];
  const runningAvg=exchangeScores.length?Math.round(exchangeScores.reduce((a,b)=>a+b,0)/exchangeScores.length*10):null;

  // Voice mode state
  const [callPhase,setCallPhase]=useState("idle");
  const [voiceMode,setVoiceMode]=useState(false);
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
      const res=await fetch(`${SUPABASE_URL}/functions/v1/ai-tts`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`,apikey:SUPABASE_KEY},
        body:JSON.stringify({text:sellerText,voice:"onyx"})
      });
      if(!res.ok)throw new Error("TTS failed");
      const blob=await res.blob();
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
    const prevSellerLine=currentMessages.filter(m=>m.role==="seller").slice(-1)[0]?.text||scenario.opening;
    try{
      // Fire seller + score in parallel
      const sellerP=fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:`${ROLEPLAY_SELLER_SYS}\n\nSeller type: ${scenario.label}. Background: ${scenario.desc}. Keep responses short (1-3 sentences). Stay in character.`,
          max_tokens:150,messages:[{role:"user",content:`Conversation:\n${convo}\n\nRespond as the seller:`}]}),
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
          method:"POST",headers:{Authorization:`Bearer ${SUPABASE_KEY}`,apikey:SUPABASE_KEY},body:form
        });
        if(!res.ok)throw new Error("Transcription failed");
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
    const prevSellerLine=withRep.filter(m=>m.role==="seller").slice(-1)[0]?.text||scenario.opening;
    try{
      const sellerP=fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:`${ROLEPLAY_SELLER_SYS}\n\nSeller type: ${scenario.label}. Background: ${scenario.desc}. Keep responses short (1-3 sentences). Stay in character.`,
          max_tokens:150,messages:[{role:"user",content:`Conversation:\n${convo}\n\nRespond as the seller:`}]}),
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
            <button onClick={onBack} style={{background:"transparent",border:"none",color:T3,fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Live Roleplay Mode</div>
              <Pill label="BETA" color={AMBER}/>
            </div>
            <div style={{fontSize:11,color:AMBER,background:"rgba(217,164,65,0.08)",border:`1px solid rgba(217,164,65,0.25)`,borderRadius:6,padding:"8px 12px",marginBottom:14,lineHeight:1.6}}>
              Heads up — Roleplay is still in active development. Voice handling, scoring, and seller realism are being tuned. Expect rough edges and occasional hiccups while we improve it.
            </div>
            <div style={{fontSize:12,color:T2,lineHeight:1.85,marginBottom:24}}>
              The AI plays the seller. You practice your pitch. Every rep line is scored live with coaching.
            </div>
            <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10}}>Choose Your Seller Type</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:22}}>
              {Object.entries(SELLER_SCENARIOS).map(([k,v])=>(
                <div key={k} onClick={()=>{setSellerType(k);setBrief(null);}}
                  style={{background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${sellerType===k?GREEN:B2}`,borderRadius:8,padding:"13px 15px",cursor:"pointer",transition:"border-left-color .15s"}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:3,color:sellerType===k?GREEN:TEXT}}>{v.label}</div>
                  <div style={{fontSize:12,color:T3,lineHeight:1.6}}>{v.desc}</div>
                </div>
              ))}
            </div>
            <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"13px 16px",marginBottom:20}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5}}>Seller's opening line</div>
              <div style={{fontSize:12.5,fontStyle:"italic",color:TEXT}}>"{SELLER_SCENARIOS[sellerType].opening}"</div>
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
                style={{width:"100%",background:"transparent",border:`1px solid ${B2}`,borderRadius:6,padding:"10px 16px",color:GREEN,fontSize:13,fontWeight:700,cursor:briefLoading?"wait":"pointer",opacity:briefLoading?0.6:1,marginBottom:brief?12:0}}>
                {briefLoading?"Generating Brief…":"📋 Generate Pre-Call Brief"}
              </button>
              {brief&&(
                <div className="fade" style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{background:"#0a0f0a",border:"1px solid #4e7d3d22",borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:12,color:GREEN,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Key Discovery Questions</div>
                    {brief.questions?.map((q,i)=><div key={i} style={{fontSize:13,color:TEXT,lineHeight:1.7}}>{i+1}. {q}</div>)}
                  </div>
                  {brief.objections?.map((o,i)=>(
                    <div key={i} style={{background:"#0f0a0a",border:"1px solid #c0392b22",borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:RED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>Objection {i+1}</div>
                      <div style={{fontSize:13,color:TEXT,fontStyle:"italic",lineHeight:1.6,marginBottom:6}}>"{o.objection}"</div>
                      <div style={{fontSize:12,color:GREEN,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:3}}>Rebuttal</div>
                      <div style={{fontSize:13,color:TEXT,fontStyle:"italic",lineHeight:1.6}}>"{o.rebuttal}"</div>
                    </div>
                  ))}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{background:"#0f0d08",border:"1px solid #b7860b22",borderLeft:`3px solid ${AMBER}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:AMBER,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>Tone</div>
                      <div style={{fontSize:13,color:TEXT,lineHeight:1.6}}>{brief.tone}</div>
                    </div>
                    <div style={{background:"#0f0a0a",border:"1px solid #c0392b22",borderLeft:`3px solid ${RED}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:RED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>Never Say</div>
                      <div style={{fontSize:13,color:TEXT,fontStyle:"italic",lineHeight:1.6}}>"{brief.neverSay}"</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={startSession} style={{width:"100%",background:GREEN,border:"none",borderRadius:6,padding:"14px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              Start Practice Call
            </button>
          </div>
        </div>
      )}

      {phase==="active"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:700,width:"100%",margin:"0 auto",padding:"16px 20px 0",overflow:"hidden"}}>
          {/* Momentum bar */}
          <div style={{height:4,background:S2,borderRadius:2,overflow:"hidden",marginBottom:12,flexShrink:0}}>
            {runningAvg!==null&&(
              <div style={{width:`${runningAvg}%`,height:"100%",background:runningAvg>=65?GREEN:runningAvg>=50?AMBER:RED,borderRadius:2,transition:"width .6s ease, background .6s ease"}}/>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexShrink:0}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{scenario.label}</div>
              <div style={{fontSize:13,color:T3}}>{scenario.desc}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {runningAvg!==null&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,color:T3}}>Running avg</div>
                  <div style={{fontSize:16,fontWeight:800,color:gc(runningAvg),letterSpacing:"0.04em"}}>{runningAvg}</div>
                </div>
              )}
              <button onClick={toggleVoiceMode}
                style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"5px 10px",color:T3,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                {voiceMode?"TEXT MODE":"VOICE MODE"}
              </button>
              <button onClick={endSession} style={{background:"#1a0a0a",border:`1px solid ${RED}30`,borderRadius:6,padding:"7px 13px",color:RED,fontSize:12,fontWeight:700,cursor:"pointer"}}>End &amp; Score</button>
            </div>
          </div>

          <div ref={chatRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:8}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="rep"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"76%",background:m.role==="rep"?"#0a1a0a":S1,border:`1px solid ${m.role==="rep"?DKGREEN:B1}`,borderRadius:m.role==="rep"?"8px 8px 3px 8px":"8px 8px 8px 3px",padding:"10px 14px"}}>
                  <div style={{fontSize:12,color:T3,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.1em"}}>{m.role==="rep"?"You (Rep)":"Seller"}</div>
                  <div style={{fontSize:12,lineHeight:1.75,color:TEXT}}>{m.text}</div>
                </div>
                {m.role==="seller"&&m.score!==null&&(
                  <div style={{maxWidth:"76%",marginTop:4,background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${sc(m.status)}`,borderRadius:6,padding:"6px 11px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:m.rewrite?3:0}}>
                      <span style={{fontSize:13,fontWeight:800,color:sc(m.status),letterSpacing:"0.04em"}}>{m.score}/10</span>
                      <span style={{fontSize:12,color:T2,flex:1}}>{m.feedback}</span>
                    </div>
                    {m.rewrite&&<div style={{fontSize:12,color:GREEN,fontStyle:"italic"}}>Try: "{m.rewrite}"</div>}
                  </div>
                )}
              </div>
            ))}
            {loading&&!voiceMode&&(
              <div style={{display:"flex",alignItems:"flex-start"}}>
                <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:"8px 8px 8px 3px",padding:"12px 16px"}}>
                  <span style={{fontSize:13,color:T3}}>Responding…</span>
                </div>
              </div>
            )}
            {voiceMode&&(callPhase==="thinking"||callPhase==="speaking")&&(
              <div style={{display:"flex",alignItems:"flex-start"}}>
                <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:"8px 8px 8px 3px",padding:"12px 16px"}}>
                  <span style={{fontSize:13,color:T3}}>{callPhase==="thinking"?"Seller composing response…":"Seller speaking…"}</span>
                </div>
              </div>
            )}
          </div>

          {voiceMode?(
            <div style={{borderTop:`1px solid ${B1}`,paddingTop:14,paddingBottom:14,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <OwnerCallStatusIndicator callPhase={callPhase}/>
              <OwnerHoldToSpeakButton callPhase={callPhase} onStart={startRecording} onStop={stopAndSend}/>
              <div style={{fontSize:13,color:T3}}>Hold to speak · release to send</div>
            </div>
          ):(
            <div style={{borderTop:`1px solid ${B1}`,paddingTop:10,paddingBottom:14,flexShrink:0,display:"flex",gap:8,alignItems:"flex-start"}}>
              <MicButton onTranscribed={t=>setInput(prev=>prev?prev+" "+t:t)} disabled={loading}/>
              <textarea value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder="Speak with Mic or type your line… (Enter to send)"
                style={{flex:1,height:54,background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"10px 14px",color:TEXT,fontSize:12,resize:"none",outline:"none",lineHeight:1.6}}/>
              <button onClick={sendMessage} disabled={loading||!input.trim()}
                style={{background:GREEN,border:"none",borderRadius:8,padding:"0 18px",height:54,color:TEXT,fontSize:22,fontWeight:900,cursor:"pointer",opacity:loading||!input.trim()?.45:1,flexShrink:0,lineHeight:1}}>↑</button>
            </div>
          )}

          <OwnerScoreToast toast={voiceMode?toast:null}/>
        </div>
      )}

      {phase==="scored"&&sessionScore!==null&&(
        <div style={{overflowY:"auto",flex:1,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 24px 48px"}}>
          <div style={{width:"100%",maxWidth:520}} className="fade">
            <div style={{textAlign:"center",marginBottom:24}}>
              <Ring score={sessionScore} size={130}/>
              <div style={{fontSize:16,fontWeight:700,marginTop:14,marginBottom:4,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Session Complete</div>
              <div style={{fontSize:13,color:T3}}>{scenario.label} · {exchangeScores.length} exchange{exchangeScores.length!==1?"s":""} scored</div>
            </div>
            <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 20px",marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12}}>Exchange Breakdown</div>
              {exchangeScores.map((s,i)=>{
                const c=gc(s*10);
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div style={{fontSize:13,color:T3,width:68,flexShrink:0}}>Exchange {i+1}</div>
                    <div style={{flex:1,height:5,background:S2,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${s*10}%`,height:"100%",background:c,borderRadius:2,transition:"width .5s"}}/>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:c,width:28,textAlign:"right",letterSpacing:"0.04em"}}>{s}/10</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setPhase("setup");setMessages([]);setExchangeScores([]);setSessionScore(null);}}
                style={{flex:1,background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"11px",color:T2,fontSize:12,fontWeight:700,cursor:"pointer"}}>Try Again</button>
              <button onClick={onBack}
                style={{flex:1,background:GREEN,border:"none",borderRadius:6,padding:"11px",color:TEXT,fontSize:12,fontWeight:700,cursor:"pointer"}}>Back to Dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({reps,selectedRep,onSelect,onLeaderboard}){
  const safeReps=Array.isArray(reps)?reps.filter(Boolean):[];
  const teamAvg=safeReps.length?Math.round(safeReps.reduce((a,r)=>a+(r?.avg||0),0)/safeReps.length):0;
  const totalWeek=safeReps.reduce((a,r)=>a+(r?.week||0),0);
  const flagged=safeReps.filter(r=>r?.flagged);
  reps=safeReps;
  return(
    <div style={{width:264,background:S1,borderRight:`1px solid ${B1}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
      <div style={{padding:"14px 13px 10px",borderBottom:`1px solid ${B1}`}}>
        <div style={{fontSize:13,color:T3,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Team Overview</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
          {[[teamAvg,"Team Avg",gc(teamAvg)],[totalWeek,"Calls / Wk",TEXT]].map(([v,l,c])=>(
            <div key={l} style={{background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:13,color:T3,textTransform:"uppercase",letterSpacing:"0.10em",marginBottom:2}}>{l}</div>
              <div style={{fontSize:20,fontWeight:800,color:c,letterSpacing:"0.04em"}}>{v}</div>
            </div>
          ))}
        </div>
        {flagged.length>0&&(
          <div style={{background:"#1a0a0a",border:`1px solid ${RED}25`,borderRadius:6,padding:"6px 10px",display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:RED,flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:600,color:RED}}>{flagged.length} rep below threshold</span>
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
        {reps.map(rep=>{
          const isSel=selectedRep&&selectedRep.id===rep.id;
          const color=gc(rep.avg);
          const badge=eb(rep.exp);
          const lt=rep.talks[rep.talks.length-1];
          const selOk=lt.s>=60;
          return(
            <div key={rep.id} onClick={()=>onSelect(rep)}
              style={{background:isSel?S2:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${rep.flagged?RED:isSel?GREEN:B1}`,borderRadius:8,padding:"10px 11px",cursor:"pointer",marginBottom:6,position:"relative",transition:"border-left-color .15s"}}>
              {rep.flagged&&<div style={{position:"absolute",top:8,right:8,width:5,height:5,borderRadius:"50%",background:RED}}/>}
              <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:7}}>
                <div style={{width:30,height:30,borderRadius:6,background:S3,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color,flexShrink:0,letterSpacing:"0.04em"}}>{rep.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{rep.name}</div>
                  <Pill label={badge.l} color={badge.c}/>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:20,fontWeight:800,color,lineHeight:1,letterSpacing:"0.04em"}}>{rep.avg}</div>
                  <div style={{fontSize:13,color:rep.trend>=0?GREEN:RED,fontWeight:600,marginTop:1,letterSpacing:"0.04em"}}>{rep.trend>=0?"+":""}{rep.trend}</div>
                </div>
              </div>
              <Bars scores={rep.scores} height={26}/>
              <div style={{marginTop:5,height:8,borderRadius:3,overflow:"hidden",display:"flex"}}>
                <div style={{width:`${lt.r}%`,background:"#1e3a1e"}}/>
                <div style={{width:`${lt.s}%`,background:GREEN,opacity:.5}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                <span style={{fontSize:7.5,color:selOk?GREEN:AMBER,fontWeight:600}}>{lt.s}% seller talk</span>
                {rep.contacts>0&&<span style={{fontSize:7.5,color:T3,fontWeight:600}}>{rep.contacts} contacts</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{padding:"8px 10px",borderTop:`1px solid ${B1}`}}>
        <button onClick={onLeaderboard} style={{width:"100%",background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"7px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:7}}>View Leaderboard</button>
        <div style={{background:"#0a0f0a",border:`1px solid ${B1}`,borderLeft:`3px solid ${GREEN}`,borderRadius:6,padding:"7px 10px"}}>
          <div style={{fontSize:13,fontWeight:700,color:GREEN}}>Weekly Digest Active</div>
          <div style={{fontSize:13,color:T3}}>Sends every Monday 7am</div>
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({rep,calls,reps,onScore,annotations,onAnnotate,ghlAccounts,selectedAccount,onAccountChange}){
  if(!rep)return<div style={{padding:24,color:"#888",fontSize:13}}>No rep selected.</div>;
  const repCalls=(calls||[]).filter(c=>c.repId===rep.id);
  const color=gc(rep.avg);
  const badge=eb(rep.exp);
  const lt=rep.talks[rep.talks.length-1];
  const bestRep=reps.slice().sort((a,b)=>b.trend-a.trend)[0];
  const [annotatingCall,setAnnotatingCall]=useState(null);
  const [expandedDashCallId,setExpandedDashCallId]=useState(null);
  const [dashCallsPage,setDashCallsPage]=useState(1);
  const DASH_CALLS_PER_PAGE=10;
  React.useEffect(()=>{setDashCallsPage(1);setExpandedDashCallId(null);},[rep.id]);
  const totalDashPages=Math.max(1,Math.ceil(repCalls.length/DASH_CALLS_PER_PAGE));
  const pageCalls=repCalls.slice((dashCallsPage-1)*DASH_CALLS_PER_PAGE,dashCallsPage*DASH_CALLS_PER_PAGE);
  return(
    <div style={{overflowY:"auto",padding:"20px 22px 40px",flex:1}} className="fade">
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:18}}>
        <div style={{width:44,height:44,borderRadius:8,background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color,flexShrink:0,letterSpacing:"0.04em"}}>{rep.avatar}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
            <span style={{fontSize:16,fontWeight:700,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>{rep.name}</span>
            <Pill label={badge.l} color={badge.c}/>
            {rep.flagged&&<Pill label="FLAGGED" color={RED}/>}
          </div>
          <div style={{fontSize:12,color:T3}}>{rep.role} · {rep.total} calls scored · {rep.contacts?`${rep.contacts} contacts`:"0 contacts"} · {rep.streak>0?`${rep.streak} call streak`:"No active streak"}</div>
        </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {ghlAccounts&&ghlAccounts.length>1&&(
              <select value={selectedAccount||""} onChange={e=>onAccountChange&&onAccountChange(e.target.value)}
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"6px 10px",color:TEXT,fontSize:12,fontWeight:600,outline:"none",cursor:"pointer"}}>
                {ghlAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button onClick={onScore} style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 16px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Score a Call</button>
          </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"148px 1fr",gap:10,marginBottom:10}}>
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${GREEN},transparent)`}}/>
          <Ring score={rep.avg} size={100}/>
          <div style={{marginTop:8,fontSize:12,color:rep.trend>=0?GREEN:RED,fontWeight:600,textAlign:"center"}}>{rep.trend>=0?"↑":"↓"} {Math.abs(rep.trend)} pts this week</div>
        </div>
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>7-Call Trend</div>
            <div style={{display:"flex",gap:5}}>
              <div style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"3px 8px"}}><div style={{fontSize:12,color:T3}}>Weak</div><div style={{fontSize:12,fontWeight:600,color:RED}}>{rep.weak}</div></div>
              <div style={{background:S2,border:`1px solid ${B1}`,borderRadius:6,padding:"3px 8px"}}><div style={{fontSize:12,color:T3}}>Strong</div><div style={{fontSize:12,fontWeight:600,color:GREEN}}>{rep.strong}</div></div>
            </div>
          </div>
          <Bars scores={rep.scores} height={64}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:13,color:T3}}><span>7 calls ago</span><span>Latest</span></div>
          <div style={{marginTop:12}}><TalkBar rep={lt.r} seller={lt.s}/></div>
        </div>
      </div>

      <div style={{marginBottom:10}}><MomentumChart rep={rep}/></div>

      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 18px",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>Recent Calls</div>
          <span style={{fontSize:13,color:T3}}>{repCalls.length} total</span>
        </div>
        {repCalls.length===0
          ?<div style={{fontSize:13,color:T3,textAlign:"center",padding:"18px 0"}}>No calls scored yet.</div>
          :pageCalls.map((c,i)=>{
            const noteCount=(annotations[c.id]||[]).length;
            const isOpen=expandedDashCallId===c.id;
            const hasFull=!!c._full;
            return(
              <div key={c.id} style={{marginBottom:5,animation:`fadeUp .2s ${i*.04}s ease both`}}>
                <div onClick={()=>hasFull&&setExpandedDashCallId(isOpen?null:c.id)}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:isOpen?S3:S2,border:`1px solid ${isOpen?GREEN+"55":B1}`,borderRadius:isOpen?"8px 8px 0 0":8,cursor:hasFull?"pointer":"default",transition:"background .15s,border-color .15s"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:1}}>
                      {c.seller}
                      {c.isNew&&<span style={{fontSize:12,fontWeight:700,color:TEXT,background:GREEN,borderRadius:3,padding:"1px 5px",marginLeft:6}}>NEW</span>}
                    </div>
                    <div style={{fontSize:13,color:T3}}>{c.type} · {c.date} · {c.dur}</div>
                    <div style={{marginTop:4,height:6,borderRadius:2,overflow:"hidden",display:"flex",width:100}}>
                      <div style={{width:`${c.rt}%`,background:"#1e3a1e"}}/>
                      <div style={{width:`${c.st}%`,background:c.st>=60?GREEN:AMBER,opacity:.4}}/>
                    </div>
                    <div style={{fontSize:12,color:c.st>=60?GREEN:AMBER,marginTop:1,fontWeight:600}}>Seller {c.st}% · Rep {c.rt}%</div>
                  </div>
                  <div style={{fontSize:18,fontWeight:800,color:gc(c.score),letterSpacing:"0.04em"}}>{c.score}</div>
                  <Pill label={c.grade} color={gc(c.score)}/>
                  <button onClick={e=>{e.stopPropagation();setAnnotatingCall(c.id);}}
                    style={{background:"transparent",border:`1px solid ${noteCount>0?AMBER+"40":B2}`,borderRadius:6,padding:"4px 8px",color:noteCount>0?AMBER:T3,fontSize:13,cursor:"pointer",flexShrink:0}}>
                    {noteCount>0?`Notes (${noteCount})`:"Notes"}
                  </button>
                  {hasFull&&<span style={{color:T3,fontSize:14,marginLeft:2}}>{isOpen?"▾":"▸"}</span>}
                </div>
                {isOpen&&hasFull&&(
                  <div style={{background:S2,border:`1px solid ${GREEN+"55"}`,borderTop:"none",borderRadius:"0 0 8px 8px",padding:"14px 14px 6px"}}>
                    <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:10,fontSize:11,color:T3}}>
                      <div>Rep: <span style={{color:TEXT,fontWeight:600}}>{c._full.rep_name||rep.name}</span></div>
                      <div>Scored: <span style={{color:TEXT,fontWeight:600}}>{new Date(c._full.scored_at).toLocaleString()}</span></div>
                      <div>Call type: <span style={{color:TEXT,fontWeight:600}}>{c._full.call_type||"—"}</span></div>
                    </div>
                    <CallScoreCard score={c._full}/>
                    {c._full.transcript&&(
                      <div>
                        <div style={{fontSize:10,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:6}}>Transcript</div>
                        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:12,maxHeight:280,overflowY:"auto",fontSize:12,lineHeight:1.6,whiteSpace:"pre-wrap",fontFamily:"monospace"}}>
                          {c._full.transcript.split("\n").map((line,li)=>{
                            const isRep=/^Rep:/i.test(line);
                            const isSeller=/^Seller:/i.test(line);
                            return <div key={li} style={{marginBottom:3,color:isRep?GREEN:isSeller?AMBER:T2}}>{line}</div>;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        }
        {repCalls.length>DASH_CALLS_PER_PAGE&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:`1px solid ${B1}`}}>
            <div style={{fontSize:12,color:T3}}>
              Showing {((dashCallsPage-1)*DASH_CALLS_PER_PAGE)+1}–{Math.min(dashCallsPage*DASH_CALLS_PER_PAGE,repCalls.length)} of {repCalls.length}
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{setDashCallsPage(p=>Math.max(1,p-1));setExpandedDashCallId(null);}} disabled={dashCallsPage===1}
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:5,padding:"4px 10px",color:dashCallsPage===1?T3:TEXT,fontSize:12,fontWeight:600,cursor:dashCallsPage===1?"default":"pointer",opacity:dashCallsPage===1?.4:1}}>
                ← Prev
              </button>
              {(()=>{
                const pages=[];
                for(let i=Math.max(1,dashCallsPage-2);i<=Math.min(totalDashPages,dashCallsPage+2);i++){pages.push(i);}
                return pages.map(p=>(
                  <button key={p} onClick={()=>{setDashCallsPage(p);setExpandedDashCallId(null);}}
                    style={{background:p===dashCallsPage?GREEN:S2,border:`1px solid ${p===dashCallsPage?GREEN:B1}`,borderRadius:5,padding:"4px 8px",color:p===dashCallsPage?TEXT:T3,fontSize:12,fontWeight:p===dashCallsPage?700:400,cursor:"pointer",minWidth:28}}>
                    {p}
                  </button>
                ));
              })()}
              <button onClick={()=>{setDashCallsPage(p=>Math.min(totalDashPages,p+1));setExpandedDashCallId(null);}} disabled={dashCallsPage>=totalDashPages}
                style={{background:S2,border:`1px solid ${B1}`,borderRadius:5,padding:"4px 10px",color:dashCallsPage>=totalDashPages?T3:TEXT,fontSize:12,fontWeight:600,cursor:dashCallsPage>=totalDashPages?"default":"pointer",opacity:dashCallsPage>=totalDashPages?.4:1}}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {bestRep.id===rep.id&&(
        <div style={{background:"#0a0f0a",border:`1px solid ${B1}`,borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:28,height:28,borderRadius:6,background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:GREEN,flexShrink:0}}>↑</div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:GREEN,marginBottom:2}}>Most Improved This Week</div>
            <div style={{fontSize:12,color:T2}}>{rep.name} improved {rep.trend} pts — highest on the team.</div>
          </div>
        </div>
      )}

      {annotatingCall&&(
        <AnnotationPanel callId={annotatingCall} annotations={annotations} onAdd={onAnnotate} onClose={()=>setAnnotatingCall(null)}/>
      )}
    </div>
  );
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
const CAT_NAMES=["Introduction","Rapport","Motivation","Timeline","Financial","Offer","Objection","First No","Next Step"];
const CAT_OFFSETS=[.3,-.4,.2,-.2,.5,-.3,.4,-.5,.3];

function repCatScore(rep,ci){
  if(!rep)return 0;
  return Math.min(10,Math.max(1,(rep.avg||0)/10+CAT_OFFSETS[ci]*(rep.exp==="new"?-1:1)));
}

function Leaderboard({reps,calls,onBack,onSelect}){
  const safeReps=(reps||[]).filter(Boolean);
  const sorted=safeReps.slice().sort((a,b)=>(b.avg||0)-(a.avg||0));
  const [mode,setMode]=useState("reps");

  const catBest=CAT_NAMES.map((cat,ci)=>{
    const best=safeReps.slice().sort((a,b)=>repCatScore(b,ci)-repCatScore(a,ci))[0];
    return{cat,rep:best,score:best?repCatScore(best,ci):0};
  });

  return(
    <div style={{overflowY:"auto",padding:"20px 24px 40px",flex:1}} className="fade">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:3,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Team Leaderboard</div>
          <div style={{fontSize:12,color:T3}}>7-call rolling average · Live sync enabled</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:3,display:"flex",gap:2}}>
            {[["reps","Rep Rank"],["categories","Category View"]].map(([k,l])=>(
              <button key={k} onClick={()=>setMode(k)}
                style={{background:"transparent",border:"none",borderBottom:`2px solid ${mode===k?GREEN:"transparent"}`,padding:"4px 10px",color:mode===k?GREEN:T3,fontSize:12,fontWeight:mode===k?600:400,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={onBack} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"6px 13px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer"}}>← Back</button>
        </div>
      </div>

      {mode==="categories"&&(
        <div className="fade">
          <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 20px",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5}}>Who Owns Each Skill</div>
            <div style={{fontSize:12,color:T3,marginBottom:14}}>Best rep per category on your team right now</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {catBest.map(({cat,rep,score})=>{
                const b=eb(rep.exp);
                return(
                  <div key={cat} style={{background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:12,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:7}}>{cat}</div>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                      <div style={{width:24,height:24,borderRadius:6,background:S3,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:gc(rep.avg),flexShrink:0,letterSpacing:"0.04em"}}>{rep.avatar}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{rep.name}</div>
                        <Pill label={b.l} color={b.c}/>
                      </div>
                      <div style={{fontSize:14,fontWeight:800,color:GREEN,letterSpacing:"0.04em"}}>{Math.round(score*10)}</div>
                    </div>
                    <div style={{height:3,background:S2,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${score*10}%`,height:"100%",background:GREEN,borderRadius:2}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 20px"}}>
            <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14}}>All Reps — Category Breakdown</div>
            {CAT_NAMES.map((cat,ci)=>(
              <div key={cat} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{fontSize:12,color:T2,width:84,flexShrink:0}}>{cat}</div>
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
                  {safeReps.map((rep,ri)=>{
                    const score=repCatScore(rep,ci);
                    return(
                      <div key={rep.id} style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{fontSize:7.5,color:T3,width:20,letterSpacing:"0.04em"}}>{rep.avatar}</div>
                        <div style={{flex:1,height:5,background:S2,borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:`${score*10}%`,height:"100%",background:GREEN,borderRadius:2,opacity:0.35+ri*0.2,transition:"width .4s"}}/>
                        </div>
                        <div style={{fontSize:12,color:T2,width:24,textAlign:"right",letterSpacing:"0.04em"}}>{Math.round(score*10)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode==="reps"&&(
        <div className="fade">
          <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,overflow:"hidden",marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:"26px 1fr 70px 64px 64px 80px 90px",gap:8,padding:"9px 16px",borderBottom:`1px solid ${B1}`,fontSize:12,color:T3,textTransform:"uppercase",letterSpacing:"0.10em",fontWeight:600}}>
              <span>#</span><span>Rep</span><span>Avg</span><span>Trend</span><span>Calls</span><span>Cat Mix</span><span>Streak / Talk</span>
            </div>
            {sorted.map((rep,i)=>{
              const color=gc(rep.avg);
              const badge=eb(rep.exp);
              const lt=rep.talks[rep.talks.length-1];
              const selOk=lt.s>=60;
              const catH=CAT_NAMES.map((_,ci)=>Math.min(18,Math.max(3,repCatScore(rep,ci)*1.8)));
              return(
                <div key={rep.id} className="lb-row" onClick={()=>{onSelect(rep);onBack();}}
                  style={{display:"grid",gridTemplateColumns:"26px 1fr 70px 64px 64px 80px 90px",gap:8,padding:"11px 16px",borderBottom:i<sorted.length-1?`1px solid ${B1}`:"none",alignItems:"center",cursor:"pointer",background:BG}}>
                  <div style={{fontSize:13,fontWeight:800,fontFamily:"'League Spartan',sans-serif",color:i===0?GOLD:T3}}>{i+1}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:6,background:S2,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color,flexShrink:0,letterSpacing:"0.04em"}}>{rep.avatar}</div>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{rep.name}</div>
                      <Pill label={badge.l} color={badge.c}/>
                    </div>
                  </div>
                  <div style={{fontSize:18,fontWeight:800,color,letterSpacing:"0.04em"}}>{rep.avg}</div>
                  <div style={{fontSize:13,fontWeight:700,color:rep.trend>=0?GREEN:RED,letterSpacing:"0.04em"}}>{rep.trend>=0?"+":""}{rep.trend}</div>
                  <div style={{fontSize:12,fontWeight:700,color:TEXT,letterSpacing:"0.04em"}}>{rep.week}</div>
                  <div style={{display:"flex",gap:2,alignItems:"flex-end",height:18}}>
                    {catH.map((h,ci)=>(
                      <div key={ci} style={{flex:1,height:h,background:GREEN,borderRadius:"1px 1px 0 0",opacity:0.25+(ci/CAT_NAMES.length)*0.65}}/>
                    ))}
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:rep.streak>0?AMBER:T3}}>
                      {rep.streak>0?`${rep.streak} streak`:"—"}
                    </div>
                    <div style={{fontSize:12,color:selOk?GREEN:AMBER,marginTop:2,fontWeight:600}}>{lt.s}% seller</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUBMIT CALL ───────────────────────────────────────────────────────────────
function SubmitCall({onScore,onBack,playbook}){
  const [text,setText]=useState("");
  const [level,setLevel]=useState("auto");
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState("");
  const [error,setError]=useState("");

  async function handleScore(){
    if(!text.trim()||text.trim().length<80){setError("Paste a transcript with at least 80 characters.");return;}
    setError("");setLoading(true);setMsg("Reading transcript…");
    const steps=["Detecting seller type…","Scoring 9 categories…","Writing coaching report…"];
    let si=0;
    const iv=setInterval(()=>{if(si<steps.length)setMsg(steps[si++]);},1400);
    try{
      const playbookBlock=playbook?.trim()?`\n\nTEAM PLAYBOOK — coach reps against these specific scripts and frameworks:\n${playbook}`:"";
      const expBlock=level!=="auto"?`\n\nRep experience level: ${level}`:"";
      const sys=SYS+playbookBlock+expBlock;
      const res=await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`,{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({system:sys,max_tokens:2000,messages:[{role:"user",content:"Score this call:\n\n"+text}]}),
      });
      const data=await res.json();
      if(!res.ok||data.error)throw new Error(data.error||`AI error ${res.status}`);
      const raw=(data.content||[]).map(b=>b.text||"").join("");
      const match=raw.match(/\{[\s\S]*\}/);
      if(!match)throw new Error("bad json");
      const result=JSON.parse(match[0]);
      result.score ||= {};
      const overall=Number(result.score.overall)||0;
      result.score.overall=Math.max(0,Math.min(100,overall>0&&overall<=10?Math.round(overall*10):Math.round(overall)));
      result.score.grade=result.score.grade||grade(result.score.overall);
      result.score.categories = (result.score.categories||[]).map(c=>{
        const score=Math.max(0,Math.min(10,Number(c.score)||0));
        return {...c,score,status:normalizeAiStatus(c.status,score)};
      });
      result.moments=(result.moments||[]).map(m=>({...m,status:normalizeAiStatus(m.status)}));
      const tr=calcTalk(text);
      if(!result.detected.sellerTalkRatio)result.detected.sellerTalkRatio=tr.seller+"%";
      if(!result.detected.repTalkRatio)result.detected.repTalkRatio=tr.rep+"%";
      result._transcript=text;
      clearInterval(iv);setLoading(false);
      onScore(result,tr);
    }catch(e){
      clearInterval(iv);setLoading(false);
      setError("Scoring failed. Check backend configuration and transcript format, then try again.");
    }
  }

  const levels=[["auto","Auto-detect"],["new","New"],["developing","Developing"],["experienced","Experienced"],["owner-operator","Owner"],["va-screener","VA"]];

  return(
    <div style={{overflowY:"auto",flex:1,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 24px 48px"}}>
      <div style={{width:"100%",maxWidth:660}} className="fade">
        <button onClick={onBack} style={{background:"transparent",border:"none",color:T3,fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
        <div style={{fontSize:18,fontWeight:700,marginBottom:4,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>Submit a Call for Scoring</div>
        <div style={{fontSize:13,color:T2,marginBottom:18}}>Upload a recorded call or paste the transcript. AI detects seller type automatically and syncs results to the owner dashboard live.</div>

        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"14px 16px",marginBottom:14}}>
          <AudioUpload onTranscribed={t=>setText(t)} disabled={loading}/>
          {playbook&&(
            <div style={{marginTop:10,display:"flex",alignItems:"center",gap:6,fontSize:13,color:GREEN,borderTop:`1px solid ${B1}`,paddingTop:8,fontWeight:600}}>
              <span>✓</span><span>Playbook active — AI will coach against your team's scripts</span>
            </div>
          )}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:T2,flexShrink:0}}>Rep experience:</span>
          {levels.map(([k,l])=>(
            <button key={k} onClick={()=>setLevel(k)}
              style={{background:"transparent",border:`1px solid ${B2}`,borderLeft:`3px solid ${level===k?GREEN:"transparent"}`,borderRadius:6,padding:"4px 9px",color:level===k?GREEN:T3,fontSize:12,fontWeight:level===k?700:400,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{position:"relative"}}>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder={"Paste your call transcript here…\n\nFormat:\nRep: [what they said]\nSeller: [what they said]"}
            style={{width:"100%",height:240,background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:"14px 16px",color:TEXT,fontSize:12,lineHeight:1.8,outline:"none",resize:"vertical"}}/>
          <div style={{position:"absolute",bottom:10,right:12,fontSize:13,color:T3,letterSpacing:"0.04em"}}>{text.length} chars</div>
        </div>

        <div style={{display:"flex",gap:10,margin:"6px 0 14px"}}>
          <button onClick={()=>setText(SAMPLE)} style={{background:"transparent",border:"none",color:T2,fontSize:12,cursor:"pointer",padding:0}}>Load sample transcript</button>
          {text&&<button onClick={()=>setText("")} style={{background:"transparent",border:"none",color:T3,fontSize:12,cursor:"pointer",padding:0}}>Clear</button>}
        </div>

        {error&&<div style={{background:"#1a0a0a",border:`1px solid ${RED}22`,borderRadius:6,padding:"9px 12px",fontSize:13,color:RED,marginBottom:12}}>{error}</div>}

        {loading?(
          <div style={{background:S1,border:`1px solid ${B1}`,borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:GREEN,animation:"pulse 2s infinite",flexShrink:0}}/>
            <div style={{fontSize:13,color:T2}}>{msg}</div>
          </div>
        ):(
          <button onClick={handleScore} style={{width:"100%",background:GREEN,border:"none",borderRadius:6,padding:"13px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer"}}>Score This Call</button>
        )}
      </div>
    </div>
  );
}

// ── REPORT ────────────────────────────────────────────────────────────────────
function Report({result,onBack}){
  const [tab,setTab]=useState("scorecard");
  const [openM,setOpenM]=useState(new Set([0]));
  if(!result)return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
      <div style={{fontSize:12,color:T3}}>No call scored yet.</div>
      <button onClick={onBack} style={{background:GREEN,border:"none",borderRadius:6,padding:"8px 16px",color:TEXT,fontSize:13,fontWeight:700,cursor:"pointer"}}>Submit a Call</button>
    </div>
  );
  const {detected,score,verdict,moments,drill,strengths}=result;
  const cats=score.categories||[];
  const toggleM=i=>{const s=new Set(openM);s.has(i)?s.delete(i):s.add(i);setOpenM(s);};
  const rp=parseInt(detected.repTalkRatio)||40;
  const sp=parseInt(detected.sellerTalkRatio)||60;

  const drillBgs={[RED]:"#0f0a0a",[GREEN]:"#0a0f0a",[AMBER]:"#0f0d08"};

  return(
    <div style={{overflowY:"auto",padding:"20px 24px 48px",flex:1}} className="fade">
      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${B3}`,borderRadius:6,padding:"4px 10px",color:T2,fontSize:12,fontWeight:600,cursor:"pointer",marginRight:4}}>← Back</button>
        {[["Seller",detected.sellerTypeLabel],["Level",detected.repExperienceLabel],["Type",detected.callTypeLabel]].map(([l,v])=>(
          <div key={l} style={{background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:"4px 10px"}}>
            <div style={{fontSize:12,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:1}}>{l}</div>
            <div style={{fontSize:12,fontWeight:600}}>{v}</div>
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,background:S1,border:`1px solid ${B1}`,borderRadius:6,padding:"3px 9px"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:GREEN}}/>
          <span style={{fontSize:13,color:GREEN,fontWeight:600}}>Scored by ACQ Coach AI</span>
        </div>
      </div>

      <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"20px 24px",marginBottom:16,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${GREEN},transparent)`}}/>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <Ring score={score.overall} size={120}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T3,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Coach's Verdict</div>
            <p style={{fontSize:12.5,color:TEXT,lineHeight:1.8,maxWidth:460}}>{verdict}</p>
            {strengths.length>0&&(
              <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:5}}>
                {strengths.map((s,i)=>(
                  <div key={i} style={{background:"#0a0f0a",border:`1px solid ${GREEN}25`,borderRadius:6,padding:"3px 9px",fontSize:12,color:GREEN}}>{s}</div>
                ))}
              </div>
            )}
            <div style={{marginTop:12}}><TalkBar rep={rp} seller={sp}/></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
            {[[cats.filter(c=>c.status==="strong").length,GREEN,"Strong"],[cats.filter(c=>c.status==="critical").length,RED,"Critical"]].map(([n,c,l])=>(
              <div key={l} style={{background:S2,border:`1px solid ${B1}`,borderRadius:8,padding:"8px 12px",textAlign:"center",minWidth:76}}>
                <div style={{fontSize:20,fontWeight:800,color:c,letterSpacing:"0.04em"}}>{n}</div>
                <div style={{fontSize:12,color:T3,marginTop:2,textTransform:"uppercase",letterSpacing:"0.10em"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        {result._transcript&&(
          <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${B1}`}}>
            <WaveformBar transcript={result._transcript}/>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:2,background:S1,border:`1px solid ${B1}`,borderRadius:8,padding:3,marginBottom:16}}>
        {[["scorecard","Scorecard"],["moments","Key Moments"],["drill","Practice Drill"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{flex:1,background:"transparent",border:"none",borderBottom:`2px solid ${tab===k?GREEN:"transparent"}`,padding:"7px 0",color:tab===k?GREEN:T3,fontSize:13,fontWeight:tab===k?600:400,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>

      {tab==="scorecard"&&(
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"16px 20px"}} className="fade">
          <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12}}>9-Category Scorecard</div>
          {cats.map((cat,i)=>{
            const c=sc(cat.status);
            return(
              <div key={i} style={{display:"grid",gridTemplateColumns:"185px 1fr 42px 90px",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{fontSize:12,color:T2}}>{cat.name}</div>
                <div style={{height:4,background:S2,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${cat.score/10*100}%`,height:"100%",background:c,borderRadius:2}}/>
                </div>
                <div style={{fontSize:14,fontWeight:800,color:c,textAlign:"right",letterSpacing:"0.04em"}}>{cat.score.toFixed(1)}</div>
                <Pill label={sl(cat.status)} color={c}/>
              </div>
            );
          })}
        </div>
      )}

      {tab==="moments"&&(
        <div className="fade">
          {(moments||[]).length===0
            ?<div style={{fontSize:13,color:T3,textAlign:"center",padding:"28px 0"}}>No critical moments flagged — strong call overall.</div>
            :(moments||[]).map((m,i)=>{
              const c=sc(m.status);
              const open=openM.has(i);
              return(
                <div key={i} style={{border:`1px solid ${B1}`,borderLeft:`3px solid ${c}`,borderRadius:8,overflow:"hidden",background:"#0a0a0a",marginBottom:8,animation:`fadeUp .2s ${i*.04}s ease both`}}>
                  <div onClick={()=>toggleM(i)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",cursor:"pointer"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}>
                        <span style={{fontSize:13,fontWeight:700}}>{m.category}</span>
                        <Pill label={sl(m.status)} color={c}/>
                      </div>
                      <div style={{fontSize:12,color:T2}}>{(m.what||"").slice(0,88)}{(m.what||"").length>88?"...":""}</div>
                    </div>
                    <span style={{fontSize:12,color:T3}}>{open?"▲":"▼"}</span>
                  </div>
                  {open&&(
                    <div style={{padding:"0 16px 16px",borderTop:`1px solid ${B1}`}}>
                      <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",margin:"12px 0 5px"}}>What happened</div>
                      <div style={{fontSize:13,color:T2,lineHeight:1.7,fontStyle:"italic",borderLeft:`2px solid ${B2}`,paddingLeft:10}}>{m.what}</div>
                      <div style={{fontSize:12,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",margin:"10px 0 5px"}}>Why it missed</div>
                      <div style={{fontSize:13,color:TEXT,lineHeight:1.75}}>{m.why}</div>
                      <div style={{background:"#0a0f0a",border:`1px solid ${GREEN}22`,borderLeft:`3px solid ${GREEN}`,borderRadius:8,padding:"12px 14px",marginTop:10}}>
                        <div style={{fontSize:12,fontWeight:700,color:GREEN,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>What to say instead</div>
                        <div style={{fontSize:12,color:TEXT,lineHeight:1.75,fontStyle:"italic"}}>"{m.rewrite}"</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
      )}

      {tab==="drill"&&drill&&(
        <div style={{background:S1,border:`1px solid ${B1}`,borderRadius:10,padding:"22px 24px"}} className="fade">
          <div style={{fontSize:14,fontWeight:700,marginBottom:4,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.04em"}}>{drill.title}</div>
          <div style={{fontSize:13,color:T2,lineHeight:1.7,marginBottom:18}}>Practice until the response feels natural, not rehearsed.</div>
          {[[RED,"Seller says",drill.sellerLine,true],[GREEN,"Your goal",drill.goal,false],[AMBER,"Coaching note",drill.tip,false]].map(([c,l,t,italic])=>(
            <div key={l} style={{background:drillBgs[c]||S1,border:`1px solid ${c}22`,borderLeft:`3px solid ${c}`,borderRadius:8,padding:"14px 16px",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:7}}>{l}</div>
              <div style={{fontSize:13,lineHeight:1.7,fontStyle:italic?"italic":"normal"}}>{italic?`"${t}"`:t}</div>
            </div>
          ))}
          <button style={{width:"100%",marginTop:4,background:"transparent",border:`1px solid ${GREEN}`,borderRadius:6,padding:"11px",color:GREEN,fontSize:12,fontWeight:700,cursor:"pointer"}}>Mark drill complete</button>
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function ACQCoach({onSwitchView,isSuperAdmin=false}){
  const [reps,setReps]=useState([]);
  const [calls,setCalls]=useState([]);
  const [selectedRep,setSelectedRep]=useState(null);
  const [view,setView]=useState("dashboard");
  const [result,setResult]=useState(null);
  const [playbook,setPlaybook]=useState("");
  const [annotations,setAnnotations]=useState({});
  const [integrations,setIntegrations]=useState(()=>{
    return {};
  });
  const nextId=useRef(5);
  const [ghlAccounts,setGhlAccounts]=useState([]);
  const [accountsLoaded,setAccountsLoaded]=useState(false);
  const [selectedAccount,setSelectedAccount]=useState(null);

  useEffect(()=>{
    (async()=>{
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setAccountsLoaded(true); return; }
      try{
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ghl-proxy`,{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,apikey: SUPABASE_KEY},
          body:JSON.stringify({action:"list-accounts"}),
        });
        const d = await r.json();
        const accs=d.accounts||[];
        setGhlAccounts(accs);
        if(accs.length>0)setSelectedAccount(accs[0].id);
        else setSelectedAccount("test-data");
      }catch(e){ setSelectedAccount("test-data"); }
      finally{ setAccountsLoaded(true); }
    })();
  },[]);

  // When a real GHL account is selected, fetch its users, call scores, and contact counts
  useEffect(()=>{
    if(!selectedAccount)return;
    if(selectedAccount==="test-data"){
      setReps(INIT_REPS);
      setCalls(INIT_CALLS);
      setSelectedRep(INIT_REPS[0]);
      return;
    }
    // Clear stale data immediately when switching to a real account so the previous
    // customer's reps/calls don't flash before the new fetch completes.
    setReps([]);setCalls([]);setSelectedRep(null);
    async function loadAccountData(){
      try{
        const { data: { session: s2 } } = await supabase.auth.getSession();
        const tok2 = s2?.access_token;
        if (!tok2) return;
        const proxy=(action,extra={})=>fetch(`${SUPABASE_URL}/functions/v1/ghl-proxy`,{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:`Bearer ${tok2}`,apikey: SUPABASE_KEY},
          body:JSON.stringify({action,account_id:selectedAccount,...extra}),
        }).then(r=>r.json());

        // Demo data is now real DB rows (seeded by admin-api on demo_mode toggle),
        // so all reads go through the standard path — RLS, joins, counts all work.
        const usersRes=await proxy("list-users");
        const users=usersRes.users||[];
        const [scoresRes, contactsRes] = await Promise.all([
          supabase.from("call_scores").select("*").eq("account_id",selectedAccount).order("scored_at",{ascending:false}).limit(500),
          supabase.from("ghl_contacts").select("assigned_user_id").eq("account_id",selectedAccount),
        ]);

        const scores=(scoresRes.data||[]);
        const contacts=(contactsRes.data||[]);

        // Build contact counts per ghl_user_id
        const contactCounts={};
        contacts.forEach(c=>{
          if(c.assigned_user_id){
            contactCounts[c.assigned_user_id]=(contactCounts[c.assigned_user_id]||0)+1;
          }
        });

        // Build scores per ghl_user_id
        const scoresByRep={};
        scores.forEach(s=>{
          if(s.rep_ghl_user_id){
            if(!scoresByRep[s.rep_ghl_user_id])scoresByRep[s.rep_ghl_user_id]=[];
            scoresByRep[s.rep_ghl_user_id].push(s);
          }
        });

        if(users.length===0){setReps([]);setCalls([]);setSelectedRep(null);return;}

        function buildRep(u){
          const initials=u.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
          const repScores=scoresByRep[u.ghl_user_id]||[];
          const last7=repScores.slice(0,7).map(s=>s.overall_score);
          const avg=last7.length?Math.round(last7.reduce((a,b)=>a+b,0)/last7.length):0;
          const prev7=repScores.slice(7,14).map(s=>s.overall_score);
          const prevAvg=prev7.length?Math.round(prev7.reduce((a,b)=>a+b,0)/prev7.length):0;
          const trend=last7.length?avg-prevAvg:0;
          const total=repScores.length;
          const contacts=contactCounts[u.ghl_user_id]||0;

          // Build history arrays from scores (newest first, reverse for chart)
          const h30=repScores.slice(0,13).map(s=>s.overall_score).reverse();
          const h90=repScores.slice(0,16).map(s=>s.overall_score).reverse();
          if(!h30.length)h30.push(0);
          if(!h90.length)h90.push(0);

          // Talk ratios from last 3 calls
          const talks=repScores.slice(0,3).map(s=>({r:s.rep_talk_ratio||50,s:s.seller_talk_ratio||50}));
          if(!talks.length)talks.push({r:50,s:50});

          // Weak/strong categories from latest score
          let weak="N/A",strong="N/A";
          if(repScores.length>0&&repScores[0].category_scores?.length){
            const cats=repScores[0].category_scores;
            const sorted=[...cats].sort((a,b)=>a.score-b.score);
            weak=sorted[0]?.name||sorted[0]?.category||"N/A";
            strong=sorted[sorted.length-1]?.name||sorted[sorted.length-1]?.category||"N/A";
          }

          // Streak: count consecutive improving scores
          let streak=0;
          for(let i=0;i<last7.length-1;i++){
            if(last7[i]>=last7[i+1])streak++;
            else break;
          }

          const flagged=avg>0&&avg<55;

          return{
            id:`ghl-${u.id}`,ghlUserId:u.ghl_user_id,name:u.name,avatar:initials,
            role:u.role==="admin"?"Admin":u.role==="sales_rep"?"Sales Rep":"Unassigned",
            exp:u.role==="admin"?"experienced":avg>=75?"experienced":avg>=55?"developing":"new",
            avg,trend,week:repScores.filter(s=>{const d=new Date(s.scored_at);const w=new Date();w.setDate(w.getDate()-7);return d>=w;}).length,
            total,flagged,streak,contacts,
            scores:last7.length>=7?last7.reverse():([...Array(7-last7.length).fill(0),...last7]).reverse(),
            weak,strong,talks,history30:h30,history90:h90,
          };
        }

        let expOverrides={};
        try{expOverrides=JSON.parse(localStorage.getItem("cc:rep_exp_overrides")||"{}")||{};}catch(e){}
        const allReps=users.map(u=>{const r=buildRep(u);const ov=expOverrides[u.ghl_user_id];if(ov)r.exp=ov;return r;});
        // Build calls list from scores (keep full score so the dashboard can render the detailed card)
        const callsList=scores.map((s)=>({
          id:`cs-${s.id}`,repId:`ghl-${users.find(u=>u.ghl_user_id===s.rep_ghl_user_id)?.id||"unknown"}`,
          date:new Date(s.scored_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}),
          seller:s.seller_name||"Unknown",type:s.seller_type||"Unknown",
          score:s.overall_score,grade:s.grade,dur:s.duration||"N/A",
          st:s.seller_talk_ratio||50,rt:s.rep_talk_ratio||50,isNew:false,
          _full:s,
        }));

        setReps(allReps);
        setCalls(callsList);
        // Default to the rep with the most scored calls (so the dashboard lands on someone with data)
        const repWithData=[...allReps].sort((a,b)=>b.total-a.total)[0];
        setSelectedRep(repWithData||allReps[0]||null);
      }catch(e){console.error("Failed to load account data:",e);}
    }
    loadAccountData();
  },[selectedAccount]);

  function addRep(rep){setReps(prev=>[...prev,rep]);}
  function removeRep(id){
    setReps(prev=>prev.filter(r=>r.id!==id));
    if(selectedRep?.id===id)setSelectedRep(INIT_REPS[0]);
  }
  function updateRep(id,patch){
    setReps(prev=>prev.map(r=>r.id===id?{...r,...patch}:r));
    if(selectedRep?.id===id)setSelectedRep(r=>({...r,...patch}));
  }
  function saveIntegration(id,vals){
    setIntegrations(prev=>({...prev,[id]:vals}));
  }

  function handleScore(res,tr){
    const repId=selectedRep?selectedRep.id:1;
    const newCall={
      id:nextId.current++,repId,date:"Just now",seller:"New Seller",
      type:res.detected.sellerTypeLabel||"Unknown",
      score:res.score.overall,grade:res.score.grade,
      dur:"N/A",st:tr.seller,rt:tr.rep,isNew:true,
    };
    setCalls(prev=>[newCall,...prev]);
    setReps(prev=>prev.map(rep=>{
      if(rep.id!==repId)return rep;
      const newScores=[...rep.scores.slice(-6),res.score.overall];
      const newAvg=Math.round(newScores.reduce((a,b)=>a+b,0)/newScores.length);
      const newTalks=[...rep.talks.slice(-4),{r:tr.rep,s:tr.seller}];
      const newH30=[...rep.history30.slice(-12),newAvg];
      const newH90=[...rep.history90.slice(-15),newAvg];
      return{...rep,scores:newScores,avg:newAvg,trend:newAvg-rep.avg,total:rep.total+1,week:rep.week+1,talks:newTalks,history30:newH30,history90:newH90};
    }));
    if(selectedRep){
      setSelectedRep(prev=>{
        const newScores=[...prev.scores.slice(-6),res.score.overall];
        const newAvg=Math.round(newScores.reduce((a,b)=>a+b,0)/newScores.length);
        const newTalks=[...prev.talks.slice(-4),{r:tr.rep,s:tr.seller}];
        const newH30=[...prev.history30.slice(-12),newAvg];
        const newH90=[...prev.history90.slice(-15),newAvg];
        return{...prev,scores:newScores,avg:newAvg,trend:newAvg-prev.avg,total:prev.total+1,week:prev.week+1,talks:newTalks,history30:newH30,history90:newH90};
      });
    }
    setResult(res);
    setView("report");

    // Persist to database
    if(selectedAccount&&selectedAccount!=="test-data"&&selectedRep){
      supabase.from("call_scores").insert({
        account_id:selectedAccount,
        rep_ghl_user_id:selectedRep.ghlUserId||null,
        rep_name:selectedRep.name||"",
        seller_name:res.detected?.sellerTypeLabel||"Unknown",
        seller_type:res.detected?.sellerType||"unknown",
        call_type:res.detected?.callType||"first-contact",
        overall_score:res.score.overall,
        grade:res.score.grade||grade(res.score.overall),
        category_scores:res.score.categories||[],
        rep_talk_ratio:tr.rep,
        seller_talk_ratio:tr.seller,
        transcript:res._transcript||null,
        verdict:res.verdict||null,
        strengths:res.strengths||[],
        moments:res.moments||[],
      }).then(({error})=>{if(error)console.error("Failed to save call score:",error);});
    }
  }

  function addAnnotation(callId,text){
    setAnnotations(prev=>({
      ...prev,
      [callId]:[...(prev[callId]||[]),{text,date:nowLabel(),author:"Manager"}],
    }));
  }

  const showSidebar=view==="dashboard"||view==="leaderboard";

  const navItems=[
    ["dashboard","Dashboard"],
    ["leaderboard","Leaderboard"],
    ["submit","Score a Call"],
    ["report","Last Report"],
    ["roleplay","Roleplay"],
    ["accounts","Accounts"],
    ["settings","Settings"],
  ];

  if(!accountsLoaded){
    return(
      <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:BG,color:T3,fontFamily:"'Open Sans',sans-serif",fontSize:13}}>
        Loading…
      </div>
    );
  }

  return(
    <>
      <style>{css}</style>
      <div style={{height:"100vh",display:"flex",flexDirection:"column",background:BG,color:TEXT,overflow:"hidden"}}>
        {/* Header */}
        <header style={{background:"#000000",borderBottom:`1px solid ${B1}`,padding:"0 20px",height:50,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,paddingRight:16,borderRight:`1px solid ${B1}`}}>
            <img src={closerControlLogo} alt="Closer Control" style={{height:30,width:"auto"}} />
            <div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.08em"}}>ACQ COACH</div>
              <div style={{fontSize:12,color:T3,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:"'Open Sans',sans-serif"}}>by Closer Control</div>
            </div>
          </div>

          <nav style={{display:"flex",gap:1,height:"100%",alignItems:"stretch"}}>
            {navItems.map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)}
                style={{position:"relative",background:"transparent",border:"none",borderBottom:`2px solid ${view===k?GREEN:"transparent"}`,padding:"0 12px",color:view===k?GREEN:T3,fontSize:13,fontWeight:view===k?600:400,cursor:"pointer",height:"100%",transition:"color .15s"}}>
                {l}
                {isSuperAdmin&&k==="settings"&&Object.keys(integrations).length>0&&(
                  <span style={{position:"absolute",top:10,right:4,width:4,height:4,borderRadius:"50%",background:GREEN,display:"block"}}/>
                )}
              </button>
            ))}
          </nav>

          <div style={{flex:1}}/>

          {onSwitchView&&(
            <button onClick={onSwitchView}
              style={{background:"transparent",border:`1px solid ${B1}`,borderRadius:6,padding:"5px 12px",color:T3,fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em",marginRight:8,transition:"border-color .15s"}}
              onMouseOver={e=>e.currentTarget.style.borderColor=GREEN}
              onMouseOut={e=>e.currentTarget.style.borderColor=B1}
            >← Switch View</button>
          )}


          <div style={{width:26,height:26,borderRadius:6,border:`1px solid ${B1}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:GREEN,fontFamily:"'League Spartan',sans-serif",letterSpacing:"0.06em"}}>CC</div>
        </header>

        {/* Body */}
        <div style={{flex:1,overflow:"hidden",display:"flex"}}>
          {showSidebar&&(
            <Sidebar reps={reps} selectedRep={selectedRep}
              onSelect={rep=>{setSelectedRep(rep);setView("dashboard");}}
              onLeaderboard={()=>setView("leaderboard")}/>
          )}
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            {view==="dashboard"&&
              <Dashboard rep={selectedRep} calls={calls} reps={reps}
                onScore={()=>setView("submit")}
                annotations={annotations} onAnnotate={addAnnotation}
                ghlAccounts={ghlAccounts} selectedAccount={selectedAccount} onAccountChange={setSelectedAccount}/>}
            {view==="leaderboard"&&
              <Leaderboard reps={reps} calls={calls}
                onBack={()=>setView("dashboard")}
                onSelect={rep=>{setSelectedRep(rep);}}/>}
            {view==="submit"&&
              <SubmitCall onScore={handleScore} onBack={()=>setView("dashboard")} playbook={playbook}/>}
            {view==="report"&&
              <Report result={result} onBack={()=>setView("submit")}/>}
            {view==="roleplay"&&
              <RoleplayMode onBack={()=>setView("dashboard")}/>}
            {view==="accounts"&&
              <AccountManagement onBack={()=>setView("dashboard")} isSuperAdmin={isSuperAdmin}/>}
            {view==="settings"&&
              <SettingsView
                playbook={playbook} onSavePlaybook={setPlaybook}
                reps={reps} onAddRep={addRep} onRemoveRep={removeRep} onUpdateRep={updateRep}
                integrations={integrations} onSaveIntegration={saveIntegration}
                isSuperAdmin={isSuperAdmin}
                onBack={()=>setView("dashboard")}/>}
          </div>
        </div>
      </div>
    </>
  );
}
