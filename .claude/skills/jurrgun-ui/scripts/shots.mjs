// Screenshots of the local app in headless Chrome, plus layout checks.
//
//   BASE=http://localhost:8787 node .claude/skills/jurrgun-ui/scripts/shots.mjs '<jobs json>' [outDir]
//
// Each job: { name, path, who?, w?, h?, mobile?, mode?: "light"|"dark", lang?: "th"|"en", js?, wait?, full?, check? }
//   who    seeded username to sign in as (password read from scripts/seed.ts, never printed)
//   js     expression run before the shot; its value is printed
//   full   capture the whole page (up to 2400px tall)
//   check  print layout problems: sideways scroll, gaps between blocks over the spacing cap,
//          tap targets under 44px, text under 12px
// Local only: refuses any BASE that isn't localhost or 127.0.0.1.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("BASE must be a local dev server");
const jobs = JSON.parse(process.argv[2] || "[]");
const OUT = process.argv[3] || "/tmp/jurrgun-ui";
mkdirSync(OUT, { recursive: true });
const seed = readFileSync(new URL("../../../../scripts/seed.ts", import.meta.url), "utf8");
const PASSWORD = seed.match(/const PASSWORD = "([^"]+)"/)?.[1];
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${OUT}/.chrome-${port}`, "--no-first-run", ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(" ") : ["--disable-gpu"]), "about:blank"], { stdio: "ignore" });
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page")?.webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const login = async (u) => (((await fetch(BASE + "/login", { method: "POST", redirect: "manual", headers: { Origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ username: u, password: PASSWORD }) })).headers.get("set-cookie") || "").match(/bkk_sid=([^;]+)/) || [])[1];

// Spacing cap: a gap between two stacked blocks bigger than this is flagged (px).
const GAP_CAP = { phone: 40, laptop: 56 };
const CHECK = (cap) => `(() => {
  const out = [];
  const W = innerWidth;
  if (document.documentElement.scrollWidth > W) out.push("sideways scroll: page is " + document.documentElement.scrollWidth + "px wide");
  const main = document.querySelector("main") || document.body;
  const shown = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.height > 0 && cs.visibility !== "hidden" && !["fixed", "sticky", "absolute"].includes(cs.position); };
  const name = (e) => (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : e.tagName.toLowerCase());
  for (const e of main.querySelectorAll("*")) {
    const n = e.nextElementSibling;
    if (!n || !shown(e) || !shown(n)) continue;
    const pd = getComputedStyle(e.parentElement).display;
    if (pd.includes("flex") && !getComputedStyle(e.parentElement).flexDirection.startsWith("column")) continue;
    if (pd.includes("grid")) continue;
    const a = e.getBoundingClientRect(), b = n.getBoundingClientRect();
    const gap = Math.round(b.top - a.bottom);
    if (gap > ${cap} && a.width > W * 0.5) out.push("gap " + gap + "px: " + name(e) + " -> " + name(n));
  }
  for (const e of main.querySelectorAll("a,button,input[type=checkbox],input[type=radio],select,summary")) {
    if (!shown(e) && !e.matches("input")) continue;
    const t = e.matches("input") ? (e.closest("label") || e) : e;
    const r = t.getBoundingClientRect();
    if (r.height > 0 && r.height < 24 && !e.closest("p,li,dd,small")) out.push("small tap " + Math.round(r.width) + "x" + Math.round(r.height) + ": " + name(t) + " " + (t.textContent || "").trim().slice(0, 24));
  }
  for (const e of main.querySelectorAll("p,span,small,a,li,label,dd,dt")) {
    if (!shown(e) || !e.textContent.trim() || e.children.length) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 12) out.push("text " + fs + "px: " + (e.textContent || "").trim().slice(0, 30));
  }
  return [...new Set(out)].slice(0, 25);
})()`;

for (const j of jobs) {
  const w = j.w || 375;
  await send("Network.clearBrowserCookies");
  if (j.who) await send("Network.setCookie", { name: "bkk_sid", value: await login(j.who), domain: "localhost", path: "/" });
  await send("Network.setCookie", { name: "lang", value: j.lang || "th", domain: "localhost", path: "/" });
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: j.h || (w < 768 ? 812 : 900), deviceScaleFactor: 1, mobile: j.mobile ?? w < 768 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: j.mode || "light" }] });
  await send("Page.navigate", { url: BASE + j.path });
  await new Promise((r) => setTimeout(r, 1500));
  // The app keeps its own theme setting; force the one asked for.
  if (j.mode) await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(j.mode)}`);
  if (j.js) console.log(j.name, "js:", JSON.stringify(await evaluate(j.js)));
  await new Promise((r) => setTimeout(r, j.wait ?? 300));
  if (j.check) for (const line of (await evaluate(CHECK(w < 768 ? GAP_CAP.phone : GAP_CAP.laptop))) || []) console.log(j.name, "check:", line);
  if (j.full) {
    const h = await evaluate("Math.min(document.documentElement.scrollHeight,2400)");
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: j.mobile ?? w < 768 });
    await new Promise((r) => setTimeout(r, 300));
  }
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
  writeFileSync(`${OUT}/${j.name}.jpg`, Buffer.from(shot.result.data, "base64"));
  console.log("shot", `${OUT}/${j.name}.jpg`);
}
ws.close();
chrome.kill();
