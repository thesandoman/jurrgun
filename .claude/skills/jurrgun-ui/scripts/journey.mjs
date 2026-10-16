// A first-time member's whole journey on the local app at 375px, one screenshot per screen:
// sign-up, onboarding and the quiz, Discover, an event, RSVP, the table intro, the main tabs.
// Prints each screen and, at the end, how many screens came before Discover.
//
//   BASE=http://localhost:8787 node .claude/skills/jurrgun-ui/scripts/journey.mjs [outDir]
//
// It creates a throwaway qa_ account in the LOCAL database only.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
const BASE = process.env.BASE || "http://localhost:8787";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("BASE must be a local dev server");
const DIR = (process.argv[2] || "/tmp/jurrgun-ui") + "/";
const OUT = DIR + "journey/"; rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const LANG = process.env.LANGC || "en";
const user = "qa_" + randomBytes(3).toString("hex"), pass = randomBytes(9).toString("base64url");
const port = 9300 + Math.floor(Math.random() * 90);
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${DIR}jr-${port}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let u; for (let i = 0; i < 50 && !u; i++) { await new Promise((r) => setTimeout(r, 200)); try { u = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page")?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(u); await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const P = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id); } else if (m.method === "Runtime.exceptionThrown") console.log("JSERR", (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || "").slice(0, 300), "@", m.params.exceptionDetails.url?.slice(-40), m.params.exceptionDetails.lineNumber); else if (m.method === "Page.javascriptDialogOpening") ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: true } })); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { P.delete(i); r({}); }, 20000); P.set(i, (m) => { clearTimeout(to); r(m); }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }).then((r) => r.result?.result?.value);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Runtime.enable");
await send("Network.setCookie", { name: "lang", value: LANG, domain: "localhost", path: "/" });
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
let n = 0;
async function shot(label) {
  const s = await send("Page.captureScreenshot", { format: "jpeg", quality: 65 });
  const name = String(++n).padStart(2, "0") + "-" + label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  if (s.result) writeFileSync(OUT + name + ".jpg", Buffer.from(s.result.data, "base64"));
  const info = await ev(`({url:location.pathname+location.search,h1:(document.querySelector('h1,.flow-title')||{}).textContent?.trim().slice(0,60),err:[...document.querySelectorAll('.notice.error,[role=alert]:not([hidden])')].map(e=>e.textContent.trim()).filter(Boolean).slice(0,2),overflow:document.documentElement.scrollWidth>375})`);
  console.log(name, JSON.stringify(info));
}
async function go(path, label) { await send("Page.navigate", { url: BASE + path }); await wait(1500); await shot(label); }

await go("/", "landing-or-intro");
await go("/signup", "signup");
await ev(`(()=>{document.getElementById('f-username').value=${JSON.stringify(user)};document.getElementById('f-password').value=${JSON.stringify(pass)};const c=document.getElementById('f-confirm');if(c)c.value=${JSON.stringify(pass)};document.querySelector('main form').requestSubmit()})()`);
await wait(2000); await shot("after-signup");

// Onboarding and the first quiz: card flows, plain forms and "continue" links, until we land in the app.
let stuck = 0, last = "";
for (let step = 0; step < 80; step++) {
  const path = await ev("location.pathname");
  if (!/^\/(onboarding|quiz)/.test(path)) break;
  const kind = await ev(`(()=>{const f=document.querySelector('.flow');
    if(f){const st=[...f.querySelectorAll('.flow-step')].find(s=>!s.hidden)||f;
      st.querySelectorAll('input[type=date]').forEach(i=>{if(!i.value)i.value='1996-05-05'});
      st.querySelectorAll('input[type=text],input:not([type]),textarea').forEach(i=>{if(!i.value&&!/plusOne|caption|^a_/.test(i.name))i.value=i.name==='nickname'?'Mint':'Qa'});
      st.querySelectorAll('select').forEach(s=>{if(!s.value&&s.options.length>1)s.selectedIndex=1});
      const g={};st.querySelectorAll('input[type=radio]').forEach(r=>{g[r.name]=g[r.name]||r});Object.values(g).forEach(r=>{if(![...st.querySelectorAll('input[name="'+r.name+'"]')].some(x=>x.checked))r.click()});
      const need=Math.max(+(st.dataset.need||0),0);[...st.querySelectorAll('input[type=checkbox]')].slice(0,need).forEach(b=>{if(!b.checked)b.click()});
      st.querySelectorAll('input[type=checkbox][required]').forEach(b=>{if(!b.checked)b.click()});
      return 'flow:'+(st.querySelector('.flow-title')||{}).textContent?.trim().slice(0,30)}
    // A page with its own Continue link (e.g. the type result, which also has a "Does this feel like you?" form) moves on by the link.
    if(document.querySelector('main a.btn.primary')&&!document.querySelector('main form.flow'))return 'link';
    const fm=document.querySelector('main form');if(fm&&fm.querySelector('button[type=submit]'))return 'form';
    return document.querySelector('main a.btn.primary')?'link':'none'})()`);
  const key = path + "|" + kind;
  if (key !== last) { await shot((kind.startsWith("flow") ? "flow" : kind) + path.replace(/\//g, "-")); }
  if (kind.startsWith("flow")) await ev(`(()=>{const st=[...document.querySelectorAll('.flow-step')].find(s=>!s.hidden);const b=document.querySelector('.flow-next, .flow-bar button[type=submit], .flow-bar .btn.primary');if(b)b.click()})()`);
  else if (kind === "form") await ev(`(()=>{const f=document.querySelector('main form');f.querySelectorAll('input[type=checkbox][required]').forEach(b=>{if(!b.checked)b.click()});const g={};f.querySelectorAll('input[type=radio]').forEach(r=>{g[r.name]=g[r.name]||r});Object.values(g).forEach(r=>{if(![...f.querySelectorAll('input[name="'+r.name+'"]')].some(x=>x.checked))r.click()});const b=f.querySelector('button[type=submit].primary')||f.querySelector('button[type=submit]');b.click()})()`);
  else if (kind === "link") await ev(`document.querySelector('main a.btn.primary').click()`);
  else { await shot("stuck" + path.replace(/\//g, "-")); break; }
  await wait(1100);
  const now = (await ev("location.pathname")) + "|" + (await ev(`String([...document.querySelectorAll('.flow-step')].findIndex(s=>!s.hidden))`));
  if (now === last) { if (++stuck > 3) { await shot("stuck" + path.replace(/\//g, "-"));
    console.log("DEBUG2", JSON.stringify(await ev(`(async()=>{const f=document.querySelector('form.flow');const r={ready:f&&f.dataset.ready,isjs:f&&f.className,novalidate:f&&f.noValidate,action:f&&f.getAttribute('action'),scripts:[...document.querySelectorAll('form.flow script')].length};const nx=f.querySelector('.flow-next');nx.click();await new Promise(z=>setTimeout(z,800));r.afterIdx=[...f.querySelectorAll('.flow-step')].findIndex(s=>!s.hidden);r.url=location.pathname;return r})()`)));
    console.log("DEBUG", JSON.stringify(await ev(`({steps:[...document.querySelectorAll('.flow-step')].map(s=>({t:(s.querySelector('.flow-title')||{}).textContent?.trim().slice(0,30),hidden:s.hidden,cls:s.className,need:s.dataset.need,cta:s.dataset.cta})),next:[...document.querySelectorAll('.flow-bar button,.flow-bar a')].map(b=>({t:b.textContent.trim(),cls:b.className,dis:b.disabled,type:b.type})),needMsg:[...document.querySelectorAll('.flow-need')].map(x=>x.hidden?'':x.textContent).filter(Boolean),invalid:[...document.querySelectorAll(':invalid')].map(e=>e.name||e.tagName).slice(0,8)})`)));
    break; } } else stuck = 0;
  last = now;
}
await shot("first-screen-after-onboarding");
console.log("SCREENS-BEFORE-DISCOVER", n - 3, "(welcome screen through the guide; the intro and sign-up not counted)");
await go("/events?view=list", "discover-list");
const ev1 = await ev(`(document.querySelector('a.ev-card,a.card.link[href^="/events/"]')||{}).getAttribute?.('href')`);
if (ev1) {
  await go(ev1, "event-page");
  await ev(`window.scrollTo(0, document.body.scrollHeight)`); await wait(500); await shot("event-page-bottom");
  await ev(`(()=>{const f=document.getElementById('rsvp');if(f)f.requestSubmit()})()`); await wait(2200); await shot("after-rsvp");
  await ev(`window.scrollTo(0,0)`); await wait(300); await shot("rsvp-confirmation-top");
  const introAt = await ev(`(()=>{const a=document.querySelector('.table-intro');if(!a)return null;a.scrollIntoView({block:'center'});return a.querySelector('a').getAttribute('href')})()`);
  console.log("TABLE-INTRO-PROMPT", introAt); await wait(300); await shot("rsvp-table-intro-card");
  const passHref = await ev(`(document.querySelector('a[href*="/pass"]')||{}).getAttribute?.('href')`);
  if (passHref) await go(passHref, "pass");
}
// The table intro, as a member would take it from the prompt.
if (ev1) {
  await go("/onboarding/you?next=" + encodeURIComponent(ev1), "table-intro");
  for (let k = 0; k < 8 && (await ev("location.pathname")) === "/onboarding/you"; k++) {
    await ev(`(()=>{const st=[...document.querySelectorAll('.flow-step')].find(s=>!s.hidden);const need=+(st.dataset.need||0);[...st.querySelectorAll('input[type=checkbox]')].slice(0,need).forEach(b=>{if(!b.checked)b.click()});document.querySelector('.flow-next').click()})()`);
    await wait(900); await shot("table-intro-step");
  }
  console.log("AFTER-INTRO", await ev("location.pathname"), await ev(`!!document.querySelector('.table-intro')`));
}
await go("/me/events", "my-events");
await go("/connections", "my-people");
await go("/buddy", "buddy");
await go("/tables", "regular-tables");
await go("/settings", "me");
console.log("USER", user);
ws.close(); ch.kill();
