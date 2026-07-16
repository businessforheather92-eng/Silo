import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});

const w = dom.window;
global.window = w;
global.document = w.document;
Object.defineProperty(global, "navigator", { value: w.navigator, configurable: true });
global.localStorage = w.localStorage;
global.HTMLElement = w.HTMLElement;
global.Element = w.Element;
global.Node = w.Node;
global.SpeechSynthesisUtterance = undefined;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = clearTimeout;
global.MutationObserver = w.MutationObserver;
global.getComputedStyle = w.getComputedStyle.bind(w);
global.CustomEvent = w.CustomEvent;
global.Event = w.Event;
w.HTMLElement.prototype.scrollTo = function(){};
global.SpeechSynthesisUtterance = w.SpeechSynthesisUtterance;
global.location = w.location;

// route the app's AI calls to the canned local-mode reply
global.fetch = w.fetch = async (url, opts) => ({
  status: 200,
  ok: true,
  json: async () => ({
    content: [{ type: "text", text: "(Local demo mode reply)" }],
  }),
  text: async () => "",
});

const errors = [];
w.addEventListener("error", (e) => errors.push("window error: " + e.message));
process.on("unhandledRejection", (e) => errors.push("unhandled rejection: " + (e?.stack || e)));

const bundlePath = process.argv[2];
const code = readFileSync(bundlePath, "utf8");

try {
  await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
} catch (e) {
  errors.push("import error: " + (e?.stack || e));
}

await new Promise((r) => setTimeout(r, 1500));

const root = w.document.getElementById("root");
console.log("=== errors:", errors.length ? "" : "none");
errors.forEach((e) => console.log(e.slice(0, 500)));
console.log("=== root children:", root.children.length);
const text = root.textContent || "";
console.log("=== rendered text (first 400 chars):");
console.log(text.slice(0, 400));

