/**
 * The one stylesheet, inlined into every page (no build step, no extra request).
 * Palette: Jurrgun green. Fresh mint ground, a deep-enough green for text and
 * buttons (white on --brand passes 4.5:1), bright greens and lime for
 * gradients, sunny yellow for "mine". Dark mode keeps the same family.
 */
export const STYLES = `
:root{
  --bg:#f3fbf5;--surface:#ffffff;--surface-2:#e7f6ec;--ink:#10281b;--ink-2:#3d5a49;--ink-3:#668473;
  --line:#d3eadb;--brand:#0c8a45;--brand-ink:#ffffff;--brand-soft:#dcf5e5;--fresh:#22c55e;--lime:#a3e635;
  --gold:#e8a50b;--gold-soft:#fff5d1;
  --ok:#15803d;--ok-soft:#dcfce7;--warn:#a35a00;--warn-soft:#fff1cc;--err:#c2261d;--err-soft:#fde8e6;
  --radius:18px;--shadow:0 1px 2px rgba(16,40,27,.05),0 8px 24px rgba(12,138,69,.08);
  --hero:linear-gradient(135deg,#0c8a45 0%,#22c55e 55%,#a3e635 120%);
  /* Inter for Latin; Thai has no Inter glyphs, so it falls back to IBM Plex Sans Thai. */
  --font:'Inter','IBM Plex Sans Thai',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0b1610;--surface:#122019;--surface-2:#192b21;--ink:#eaf7ef;--ink-2:#b5cfbe;--ink-3:#84a190;
  --line:#24392c;--brand:#3ddc84;--brand-ink:#04210f;--brand-soft:#163a25;--fresh:#4ade80;--lime:#bef264;
  --gold:#f5c04a;--gold-soft:#3a2f12;
  --ok:#6ee7a0;--ok-soft:#15351f;--warn:#f6c063;--warn-soft:#3a2c12;--err:#ff8a80;--err-soft:#3d1b19;
  --shadow:0 1px 2px rgba(0,0,0,.35),0 8px 24px rgba(0,0,0,.25);
  --hero:linear-gradient(135deg,#0f5c32 0%,#16a34a 55%,#65a30d 120%);
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(1200px 500px at 50% -120px,var(--brand-soft),transparent 70%),var(--bg);background-attachment:fixed;color:var(--ink);font-family:var(--font);font-size:16px;line-height:1.6;padding-bottom:84px}
body.admin{padding-bottom:0}
a{color:var(--brand)}
h1{font-size:1.6rem;line-height:1.25;margin:.5rem 0 1rem;letter-spacing:-.02em}
h2{font-size:1.2rem;margin:1.8rem 0 .8rem;letter-spacing:-.01em}
h3{font-size:1.02rem;margin:.2rem 0 .3rem}
p{margin:.4rem 0}
small,.muted{color:var(--ink-3);font-size:.86rem}
.proto-banner{background:var(--gold-soft);color:var(--warn);font-size:.78rem;text-align:center;padding:4px 12px}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.brand{font-weight:700;font-size:1.08rem;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:6px}
.brand-mark{display:inline-flex;width:30px;height:30px}.brand-mark svg{width:100%;height:100%}
.brand small{font-weight:500;color:var(--ink-3);font-size:.78rem;margin-left:2px}
.top-actions{display:flex;gap:6px;align-items:center}
.chip{display:inline-block;padding:4px 10px;border:1px solid var(--line);border-radius:999px;font-size:.82rem;color:var(--ink-2);text-decoration:none;background:var(--surface)}
.icon-link{text-decoration:none;font-size:1.1rem;padding:2px 6px}
.wrap{max-width:640px;margin:0 auto;padding:20px 20px 36px}
.wrap.wide{max-width:1100px}
.foot{max-width:1100px;margin:24px auto 0;padding:16px;display:flex;flex-wrap:wrap;gap:12px;font-size:.82rem;color:var(--ink-3)}
.foot a{color:var(--ink-3)}
.tabbar{position:fixed;bottom:0;left:0;right:0;z-index:6;display:grid;grid-template-columns:repeat(5,1fr);background:var(--surface);border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.tabbar a{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:.72rem;color:var(--ink-3);text-decoration:none;padding:4px 2px;border-radius:10px;min-height:44px;justify-content:center}
.tabbar a span{font-size:1.15rem}
.tabbar a.center{position:relative;margin:-22px 6px 0;min-height:64px;border-radius:18px;background:var(--brand);color:var(--brand-ink);font-weight:700;box-shadow:0 8px 22px color-mix(in srgb,var(--brand) 45%,transparent)}
.tabbar a.center span{font-size:1.5rem}
.tabbar a{white-space:nowrap}.tabbar a.center{font-size:.68rem;padding:4px 2px}
.tabbar a.center.on{background:var(--brand);color:var(--brand-ink);outline:3px solid color-mix(in srgb,var(--gold) 70%,transparent)}
.tabbar a.on{color:var(--brand);font-weight:600;background:var(--brand-soft)}
.adminnav{max-width:1100px;margin:8px auto 0;padding:0 16px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.adminnav a{white-space:nowrap;padding:6px 12px;border-radius:999px;text-decoration:none;color:var(--ink-2);border:1px solid var(--line);background:var(--surface);font-size:.88rem}
.adminnav a.on{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.card{display:block;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:20px 20px;margin:16px 0;box-shadow:var(--shadow);color:inherit}
.card.link{text-decoration:none;transition:transform .12s ease}
.card.link:hover{transform:translateY(-1px)}
.card.hero{background:var(--hero);color:#fff;border:none}
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
.field{display:flex;flex-direction:column;gap:6px;margin:18px 0}
.field label,fieldset legend{font-weight:600;font-size:.94rem}
.social{display:flex;flex-direction:column;gap:10px;margin:16px 0 4px}
.social-btn{justify-content:center;gap:10px;font-weight:700}
.social-line{background:#06c755;color:#fff;border-color:#06c755}
.social-google{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.social-mark{font-weight:900;font-size:.78rem;letter-spacing:.02em}
.social-google .social-mark{font-size:1.05rem;color:#4285f4}
.social-or{display:flex;align-items:center;gap:12px;color:var(--ink-3);font-size:.85rem;margin:8px 0 0}
.social-or::before,.social-or::after{content:"";flex:1;height:1px;background:var(--line)}
.pw{position:relative;display:flex}
.pw input{flex:1;padding-right:76px}
.pw-toggle{position:absolute;right:6px;top:50%;transform:translateY(-50%);min-height:36px;padding:0 12px;border:none;border-radius:999px;background:var(--surface-2);color:var(--brand);font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}
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
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:600;border-radius:999px;padding:10px 18px;min-height:46px;border:1px solid transparent;cursor:pointer;text-decoration:none}
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
dl.facts{display:grid;grid-template-columns:minmax(110px,auto) 1fr;gap:6px 14px;margin:10px 0}
dl.facts dt{color:var(--ink-3);font-size:.88rem}
dl.facts dd{margin:0}
.faq details{margin:8px 0}
.faq summary{list-style:none;display:flex;justify-content:space-between;gap:10px;min-height:28px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--brand);font-weight:700}
.faq details[open] summary::after{content:"−"}
.faq details p{color:var(--ink-2);margin:8px 0 2px}
.helplines{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.helplines li{display:flex;gap:12px;align-items:center}
.helplines small{display:block}
.hotline{flex:none;min-width:64px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:var(--brand-soft);color:var(--brand);font-weight:700;font-size:1.1rem;text-decoration:none}
.learn section{margin-top:6px}
.learn ul{padding-left:20px}
.learn li{margin:6px 0}
.legend ul{list-style:none;padding:0;margin:8px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.legend li{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.legend li.on{border-color:var(--brand);background:var(--brand-soft)}
.legend li b{font-size:1.4rem;line-height:1}
.legend li small{display:block;color:var(--ink-3);font-size:.8rem}
.code-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:8px 0 2px}
.code-chips span{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--surface-2);font-weight:700;letter-spacing:.06em;font-size:.86rem}
.code-chips span.flavour{font-weight:600;letter-spacing:0;background:var(--gold-soft);color:var(--warn)}
.type-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;letter-spacing:.12em;color:var(--brand)}
.type-grid .code-chips{justify-content:flex-start;margin:4px 0}
.type-grid .code-chips span{padding:2px 7px;font-size:.78rem;gap:2px}
.type-grid .code-chips b{font-size:.85rem!important;line-height:1}
/* intro (first visit) */
.intro{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--bg)}
.intro-skip{position:absolute;top:calc(14px + env(safe-area-inset-top));right:16px;z-index:2;padding:6px 14px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink-2);text-decoration:none;font-weight:600}
.intro-track{flex:1;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;outline:none}
.intro-track::-webkit-scrollbar{display:none}
.intro-slide{flex:0 0 100%;scroll-snap-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:72px 28px 24px;gap:6px}
.intro-slide h1{font-size:1.9rem;margin:10px 0 4px}
.intro-slide p{max-width:30ch;color:var(--ink-2);font-size:1.05rem}
.intro-art{width:min(62vw,240px);aspect-ratio:1;border-radius:36%;display:grid;place-items:center;box-shadow:0 18px 50px color-mix(in srgb,var(--fresh) 30%,transparent);animation:float 5s ease-in-out infinite}
.intro-art b{font-size:min(28vw,108px);line-height:1}
.intro-mark{display:block;width:72%;height:72%}.intro-mark svg{width:100%;height:100%;filter:drop-shadow(0 8px 18px rgba(0,0,0,.18))}
.s1 .intro-art{background:none;box-shadow:none}.s1 .intro-mark{width:100%;height:100%}
.s2 .intro-art{background:linear-gradient(135deg,#bbf7d0,#4ade80)}
.s3 .intro-art{background:linear-gradient(135deg,#dcfce7,#86efac)}
.s4 .intro-art{background:linear-gradient(135deg,#ecfccb,#a3e635)}
.s5 .intro-art{background:linear-gradient(135deg,#bbf7d0,#22c55e 60%,#facc15 130%)}
.intro-cta{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:14px}
.intro-cta .btn{min-width:220px}
.intro-foot{display:flex;align-items:center;justify-content:space-between;padding:12px 20px calc(14px + env(safe-area-inset-bottom))}
.intro-dots{display:flex;gap:8px}
.intro-dots i{width:8px;height:8px;border-radius:999px;background:var(--line);transition:width .25s ease,background .25s ease}
.intro-dots i.on{width:26px;background:var(--brand)}
.intro-lang{position:absolute;top:calc(18px + env(safe-area-inset-top));left:18px;margin:0;font-size:.85rem}
.hero-mark{display:inline-flex;width:64px;height:64px;margin-bottom:6px}.hero-mark .brand-mark{width:64px;height:64px}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.intro-art{animation:none}}
.card h3>span[aria-hidden]{display:inline-grid;place-items:center;width:34px;height:34px;margin-right:8px;border-radius:12px;background:var(--brand-soft);vertical-align:middle}
hr{border:none;border-top:1px solid var(--line);margin:18px 0}
@media (min-width:900px){body:not(.admin){padding-bottom:84px}}
/* ---- native polish ---- */
[hidden]{display:none!important}
a,button,label,summary,.btn,.card.link,.pill span,.chip{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.btn,.card.link,.pill span,.answer span,.tile,.rail a,.chip,.tabbar a{transition:transform 60ms ease,background-color .15s ease,border-color .15s ease}
.btn:active,.card.link:active,.pill:active span,.answer:active span,.tile:active,.rail a:active,.chip:active,.tabbar a:active{transform:scale(.97)}
.btn{min-height:48px}
main.wrap{animation:page-in .22s ease both}
@keyframes page-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.topbar{padding:8px 16px}
.proto-banner{padding:2px 12px;font-size:.72rem}
@media (max-width:520px){
  h1{font-size:1.4rem;margin:.3rem 0 .6rem}
  h2{margin:1.5rem 0 .7rem}
  .card{padding:18px 18px;margin:14px 0}
  .wrap{padding:16px 18px 28px}
}
body.bare{padding-bottom:0}
body.bare .foot{display:none}
details.info{display:inline-block;background:none;border:none;padding:0;margin:0 0 6px;vertical-align:middle}
details.info summary{list-style:none;display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;border-radius:999px;color:var(--brand);font-weight:600;font-size:1rem}
details.info summary::-webkit-details-marker{display:none}
details.info[open]{display:block;background:var(--brand-soft);border-radius:12px;padding:6px 12px 10px}
details.info div{font-size:.9rem;color:var(--ink-2)}
/* ---- card flow ---- */
.flow{display:flex;flex-direction:column;min-height:calc(100svh - 120px)}
.flow-top{display:flex;align-items:center;gap:10px;margin:4px 0 14px}
.flow-progress{flex:1;height:6px;border-radius:3px;background:var(--line);overflow:hidden}
.flow-progress i{display:block;height:100%;background:var(--brand);border-radius:3px;transition:width .3s ease}
.flow-close{text-decoration:none;color:var(--ink-3);font-size:1.1rem;min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px}
.flow-steps{flex:1}
.flow-step{padding-bottom:18px}
.flow:not(.is-js) .flow-step+.flow-step{border-top:1px solid var(--line);padding-top:12px}
.flow.is-js .flow-step[hidden]{display:none}
.flow-step fieldset{margin:0}
.flow-title{font-size:1.4rem;font-weight:700;line-height:1.3;margin:0 0 6px;padding:0;outline:none}
.flow-emoji{display:block;font-size:2.4rem;line-height:1.2;margin-bottom:4px}
.flow-hint{color:var(--ink-3);font-size:.92rem;margin:0 0 8px}
.flow-need{color:var(--err);font-size:.9rem}
.flow-error{margin-bottom:6px}
.flow-bar{position:sticky;bottom:0;z-index:4;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0 calc(10px + env(safe-area-inset-bottom));background:linear-gradient(to top,var(--bg) 78%,transparent)}
body:has(.tabbar) .flow-bar{bottom:calc(62px + env(safe-area-inset-bottom))}
.flow-bar .flow-next,.flow-bar>.btn:first-child{flex:1}
.flow-bar .flow-back{min-width:52px;font-size:1.2rem}
.flow-bar .skip{flex-basis:100%;background:none;border:none;color:var(--ink-3);font:inherit;font-size:.9rem;min-height:40px;cursor:pointer;text-decoration:underline}
.btn.is-busy{opacity:.7}
.flow-step.in-f{animation:slide-f .26s cubic-bezier(.2,.8,.2,1) both}
.flow-step.in-b{animation:slide-b .26s cubic-bezier(.2,.8,.2,1) both}
@keyframes slide-f{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes slide-b{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
.flow-step.shake{animation:shake .3s ease}
@keyframes shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.flow .field input,.flow .field select{min-height:52px;font-size:1.05rem}
.flow .pills{gap:10px}
.flow .pill span{min-height:48px;display:inline-flex;align-items:center;padding:10px 16px}
.flow .toggle{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:8px 0;min-height:52px;align-items:center}
.flow .toggle small{margin-top:2px}
.tap-hint{display:inline-block;font-size:.82rem;color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:2px 10px;margin:0 0 8px}
/* answer cards (choice) and scale pills */
.answers{display:grid;gap:10px;margin-top:10px}
.answer{position:relative;display:block}
.answer input{position:absolute;opacity:0;inset:0}
.answer span{display:flex;align-items:center;gap:12px;min-height:72px;padding:14px 16px;border-radius:16px;border:1.5px solid var(--line);background:var(--surface);box-shadow:var(--shadow);cursor:pointer;font-weight:500;line-height:1.35}
.answer-emoji{font-size:1.5rem;flex:none}
.answer-badge{flex:none;width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-2);color:var(--brand);font-size:.9rem}
.answer input:checked+span .answer-badge{background:var(--brand);color:var(--brand-ink)}
.answer input:checked+span{border-color:var(--brand);background:var(--brand-soft);color:var(--ink)}
.answer input:focus-visible+span{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:14px}
.scale .answer span{min-height:56px;justify-content:center;font-weight:700;font-size:1.1rem;padding:6px;border-radius:14px}
.scale-ends{display:flex;justify-content:space-between;gap:12px;font-size:.84rem;color:var(--ink-3);margin-top:6px}
.scale-ends span:last-child{text-align:right}
/* splash and tiles */
.splash{text-align:center;padding:12px 0 0}
.splash-mark{font-size:3.4rem;color:var(--brand);line-height:1}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.tile{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 6px;font-size:.84rem;line-height:1.3;color:var(--ink-2);text-decoration:none}
.tile b{font-size:1.6rem;line-height:1.2}
.hero-lite{padding:18px 0 4px}
.hero-lite h1{font-size:1.75rem;margin:0 0 4px}
.hero-lite p{color:var(--ink-2);margin:0 0 14px}
.hero-lite .row{gap:12px}
.teaser{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--brand-soft),var(--gold-soft));border:1px solid var(--line);border-radius:16px;padding:14px 16px;text-decoration:none;color:var(--ink);margin:14px 0}
.teaser b.big{font-size:2rem}
.teaser strong{display:block}
.teaser small{display:block}
.teaser::after{content:"→";margin-left:auto;color:var(--brand);font-weight:700}
/* horizontal snap rail */
.rail-wrap{position:relative;margin:0 -16px}
.rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 16px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.rail::-webkit-scrollbar{display:none}
.rail a{flex:0 0 72%;max-width:260px;scroll-snap-align:start;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;text-decoration:none;color:var(--ink);box-shadow:var(--shadow)}
.rail a b{display:block;font-size:1.8rem;line-height:1.3}
.rail a small{display:block;margin-top:4px}
.rail-wrap::after{content:"";position:absolute;top:0;right:0;bottom:10px;width:32px;background:linear-gradient(to left,var(--bg),transparent);pointer-events:none}
.swipe-hint{font-size:.8rem;color:var(--ink-3);font-weight:400;margin-left:6px}
/* Bangkok Types */
.type-hero{text-align:center;padding:8px 0 4px}
.type-emoji{font-size:4.2rem;line-height:1.1;display:block}
.type-hero.reveal .type-emoji{animation:pop .5s cubic-bezier(.2,1.4,.4,1) both}
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
.type-hero h1{margin:.2rem 0}
.type-hero p{color:var(--ink-2);margin:0}
.meter{list-style:none;padding:0;margin:8px 0;display:grid;gap:10px}
.meter li{display:grid;gap:3px}
.meter .ends{display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink-3)}
.meter .ends b{color:var(--ink);font-weight:600}
.meter .track{position:relative;height:10px;border-radius:5px;background:var(--surface-2)}
.meter .track::before{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line)}
.meter .track i{position:absolute;top:0;bottom:0;border-radius:5px;background:var(--brand)}
.meter .track i.leans{opacity:.65}
.meter .track i.balanced{background:var(--ink-3);opacity:.45}
.matches{display:grid;gap:8px}
.matches a{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
.matches a b{font-size:1.4rem}
.matches small{display:block}
.type-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.type-grid a{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px}
.type-grid a b{font-size:1.8rem}
.type-grid a small{line-height:1.35}
.type-grid a.me{border-color:var(--brand);background:var(--brand-soft)}
.inline-toggle{display:flex;align-items:center;gap:10px;justify-content:space-between}
/* ==== Bangkok livery ====================================================
 * The signature layer. Bangkok's city colour is green, so the app is dressed
 * in deep BMA green with fresh-green and lime accents, set in Inter.
 * Clean and flat: no stripes or patterns. Everything
 * here overrides the plain base above, so pages need no new classes.
 * ===================================================================== */
:root{
  --deep:#06492a;--deep-2:#0a5e37;--on-deep:#ffffff;--on-deep-2:#c9f7d9;--lime:#b4f03a;
  --display:var(--font);
  --radius:22px;
}
@media (prefers-color-scheme:dark){:root{--deep:#06301c;--deep-2:#0b4329;--on-deep-2:#a7e9bf;--lime:#c6f45a}}

body{background:radial-gradient(900px 420px at 85% -60px,color-mix(in srgb,var(--lime) 22%,transparent),transparent 70%),radial-gradient(1000px 520px at 0% -80px,var(--brand-soft),transparent 70%),var(--bg);background-attachment:fixed;padding-bottom:104px}
h1,h2,.flow-title,.me-hi{font-family:var(--display);letter-spacing:-.025em}
h1{font-size:1.85rem;font-weight:800;line-height:1.12}
h2{font-weight:700}

/* Top bar */
.topbar{background:var(--deep);color:var(--on-deep);border-bottom:none;backdrop-filter:none;padding:12px 16px 14px}
.topbar .brand{color:var(--on-deep);font-weight:800;font-size:1.15rem;letter-spacing:-.02em}
.topbar .brand small{color:var(--lime);font-family:var(--font);font-weight:600;letter-spacing:0}
.topbar .brand-mark svg rect:first-child{fill:var(--fresh)}
.topbar .chip{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);color:var(--on-deep)}
.topbar .icon-link{color:var(--on-deep)}
.proto-banner{background:var(--lime);color:var(--deep);font-weight:600}
main.wrap{padding-top:26px}

/* Buttons: deep green */
.btn{border-radius:16px;font-weight:700;letter-spacing:-.005em}
.btn.primary{background:var(--deep);color:var(--on-deep);box-shadow:0 6px 18px color-mix(in srgb,var(--deep) 30%,transparent)}
.btn.primary:hover{background:var(--deep-2)}
.btn.ghost{background:var(--surface);color:var(--deep);border:2px solid color-mix(in srgb,var(--deep) 35%,var(--line))}
@media (prefers-color-scheme:dark){.btn.ghost{color:var(--on-deep-2)}.btn.primary{background:var(--brand);color:var(--brand-ink)}.btn.primary:hover{background:var(--fresh)}}

/* Cards: softer and greener */
.card{border-radius:var(--radius);border-color:color-mix(in srgb,var(--brand) 14%,var(--line))}
.card.link{position:relative;overflow:hidden}
.card.link:hover{transform:translateY(-2px);box-shadow:0 14px 34px color-mix(in srgb,var(--brand) 18%,transparent)}
.card.hero{background:var(--deep);box-shadow:var(--shadow)}

/* Teasers: deep green tickets */
.teaser{position:relative;background:var(--deep);color:var(--on-deep);border:none;border-radius:20px;overflow:hidden}
.teaser small,.teaser .muted{color:var(--on-deep-2)}
.teaser::after{color:var(--lime);font-size:1.2rem}

/* Inputs */
input[type=text],input[type=password],input[type=date],input[type=datetime-local],input[type=number],input[type=search],input[type=url],select,textarea{border-radius:14px;border-width:1.5px;min-height:48px}
input:focus,select:focus,textarea:focus{border-color:var(--brand);outline:3px solid color-mix(in srgb,var(--lime) 55%,transparent)}

/* Pills and answers: picked = livery */
.pill span{border-width:1.5px}
.pill input:checked+span,.answer input:checked+span{background:var(--deep);border-color:var(--deep);color:var(--on-deep)}
.tag.accent{background:color-mix(in srgb,var(--lime) 35%,var(--surface));color:var(--deep)}
@media (prefers-color-scheme:dark){.tag.accent{color:var(--on-deep-2);background:var(--brand-soft)}}

/* Progress */
.flow-progress,.bar,.me-bar{height:10px;border-radius:999px}
.flow-progress i,.bar>i,.me-bar i{background:linear-gradient(90deg,var(--fresh),var(--lime))}

/* Tab bar: a floating deep-green carriage */
.tabbar{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));padding:6px;border:none;border-radius:26px;background:var(--deep);box-shadow:0 14px 34px rgba(4,40,22,.35)}
.tabbar a{color:color-mix(in srgb,var(--on-deep) 72%,transparent);border-radius:18px}
.tabbar a.on{color:var(--lime);background:rgba(255,255,255,.08);font-weight:700}
.tabbar a.center{background:var(--lime);color:var(--deep);border-radius:22px;margin:-26px 4px 0;box-shadow:0 0 0 5px var(--bg),0 10px 22px rgba(4,40,22,.3)}
.tabbar a.center.on{background:var(--lime);color:var(--deep);outline:none;box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--fresh)}
body:has(.tabbar) .flow-bar{bottom:calc(84px + env(safe-area-inset-bottom))}

/* Flow cards */
.flow-emoji{display:grid;place-items:center;width:64px;height:64px;font-size:2.1rem;margin-bottom:10px;border-radius:22px;background:color-mix(in srgb,var(--lime) 30%,var(--surface));transform:rotate(-4deg)}
.flow-title{font-size:1.6rem;font-weight:800;line-height:1.15}

/* Footer */
.foot{border-top:1px solid var(--line);margin-top:36px;padding-top:18px}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
