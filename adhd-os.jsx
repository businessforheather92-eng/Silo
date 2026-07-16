import { useState, useEffect, useRef, useCallback } from "react";

// Botanical theme — deep moss surfaces, sage accent ramp, cream text.
// Lightness ladder mirrors the original palette so every contrast pair holds.
const P = {
  bg:"#0B110B", surface:"#121B12", card:"#1A251B", hover:"#223122", lift:"#2B3D2A",
  border:"#2F3F2C", borderHi:"#4D6045",
  p10:"#2E4527",p20:"#436139",p30:"#5B7F4E",p40:"#7AA067",p50:"#98BC85",p60:"#B8D3A7",p70:"#D4E5C7",p80:"#EAF3E1",
  text:"#F5F9F0", textSub:"#D0DEC4", muted:"#9EB290", dim:"#152013",
  glow:"rgba(122,160,103,0.28)",
};
const FONT="'Inter var','Inter',system-ui,sans-serif";

const store={
  get:(k,fb)=>{try{const v=localStorage.getItem(k);return v!=null?JSON.parse(v):fb;}catch{return fb;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
};

// shade("#8B5A2B", 0.15) lightens 15%, negative darkens — for SVG gradients
const shade=(hex,amt)=>{
  const n=parseInt(hex.slice(1),16);
  const f=c=>Math.max(0,Math.min(255,Math.round(amt>0?c+(255-c)*amt:c+c*amt)));
  return "#"+(((f(n>>16)<<16)|(f((n>>8)&255)<<8)|f(n&255)).toString(16).padStart(6,"0"));
};

function usePersist(key,init){
  const [val,setRaw]=useState(()=>store.get(key,init));
  const set=useCallback(v=>setRaw(prev=>{
    const next=typeof v==="function"?v(prev):v;
    store.set(key,next);return next;
  }),[key]);
  return [val,set];
}

// true when signed in to a Pro account; re-renders on c_account_changed
function useProState(){
  const [pro,setPro]=useState(()=>!!store.get("c_account",null)?.token);
  useEffect(()=>{
    const sync=()=>setPro(!!store.get("c_account",null)?.token);
    window.addEventListener("c_account_changed",sync);
    return()=>window.removeEventListener("c_account_changed",sync);
  },[]);
  return pro;
}

function useTick(cb,ms){
  const r=useRef(cb);
  useEffect(()=>{r.current=cb;},[cb]);
  useEffect(()=>{
    if(ms===null)return;
    const id=setInterval(()=>r.current(),ms);
    return()=>clearInterval(id);
  },[ms]);
}

const ts=()=>new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const ds=()=>new Date().toLocaleDateString([],{month:"short",day:"numeric"});

// Notifications — timers must reach the user even when the tab is in the background
const canNotify=()=>typeof Notification!=="undefined";
const askNotify=()=>{if(canNotify()&&Notification.permission==="default")Notification.requestPermission();};
let titleFlash=null;
function notify(title,body){
  if(canNotify()&&Notification.permission==="granted"){try{new Notification(title,{body});}catch{}}
  if(titleFlash)clearInterval(titleFlash);
  const orig="Silo";let on=false,n=0;
  titleFlash=setInterval(()=>{
    document.title=on?orig:`⏰ ${title}`;on=!on;
    if(++n>=10){clearInterval(titleFlash);titleFlash=null;document.title=orig;}
  },1000);
}

const inp={
  background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,
  padding:"10px 14px",color:P.text,fontSize:13,outline:"none",
  fontFamily:FONT,width:"100%",transition:"border-color 0.15s",
};

function Btn({onClick,children,full,sm,ghost,danger,loading,disabled}){
  return(
    <button style={{
      padding:sm?"7px 14px":"10px 22px",borderRadius:10,
      border:ghost?`1px solid ${danger?P.p30:P.borderHi}`:"none",
      background:ghost?"transparent":danger?`linear-gradient(135deg,${P.p20},${P.p30})`:`linear-gradient(135deg,${P.p30},${P.p50})`,
      color:ghost?(danger?P.p50:P.p60):P.text,
      fontWeight:600,fontSize:sm?12:13,cursor:disabled||loading?"default":"pointer",
      width:full?"100%":"auto",fontFamily:FONT,letterSpacing:0.2,
      opacity:disabled||loading?0.45:1,transition:"opacity 0.15s",
      display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,
    }} onClick={onClick} disabled={disabled||loading}>{loading?"···":children}</button>
  );
}

function Tag({children,active,onClick,danger}){
  return(
    <button onClick={onClick} style={{
      padding:"4px 11px",borderRadius:999,fontFamily:FONT,
      border:`1px solid ${active?(danger?P.p30:P.p40):P.border}`,
      background:active?(danger?P.p10:P.lift):"none",
      color:active?(danger?P.p60:P.p70):P.muted,
      fontSize:12,fontWeight:600,cursor:"pointer",
    }}>{children}</button>
  );
}

function Lbl({children}){
  return <div style={{fontSize:10,fontWeight:800,letterSpacing:2,color:P.p50,marginBottom:8,textTransform:"uppercase"}}>{children}</div>;
}

function Divider(){return <div style={{height:1,background:P.border,margin:"12px 0"}}/>;}

function Card({children,style}){
  return <div style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:14,...style}}>{children}</div>;
}

function Pill({label,color}){
  const c=color||P.p40;
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",padding:"2px 8px",borderRadius:999,background:c+"22",border:`1px solid ${c}55`,color:c}}>{label}</span>;
}

// Pricing — single source of truth for all in-app copy. Change the price here
// (and the matching numbers in index.html) if it ever moves.
const PRICE_LIFETIME="$24.99";
const PRICE_SUB="$7.99/mo";
const TRIAL_DAYS=14;

// TODO before launch: replace with the real Lemon Squeezy checkout links
// (also the buy buttons in index.html — see DEPLOY.md)
const BUY_URL="https://getsilo.lemonsqueezy.com/checkout/buy/ca34f727-1bae-4b11-a844-e36cbe319ec9";
const BUY_URL_SUB="https://getsilo.lemonsqueezy.com/checkout/buy/45c5575e-e818-4585-b1ca-e366404b9c78";

async function claude(prompt,system,maxTokens=300){
  const body={model:"claude-sonnet-4-6",max_tokens:maxTokens,messages:[{role:"user",content:prompt}]};
  if(system)body.system=system;
  const headers={"Content-Type":"application/json"};
  const acct=store.get("c_account",null);
  if(acct?.token)headers["Authorization"]=`Bearer ${acct.token}`;
  try{
    const r=await fetch("/api/claude",{method:"POST",headers,body:JSON.stringify(body)});
    if(r.status===402){
      window.dispatchEvent(new Event("c_pro_needed"));
      return "✦ AI is part of Silo Pro — one payment, every tool + AI, yours forever. Tap the ✦ Pro button in the top bar to get started or sign in.";
    }
    if(r.status===401){
      window.dispatchEvent(new Event("c_pro_needed"));
      return "Your session expired — tap ✦ Pro in the top bar and sign in again. Nothing was lost.";
    }
    if(r.status===429){
      return "You've hit today's AI limit — it resets at midnight UTC. Everything else keeps working.";
    }
    const d=await r.json();
    return d.content?.find(b=>b.type==="text")?.text||"";
  }catch{
    return "(Couldn't reach the AI just now — your work is safe, try again in a moment.)";
  }
}

const PANELS=[
  {id:"capture",   glyph:"✦",label:"Capture",     sub:"Catch the thought before it's gone — one keystroke, anywhere"},
  {id:"timer",     glyph:"◷",label:"Focus Timer",  sub:"Kind sprints, real breaks, progress bars that fill"},
  {id:"tasks",     glyph:"◈",label:"Tasks",        sub:"AI turns \"too big to start\" into a 2-minute first step"},
  {id:"body",      glyph:"◬",label:"Body Check",   sub:"Hunger, thirst, tension, hyperfocus — catch them early",pro:true},
  {id:"sound",     glyph:"♫",label:"Sound",        sub:"Noise tuned to how ADHD brains actually focus"},
  {id:"routines",  glyph:"◫",label:"Routines",     sub:"Autopilot for mornings, resets & shutdowns",pro:true},
  {id:"double",    glyph:"◍",label:"Body Double",  sub:"A companion beside you — tasks feel lighter with company"},
  {id:"novelty",   glyph:"✳",label:"Novelty",      sub:"Trick a bored brain into starting",pro:true},
  {id:"async",     glyph:"⟳",label:"Follow-Ups",   sub:"Track everything you're waiting on someone else for",pro:true},
  {id:"emotion",   glyph:"❋",label:"Check-In",     sub:"Name the feeling, set your intention"},
  {id:"discipline",glyph:"⬡",label:"Discipline",   sub:"Keep promises to yourself — kindly",pro:true},
  {id:"friction",  glyph:"◒",label:"Friction Slider",sub:"Low battery, normal, hyperfocused — no guilt either way"},
  {id:"activity",  glyph:"⟡",label:"One Thing",sub:"One suggestion, sized to the time you actually have",pro:true},
  {id:"parking",   glyph:"⛁",label:"Parking Lot",  sub:"Drop it and keep moving — daily review, nothing to file"},
];
// old panel ids that merged into new ones (kept so saved sessions still open)
const PANEL_ALIASES={memory:"capture",timeviz:"timer",brain:"capture",bilateral:"sound",hfc:"body",progress:"timer",intention:"emotion"};

const ENERGIES=[
  {id:"crashed",label:"Crashed",e:"💀",c:P.p20},
  {id:"low",    label:"Low",    e:"🌧", c:P.p30},
  {id:"steady", label:"Steady", e:"⛅", c:P.p40},
  {id:"on",     label:"On",     e:"☀",  c:P.p50},
  {id:"hyper",  label:"Hyper",  e:"⚡", c:P.p60},
];

// ── CAPTURE (merged with Memory Net) ─────────────────────────
const MEM_PROMPTS=["What was I just about to say?","What did I open this for?","What was the point I was making?","Where was I in this task?","What did I just decide?","That word I needed…"];

// Suggests which Life Library notebook a capture belongs in — Pro only.
async function suggestLibrarySpot(text,notebooks){
  const labels=notebooks.map(n=>n.label).join(", ");
  const r=await claude(`Someone captured this note for their personal "Life Library" (categories: ${labels}). Note: "${text}"\n\nWhich ONE category fits best? Reply with ONLY the exact category name from the list, nothing else.`,null,20);
  return notebooks.find(n=>n.label.toLowerCase()===r.trim().toLowerCase().replace(/[."]/g,""))?.id||null;
}

function LibraryAssignPrompt({item,nbs,onFile,onDismiss}){
  const [suggested,setSuggested]=useState(null);
  const [suggesting,setSuggesting]=useState(false);
  const suggest=async()=>{setSuggesting(true);setSuggested(await suggestLibrarySpot(item.text,nbs));setSuggesting(false);};
  return(
    <Card style={{padding:12,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
        <Lbl>File in Life Library?</Lbl>
        <button onClick={onDismiss} style={{marginLeft:"auto",background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:9}}>
        {nbs.map(n=>(
          <Tag key={n.id} active={suggested===n.id} onClick={()=>onFile(n.id)}>{n.icon} {n.label}</Tag>
        ))}
      </div>
      <Btn onClick={suggest} sm ghost loading={suggesting}>✦ AI suggest</Btn>
    </Card>
  );
}

function CapturePanel({onTask}){
  const pro=useProState();
  const [text,set]=useState("");
  const [items,setItems]=usePersist("c_cap",[]);
  const [nbs,setNbs]=usePersist("c_nbs",DEFAULT_NBS);
  const [assignFor,setAssignFor]=useState(null);
  const [tab,setTab]=useState("drop");
  const [ctx,setCtx]=useState("");
  const [loading,setLoad]=useState(false);
  const [aiReply,setReply]=useState("");
  const ref=useRef();
  const fileInto=(nbId,itemText)=>{
    setNbs(p=>p.map(n=>n.id===nbId?{...n,pages:[...(n.pages||[]),{id:Date.now(),title:itemText.slice(0,40),content:itemText,created:ds()}]}:n));
    setAssignFor(null);
  };
  useEffect(()=>{if(tab==="drop")ref.current?.focus();},[tab]);
  // one-time migration: fold old Memory Net entries into this store
  useEffect(()=>{
    const old=store.get("c_mem",[]);
    if(old.length){setItems(p=>[...old.map(n=>({ts:ts(),...n})),...p]);store.set("c_mem",[]);}
  },[]);
  // quick-capture overlay writes to c_cap directly — re-read when it signals
  useEffect(()=>{
    const sync=()=>setItems(store.get("c_cap",[]));
    window.addEventListener("c_cap_sync",sync);
    return()=>window.removeEventListener("c_cap_sync",sync);
  },[]);
  const add=()=>{
    if(!text.trim())return;
    const t=text.trim();
    setItems(p=>[{id:Date.now(),text:t,ts:ts(),date:ds(),pinned:false},...p]);
    if(pro)setAssignFor({text:t});
    set("");ref.current?.focus();
  };
  const recover=async()=>{
    if(!text.trim())return;setLoad(true);setReply("");
    const r=await claude(`Someone with ADHD just lost their train of thought. Fragments: "${text}". Context: "${ctx||"not given"}". Help them recover — give 2-3 short possibilities of where that thought was going. Warm, specific, under 80 words. Plain text.`,null,200);
    setReply(r);setItems(p=>[{id:Date.now(),text:`🔍 Recovery: "${text}"`,ts:ts(),date:ds(),pinned:false},...p]);setLoad(false);
  };
  const pin=id=>setItems(p=>p.map(n=>n.id===id?{...n,pinned:!n.pinned}:n));
  const del=id=>setItems(p=>p.filter(n=>n.id!==id));
  const [dumpText,setDump]=usePersist("c_brain","");
  const [aiSort,setAiSort]=useState("");
  const [sorting,setSorting]=useState(false);
  // one-time migration: fold old Brain Dump staging entries into this store
  useEffect(()=>{
    const old=store.get("c_brain_s",[]);
    if(old.length){setItems(p=>[...old.map(n=>({date:ds(),pinned:false,...n})),...p]);store.set("c_brain_s",[]);}
  },[]);
  const saveDump=()=>{
    if(!dumpText.trim())return;
    const t=dumpText.trim();
    setItems(p=>[{id:Date.now(),text:t,ts:ts(),date:ds(),pinned:false},...p]);
    if(pro)setAssignFor({text:t});
    setDump("");
  };
  const aiOrg=async()=>{
    if(!dumpText.trim())return;setSorting(true);
    const r=await claude(`Gently organize this brain dump: 1) Things to do 2) Things to remember 3) Feelings to acknowledge. Be brief, kind, plain text bullets.\n\n"${dumpText}"`,null,300);
    setAiSort(r);setSorting(false);
  };
  const Row=({it,lifted})=>(
    <div style={{display:"flex",alignItems:"center",gap:8,background:lifted?P.lift:P.surface,border:`1px solid ${lifted?P.borderHi:P.border}`,borderRadius:10,padding:"8px 12px"}}>
      {it.ts&&<span style={{fontSize:10,color:P.muted,whiteSpace:"nowrap"}}>{it.ts}</span>}
      <span style={{flex:1,fontSize:12,color:lifted?P.p60:P.text,lineHeight:1.4}}>{it.text}</span>
      <button onClick={()=>{onTask(it.text);del(it.id);}} style={{background:"none",border:"none",color:P.p50,cursor:"pointer",fontSize:12,fontFamily:FONT,whiteSpace:"nowrap"}}>→ task</button>
      <button onClick={()=>pin(it.id)} style={{background:"none",border:"none",color:it.pinned?P.p40:P.muted,cursor:"pointer",fontSize:12}}>📌</button>
      <button onClick={()=>del(it.id)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
    </div>
  );
  const pinned=items.filter(n=>n.pinned);const recent=items.filter(n=>!n.pinned);
  return(
    <div>
      <Lbl>Capture</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:10}}>Anything. One word. Half a thought. Get it out before it's gone — AI can help piece it back.</p>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {[["drop","Drop It"],["dump","Brain Dump"],["recover","AI Recover"],["log","Log"]].map(([id,lab])=><Tag key={id} active={tab===id} onClick={()=>setTab(id)}>{lab}</Tag>)}
      </div>
      {tab==="drop"&&(<>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <input ref={ref} value={text} onChange={e=>set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
            placeholder="type anything & hit Enter…" style={inp}
            onFocus={e=>e.target.style.borderColor=P.borderHi} onBlur={e=>e.target.style.borderColor=P.border}/>
          <Btn onClick={add} sm>+</Btn>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>{MEM_PROMPTS.map(q=><Tag key={q} onClick={()=>set(q)}>{q}</Tag>)}</div>
        {assignFor&&<LibraryAssignPrompt item={assignFor} nbs={nbs} onFile={id=>fileInto(id,assignFor.text)} onDismiss={()=>setAssignFor(null)}/>}
        {pinned.length>0&&(<div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
          <Lbl>📌 Pinned</Lbl>
          {pinned.map(it=><Row key={it.id} it={it} lifted/>)}
        </div>)}
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:220,overflowY:"auto"}}>
          {recent.length===0&&<p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"20px 0"}}>Nothing yet.</p>}
          {recent.map(it=><Row key={it.id} it={it}/>)}
        </div>
      </>)}
      {tab==="dump"&&(<>
        <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:10}}>No structure. No judgment. Get it all out.</p>
        <textarea value={dumpText} onChange={e=>setDump(e.target.value)} onKeyDown={e=>e.key==="Enter"&&e.ctrlKey&&saveDump()}
          placeholder={"What's in your head right now?\n\nCtrl+Enter to save."} rows={6}
          style={{...inp,resize:"none",lineHeight:1.7,marginBottom:8}}/>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          <Btn onClick={saveDump} full>Save to log</Btn>
          <Btn onClick={aiOrg} ghost loading={sorting} sm>✦ Sort it</Btn>
        </div>
        {aiSort&&(
          <Card style={{padding:14,marginBottom:12}}>
            <Lbl>AI organized</Lbl>
            <p style={{fontSize:12,color:P.textSub,lineHeight:1.8,whiteSpace:"pre-line"}}>{aiSort}</p>
            <button onClick={()=>setAiSort("")} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:12,marginTop:8,fontFamily:FONT}}>dismiss</button>
          </Card>
        )}
        {assignFor&&<LibraryAssignPrompt item={assignFor} nbs={nbs} onFile={id=>fileInto(id,assignFor.text)} onDismiss={()=>setAssignFor(null)}/>}
      </>)}
      {tab==="recover"&&(<>
        <p style={{fontSize:12,color:P.muted,lineHeight:1.5,marginBottom:12}}>Lost mid-sentence? Give any fragments — keywords, half-words, even the feeling of the thought.</p>
        <Lbl>Fragments / keywords</Lbl>
        <input value={text} onChange={e=>set(e.target.value)} placeholder="e.g. something urgent, tuesday, email thing…" style={{...inp,marginBottom:10}}/>
        <Lbl>What were you doing?</Lbl>
        <input value={ctx} onChange={e=>setCtx(e.target.value)} placeholder="e.g. mid-conversation, writing a message…" style={{...inp,marginBottom:14}}/>
        <Btn onClick={recover} full loading={loading}>✦ Recover my thought</Btn>
        {aiReply&&(
          <Card style={{padding:14,marginTop:14}}>
            <Lbl>Possible directions</Lbl>
            <p style={{fontSize:13,color:P.text,lineHeight:1.8}}>{aiReply}</p>
            <button onClick={()=>{setItems(p=>[{id:Date.now(),text:aiReply,ts:ts(),date:ds(),pinned:true},...p]);setReply("");}} style={{marginTop:10,background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.p50,fontSize:12,cursor:"pointer",padding:"4px 10px",fontFamily:FONT}}>📌 Pin this</button>
          </Card>
        )}
      </>)}
      {tab==="log"&&(<>
        <div style={{maxHeight:300,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
          {items.length===0&&<p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"24px 0"}}>Nothing yet.</p>}
          {items.map(n=>(
            <div key={n.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:"9px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:10,color:P.muted}}>{n.date} {n.ts}</span>
                {n.pinned&&<Pill label="pinned"/>}
              </div>
              <p style={{fontSize:12,color:P.text,lineHeight:1.4}}>{n.text}</p>
            </div>
          ))}
        </div>
        {items.length>0&&<button onClick={()=>setItems([])} style={{marginTop:10,background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.muted,fontSize:11,cursor:"pointer",padding:"4px 10px",fontFamily:FONT}}>Clear all</button>}
      </>)}
    </div>
  );
}

// ── TIMER ──────────────────────────────────────────────
const EX=[
  {e:"🦵",n:"10 Squats",       i:"Stand up — 10 squats to unlock your break.",c:10},
  {e:"💪",n:"10 Push-ups",     i:"Drop and give me ten.",                      c:10},
  {e:"⭐",n:"20 Jumping Jacks",i:"20 jacks — get that heart rate up.",          c:20},
  {e:"🧘",n:"5 Deep Breaths",  i:"In 4, hold 4, out 4 — five full cycles.",     c:5 },
  {e:"🚶",n:"Walk in place",   i:"March in place for 30 seconds.",              c:30},
  {e:"🤸",n:"10 Stretches",    i:"Roll shoulders, neck, wrists — 10 total.",    c:10},
];

