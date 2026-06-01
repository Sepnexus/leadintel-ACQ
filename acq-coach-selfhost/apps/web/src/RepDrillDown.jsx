import { useState, useEffect, useRef } from "react";

// ── Palette (same tokens as ACQCoach / RepView) ───────────────────────────────
const S1="#0d0d0d",S2="#141414",B1="#1c1c1c",B2="#222222",B3="#2a2a2a";
const TEXT="#f4f4f4",T2="#999999",T3="#777777";
const GREEN="#4e7d3d",RED="#c0392b",AMBER="#b7860b";

// ── Category metadata ─────────────────────────────────────────────────────────
const CAT_FULL=[
  "Introduction and Positioning","Rapport Building","Motivation Discovery",
  "Timeline Discovery","Financial Discovery","Offer Presentation",
  "Objection Handling","First No Recovery","Next Step Close",
];

const CAT_COACHING={
  "Introduction and Positioning":"Work on opening with a clear value prop",
  "Rapport Building":"Ask more personal questions before business",
  "Motivation Discovery":"Use 'tell me more about that' to dig deeper",
  "Timeline Discovery":"Always confirm a specific date, not 'soon'",
  "Financial Discovery":"Ask about the mortgage balance directly",
  "Offer Presentation":"Present the number with confidence, no hedging",
  "Objection Handling":"Acknowledge first, then reframe — don't defend",
  "First No Recovery":"Expect the first no — have a scripted bridge ready",
  "Next Step Close":"End every call with a specific date and time",
};

const CAT_OFFSETS=[0.3,-0.4,0.2,-0.2,0.5,-0.3,0.4,-0.5,0.3];

// ── Helpers ───────────────────────────────────────────────────────────────────
function gc(s){return s>=80?GREEN:s>=65?AMBER:RED;}
function dotClr(s){return s>=8?GREEN:s>=6?AMBER:RED;}
function grade(s){return s>=90?"A":s>=82?"B+":s>=75?"B":s>=68?"B-":s>=62?"C+":s>=55?"C":s>=48?"D":"F";}

/**
 * Returns [{name, score}] × 9 for a rep.
 * Priority:
 *   1. Computed from passed repCalls (most accurate — ACQCoach with live DB data)
 *   2. rep.categoryAverages  (RepView buildDbReps)
 *   3. Simulation via avg + CAT_OFFSETS
 */
function getRepCats(rep, repCalls=[]){
  if(repCalls.length>0){
    const sums={},cnts={};
    repCalls.forEach(c=>{
      (c._full?.category_scores||[]).forEach(cs=>{
        const n=cs.name||cs.category; if(!n)return;
        sums[n]=(sums[n]||0)+Number(cs.score||0);
        cnts[n]=(cnts[n]||0)+1;
      });
    });
    if(Object.keys(sums).length>0)
      return CAT_FULL.map(name=>({name,score:cnts[name]?Math.round(sums[name]/cnts[name]):0}));
  }
  if(rep?.categoryAverages?.length){
    return CAT_FULL.map((name,i)=>({name,score:Number(rep.categoryAverages[i]?.score)||0}));
  }
  const base=rep?.avg||0;
  return CAT_FULL.map((name,i)=>{
    const raw=(base/10)+CAT_OFFSETS[i]*(rep?.exp==="new"?-1:1);
    return{name,score:Math.round(Math.min(10,Math.max(1,raw)))};
  });
}