const click=el=>el.dispatchEvent(new w.Event("click",{bubbles:true,cancelable:true}));
const btns=()=>[...w.document.querySelectorAll("button")];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// first-run intro tour: shown on fresh storage, click through all steps
let t0=root.textContent||"";
console.log("=== intro tour shown:",/Welcome to Silo/.test(t0));
for(let i=0;i<3;i++){
  const nx=btns().find(b=>/Next →|Let's go →/.test(b.textContent));
  if(nx)click(nx);
  await sleep(150);
}
t0=root.textContent||"";
console.log("=== intro dismissed:",!/Welcome to Silo/.test(t0),"| persisted:",w.localStorage.getItem("c_intro_done")==="true");

console.log("=== launcher buttons:", btns().map(b=>b.textContent.trim().slice(0,28)).join(" | ").slice(0,600));
// 14 tools, 6 badged Pro (sound + double are free-with-limits now; activity picker is pro)
const proBadges=(root.innerHTML.match(/✦ PRO/g)||[]).length;
console.log("=== launcher Pro badges:",proBadges,proBadges===6?"(correct)":"(EXPECTED 6)");
console.log("=== Friction Slider tile present:",/Friction Slider/.test(root.textContent));
console.log("=== One Thing tile present:",/One Thing/.test(root.textContent));
console.log("=== Parking Lot tile present:",/Parking Lot/.test(root.textContent));
console.log("=== one-payment note in launcher:",/\$24\.99 once \(or \$7\.99\/mo\) unlocks all of them/.test(root.textContent));
console.log("=== Follow-Ups tile present:",/Follow-Ups/.test(root.textContent)&&!/Waiting On/.test(root.textContent));
console.log("=== old ids gone from launcher:",!/AI-chunked to-do list/.test(root.textContent)&&!/Hyperfocus circuit breaker.*Bars for tasks/s.test(root.textContent));
// pick six tools: 4 free + Sound (free w/ locked presets) + Routines (pro, locked card)
for(const pat of [/before it's gone/,/Kind sprints/,/2-minute first step/,/Name the feeling/,/actually focus/,/Autopilot/]){
  const b=btns().find(x=>pat.test(x.textContent));
  if(b) click(b); else console.log("MISSING TILE:",pat);
}
await new Promise(r=>setTimeout(r,200));
const start=btns().find(b=>/Start session/.test(b.textContent));
console.log("=== start button:", start?start.textContent.trim():"NOT FOUND");
if(start){click(start);await new Promise(r=>setTimeout(r,500));}
let t=(root.textContent||"");
console.log("=== dashboard has Timer:",/FOCUS TIMER/i.test(t)," Tasks:",/My energy/.test(t)," Capture tabs:",/Brain Dump/.test(t)&&/AI Recover/.test(t)," Check-In feeling tab:",/Name it first/.test(t));
// timer panel: Progress lives behind a tab now
const progTab=btns().find(b=>b.textContent.trim()==="▤ Progress");
if(progTab){click(progTab);await sleep(200);t=root.textContent||"";}
console.log("=== Progress tab inside Timer panel:",!!progTab&&/micro-step/.test(t));
// check-in panel: Intention behind a tab
const intTab=btns().find(b=>b.textContent.trim()==="◇ Intention");
if(intTab){click(intTab);await sleep(200);t=root.textContent||"";}
console.log("=== Intention tab inside Check-In panel:",!!intTab&&/Session intention/i.test(t));
// Sound is free-with-limits: white/brown/rain playable, rest carry ✦ pro pills
console.log("=== Sound free presets visible:",/White noise/.test(t)&&/community favorite/.test(t));
console.log("=== Sound library teaser when signed out:",/whole library/.test(t)&&/✦ pro/i.test(t));
// Routines is Pro: locked card with one-payment copy
console.log("=== Routines locked when signed out:",/Routines is part of Pro/.test(t)&&/Unlock everything — \$24\.99 once or \$7\.99\/mo/.test(t));
// sign in (simulate account) and confirm it unlocks live
w.localStorage.setItem("c_account",JSON.stringify({email:"t@t.co",token:"tok",ts:Date.now()}));
w.dispatchEvent(new w.Event("c_account_changed"));
await sleep(300);t=root.textContent||"";
console.log("=== Routines unlocked after sign-in:",/Morning Launch/.test(t)&&!/Routines is part of Pro/.test(t));
console.log("=== Sound fully unlocked after sign-in:",!/whole library/.test(t));
// switch sound panel to Calm and check bilateral folded in + evidence pills
const calm=btns().find(b=>b.textContent.trim()==="Calm");
if(calm){click(calm);await new Promise(r=>setTimeout(r,200));t=root.textContent||"";}
console.log("=== Calm tab has Bilateral sweep + evidence tags:",/Bilateral sweep/.test(t)&&/early research/.test(t));
// merged Body panel: add it now that we're pro — reopen launcher via Tools tab later; instead verify via panel alias storage
console.log("=== old panel strip gone:",!/Select tools for this session/.test(t));
// quick-capture hotkey: plain "c" opens overlay from the dashboard
w.document.dispatchEvent(new w.KeyboardEvent("keydown",{key:"c",bubbles:true}));
await sleep(200);
const qcInput=[...w.document.querySelectorAll("input")].find(i=>/get it out of your head/.test(i.placeholder||""));
console.log("=== quick capture opened via C:",!!qcInput);
if(qcInput){
  const setVal=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value").set;
  setVal.call(qcInput,"hotkey test thought");
  qcInput.dispatchEvent(new w.Event("input",{bubbles:true}));
  await sleep(100);
  qcInput.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  await sleep(150);
  const cap=JSON.parse(w.localStorage.getItem("c_cap")||"[]");
  console.log("=== capture saved via hotkey:",cap.some(c=>c.text==="hotkey test thought"));
  w.document.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  await sleep(150);
  console.log("=== quick capture closed via Esc:",![...w.document.querySelectorAll("input")].some(i=>/get it out of your head/.test(i.placeholder||"")));
}

// Pro/account menu in the top bar — we're signed in now, expect the active state
const proBtn=btns().find(b=>b.textContent.trim()==="✦ Pro");
console.log("=== Pro button found:",!!proBtn);
if(proBtn){
  click(proBtn);await sleep(150);
  const t2=root.textContent||"";
  console.log("=== Pro popover shows signed-in state:",/Pro active/.test(t2)&&/Sign out/.test(t2));
  click(proBtn);await sleep(100);
}

const tools=btns().find(b=>/Tools/.test(b.textContent)&&b.textContent.length<15);
console.log("=== Tools tab found:",!!tools,tools&&tools.textContent.trim());
if(tools){click(tools);await new Promise(r=>setTimeout(r,300));
  t=root.textContent||"";
  console.log("=== launcher reopened pre-filled:",/Update session · 6 tools/.test(t)?"yes (6 tools)":t.match(/Update session[^→]*/)?.[0]||"NO");
  console.log("=== no Pro badges when signed in:",!/✦ PRO/.test(root.innerHTML));
  // add the merged Body Check tool and update the session
  const bodyTile=btns().find(x=>/catch them early/.test(x.textContent));
  if(bodyTile){click(bodyTile);await sleep(150);}
  const upd=btns().find(b=>/Update session/.test(b.textContent));
  if(upd){click(upd);await sleep(400);}
  t=root.textContent||"";
  console.log("=== Body panel shows check-in:",/Body mirroring/.test(t));
  const hfcTab=btns().find(b=>b.textContent.trim()==="◎ Hyperfocus brake");
  if(hfcTab){click(hfcTab);await sleep(200);t=root.textContent||"";}
  console.log("=== HFC merged into Body panel:",!!hfcTab&&/circuit breaker/i.test(t));

  // add the 3 new tools and update the session to exercise them
  const tools2=btns().find(b=>/Tools/.test(b.textContent)&&b.textContent.length<15);
  if(tools2){click(tools2);}
  await sleep(250);
  for(const pat of [/no guilt either way/,/sized to the time/,/nothing to file/]){
    const b=btns().find(x=>pat.test(x.textContent));
    if(b) click(b); else console.log("MISSING NEW TILE:",pat);
    await sleep(100);
  }
  await sleep(150);
  const upd2=btns().find(b=>/Update session/.test(b.textContent));
  if(upd2){click(upd2);await sleep(400);}
  t=root.textContent||"";

  // Friction Slider: pick Low Battery 3x, expect the supportive note to appear (no guilt copy)
  console.log("=== Friction Slider panel rendered:",/A quick, honest read/.test(t));
  for(let i=0;i<3;i++){
    const lowBtn=btns().find(b=>/Low Battery/.test(b.textContent));
    if(lowBtn){click(lowBtn);await sleep(80);}
  }
  t=root.textContent||"";
  console.log("=== Friction supportive mode after 3 low check-ins:",/low-battery check-ins lately/.test(t));

  // Activity Picker: suggest, shuffle once (disabled after), skip
  const actTile=btns().find(x=>/sized to the time/.test(x.textContent));
  // panel content check happens via dashboard directly since tools were added above
  const suggestBtn=btns().find(b=>/Suggest something/.test(b.textContent));
  if(suggestBtn){
    click(suggestBtn);await sleep(100);
    const shuffleBtn=btns().find(b=>/Shuffle/.test(b.textContent));
    console.log("=== Activity suggestion shown:",!!btns().find(b=>/Doing it/.test(b.textContent)));
    if(shuffleBtn){click(shuffleBtn);await sleep(100);
      const shuffledAgain=btns().find(b=>/No more shuffles/.test(b.textContent));
      console.log("=== Activity shuffle limited to one:",!!shuffledAgain);
    }
  } else console.log("=== Activity suggestion shown: NOT FOUND");

  // Parking Lot: drop an item, confirm it lands in daily review pending list
  const parkInput=[...w.document.querySelectorAll("input")].find(i=>/whatever just crossed your mind/.test(i.placeholder||""));
  if(parkInput){
    const setVal=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value").set;
    setVal.call(parkInput,"parking lot test item");
    parkInput.dispatchEvent(new w.Event("input",{bubbles:true}));
    await sleep(80);
    parkInput.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
    await sleep(150);
    t=root.textContent||"";
    console.log("=== Parking Lot item saved + shows in daily review:",/parking lot test item/.test(t));
  } else console.log("=== Parking Lot input: NOT FOUND");
}
process.exit(0);
