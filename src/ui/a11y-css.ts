/**
 * Accessibility pass (WCAG 2.1 AA, plus the 2.2 target size). Loaded last so
 * it wins over the looks layered above it. Each block says which check it
 * fixes; colours were measured against both themes.
 */
import { themed } from "./styles";

export const A11Y_CSS = themed(`
:root{
  /* Field and switch edges: 3:1 or more against the card and the page (1.4.11). */
  --field-line:#8c7a66;--switch-off:#5f6d63;
}
@media (prefers-color-scheme:dark){:root{--field-line:#6b8a77;--switch-off:#8aa896}}

/* Skip to content (2.4.1): hidden until it gets keyboard focus. */
.skip-link{position:absolute;left:12px;top:-60px;z-index:100;padding:10px 16px;border-radius:12px;background:var(--surface);color:var(--ink);font-weight:700;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.2);outline:3px solid var(--brand)}
.skip-link:focus{top:calc(10px + env(safe-area-inset-top,0px))}
main:focus{outline:none}

/* Inputs show where they are (1.4.11); invalid ones say so in colour and text (3.3.1). */
input[type=text],input[type=password],input[type=date],input[type=datetime-local],input[type=number],input[type=search],input[type=url],input[type=email],input[type=tel],select,textarea{border:1.5px solid var(--field-line)}
input:focus,select:focus,textarea:focus{border-color:var(--brand)}
.fd-search input{border:0}
[aria-invalid="true"]{border-color:var(--err)!important;box-shadow:0 0 0 1px var(--err)}
.field-err{display:block;color:var(--err);font-weight:600}
.pill span{border:1.5px solid var(--field-line)}
.pill input:checked+span{border-color:var(--brand)}

/* Switches: the off state is visible too (1.4.11). */
.qs:not([aria-pressed=true]) .sw,.a11y-row input:not(:checked){background:var(--surface);box-shadow:inset 0 0 0 2px var(--switch-off)}
.qs:not([aria-pressed=true]) .sw::after,.a11y-row input:not(:checked)::after{background:var(--switch-off);box-shadow:none}

/* Keyboard focus is always visible, the centre tab included (2.4.7). */
.tabbar a:focus-visible,.tabbar a.center:focus-visible,.tabbar a.center.on:focus-visible,.top-nav a:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.intro-track:focus-visible{outline:3px solid var(--brand);outline-offset:-3px}

/* Text that was below 4.5:1 (1.4.3). */
.notif-dot{color:#1e2b22;font-size:.75rem;min-width:20px;height:20px;line-height:20px}
.fullmap .svm-k.highlight{color:#1e2b22}

/* Grey notes on the pale love-red panel: 5.2:1 in light (dark already passes). */
#dating-prompts{--ink-3:#56635a}
@media (prefers-color-scheme:dark){#dating-prompts{--ink-3:#8aa896}}

/* Nothing under 12px (readability). */
.proto-banner{font-size:.78rem}
.tabbar a,.tabbar a.center{font-size:.76rem}
.ev-date small{font-size:.75rem}
.seats small{font-size:.78rem}
.stamps li{font-size:.75rem}
.kv small,.fact small,.stats.month small{font-size:.78rem}
/* The map writes its own styles later in the page, so these need the extra .fullmap. */
.fullmap .fd-rail-btn{font-size:.75rem}
.fullmap .svm-k.highlight{font-size:.75rem}
/* Staff overview: an odd number tile out spans the row on phones. */
@media (max-width:520px){body.admin .stats>:last-child:nth-child(odd){grid-column:1/-1}}
.fullmap .fd-logo small{font-size:.66rem;letter-spacing:-.01em}

/* Tap targets at least 24px tall (2.5.8, WCAG 2.2 AA). */
.foot a{display:inline-flex;align-items:center;min-height:32px}
.row>a:not(.btn),.spread>a:not(.btn),h2>a,.me-group a,.tk-item{display:inline-flex;align-items:center;min-height:32px}
/* Links inside text keep their line, but get a taller tap area. */
:where(main,.fd-sheet) :where(a:not(.btn,.card,.tile,.tile2)){padding-block:4px}

/* Staff header fits one line on phones. */
.topbar .chip,.topbar .brand,.topbar .brand small{white-space:nowrap}
@media (max-width:520px){body.admin .topbar .brand small{display:none}}

/* /new: the hero carries its own call to action. */
.hero-cta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:14px}
.hero-btn{background:#fff;color:#0e5f33;border:0;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.hero-btn:hover{background:#f2fbf5}
.tile2 .hero-btn{text-shadow:none}
.hero-link{color:#fff;font-weight:700;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:inline-flex;align-items:center}

/* Discover list: shorter covers, so more events fit on a phone screen. */
.ev-card{--notch:96px}
.ev-card.feat{--notch:140px}
.ev-card .event-cover{height:96px;z-index:1}
.ev-card.feat .event-cover{height:140px}
.ev-card .event-cover .scene-badge{width:46px;height:46px;border-radius:15px}
.seg{flex-wrap:nowrap}
.seg a{flex:1 1 auto;min-width:0;white-space:normal;text-align:center;line-height:1.15;padding:6px 8px;font-size:.86rem}
body:has(.view-switch) .discover-list{padding-bottom:72px}
/* Sticky action bars (card flows, the quiz result's Done / Retake): a solid
   cream ground edge to edge with a hairline and soft shadow, so text scrolling
   behind never shows around the buttons. */
main :is(.flow-bar,.pf-save){background:var(--bg);border-top:1px solid var(--line);box-shadow:0 -8px 18px rgba(30,43,34,.07);margin-inline:calc(-1 * var(--gx,20px));padding-inline:var(--gx,20px);-webkit-backdrop-filter:none;backdrop-filter:none}
/* Phones and tablets: the cream carries on down behind the floating tab bar.
   Laptops (top menu): the bars sit at the very bottom instead. */
@media (max-width:1023.98px){body:has(.tabbar) main :is(.flow-bar,.pf-save)::after{content:"";position:absolute;left:0;right:0;top:100%;height:calc(112px + env(safe-area-inset-bottom,0px));background:var(--bg);pointer-events:none}}
@media (min-width:1024px){body:has(.top-nav) main .pf-save{bottom:0}}

/* Laptops: the Map / Cards switch sits in the page, not over the cards. */
@media (min-width:900px){body:not(.fullmap-body) .view-switch{position:static;transform:none;display:inline-flex;margin:0 0 12px;box-shadow:none}body:has(.view-switch) .discover-list{padding-bottom:0}}

/* Event page: the RSVP bar sits above the tab bar until the form is on screen. */
.sticky-cta{position:fixed;z-index:8;left:12px;right:12px;bottom:calc(106px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:616px;margin:0 auto;padding:10px 10px 10px 16px;border-radius:20px;background:color-mix(in srgb,var(--surface) 92%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--line);box-shadow:0 12px 30px rgba(0,0,0,.16);transition:transform .25s ease,opacity .25s ease}
.sticky-cta.is-off{transform:translateY(16px);opacity:0;pointer-events:none;visibility:hidden}
.sticky-cta-note{font-weight:700;color:var(--ink-2)}
.sticky-cta .btn{min-height:48px;flex:none}
body:has(.sticky-cta) main.wrap{padding-bottom:110px}
@media (min-width:900px){.sticky-cta{bottom:20px}}

/* Me: an odd tile out spans the row instead of sitting alone. */
.me-menu>:last-child:nth-child(odd){grid-column:1/-1}

/* Landing heroes: a shade behind the text so it reads on any sky (1.4.3). */
.tile2.hero .tile2-art::after{background:linear-gradient(to top,rgba(8,20,14,.78) 0%,rgba(8,20,14,.6) 55%,rgba(8,20,14,.5) 100%)}
.tile2.hero .tile2-body{text-shadow:0 1px 3px rgba(0,0,0,.6),0 0 14px rgba(0,0,0,.35)}
.tile2.hero small{opacity:1;align-self:flex-start;max-width:100%;padding:3px 9px;border-radius:10px;background:rgba(8,20,14,.55);-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tile2.hero .hero-title{margin:0;line-height:1.1;font-size:1.9rem;letter-spacing:-.02em}

/* Intro: language and accessibility sit together, top left, 44px taps. */
.intro-tools{position:absolute;z-index:3;top:calc(10px + env(safe-area-inset-top,0px));left:12px;display:flex;align-items:center;gap:6px}
.intro-tools .intro-lang{position:static;display:flex;gap:2px;margin:0;font-size:.9rem}
.intro-tools .intro-lang a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;border-radius:999px;color:var(--ink-2);font-weight:600;text-decoration:none}
.intro-tools .intro-lang a[aria-current]{background:var(--surface);color:var(--brand);box-shadow:0 0 0 1px var(--line)}
.intro-a11y>summary{width:44px;height:44px;background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.intro .a11y-panel{position:fixed;left:12px;right:12px;width:auto;max-width:360px;top:calc(64px + env(safe-area-inset-top,0px))}
.intro-skip{min-height:44px;display:inline-flex;align-items:center}
/* The floating art moves for three loops, then rests (2.2.2). */
.intro-art{animation-iteration-count:3}

/* Staff area: the menu wraps on laptops instead of being cut off; phones keep the scroll. */
@media (min-width:900px){.adminnav{flex-wrap:wrap;overflow:visible;row-gap:8px}}
/* Long staff tables keep their column headings in view, and can be filtered. */
.table-wrap.scroll{max-height:72vh;overflow:auto}
.table-wrap.scroll thead th{position:sticky;top:0;z-index:1;box-shadow:0 1px 0 var(--line)}
.tfilter{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:12px 0 8px}
.tfilter label{font-weight:600;font-size:.92rem}
.tfilter input{max-width:360px;flex:1 1 220px}
.tfilter small{color:var(--ink-2)}
/* Server-paged tables: "Showing 51–100 of 142" and Previous / Next. */
.pager{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:10px 0}
.pager p{margin:0;color:var(--ink-2)}
/* A heading that's an h2 for the outline but sized like an h3. */
h2.h3{font-size:1.02rem;margin:.2rem 0 .3rem}

/* Reflow at 320px (1.4.10): nothing makes the page scroll sideways. */
@media (max-width:380px){
  .topbar{gap:8px;padding-inline:10px}
  .topbar .brand small{display:none}
  .top-actions{gap:4px}
  .topbar .chip{padding:4px 9px}
  body.admin .topbar .brand{font-size:0;gap:0}
}
.pf-photo{grid-template-columns:minmax(0,1fr)}
.pf-photo>*{min-width:0;max-width:100%}
.me-hero{overflow-x:clip}

/* Missing page and error page. */
.err-page{text-align:center;padding:8vh 0 4vh}
.err-page .row{justify-content:center}
.err-mark{font-size:3rem;margin:0}
.intro-slide h2{font-size:1.9rem;font-weight:800;margin:10px 0 4px;line-height:1.15}
`);