/** Returns [avgScore] × 9 across all reps. */
function getTeamAvgs(reps, callsByRepId={}){
  const sums=Array(9).fill(0),counts=Array(9).fill(0);
  reps.forEach(r=>{
    getRepCats(r,callsByRepId[r.id]||[]).forEach((c,i)=>{sums[i]+=c.score;counts[i]++;});
  });
  return sums.map((s,i)=>counts[i]>0?s/counts[i]:0);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SLabel({children}){
  return(
    <div style={{
      fontSize:10,fontWeight:800,color:T3,textTransform:"uppercase",
      letterSpacing:"0.14em",marginBottom:9,fontFamily:"'Open Sans',sans-serif",
    }}>{children}</div>
  );
}

function Tile({label,children,span2=false}){
  return(
    <div style={{
      background:S2,border:`1px solid ${B1}`,borderRadius:7,
      padding:"10px 12px",display:"flex",flexDirection:"column",gap:5,
      ...(span2?{gridColumn:"1/-1"}:{}),
    }}>
      <div style={{fontSize:9,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em"}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>{children}</div>
    </div>
  );
}

// ── RepDrillDown ──────────────────────────────────────────────────────────────
/**
 * 480 px right-side drawer with 6 coaching sections.
 *
 * Props
 * ─────
 * rep         — rep object (buildRep / buildDbReps / INIT_REPS)
 * reps        — full team array (for team avg computation)
 * calls       — full calls array from ACQCoach ([] when called from RepView)
 * onClose     — fn()
 * onOpenCall  — fn(callScoreObj) optional — opens CallScoreCard; null = hide Review btn
 */
export function RepDrillDown({rep,reps=[],calls=[],onClose,onOpenCall=null}){
  const [note,setNote]=useState("");
  const [noteSaved,setNoteSaved]=useState(null);
  const LS_KEY=`cc:coaching_note_${rep?.id}`;

  // Load saved note
  useEffect(()=>{
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(raw){const p=JSON.parse(raw);setNote(p.text||"");setNoteSaved(p);}
    }catch(e){}
  },[rep?.id]);

  // Esc to close
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",h);
    return()=>document.removeEventListener("keydown",h);
  },[onClose]);

  if(!rep)return null;

  // ── Calls for this rep
  const repCalls=calls.filter(c=>c.repId===rep.id);

  // ── Build callsByRepId for team avg computation
  const callsByRepId={};
  reps.forEach(r=>{callsByRepId[r.id]=calls.filter(c=>c.repId===r.id);});

  // ── Category data
  const cats=getRepCats(rep,repCalls);
  const teamAvgs=getTeamAvgs(reps,callsByRepId);

  const best=cats.reduce((a,b)=>b.score>a.score?b:a,cats[0]);
  const worst=cats.reduce((a,b)=>b.score<a.score?b:a,cats[0]);
  const worstIdx=cats.findIndex(c=>c.name===worst.name);
  const bestIdx=cats.findIndex(c=>c.name===best.name);
  const teamWorstAvg=teamAvgs[worstIdx]||0;
  const belowDelta=worst.score-teamWorstAvg;

  // ── Verdict sentence (client-side, no AI call)
  const firstName=rep.name.split(" ")[0];
  const trendPhrase=(rep.trend||0)>2?" and is currently on an upswing":(rep.trend||0)<-2?" but is trending downward":"";
  const verdict=`${firstName} leads the team in ${best.name.toLowerCase()} (${best.score}/10) but struggles at ${worst.name.toLowerCase()} — scoring ${worst.score}/10, ${Math.abs(belowDelta).toFixed(1)} points ${belowDelta<0?"below":"above"} team avg${trendPhrase}.`;

  // ── Talk ratio
  let talkRatio=null;
  if(rep.talks?.length){
    talkRatio=Math.round(rep.talks.reduce((s,t)=>s+(t.r||50),0)/rep.talks.length);
  } else if(repCalls.length>0){
    talkRatio=Math.round(repCalls.reduce((s,c)=>s+(c.rt||c._full?.rep_talk_ratio||50),0)/repCalls.length);
  }

  // ── Rank
  const rank=[...reps].sort((a,b)=>(b.avg||0)-(a.avg||0)).findIndex(r=>r.id===rep.id)+1;

  // ── Overall grade + color
  const g=grade(rep.avg);
  const oClr=gc(rep.avg);

  // ── Streak direction
  const streakDir=(rep.trend||0)>=0?"up":"down";

  // ── Recent calls (last 5, newest first)
  const recentCalls=[...repCalls]
    .sort((a,b)=>new Date(b._full?.scored_at||0)-new Date(a._full?.scored_at||0))
    .slice(0,5);

  // ── Save note
  function saveNote(){
    const saved={text:note,ts:Date.now()};
    try{localStorage.setItem(LS_KEY,JSON.stringify(saved));}catch(e){}
    setNoteSaved(saved);
  }

  return(
    <>
      <style>{`@keyframes drillSlide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,
      }}/>

      {/* Drawer */}
      <div style={{
        position:"fixed",top:0,right:0,bottom:0,width:480,
        background:S1,borderLeft:`1px solid ${B1}`,
        zIndex:1001,overflowY:"auto",
        fontFamily:"'Open Sans',sans-serif",
        boxShadow:"-12px 0 40px rgba(0,0,0,0.7)",
        animation:"drillSlide .18s ease-out",
      }}>

        {/* ── Sticky header ── */}
        <div style={{
          position:"sticky",top:0,background:S1,borderBottom:`1px solid ${B1}`,
          padding:"13px 18px",display:"flex",alignItems:"center",
          justifyContent:"space-between",zIndex:2,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{
              width:36,height:36,borderRadius:8,
              background:oClr+"18",border:`1px solid ${oClr}44`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:14,fontWeight:800,color:oClr,letterSpacing:"0.04em",flexShrink:0,
            }}>{rep.avatar}</div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:TEXT}}>{rep.name}</div>
              {rep.role&&<div style={{fontSize:10,color:T3,marginTop:1}}>{rep.role}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"transparent",border:`1px solid ${B2}`,borderRadius:6,
            width:28,height:28,color:T2,fontSize:18,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            lineHeight:1,flexShrink:0,fontFamily:"sans-serif",
          }}>×</button>
        </div>

        {/* ── Body sections ── */}
        <div style={{padding:"20px 18px",display:"flex",flexDirection:"column",gap:22}}>

          {/* ─── 1. THE VERDICT ─── */}
          <section>
            <SLabel>The Verdict</SLabel>
            <div style={{
              background:"rgba(78,125,61,0.07)",border:`1px solid ${GREEN}22`,
              borderRadius:8,padding:"13px 15px",
              fontSize:13,color:T2,lineHeight:1.75,fontStyle:"italic",
            }}>
              {verdict}
            </div>
          </section>

          {/* ─── 2. PERFORMANCE SNAPSHOT ─── */}
          <section>
            <SLabel>Performance Snapshot</SLabel>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>

              {/* Overall — full width */}
              <div style={{
                gridColumn:"1/-1",background:S2,border:`1px solid ${B1}`,borderRadius:7,
                padding:"12px 14px",display:"flex",alignItems:"center",gap:16,
              }}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5}}>Overall Score</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    <span style={{fontSize:30,fontWeight:900,color:oClr,letterSpacing:"0.04em",lineHeight:1}}>{rep.avg}</span>
                    <span style={{fontSize:20,fontWeight:800,color:oClr}}>{g}</span>
                  </div>
                </div>
                <div style={{width:1,height:36,background:B2}}/>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9,fontWeight:700,color:T3,textTransform:"uppercase",letterSpacing:"0.10em",marginBottom:4}}>Rank</div>
                  <div style={{fontSize:18,fontWeight:800,color:T2}}>#{rank}</div>
                </div>
              </div>

              {/* Talk Ratio */}
              <Tile label="Talk Ratio">
                {talkRatio!==null?(
                  <span style={{fontSize:20,fontWeight:700,color:talkRatio>75?RED:talkRatio<55?GREEN:AMBER}}>
                    {talkRatio}%
                  </span>
                ):<span style={{fontSize:13,color:T3}}>—</span>}
              </Tile>

              {/* 7-Call Trend */}
              <Tile label="7-Call Trend">
                <span style={{fontSize:13,fontWeight:700,color:(rep.trend||0)>1?GREEN:(rep.trend||0)<-1?RED:T2}}>
                  {(rep.trend||0)>1?"↑ Improving":(rep.trend||0)<-1?"↓ Declining":"→ Steady"}
                </span>
                <span style={{fontSize:11,color:T3,marginLeft:5}}>({(rep.trend||0)>0?"+":""}{rep.trend||0})</span>
              </Tile>

              {/* Call Streak */}
              <Tile label="Call Streak">
                {(rep.streak||0)>0?(
                  <span style={{fontSize:14,fontWeight:700,color:streakDir==="up"?GREEN:RED}}>
                    {rep.streak} call{rep.streak!==1?"s":""} {streakDir==="up"?"↑":"↓"}
                  </span>
                ):<span style={{fontSize:13,color:T3}}>No streak</span>}
              </Tile>

              {/* Calls this week */}
              <Tile label="Calls / Week">
                <span style={{fontSize:22,fontWeight:800,color:TEXT}}>{rep.week||0}</span>
              </Tile>

              {/* Best category */}
              <Tile label="Best Category">
                <span style={{fontSize:11,fontWeight:700,color:GREEN,flex:1,lineHeight:1.35}}>{best.name}</span>
                <span style={{fontSize:12,fontWeight:800,color:GREEN,marginLeft:4,flexShrink:0}}>{best.score}/10</span>
              </Tile>

              {/* Worst category */}
              <Tile label="Worst Category">
                <span style={{fontSize:11,fontWeight:700,color:RED,flex:1,lineHeight:1.35}}>{worst.name}</span>
                <span style={{fontSize:12,fontWeight:800,color:RED,marginLeft:4,flexShrink:0}}>{worst.score}/10</span>
              </Tile>

            </div>
          </section>

          {/* ─── 3. CATEGORY BREAKDOWN ─── */}
          <section>
            <SLabel>Category Breakdown</SLabel>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {cats.map((cat,i)=>{
                const dc=dotClr(cat.score);
                const teamDelta=cat.score-teamAvgs[i];
                const needsCoach=cat.score<6;
                return(
                  <div key={cat.name} style={{
                    background:S2,
                    border:`1px solid ${needsCoach?RED+"40":B1}`,
                    borderLeft:`3px solid ${needsCoach?RED:cat.score>=8?GREEN:AMBER}`,
                    borderRadius:7,padding:"10px 12px",
                  }}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:11,color:needsCoach?RED:T2,fontWeight:needsCoach?700:400,flex:1,minWidth:0,paddingRight:8}}>{cat.name}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        <span style={{
                          fontSize:10,fontWeight:600,
                          color:teamDelta>=0?GREEN:RED,
                        }}>
                          {teamDelta>=0?"+":""}{teamDelta.toFixed(1)} team
                        </span>
                        <span style={{fontSize:15,fontWeight:800,color:dc,minWidth:20,textAlign:"right"}}>{cat.score}</span>
                      </div>
                    </div>
                    <div style={{height:4,background:B3,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${cat.score*10}%`,height:"100%",background:dc,borderRadius:2,transition:"width .35s"}}/>
                    </div>
                    {needsCoach&&(
                      <div style={{fontSize:11,color:AMBER,marginTop:7,lineHeight:1.55,paddingLeft:1}}>
                        💡 {CAT_COACHING[cat.name]||"Focus on improvement here"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── 4. RECENT CALLS ─── */}
          <section>
            <SLabel>Recent Calls</SLabel>
            {recentCalls.length===0?(
              <div style={{fontSize:12,color:T3,padding:"8px 0"}}>No scored calls on record.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {recentCalls.map((call,i)=>{
                  const full=call._full||{};
                  const callCats=Array.isArray(full.category_scores)?full.category_scores:[];
                  const weakCat=callCats.length?callCats.reduce((a,b)=>Number(b.score)<Number(a.score)?b:a,callCats[0]):null;
                  const dateStr=full.scored_at
                    ?new Date(full.scored_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})
                    :(call.date||"—");
                  const sc=gc(call.score||0);
                  return(
                    <div key={call.id||i} style={{
                      background:S2,border:`1px solid ${B1}`,borderRadius:7,
                      padding:"10px 12px",display:"flex",alignItems:"center",gap:10,
                    }}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontSize:11,color:T3}}>{dateStr}</span>
                          <span style={{fontSize:10,color:T3,textTransform:"uppercase",letterSpacing:"0.08em"}}>{call.type||full.seller_type||"call"}</span>
                          {(call.dur||full.duration)&&<span style={{fontSize:10,color:T3}}>{call.dur||full.duration}</span>}
                          <span style={{fontSize:14,fontWeight:800,color:sc,marginLeft:"auto"}}>{call.score||0}</span>
                        </div>
                        {weakCat&&(
                          <div style={{fontSize:10,color:T3}}>
                            Weak: <span style={{color:RED,fontWeight:600}}>{weakCat.name||weakCat.category}</span>
                          </div>
                        )}
                      </div>
                      {onOpenCall&&(
                        <button
                          onClick={()=>onOpenCall(full||call)}
                          style={{
                            background:"transparent",border:`1px solid ${B3}`,borderRadius:5,
                            padding:"5px 10px",color:T2,fontSize:10,fontWeight:600,
                            cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",
                            transition:"border-color .15s,color .15s",
                          }}
                          onMouseOver={e=>{e.currentTarget.style.borderColor=GREEN;e.currentTarget.style.color=GREEN;}}
                          onMouseOut={e=>{e.currentTarget.style.borderColor=B3;e.currentTarget.style.color=T2;}}
                        >
                          Review
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ─── 5. COACHING NOTE ─── */}
          <section>
            <SLabel>Coaching Note</SLabel>
            <textarea
              value={note}
              onChange={e=>setNote(e.target.value)}
              placeholder={`Private notes for ${firstName}…`}
              rows={4}
              style={{
                width:"100%",background:S2,border:`1px solid ${B1}`,borderRadius:7,
                padding:"10px 12px",color:TEXT,fontSize:12,resize:"vertical",
                outline:"none",fontFamily:"'Open Sans',sans-serif",lineHeight:1.6,
                boxSizing:"border-box",
              }}
            />
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:7}}>
              <span style={{fontSize:10,color:T3}}>
                {noteSaved
                  ?`Saved ${new Date(noteSaved.ts).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}`
                  :"Not yet saved"}
              </span>
              <button onClick={saveNote} style={{
                background:GREEN,border:"none",borderRadius:5,
                padding:"5px 14px",color:TEXT,fontSize:11,fontWeight:700,cursor:"pointer",
              }}>Save Note</button>
            </div>
          </section>

          {/* ─── 6. SUGGESTED 1:1 AGENDA ─── */}
          <section style={{paddingBottom:12}}>
            <SLabel>Suggested 1:1 Agenda</SLabel>
            <div style={{
              background:S2,border:`1px solid ${B1}`,borderRadius:8,
              padding:"14px 16px",display:"flex",flexDirection:"column",gap:13,
            }}>
              {[
                {
                  icon:"🏆",label:"Praise",
                  text:`Recognize ${firstName}'s ${best.name.toLowerCase()} work — ${best.score}/10${teamAvgs[bestIdx]?` vs team avg ${teamAvgs[bestIdx].toFixed(1)}`:""}.`,
                },
                {
                  icon:"🎯",label:"Focus",
                  text:`Drill ${worst.name.toLowerCase()}: ${worst.score}/10 vs team avg ${teamWorstAvg.toFixed(1)}. ${CAT_COACHING[worst.name]||""}`,
                },
                {
                  icon:"📋",label:"Assign",
                  text:`Assign 3 roleplay sessions on ${worst.name.toLowerCase()} before next 1:1.`,
                },
              ].map(item=>(
                <div key={item.label} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:14,flexShrink:0,marginTop:2}}>{item.icon}</span>
                  <div>
                    <span style={{
                      fontSize:9,fontWeight:800,color:T3,
                      textTransform:"uppercase",letterSpacing:"0.12em",marginRight:7,
                    }}>{item.label}</span>
                    <span style={{fontSize:12,color:T2,lineHeight:1.65}}>{item.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </>
  );
}
