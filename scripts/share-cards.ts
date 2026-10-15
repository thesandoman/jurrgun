/**
 * Renders the social share cards (Open Graph images, 1200×630) into
 * design/assets/og/: one for the site and one per Bangkok Type. Uses headless
 * Chrome and the brand fonts in design/fonts/, so the cards match the app.
 *
 *   npx vite-node scripts/share-cards.ts && npm run assets
 *
 * Re-run after changing a type's name or tagline, the tagline in
 * src/ui/brand.tsx, or the look below. macOS: needs Google Chrome installed
 * (or set CHROME to its path).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ARCHETYPE_KEYS, ARCHETYPES } from "../src/vibe/archetypes";
import { BRAND, MARK_SVG } from "../src/ui/brand";
import { typeSlug } from "../src/routes/quiz";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "design/assets/og");
const FONTS = join(ROOT, "design/fonts");
const HOST = BRAND.domain;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const face = (family: string, file: string, weight: number) =>
  `@font-face{font-family:'${family}';src:url(file://${FONTS}/${file}.woff2) format("woff2");font-weight:${weight}}`;

const BASE = `
${face("Sao Chingcha", "saochingcha-400", 400)}${face("Sao Chingcha", "saochingcha-700", 700)}
${face("Anuphan", "anuphan-400", 400)}${face("Anuphan", "anuphan-600", 600)}${face("Anuphan", "anuphan-700", 700)}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:'Anuphan',system-ui,sans-serif;color:#1e2b22;background:#fff9f0;position:relative}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
.mark{width:84px;height:84px;border-radius:24px;overflow:hidden;flex:none}
.mark svg{width:100%;height:100%;display:block}
.brand{display:flex;align-items:center;gap:18px}
.brand b{font-family:'Sao Chingcha';font-weight:700;font-size:46px;letter-spacing:.01em}
.brand small{font-weight:600;font-size:28px;color:#137f45}
.foot{position:absolute;left:72px;right:72px;bottom:36px;display:flex;justify-content:space-between;align-items:center;font-size:24px;font-weight:600;color:#46564b}
.pill{display:inline-flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;background:#fff;border:2px solid #f0e2cc}
`;

function siteCard(): string {
  return `<!doctype html><meta charset="utf-8"><style>${BASE}
.wrap{position:absolute;left:72px;top:64px;right:72px}
h1{font-family:'Sao Chingcha';font-weight:700;font-size:80px;line-height:1.08;margin-top:44px;color:#137f45}
h1 span{white-space:nowrap}
h2{font-weight:600;font-size:38px;margin-top:12px;color:#1e2b22}
.chips{display:flex;gap:14px;margin-top:24px}
.chip{padding:8px 20px;border-radius:999px;background:#e3f5ea;color:#0e6b39;font-weight:700;font-size:24px}
</style>
<div class="blob" style="width:620px;height:620px;right:-180px;top:-260px;background:radial-gradient(circle,rgba(255,180,67,.55),rgba(255,180,67,0) 70%)"></div>
<div class="blob" style="width:560px;height:560px;right:-60px;bottom:-320px;background:radial-gradient(circle,rgba(47,184,102,.40),rgba(47,184,102,0) 70%)"></div>
<div class="wrap">
  <div class="brand"><span class="mark">${MARK_SVG}</span><b>${BRAND.name}</b><small>${BRAND.th}</small></div>
  <h1>${BRAND.tagline.th.split(" ").map((w) => `<span>${esc(w)}</span>`).join(" ")}</h1>
  <h2>${esc(BRAND.tagline.en)}</h2>
  <div class="chips"><span class="chip">4–6 คนต่อโต๊ะ · per table</span><span class="chip">50 เขต · districts</span><span class="chip">16 ไทป์ · Bangkok Types</span></div>
</div>
<div class="foot"><span class="pill">🏛️ ${esc(BRAND.endorsement.th)} · Made with the BMA</span><span>${HOST}</span></div>`;
}

function typeCard(key: (typeof ARCHETYPE_KEYS)[number]): string {
  const a = ARCHETYPES[key];
  return `<!doctype html><meta charset="utf-8"><style>${BASE}
body{background:linear-gradient(140deg,#137f45 0%,#2fb866 70%,#8fd96b 120%);color:#fff}
.card{position:absolute;left:56px;top:56px;right:56px;bottom:56px;border-radius:44px;background:#fff9f0;color:#1e2b22;overflow:hidden}
.emoji{position:absolute;right:70px;top:70px;width:300px;height:300px;border-radius:50%;background:#fff1df;display:grid;place-items:center;font-size:170px}
.body{position:absolute;left:64px;top:60px;right:420px}
.eyebrow{font-weight:700;font-size:28px;color:#137f45;letter-spacing:.02em}
h1{font-family:'Sao Chingcha';font-weight:700;font-size:84px;line-height:1.08;margin-top:14px}
h2{font-weight:600;font-size:40px;color:#46564b;margin-top:6px}
p{font-size:30px;line-height:1.45;margin-top:22px;color:#1e2b22}
.foot{left:64px;right:64px;bottom:44px}
.foot .brand b{font-size:34px}.foot .mark{width:56px;height:56px;border-radius:16px}
</style>
<div class="card">
  <div class="emoji">${a.emoji}</div>
  <div class="body">
    <div class="eyebrow">ไทป์กรุงเทพฯ ของฉัน · My Bangkok Type</div>
    <h1>${esc(a.name.th)}</h1>
    <h2>${esc(a.name.en)}</h2>
    <p>${esc(a.tagline.th)}<br>${esc(a.tagline.en)}</p>
  </div>
  <div class="foot"><span class="brand"><span class="mark">${MARK_SVG}</span><b>${BRAND.name}</b></span><span>คุณเป็นไทป์ไหน? · What's yours? ${HOST}/types</span></div>
</div>`;
}

function render(html: string, file: string, tmp: string) {
  const page = join(tmp, `${file}.html`);
  const png = join(tmp, `${file}.png`);
  writeFileSync(page, html);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630", "--virtual-time-budget=3000", `--screenshot=${png}`, `file://${page}`], { stdio: "ignore" });
  // JPEG keeps each card small for chat apps; quality 86 keeps the type crisp.
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "86", png, "--out", join(OUT, `${file}.jpg`)], { stdio: "ignore" });
}

const tmp = mkdtempSync(join(tmpdir(), "jg-cards-"));
mkdirSync(join(OUT, "types"), { recursive: true });
mkdirSync(join(tmp, "types"), { recursive: true });
render(siteCard(), "site", tmp);
for (const key of ARCHETYPE_KEYS) render(typeCard(key), `types/${typeSlug(key)}`, tmp);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote design/assets/og/site.jpg and ${ARCHETYPE_KEYS.length} type cards`);