function TimerPanel(){
  const [mins,setMins]=useState(25);
  const [left,setLeft]=useState(25*60);
  const [run,setRun]=useState(false);
  const [mode,setMode]=useState("work");
  const [ex,setEx]=useState(null);
  const [rep,setRep]=useState(0);
  const [sess,setSess]=usePersist("c_sess",0);
  const [todayMin,setTM]=usePersist("c_todaytime",0);

  useTick(()=>{
    if(!run||mode==="ex")return;
    setLeft(t=>{
      if(t<=1){
        setRun(false);
        if(mode==="work"){
          const e=EX[Math.floor(Math.random()*EX.length)];
          setEx(e);setRep(0);setMode("ex");setSess(s=>s+1);setTM(t=>t+mins);
          notify("Focus session done","Time to move — quick exercise break.");
        } else {setMode("work");setLeft(mins*60);notify("Break over","Ready for another focus round?");}
        return 0;
      }
      return t-1;
    });
  },run?1000:null);

  const tap=()=>{const n=rep+1;setRep(n);if(n>=(ex?.c||10)){setEx(null);setMode("break");setLeft(5*60);setRun(true);}};
  const m=String(Math.floor(left/60)).padStart(2,"0");
  const s=String(left%60).padStart(2,"0");
  const R=60,circ=2*Math.PI*R;
  const prog=mode==="ex"?(rep/(ex?.c||1)):Math.max(0,1-(left/(mins*60)));
  const col=mode==="ex"?P.p60:mode==="break"?P.p50:P.p40;

  return(
    <div>
      <Lbl>Focus timer</Lbl>
      {mode==="ex"&&ex?(
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{fontSize:52,marginBottom:10}}>{ex.e}</div>
          <p style={{fontSize:16,fontWeight:700,color:P.p60,marginBottom:6}}>{ex.n}</p>
          <p style={{fontSize:12,color:P.textSub,marginBottom:16,lineHeight:1.5}}>{ex.i}</p>
          <div style={{fontSize:42,fontWeight:800,color:P.p70,letterSpacing:-2,marginBottom:16}}>{ex.c-rep}</div>
          <div style={{display:"flex",gap:3,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
            {Array.from({length:ex.c}).map((_,i)=>(
              <div key={i} style={{width:9,height:9,borderRadius:"50%",background:i<rep?P.p50:P.dim,boxShadow:i<rep?`0 0 6px ${P.p40}`:"none",transition:"all 0.2s"}}/>
            ))}
          </div>
          <Btn onClick={tap} full>Tap for each rep ✓</Btn>
        </div>
      ):(
        <>
          <div style={{display:"flex",gap:5,marginBottom:16}}>
            {[10,15,25,50].map(p=>(
              <button key={p} onClick={()=>{setMins(p);setLeft(p*60);setRun(false);setMode("work");}} style={{flex:1,padding:"7px 4px",borderRadius:9,border:`1px solid ${mins===p?col:P.border}`,background:mins===p?P.lift:"none",color:mins===p?P.p60:P.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>{p}m</button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
            <div style={{position:"relative",width:148,height:148}}>
              <svg width="148" height="148" style={{transform:"rotate(-90deg)"}}>
                <circle cx="74" cy="74" r={R} fill="none" stroke={P.dim} strokeWidth="6"/>
                <circle cx="74" cy="74" r={R} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ*(1-Math.min(prog,1))}
                  style={{transition:"stroke-dashoffset 1s linear",filter:`drop-shadow(0 0 8px ${col})`}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:32,fontWeight:800,color:P.text,letterSpacing:-2,lineHeight:1}}>{m}:{s}</div>
                <div style={{fontSize:10,color:P.muted,textTransform:"uppercase",letterSpacing:2,marginTop:4}}>{mode==="break"?"break":"focus"}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,width:"100%"}}>
              <button onClick={()=>{askNotify();setRun(r=>!r);}} style={{flex:1,padding:"12px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${P.p30},${P.p50})`,color:P.text,fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:`0 4px 24px ${P.glow}`,fontFamily:FONT}}>{run?"Pause":"Start"}</button>
              <button onClick={()=>{setRun(false);setMode("work");setLeft(mins*60);}} style={{padding:"12px 14px",borderRadius:11,border:`1px solid ${P.border}`,background:"none",color:P.muted,fontSize:14,cursor:"pointer"}}>↺</button>
            </div>
            {sess>0&&(
              <div style={{textAlign:"center"}}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center",marginBottom:4}}>
                  {Array.from({length:Math.min(sess,8)}).map((_,i)=>(
                    <div key={i} style={{width:8,height:8,borderRadius:"50%",background:P.p40,boxShadow:`0 0 6px ${P.p40}`}}/>
                  ))}
                </div>
                <p style={{fontSize:11,color:P.muted}}>{sess} session{sess!==1?"s":""} · {todayMin} min today</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── TASKS ──────────────────────────────────────────────
const INIT_TASKS=[
  {id:1,text:"Take medication",done:false,priority:"high",energy:"low",chunks:["Get water","Find meds","Take them"],cd:[],rs:0},
  {id:2,text:"Review emails",  done:false,priority:"high",energy:"steady",chunks:["Open inbox","Flag urgent","Quick replies"],cd:[],rs:0},
];

async function chunkTask(text){
  const raw=await claude(`Break this task into 3-6 micro-steps for someone with ADHD. Each step: 1-3 min, concrete, specific. Return ONLY a JSON array of strings.\n\nTask: "${text}"`,null,400);
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}

function TasksPanel({tasks,setTasks,energy}){
  const [filter,setFilter]=useState("active");
  const [newT,setNewT]=useState("");
  const [exp,setExp]=useState(null);
  const [rs,setRs]=useState(null);
  const [ck,setCk]=useState(null);
  const eMap={crashed:["low"],low:["low"],steady:["low","medium","high"],on:["medium","high"],hyper:["high"]};
  const visible=tasks.filter(t=>filter==="done"?t.done:filter==="match"?(eMap[energy]?.includes(t.energy)&&!t.done):!t.done);
  const add=()=>{if(!newT.trim())return;setTasks(p=>[...p,{id:Date.now(),text:newT.trim(),done:false,priority:"medium",energy:"steady",chunks:[newT.trim()],cd:[],rs:0}]);setNewT("");};
  const doChunk=async t=>{setCk(t.id);try{const ch=await chunkTask(t.text);setTasks(p=>p.map(x=>x.id===t.id?{...x,chunks:ch,cd:[]}:x));}catch(e){}finally{setCk(null);}};
  const toggleCh=(tid,ch)=>setTasks(p=>p.map(t=>{if(t.id!==tid)return t;const done=t.cd.includes(ch)?t.cd.filter(c=>c!==ch):[...t.cd,ch];return{...t,cd:done,done:done.length===t.chunks.length};}));
  const resch=(id,w)=>{setTasks(p=>p.map(t=>t.id===id?{...t,rs:t.rs+1,rsTo:w}:t));setRs(null);};
  const pc=p=>p==="high"?P.p60:p==="medium"?P.p50:P.p40;
  return(
    <div>
      <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
        {[["active","All"],["match","⚡ My energy"],["done","Done"]].map(([id,lab])=>(
          <Tag key={id} active={filter===id} onClick={()=>setFilter(id)}>{lab}</Tag>
        ))}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <input value={newT} onChange={e=>setNewT(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="New task…" style={inp} onFocus={e=>e.target.style.borderColor=P.borderHi} onBlur={e=>e.target.style.borderColor=P.border}/>
        <Btn onClick={add} sm>+</Btn>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:320,overflowY:"auto"}}>
        {visible.length===0&&<p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"20px 0"}}>Nothing here.</p>}
        {visible.map(task=>{
          const open=exp===task.id;
          const pct=task.chunks.length?task.cd.length/task.chunks.length:0;
          return(
            <div key={task.id} style={{background:P.surface,border:`1px solid ${task.done?P.border:pc(task.priority)+"55"}`,borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 13px",cursor:"pointer"}} onClick={()=>setExp(open?null:task.id)}>
                <div style={{width:16,height:16,borderRadius:5,flexShrink:0,border:`1.5px solid ${task.done?P.p50:pc(task.priority)}`,background:task.done?P.p30:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();toggleCh(task.id,task.chunks[task.cd.length]||task.chunks[0]);}}>
                  {task.done&&<span style={{fontSize:10,color:P.text}}>✓</span>}
                </div>
                <span style={{flex:1,fontSize:13,color:task.done?P.muted:P.text,textDecoration:task.done?"line-through":"none",lineHeight:1.3}}>{task.text}</span>
                {task.rs>0&&<span style={{fontSize:10,color:P.p40}}>↷{task.rs}</span>}
                <div style={{width:32,height:2,borderRadius:999,background:P.dim,overflow:"hidden"}}><div style={{height:"100%",width:`${pct*100}%`,background:P.p50,transition:"width 0.3s"}}/></div>
                <span style={{fontSize:11,color:P.muted}}>{open?"▴":"▾"}</span>
              </div>
              {open&&(
                <div style={{padding:"0 13px 12px",borderTop:`1px solid ${P.border}`}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10,marginBottom:8}}>
                    <Lbl>Steps</Lbl>
                    <Btn onClick={()=>doChunk(task)} sm loading={ck===task.id}>✦ AI break down</Btn>
                  </div>
                  {task.chunks.map((ch,i)=>(
                    <div key={i} onClick={()=>toggleCh(task.id,ch)} style={{display:"flex",alignItems:"center",gap:9,padding:"5px 0",cursor:"pointer"}}>
                      <div style={{width:13,height:13,borderRadius:4,flexShrink:0,border:`1.5px solid ${task.cd.includes(ch)?P.p50:P.dim}`,background:task.cd.includes(ch)?P.p30:"none",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                        {task.cd.includes(ch)&&<span style={{fontSize:8,color:P.text}}>✓</span>}
                      </div>
                      <span style={{fontSize:12,lineHeight:1.4,color:task.cd.includes(ch)?P.muted:P.textSub,textDecoration:task.cd.includes(ch)?"line-through":"none"}}>{ch}</span>
                    </div>
                  ))}
                  <Divider/>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <Tag onClick={()=>setRs(rs===task.id?null:task.id)}>↷ Reschedule</Tag>
                    <Tag onClick={()=>setTasks(p=>p.filter(t=>t.id!==task.id))} danger>Remove</Tag>
                  </div>
                  {rs===task.id&&(
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:10}}>
                      {["Later today","Tomorrow","This week","Someday"].map(w=>(
                        <Tag key={w} onClick={()=>resch(task.id,w)}>{w}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BODY CHECK ──────────────────────────────────────────────
const CUES=[
  {icon:"🫁",text:"You may be shallow-breathing. Take one full, slow breath now."},
  {icon:"🪨",text:"Shoulders up by your ears? Drop them. Let your whole body unclench."},
  {icon:"😮‍💨",text:"Jaw tight? Open your mouth slightly, then close soft."},
  {icon:"👀",text:"Blink slowly three times. Your eyes have been working hard."},
  {icon:"🦶",text:"Feel both feet flat on the floor. Let that anchor you."},
  {icon:"🤲",text:"Hands clenched? Open them. Let your palms face up."},
  {icon:"🪑",text:"Are you hunching? Roll your spine tall. Shoulders back, soft."},
  {icon:"💧",text:"When did you last drink water? Go get some if it's been a while."},
  {icon:"😴",text:"Eyelids heavy? A 10-min rest is not failure — it's maintenance."},
  {icon:"🌡",text:"Too hot or cold? Adjust your environment if you can."},
];

function BodyPanel(){
  const [idx,setIdx]=useState(0);
  const [log,setLog]=usePersist("c_body_log",[]);
  const [checked,setCk]=useState(false);
  useTick(()=>setIdx(i=>(i+1)%CUES.length),30000);
  const checkin=()=>{setLog(p=>[{time:ts(),cue:CUES[idx].text},...p.slice(0,9)]);setCk(true);setTimeout(()=>setCk(false),2000);};
  return(
    <div>
      <Lbl>Body mirroring</Lbl>
      <div style={{background:P.lift,border:`1px solid ${P.borderHi}`,borderRadius:16,padding:"20px",textAlign:"center",marginBottom:16,boxShadow:`0 0 32px ${P.glow}`}}>
        <div style={{fontSize:36,marginBottom:12}}>{CUES[idx].icon}</div>
        <p style={{fontSize:14,color:P.text,lineHeight:1.7,fontStyle:"italic"}}>{CUES[idx].text}</p>
        <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:14}}>
          {CUES.map((_,i)=>(
            <div key={i} onClick={()=>setIdx(i)} style={{width:6,height:6,borderRadius:"50%",cursor:"pointer",background:i===idx?P.p50:P.dim,transition:"all 0.2s"}}/>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <Btn onClick={checkin} full>{checked?"✓ Noted":"I did this"}</Btn>
        <button onClick={()=>setIdx(i=>(i+1)%CUES.length)} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${P.border}`,background:"none",color:P.muted,cursor:"pointer",fontSize:13}}>→</button>
      </div>
      {log.length>0&&(<>
        <Divider/>
        <Lbl>Check-in log</Lbl>
        <div style={{maxHeight:130,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
          {log.map((l,i)=>(
            <div key={i} style={{fontSize:12,color:P.muted,padding:"3px 0",borderBottom:`1px solid ${P.dim}`,lineHeight:1.4}}>
              <span style={{color:P.p50}}>{l.time}</span> — {l.cue.slice(0,60)}…
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ── SOUND — research-backed audio for ADHD & executive dysfunction ──
// Evidence tags: "solid" = clinical studies in ADHD populations (stochastic-
// resonance noise work, e.g. Söderlund et al.); "early" = small/mixed studies;
// "loved" = strong community consensus, mechanism plausible, little formal study.
const EV={
  solid:{label:"solid research",c:"#7FB37F"},
  early:{label:"early research",c:"#D4A668"},
  loved:{label:"community favorite",c:"#B05A82"},
};
const SOUND_GOALS=[
  {id:"focus", label:"Focus",   note:"ADHD brains under-fire dopamine; steady moderate noise measurably boosts attention & working memory (stochastic resonance)."},
  {id:"calm",  label:"Calm",    note:"For overwhelm, anxiety, sensory overload — slow rhythms and nature textures downshift the nervous system."},
  {id:"sleep", label:"Sleep",   note:"Low, dark, slow. Masks a busy mind without grabbing attention."},
  {id:"wake",  label:"Energize",note:"For the sluggish, can't-boot-up brain — brighter, pulsing sound raises arousal."},
];
// free-tier taster: the three famous ones — everything else needs Pro
const FREE_SOUNDS=new Set(["white","brown","rain"]);
const SOUND_PRESETS={
  focus:[
    {id:"white",name:"White noise",ev:"solid",desc:"The most-studied option for ADHD focus & memory — steady, bright, masks everything",kind:"noise",type:"white"},
    {id:"brown",name:"Brown noise",ev:"loved",desc:"The ADHD community favorite — same masking, deeper and less hissy",kind:"noise",type:"brown"},
    {id:"pink",name:"Pink noise",ev:"solid",desc:"Between white and brown — studied for concentration and sleep quality",kind:"noise",type:"pink"},
    {id:"cafe",name:"Café bustle",ev:"early",desc:"Moderate background murmur (~70 dB) linked to better creative thinking",kind:"cafe"},
  ],
  calm:[
    {id:"bilateral",name:"Bilateral sweep",ev:"early",desc:"🎧 A soft tone glides ear-to-ear, EMDR-style — many find it settles a racing head",kind:"bilateral",hp:true},
    {id:"rain",name:"Rain",ev:"loved",desc:"Steady rainfall — non-repeating, nothing for your brain to latch onto",kind:"ambient",amb:"rain"},
    {id:"ocean",name:"Ocean waves",ev:"loved",desc:"Slow rolling swells pace your breathing downward",kind:"ambient",amb:"ocean"},
    {id:"alpha",name:"Alpha waves · 10 Hz",ev:"early",desc:"🎧 Binaural beat in the relaxed-alert band — evidence is mixed but some swear by it",kind:"binaural",carrier:180,beat:10,hp:true},
  ],
  sleep:[
    {id:"deepbrown",name:"Deep brown noise",ev:"loved",desc:"Extra-low rumble, like an engine hum three rooms away",kind:"noise",type:"brown",lowpass:400},
    {id:"nightrain",name:"Night rain",ev:"loved",desc:"Softer, darker rain for winding down",kind:"ambient",amb:"rain",lowpass:900},
    {id:"delta",name:"Delta waves · 2.5 Hz",ev:"early",desc:"🎧 Binaural beat in the deep-sleep band for pre-sleep drift",kind:"binaural",carrier:140,beat:2.5,hp:true},
  ],
  wake:[
    {id:"pulse",name:"Beta pulse · 16 Hz",ev:"early",desc:"Isochronic pulse in the alert band — no headphones needed",kind:"iso",freq:320,rate:16},
    {id:"gamma",name:"Gamma waves · 40 Hz",ev:"early",desc:"🎧 Binaural beat studied for cognitive engagement",kind:"binaural",carrier:220,beat:40,hp:true},
    {id:"brightwhite",name:"Bright white noise",ev:"solid",desc:"Crisp full-spectrum noise — arousal-raising and focus-priming",kind:"noise",type:"white",bright:true},
  ],
};

function makeNoiseBuffer(c,type){
  const len=c.sampleRate*2,buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0,last=0;
  for(let i=0;i<len;i++){
    const w=Math.random()*2-1;
    if(type==="white")d[i]=w*0.3;
    else if(type==="brown"){last=(last+0.02*w)/1.02;d[i]=last*3.5;}
    else{ // pink (Paul Kellet)
      b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.96900*b2+w*0.1538520;
      b3=0.86650*b3+w*0.3104856;b4=0.55000*b4+w*0.5329522;b5=-0.7616*b5-w*0.0168980;
      d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;b6=w*0.115926;
    }
  }
  return buf;
}

function SoundPanel(){
  const [goal,setGoal]=usePersist("c_snd_goal","focus");
  const [preset,setPreset]=usePersist("c_snd_preset","brown");
  const [vol,setVol]=usePersist("c_snd_vol",0.5);
  const [run,setRun]=useState(false);
  const ctx=useRef(null);const master=useRef(null);const nodes=useRef([]);
  const stop=useCallback(()=>{
    setRun(false);
    nodes.current.forEach(n=>{try{n.stop?.();}catch{}try{n.disconnect?.();}catch{}});
    nodes.current=[];
    try{ctx.current?.close();}catch{}
    ctx.current=null;
  },[]);
  useEffect(()=>()=>stop(),[stop]);
  useEffect(()=>{if(master.current)master.current.gain.value=vol;},[vol]);
  const start=p=>{
    stop();
    const c=new(window.AudioContext||window.webkitAudioContext)();
    ctx.current=c;
    const g=c.createGain();g.gain.value=vol;g.connect(c.destination);master.current=g;
    const keep=[];
    const noiseInto=(dest,type,lp)=>{
      const s=c.createBufferSource();s.buffer=makeNoiseBuffer(c,type);s.loop=true;
      if(lp){const f=c.createBiquadFilter();f.type="lowpass";f.frequency.value=lp;s.connect(f);f.connect(dest);keep.push(f);}
      else s.connect(dest);
      s.start();keep.push(s);
    };
    if(p.kind==="noise"){
      noiseInto(g,p.type,p.lowpass||(p.bright?null:null));
    } else if(p.kind==="cafe"){
      // murmur: warm filtered noise with two slow uneven wobbles
      const ag=c.createGain();ag.gain.value=0.85;
      const f=c.createBiquadFilter();f.type="lowpass";f.frequency.value=900;
      noiseInto(f,"pink");f.connect(ag);ag.connect(g);
      [[0.13,0.18],[0.31,0.1]].forEach(([fr,amt])=>{
        const l=c.createOscillator(),lg=c.createGain();
        l.frequency.value=fr;lg.gain.value=amt;l.connect(lg);lg.connect(ag.gain);l.start();keep.push(l,lg);
      });
      keep.push(f,ag);
    } else if(p.kind==="ambient"){
      const ag=c.createGain();ag.gain.value=0.9;
      const f=c.createBiquadFilter();
      if(p.amb==="rain"){f.type="lowpass";f.frequency.value=p.lowpass||1400;noiseInto(f,"pink");}
      else{f.type="lowpass";f.frequency.value=600;noiseInto(f,"brown");}
      const l=c.createOscillator(),lg=c.createGain();
      l.frequency.value=p.amb==="ocean"?0.08:0.05;
      lg.gain.value=p.amb==="ocean"?0.45:0.12;
      l.connect(lg);lg.connect(ag.gain);l.start();
      f.connect(ag);ag.connect(g);keep.push(f,ag,l,lg);
    } else if(p.kind==="binaural"){
      [[-1,p.carrier],[1,p.carrier+p.beat]].forEach(([side,fq])=>{
        const o=c.createOscillator(),pan=c.createStereoPanner(),og=c.createGain();
        o.type="sine";o.frequency.value=fq;og.gain.value=0.35;pan.pan.value=side;
        o.connect(og);og.connect(pan);pan.connect(g);o.start();keep.push(o,og,pan);
      });
    } else if(p.kind==="bilateral"){
      const o=c.createOscillator(),og=c.createGain(),pan=c.createStereoPanner();
      o.type="sine";o.frequency.value=200;og.gain.value=0.35;
      const l=c.createOscillator(),lg=c.createGain();
      l.type="sine";l.frequency.value=0.4;lg.gain.value=0.92; // ~2.5s per full sweep
      l.connect(lg);lg.connect(pan.pan);l.start();
      o.connect(og);og.connect(pan);pan.connect(g);o.start();keep.push(o,og,pan,l,lg);
    } else if(p.kind==="iso"){
      const o=c.createOscillator(),og=c.createGain(),tg=c.createGain();
      o.type="sine";o.frequency.value=p.freq;tg.gain.value=0.3;
      og.gain.value=0.5;
      const l=c.createOscillator(),lg=c.createGain();
      l.type="square";l.frequency.value=p.rate;lg.gain.value=0.5;
      l.connect(lg);lg.connect(og.gain);l.start();
      o.connect(og);og.connect(tg);tg.connect(g);o.start();keep.push(o,og,tg,l,lg);
    }
    nodes.current=keep;
    setRun(true);
  };
  const pick=p=>{setPreset(p.id);start(p);};
  const goalDef=SOUND_GOALS.find(x=>x.id===goal);
  const pro=useProState();
  return(
    <div>
      <Lbl>What does your brain need?</Lbl>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
        {SOUND_GOALS.map(x=><Tag key={x.id} active={goal===x.id} onClick={()=>setGoal(x.id)}>{x.label}</Tag>)}
      </div>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:12}}>{goalDef?.note}</p>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
        {(SOUND_PRESETS[goal]||[]).map(p=>{
          const locked=!pro&&!FREE_SOUNDS.has(p.id);
          const active=run&&preset===p.id;
          const ev=EV[p.ev];
          return(
            <button key={p.id} onClick={()=>locked?window.dispatchEvent(new Event("c_pro_needed")):active?stop():pick(p)} style={{
              textAlign:"left",padding:"11px 13px",borderRadius:11,cursor:"pointer",fontFamily:FONT,
              border:`1px solid ${active?P.p40:P.border}`,background:active?P.lift:P.surface,
              boxShadow:active?`0 0 14px ${P.glow}`:"none",transition:"all 0.15s",
              display:"flex",alignItems:"flex-start",gap:10,opacity:locked?0.55:1,
            }}>
              <span style={{fontSize:15,color:active?P.p60:P.p40,width:16,textAlign:"center",marginTop:1}}>{locked?"✦":active?"◼":"▶"}</span>
              <span style={{flex:1}}>
                <span style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:700,color:active?P.p70:P.text}}>{p.name}</span>
                  <Pill label={ev.label} color={ev.c}/>
                  {locked&&<Pill label="✦ pro" color={P.p50}/>}
                </span>
                <span style={{display:"block",fontSize:12,color:P.textSub,marginTop:3,lineHeight:1.5}}>{p.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!pro&&<p style={{fontSize:11,color:P.muted,lineHeight:1.5,marginBottom:12}}>White noise, brown noise and rain are free forever. <span style={{color:P.p50,fontWeight:600}}>Pro unlocks the whole library</span> — along with every other ✦ tool and all the AI, for one {PRICE_LIFETIME} payment (or {PRICE_SUB}). Not per-sound.</p>}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <span style={{fontSize:12,color:P.muted,width:26,fontWeight:600}}>Vol</span>
        <input type="range" min={0} max={1} step={0.05} value={vol} onChange={e=>setVol(+e.target.value)} style={{flex:1,accentColor:P.p40}}/>
        <span style={{fontSize:12,color:P.p50,width:32,textAlign:"right",fontWeight:600}}>{Math.round(vol*100)}%</span>
      </div>
      {run&&<Btn onClick={stop} full sm ghost danger>⏹ Stop sound</Btn>}
    </div>
  );
}

// ── ROUTINES ──────────────────────────────────────────────
const ROUTINES=[
  {id:"morning",name:"Morning Launch",e:"🌅",steps:["Medication","Drink a full glass of water","5 min stretch","Write today's 3 priorities","Open tools, not phone"]},
  {id:"work",   name:"Work Session",  e:"💻",steps:["Close all non-work tabs","Phone face-down","Set timer","Choose ONE task only","Brain dump interrupting thoughts"]},
  {id:"reset",  name:"Reset Break",   e:"🔄",steps:["Stand up from desk","Move body 2 min","Drink water","Bilateral audio 1 min","Name next task before sitting"]},
  {id:"evening",name:"Wind Down",     e:"🌙",steps:["Brain dump tomorrow's worries","Set out tomorrow's items","Screens off 30 min before bed","Name one win today","Phone outside bedroom"]},
  {id:"stuck",  name:"When Stuck",    e:"🧱",steps:["Name what's blocking you — say it aloud","Break into one smaller step","Change your location","Set a 2-min timer just to start","What would a 10% version look like?"]},
  {id:"anxiety",name:"Anxiety Reset", e:"🫧",steps:["4-7-8 breath: in 4, hold 7, out 8","Shake hands for 10 seconds","Name 5 things you can see","Drink water","Write one thing that IS in your control"]},
];

function RoutinesPanel(){
  const [active,setActive]=useState(null);
  const [done,setDone]=usePersist("c_routines",{});
  const toggle=(ri,step)=>{const k=`${ri}-${step}`;setDone(p=>({...p,[k]:!p[k]}));};
  return(
    <div>
      <Lbl>Routine templates</Lbl>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {ROUTINES.map(r=>{
          const done_ct=r.steps.filter(s=>done[`${r.id}-${s}`]).length;
          const open=active===r.id;
          return(
            <div key={r.id} style={{background:P.surface,border:`1px solid ${open?P.borderHi:P.border}`,borderRadius:12,overflow:"hidden",transition:"border-color 0.2s"}}>
              <div onClick={()=>setActive(open?null:r.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",cursor:"pointer"}}>
                <span style={{fontSize:18}}>{r.e}</span>
                <span style={{flex:1,fontSize:13,fontWeight:600,color:P.text}}>{r.name}</span>
                <span style={{fontSize:11,color:P.muted}}>{done_ct}/{r.steps.length}</span>
                <div style={{width:36,height:3,borderRadius:999,background:P.dim,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(done_ct/r.steps.length)*100}%`,background:P.p50,transition:"width 0.3s"}}/>
                </div>
                <span style={{fontSize:11,color:P.muted}}>{open?"▴":"▾"}</span>
              </div>
              {open&&(
                <div style={{padding:"0 13px 12px",borderTop:`1px solid ${P.border}`}}>
                  {r.steps.map((step,i)=>{
                    const k=`${r.id}-${step}`;
                    return(
                      <div key={i} onClick={()=>toggle(r.id,step)} style={{display:"flex",alignItems:"center",gap:9,padding:"6px 0",cursor:"pointer"}}>
                        <div style={{width:15,height:15,borderRadius:5,flexShrink:0,border:`1.5px solid ${done[k]?P.p50:P.dim}`,background:done[k]?P.p30:"none",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                          {done[k]&&<span style={{fontSize:10,color:P.text}}>✓</span>}
                        </div>
                        <span style={{fontSize:12,color:done[k]?P.muted:P.textSub,textDecoration:done[k]?"line-through":"none"}}>{step}</span>
                      </div>
                    );
                  })}
                  {done_ct===r.steps.length&&<div style={{marginTop:10,padding:"8px 12px",background:P.lift,borderRadius:8,fontSize:12,color:P.p60,textAlign:"center"}}>✨ Complete</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DATA — backup export / import ─────────────────────
function DataMenu(){
  const [open,setOpen]=useState(false);
  const [msg,setMsg]=useState("");
  const fileRef=useRef(null);
  const doExport=()=>{
    const data={};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith("c_"))data[k]=localStorage.getItem(k);}
    const blob=new Blob([JSON.stringify({app:"silo",exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`silo-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();URL.revokeObjectURL(a.href);
    setMsg("Saved to your downloads ✓");
  };
  const doImport=e=>{
    const f=e.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const j=JSON.parse(r.result);
        if(j?.app!=="silo"||typeof j.data!=="object"||!j.data)throw 0;
        if(!confirm("Importing replaces this browser's Silo data with the backup. Continue?"))return;
        Object.entries(j.data).forEach(([k,v])=>{if(k.startsWith("c_")&&typeof v==="string")localStorage.setItem(k,v);});
        location.reload();
      }catch{setMsg("That file doesn't look like a Silo backup.");}
    };
    r.readAsText(f);
    e.target.value="";
  };
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>{setOpen(o=>!o);setMsg("");}} style={{padding:"7px 14px",borderRadius:10,border:`1px solid ${P.border}`,background:"none",color:P.p50,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>⛃ Data</button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:60,background:P.card,border:`1px solid ${P.borderHi}`,borderRadius:12,padding:14,width:230,boxShadow:"0 12px 32px rgba(0,0,0,0.5)"}}>
          <Lbl>Your data</Lbl>
          <p style={{fontSize:11,color:P.muted,lineHeight:1.5,marginBottom:10}}>Everything lives in this browser. Download a backup so clearing your cache can't take it.</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <Btn sm full onClick={doExport}>⇩ Export backup</Btn>
            <Btn sm full ghost onClick={()=>fileRef.current?.click()}>⇧ Import backup</Btn>
          </div>
          {msg&&<p style={{fontSize:11,color:P.p60,marginTop:8}}>{msg}</p>}
          <input ref={fileRef} type="file" accept="application/json,.json" style={{display:"none"}} onChange={doImport}/>
        </div>
      )}
    </div>
  );
}

// ── PRO / ACCOUNT ──
// Accounts only gate the AI (it costs money per message); all app data stays
// in this browser either way.
function ProMenu(){
  const [open,setOpen]=useState(false);
  const [acct,setAcct]=usePersist("c_account",null);
  const [mode,setMode]=useState("signin"); // signin | signup
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const pro=!!acct?.token;
  // an AI feature just hit the paywall — open this menu so the path forward is obvious
  useEffect(()=>{
    const wake=()=>setOpen(true);
    const sync=()=>setAcct(store.get("c_account",null));
    window.addEventListener("c_pro_needed",wake);
    window.addEventListener("c_account_changed",sync);
    return()=>{window.removeEventListener("c_pro_needed",wake);window.removeEventListener("c_account_changed",sync);};
  },[]);
  const submit=async()=>{
    if(busy)return;
    setBusy(true);setMsg("");
    try{
      const r=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:mode,email,password:pass})});
      const d=await r.json();
      if(d.ok){setAcct({email:d.email||email.trim().toLowerCase(),token:d.token,ts:Date.now()});setEmail("");setPass("");setMsg("✦ Pro unlocked. Enjoy.");window.dispatchEvent(new Event("c_account_changed"));}
      else setMsg(d.reason||"That didn't work — try again.");
    }catch{setMsg("Couldn't reach the server — try again in a minute.");}
    setBusy(false);
  };
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>{setOpen(o=>!o);setMsg("");}} style={{padding:"7px 14px",borderRadius:10,border:`1px solid ${pro?P.p40:P.border}`,background:pro?P.lift:"none",color:pro?P.p60:P.p50,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT,boxShadow:pro?`0 0 10px ${P.glow}`:"none"}}>✦ Pro</button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:60,background:P.card,border:`1px solid ${P.borderHi}`,borderRadius:12,padding:14,width:260,boxShadow:"0 12px 32px rgba(0,0,0,0.5)"}}>
          {pro?(<>
            <Lbl>✦ Pro active</Lbl>
            <p style={{fontSize:11,color:P.muted,lineHeight:1.5,marginBottom:10}}>Signed in as <span style={{color:P.p60}}>{acct.email||"your account"}</span>. AI unlocked — your tasks and notes still live only in this browser.</p>
            <Btn sm full ghost onClick={()=>{if(confirm("Sign out on this browser? Your data stays — Pro tools and AI lock until you sign back in.")){setAcct(null);window.dispatchEvent(new Event("c_account_changed"));}}}>Sign out</Btn>
          </>):(<>
            <Lbl>✦ Silo Pro</Lbl>
            <p style={{fontSize:11,color:P.muted,lineHeight:1.5,marginBottom:10}}>One payment unlocks everything — not per tool: Body Check, Routines, Novelty, Follow-Ups, Discipline, the full sound library, your companion's live AI voice, and every AI feature.</p>
            <Btn sm full onClick={()=>window.open(BUY_URL,"_blank")}>Get Pro — {PRICE_LIFETIME} once</Btn>
            <button onClick={()=>window.open(BUY_URL_SUB,"_blank")} style={{display:"block",width:"100%",textAlign:"center",background:"none",border:"none",color:P.p50,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:FONT,marginTop:8,padding:0}}>or try {TRIAL_DAYS} days free, then {PRICE_SUB}</button>
            <p style={{fontSize:10,color:P.muted,marginTop:8,marginBottom:10}}>Then come back and create your account with the same email you used at checkout.</p>
            <div style={{height:1,background:P.border,margin:"2px 0 12px"}}/>
            <div style={{display:"flex",gap:4,marginBottom:10}}>
              <Tag active={mode==="signin"} onClick={()=>{setMode("signin");setMsg("");}}>Sign in</Tag>
              <Tag active={mode==="signup"} onClick={()=>{setMode("signup");setMsg("");}}>Create account</Tag>
            </div>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email"
              placeholder="email from your receipt…" style={{...inp,fontSize:12,padding:"8px 10px",marginBottom:6}}/>
            <input value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} type="password"
              autoComplete={mode==="signup"?"new-password":"current-password"}
              placeholder={mode==="signup"?"choose a password (8+ chars)…":"password…"} style={{...inp,fontSize:12,padding:"8px 10px",marginBottom:6}}/>
            <Btn sm full ghost loading={busy} onClick={submit}>{mode==="signup"?"Create account":"Sign in"}</Btn>
          </>)}
          {msg&&<p style={{fontSize:11,color:P.p60,marginTop:8}}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ── HFC ──────────────────────────────────────────────
function HFCPanel(){
  const [checks,setChecks]=useState([
    {id:1,q:"Sitting more than 2 hours?",a:false},
    {id:2,q:"Haven't drunk water recently?",a:false},
    {id:3,q:"Last meal more than 4 hours ago?",a:false},
    {id:4,q:"Eyes feel strained or tired?",a:false},
    {id:5,q:"Feeling anxious or overwhelmed?",a:false},
    {id:6,q:"Forgot why you opened this tab?",a:false},
  ]);
  const [left,setLeft]=useState(0);
  const [active,setActive]=useState(false);
  useTick(()=>setLeft(l=>{if(l<=1){setActive(false);notify("Break's over","Come back when you're ready — no rush.");return 0;}return l-1;}),active?1000:null);
  const score=checks.filter(c=>c.a).length;
  const level=score>=4?"critical":score>=2?"warning":"ok";
  return(
    <div>
      <Lbl>Hyperfocus circuit breaker</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>Check in before diving deep. Two+ checked = take a break.</p>
      <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>
        {checks.map(c=>(
          <label key={c.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"9px 12px",borderRadius:10,background:c.a?P.lift:P.surface,border:`1px solid ${c.a?P.borderHi:P.border}`,transition:"all 0.15s"}}>
            <input type="checkbox" checked={c.a} onChange={()=>setChecks(p=>p.map(x=>x.id===c.id?{...x,a:!x.a}:x))} style={{accentColor:P.p50,width:14,height:14}}/>
            <span style={{fontSize:12,color:c.a?P.p60:P.muted}}>{c.q}</span>
          </label>
        ))}
      </div>
      {score>0&&(
        <div style={{padding:"12px 14px",borderRadius:12,marginBottom:12,background:P.lift,border:`1px solid ${P.borderHi}`}}>
          <p style={{fontSize:12,fontWeight:700,marginBottom:level==="ok"?0:8,color:level==="critical"?P.p60:level==="warning"?P.p50:P.p40}}>
            {level==="critical"?"🚨 You really need a break right now.":level==="warning"?"⚠️ A break would help.":"👍 You're okay."}
          </p>
          {level!=="ok"&&!active&&(
            <div style={{display:"flex",gap:5}}>
              {[5,10,20].map(m=><Tag key={m} onClick={()=>{askNotify();setLeft(m*60);setActive(true);}}>{m} min break</Tag>)}
            </div>
          )}
        </div>
      )}
      {active&&(
        <div style={{textAlign:"center",padding:"16px",background:P.lift,borderRadius:12,border:`1px solid ${P.borderHi}`,boxShadow:`0 0 24px ${P.glow}`}}>
          <div style={{fontSize:32,fontWeight:800,color:P.p60,letterSpacing:-1,lineHeight:1}}>{String(Math.floor(left/60)).padStart(2,"0")}:{String(left%60).padStart(2,"0")}</div>
          <p style={{fontSize:12,color:P.muted,marginTop:6}}>Step away. Breathe. You've earned this.</p>
          <button onClick={()=>setActive(false)} style={{marginTop:10,background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.muted,cursor:"pointer",fontSize:12,padding:"4px 10px",fontFamily:FONT}}>end early</button>
        </div>
      )}
    </div>
  );
}

// ── PROGRESS — editable completion bars ──────────────────────
function Bar({pct,color}){
  return(
    <div style={{height:8,background:P.dim,borderRadius:999,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${Math.max(0,Math.min(100,pct))}%`,borderRadius:999,background:color||`linear-gradient(90deg,${P.p30},${P.p50})`,transition:"width 0.3s"}}/>
    </div>
  );
}

function ProgressPanel({tasks}){
  const [items,setItems]=usePersist("c_progress",[]);
  const [name,setName]=useState("");
  const [editing,setEditing]=useState(null);
  // auto bar from the Tasks panel: micro-steps done across all tasks
  const totalChunks=tasks.reduce((a,t)=>a+(t.chunks?.length||0),0);
  const doneChunks=tasks.reduce((a,t)=>a+(t.done?(t.chunks?.length||0):(t.cd?.length||0)),0);
  const taskPct=totalChunks?Math.round(doneChunks/totalChunks*100):0;
  const doneTasks=tasks.filter(t=>t.done).length;
  const add=()=>{
    if(!name.trim())return;
    setItems(p=>[...p,{id:Date.now(),name:name.trim(),pct:0}]);
    setName("");
  };
  const setPct=(id,pct)=>setItems(p=>p.map(it=>it.id===id?{...it,pct}:it));
  const rename=(id,n)=>setItems(p=>p.map(it=>it.id===id?{...it,name:n}:it));
  const del=id=>setItems(p=>p.filter(it=>it.id!==id));
  return(
    <div>
      <Lbl>Progress</Lbl>
      {/* auto: today's tasks */}
      <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:12,padding:"11px 13px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
          <span style={{fontSize:12,fontWeight:700,color:P.text}}>◈ Tasks</span>
          <span style={{fontSize:12,color:P.p50,fontWeight:600}}>{doneTasks}/{tasks.length} done · {taskPct}%</span>
        </div>
        <Bar pct={taskPct}/>
        <p style={{fontSize:10,color:P.muted,marginTop:5}}>Counts every micro-step you check off in the Tasks panel.</p>
      </div>
      {/* custom editable bars */}
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        {items.map(it=>(
          <div key={it.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:12,padding:"11px 13px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:7}}>
              {editing===it.id?(
                <input autoFocus value={it.name} onChange={e=>rename(it.id,e.target.value)}
                  onBlur={()=>setEditing(null)} onKeyDown={e=>e.key==="Enter"&&setEditing(null)}
                  style={{...inp,padding:"4px 8px",fontSize:12,width:"auto",flex:1}}/>
              ):(
                <span onClick={()=>setEditing(it.id)} title="tap to rename" style={{fontSize:12,fontWeight:700,color:P.text,cursor:"pointer",flex:1}}>{it.name}</span>
              )}
              <span style={{fontSize:12,color:P.p50,fontWeight:600,whiteSpace:"nowrap"}}>{it.pct}%</span>
              <button onClick={()=>del(it.id)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:15,lineHeight:1}}>×</button>
            </div>
            <Bar pct={it.pct}/>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
              <input type="range" min={0} max={100} step={5} value={it.pct} onChange={e=>setPct(it.id,+e.target.value)} style={{flex:1,accentColor:P.p40}}/>
              <div style={{display:"flex",gap:3}}>
                <Tag onClick={()=>setPct(it.id,Math.max(0,it.pct-10))}>−10</Tag>
                <Tag onClick={()=>setPct(it.id,Math.min(100,it.pct+10))}>+10</Tag>
              </div>
            </div>
            {it.pct>=100&&<p style={{fontSize:12,color:P.p60,marginTop:6,textAlign:"center"}}>✨ Done!</p>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6}}>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
          placeholder="Add a project or goal…" style={inp}/>
        <Btn onClick={add} sm>+</Btn>
      </div>
    </div>
  );
}

// ── MERGED PANELS — tab shells; inactive tab stays mounted (display:none)
// so running timers (focus timer, HFC break) survive tab switches.
function PanelTabs({tabs}){
  const [tab,setTab]=useState(tabs[0].id);
  return(
    <div>
      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
        {tabs.map(t=><Tag key={t.id} active={tab===t.id} onClick={()=>setTab(t.id)}>{t.label}</Tag>)}
      </div>
      {tabs.map(t=><div key={t.id} style={{display:tab===t.id?"block":"none"}}>{t.el}</div>)}
    </div>
  );
}
function TimerProgressPanel({tasks}){
  return <PanelTabs tabs={[
    {id:"timer",label:"◷ Timer",el:<TimerPanel/>},
    {id:"progress",label:"▤ Progress",el:<ProgressPanel tasks={tasks}/>},
  ]}/>;
}
function BodyHFCPanel(){
  return <PanelTabs tabs={[
    {id:"check",label:"◬ Check in",el:<BodyPanel/>},
    {id:"hfc",label:"◎ Hyperfocus brake",el:<HFCPanel/>},
  ]}/>;
}
function CheckInPanel(){
  return <PanelTabs tabs={[
    {id:"emotion",label:"❋ Feeling",el:<EmotionPanel/>},
    {id:"intention",label:"◇ Intention",el:<IntentionPanel/>},
  ]}/>;
}

// ── PRO LOCK — shown in place of a Pro tool when not signed in ──
function ProLockCard({def}){
  return(
    <div style={{textAlign:"center",padding:"18px 8px"}}>
      <div style={{fontSize:30,color:P.p40,opacity:0.6,marginBottom:10}}>{def.glyph}</div>
      <p style={{fontSize:13,fontWeight:700,color:P.text,marginBottom:6}}>{def.label} is part of Pro</p>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>{def.sub}.</p>
      <Btn full onClick={()=>window.dispatchEvent(new Event("c_pro_needed"))}>✦ Unlock everything — {PRICE_LIFETIME} once or {PRICE_SUB}</Btn>
      <p style={{fontSize:10,color:P.muted,marginTop:8,lineHeight:1.5}}>Either way unlocks ALL the ✦ tools and every AI feature — not per-tool. Already bought? Sign in up top.</p>
    </div>
  );
}

// ── AVATAR BUILDER — custom SVG character ──────────────────────
const SKIN_TONES=["#FDE6D8","#F5D0B0","#EAC1A0","#E8B68C","#D4986A","#C18958","#B97A4E","#A0673E","#8D5A36","#74452A","#5C3A22","#3D2615"];
const HAIR_COLORS=["#0A0A0A","#2B1B12","#3D2817","#6B4226","#8B5A2B","#A8722E","#C99A3F","#D4A23A","#E8C468","#B0B0B0","#D8D8D8","#E0E0E0","#FFFFFF","#8C4068","#B05A82","#4A6FA5","#6B5BA0","#5A8A5A","#C45050","#E89090"];
const EYE_COLORS=["#3A2818","#4A3526","#5C4630","#2E6B8A","#4A8AAA","#3A7A4A","#5AA868","#7A5A3A","#A07840","#8C4068","#B05A82","#6B5BA0","#4A4A8A","#707070"];
const FRECKLE_COLORS=["#8B5A2B","#A0673E","#6B4226","#C99A3F"];

const FACE_SHAPES=["round","oval","square","heart","diamond"];
const HAIR_STYLES=["bald","short","buzzcut","long","curly","afro","bun","spiky","wavy","ponytail","bob","pigtails","mohawk","bangs"];
const EYE_STYLES=["round","almond","sleepy","wide","narrow","starry","wink"];
const EYEBROW_STYLES=["natural","raised","thick","thin","angled","unibrow"];
const MOUTH_STYLES=["smile","grin","smirk","neutral","open","tiny"];
const NOSE_STYLES=["small","button","straight","wide"];
const FACIAL_HAIR=["none","stubble","mustache","full-beard","goatee","soul-patch"];
const MARKS=["none","freckles","mole-cheek","mole-lip","blush-heavy","scar"];
const ACCESSORIES=["none","glasses","sunglasses","earrings","headband","beanie","flower","cap","bandana","piercing-nose","piercing-eyebrow"];
const OUTFIT_STYLES=["crew","hoodie","collar","vneck","turtleneck","tank"];
const OUTFIT_COLORS=["#8C4068","#B05A82","#D4889F","#4A6FA5","#6B95C5","#5A8A5A","#7FB37F","#B0834A","#D4A668","#6B5BA0","#9A85C0","#3A3A3A","#6A6A6A","#C45050","#E0E060","#40A0A0"];
const BG_STYLES=["none","gradient-warm","gradient-cool","dots","stars","sunset"];
const EAR_ACCESSORIES=["none","single-earring","double-earring","hoop"];

const DEFAULT_AVATAR={
  skin:SKIN_TONES[3], faceShape:"oval",
  hair:HAIR_COLORS[0], hairStyle:"short",
  eyes:EYE_COLORS[0], eyeStyle:"round",
  eyebrowStyle:"natural", mouthStyle:"smile", noseStyle:"button",
  facialHair:"none", marks:"none",
  accessory:"none", earAccessory:"none",
  outfitStyle:"crew", outfit:OUTFIT_COLORS[0],
  bgStyle:"none",
};

function HairSVG({style,color}){
  switch(style){
    case "long": return <path d="M30 45 Q25 15 60 12 Q95 15 90 45 L92 85 Q85 70 80 60 L80 40 Q60 30 40 40 L40 60 Q35 70 28 85 Z" fill={color}/>;
    case "curly": return <g fill={color}>
      <circle cx="35" cy="30" r="12"/><circle cx="50" cy="20" r="13"/><circle cx="65" cy="22" r="12"/><circle cx="78" cy="32" r="11"/>
      <circle cx="40" cy="40" r="10"/><circle cx="60" cy="38" r="10"/>
    </g>;
    case "afro": return <circle cx="60" cy="38" r="38" fill={color}/>;
    case "bun": return <g fill={color}>
      <path d="M32 45 Q28 18 60 15 Q92 18 88 45 L86 38 Q60 25 34 38 Z"/>
      <circle cx="60" cy="10" r="11"/>
    </g>;
    case "bald": return null;
    case "buzzcut": return <path d="M30 44 Q28 24 60 22 Q92 24 90 44 Q60 34 30 44Z" fill={color} opacity="0.85"/>;
    case "spiky": return <g fill={color}>
      <path d="M30 42 L25 15 L38 32 L40 8 L52 30 L58 5 L68 30 L80 8 L82 32 L95 15 L90 42 Q60 28 30 42Z"/>
    </g>;
    case "wavy": return <path d="M28 44 Q22 20 35 14 Q40 24 45 16 Q52 26 58 15 Q65 25 72 15 Q78 22 85 16 Q98 22 92 44 L90 75 Q84 55 80 50 L80 42 Q60 32 40 42 L40 50 Q36 55 30 75 Z" fill={color}/>;
    case "ponytail": return <g fill={color}>
      <path d="M30 42 Q26 16 60 14 Q94 16 90 42 L88 36 Q60 24 32 36 Z"/>
      <path d="M88 35 Q102 45 96 70 Q92 60 86 50 Z"/>
    </g>;
    case "bob": return <path d="M28 42 Q24 16 60 14 Q96 16 92 42 L92 64 Q86 58 82 56 L82 38 Q60 26 38 38 L38 56 Q34 58 28 64 Z" fill={color}/>;
    case "pigtails": return <g fill={color}>
      <path d="M30 42 Q26 16 60 14 Q94 16 90 42 L88 34 Q60 22 32 34 Z"/>
      <ellipse cx="26" cy="48" rx="7" ry="16" transform="rotate(-20 26 48)"/>
      <ellipse cx="94" cy="48" rx="7" ry="16" transform="rotate(20 94 48)"/>
    </g>;
    case "mohawk": return <g fill={color}>
      <path d="M52 10 L56 38 L64 38 L68 10 Q60 4 52 10Z"/>
    </g>;
    case "bangs": return <g fill={color}>
      <path d="M30 42 Q26 16 60 14 Q94 16 90 42 L88 34 Q60 40 32 34 Z"/>
      <path d="M40 32 Q60 42 80 32 L80 38 Q60 46 40 38 Z"/>
    </g>;
    default: return <path d="M30 42 Q25 16 60 14 Q95 16 90 42 L88 32 Q60 22 32 32 Z" fill={color}/>; // short
  }
}

function EyesSVG({style,color,blink}){
  if(blink) return <g><ellipse cx="44" cy="58" rx="6" ry="1" fill={color}/><ellipse cx="76" cy="58" rx="6" ry="1" fill={color}/></g>;
  switch(style){
    case "wink": return <g>
      <path d="M38 58 Q44 54 50 58" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="76" cy="58" rx="7" ry="7" fill={color}/><circle cx="77" cy="56" r="1.6" fill="white" opacity="0.8"/>
    </g>;
    case "starry": return <g fill={color}>
      <path d="M44 51 L46 57 L52 58 L46 59 L44 65 L42 59 L36 58 L42 57 Z"/>
      <path d="M76 51 L78 57 L84 58 L78 59 L76 65 L74 59 L68 58 L74 57 Z"/>
    </g>;
    case "narrow": return <g>
      <ellipse cx="44" cy="58" rx="6" ry="3" fill={color}/><ellipse cx="76" cy="58" rx="6" ry="3" fill={color}/>
    </g>;
    default:{
      const h=style==="sleepy"?4:style==="wide"?9:style==="almond"?6:7;
      return(
        <g>
          <ellipse cx="44" cy="58" rx={style==="wide"?7:6} ry={h} fill={color}/>
          <ellipse cx="76" cy="58" rx={style==="wide"?7:6} ry={h} fill={color}/>
          <circle cx="45" cy="56" r="1.6" fill="white" opacity="0.8"/>
          <circle cx="77" cy="56" r="1.6" fill="white" opacity="0.8"/>
        </g>
      );
    }
  }
}

function EyebrowsSVG({style,color}){
  switch(style){
    case "raised": return <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M37 46 Q44 42 51 46"/><path d="M69 46 Q76 42 83 46"/>
    </g>;
    case "thick": return <g stroke={color} strokeWidth="4" fill="none" strokeLinecap="round">
      <path d="M37 49 Q44 46 51 49"/><path d="M69 49 Q76 46 83 49"/>
    </g>;
    case "thin": return <g stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round">
      <path d="M38 49 Q44 47 50 49"/><path d="M70 49 Q76 47 82 49"/>
    </g>;
    case "angled": return <g stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round">
      <path d="M37 48 L51 44"/><path d="M69 44 L83 48"/>
    </g>;
    case "unibrow": return <path d="M37 47 Q60 42 83 47" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>;
    default: return <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M38 50 Q44 48 50 50"/><path d="M70 50 Q76 48 82 50"/>
    </g>;
  }
}

function NoseSVG({style,skin}){
  const dark=skin==="#5C3A22"||skin==="#8D5A36"||skin==="#3D2615"||skin==="#74452A";
  const c=dark?"#2A1810":"#C9986C";
  switch(style){
    case "small": return <path d="M59 62 Q58 67 60 69" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round"/>;
    case "straight": return <path d="M59 60 L58 72 Q60 74 63 72" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/>;
    case "wide": return <path d="M57 62 Q54 70 58 73 Q60 74 62 73 Q66 70 63 62" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/>;
    default: return <path d="M58 62 Q56 70 59 72 Q61 73 62 71" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/>; // button
  }
}

function MouthSVG({style,speaking}){
  const y=78;
  if(speaking) return <ellipse cx="60" cy={y+2} rx="9" ry="6" fill="#7A2A38" stroke="#A8505A" strokeWidth="2"/>;
  switch(style){
    case "grin": return <path d={`M44 ${y} Q60 ${y+14} 76 ${y}`} stroke="#A8505A" strokeWidth="2.5" fill="#FFF" strokeLinecap="round"/>;
    case "smirk": return <path d={`M46 ${y+2} Q60 ${y-2} 74 ${y-4}`} stroke="#A8505A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>;
    case "neutral": return <line x1="48" y1={y+2} x2="72" y2={y+2} stroke="#A8505A" strokeWidth="2.2" strokeLinecap="round"/>;
    case "open": return <ellipse cx="60" cy={y+3} rx="6" ry="5" fill="#7A2A38" stroke="#A8505A" strokeWidth="2"/>;
    case "tiny": return <path d="M56 80 Q60 83 64 80" stroke="#A8505A" strokeWidth="2" fill="none" strokeLinecap="round"/>;
    default: return <path d={`M48 ${y} Q60 ${y+8} 72 ${y}`} stroke="#A8505A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>; // smile
  }
}

function FacialHairSVG({style,color}){
  switch(style){
    case "stubble": return <ellipse cx="60" cy="80" rx="22" ry="16" fill={color} opacity="0.18"/>;
    case "mustache": return <path d="M48 73 Q54 70 60 73 Q66 70 72 73 Q66 76 60 74 Q54 76 48 73Z" fill={color}/>;
    case "full-beard": return <path d="M30 60 Q28 90 60 96 Q92 90 90 60 Q90 78 76 84 Q70 76 60 76 Q50 76 44 84 Q30 78 30 60Z" fill={color} opacity="0.92"/>;
    case "goatee": return <path d="M50 80 Q50 92 60 94 Q70 92 70 80 Q65 86 60 86 Q55 86 50 80Z" fill={color}/>;
    case "soul-patch": return <ellipse cx="60" cy="84" rx="3" ry="5" fill={color}/>;
    default: return null;
  }
}

function MarksSVG({type,color}){
  switch(type){
    case "freckles": return <g fill={color} opacity="0.55">
      {[[36,64],[40,68],[33,70],[84,64],[80,68],[87,70],[38,73],[82,73]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.1"/>)}
    </g>;
    case "mole-cheek": return <circle cx="80" cy="70" r="1.6" fill="#3A2818"/>;
    case "mole-lip": return <circle cx="68" cy="82" r="1.4" fill="#3A2818"/>;
    case "blush-heavy": return <g fill="#E87090" opacity="0.4">
      <ellipse cx="38" cy="68" rx="8" ry="5"/><ellipse cx="82" cy="68" rx="8" ry="5"/>
    </g>;
    case "scar": return <line x1="74" y1="48" x2="78" y2="62" stroke="#C08080" strokeWidth="1.4" opacity="0.7"/>;
    default: return null;
  }
}

function AccessorySVG({type,outfit}){
  switch(type){
    case "glasses": return <g stroke="#2A2A2A" strokeWidth="2" fill="none">
      <circle cx="44" cy="58" r="11"/><circle cx="76" cy="58" r="11"/><line x1="55" y1="58" x2="65" y2="58"/>
    </g>;
    case "sunglasses": return <g>
      <circle cx="44" cy="58" r="11" fill="#1A1A1A"/><circle cx="76" cy="58" r="11" fill="#1A1A1A"/>
      <line x1="55" y1="58" x2="65" y2="58" stroke="#1A1A1A" strokeWidth="2"/>
    </g>;
    case "earrings": return <g fill="#D4A23A">
      <circle cx="28" cy="68" r="2.5"/><circle cx="92" cy="68" r="2.5"/>
    </g>;
    case "headband": return <rect x="28" y="28" width="64" height="7" rx="3.5" fill={outfit}/>;
    case "beanie": return <path d="M28 38 Q26 10 60 8 Q94 10 92 38 Q60 26 28 38Z" fill={outfit}/>;
    case "cap": return <g fill={outfit}>
      <path d="M28 38 Q26 12 60 10 Q94 12 92 38 Q60 28 28 38Z"/>
      <ellipse cx="35" cy="38" rx="20" ry="5"/>
    </g>;
    case "bandana": return <path d="M28 35 Q60 22 92 35 L90 28 Q60 18 30 28Z" fill={outfit}/>;
    case "flower": return <g>
      <circle cx="32" cy="22" r="5" fill="#E8A0B8"/><circle cx="27" cy="26" r="5" fill="#E8A0B8"/>
      <circle cx="37" cy="26" r="5" fill="#E8A0B8"/><circle cx="32" cy="30" r="5" fill="#E8A0B8"/>
      <circle cx="32" cy="26" r="3" fill="#F0D040"/>
    </g>;
    case "piercing-nose": return <circle cx="62" cy="70" r="1.3" fill="#D0D0D0"/>;
    case "piercing-eyebrow": return <circle cx="50" cy="48" r="1.3" fill="#D0D0D0"/>;
    default: return null;
  }
}

function OutfitSVG({style,color}){
  switch(style){
    case "hoodie": return <g>
      <path d="M12 120 Q12 90 60 86 Q108 90 108 120 Z" fill={color}/>
      <path d="M38 92 Q60 100 82 92 L78 86 Q60 92 42 86Z" fill={color} opacity="0.7"/>
    </g>;
    case "collar": return <g>
      <path d="M15 120 Q15 95 60 92 Q105 95 105 120 Z" fill={color}/>
      <path d="M48 92 L60 102 L72 92 L66 90 L60 96 L54 90Z" fill="white"/>
    </g>;
    case "vneck": return <g>
      <path d="M15 120 Q15 95 60 92 Q105 95 105 120 Z" fill={color}/>
      <path d="M50 92 L60 110 L70 92" fill={P.bg}/>
    </g>;
    case "turtleneck": return <g>
      <path d="M15 120 Q15 95 60 92 Q105 95 105 120 Z" fill={color}/>
      <rect x="46" y="84" width="28" height="12" rx="6" fill={color}/>
    </g>;
    case "tank": return <g>
      <path d="M22 120 Q22 98 60 95 Q98 98 98 120Z" fill={color}/>
      <rect x="30" y="86" width="10" height="14" fill={color}/><rect x="80" y="86" width="10" height="14" fill={color}/>
    </g>;
    default: return <path d="M15 120 Q15 95 60 92 Q105 95 105 120 Z" fill={color}/>; // crew
  }
}

function BgSVG({style}){
  switch(style){
    case "gradient-warm": return <defs><radialGradient id="bgw" cx="50%" cy="40%"><stop offset="0%" stopColor="#E8A0B8" stopOpacity="0.4"/><stop offset="100%" stopColor="transparent"/></radialGradient></defs>;
    default: return null;
  }
}

function AvatarFace({avatar,size=120,speaking,blink,mood,live}){
  const faceRy = avatar.faceShape==="square"?29 : avatar.faceShape==="heart"?32 : avatar.faceShape==="diamond"?34 : avatar.faceShape==="round"?34 : 33;
  const faceRx = avatar.faceShape==="diamond"?28 : avatar.faceShape==="round"?34 : 32;
  // unique gradient ids — several avatars render on one page
  const uid=useRef(Math.random().toString(36).slice(2,8)).current;
  const skinFill=`url(#af-skin-${uid})`, hairFill=`url(#af-hair-${uid})`, outfitFill=`url(#af-outfit-${uid})`;
  return(
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        {/* soft top-light on skin, gentle sheen on hair & outfit — reads as depth at every size */}
        <radialGradient id={`af-skin-${uid}`} cx="42%" cy="36%" r="78%">
          <stop offset="0%" stopColor={shade(avatar.skin,0.14)}/>
          <stop offset="62%" stopColor={avatar.skin}/>
          <stop offset="100%" stopColor={shade(avatar.skin,-0.10)}/>
        </radialGradient>
        <linearGradient id={`af-hair-${uid}`} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor={shade(avatar.hair,0.20)}/>
          <stop offset="45%" stopColor={avatar.hair}/>
          <stop offset="100%" stopColor={shade(avatar.hair,-0.14)}/>
        </linearGradient>
        <linearGradient id={`af-outfit-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(avatar.outfit,0.14)}/>
          <stop offset="100%" stopColor={shade(avatar.outfit,-0.18)}/>
        </linearGradient>
      </defs>
      {live&&<style>{`@keyframes af-breathe-${uid}{0%,100%{transform:scale(1)}50%{transform:scale(1.014) translateY(-0.6px)}}`}</style>}
      {avatar.bgStyle==="gradient-warm"&&<circle cx="60" cy="60" r="58" fill="#E8A0B8" opacity="0.15"/>}
      {avatar.bgStyle==="gradient-cool"&&<circle cx="60" cy="60" r="58" fill="#6B95C5" opacity="0.15"/>}
      {avatar.bgStyle==="sunset"&&<circle cx="60" cy="60" r="58" fill="#D4A668" opacity="0.18"/>}
      {avatar.bgStyle==="dots"&&<g fill={P.border} opacity="0.4">{[[15,15],[100,20],[20,100],[95,95],[60,10]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2"/>)}</g>}
      {avatar.bgStyle==="stars"&&<g fill="#D4A23A" opacity="0.5">{[[18,20],[95,25],[15,90],[100,85]].map(([x,y],i)=><path key={i} d={`M${x} ${y-3} L${x+1} ${y} L${x+3} ${y} L${x+1} ${y+1} L${x+2} ${y+4} L${x} ${y+2} L${x-2} ${y+4} L${x-1} ${y+1} L${x-3} ${y} L${x-1} ${y} Z`}/>)}</g>}

      <g style={live?{animation:`af-breathe-${uid} 4.4s ease-in-out infinite`,transformOrigin:"60px 118px"}:undefined}>
      {/* outfit/shoulders */}
      <OutfitSVG style={avatar.outfitStyle} color={outfitFill}/>
      {/* neck — rounded, with a soft shadow where the head sits */}
      <rect x="50" y="80" width="20" height="16" rx="7" fill={skinFill}/>
      <ellipse cx="60" cy="86" rx="11" ry="4" fill={shade(avatar.skin,-0.22)} opacity="0.35"/>
      {/* hair back layer (ponytail tail, bun) */}
      {(avatar.hairStyle==="ponytail"||avatar.hairStyle==="bun")&&<HairSVG style={avatar.hairStyle} color={hairFill}/>}
      {/* head */}
      <ellipse cx="60" cy="58" rx={faceRx} ry={faceRy} fill={skinFill} stroke={shade(avatar.skin,-0.18)} strokeWidth="0.7" strokeOpacity="0.45"/>
      {/* ears */}
      <circle cx="29" cy="58" r="5" fill={skinFill}/>
      <circle cx="91" cy="58" r="5" fill={skinFill}/>
      {/* ear accessories */}
      {avatar.earAccessory==="single-earring"&&<circle cx="91" cy="64" r="2" fill="#D4A23A"/>}
      {avatar.earAccessory==="double-earring"&&<><circle cx="29" cy="64" r="2" fill="#D4A23A"/><circle cx="91" cy="64" r="2" fill="#D4A23A"/></>}
      {avatar.earAccessory==="hoop"&&<><circle cx="29" cy="66" r="3.5" fill="none" stroke="#D4A23A" strokeWidth="1.4"/><circle cx="91" cy="66" r="3.5" fill="none" stroke="#D4A23A" strokeWidth="1.4"/></>}
      {/* marks underneath hair (freckles etc on face) */}
      <MarksSVG type={avatar.marks} color={SKIN_TONES[0]}/>
      {/* eyebrows */}
      <EyebrowsSVG style={avatar.eyebrowStyle} color={avatar.hair}/>
      {/* eyes */}
      <EyesSVG style={avatar.eyeStyle} color={avatar.eyes} blink={blink}/>
      {/* nose */}
      <NoseSVG style={avatar.noseStyle} skin={avatar.skin}/>
      {/* mouth */}
      <MouthSVG style={avatar.mouthStyle} speaking={speaking}/>
      {/* facial hair */}
      <FacialHairSVG style={avatar.facialHair} color={avatar.hair}/>
      {/* cheeks (subtle always-on blush, separate from marks blush-heavy) */}
      {avatar.marks!=="blush-heavy"&&<g fill="#E89090" opacity="0.18"><ellipse cx="38" cy="68" rx="6" ry="4"/><ellipse cx="82" cy="68" rx="6" ry="4"/></g>}
      {/* hair front layer (everything except ponytail tail/bun which is behind) */}
      <HairSVG style={avatar.hairStyle} color={hairFill}/>
      {/* accessory */}
      <AccessorySVG type={avatar.accessory} outfit={avatar.outfit}/>
      </g>
    </svg>
  );
}

const BUILDER_TABS=[
  {id:"face",  label:"Face"},
  {id:"hair",  label:"Hair"},
  {id:"eyes",  label:"Eyes"},
  {id:"extras",label:"Extras"},
  {id:"style", label:"Style"},
];

function AvatarBuilder({avatar,setAvatar,onDone}){
  const [tab,setTab]=useState("face");
  const upd=patch=>setAvatar(a=>({...a,...patch}));
  const Swatches=({options,value,onPick})=>(
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {options.map(c=>(
        <button key={c} onClick={()=>onPick(c)} style={{
          width:26,height:26,borderRadius:"50%",
          background:c,border:`2px solid ${value===c?P.p60:P.border}`,
          cursor:"pointer",boxShadow:value===c?`0 0 8px ${P.glow}`:"none",
        }}/>
      ))}
    </div>
  );
  const Options=({options,value,onPick})=>(
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
      {options.map(o=><Tag key={o} active={value===o} onClick={()=>onPick(o)}>{o}</Tag>)}
    </div>
  );

  return(
    <div>
      <Lbl>Build your companion</Lbl>
      <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
        <div style={{padding:14,background:P.surface,borderRadius:"50%",border:`2px solid ${P.borderHi}`}}>
          <AvatarFace avatar={avatar} size={130} blink={false} mood="happy"/>
        </div>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
        {BUILDER_TABS.map(t=><Tag key={t.id} active={tab===t.id} onClick={()=>setTab(t.id)}>{t.label}</Tag>)}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:14,minHeight:260}}>
        {tab==="face"&&(<>
          <div><Lbl>Skin tone</Lbl><Swatches options={SKIN_TONES} value={avatar.skin} onPick={c=>upd({skin:c})}/></div>
          <div><Lbl>Face shape</Lbl><Options options={FACE_SHAPES} value={avatar.faceShape} onPick={v=>upd({faceShape:v})}/></div>
          <div><Lbl>Eyebrows</Lbl><Options options={EYEBROW_STYLES} value={avatar.eyebrowStyle} onPick={v=>upd({eyebrowStyle:v})}/></div>
          <div><Lbl>Nose</Lbl><Options options={NOSE_STYLES} value={avatar.noseStyle} onPick={v=>upd({noseStyle:v})}/></div>
          <div><Lbl>Mouth</Lbl><Options options={MOUTH_STYLES} value={avatar.mouthStyle} onPick={v=>upd({mouthStyle:v})}/></div>
        </>)}

        {tab==="hair"&&(<>
          <div><Lbl>Hair style</Lbl><Options options={HAIR_STYLES} value={avatar.hairStyle} onPick={v=>upd({hairStyle:v})}/></div>
          <div><Lbl>Hair color</Lbl><Swatches options={HAIR_COLORS} value={avatar.hair} onPick={c=>upd({hair:c})}/></div>
          <div><Lbl>Facial hair</Lbl><Options options={FACIAL_HAIR} value={avatar.facialHair} onPick={v=>upd({facialHair:v})}/></div>
        </>)}

        {tab==="eyes"&&(<>
          <div><Lbl>Eye style</Lbl><Options options={EYE_STYLES} value={avatar.eyeStyle} onPick={v=>upd({eyeStyle:v})}/></div>
          <div><Lbl>Eye color</Lbl><Swatches options={EYE_COLORS} value={avatar.eyes} onPick={c=>upd({eyes:c})}/></div>
        </>)}

        {tab==="extras"&&(<>
          <div><Lbl>Skin marks</Lbl><Options options={MARKS} value={avatar.marks} onPick={v=>upd({marks:v})}/></div>
          <div><Lbl>Face accessory</Lbl><Options options={ACCESSORIES} value={avatar.accessory} onPick={v=>upd({accessory:v})}/></div>
          <div><Lbl>Ear accessory</Lbl><Options options={EAR_ACCESSORIES} value={avatar.earAccessory} onPick={v=>upd({earAccessory:v})}/></div>
        </>)}

        {tab==="style"&&(<>
          <div><Lbl>Outfit style</Lbl><Options options={OUTFIT_STYLES} value={avatar.outfitStyle} onPick={v=>upd({outfitStyle:v})}/></div>
          <div><Lbl>Outfit color</Lbl><Swatches options={OUTFIT_COLORS} value={avatar.outfit} onPick={c=>upd({outfit:c})}/></div>
          <div><Lbl>Background</Lbl><Options options={BG_STYLES} value={avatar.bgStyle} onPick={v=>upd({bgStyle:v})}/></div>
        </>)}
      </div>

      <div style={{display:"flex",gap:8,marginTop:18}}>
        <Btn onClick={()=>setAvatar({...DEFAULT_AVATAR,skin:SKIN_TONES[Math.floor(Math.random()*SKIN_TONES.length)],hair:HAIR_COLORS[Math.floor(Math.random()*HAIR_COLORS.length)],hairStyle:HAIR_STYLES[Math.floor(Math.random()*HAIR_STYLES.length)],eyes:EYE_COLORS[Math.floor(Math.random()*EYE_COLORS.length)],eyeStyle:EYE_STYLES[Math.floor(Math.random()*EYE_STYLES.length)],outfit:OUTFIT_COLORS[Math.floor(Math.random()*OUTFIT_COLORS.length)],outfitStyle:OUTFIT_STYLES[Math.floor(Math.random()*OUTFIT_STYLES.length)],accessory:ACCESSORIES[Math.floor(Math.random()*ACCESSORIES.length)]})} ghost sm>🎲 Randomize</Btn>
        <Btn onClick={onDone} full>Done — use this companion</Btn>
      </div>
    </div>
  );
}

// ── BODY DOUBLE — active voice companion ──────────────────────
const COMPANIONS=[
  {id:"sage", name:"Sage", e:"🧘",vibe:"Calm & grounding",
   sys:"You are Sage, an active body-doubling companion working alongside someone with ADHD via live voice. You are not passive — you're a real coworking partner. Proactively comment on their progress, offer concrete next-step suggestions for their task, and ask short engaging questions to keep them anchored. Speak in calm, warm, SHORT sentences (1-2 max) since this is spoken aloud. Never lecture. Treat their task as something you're genuinely helping with, not just witnessing."},
  {id:"nova", name:"Nova", e:"⚡",vibe:"Upbeat & energizing",
   sys:"You are Nova, an active body-doubling companion working alongside someone with ADHD via live voice. You're not passive — actively suggest next steps, celebrate progress out loud, and ask quick energizing questions to keep momentum. Short spoken sentences (1-2 max). Real coworking energy, not just cheerleading from the sidelines."},
  {id:"river",name:"River",e:"🌊",vibe:"Steady & no-pressure",
   sys:"You are River, an active body-doubling companion working alongside someone with ADHD via live voice. Steady, non-judgmental, but genuinely engaged — offer practical next-step ideas for their task and ask grounding questions. Short spoken sentences (1-2 max). You're working with them, not just observing."},
  {id:"blaze",name:"Blaze",e:"🔥",vibe:"Hype & momentum",
   sys:"You are Blaze, an active body-doubling companion working alongside someone with ADHD via live voice. High energy, but genuinely useful — give sharp next-step suggestions, call out momentum, ask quick punchy questions to keep them locked in. Short spoken sentences (1-2 max)."},
];

const CHECKINS=[{label:"3 min",ms:180000},{label:"5 min",ms:300000},{label:"8 min",ms:480000},{label:"12 min",ms:720000}];

// Free-tier companion: real presence, canned words. Pro makes them live (AI).
const CANNED_OPEN=["I'm here. Deep breath — what's the very first small piece?","Sitting with you. Just open the thing, that's the whole first step.","Here and settled in. Start anywhere — messy counts."];
const CANNED_LINES=["Still here with you.","You're doing the thing. Keep going.","Steady. One piece at a time.","I'm right here — back to it.","Look at you, actually doing it.","No rush. Just the next small bit."];
const CANNED_CHECKIN=["Quick check — how's it going over there?","Still with me? Where are you at?","Checkpoint: what's the next small piece?"];
const CANNED_CLOSE=m=>m>0?`That's ${m} minute${m!==1?"s":""} you actually showed up for. Take the win.`:"You showed up — that counts. See you next round.";
const rand=a=>a[Math.floor(Math.random()*a.length)];

const VOICE_MAP={sage:"Google UK English Female",nova:"Google US English",river:"Google UK English Female",blaze:"Google US English"};

function BodyDoublePanel(){
  const pro=useProState();
  const [comp,setComp]=useState(COMPANIONS[0]);
  const [avatar,setAvatar]=usePersist("c_avatar",DEFAULT_AVATAR);
  const [building,setBuilding]=useState(false);
  const [task,setTask]=useState("");
  const [active,setActive]=useState(false);
  const [msgs,setMsgs]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoad]=useState(false);
  const [sMin,setSMin]=useState(0);
  const [ciIdx,setCi]=useState(1);
  const [voiceOn,setVoiceOn]=useState(true);
  const [listening,setListening]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [voiceSupported,setVoiceSupported]=useState(true);
  const [blink,setBlink]=useState(false);
  const [full,setFull]=useState(false);

  const chatRef=useRef();const ciRef=useRef();const recogRef=useRef(null);const wantListenRef=useRef(false);

  // Esc leaves fullscreen (session keeps running)
  useEffect(()=>{
    if(!full)return;
    const k=e=>{if(e.key==="Escape")setFull(false);};
    window.addEventListener("keydown",k);
    return()=>window.removeEventListener("keydown",k);
  },[full]);

  useEffect(()=>chatRef.current?.scrollTo({top:99999,behavior:"smooth"}),[msgs]);
  useTick(()=>{if(active)setSMin(m=>m+1);},active?60000:null);

  // Natural blinking
  useEffect(()=>{
    const id=setInterval(()=>{
      setBlink(true); setTimeout(()=>setBlink(false),150);
    },2500+Math.random()*2500);
    return()=>clearInterval(id);
  },[]);

  // Check speech support once
  useEffect(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR||!window.speechSynthesis) setVoiceSupported(false);
  },[]);

  const speak=useCallback(text=>{
    if(!voiceOn||!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    const voices=window.speechSynthesis.getVoices();
    const preferred=voices.find(v=>v.name===VOICE_MAP[comp.id])||voices.find(v=>v.lang==="en-US")||voices[0];
    if(preferred) u.voice=preferred;
    u.rate=1.02; u.pitch=comp.id==="sage"||comp.id==="river"?0.95:1.05;
    setSpeaking(true);
    u.onend=()=>setSpeaking(false);
    u.onerror=()=>setSpeaking(false);
    window.speechSynthesis.speak(u);
  },[voiceOn,comp]);

  const call=async(messages)=>{
    const headers={"Content-Type":"application/json"};
    const acct=store.get("c_account",null);
    if(acct?.token)headers["Authorization"]=`Bearer ${acct.token}`;
    try{
      const r=await fetch("/api/claude",{method:"POST",headers,body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:100,system:comp.sys,messages})});
      if(r.status===402||r.status===401){window.dispatchEvent(new Event("c_pro_needed"));return "My live voice is part of Pro — tap ✦ Pro up top and I'll be able to really talk with you.";}
      if(r.status===429)return "I've hit today's AI limit — I'm still here with you, just quieter until midnight UTC.";
      const d=await r.json();
      return d.content?.find(b=>b.type==="text")?.text||"I'm here.";
    }catch{return "I'm here — connection hiccup, but I'm not going anywhere.";}
  };

  const pushReply=useCallback((text,opts={})=>{
    setMsgs(p=>[...p,{id:Date.now()+Math.random(),role:"assistant",content:text,...opts}]);
    speak(text);
  },[speak]);

  // ── Speech recognition setup (Pro only — replies need the AI) ──
  useEffect(()=>{
    if(!active||!voiceOn||!pro) return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) return;
    const recog=new SR();
    recog.continuous=true;
    recog.interimResults=false;
    recog.lang="en-US";
    recog.onresult=async(e)=>{
      const transcript=e.results[e.results.length-1][0].transcript.trim();
      if(!transcript) return;
      const um={id:Date.now()+"u",role:"user",content:transcript};
      const hist=[...msgs,um].map(m=>({role:m.role,content:m.content}));
      setMsgs(p=>[...p,um]); setLoad(true);
      const reply=await call(hist);
      setLoad(false); pushReply(reply);
    };
    recog.onend=()=>{ if(wantListenRef.current) try{recog.start();}catch{} else setListening(false); };
    recog.onerror=()=>{ if(wantListenRef.current) try{recog.start();}catch{} };
    recogRef.current=recog;
    return()=>{ try{recog.stop();}catch{} };
  },[active,voiceOn,msgs,comp]);

  const toggleListening=()=>{
    if(!recogRef.current) return;
    if(listening){ wantListenRef.current=false; recogRef.current.stop(); setListening(false); }
    else { wantListenRef.current=true; try{recogRef.current.start();}catch{} setListening(true); }
  };

  // ── Proactive unprompted comments — randomized interval ──
  useEffect(()=>{
    if(!active) return;
    let cancelled=false;
    const scheduleNext=()=>{
      const delay=(45+Math.random()*75)*1000; // 45s–2min, feels organic not robotic
      return setTimeout(async()=>{
        if(cancelled) return;
        if(!pro){ // free tier: canned presence, no API
          pushReply(rand(CANNED_LINES),{proactive:true});
          timeoutRef.current=scheduleNext();
          return;
        }
        const prompts=[
          `(proactive, unprompted) Give a brief, genuine comment encouraging them or noticing their effort on: "${task}". Don't ask if they need anything — just be present, like a coworker glancing over.`,
          `(proactive, unprompted) Offer one small concrete next-step idea or suggestion for their task: "${task}". Keep it short and natural, like a coworking partner thinking out loud.`,
          `(proactive, unprompted) Ask one short, easy engagement question to check they're still anchored on: "${task}" — something like "how's that part going?" in your own voice/style.`,
        ];
        const p=prompts[Math.floor(Math.random()*prompts.length)];
        const hist=[...msgs,{role:"user",content:p}].map(m=>({role:m.role,content:m.content}));
        const reply=await call(hist);
        if(!cancelled) pushReply(reply,{proactive:true});
        timeoutRef.current=scheduleNext();
      },delay);
    };
    const timeoutRef={current:null};
    timeoutRef.current=scheduleNext();
    return()=>{ cancelled=true; clearTimeout(timeoutRef.current); };
  },[active,task,comp,pro]);

  // ── Scheduled longer check-ins ──
  useEffect(()=>{
    if(!active){clearInterval(ciRef.current);return;}
    ciRef.current=setInterval(async()=>{
      if(!pro){pushReply(rand(CANNED_CHECKIN),{checkin:true});return;}
      const m={role:"user",content:`(scheduled check-in — ${CHECKINS[ciIdx].label} passed) Ask how progress is going on: "${task}", and offer one specific suggestion if it seems useful.`};
      const hist=[...msgs,m].map(x=>({role:x.role,content:x.content}));
      setLoad(true);const reply=await call(hist);setLoad(false);
      pushReply(reply,{checkin:true});
    },CHECKINS[ciIdx].ms);
    return()=>clearInterval(ciRef.current);
  },[active,ciIdx,msgs,task,comp,pro]);

  const startSession=async()=>{
    if(!task.trim())return;
    setActive(true);setMsgs([]);setSMin(0);
    // warm voices on user gesture
    if(window.speechSynthesis) window.speechSynthesis.getVoices();
    if(!pro){ // free: quiet company — canned opener, no listening
      const r=rand(CANNED_OPEN);
      setMsgs([{id:"o",role:"assistant",content:r}]);
      speak(r);
      return;
    }
    setLoad(true);
    const r=await call([{role:"user",content:`I'm about to work on: "${task}". Sit with me as an active coworking partner — comment, suggest, ask questions, don't just watch.`}]);
    setLoad(false);
    setMsgs([{id:"o",role:"assistant",content:r}]);
    speak(r);
    if(voiceOn){ wantListenRef.current=true; setListening(true); }
  };

  const end=async()=>{
    setActive(false); setFull(false); wantListenRef.current=false;
    try{recogRef.current?.stop();}catch{}
    window.speechSynthesis?.cancel();
    setListening(false); clearInterval(ciRef.current);
    if(!pro){const r=CANNED_CLOSE(sMin);setMsgs(p=>[...p,{id:"c",role:"assistant",content:r}]);speak(r);return;}
    setLoad(true);
    const r=await call([...msgs.map(m=>({role:m.role,content:m.content})),{role:"user",content:`I'm done. Worked ${sMin} min.`}]);
    setLoad(false); setMsgs(p=>[...p,{id:"c",role:"assistant",content:r}]); speak(r);
  };

  const send=async()=>{
    if(!pro){window.dispatchEvent(new Event("c_pro_needed"));return;}
    if(!input.trim()||loading)return;
    const um={id:Date.now()+"u",role:"user",content:input.trim()};
    const hist=[...msgs,um].map(m=>({role:m.role,content:m.content}));
    setMsgs(p=>[...p,um]);setInput("");setLoad(true);
    const r=await call(hist);setLoad(false);
    pushReply(r);
  };

  if(building) return <AvatarBuilder avatar={avatar} setAvatar={setAvatar} onDone={()=>setBuilding(false)}/>;

  if(!active)return(
    <div>
      <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
        <div onClick={()=>setBuilding(true)} style={{
          padding:14,borderRadius:"50%",cursor:"pointer",position:"relative",transition:"transform 0.2s",
          background:`radial-gradient(circle at 42% 34%, ${P.lift}, ${P.surface} 68%)`,
          border:`1px solid ${P.borderHi}`,boxShadow:`0 0 34px ${P.glow}, inset 0 0 24px rgba(0,0,0,0.25)`,
        }}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <AvatarFace avatar={avatar} size={104} blink={blink} mood="happy" live/>
          <div style={{position:"absolute",bottom:2,right:2,width:26,height:26,borderRadius:"50%",background:P.p40,border:`2px solid ${P.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,boxShadow:`0 2px 8px rgba(0,0,0,0.4)`}}>✎</div>
        </div>
      </div>
      <p style={{fontSize:11,color:P.muted,textAlign:"center",marginBottom:16}}>Tap to customize your companion's look</p>

      <Lbl>Choose your companion's personality</Lbl>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
        {COMPANIONS.map(c=>(
          <button key={c.id} onClick={()=>setComp(c)} style={{padding:"11px 10px",borderRadius:12,textAlign:"left",cursor:"pointer",fontFamily:FONT,border:`1.5px solid ${comp.id===c.id?P.borderHi:P.border}`,background:comp.id===c.id?P.lift:"none",transition:"all 0.15s"}}>
            <div style={{fontSize:22,marginBottom:4}}>{c.e}</div>
            <div style={{fontSize:12,fontWeight:700,color:comp.id===c.id?P.p60:P.text}}>{c.name}</div>
            <div style={{fontSize:11,color:P.muted,marginTop:1}}>{c.vibe}</div>
          </button>
        ))}
      </div>
      <Lbl>What are you working on?</Lbl>
      <input value={task} onChange={e=>setTask(e.target.value)} onKeyDown={e=>e.key==="Enter"&&startSession()} placeholder="e.g. Write the intro, respond to messages…" style={{...inp,marginBottom:12}}/>
      <Lbl>Scheduled check-in every</Lbl>
      <div style={{display:"flex",gap:4,marginBottom:14}}>{CHECKINS.map((c,i)=><Tag key={i} active={ciIdx===i} onClick={()=>setCi(i)}>{c.label}</Tag>)}</div>

      {pro?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,marginBottom:14}}>
          <div>
            <div style={{fontSize:12,color:P.text,fontWeight:600}}>🎙 Live voice mode</div>
            <div style={{fontSize:11,color:P.muted,marginTop:1}}>{voiceSupported?"Talk naturally — no typing needed":"Not supported in this browser, will use text"}</div>
          </div>
          <button onClick={()=>setVoiceOn(v=>!v)} disabled={!voiceSupported} style={{
            width:42,height:24,borderRadius:999,border:"none",cursor:voiceSupported?"pointer":"default",
            background:voiceOn&&voiceSupported?P.p40:P.dim,position:"relative",transition:"background 0.2s",opacity:voiceSupported?1:0.5,
          }}>
            <div style={{position:"absolute",top:2,left:voiceOn&&voiceSupported?20:2,width:20,height:20,borderRadius:"50%",background:P.text,transition:"left 0.2s"}}/>
          </button>
        </div>
      ):(
        <div style={{padding:"10px 13px",background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,marginBottom:14}}>
          <div style={{fontSize:12,color:P.text,fontWeight:600}}>Free: quiet company · ✦ Pro: a live conversation</div>
          <div style={{fontSize:11,color:P.muted,marginTop:2,lineHeight:1.5}}>Free mode sits with you, speaks encouragement and checks in. With Pro they actually listen and talk back — voice and all. <span style={{color:P.p50,fontWeight:600}}>{PRICE_LIFETIME} once (or {PRICE_SUB}) unlocks it plus every other ✦ tool.</span></div>
        </div>
      )}

      <Btn onClick={startSession} disabled={!task.trim()} full>Start with {comp.name}</Btn>
    </div>
  );

  // ── FULLSCREEN — the companion fills the screen, session keeps running ──
  if(full){
    const lastMsgs=msgs.slice(-2);
    return(
      <div style={{position:"fixed",inset:0,zIndex:90,display:"flex",flexDirection:"column",alignItems:"center",
        background:`radial-gradient(120vh 90vh at 50% 26%, #17231555, transparent), radial-gradient(90vh 90vh at 50% 110%, ${P.p10}44, transparent), ${P.bg}`,
        padding:"max(2.5vh,14px) 18px 18px",fontFamily:FONT,color:P.text,overflow:"auto"}}>
        {/* top row */}
        <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",maxWidth:680,flexShrink:0}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:P.p60}}>{comp.name} is working with you</div>
            <div style={{fontSize:12,color:P.muted,marginTop:2}}>{task}</div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:20,fontWeight:800,color:P.p50,lineHeight:1}}>{sMin}m</div>
              <div style={{fontSize:10,color:P.muted}}>focused</div>
            </div>
            <button onClick={()=>setFull(false)} title="Exit fullscreen (Esc)" style={{width:34,height:34,borderRadius:10,border:`1px solid ${P.border}`,background:"none",color:P.muted,cursor:"pointer",fontSize:15}}>⛶</button>
          </div>
        </div>

        {/* the companion */}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:"100%",minHeight:0,padding:"1vh 0"}}>
          <div style={{width:"min(46vh,72vw)",maxWidth:420,aspectRatio:"1",borderRadius:"50%",padding:"3.5%",
            background:`radial-gradient(circle at 42% 32%, ${P.lift}, ${P.surface} 70%)`,
            border:`1px solid ${P.borderHi}`,
            boxShadow:speaking?`0 0 0 6px ${P.glow}, 0 0 110px ${P.glow}`:`0 0 70px ${P.glow}, inset 0 0 40px rgba(0,0,0,0.3)`,
            transition:"box-shadow 0.3s"}}>
            <AvatarFace avatar={avatar} size="100%" blink={blink} speaking={speaking} mood={loading?"thinking":"happy"} live/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7,marginTop:14}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:(listening||!pro)?P.p60:P.dim,animation:listening?"pulse 1.4s ease-in-out infinite":"none"}}/>
            <span style={{fontSize:12,color:P.muted}}>{speaking?`${comp.name} is speaking…`:!pro?"Sitting with you — quiet company":listening?"Listening — just talk naturally":loading?"Thinking…":voiceOn&&voiceSupported?"Voice paused — tap the mic":"Type below to talk"}</span>
          </div>
          {/* latest words, like a caption under the companion */}
          <div style={{width:"100%",maxWidth:560,display:"flex",flexDirection:"column",gap:8,marginTop:16}}>
            {lastMsgs.map(msg=>(
              <div key={msg.id} style={{alignSelf:msg.role==="user"?"flex-end":"center",textAlign:msg.role==="user"?"right":"center",
                maxWidth:msg.role==="user"?"70%":"100%",
                padding:msg.role==="user"?"8px 12px":"4px 8px",
                borderRadius:12,fontSize:msg.role==="user"?12:15,lineHeight:1.65,
                background:msg.role==="user"?P.p30:"none",
                color:msg.role==="user"?P.text:P.p70,
                fontStyle:msg.role==="user"?"normal":"italic"}}>
                {msg.content}
              </div>
            ))}
            {loading&&<div style={{textAlign:"center",fontSize:18,letterSpacing:4,color:P.muted}}>···</div>}
          </div>
        </div>

        {/* controls */}
        <div style={{width:"100%",maxWidth:560,flexShrink:0}}>
          {pro?(<>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {voiceOn&&voiceSupported&&(
                <button onClick={toggleListening} style={{width:42,height:42,borderRadius:"50%",border:`1.5px solid ${listening?P.p50:P.border}`,background:listening?P.p10:"none",color:listening?P.p60:P.muted,cursor:"pointer",fontSize:16,flexShrink:0}} title={listening?"Listening — tap to mute":"Tap to start listening"}>{listening?"🎙":"🔇"}</button>
              )}
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={`Talk to ${comp.name}…`} style={{...inp,fontSize:13}}/>
              <Btn onClick={send} sm disabled={loading||!input.trim()}>→</Btn>
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center",marginBottom:10}}>
              {["I got distracted 😬","Finished a chunk 🎉","I'm stuck","Need a pep talk"].map(q=><Tag key={q} onClick={()=>setInput(q)}>{q}</Tag>)}
            </div>
          </>):(
            <p style={{fontSize:12,color:P.muted,textAlign:"center",lineHeight:1.6,marginBottom:10}}>{comp.name} is keeping you company. <button onClick={()=>{setFull(false);window.dispatchEvent(new Event("c_pro_needed"));}} style={{background:"none",border:"none",color:P.p50,fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:FONT,padding:0}}>✦ Make them live — {PRICE_LIFETIME} once unlocks everything</button></p>
          )}
          <div style={{display:"flex",gap:6,justifyContent:"center"}}>
            <Btn onClick={()=>setVoiceOn(v=>!v)} ghost sm>{voiceOn?"🔇 Mute voice":"🎙 Unmute voice"}</Btn>
            <Btn onClick={end} ghost sm>End session</Btn>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",background:P.lift,border:`1px solid ${P.borderHi}`,borderRadius:12,marginBottom:12,boxShadow:`0 0 20px ${P.glow}`}}>
        <div style={{position:"relative"}}>
          <div style={{
            width:50,height:50,borderRadius:"50%",background:P.surface,overflow:"hidden",
            border:`1.5px solid ${P.p40}`,display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:speaking?`0 0 0 4px ${P.glow}`:"none",transition:"box-shadow 0.2s",
          }}>
            <AvatarFace avatar={avatar} size={58} blink={blink} speaking={speaking} mood={loading?"thinking":"happy"}/>
          </div>
          <div style={{position:"absolute",bottom:1,right:1,width:9,height:9,borderRadius:"50%",
            background:listening?P.p60:P.p50,border:`2px solid ${P.card}`,
            boxShadow:listening?`0 0 6px ${P.p60}`:"none",
            animation:listening?"pulse 1.4s ease-in-out infinite":"none"}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:P.p60}}>{comp.name} is working with you</div>
          <div style={{fontSize:11,color:P.muted,marginTop:1}}>{task}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {pro&&voiceOn&&voiceSupported&&(
            <button onClick={toggleListening} style={{
              width:30,height:30,borderRadius:"50%",border:`1.5px solid ${listening?P.p50:P.border}`,
              background:listening?P.p10:"none",color:listening?P.p60:P.muted,cursor:"pointer",fontSize:13,
            }} title={listening?"Listening — click to mute":"Click to start listening"}>
            {listening?"🎙":"🔇"}
          </button>)}
          <button onClick={()=>setFull(true)} title="Fill the screen — live body double" style={{
            width:30,height:30,borderRadius:"50%",border:`1.5px solid ${P.border}`,
            background:"none",color:P.p50,cursor:"pointer",fontSize:13,
          }}>⛶</button>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:18,fontWeight:800,color:P.p50}}>{sMin}m</div>
            <div style={{fontSize:10,color:P.muted}}>focused</div>
          </div>
        </div>
      </div>

      {pro&&voiceOn&&voiceSupported&&(
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,padding:"6px 10px",background:P.surface,borderRadius:8,border:`1px solid ${P.border}`}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:listening?P.p60:P.dim,animation:listening?"pulse 1.4s ease-in-out infinite":"none"}}/>
          <span style={{fontSize:11,color:P.muted}}>{listening?"Listening — just talk naturally":speaking?"Speaking…":"Voice paused — tap mic to resume"}</span>
        </div>
      )}

      <div ref={chatRef} style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
        {msgs.map(msg=>(
          <div key={msg.id} style={{display:"flex",gap:8,flexDirection:msg.role==="user"?"row-reverse":"row",alignItems:"flex-end"}}>
            {msg.role==="assistant"&&<div style={{width:24,height:24,borderRadius:"50%",background:P.surface,border:`1px solid ${P.p40}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden"}}><AvatarFace avatar={avatar} size={30} blink={false}/></div>}
            <div style={{maxWidth:"78%",padding:"9px 12px",lineHeight:1.5,fontSize:12,borderRadius:msg.role==="user"?"12px 12px 4px 12px":"4px 12px 12px 12px",
              background:msg.role==="user"?P.p30:P.card,border:`1px solid ${msg.role==="user"?P.p40:(msg.proactive?P.p30:P.border)}`,
              color:msg.role==="user"?P.text:P.textSub}}>
              {msg.proactive&&<span style={{fontSize:10,color:P.p40,display:"block",marginBottom:2}}>● unprompted</span>}
              {msg.checkin&&<span style={{fontSize:10,color:P.p40,display:"block",marginBottom:2}}>⏰ check-in</span>}
              {msg.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:8,alignItems:"flex-end"}}><div style={{width:24,height:24,borderRadius:"50%",background:P.surface,border:`1px solid ${P.p40}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><AvatarFace avatar={avatar} size={30} blink={blink} mood="thinking"/></div><div style={{padding:"10px 16px",borderRadius:"4px 12px 12px 12px",background:P.card,border:`1px solid ${P.border}`,fontSize:18,letterSpacing:4,color:P.muted}}>···</div></div>}
      </div>

      {pro?(<>
        <div style={{display:"flex",gap:5,marginBottom:8}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={voiceOn&&voiceSupported?`Or type to ${comp.name}…`:`Talk to ${comp.name}…`} style={inp}/>
          <Btn onClick={send} sm disabled={loading||!input.trim()}>→</Btn>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
          {["I got distracted 😬","Finished a chunk 🎉","I'm stuck","Need a pep talk"].map(q=><Tag key={q} onClick={()=>setInput(q)}>{q}</Tag>)}
        </div>
      </>):(
        <div style={{padding:"10px 13px",background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,marginBottom:12}}>
          <p style={{fontSize:11,color:P.muted,lineHeight:1.5,marginBottom:8}}>{comp.name} is keeping you company. <span style={{color:P.p50,fontWeight:600}}>Want them to really talk with you?</span> Pro makes them live — they listen, respond and react to your progress.</p>
          <Btn sm full onClick={()=>window.dispatchEvent(new Event("c_pro_needed"))}>✦ Go live — {PRICE_LIFETIME} once, unlocks everything</Btn>
        </div>
      )}
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={()=>setVoiceOn(v=>!v)} ghost sm>{voiceOn?"🔇 Mute voice":"🎙 Unmute voice"}</Btn>
        <Btn onClick={end} full ghost>End session</Btn>
      </div>
    </div>
  );
}

// ── NOVELTY ──────────────────────────────────────────────
const SPINS=[
  {label:"Teach it",     p:"Explain what you're working on as if teaching an enthusiastic 10-year-old. What's the simplest version?"},
  {label:"Opposite",     p:"What would the complete opposite approach to this look like? Sometimes constraint reveals clarity."},
  {label:"10-min version",p:"If you had to finish this in exactly 10 minutes, what one thing would you actually do?"},
  {label:"Change medium",p:"Switch how you're working — voice memo instead of typing, whiteboard instead of screen, walk while thinking."},
  {label:"New location", p:"Move somewhere completely different before continuing. New space activates a new brain state."},
  {label:"Reward first", p:"Define the exact reward you'll give yourself the moment this is done. Make it specific and real."},
  {label:"Who else?",    p:"Who else has solved a problem exactly like this? What would they do differently than you?"},
  {label:"Sensory reset",p:"Go outside for 90 seconds. No phone. Just exist somewhere different, then return."},
];

function NoveltyPanel(){
  const [task,setTask]=useState("");
  const [spin,setSpin]=useState(null);
  const [aiIdea,setAi]=useState("");
  const [loading,setLoad]=useState(false);
  const [hist,setHist]=usePersist("c_nov_h",[]);
  const rand=()=>{setSpin(SPINS[Math.floor(Math.random()*SPINS.length)]);setAi("");};
  const getAi=async()=>{
    if(!task.trim())return;setLoad(true);setAi("");
    const r=await claude(`Someone with ADHD is bored or stuck on: "${task}". Give them ONE specific, surprising reframe or micro-challenge to make it feel fresh. Playful, concrete, under 50 words. One vivid idea only.`,null,150);
    setAi(r);setSpin(null);setHist(p=>[{id:Date.now(),task:task.trim(),idea:r,ts:ts()},...p.slice(0,7)]);setLoad(false);
  };
  return(
    <div>
      <Lbl>Novelty engine</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>Bored? Stuck? Brain checked out? Make it feel new again.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:10}}>
        {SPINS.slice(0,6).map(s=>(
          <button key={s.label} onClick={()=>{setSpin(s);setAi("");}} style={{padding:"8px 10px",borderRadius:10,border:`1px solid ${spin?.label===s.label?P.borderHi:P.border}`,background:spin?.label===s.label?P.lift:"none",color:spin?.label===s.label?P.p60:P.muted,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:FONT,textAlign:"left"}}>{s.label}</button>
        ))}
      </div>
      <Btn onClick={rand} full ghost>✳ Random spin</Btn>
      {spin&&(<Card style={{padding:14,marginTop:12,marginBottom:14}}><Lbl>{spin.label}</Lbl><p style={{fontSize:13,color:P.text,lineHeight:1.7}}>{spin.p}</p></Card>)}
      <Divider/>
      <Lbl>AI novelty for your task</Lbl>
      <input value={task} onChange={e=>setTask(e.target.value)} onKeyDown={e=>e.key==="Enter"&&getAi()} placeholder="What are you working on?" style={{...inp,marginBottom:8}}/>
      <Btn onClick={getAi} full loading={loading}>✦ Make it interesting</Btn>
      {aiIdea&&(<Card style={{padding:14,marginTop:12}}><Lbl>Fresh angle</Lbl><p style={{fontSize:13,color:P.text,lineHeight:1.7}}>{aiIdea}</p></Card>)}
      {hist.length>0&&(<><Divider/><Lbl>Recent sparks</Lbl>
        <div style={{maxHeight:150,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
          {hist.map(h=>(
            <div key={h.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:9,padding:"8px 11px"}}>
              <div style={{fontSize:10,color:P.muted,marginBottom:3}}>{h.ts} · {h.task}</div>
              <p style={{fontSize:12,color:P.textSub,lineHeight:1.4}}>{h.idea}</p>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ── ASYNC ──────────────────────────────────────────────
const SC={"waiting":P.p30,"in-progress":P.p50,"blocked":P.p20,"done":P.p40};

function AsyncPanel(){
  const [threads,setThreads]=usePersist("c_async",[]);
  const [open,setOpen]=useState(null);
  const [adding,setAdding]=useState(false);
  const [newT,setNewT]=useState({title:"",waiting:"",context:"",status:"in-progress"});
  const [loading,setLoad]=useState(null);
  const add=()=>{if(!newT.title.trim())return;setThreads(p=>[...p,{id:Date.now(),...newT,notes:"",summary:"",created:ds()}]);setNewT({title:"",waiting:"",context:"",status:"in-progress"});setAdding(false);};
  const upd=(id,patch)=>setThreads(p=>p.map(t=>t.id===id?{...t,...patch}:t));
  const del=id=>{setThreads(p=>p.filter(t=>t.id!==id));if(open===id)setOpen(null);};
  const summarize=async t=>{
    setLoad(t.id);
    const r=await claude(`Summarize this async work thread for someone with ADHD re-orienting. 3 bullets: what's done, what's blocking, exact next action. Plain text bullets with •.\n\nThread: "${t.title}"\nWaiting on: "${t.waiting||"nothing"}"\nNotes: "${t.notes||t.context||"none"}"`,null,200);
    upd(t.id,{summary:r});setLoad(null);
  };
  return(
    <div>
      <Lbl>Follow-ups</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:12}}>Everything you're waiting on someone else for — replies, orders, approvals, slow conversations. Re-orient instantly when one comes back.</p>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{Object.keys(SC).map(s=>{const ct=threads.filter(t=>t.status===s).length;return ct>0?<Pill key={s} label={`${s} (${ct})`} color={SC[s]}/>:null;})}</div>
        <Btn onClick={()=>setAdding(a=>!a)} sm>+ Thread</Btn>
      </div>
      {adding&&(
        <Card style={{padding:14,marginBottom:12}}>
          <Lbl>New thread</Lbl>
          <input value={newT.title} onChange={e=>setNewT(p=>({...p,title:e.target.value}))} placeholder="What is this thread about?" style={{...inp,marginBottom:8}}/>
          <input value={newT.waiting} onChange={e=>setNewT(p=>({...p,waiting:e.target.value}))} placeholder="Waiting on…" style={{...inp,marginBottom:8}}/>
          <textarea value={newT.context} onChange={e=>setNewT(p=>({...p,context:e.target.value}))} placeholder="Context / where you left off…" rows={3} style={{...inp,resize:"none",marginBottom:10}}/>
          <div style={{display:"flex",gap:4,marginBottom:12}}>{["waiting","in-progress","blocked","done"].map(s=><Tag key={s} active={newT.status===s} onClick={()=>setNewT(p=>({...p,status:s}))}>{s}</Tag>)}</div>
          <Btn onClick={add} full>Save thread</Btn>
        </Card>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:360,overflowY:"auto"}}>
        {threads.length===0&&<p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"20px 0"}}>No threads yet.</p>}
        {threads.map(t=>{
          const isOpen=open===t.id;
          return(
            <div key={t.id} style={{background:P.surface,border:`1px solid ${isOpen?P.borderHi:P.border}`,borderRadius:12,overflow:"hidden",transition:"border-color 0.2s"}}>
              <div onClick={()=>setOpen(isOpen?null:t.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"11px 13px",cursor:"pointer"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:SC[t.status]||P.p40,flexShrink:0}}/>
                <span style={{flex:1,fontSize:13,color:P.text,fontWeight:500}}>{t.title}</span>
                {t.waiting&&<span style={{fontSize:11,color:P.muted,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>↷ {t.waiting}</span>}
                <span style={{fontSize:11,color:P.muted}}>{isOpen?"▴":"▾"}</span>
              </div>
              {isOpen&&(
                <div style={{padding:"0 13px 13px",borderTop:`1px solid ${P.border}`}}>
                  <div style={{display:"flex",gap:4,marginTop:10,marginBottom:12,flexWrap:"wrap"}}>{["waiting","in-progress","blocked","done"].map(s=><Tag key={s} active={t.status===s} onClick={()=>upd(t.id,{status:s})}>{s}</Tag>)}</div>
                  <Lbl>Notes</Lbl>
                  <textarea defaultValue={t.notes||t.context} onBlur={e=>upd(t.id,{notes:e.target.value})} placeholder="What happened, what's next…" rows={4} style={{...inp,resize:"none",marginBottom:12}}/>
                  <Btn onClick={()=>summarize(t)} full loading={loading===t.id}>✦ AI re-entry summary</Btn>
                  {t.summary&&(<Card style={{padding:13,marginTop:12}}><Lbl>Re-entry</Lbl><p style={{fontSize:12,color:P.text,lineHeight:1.9,whiteSpace:"pre-line"}}>{t.summary}</p></Card>)}
                  <button onClick={()=>del(t.id)} style={{marginTop:12,background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.muted,fontSize:11,cursor:"pointer",padding:"4px 10px",fontFamily:FONT}}>Remove</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EMOTION ──────────────────────────────────────────────
const EMOTIONS=[
  {e:"😶‍🌫️",l:"Numb"},{e:"😤",l:"Frustrated"},{e:"😰",l:"Anxious"},{e:"😴",l:"Exhausted"},
  {e:"🫀",l:"Restless"},{e:"😢",l:"Sad"},{e:"😊",l:"Good"},{e:"🤩",l:"Charged"},
  {e:"😕",l:"Confused"},{e:"😡",l:"Angry"},{e:"🥹",l:"Overwhelmed"},{e:"😌",l:"Calm"},
];
const ERESP={
  "Anxious":"That anxious feeling is real. Try 4-7-8 breathing: in 4, hold 7, out 8. Then name 3 things you can see.",
  "Frustrated":"Frustration often means you care. Take 2 minutes away before continuing.",
  "Exhausted":"Exhaustion is data, not weakness. Have you eaten and had water recently?",
  "Numb":"Numbness can mean your nervous system is overwhelmed. Something physical helps — shake your hands out.",
  "Restless":"Restlessness has energy in it. Move your body for 5 minutes first.",
  "Sad":"You don't have to push through sadness. Can you do one small kind thing for yourself?",
  "Overwhelmed":"When everything's too much, pick just one thing. One tiny thing. Nothing else exists right now.",
  "Angry":"Anger carries information. Write what you're angry about in 3 sentences before doing anything.",
  "Confused":"Write down exactly what you're confused about — often that's enough to start untangling it.",
};

function EmotionPanel(){
  const [sel,setSel]=useState(null);
  const [log,setLog]=usePersist("c_emo_log",[]);
  const [aiR,setAiR]=useState("");
  const [loading,setLoad]=useState(false);
  const pick=e=>{setSel(e);setAiR("");setLog(p=>[{id:Date.now(),e:e.e,l:e.l,ts:ts()},...p.slice(0,19)]);};
  const getAi=async()=>{
    if(!sel)return;setLoad(true);
    const r=await claude(`Someone with ADHD says they feel: "${sel.l}". Give 2-3 sentences of warm, practical support. No toxic positivity. Real acknowledgment + one concrete thing they can do right now.`,null,150);
    setAiR(r);setLoad(false);
  };
  return(
    <div>
      <Lbl>Emotion check</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>ADHD makes emotions harder to identify and regulate. Name it first.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:16}}>
        {EMOTIONS.map(em=>(
          <button key={em.l} onClick={()=>pick(em)} style={{padding:"10px 6px",borderRadius:10,textAlign:"center",cursor:"pointer",fontFamily:FONT,border:`1px solid ${sel?.l===em.l?P.borderHi:P.border}`,background:sel?.l===em.l?P.lift:"none",transition:"all 0.15s"}}>
            <div style={{fontSize:22,marginBottom:3}}>{em.e}</div>
            <div style={{fontSize:10,color:sel?.l===em.l?P.p60:P.muted,fontWeight:600,letterSpacing:0.3}}>{em.l}</div>
          </button>
        ))}
      </div>
      {sel&&(<>
        {ERESP[sel.l]&&(<Card style={{padding:14,marginBottom:12}}><p style={{fontSize:13,color:P.text,lineHeight:1.7}}>{ERESP[sel.l]}</p></Card>)}
        <Btn onClick={getAi} full ghost loading={loading}>✦ More support from AI</Btn>
        {aiR&&(<Card style={{padding:14,marginTop:12}}><p style={{fontSize:13,color:P.text,lineHeight:1.7}}>{aiR}</p></Card>)}
      </>)}
      {log.length>0&&(<><Divider/><Lbl>Emotion log</Lbl>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",maxHeight:100,overflowY:"auto"}}>
          {log.map(l=>(
            <div key={l.id} style={{display:"flex",alignItems:"center",gap:4,background:P.surface,border:`1px solid ${P.border}`,borderRadius:8,padding:"4px 8px",fontSize:11,color:P.muted}}>
              <span>{l.e}</span><span style={{color:P.textSub,fontWeight:600}}>{l.l}</span><span>{l.ts}</span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ── INTENTION ──────────────────────────────────────────────
function IntentionPanel(){
  const [intention,setIntention]=usePersist("c_intent","");
  const [saved,setSaved]=usePersist("c_intent_h",[]);
  const [aiI,setAiI]=useState("");
  const [ctx,setCtx]=useState("");
  const [loading,setLoad]=useState(false);
  const [mode,setMode]=useState("set");
  const save=()=>{if(!intention.trim())return;setSaved(p=>[{id:Date.now(),text:intention.trim(),ts:ts(),date:ds()},...p.slice(0,9)]);};
  const getAi=async()=>{
    if(!ctx.trim())return;setLoad(true);
    const r=await claude(`Someone with ADHD needs a session intention. Their context: "${ctx}". Write a clear, grounding intention in 1-2 sentences. Start with "This session I will…" or "Today I'm here to…". Specific and achievable.`,null,100);
    setAiI(r.trim());setLoad(false);
  };
  const today=saved.filter(s=>s.date===ds());
  return(
    <div>
      <Lbl>Session intention</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>Starting without an intention is like driving without a destination.</p>
      <div style={{display:"flex",gap:4,marginBottom:14}}>
        <Tag active={mode==="set"} onClick={()=>setMode("set")}>Set intention</Tag>
        <Tag active={mode==="reflect"} onClick={()=>setMode("reflect")}>Reflect</Tag>
      </div>
      {mode==="set"&&(<>
        <Lbl>What do you intend to do this session?</Lbl>
        <textarea value={intention} onChange={e=>setIntention(e.target.value)} placeholder="e.g. I will write the first 3 paragraphs without switching tabs." rows={3} style={{...inp,resize:"none",lineHeight:1.6,marginBottom:10}}/>
        <Btn onClick={save} full>Set intention</Btn>
        <Divider/>
        <Lbl>Let AI write it — what's your context?</Lbl>
        <input value={ctx} onChange={e=>setCtx(e.target.value)} onKeyDown={e=>e.key==="Enter"&&getAi()} placeholder="e.g. 45 min, scattered, need to email my boss…" style={{...inp,marginBottom:8}}/>
        <Btn onClick={getAi} full ghost loading={loading}>✦ Write my intention</Btn>
        {aiI&&(<Card style={{padding:14,marginTop:12}}>
          <p style={{fontSize:14,color:P.p60,lineHeight:1.7,fontStyle:"italic"}}>{aiI}</p>
          <button onClick={()=>{setIntention(aiI);setAiI("");}} style={{marginTop:8,background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.p50,fontSize:12,cursor:"pointer",padding:"4px 10px",fontFamily:FONT}}>Use this</button>
        </Card>)}
        {today.length>0&&(<><Divider/><Lbl>Today's intentions</Lbl>
          {today.map(s=>(
            <div key={s.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:"9px 12px",marginBottom:5}}>
              <div style={{fontSize:10,color:P.muted,marginBottom:3}}>{s.ts}</div>
              <p style={{fontSize:12,color:P.text,lineHeight:1.5}}>{s.text}</p>
            </div>
          ))}
        </>)}
      </>)}
      {mode==="reflect"&&(<>
        <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>Look back honestly before moving on.</p>
        {saved.length===0&&<p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"20px 0"}}>No intentions set yet.</p>}
        {saved.slice(0,8).map(s=>(
          <div key={s.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:"10px 13px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:10,color:P.muted}}>{s.date}</span>
              <span style={{fontSize:10,color:P.muted}}>{s.ts}</span>
            </div>
            <p style={{fontSize:12,color:P.text,lineHeight:1.5}}>{s.text}</p>
          </div>
        ))}
      </>)}
    </div>
  );
}

// ── NOTEBOOKS ──────────────────────────────────────────────
const DEFAULT_NBS=[
  {id:"home",     label:"Home",     icon:"🏠",pages:[]},
  {id:"exercise", label:"Exercise", icon:"🏋", pages:[]},
  {id:"finances", label:"Finances", icon:"💸", pages:[]},
  {id:"food",     label:"Food",     icon:"🍽", pages:[]},
  {id:"spiritual",label:"Spiritual",icon:"🕊", pages:[]},
  {id:"code",     label:"Code",     icon:"⌨",  pages:[]},
  {id:"ideas",    label:"Ideas",    icon:"💡", pages:[]},
  {id:"health",   label:"Health",   icon:"🩺", pages:[]},
  {id:"people",   label:"People",   icon:"👥", pages:[]},
  {id:"goals",    label:"Goals",    icon:"🎯", pages:[]},
];
const ICONS="🏠🏋💸🍽🕊⌨💡🩺🌿✈📖🎵🎨🐾⚡🌙🔬🎯📦🛒🧘💼🌱🔑🏔🌊🔥❤✦◉🧠🌸🦋🎪🔮🧩".split("");

function NotebooksScreen({onClose}){
  const [nbs,setNbs]=usePersist("c_nbs",DEFAULT_NBS);
  const [openNb,setOpenNb]=useState(null);
  const [openPage,setOpenPage]=useState(null);
  const [iconPicker,setIconPicker]=useState(null);
  const [renaming,setRenaming]=useState(null);
  const [renameText,setRenameText]=useState("");
  const [newPage,setNewPage]=useState({title:"",content:""});
  const [addingNb,setAddingNb]=useState(false);
  const [newNbLabel,setNewNbLabel]=useState("");
  const [search,setSearch]=useState("");
  const nb=nbs.find(n=>n.id===openNb);
  const page=nb?.pages?.find(p=>p.id===openPage);
  const upd=(id,patch)=>setNbs(p=>p.map(n=>n.id===id?{...n,...patch}:n));
  const addPage=()=>{if(!newPage.title.trim())return;const pg={id:Date.now(),title:newPage.title.trim(),content:newPage.content,created:ds()};upd(openNb,{pages:[...(nb?.pages||[]),pg]});setNewPage({title:"",content:""});};
  const delPage=(nbId,pgId)=>{setNbs(p=>p.map(n=>n.id===nbId?{...n,pages:n.pages.filter(pg=>pg.id!==pgId)}:n));if(openPage===pgId)setOpenPage(null);};
  const addNb=()=>{if(!newNbLabel.trim())return;setNbs(p=>[...p,{id:Date.now().toString(),label:newNbLabel.trim(),icon:"📓",pages:[]}]);setNewNbLabel("");setAddingNb(false);};

  if(openPage&&nb&&page)return(
    <div style={{position:"fixed",inset:0,background:P.bg,zIndex:400,display:"flex",flexDirection:"column",fontFamily:FONT}}>
      <div style={{background:P.surface,borderBottom:`1px solid ${P.border}`,padding:"12px 20px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setOpenPage(null)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:22,lineHeight:1}}>←</button>
        <span style={{fontSize:16,fontWeight:700,color:P.text,flex:1}}>{page.title}</span>
        <span style={{fontSize:11,color:P.muted}}>{page.created}</span>
      </div>
      <div style={{flex:1,padding:"24px",overflow:"auto",maxWidth:760,margin:"0 auto",width:"100%"}}>
        <textarea defaultValue={page.content}
          onBlur={e=>upd(openNb,{pages:nb.pages.map(pg=>pg.id===openPage?{...pg,content:e.target.value}:pg)})}
          placeholder="Write anything… this page is yours."
          style={{...inp,height:"100%",resize:"none",lineHeight:1.9,fontSize:15,minHeight:"65vh",padding:"18px"}}/>
      </div>
    </div>
  );

  if(openNb&&nb){
    const pages=search?nb.pages?.filter(p=>p.title.toLowerCase().includes(search.toLowerCase())):nb.pages||[];
    return(
      <div style={{position:"fixed",inset:0,background:P.bg,zIndex:300,display:"flex",flexDirection:"column",fontFamily:FONT}}>
        <div style={{background:P.surface,borderBottom:`1px solid ${P.border}`,padding:"12px 20px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>{setOpenNb(null);setSearch("");}} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:22,lineHeight:1}}>←</button>
          <span style={{fontSize:22}}>{nb.icon}</span>
          <span style={{fontSize:18,fontWeight:800,color:P.text,letterSpacing:-0.5,flex:1}}>{nb.label}</span>
          <span style={{fontSize:12,color:P.muted}}>{nb.pages?.length||0} pages</span>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"20px 24px"}}>
          <Card style={{padding:16,marginBottom:20}}>
            <Lbl>New page</Lbl>
            <input value={newPage.title} onChange={e=>setNewPage(p=>({...p,title:e.target.value}))} placeholder="Page title…" style={{...inp,marginBottom:8}}/>
            <textarea value={newPage.content} onChange={e=>setNewPage(p=>({...p,content:e.target.value}))} placeholder="Starting content (optional)…" rows={2} style={{...inp,resize:"none",marginBottom:10}}/>
            <Btn onClick={addPage}>Create page</Btn>
          </Card>
          {pages.length===0&&<p style={{color:P.muted,fontSize:13,textAlign:"center",padding:"32px 0"}}>No pages yet.</p>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12}}>
            {pages.map(pg=>(
              <div key={pg.id} onClick={()=>setOpenPage(pg.id)} style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:14,padding:"14px",cursor:"pointer",position:"relative",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=P.borderHi;e.currentTarget.style.background=P.hover;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=P.border;e.currentTarget.style.background=P.card;}}>
                <div style={{fontSize:13,fontWeight:700,color:P.text,marginBottom:4,lineHeight:1.3}}>{pg.title}</div>
                <div style={{fontSize:10,color:P.muted,marginBottom:8}}>{pg.created}</div>
                <div style={{fontSize:12,color:P.textSub,lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical"}}>{pg.content||"Empty — click to write"}</div>
                <button onClick={e=>{e.stopPropagation();delPage(nb.id,pg.id);}} style={{position:"absolute",top:8,right:8,background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:15,opacity:0.5,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const filteredNbs=search?nbs.filter(n=>n.label.toLowerCase().includes(search.toLowerCase())):nbs;
  return(
    <div style={{position:"fixed",inset:0,background:P.bg,zIndex:200,display:"flex",flexDirection:"column",fontFamily:FONT}}>
      <div style={{background:P.surface,borderBottom:`1px solid ${P.border}`,padding:"14px 24px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:22,lineHeight:1}}>←</button>
        <span style={{fontSize:20,fontWeight:800,color:P.text,letterSpacing:-0.5}}>Life Library</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...inp,width:160,marginLeft:"auto",padding:"7px 12px",fontSize:12}}/>
        <Btn onClick={()=>setAddingNb(a=>!a)} sm>+ Notebook</Btn>
      </div>
      {addingNb&&(
        <div style={{background:P.surface,borderBottom:`1px solid ${P.border}`,padding:"12px 24px",display:"flex",gap:8,alignItems:"center"}}>
          <input value={newNbLabel} onChange={e=>setNewNbLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNb()} placeholder="Notebook name…" style={{...inp,width:220,padding:"7px 12px",fontSize:12}} autoFocus/>
          <Btn onClick={addNb} sm>Create</Btn>
          <button onClick={()=>setAddingNb(false)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:20}}>×</button>
        </div>
      )}
      <div style={{flex:1,overflow:"auto",padding:"28px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:14}}>
          {filteredNbs.map(nb=>(
            <div key={nb.id} style={{position:"relative"}}>
              {iconPicker===nb.id&&(
                <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:100,background:P.card,border:`1px solid ${P.border}`,borderRadius:14,padding:"12px",width:220,boxShadow:"0 12px 48px #00000070"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                    {ICONS.map(ic=>(
                      <button key={ic} onClick={()=>{upd(nb.id,{icon:ic});setIconPicker(null);}} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"4px",borderRadius:6,fontFamily:FONT}}>{ic}</button>
                    ))}
                  </div>
                </div>
              )}
              <div onClick={()=>{if(iconPicker!==nb.id)setOpenNb(nb.id);}} style={{background:P.card,border:`1px solid ${P.border}`,borderRadius:16,padding:"20px 16px",cursor:"pointer",textAlign:"center",transition:"all 0.15s",userSelect:"none"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=P.borderHi;e.currentTarget.style.background=P.hover;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=P.border;e.currentTarget.style.background=P.card;}}>
                <button onClick={e=>{e.stopPropagation();setIconPicker(iconPicker===nb.id?null:nb.id);}} style={{fontSize:38,background:"none",border:"none",cursor:"pointer",display:"block",margin:"0 auto 10px",lineHeight:1}}>{nb.icon}</button>
                {renaming===nb.id?(
                  <input autoFocus value={renameText} onChange={e=>setRenameText(e.target.value)}
                    onBlur={()=>{upd(nb.id,{label:renameText||nb.label});setRenaming(null);}}
                    onKeyDown={e=>{if(e.key==="Enter"){upd(nb.id,{label:renameText||nb.label});setRenaming(null);}}}
                    onClick={e=>e.stopPropagation()} style={{...inp,textAlign:"center",padding:"4px 8px",fontSize:13,fontWeight:700}}/>
                ):(
                  <div onDoubleClick={e=>{e.stopPropagation();setRenaming(nb.id);setRenameText(nb.label);}} style={{fontSize:13,fontWeight:700,color:P.text,lineHeight:1.2}}>{nb.label}</div>
                )}
                <div style={{fontSize:11,color:P.muted,marginTop:5}}>{nb.pages?.length||0} page{nb.pages?.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setNbs(p=>p.filter(n=>n.id!==nb.id))} style={{position:"absolute",top:8,right:8,background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:14,opacity:0.4,lineHeight:1}}>×</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:"10px 24px",borderTop:`1px solid ${P.border}`,background:P.surface}}>
        <p style={{fontSize:11,color:P.muted,letterSpacing:0.3}}>Tap to open · Tap icon to change · Double-tap name to rename</p>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────
// ── DISCIPLINE PANEL ──────────────────────────────────────────
// ADHD self-discipline is about building self-trust through tiny kept promises,
// not willpower. This panel focuses on: commitment contracts, streak tracking
// for micro-habits, a "pattern mirror" (shows your actual follow-through),
// and AI coaching that's honest but not punishing.

const DISCIPLINE_AREAS=[
  {id:"start",    label:"Starting tasks",    icon:"🚀"},
  {id:"finish",   label:"Finishing things",  icon:"🏁"},
  {id:"follow",   label:"Following through", icon:"🤝"},
  {id:"impulse",  label:"Impulse control",   icon:"⚡"},
  {id:"routine",  label:"Sticking to routines",icon:"🔄"},
  {id:"phone",    label:"Phone/distraction", icon:"📵"},
  {id:"time",     label:"Time awareness",    icon:"⏰"},
  {id:"promises", label:"Keeping promises to myself",icon:"💜"},
];

const COMMITMENT_DURATION=[
  {label:"Today only", days:1},
  {label:"3 days",     days:3},
  {label:"1 week",     days:7},
  {label:"2 weeks",    days:14},
];

async function aiDisciplineCoach(context){
  return await claude(
    `You are a compassionate, honest ADHD discipline coach. Someone shared this with you: "${context}". 
    Give them 2-3 sentences of real, practical insight — acknowledge the ADHD-specific challenge (this isn't about laziness or weakness), and offer ONE concrete micro-action they can take today. 
    Be warm, direct, no toxic positivity. Plain text only.`,
    null, 180
  );
}

async function aiPatternInsight(commitments){
  const summary = commitments.map(c=>`"${c.text}" — kept ${c.kept} of ${c.total} days`).join(", ");
  return await claude(
    `An ADHD person has these self-discipline patterns: ${summary}. 
    Give them 1-2 sentences of honest, kind pattern recognition — what does this tell them about themselves? What's one thing to try differently? No lists, plain text.`,
    null, 150
  );
}

function DisciplinePanel(){
  const [tab,setTab]=useState("commit");
  const [commitments,setCommitments]=usePersist("c_disc_commits",[]);
  const [newC,setNewC]=useState({text:"",area:"start",days:1});
  const [reflection,setRefl]=useState("");
  const [aiReply,setAiR]=useState("");
  const [loading,setLoad]=useState(false);
  const [patternAi,setPatAi]=useState("");
  const [patLoading,setPatLoad]=useState(false);
  const [adding,setAdding]=useState(false);

  // Mark today's check-in on a commitment
  const checkIn=(id,kept)=>{
    const today=ds();
    setCommitments(p=>p.map(c=>{
      if(c.id!==id) return c;
      if(c.checkins?.find(ch=>ch.date===today)) return c; // already checked today
      const checkins=[...(c.checkins||[]),{date:today,kept}];
      const keptCount=checkins.filter(ch=>ch.kept).length;
      return{...c,checkins,kept:keptCount,total:checkins.length};
    }));
  };

  const addCommitment=()=>{
    if(!newC.text.trim()) return;
    setCommitments(p=>[...p,{
      id:Date.now(),text:newC.text.trim(),area:newC.area,
      days:newC.days,kept:0,total:0,checkins:[],
      created:ds(),
    }]);
    setNewC({text:"",area:"start",days:1}); setAdding(false);
  };

  const del=id=>setCommitments(p=>p.filter(c=>c.id!==id));

  const getCoaching=async()=>{
    if(!reflection.trim()) return;
    setLoad(true);
    const r=await aiDisciplineCoach(reflection);
    setAiR(r); setLoad(false);
  };

  const getPattern=async()=>{
    if(commitments.length===0) return;
    setPatLoad(true);
    const r=await aiPatternInsight(commitments);
    setPatAi(r); setPatLoad(false);
  };

  const today=ds();
  const active=commitments.filter(c=>c.total<c.days);
  const completed=commitments.filter(c=>c.total>=c.days);

  const pct=c=>c.total>0?Math.round((c.kept/c.total)*100):0;
  const todayChecked=c=>c.checkins?.some(ch=>ch.date===today);

  return(
    <div>
      <Lbl>Self-discipline</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:12}}>
        ADHD discipline isn't about willpower — it's about building self-trust through tiny kept promises.
      </p>

      <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
        {[["commit","Commitments"],["reflect","Reflect"],["pattern","Pattern"]].map(([id,lab])=>(
          <Tag key={id} active={tab===id} onClick={()=>setTab(id)}>{lab}</Tag>
        ))}
      </div>

      {/* ── COMMITMENTS TAB ── */}
      {tab==="commit"&&(<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:12,color:P.muted}}>{active.length} active</span>
          <Btn onClick={()=>setAdding(a=>!a)} sm>+ New</Btn>
        </div>

        {adding&&(
          <Card style={{padding:14,marginBottom:12}}>
            <Lbl>New commitment</Lbl>
            <input value={newC.text} onChange={e=>setNewC(p=>({...p,text:e.target.value}))}
              placeholder="I will… (keep it tiny and specific)"
              style={{...inp,marginBottom:8}}/>
            <div style={{marginBottom:8}}>
              <Lbl>Area</Lbl>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {DISCIPLINE_AREAS.map(a=>(
                  <Tag key={a.id} active={newC.area===a.id} onClick={()=>setNewC(p=>({...p,area:a.id}))}>
                    {a.icon} {a.label}
                  </Tag>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <Lbl>Duration</Lbl>
              <div style={{display:"flex",gap:4}}>
                {COMMITMENT_DURATION.map(d=>(
                  <Tag key={d.days} active={newC.days===d.days} onClick={()=>setNewC(p=>({...p,days:d.days}))}>{d.label}</Tag>
                ))}
              </div>
            </div>
            <div style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:8,padding:"10px 12px",marginBottom:12}}>
              <p style={{fontSize:12,color:P.muted,lineHeight:1.5}}>
                💡 Make it <strong style={{color:P.p50}}>tiny</strong>. "I will open the doc" beats "I will write 2000 words." 
                Small kept promises rebuild self-trust faster than big broken ones.
              </p>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn onClick={addCommitment} full disabled={!newC.text.trim()}>Make this commitment</Btn>
              <Btn onClick={()=>setAdding(false)} ghost sm>Cancel</Btn>
            </div>
          </Card>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:340,overflowY:"auto"}}>
          {active.length===0&&!adding&&(
            <p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"20px 0"}}>
              No active commitments. Start with something tiny.
            </p>
          )}
          {active.map(c=>{
            const area=DISCIPLINE_AREAS.find(a=>a.id===c.area);
            const checked=todayChecked(c);
            const daysLeft=c.days-c.total;
            return(
              <div key={c.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:12,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8}}>
                  <span style={{fontSize:16}}>{area?.icon||"◆"}</span>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,color:P.text,fontWeight:500,lineHeight:1.3}}>{c.text}</p>
                    <p style={{fontSize:11,color:P.muted,marginTop:2}}>{daysLeft} day{daysLeft!==1?"s":""} left · {pct(c)}% kept</p>
                  </div>
                  <button onClick={()=>del(c.id)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>
                </div>
                {/* Progress bar */}
                <div style={{height:3,background:P.dim,borderRadius:999,overflow:"hidden",marginBottom:10}}>
                  <div style={{height:"100%",width:`${pct(c)}%`,background:pct(c)>=70?P.p50:pct(c)>=40?P.p40:P.p30,transition:"width 0.3s",borderRadius:999}}/>
                </div>
                {/* Today's check-in */}
                {!checked?(
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>checkIn(c.id,true)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${P.borderHi}`,background:P.lift,color:P.p60,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>
                      ✓ I kept it today
                    </button>
                    <button onClick={()=>checkIn(c.id,false)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${P.border}`,background:"none",color:P.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
                      Not today
                    </button>
                  </div>
                ):(
                  <div style={{textAlign:"center",fontSize:12,color:P.p50,padding:"6px"}}>
                    ✓ Checked in today
                  </div>
                )}
              </div>
            );
          })}

          {completed.length>0&&(<>
            <Divider/>
            <Lbl>Completed</Lbl>
            {completed.map(c=>(
              <div key={c.id} style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:"10px 13px",opacity:0.65,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:P.p50}}>✦</span>
                <span style={{flex:1,fontSize:12,color:P.text}}>{c.text}</span>
                <span style={{fontSize:11,color:P.muted}}>{pct(c)}%</span>
                <button onClick={()=>del(c.id)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:14}}>×</button>
              </div>
            ))}
          </>)}
        </div>
      </>)}

      {/* ── REFLECT TAB ── */}
      {tab==="reflect"&&(<>
        <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:12}}>
          Tell the AI what you're struggling with or noticing about your discipline. Get honest, kind coaching back.
        </p>
        <div style={{marginBottom:8}}>
          <Lbl>What's on your mind?</Lbl>
          <textarea value={reflection} onChange={e=>setRefl(e.target.value)}
            placeholder={"e.g. I always start strong then fade out after 2 days...\nI say I'll do something and then just don't...\nI don't know why I keep avoiding this one task..."}
            rows={5} style={{...inp,resize:"none",lineHeight:1.6,marginBottom:10}}/>
        </div>
        <Btn onClick={getCoaching} full loading={loading}>✦ Get coaching</Btn>
        {aiReply&&(
          <Card style={{padding:14,marginTop:14}}>
            <Lbl>Coach says</Lbl>
            <p style={{fontSize:13,color:P.text,lineHeight:1.8}}>{aiReply}</p>
          </Card>
        )}

        <Divider/>
        <Card style={{padding:14}}>
          <Lbl>The ADHD discipline truth</Lbl>
          <p style={{fontSize:12,color:P.textSub,lineHeight:1.8}}>
            ADHD brains aren't lazy — they're interest-driven, novelty-seeking, and have real differences in dopamine regulation. "Discipline" for you isn't about forcing yourself harder. It's about designing conditions where the right thing is also the easy thing. Every tiny kept promise rewires your relationship with yourself.
          </p>
        </Card>
      </>)}

      {/* ── PATTERN TAB ── */}
      {tab==="pattern"&&(<>
        <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>
          Your actual follow-through data — no judgment, just information.
        </p>
        {commitments.length===0?(
          <p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"24px 0"}}>
            Make some commitments first and check in daily. Your pattern will show here.
          </p>
        ):(
          <>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              {commitments.slice(0,8).map(c=>{
                const area=DISCIPLINE_AREAS.find(a=>a.id===c.area);
                return(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:13,width:20}}>{area?.icon}</span>
                    <span style={{fontSize:12,color:P.textSub,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.text}</span>
                    <div style={{width:80,height:6,background:P.dim,borderRadius:999,overflow:"hidden",flexShrink:0}}>
                      <div style={{height:"100%",width:`${pct(c)}%`,background:pct(c)>=70?P.p50:pct(c)>=40?P.p40:P.p20,borderRadius:999}}/>
                    </div>
                    <span style={{fontSize:11,color:pct(c)>=70?P.p50:P.muted,width:32,textAlign:"right",fontWeight:600}}>{pct(c)}%</span>
                  </div>
                );
              })}
            </div>
            <Btn onClick={getPattern} full ghost loading={patLoading}>✦ What does my pattern tell me?</Btn>
            {patternAi&&(
              <Card style={{padding:14,marginTop:12}}>
                <Lbl>Pattern insight</Lbl>
                <p style={{fontSize:13,color:P.text,lineHeight:1.8}}>{patternAi}</p>
              </Card>
            )}
          </>
        )}
      </>)}
    </div>
  );
}

// ── FRICTION SLIDER ──────────────────────────────────────────────
const FRICTION_LEVELS=[
  {id:"low",   label:"Low Battery",    e:"🪫",sub:"Whatever you get done today is enough."},
  {id:"normal",label:"Normal",         e:"🔋",sub:"Steady — pick what feels doable."},
  {id:"hyper", label:"Hyperfocused",   e:"⚡",sub:"Locked in — protect this window."},
];
const AFFIRM=[
  "You showed up and checked in. That's the whole job today.",
  "Low battery days are still days you got through. That counts.",
  "No push today. Rest is not falling behind.",
  "You're allowed to do less and still be doing fine.",
  "Three rough days doesn't mean something's wrong with you — it means you're due a break.",
];
function FrictionPanel(){
  const [log,setLog]=usePersist("c_friction_log",[]);
  const [level,setLevel]=usePersist("c_friction_level","normal");
  const [note,setNote]=useState("");
  const now=Date.now();
  const sevenDaysAgo=now-7*24*60*60*1000;
  const recentLows=log.filter(l=>l.level==="low"&&l.at>=sevenDaysAgo).length;
  const supportive=recentLows>=3;
  const pick=id=>{
    setLevel(id);
    setLog(p=>[{at:now,level:id,ts:ts()},...p].slice(0,200));
  };
  return(
    <div>
      <Lbl>Friction slider</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>A quick, honest read on where you're at right now — no guilt either way.</p>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
        {FRICTION_LEVELS.map(l=>(
          <button key={l.id} onClick={()=>pick(l.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:12,border:`1px solid ${level===l.id?P.borderHi:P.border}`,background:level===l.id?P.lift:"none",cursor:"pointer",fontFamily:FONT,textAlign:"left"}}>
            <span style={{fontSize:20}}>{l.e}</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:level===l.id?P.p60:P.text}}>{l.label}</div>
              <div style={{fontSize:11,color:P.muted}}>{l.sub}</div>
            </div>
          </button>
        ))}
      </div>
      {supportive&&(
        <Card style={{padding:14,marginBottom:14}}>
          <Lbl>A few low-battery check-ins lately</Lbl>
          <p style={{fontSize:12,color:P.textSub,lineHeight:1.7,marginTop:6}}>{AFFIRM[recentLows%AFFIRM.length]}</p>
          <p style={{fontSize:11,color:P.muted,marginTop:8}}>This note goes away on its own once things ease up — nothing to do here.</p>
        </Card>
      )}
      {log.length>0&&(
        <>
          <Divider/>
          <Lbl>Recent check-ins</Lbl>
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:140,overflowY:"auto"}}>
            {log.slice(0,10).map((l,i)=>{
              const def=FRICTION_LEVELS.find(x=>x.id===l.level);
              return <div key={i} style={{fontSize:11,color:P.muted,display:"flex",gap:6}}><span>{def?.e}</span><span>{l.ts}</span><span style={{color:P.textSub}}>{def?.label}</span></div>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── ACTIVITY PICKER ──────────────────────────────────────────────
const ACTIVITY_POOL={
  2:[ {id:"a2-1",t:"Stand and stretch your arms overhead"},{id:"a2-2",t:"Reply to one message you've been avoiding"},{id:"a2-3",t:"Clear everything off one small surface"},{id:"a2-4",t:"Drink a full glass of water"},{id:"a2-5",t:"Write down the one thing nagging at you"} ],
  5:[ {id:"a5-1",t:"Sort through 5 minutes of email or messages"},{id:"a5-2",t:"Tidy the surface right in front of you"},{id:"a5-3",t:"Do a 5-minute walk, even just around the room"},{id:"a5-4",t:"Prep something small for later (snack, bag, outfit)"},{id:"a5-5",t:"Skim tomorrow's calendar so it's not a surprise"} ],
  15:[ {id:"a15-1",t:"Knock out the smallest task on your list"},{id:"a15-2",t:"Reply to the 2-3 messages that need real thought"},{id:"a15-3",t:"Do a proper stretch or short walk outside"},{id:"a15-4",t:"Batch-process a pile (mail, laundry, dishes) for 15 min"},{id:"a15-5",t:"Do one thing from your Follow-Ups list"} ],
  20:[ {id:"a20-1",t:"Start the task you've been most avoiding — just the first step"},{id:"a20-2",t:"Do a full reset of one room or workspace"},{id:"a20-3",t:"Batch-cook or meal-prep one thing"},{id:"a20-4",t:"Deep-clean out your Capture log — file or delete everything"},{id:"a20-5",t:"Take a real walk, no phone"} ],
};
function ActivityPanel(){
  const [bucket,setBucket]=usePersist("c_act_bucket",5);
  const [stats,setStats]=usePersist("c_act_stats",{});
  const [current,setCurrent]=useState(null);
  const [shuffled,setShuffled]=useState(false);
  const weight=id=>{const s=stats[id]||{accept:0,shuffle:0,skip:0};return Math.max(0.15,1-s.skip*0.25-s.shuffle*0.1);};
  const bump=(id,field)=>setStats(p=>({...p,[id]:{accept:0,shuffle:0,skip:0,...p[id],[field]:((p[id]?.[field])||0)+1}}));
  const weightedPick=(exclude)=>{
    const pool=ACTIVITY_POOL[bucket].filter(a=>a.id!==exclude);
    const total=pool.reduce((s,a)=>s+weight(a.id),0);
    let r=Math.random()*total;
    for(const a of pool){r-=weight(a.id);if(r<=0)return a;}
    return pool[0];
  };
  const suggest=()=>{setCurrent(weightedPick(null));setShuffled(false);};
  const shuffle=()=>{if(!current||shuffled)return;bump(current.id,"shuffle");setCurrent(weightedPick(current.id));setShuffled(true);};
  const accept=()=>{if(!current)return;bump(current.id,"accept");};
  const skip=()=>{if(!current)return;bump(current.id,"skip");setCurrent(null);setShuffled(false);};
  return(
    <div>
      <Lbl>Activity picker</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>One suggestion, sized to the time you actually have. No list to get lost in.</p>
      <div style={{display:"flex",gap:4,marginBottom:14}}>
        {[2,5,15,20].map(m=>(
          <Tag key={m} active={bucket===m} onClick={()=>{setBucket(m);setCurrent(null);setShuffled(false);}}>{m===20?"20+ min":`${m} min`}</Tag>
        ))}
      </div>
      {!current&&<Btn onClick={suggest} full>✳ Suggest something</Btn>}
      {current&&(
        <Card style={{padding:16,marginBottom:12}}>
          <p style={{fontSize:14,color:P.text,lineHeight:1.6,marginBottom:14}}>{current.t}</p>
          <div style={{display:"flex",gap:6}}>
            <Btn onClick={accept} full>✓ Doing it</Btn>
            <Btn onClick={shuffle} ghost disabled={shuffled}>{shuffled?"No more shuffles":"⟳ Shuffle"}</Btn>
          </div>
          <button onClick={skip} style={{marginTop:10,width:"100%",background:"none",border:"none",color:P.muted,fontSize:11,cursor:"pointer",fontFamily:FONT}}>Not today, skip</button>
        </Card>
      )}
    </div>
  );
}

// ── PARKING LOT ──────────────────────────────────────────────
const PARK_ARCHIVE_MS=30*24*60*60*1000;
function ParkingLotPanel(){
  const [items,setItems]=usePersist("c_cap",[]);
  const [flash,setFlash]=useState(null);
  const [text,setText]=useState("");
  const ref=useRef();
  const now=Date.now();
  const live=items.filter(i=>!i.archived);
  const pending=live.filter(i=>!i.reviewed);
  const stale=live.filter(i=>!i.reviewed&&(now-(i.id||now))>PARK_ARCHIVE_MS);
  useEffect(()=>{
    if(stale.length===0)return;
    const staleIds=new Set(stale.map(i=>i.id));
    setItems(p=>p.map(i=>staleIds.has(i.id)?{...i,archived:true}:i));
  },[stale.length]);
  const drop=()=>{
    if(!text.trim())return;
    const t=text.trim();
    setItems(p=>[{id:Date.now(),text:t,ts:ts(),date:ds(),pinned:false},...p]);
    setText("");
    setFlash("green");
    window.dispatchEvent(new Event("c_cap_sync"));
    setTimeout(()=>setFlash(null),500);
  };
  const review=(id,keep)=>{
    setItems(p=>keep?p.map(i=>i.id===id?{...i,reviewed:true}:i):p.filter(i=>i.id!==id));
    setFlash(keep?"green":"red");
    setTimeout(()=>setFlash(null),500);
  };
  return(
    <div>
      <Lbl>Parking lot</Lbl>
      <p style={{fontSize:12,color:P.muted,lineHeight:1.6,marginBottom:14}}>Drop it here and keep moving. Nothing to file, nothing to confirm.</p>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <input ref={ref} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&drop()} placeholder="whatever just crossed your mind…" style={{...inp,borderColor:flash==="green"?P.p60:flash==="red"?"#b45":P.border,transition:"border-color 0.2s"}}/>
        <Btn onClick={drop}>Drop</Btn>
      </div>
      <Divider/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <Lbl>Daily review · {pending.length}</Lbl>
      </div>
      {pending.length===0&&<p style={{color:P.muted,fontSize:12,textAlign:"center",padding:"16px 0"}}>Nothing waiting on you.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:280,overflowY:"auto"}}>
        {pending.map(i=>(
          <div key={i.id} style={{display:"flex",alignItems:"center",gap:8,background:P.surface,border:`1px solid ${P.border}`,borderRadius:10,padding:"9px 11px"}}>
            <span style={{flex:1,fontSize:12,color:P.text}}>{i.text}</span>
            <button onClick={()=>review(i.id,true)} style={{background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.p60,fontSize:11,cursor:"pointer",padding:"3px 8px",fontFamily:FONT}}>Keep</button>
            <button onClick={()=>review(i.id,false)} style={{background:"none",border:`1px solid ${P.border}`,borderRadius:6,color:P.muted,fontSize:11,cursor:"pointer",padding:"3px 8px",fontFamily:FONT}}>Toss</button>
          </div>
        ))}
      </div>
      <p style={{fontSize:10,color:P.muted,marginTop:12}}>Untouched items quietly archive after 30 days — nothing pushy, they're just out of the way.</p>
    </div>
  );
}

// ── PLANNING SCREEN
const PLAN_SYSTEM = `You are a warm, sharp daily-planning companion for someone with ADHD. This is the very first thing they see when opening their productivity app. Your job is a real conversation to figure out: what's on their plate today, how they're feeling/energy-wise, and rough timing for the day.

Keep messages SHORT — 1-3 sentences, conversational, never a wall of text or a list of questions at once. Ask ONE thing at a time. Build on what they say.

Once you have a reasonable picture of their day (a few tasks, a sense of energy/timing), say something like "Got it — want me to pull this together?" and naturally invite them toward wrapping up. Don't drag it out more than necessary, but don't rush either — match their pace.

If they reference a previous day's conversation or say things like "same as yesterday" or "continue where we left off," work with that naturally using the conversation history provided.

Never lecture, never use bullet points in your replies, just talk like a person.`;

const PLAN_SUMMARY_PROMPT = task => `Based on this planning conversation, extract a structured day plan. Return ONLY valid JSON, no markdown, no explanation, in this exact shape:
{
  "tasks": [{"text": "task description", "priority": "high|medium|low", "energy": "low|steady|high"}],
  "energyState": "crashed|low|steady|on|hyper",
  "summary": "one warm sentence summarizing the plan",
  "suggestedPanels": ["capture","timer","tasks","body","sound","routines","double","novelty","async","emotion","discipline","friction","activity","parking"]
}
Pick 3-6 suggestedPanels that best fit what was discussed (always include "tasks" if any tasks exist). Infer energyState from how they described feeling. Conversation:\n\n${task}`;

let planGreeted=false; // survives StrictMode remounts and screen hops within one page load

function PlanningScreen({avatar,onComplete,onSkip}){
  const [msgs,setMsgs]=usePersist("c_plan_history",[]);
  const [input,setInput]=useState("");
  const [loading,setLoad]=useState(false);
  const [blink,setBlink]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [voiceOn,setVoiceOn]=usePersist("c_plan_voice",true);
  const [phase,setPhase]=useState("chat"); // chat | summarizing | summary
  const [plan,setPlan]=useState(null);
  const [lastVisit,setLastVisit]=usePersist("c_plan_lastvisit",null);
  const chatRef=useRef();
  const initRef=useRef(false);

  useEffect(()=>chatRef.current?.scrollTo({top:99999,behavior:"smooth"}),[msgs]);

  useEffect(()=>{
    const id=setInterval(()=>{ setBlink(true); setTimeout(()=>setBlink(false),150); },2500+Math.random()*2500);
    return()=>clearInterval(id);
  },[]);

  const speak=useCallback(text=>{
    if(!voiceOn||!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    const voices=window.speechSynthesis.getVoices();
    const preferred=voices.find(v=>v.lang==="en-US")||voices[0];
    if(preferred) u.voice=preferred;
    u.rate=1.0;
    setSpeaking(true); u.onend=()=>setSpeaking(false); u.onerror=()=>setSpeaking(false);
    window.speechSynthesis.speak(u);
  },[voiceOn]);

  const call=async(messages)=>{
    const r=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:PLAN_SYSTEM,messages})});
    const d=await r.json();
    return d.content?.find(b=>b.type==="text")?.text||"Tell me more.";
  };

  // Initial greeting — only fires once, picks up context if returning
  useEffect(()=>{
    if(initRef.current||planGreeted) return;
    initRef.current=true;planGreeted=true;
    // heal clutter left over from demo mode: drop placeholder replies
    const real=msgs.filter(m=>!(m.role==="assistant"&&m.content.startsWith("(Local demo mode")));
    if(real.length!==msgs.length) setMsgs(real);
    if(real.length>0){
      const today=ds();
      const isNewDay = lastVisit!==today;
      if(!isNewDay){setLastVisit(today);return;} // same-day reopen: just show history, no re-greet
      // New day — greet with continuity awareness
      (async()=>{
        setLoad(true);
        const hist=real.map(m=>({role:m.role,content:m.content}));
        const prompt = `(It's a new day now — ${today}. The person is opening the app again. Greet them warmly, briefly reference yesterday's plan if relevant from the history above, and ask what's on the agenda today.)`;
        const reply=await call([...hist,{role:"user",content:prompt}]);
        setLoad(false);
        setMsgs(p=>[...p,{id:Date.now(),role:"assistant",content:reply}]);
        speak(reply);
        setLastVisit(today);
      })();
    } else {
      // First time ever
      (async()=>{
        setLoad(true);
        const h=new Date().getHours();
        const greetWord=h<12?"morning":h<17?"afternoon":"evening";
        const reply=await call([{role:"user",content:`(This is the very first time meeting this person. Say a warm, brief hello — it's ${greetWord} — and ask what's on their plate today / what we're doing together.)`}]);
        setLoad(false);
        setMsgs([{id:Date.now(),role:"assistant",content:reply}]);
        speak(reply);
        setLastVisit(ds());
      })();
    }
    // eslint-disable-next-line
  },[]);

  const send=async()=>{
    if(!input.trim()||loading) return;
    const um={id:Date.now()+"u",role:"user",content:input.trim()};
    const hist=[...msgs,um].map(m=>({role:m.role,content:m.content}));
    setMsgs(p=>[...p,um]); setInput(""); setLoad(true);
    const reply=await call(hist);
    setLoad(false);
    setMsgs(p=>[...p,{id:Date.now()+"r",role:"assistant",content:reply}]);
    speak(reply);
  };

  const buildSummary=async()=>{
    setPhase("summarizing");
    const hist=msgs.map(m=>`${m.role==="user"?"Them":"Companion"}: ${m.content}`).join("\n");
    try{
      const raw=await claude(PLAN_SUMMARY_PROMPT(hist),null,500);
      const clean=raw.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      setPlan(parsed);
      setPhase("summary");
    }catch(e){
      setPlan({tasks:[],energyState:"steady",summary:"Let's just dive in.",suggestedPanels:["capture","tasks","timer"]});
      setPhase("summary");
    }
  };

  const letsGo=()=>{
    onComplete(plan);
  };

  return(
    <div style={{minHeight:"100vh",background:P.bg,color:P.text,fontFamily:FONT,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.8);}}
        ::placeholder{color:${P.muted};opacity:1;}
        @media(max-width:760px){
          .dash-grid{grid-template-columns:1fr !important;}
          .topbar{flex-wrap:wrap;padding:10px 12px !important;row-gap:8px;}
          .cols-picker{display:none !important;}
          .energy-row{order:5;width:100%;justify-content:space-between;}
        }
      `}</style>

      <div style={{width:"100%",maxWidth:480}}>
        {/* Avatar */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
          <div style={{
            padding:16,background:P.surface,borderRadius:"50%",border:`2px solid ${P.borderHi}`,
            boxShadow:speaking?`0 0 0 8px ${P.glow}`:`0 0 30px ${P.glow}`,transition:"box-shadow 0.3s",
          }}>
            <AvatarFace avatar={avatar} size={110} blink={blink} speaking={speaking} mood={loading?"thinking":"happy"}/>
          </div>
        </div>

        {phase!=="summary"&&(
          <>
            {/* Chat history */}
            <div ref={chatRef} style={{maxHeight:"42vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:10,marginBottom:16,padding:"4px"}}>
              {msgs.map(msg=>(
                <div key={msg.id} className="pe" style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{
                    maxWidth:"85%",padding:"11px 15px",borderRadius:msg.role==="user"?"14px 14px 4px 14px":"4px 14px 14px 14px",
                    background:msg.role==="user"?P.p30:P.card,
                    border:`1px solid ${msg.role==="user"?P.p40:P.border}`,
                    fontSize:14,lineHeight:1.5,color:msg.role==="user"?P.text:P.textSub,
                  }}>{msg.content}</div>
                </div>
              ))}
              {loading&&(
                <div style={{display:"flex",justifyContent:"flex-start"}}>
                  <div style={{padding:"11px 18px",borderRadius:"4px 14px 14px 14px",background:P.card,border:`1px solid ${P.border}`,fontSize:18,letterSpacing:4,color:P.muted}}>···</div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
                placeholder="Tell me what's on your plate…" autoFocus
                style={{...inp,padding:"13px 16px",fontSize:14}}/>
              <Btn onClick={send} disabled={loading||!input.trim()}>→</Btn>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <button onClick={()=>setVoiceOn(v=>!v)} style={{background:"none",border:"none",color:P.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
                {voiceOn?"🔊 Voice on":"🔇 Voice off"}
              </button>
              <div style={{display:"flex",gap:10}}>
                <button onClick={onSkip} style={{background:"none",border:"none",color:P.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>Skip to dashboard</button>
                {msgs.length>=2&&<Btn onClick={buildSummary} sm>Let's pull this together →</Btn>}
              </div>
            </div>
          </>
        )}

        {phase==="summarizing"&&(
          <div style={{textAlign:"center",padding:"20px",color:P.muted,fontSize:13}}>Putting it together…</div>
        )}

        {phase==="summary"&&plan&&(
          <div className="pe">
            <Card style={{padding:20,marginBottom:16}}>
              <Lbl>Today's plan</Lbl>
              <p style={{fontSize:14,color:P.text,lineHeight:1.7,marginBottom:16,fontStyle:"italic"}}>{plan.summary}</p>

              {plan.tasks?.length>0&&(
                <div style={{marginBottom:14}}>
                  <Lbl>Tasks</Lbl>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {plan.tasks.map((t,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 11px",background:P.surface,border:`1px solid ${P.border}`,borderRadius:8}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:t.priority==="high"?P.p60:t.priority==="medium"?P.p50:P.p40,flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,color:P.text}}>{t.text}</span>
                        <Pill label={t.energy}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <Lbl>Energy today</Lbl>
              </div>
              <div style={{marginTop:-10,marginBottom:14}}>
                <Pill label={ENERGIES.find(e=>e.id===plan.energyState)?.label||plan.energyState} color={ENERGIES.find(e=>e.id===plan.energyState)?.c}/>
              </div>

              <Lbl>Opening these tools</Lbl>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                {plan.suggestedPanels?.map(pid=>{
                  const def=PANELS.find(p=>p.id===pid);
                  return def?<Pill key={pid} label={def.label}/>:null;
                })}
              </div>
            </Card>

            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>setPhase("chat")} ghost sm>← Keep talking</Btn>
              <Btn onClick={letsGo} full>Let's go →</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── QUICK START — session launcher popup ──────────────────────
function QuickStart({avatar,energy,setEnergy,onStart,onPlan,onSkip,initial}){
  const [sel,setSel]=useState(initial||[]);
  const editing=(initial||[]).length>0;
  const pro=useProState();
  const flip=id=>setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const h=new Date().getHours();
  const greet=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
  return(
    <div style={{minHeight:"100vh",background:P.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:FONT}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @media(max-width:600px){
          .qs-card{padding:16px !important;border-radius:16px !important;}
          .qs-grid{grid-template-columns:1fr 1fr !important;max-height:38vh !important;}
        }
      `}</style>
      <div className="pe qs-card" style={{width:"100%",maxWidth:600,background:P.card,border:`1px solid ${P.borderHi}`,borderRadius:20,padding:"24px",boxShadow:`0 12px 80px ${P.glow}`,animation:"fadeIn 0.3s ease"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
          <div style={{width:52,height:52,borderRadius:"50%",overflow:"hidden",border:`2px solid ${P.borderHi}`,flexShrink:0,background:P.surface}}>
            <AvatarFace avatar={avatar} size={52}/>
          </div>
          <div>
            <p style={{fontSize:17,fontWeight:800,color:P.text,letterSpacing:-0.3}}>{editing?"Session tools":greet+"."}</p>
            <p style={{fontSize:12,color:P.textSub,marginTop:2}}>What are we working with this session? Tap the tools you want.</p>
          </div>
        </div>

        <Lbl>Energy right now</Lbl>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:16}}>
          {ENERGIES.map(e=>(
            <Tag key={e.id} active={energy===e.id} onClick={()=>setEnergy(e.id)}>{e.e} {e.label}</Tag>
          ))}
        </div>

        <Lbl>Tools for this session</Lbl>
        {!pro&&<p style={{fontSize:11,color:P.muted,lineHeight:1.5,margin:"-2px 0 8px"}}>✦ = included in Pro. <span style={{color:P.p50,fontWeight:600}}>{PRICE_LIFETIME} once (or {PRICE_SUB}) unlocks all of them</span> — one purchase, not per-tool.</p>}
        <div className="qs-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:7,maxHeight:"44vh",overflowY:"auto",marginBottom:18,paddingRight:2}}>
          {PANELS.map(p=>{
            const on=sel.includes(p.id);
            const locked=p.pro&&!pro;
            return(
              <button key={p.id} onClick={()=>flip(p.id)} style={{
                textAlign:"left",padding:"10px 12px",borderRadius:12,cursor:"pointer",fontFamily:FONT,
                border:`1px solid ${on?P.p40:P.border}`,background:on?P.lift:P.surface,
                boxShadow:on?`0 0 14px ${P.glow}`:"none",transition:"all 0.15s",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:13,color:on?P.p60:P.p40}}>{p.glyph}</span>
                  <span style={{fontSize:12,fontWeight:700,color:on?P.p70:P.text}}>{p.label}</span>
                  <span style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                    {locked&&<span style={{fontSize:9,fontWeight:800,letterSpacing:0.8,color:P.p50,border:`1px solid ${P.p30}`,borderRadius:999,padding:"1px 6px"}}>✦ PRO</span>}
                    {on&&<span style={{fontSize:11,color:P.p60}}>✓</span>}
                  </span>
                </div>
                <div style={{fontSize:11,color:P.muted,marginTop:3,lineHeight:1.4}}>{p.sub}</div>
              </button>
            );
          })}
        </div>

        <Btn onClick={()=>onStart(sel)} full disabled={sel.length===0}>
          {sel.length===0?"Pick at least one tool":editing?`Update session · ${sel.length} tool${sel.length!==1?"s":""} →`:`Start session with ${sel.length} tool${sel.length!==1?"s":""} →`}
        </Btn>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
          <button onClick={onPlan} style={{background:"none",border:"none",color:P.p50,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>💬 Not sure? Talk it out with your companion</button>
          <button onClick={onSkip} style={{background:"none",border:"none",color:P.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>Skip →</button>
        </div>
      </div>
    </div>
  );
}

// ── FIRST-RUN INTRO ──
const INTRO_STEPS=[
  {glyph:"◉",title:"Welcome to Silo",body:"A toolkit of ADHD-specific tools — capture, focus timers, an AI body-double, routines, sound, and more. Each session you pick whichever tools fit today's brain — could be one, could be all of them."},
  {glyph:"⊞",title:"Sessions, not setup",body:"Every session starts at the launcher: tap your energy level, tap the tools you want, go. Mid-session, the ⊞ Tools tab in the top bar swaps tools in and out. Everything autosaves to this browser — the ⛃ Data button backs it all up to a file."},
  {glyph:"⚡",title:"Quick capture, one keystroke",body:"Press C anywhere (or Ctrl+K) for quick capture — type the thought, hit Enter, it lands in your Capture log. And when a timer asks to send notifications, say yes: break alerts reach you even from another tab."},
];
function IntroTour({onDone}){
  const [step,setStep]=useState(0);
  const s=INTRO_STEPS[step];const last=step===INTRO_STEPS.length-1;
  return(
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(6,11,6,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:FONT}}>
      <div className="pe" style={{width:"100%",maxWidth:440,background:P.card,border:`1px solid ${P.borderHi}`,borderRadius:20,padding:"28px 26px",boxShadow:`0 12px 80px ${P.glow}`}}>
        <div style={{fontSize:34,color:P.p50,marginBottom:14,letterSpacing:2}}>{s.glyph}</div>
        <p style={{fontSize:18,fontWeight:800,color:P.text,letterSpacing:-0.3,marginBottom:10}}>{s.title}</p>
        <p style={{fontSize:13,color:P.textSub,lineHeight:1.7,marginBottom:20}}>{s.body}</p>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:18}}>
          {INTRO_STEPS.map((_,i)=>(
            <div key={i} style={{width:i===step?22:7,height:7,borderRadius:999,background:i===step?P.p50:P.p10,transition:"all 0.2s"}}/>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          {step>0&&<Btn ghost sm onClick={()=>setStep(step-1)}>← Back</Btn>}
          <div style={{flex:1}}>
            <Btn full onClick={()=>last?onDone():setStep(step+1)}>{last?"Let's go →":"Next →"}</Btn>
          </div>
        </div>
        {!last&&<button onClick={onDone} style={{background:"none",border:"none",color:P.muted,fontSize:12,cursor:"pointer",fontFamily:FONT,marginTop:12,display:"block",marginLeft:"auto",marginRight:"auto"}}>skip tour</button>}
      </div>
    </div>
  );
}

// ── QUICK CAPTURE (global hotkey: C or Ctrl/Cmd+K) ──
function quickCaptureSave(text){
  store.set("c_cap",[{id:Date.now(),text:text.trim(),ts:ts(),date:ds(),pinned:false},...store.get("c_cap",[])]);
  window.dispatchEvent(new Event("c_cap_sync"));
}
function QuickCapture({onClose}){
  const [text,setText]=useState("");
  const [saved,setSaved]=useState(0);
  const ref=useRef();
  useEffect(()=>{ref.current?.focus();},[]);
  const save=()=>{if(!text.trim())return;quickCaptureSave(text);setSaved(n=>n+1);setText("");};
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:280,background:"rgba(6,11,6,0.6)",backdropFilter:"blur(3px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"18vh 20px 20px",fontFamily:FONT}}>
      <div className="pe" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:P.card,border:`1px solid ${P.borderHi}`,borderRadius:16,padding:"18px 18px 14px",boxShadow:`0 12px 80px ${P.glow}`}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:8}}>
          <Lbl>⚡ Quick capture</Lbl>
          {saved>0&&<span style={{fontSize:11,color:P.p60,fontWeight:700,marginLeft:"auto",marginBottom:8}}>✓ {saved} captured</span>}
        </div>
        <input ref={ref} value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")save();}}
          placeholder="get it out of your head…" style={inp}
          onFocus={e=>e.target.style.borderColor=P.borderHi} onBlur={e=>e.target.style.borderColor=P.border}/>
        <p style={{fontSize:11,color:P.muted,marginTop:8}}>Enter saves to your Capture log · Esc closes</p>
      </div>
    </div>
  );
}

export default function Silo(){
  const [tasks,setTasks]       = usePersist("c_tasks",INIT_TASKS);
  const [active,setActive]     = usePersist("c_panels",[]);
  const [energy,setEnergy]     = usePersist("c_energy","steady");
  const [cols,setCols]         = usePersist("c_cols",3);
  const [library,setLibrary]   = useState(false);
  const [avatar,setAvatar]     = usePersist("c_avatar",DEFAULT_AVATAR);
  const [screen,setScreen]     = usePersist("c_screen","quickstart"); // quickstart | planning | dashboard
  const [introDone,setIntroDone]=usePersist("c_intro_done",false);
  const [qc,setQc]             = useState(false);
  const pro=useProState();

  const toggle=id=>setActive(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  // global quick-capture hotkey: plain C (outside inputs) or Ctrl/Cmd+K
  useEffect(()=>{
    const onKey=e=>{
      if(e.key==="Escape"){setQc(false);return;}
      const t=e.target;
      const typing=t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"||t.isContentEditable);
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==="k"||e.key==="K")){e.preventDefault();setQc(true);return;}
      if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==="c"||e.key==="C"))setQc(true);
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  const overlays=(
    <>
      {qc&&<QuickCapture onClose={()=>setQc(false)}/>}
      {!introDone&&<IntroTour onDone={()=>setIntroDone(true)}/>}
    </>
  );

  // migrate old panel ids (memory->capture, timeviz->progress) in saved sessions
  useEffect(()=>{
    setActive(p=>{
      const mapped=[...new Set(p.map(id=>PANEL_ALIASES[id]||id))];
      return mapped.length===p.length&&mapped.every((id,i)=>id===p[i])?p:mapped;
    });
  },[]);

  const addTask=text=>setTasks(p=>[...p,{
    id:Date.now(),text,done:false,priority:"medium",energy:"steady",chunks:[text],cd:[],rs:0
  }]);

  // Called when planning wraps up — seeds tasks + panels from plan
  const onPlanComplete=plan=>{
    if(plan?.tasks?.length>0){
      const newTasks=plan.tasks.map(t=>({
        id:Date.now()+Math.random(),
        text:t.text, done:false,
        priority:t.priority||"medium",
        energy:t.energy||"steady",
        chunks:[t.text], cd:[], rs:0,
      }));
      setTasks(prev=>{
        // avoid duplicates
        const existing=new Set(prev.map(t=>t.text.toLowerCase().trim()));
        const fresh=newTasks.filter(t=>!existing.has(t.text.toLowerCase().trim()));
        return [...prev,...fresh];
      });
    }
    if(plan?.energyState) setEnergy(plan.energyState);
    if(plan?.suggestedPanels?.length>0) setActive([...new Set(plan.suggestedPanels.map(id=>PANEL_ALIASES[id]||id).filter(id=>PANELS.some(p=>p.id===id)))]);
    setScreen("dashboard");
  };

  const render=id=>{
    const def=PANELS.find(p=>p.id===id);
    if(def?.pro&&!pro)return <ProLockCard def={def}/>;
    switch(id){
      case "capture":    return <CapturePanel onTask={addTask}/>;
      case "timer":      return <TimerProgressPanel tasks={tasks}/>;
      case "tasks":      return <TasksPanel tasks={tasks} setTasks={setTasks} energy={energy}/>;
      case "body":       return <BodyHFCPanel/>;
      case "sound":      return <SoundPanel/>;
      case "routines":   return <RoutinesPanel/>;
      case "double":     return <BodyDoublePanel/>;
      case "novelty":    return <NoveltyPanel/>;
      case "async":      return <AsyncPanel/>;
      case "emotion":    return <CheckInPanel/>;
      case "discipline": return <DisciplinePanel/>;
      case "friction":   return <FrictionPanel/>;
      case "activity":   return <ActivityPanel/>;
      case "parking":    return <ParkingLotPanel/>;
      default:           return null;
    }
  };

  const h=new Date().getHours();
  const greet=h<12?"Good morning":h<17?"Good afternoon":"Good evening";

  // ── QUICK START ──
  if(screen==="quickstart") return(
    <>
      {overlays}
      <QuickStart
        avatar={avatar}
        energy={energy}
        setEnergy={setEnergy}
        initial={active}
        onStart={sel=>{setActive(sel);setScreen("dashboard");}}
        onPlan={()=>setScreen("planning")}
        onSkip={()=>setScreen("dashboard")}
      />
    </>
  );

  // ── PLANNING SCREEN ──
  if(screen==="planning") return(
    <>
      {overlays}
      <PlanningScreen
        avatar={avatar}
        onComplete={onPlanComplete}
        onSkip={()=>setScreen("dashboard")}
      />
    </>
  );

  // ── DASHBOARD ──
  return(
    <div style={{minHeight:"100vh",background:P.bg,color:P.text,fontFamily:FONT,display:"flex",flexDirection:"column"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${P.p10};border-radius:2px;}
        textarea,input,button{font-family:${FONT};}
        input[type=range]{accent-color:${P.p40};}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}
        .pe{animation:fadeIn 0.25s ease;}
        ::placeholder{color:${P.muted};opacity:1;}
        @media(max-width:760px){
          .dash-grid{grid-template-columns:1fr !important;}
          .topbar{flex-wrap:wrap;padding:10px 12px !important;row-gap:8px;}
          .cols-picker{display:none !important;}
          .energy-row{order:5;width:100%;justify-content:space-between;}
        }
      `}</style>

      {overlays}
      {library&&<NotebooksScreen onClose={()=>setLibrary(false)}/>}

      {/* TOP BAR */}
      <div className="topbar" style={{background:P.surface,borderBottom:`1px solid ${P.border}`,padding:"10px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        {/* Avatar + name — clicking returns to the session launcher */}
        <button onClick={()=>setScreen("quickstart")} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0}}>
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",border:`1.5px solid ${P.borderHi}`,flexShrink:0}}>
            <AvatarFace avatar={avatar} size={38}/>
          </div>
          <span style={{fontSize:14,fontWeight:800,letterSpacing:-0.5,color:P.text}}>Silo</span>
        </button>

        {/* Tools tab — edit which panels are in use */}
        <button onClick={()=>setScreen("quickstart")} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:999,border:`1px solid ${P.p40}`,background:P.lift,color:P.p60,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT,boxShadow:`0 0 12px ${P.glow}`,whiteSpace:"nowrap"}}>
          ⊞ Tools<span style={{fontSize:11,fontWeight:800,background:P.p30,borderRadius:999,padding:"1px 7px",color:P.text}}>{active.length}</span>
        </button>

        {/* Energy */}
        <div className="energy-row" style={{display:"flex",gap:2,background:P.card,borderRadius:999,padding:"3px",border:`1px solid ${P.border}`}}>
          {ENERGIES.map(e=>(
            <button key={e.id} onClick={()=>setEnergy(e.id)} style={{padding:"3px 8px",borderRadius:999,border:"none",fontFamily:FONT,background:energy===e.id?P.lift:"none",color:energy===e.id?P.p60:P.muted,fontSize:11,fontWeight:energy===e.id?700:400,cursor:"pointer",transition:"all 0.15s"}}>
              {e.e} {e.label}
            </button>
          ))}
        </div>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {/* Cols */}
          <div className="cols-picker" style={{display:"flex",gap:2,background:P.card,borderRadius:8,padding:"2px",border:`1px solid ${P.border}`}}>
            {[2,3,4].map(n=>(
              <button key={n} onClick={()=>setCols(n)} style={{padding:"4px 9px",borderRadius:6,border:"none",fontFamily:FONT,background:cols===n?P.lift:"none",color:cols===n?P.p60:P.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>{n}</button>
            ))}
          </div>
          <button onClick={()=>setLibrary(true)} style={{padding:"7px 14px",borderRadius:10,border:`1px solid ${P.border}`,background:"none",color:P.p50,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>📓 Life Library</button>
          <ProMenu/>
          <DataMenu/>
        </div>
      </div>

      {/* PANELS */}
      {active.length>0?(
        <div style={{flex:1,padding:"16px 20px",overflow:"auto"}}>
          <div className="dash-grid" style={{display:"grid",gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`,gap:14,alignItems:"start"}}>
            {active.map(id=>{
              const def=PANELS.find(p=>p.id===id);
              return(
                <div key={id} className="pe" style={{background:P.surface,border:`1px solid ${P.border}`,borderRadius:18,overflow:"hidden"}}>
                  <div style={{padding:"10px 16px",borderBottom:`1px solid ${P.border}`,display:"flex",alignItems:"center",gap:8,background:P.card}}>
                    <span style={{fontSize:13,color:P.p40,letterSpacing:1}}>{def?.glyph}</span>
                    <span style={{fontSize:12,fontWeight:700,color:P.textSub,flex:1,letterSpacing:0.5,textTransform:"uppercase"}}>{def?.label}</span>
                    <button onClick={()=>toggle(id)} style={{background:"none",border:"none",color:P.muted,cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 2px"}}>×</button>
                  </div>
                  <div style={{padding:"16px"}}>{render(id)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ):(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:P.muted}}>
          <div style={{fontSize:36,opacity:0.2,letterSpacing:4}}>◉</div>
          <p style={{fontSize:13,letterSpacing:0.3}}>{greet}. Select your tools above to begin.</p>
        </div>
      )}
    </div>
  );
}
