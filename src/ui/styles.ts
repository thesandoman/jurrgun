/**
 * The one stylesheet, inlined into every page (no build step, no extra request).
 * Palette: river teal + temple gold on warm paper; dark theme mirrors it.
 */
export const STYLES = `
:root{
  --bg:#faf7f2;--surface:#ffffff;--surface-2:#f3eee6;--ink:#1d2321;--ink-2:#4b5652;--ink-3:#6e7a75;
  --line:#e4ddd2;--brand:#0f6b5c;--brand-ink:#ffffff;--brand-soft:#e3f1ed;--gold:#c08a1e;--gold-soft:#fbf1dc;
  --ok:#1f7a4a;--ok-soft:#e5f4ea;--warn:#9a5b00;--warn-soft:#fff3dc;--err:#b3261e;--err-soft:#fde8e6;
  --radius:14px;--shadow:0 1px 2px rgba(29,35,33,.06),0 6px 20px rgba(29,35,33,.06);
  --font:'IBM Plex Sans Thai',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#111614;--surface:#18201d;--surface-2:#1f2925;--ink:#ecf2ef;--ink-2:#b9c6c0;--ink-3:#8c9a94;
  --line:#2b3632;--brand:#3fb59d;--brand-ink:#08221c;--brand-soft:#173a32;--gold:#e0b24f;--gold-soft:#3a2f17;
  --ok:#6fd39c;--ok-soft:#173526;--warn:#f2b45a;--warn-soft:#3a2c14;--err:#ff8a80;--err-soft:#3d1b19;
  --shadow:0 1px 2px rgba(0,0,0,.3);
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:16px;line-height:1.6;padding-bottom:84px}
body.admin{padding-bottom:0}
a{color:var(--brand)}
h1{font-size:1.55rem;line-height:1.3;margin:.4rem 0 .8rem}
h2{font-size:1.2rem;margin:1.4rem 0 .6rem}
h3{font-size:1.02rem;margin:.2rem 0 .3rem}
p{margin:.4rem 0}
small,.muted{color:var(--ink-3);font-size:.86rem}
.proto-banner{background:var(--gold-soft);color:var(--warn);font-size:.78rem;text-align:center;padding:4px 12px}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.brand{font-weight:700;font-size:1.08rem;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:6px}
.brand-mark{color:var(--brand);font-size:1.25rem}
.top-actions{display:flex;gap:6px;align-items:center}
.chip{display:inline-block;padding:4px 10px;border:1px solid var(--line);border-radius:999px;font-size:.82rem;color:var(--ink-2);text-decoration:none;background:var(--surface)}
.icon-link{text-decoration:none;font-size:1.1rem;padding:2px 6px}
.wrap{max-width:640px;margin:0 auto;padding:12px 16px 24px}
.wrap.wide{max-width:1100px}
.foot{max-width:1100px;margin:24px auto 0;padding:16px;display:flex;flex-wrap:wrap;gap:12px;font-size:.82rem;color:var(--ink-3)}
.foot a{color:var(--ink-3)}
.tabbar{position:fixed;bottom:0;left:0;right:0;z-index:6;display:grid;grid-template-columns:repeat(5,1fr);background:var(--surface);border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.tabbar a{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:.72rem;color:var(--ink-3);text-decoration:none;padding:4px 2px;border-radius:10px;min-height:44px;justify-content:center}
.tabbar a span{font-size:1.15rem}
.tabbar a.on{color:var(--brand);font-weight:600;background:var(--brand-soft)}
.adminnav{max-width:1100px;margin:8px auto 0;padding:0 16px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.adminnav a{white-space:nowrap;padding:6px 12px;border-radius:999px;text-decoration:none;color:var(--ink-2);border:1px solid var(--line);background:var(--surface);font-size:.88rem}
.adminnav a.on{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.card{display:block;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;margin:10px 0;box-shadow:var(--shadow);color:inherit}
.card.link{text-decoration:none;transition:transform .12s ease}
.card.link:hover{transform:translateY(-1px)}
.card.hero{background:linear-gradient(135deg,var(--brand) 0%,#14806e 60%,var(--gold) 140%);color:#fff;border:none}
.card.hero a{color:#fff}
.event-cover{height:120px;margin:-14px -16px 10px;border-radius:var(--radius) var(--radius) 0 0;background:linear-gradient(135deg,var(--brand-soft),var(--gold-soft));display:flex;align-items:center;justify-content:center;font-size:2.4rem;overflow:hidden}
.event-cover img{width:100%;height:100%;object-fit:cover}
.meta{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--ink-2);font-size:.88rem}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.tag{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--surface-2);color:var(--ink-2);font-size:.78rem}
.tag.accent{background:var(--brand-soft);color:var(--brand)}
.tag.warn{background:var(--warn-soft);color:var(--warn)}
.tag.ok{background:var(--ok-soft);color:var(--ok)}
.tag.muted{opacity:.75}
.notice{border-radius:12px;padding:10px 14px;margin:10px 0;font-size:.94rem}
.notice.ok{background:var(--ok-soft);color:var(--ok)}
.notice.error{background:var(--err-soft);color:var(--err)}
.notice.info{background:var(--brand-soft);color:var(--ink)}
.notice.warn{background:var(--warn-soft);color:var(--warn)}
.empty{color:var(--ink-3);text-align:center;padding:24px 8px}
form{margin:0}
.field{display:flex;flex-direction:column;gap:4px;margin:12px 0}
.field label,fieldset legend{font-weight:600;font-size:.94rem}
input[type=text],input[type=password],input[type=date],input[type=datetime-local],input[type=number],input[type=search],input[type=url],select,textarea{
  width:100%;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-height:44px}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:1px}
fieldset{border:none;padding:0;margin:14px 0}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.pill{position:relative}
.pill input{position:absolute;opacity:0;inset:0}
.pill span{display:inline-block;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);cursor:pointer;min-height:40px;font-size:.92rem}
.pill input:checked+span{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.pill input:focus-visible+span{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
.toggle{display:flex;gap:10px;align-items:flex-start;margin:10px 0;cursor:pointer}
.toggle input{width:22px;height:22px;margin-top:2px;accent-color:var(--brand)}
.toggle small{display:block}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:600;border-radius:12px;padding:10px 18px;min-height:46px;border:1px solid transparent;cursor:pointer;text-decoration:none}
.btn.primary{background:var(--brand);color:var(--brand-ink)}
.btn.ghost{background:transparent;color:var(--brand);border-color:var(--line)}
.btn.danger{background:var(--err-soft);color:var(--err);border-color:transparent}
.btn.block{width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.row.end{justify-content:flex-end}
.spread{display:flex;justify-content:space-between;align-items:center;gap:8px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}
.stat-v{font-size:1.5rem;font-weight:700}
.stat-l{font-size:.84rem;color:var(--ink-2)}
table{width:100%;border-collapse:collapse;font-size:.9rem;background:var(--surface);border-radius:var(--radius);overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--surface-2);font-weight:600;font-size:.84rem}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);margin:10px 0}
.pass{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.pass svg{width:min(280px,80vw);height:auto;background:#fff;padding:12px;border-radius:12px}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;font-size:1.3rem}
.bar{height:10px;border-radius:6px;background:var(--surface-2);overflow:hidden}
.bar > i{display:block;height:100%;background:var(--brand)}
.person{display:flex;gap:12px;align-items:center}
.avatar{width:44px;height:44px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}
.steps{display:flex;gap:4px;margin:6px 0 14px}
.steps i{flex:1;height:5px;border-radius:3px;background:var(--line)}
.steps i.on{background:var(--brand)}
details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:10px 0}
summary{cursor:pointer;font-weight:600}
hr{border:none;border-top:1px solid var(--line);margin:18px 0}
@media (min-width:900px){body:not(.admin){padding-bottom:84px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
