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

/* Event page: the RSVP bar sits above the tab bar until the form is on screen. */
.sticky-cta{position:fixed;z-index:8;left:12px;right:12px;bottom:calc(106px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:616px;margin:0 auto;padding:10px 10px 10px 16px;border-radius:20px;background:color-mix(in srgb,var(--surface) 92%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--line);box-shadow:0 12px 30px rgba(0,0,0,.16);transition:transform .25s ease,opacity .25s ease}
.sticky-cta.is-off{transform:translateY(16px);opacity:0;pointer-events:none;visibility:hidden}
.sticky-cta-note{font-weight:700;color:var(--ink-2)}
.sticky-cta .btn{min-height:48px;flex:none}
body:has(.sticky-cta) main.wrap{padding-bottom:110px}
@media (min-width:900px){.sticky-cta{bottom:20px}}

/* Me: an odd tile out spans the row instead of sitting alone. */
.me-menu>:last-child:nth-child(odd){grid-column:1/-1}

/* Missing page and error page. */
.err-page{text-align:center;padding:8vh 0 4vh}
.err-page .row{justify-content:center}
.err-mark{font-size:3rem;margin:0}
.intro-slide h2{font-size:1.9rem;font-weight:800;margin:10px 0 4px;line-height:1.15}
`);
