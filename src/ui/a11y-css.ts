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
.row>a:not(.btn),.spread>a:not(.btn),h2>a,.me-group a,.tk-item{display:inline-flex;align-items:center;min-height:44px}
/* Links inside text keep their line, but get a taller tap area. */
:where(main,.fd-sheet) :where(a:not(.btn,.card,.tile,.tile2)){padding-block:4px}

/* Staff header fits one line on phones. */
.topbar .chip,.topbar .brand,.topbar .brand small{white-space:nowrap}
@media (max-width:520px){body.admin .topbar .brand small{display:none}}

/* /new: the hero carries its own call to action. */
.hero-cta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:14px}
.hero-link{color:#fff;font-weight:700;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:inline-flex;align-items:center}

/* Discover list: shorter covers, so more events fit on a phone screen. */
.ev-card{--notch:96px}
.ev-card.feat{--notch:116px}
.ev-card .event-cover{height:96px;z-index:1}
.ev-card.feat .event-cover{height:116px}
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

/* Chosen chips and answer cards carry a tick, not only colour (1.4.1). */
.pill input:checked+span::before,.answer input:checked+span::before{content:"✓";font-weight:800;line-height:1}
.pill input:checked+span::before{margin-inline-end:.3em}
.flow .pill input:checked+span::before{margin-inline-end:0}
/* Emoji and label keep a space between them in flex chips. */
.pill span{column-gap:.35em}
/* Flows: "2 of 5" beside the bar; a compact round Back so Next is the one big button. */
.flow-count{flex:none;font-size:.82rem;font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums}
.flow-bar>.btn.flow-back{flex:0 0 52px;width:52px;padding:0}
/* Calmer flow screens: the emoji sits inline with the question, no tile. */
.flow-emoji{display:inline;width:auto;height:auto;margin:0 .3em 0 0;padding:0;background:none;border-radius:0;transform:none;font-size:1em}
/* Prototype notice: a small chip in the header; tap for the full sentence. */
.topbar details.proto-chip{position:relative;flex:none;margin:0;padding:0;background:none;border:0;box-shadow:none;border-radius:0}
/* Pronoun quick picks. */
.pronoun-picks{display:flex;flex-wrap:wrap;gap:8px;margin:-6px 0 14px}
.pronoun-picks [aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.pronoun-picks [aria-pressed="true"]::before{content:"✓ "}
.proto-chip>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;min-height:44px;padding:2px 10px;border-radius:999px;background:var(--gold-soft);color:var(--warn);font-size:.75rem;font-weight:700;white-space:nowrap}
.proto-chip>summary::-webkit-details-marker{display:none}
.proto-chip>p{position:absolute;z-index:30;top:calc(100% + 6px);left:0;width:min(260px,70vw);margin:0;padding:10px 12px;border-radius:12px;background:var(--surface);color:var(--ink);font-size:.86rem;box-shadow:0 10px 26px rgba(0,0,0,.18);border:1px solid var(--line)}
/* Readability: 17px body text, and taller lines for Thai so stacked marks never touch. */
body{font-size:17px}
html[lang="th"] body{line-height:1.7}

/* Tighter spacing (owner: "too much space"): Discover cards sit 12px apart, and the
   event page's cover band is shorter on phones so the title shows sooner. */
.discover-list{gap:12px}
.discover-list .ev-card,.discover-list>.ev-item{margin-block:0}
@media (max-width:679.98px){.ev-scene{height:140px}}
/* "+3" on avatar stacks: readable size. */
.av.more{font-size:.75rem}

/* Profile edit: sticky section shortcuts under the header; sections land below them. */
.pf-jump{position:sticky;top:calc(56px + env(safe-area-inset-top,0px));z-index:4;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 calc(-1 * var(--gx,20px)) 8px;padding:8px var(--gx,20px);background:var(--bg);border-bottom:1px solid var(--line)}
.pf-jump::-webkit-scrollbar{display:none}
.pf-jump a{flex:none;display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink);font-weight:600;font-size:.9rem;text-decoration:none;white-space:nowrap}
.pf-section{scroll-margin-top:130px}
@media (min-width:1024px){.pf-jump{top:72px}}

/* Person cards: Report, then a "⋯ More" menu holding Remove and Block. */
.safety-row{justify-content:space-between;align-items:center}
main details.more-menu{position:relative;margin:0;padding:0;border:0;background:none;box-shadow:none;border-radius:0}
.more-menu>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);font-weight:600;color:var(--ink-2)}
.more-menu>summary::-webkit-details-marker{display:none}
.more-menu>div{position:absolute;right:0;bottom:calc(100% + 6px);z-index:6;display:grid;gap:8px;min-width:220px;padding:10px;border-radius:16px;background:var(--surface);border:1px solid var(--line);box-shadow:0 12px 30px rgba(0,0,0,.16)}
.more-menu>div form{margin:0}
.more-menu>div .btn{width:100%}

/* Notifications page: the inbox list, unread rows tinted, with room between rows. */
.notif-page{gap:8px;margin-top:8px}
.notif-page a,.notif-page div{background:var(--surface);border:1px solid var(--line);padding:12px 14px}
.notif-page .notif-new{color:var(--brand);font-weight:700}
/* "Clear answer" on profile prompts: a full-size tap target (2.5.8). */
.pf-clear{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}
.pf-clear input{width:22px;height:22px;margin:0}
/* Me: the stat tiles line up (the playful offset read as broken). */
.me-stat:nth-child(2){transform:none}
/* Four tiles (events, people, tables, coming up): 2 by 2 on phones, one row on wider screens. */
main nav.me-stats{grid-template-columns:repeat(2,1fr)}
@media (min-width:680px){main nav.me-stats{grid-template-columns:repeat(4,1fr)}}
/* Public profile on laptops: three wider fact columns instead of five narrow ones. */
@media (min-width:900px){.pc-facts{grid-template-columns:repeat(3,minmax(0,1fr))}}

/* Tap targets: 44px on member pages (house rule, beyond WCAG 2.2's 24px floor). */
.topbar summary,.topbar .chip,.proto-chip>summary,.topbar .brand{min-height:44px}
.topbar summary{min-width:44px}
.topbar .chip{display:inline-flex;align-items:center}
.pf-jump a,.view-switch a,.seg a,.a11y-reset{min-height:44px}
.seg a{display:inline-flex;align-items:center;justify-content:center}
/* Titles and heading links that open something (not links inside a sentence). */
main :is(h2,h3)>a,.me-h a,.me-todo a,.me-type>a,main h2.spread>a{display:inline-flex;align-items:center;min-height:44px}
.thanks-starters button,.chat-starters button{min-height:44px}
main details>summary{min-height:44px;display:flex;align-items:center}
.me-peek,.me-lang a{display:inline-flex;align-items:center;min-height:44px}
.passport-card>a,details.how li>a,.safety-row>a{display:inline-flex;align-items:center;min-height:44px}

/* My people: a friendship milestone with one next step. */
div.grad{display:grid;gap:8px;justify-items:start;margin:10px 0;padding:12px 14px;border-radius:16px;background:color-mix(in srgb,var(--lime) 22%,var(--surface))}
div.grad p{margin:0;font-weight:700}

/* Me: a one-time question under the numbers. */
.me-ask p{display:grid;gap:4px;margin:0 0 10px}
.me-ask .row{gap:8px;flex-wrap:wrap}

/* Quiz result: on the dark sunset card, "Close to" takes the card's light text colour (it was dark ink). */
.tile2 .type-range{color:inherit!important}
.tile2 .type-range a{color:inherit;text-decoration:underline;text-underline-offset:3px}

/* ---- Phase 1 (three-way review, owner-approved 2026-10-16) ---- */
/* One bottom layer per screen. The Map / Cards switch sits in the page on phones too,
   never floating over Filters or a focused control (WCAG 2.4.11). */
body:not(.fullmap-body) .view-switch{position:static;transform:none;display:inline-flex;margin:0 0 12px;box-shadow:none}
body:has(.view-switch) .discover-list{padding-bottom:0}
/* A page with its own sticky action bar (quiz result, card flows, edit profile) hides the tab
   bar on phones and tablets, so the two never stack; the bar sits at the bottom edge. */
@media (max-width:1023.98px){
  body:has(main .flow-bar) .tabbar,body:has(main .pf-save) .tabbar{display:none}
  body:has(main .flow-bar),body:has(main .pf-save){padding-bottom:0}
  body:has(main .flow-bar) main .flow-bar,body:has(main .pf-save) main .pf-save{bottom:0;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}
  body:has(main .flow-bar) main .flow-bar::after,body:has(main .pf-save) main .pf-save::after{content:none}
}
/* Contrast (1.4.3): the brand tile is a solid deep green, so white text passes everywhere on it;
   small white text on the type card's art gets a scrim. */
.tile2.t-brand{background:linear-gradient(160deg,#0b5a30,#137f45)}
.type-hero2 .tile2-art::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(8,20,14,.78) 0%,rgba(8,20,14,.5) 55%,rgba(8,20,14,.25) 100%)}
.type-hero2 .tile2-body,.type-hero2 small{text-shadow:0 1px 2px rgba(0,0,0,.45)}
/* Dark mode stays on the palette: a true red for 💘 (never coral) and a mango centre tab. */
@media (prefers-color-scheme:dark){
  :root{--love:#f0505c;--love-ink:#ff9aa3}
  .tabbar a.center,.tabbar a.center.on{background:linear-gradient(160deg,#ffc766,#ffa53a);color:#3b2400}
}
/* Chats: rows never run past the screen (the grid item could not shrink), titles take one or two
   lines, and unread is bold plus a "New" label, not colour alone (1.4.1). */
.chat-list>li{min-width:0}
.chat-list a{min-width:0}
.chat-list a strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.chat-list a.unread strong{color:var(--ink);font-weight:800}
.chat-list a.unread small{color:var(--ink-2);font-weight:600}
.chat-new{flex:none;padding:2px 10px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-size:.78rem;font-weight:700}

/* Birthday: day, month and year side by side; the welcome screen's "next" line. */
.birth-fields{border:0;padding:0;margin:18px 0}
.birth-fields legend{font-weight:600;font-size:.94rem;margin-bottom:6px}
.birth-row{display:grid;grid-template-columns:1fr 2fr 1.4fr;gap:8px}
.birth-row label{display:grid;gap:4px;font-size:.84rem;color:var(--ink-2)}
.birth-row select{min-height:48px}
.welcome-next{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:var(--surface);border:1px solid var(--line);font-size:.94rem}

/* Photo picker: a page-language button over the visually hidden file input; focus shows on the button. */
.file-btn{align-self:flex-start;cursor:pointer}
.field:has(#f-photo:focus-visible) .file-btn{outline:3px solid var(--brand);outline-offset:2px}
.file-name{display:block;font-size:.86rem;margin-top:4px}

/* 💘 switch: tapping it when off opens a short consent sheet (Phase 2). */
main details.qs-sheet{margin:0;padding:0;border:0;background:none;box-shadow:none}
.qs-sheet>summary{list-style:none;cursor:pointer;width:100%}
.qs-sheet>summary::-webkit-details-marker{display:none}
.qs-consent{display:grid;gap:10px;margin:8px 0 4px;padding:14px;border-radius:16px;background:var(--love-soft);border:1px solid color-mix(in srgb,var(--love) 30%,var(--line))}
.qs-consent p{margin:0;font-size:.92rem}

/* Me: the next table first, then one sentence of numbers (links inside the sentence). */
.me-next{display:grid;gap:2px;margin:12px 0 8px;padding:14px 16px;text-decoration:none;color:var(--ink);border-left:0}
.me-next small{color:var(--ink-2);font-weight:600}
.me-next b{font-size:1.06rem}
.me-next span{color:var(--ink-2);font-size:.9rem}

/* Event scene colours stay in the palette (Phase 3): "play" was violet, "art" coral. */
.scene-play{--scene:linear-gradient(180deg,#dff5c8 0 55%,#4f9d2f 55% 100%)}
.scene-art{--scene:linear-gradient(180deg,#ffe7b8 0 55%,#d18a1c 55% 100%)}
@media (prefers-color-scheme:dark){
  .scene-play{--scene:linear-gradient(180deg,#24401d 0 55%,#2f6b1f 55% 100%)}
  .scene-art{--scene:linear-gradient(180deg,#4a3a17 0 55%,#7a5512 55% 100%)}
}

/* Notifications: day headings, a count for repeats, a chevron on rows that open something. */
.notif-day h2{margin:18px 0 6px}
.notif-page a{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
.notif-page a>.notif-title,.notif-page a>small{flex:none}
.notif-page a{display:grid;grid-template-columns:1fr auto;grid-template-areas:"t go" "s go"}
.notif-page a>.notif-title{grid-area:t}
.notif-page a>small{grid-area:s}
.notif-go{grid-area:go;font-size:1.4rem;color:var(--ink-3)}
.notif-count{color:var(--brand)}
.notif-page li.unread .notif-title{font-weight:700}

/* Person cards: Chat is the one primary action; thank-you and share contact become quiet rows (Phase 3). */
main .card:has(.safety-row) details.how{margin:2px 0;padding:0;border:0;background:none;box-shadow:none;border-radius:0}
main .card:has(.safety-row) details.how>summary{min-height:44px;padding:0;font-weight:600;color:var(--brand);background:none;border:0}
main .card:has(.safety-row) details.how[open]>summary{color:var(--ink)}
main .card:has(.safety-row) details.how>form{padding:4px 0 8px}

/* Host list: the title is the link; status badges don't wrap. */
.host-ev-title{font-weight:700;color:var(--ink);text-decoration:none}
.spread>.tag,.spread>.badge{white-space:nowrap;flex:none}

/* Neutral elevation, no coloured glows (craft, Phase 3). */
:root{--lift:0 1px 2px rgba(20,30,24,.08),0 6px 16px rgba(20,30,24,.08)}
/* !important: the warm layer nests these under a theme selector that outranks plain classes. */
.card.link:hover,a.card:hover{box-shadow:var(--lift)!important}
.tabbar a.center{box-shadow:0 0 0 5px var(--bg),var(--lift)!important}
.tabbar a.center.on{box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--brand),var(--lift)!important}

/* Wide staff tables on phones: a shadow at the edge shows there is more to scroll sideways (1.4.10 cue). */
@media (max-width:600px){
  .table-wrap{background:linear-gradient(to right,var(--surface) 30%,transparent),linear-gradient(to left,var(--surface) 30%,transparent) 100% 0,radial-gradient(farthest-side at 0 50%,rgba(0,0,0,.18),transparent),radial-gradient(farthest-side at 100% 50%,rgba(0,0,0,.18),transparent) 100% 0;background-repeat:no-repeat;background-size:40px 100%,40px 100%,14px 100%,14px 100%;background-attachment:local,local,scroll,scroll}
}

.fact-ico{vertical-align:-2px;color:var(--brand);flex:none}

/* Headings break evenly (no lone last word). */
h1,h2,h3,.flow-title{text-wrap:balance}
/* Staff chip in the header: on narrow phones it drops to the Me menu's job, so the header never overflows. */
@media (max-width:420px){.topbar .top-actions a.chip[href="/admin"]{display:none}}

/* Merged onboarding screens (D42): sub-headings and labels for groups inside one step. */
.flow-body .field-label{font-family:var(--sub);font-weight:600;font-size:.94rem;margin:18px 0 6px}
.flow-body .field-label+.muted{margin-top:-2px}
.flow-sub{font-size:1.02rem;margin:22px 0 2px}
.flow-bar a.skip{display:flex;align-items:center;justify-content:center;text-decoration:underline}
/* The table intro card on the RSVP confirmation and the pass (D42). */
.table-intro{margin:16px 0;border:1.5px solid color-mix(in srgb,var(--brand) 35%,var(--line))}
.table-intro .btn{margin-top:4px}

/* Laptops: the Map / Cards switch sits in the page, not over the cards. */
@media (min-width:900px){body:not(.fullmap-body) .view-switch{position:static;transform:none;display:inline-flex;margin:0 0 12px;box-shadow:none}body:has(.view-switch) .discover-list{padding-bottom:0}}

/* Event page: the RSVP bar sits above the tab bar until the form is on screen. */
.sticky-cta{position:fixed;z-index:8;left:12px;right:12px;bottom:calc(106px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:616px;margin:0 auto;padding:10px 10px 10px 16px;border-radius:20px;background:color-mix(in srgb,var(--surface) 92%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--line);box-shadow:0 12px 30px rgba(0,0,0,.16);transition:transform .25s ease,opacity .25s ease}
.sticky-cta.is-off{transform:translateY(16px);opacity:0;pointer-events:none;visibility:hidden}
.sticky-cta-note{font-weight:700;color:var(--ink-2)}
.sticky-cta .btn{flex:none}
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
/* Server-paged tables: "Showing 51 to 100 of 142" and Previous / Next. */
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
  .proto-chip>summary{padding:2px 8px}
}
/* Under 360px, room for the Prototype chip: the logo alone stands for the name. */
@media (max-width:359.98px){.topbar .brand{font-size:0;gap:0}}
.pf-photo{grid-template-columns:minmax(0,1fr)}
.pf-photo>*{min-width:0;max-width:100%}
.me-hero{overflow-x:clip}

/* Missing page and error page. */
.err-page{text-align:center;padding:8vh 0 4vh}
.err-page .row{justify-content:center}
.err-mark{font-size:3rem;margin:0}
.intro-slide h2{font-size:1.9rem;font-weight:800;margin:10px 0 4px;line-height:1.15}
/* A status tag beside a title stays on one line; the title wraps instead (My events "Not checked in"). */
.spread>.tag{flex:none;white-space:nowrap}
.spread>h3,.spread>h2{min-width:0}
/* My people, owner card D: shortcuts as one row of chips, then the member's own people. */
.circle-chips{display:flex;gap:8px;overflow-x:auto;margin:4px calc(-1 * var(--gx,20px)) 8px;padding:4px var(--gx,20px);scrollbar-width:none}
.circle-chips a{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink);font-weight:600;text-decoration:none;white-space:nowrap}
.circle-chips a.circle-buddy{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.circle-none{display:grid;gap:8px}
.circle-none p{margin:0}
.circle-none a{display:inline-flex;align-items:center;min-height:44px;font-weight:700}
/* My events with nothing booked, owner card F: the next events as tickets. */
.next-up{margin:8px 0 4px}
/* Notifications on this phone: a card at the top of the Notifications page; a switch that can't work reads as off, not broken. */
.push-card{margin:4px 0 16px}
.push-card .qs{border:1px solid var(--line)}
.qs:disabled{cursor:default}
.qs:disabled b{color:var(--ink-2)}
/* Discover, owner card A: one sticky bar (time, filters, map/cards) so events start on the first screen. */
.plan-line{display:flex;align-items:center;gap:6px;min-height:44px;margin:-4px 0 4px;font-weight:700;color:var(--brand);text-decoration:none}
.disc-bar{position:sticky;top:var(--disc-top,60px);z-index:4;display:grid;gap:6px;margin:0 calc(-1 * var(--gx,20px)) 12px;padding:6px var(--gx,20px);background:var(--bg);border-bottom:1px solid var(--line)}
.disc-bar:has(details[open]){position:static}
.disc-bar .seg{margin:0}
.disc-tools{display:flex;align-items:flex-start;gap:8px}
.disc-tools .filters{flex:1;min-width:0;margin:0;padding:0 14px;border:1px solid var(--line);border-radius:14px}
.disc-tools .filters>summary{font-weight:700}
.disc-tools .filters .filters{margin:0;padding:0 0 12px;border:0;background:none;box-shadow:none}
h1:has(+.plan-line){text-wrap:balance}
.disc-tools .filters .count{display:inline-grid;place-items:center;min-width:22px;height:22px;margin-inline-start:6px;margin-inline-end:auto;padding:0 6px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-size:.8rem}
.disc-bar .view-switch{position:static;transform:none;flex:none;margin:0;box-shadow:none}
body:has(.disc) .discover-list{padding-bottom:0}
.disc-tools .filters>summary{white-space:nowrap}
.disc-tools .fi{display:none;width:20px;height:20px;flex:none}
/* Owner card: once scrolled past, the bar shrinks to one row (time chips, a filter icon with its count, the other view). */
.disc-bar.is-stuck{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding-block:4px}
.disc-bar.is-stuck .seg{overflow-x:auto;scrollbar-width:none;background:none;padding:0;gap:4px}
.disc-bar.is-stuck .seg a{flex:none;font-size:.82rem;padding:4px 10px}
.disc-bar.is-stuck .disc-tools{align-items:center;gap:4px}
.disc-bar.is-stuck .disc-tools .filters{border:0;padding:0;background:none}
.disc-bar.is-stuck .disc-tools .filters>summary{justify-content:center;min-width:44px;gap:2px}
.disc-bar.is-stuck .disc-tools .filters>summary::after{display:none}
.disc-bar.is-stuck .fi{display:block}
.disc-bar.is-stuck .fl,.disc-bar.is-stuck .vs-l{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.disc-bar.is-stuck .disc-tools .filters .count{margin-inline:0}
.disc-bar.is-stuck .view-switch{padding:0;background:none;border:0}
.disc-bar.is-stuck .view-switch a.on{display:none}
.disc-bar.is-stuck .view-switch a{min-width:44px;justify-content:center;padding:0 8px;background:var(--surface);border:1px solid var(--line);color:var(--ink)}
@media (max-width:359.98px){.disc-tools .filters{padding:0 10px}.disc-bar .view-switch a{padding:6px 10px}.card.ev-card,.card.ev-card.feat{--stub:64px}}
/* Event cards, owner card B: a side-on ticket. Category colour and the date live in the stub; the perforation runs down between stub and body. */
.card.ev-card,.card.ev-card.feat{--stub:76px;display:grid;grid-template-columns:var(--stub) minmax(0,1fr);-webkit-mask:radial-gradient(circle 9px at var(--stub) 0,#0000 97%,#000) top/100% 51% no-repeat,radial-gradient(circle 9px at var(--stub) 100%,#0000 97%,#000) bottom/100% 51% no-repeat;mask:radial-gradient(circle 9px at var(--stub) 0,#0000 97%,#000) top/100% 51% no-repeat,radial-gradient(circle 9px at var(--stub) 100%,#0000 97%,#000) bottom/100% 51% no-repeat}
.ev-card .event-cover,.ev-card.feat .event-cover{height:auto;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px 6px}
.ev-card .event-cover img{position:absolute;inset:0;width:100%;height:100%}
.ev-card .event-cover .scene-badge{width:40px;height:40px;border-radius:13px;font-size:1.35rem}
.ev-card .ev-date{position:relative;left:auto;bottom:auto;min-width:50px;transform:none}
.ev-card .ev-body,.ev-card.feat .ev-body{padding:12px 14px 12px 16px}
.ev-card .ev-body::before{left:0;right:auto;top:14px;bottom:14px;border-top:0;border-left:2px dashed color-mix(in srgb,var(--ink-3) 35%,transparent)}
.ev-card.feat h3{font-size:1.08rem}
/* Owner card: time, area and language on one plain line, so a ticket is about 170px. */
.ev-card .chips2{display:flex;flex-wrap:wrap;align-items:baseline;gap:0;white-space:normal;overflow:visible;margin:4px 0 6px;color:var(--ink-2);font-size:.92rem;line-height:1.5}
.ev-card .chips2 span{display:inline;padding:0;background:none;border:0;border-radius:0;font-weight:600;white-space:nowrap}
.ev-card .chips2 span:not(:last-child)::after{content:"·";margin:0 6px;color:var(--ink-3);font-weight:400}
/* Discover on laptops, owner card C: a sticky filter rail beside an even grid of tickets. */
@media (min-width:1024px){
  main.wrap:has(.disc){max-width:1180px}
  .disc{display:grid;grid-template-columns:248px minmax(0,1fr);gap:24px;align-items:start}
  .disc-bar,.disc-bar:has(details[open]){position:sticky;top:84px;margin:0;padding:0 4px 0 0;border:0;background:none;max-height:calc(100vh - 100px);overflow:auto;gap:12px}
  .disc-bar .seg{flex-direction:column;align-items:stretch;border-radius:18px}
  .disc-bar .seg a{justify-content:flex-start;text-align:start;padding-inline:14px}
  .disc-tools{flex-direction:column-reverse;align-items:stretch}
  .disc-tools .filters{flex:none}
  .disc .discover-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  .disc .discover-list>.ev-item:has(.feat){grid-column:auto}
  /* Place the rail and the tickets by name: the zero-height sticky marker came first and pushed the
     tickets into the 248px rail column. */
  .disc>.disc-mark{grid-column:1/-1;grid-row:1}
  .disc>.disc-bar{grid-column:1;grid-row:2}
  .disc>.discover-list{grid-column:2;grid-row:2}
}
@media (min-width:1220px){.disc .discover-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
/* Owner card G: tickets arrive quickly, 8px and 40ms apart, and are never hidden. */
@media (prefers-reduced-motion:no-preference){
  html:not(.a11y-motion) .disc .discover-list>*{animation:rise-sm .3s cubic-bezier(.2,.8,.2,1) backwards}
  html:not(.a11y-motion) .disc .discover-list>:nth-child(2){animation-delay:.04s}
  html:not(.a11y-motion) .disc .discover-list>:nth-child(3){animation-delay:.08s}
  html:not(.a11y-motion) .disc .discover-list>:nth-child(4){animation-delay:.12s}
  html:not(.a11y-motion) .disc .discover-list>:nth-child(5){animation-delay:.16s}
  html:not(.a11y-motion) .disc .discover-list>:nth-child(n+6){animation-delay:.2s}
}
@keyframes rise-sm{from{transform:translateY(8px)}}
/* Ticket cards read as one piece (owner: "card view is a bit disjoined"): one calm tint per category
   on the stub instead of two colour blocks, the date and the emoji as one block inside it, and facts
   that wrap without a dangling dot. */
.ev-card .event-cover{background:var(--stub-bg,#eef4ef)}
.ev-card .event-cover.scene-food{--stub-bg:#fff0d4}
.ev-card .event-cover.scene-park{--stub-bg:#e2f3e7}
.ev-card .event-cover.scene-river{--stub-bg:#def0f4}
.ev-card .event-cover.scene-art{--stub-bg:#fbeacb}
.ev-card .event-cover.scene-play{--stub-bg:#e8f5dc}
.ev-card .event-cover.scene-city{--stub-bg:#e6efe9}
@media (prefers-color-scheme:dark){
  .ev-card .event-cover{--stub-bg:#1d2a22}
  .ev-card .event-cover.scene-food,.ev-card .event-cover.scene-art{--stub-bg:#33291a}
  .ev-card .event-cover.scene-park,.ev-card .event-cover.scene-play{--stub-bg:#1c3324}
  .ev-card .event-cover.scene-river{--stub-bg:#17303a}
}
.ev-card .event-cover{flex-direction:column-reverse;justify-content:flex-start;gap:6px;padding:14px 6px}
.ev-card .ev-date{background:none;border:0;box-shadow:none;padding:0;min-width:0;color:var(--ink);display:grid;justify-items:center;line-height:1.05}
.ev-card .ev-date b{font-size:1.5rem}
.ev-card .ev-date small{font-size:.75rem;font-weight:700;letter-spacing:.06em;color:var(--ink-2)}
.ev-card .event-cover .scene-badge{width:34px;height:34px;border-radius:11px;font-size:1.1rem;box-shadow:none;background:color-mix(in srgb,var(--surface) 80%,transparent)}
.ev-card .chips2{gap:2px 12px}
.ev-card .chips2 span:not(:last-child)::after{content:none}
/* Calmer motion (Phase 3): with reduced motion on (system setting or the app's own switch), nothing
   moves or scales, but colour and opacity changes still show, so state changes stay visible. */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition-property:color,background-color,border-color,opacity,box-shadow!important}
  .type-emoji,.btn-ticket.is-busy::before{animation:none!important}
}
html.a11y-motion *,html.a11y-motion *::before,html.a11y-motion *::after{transition-property:color,background-color,border-color,opacity,box-shadow!important}
html.a11y-motion .type-emoji,html.a11y-motion .btn-ticket.is-busy::before{animation:none!important}
/* See them again: one calm card with one next step, styled like the table-intro card. */
.see-again{margin:16px 0;border:1.5px solid color-mix(in srgb,var(--brand) 35%,var(--line))}
.see-again .see-again-names{font-weight:600;margin:4px 0 4px;overflow-wrap:anywhere}
.see-again .muted{margin:0 0 12px}
/* Offline next table: the pass's essentials card, the "saved for offline" note (words, not just an icon),
   and the saved tables on the offline page as full-width rows with 44px+ targets. */
.essentials{margin:16px 0}
.essentials dl.facts{margin:8px 0 0}
.essentials dd{margin:0;min-width:0;overflow-wrap:anywhere}
.essentials .ess-addr{display:block;color:var(--ink-2)}
.essentials .ess-map{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
.essentials .ess-bring{margin:0;padding-left:18px}
.essentials .ess-bring li{margin:0 0 4px}
.essentials details.how summary{min-height:44px;display:flex;align-items:center}
.offline-saved{display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;padding:12px 14px;border-radius:14px;background:var(--surface);border:1.5px solid var(--brand);color:var(--ink)}
.offline-saved small{display:block;color:var(--ink-2)}
.offline-saved[hidden]{display:none}
.offline-next-list ul{list-style:none;margin:12px 0 16px;padding:0;display:grid;gap:12px}
.offline-next-list a.card{display:grid;gap:4px;min-height:44px;padding:12px 16px;text-decoration:none;color:var(--ink)}
.offline-next-list a.card small{color:var(--ink-2)}
/* Clearer unread: one style everywhere (bell, My people tab, Chats chip, chat rows, notification rows).
   A brand-green pill with a number or "New" in it (white on green 5.9:1, dark on bright green in dark
   mode), so it reads on the light glass bars and the dark ones alike; unread rows also get a tint and
   a bold title, never colour alone (1.4.1). */
.unread-badge,.notif-dot,.chat-list a>b.unread-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;width:auto;height:20px;padding:0 6px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-family:var(--sub);font-size:.75rem;font-weight:800;line-height:1;vertical-align:middle;flex:none;white-space:nowrap}
.unread-badge.unread-new,.chat-list a>b.unread-badge.unread-new{padding:0 8px}
.notif-dot{position:absolute;top:2px;right:0;box-shadow:0 0 0 2px var(--surface)}
.tabbar a{position:relative}
.tabbar .tab-badge{position:absolute;top:2px;left:calc(50% + 4px);box-shadow:0 0 0 2px var(--surface)}
.top-nav .tab-badge{box-shadow:0 0 0 2px var(--surface)}
.circle-chips a .unread-badge,.spread a .unread-badge{margin-left:2px}
.chat-list a.unread,.notif-list li.unread a,.notif-list li.unread div{background:color-mix(in srgb,var(--brand) 9%,var(--surface));border-color:color-mix(in srgb,var(--brand) 45%,var(--line))}
.chat-list a.unread strong,.notif-list li.unread .notif-title{color:var(--ink);font-weight:800}
.notif-list small .unread-badge{margin-right:4px}
.unread-sum{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:700;color:var(--ink)}
/* Curated icebreakers: three questions on the event page, and in a hangout's group chat as full-width
   tap-to-send rows (44px+ each, text wraps instead of running off a 320px screen). */
.icebreakers{margin:16px 0}
.ice-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}
.ice-list li{display:flex;gap:8px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:var(--surface-2);color:var(--ink);line-height:1.5}
.ice-chat{margin:12px 0 0}
.ice-chat a{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
.chat-ice{margin:12px 0;padding:4px 14px;border-radius:16px;background:var(--surface);border:1px solid var(--line)}
.chat-ice summary{min-height:44px;display:flex;align-items:center;gap:8px;font-weight:700;color:var(--ink);cursor:pointer;list-style:none}
.chat-ice summary::-webkit-details-marker{display:none}
.chat-ice summary::after{content:"";flex:none;margin:0 4px 4px auto;width:8px;height:8px;border-right:2px solid var(--ink-3);border-bottom:2px solid var(--ink-3);transform:rotate(45deg)}
.chat-ice[open] summary::after{transform:rotate(-135deg);margin:4px 4px 0 auto}
.chat-ice ul{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}
.chat-ice form{margin:0}
.chat-ice button{display:flex;gap:8px;align-items:flex-start;width:100%;min-height:44px;padding:10px 14px;border-radius:14px;border:1.5px solid var(--brand);background:var(--surface);color:var(--ink);font:inherit;text-align:left;line-height:1.45;white-space:normal;cursor:pointer}
.chat-ice button:hover{background:var(--brand-soft)}
.chat-ice button:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
/* Events review (jurrgun-ui, 2026-10-16). Plain fixes: the pass's day card stacks each label over its value on
   phones (values were squeezed into a narrow column), and the +1 invite gets room and a rule after Cancel. */
@media (max-width:519.98px){
  .essentials dl.facts{grid-template-columns:1fr;gap:2px}
  .essentials dl.facts dt{margin-top:10px}
  .essentials dl.facts dd{margin:0}
}
#invite{margin-top:24px;padding-top:16px;border-top:1px solid var(--line)}
/* Owner cards, recommended options (owner away, approved in advance):
   E1 tickets drop the seat-dot row; the "N spots left" tag already says it. */
.ev-card .seats{display:none}
/* E2 the event page hero is one calm tint per category, like the ticket stubs, and shorter. */
.event-cover.ev-scene{background:var(--stub-bg,#eef4ef);height:120px}
.event-cover.ev-scene.scene-food{--stub-bg:#fff0d4}
.event-cover.ev-scene.scene-park{--stub-bg:#e2f3e7}
.event-cover.ev-scene.scene-river{--stub-bg:#def0f4}
.event-cover.ev-scene.scene-art{--stub-bg:#fbeacb}
.event-cover.ev-scene.scene-play{--stub-bg:#e8f5dc}
.event-cover.ev-scene.scene-city{--stub-bg:#e6efe9}
.event-cover.ev-scene::before,.event-cover.ev-scene::after{content:none}
@media (prefers-color-scheme:dark){
  .event-cover.ev-scene{--stub-bg:#1d2a22}
  .event-cover.ev-scene.scene-food,.event-cover.ev-scene.scene-art{--stub-bg:#33291a}
  .event-cover.ev-scene.scene-park,.event-cover.ev-scene.scene-play{--stub-bg:#1c3324}
  .event-cover.ev-scene.scene-river{--stub-bg:#17303a}
}
/* E3 fact tiles: labels and sub-lines in sentence case, not small capitals (place names were shouting). */
.fact small{text-transform:none;letter-spacing:0;font-weight:600}
/* One short helper line, the rest behind a small info button (owner, 2026-10-16) */
.with-info{margin:4px 0 8px}
main details.more-info{display:inline;margin:0;padding:0;border:0;background:none;box-shadow:none;border-radius:0}
main details.more-info>summary{list-style:none;cursor:pointer;display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-10px 0;padding:0;border-radius:999px;color:var(--brand);font-size:1.1rem;font-weight:700;background:none;border:0}
details.more-info>summary::-webkit-details-marker{display:none}
details.more-info>summary:focus-visible{outline:3px solid var(--ink);outline-offset:-4px}
details.more-info[open]>summary{color:var(--ink)}
.more-info-body{display:block;margin:6px 0 4px;padding:10px 12px;border-radius:12px;background:var(--surface-2);color:var(--ink);font-size:.9rem;line-height:1.5}
/* Long host text: about 4 lines, then Read more */
.host-text{margin:8px 0 0}
.host-text p{white-space:pre-line;margin:0}
main details.host-text-more{margin:0;padding:0;border:0;background:none;box-shadow:none;border-radius:0}
.host-text-more>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;min-height:44px;font-weight:600;color:var(--brand);text-decoration:underline;text-underline-offset:3px}
.host-text-more>summary::-webkit-details-marker{display:none}
.host-text-more[open]>summary,.host-text:has(.host-text-more[open]) .host-text-dots{display:none}
.host-text-more[open]>p{margin-top:0}
/* Finalize review plain fixes: the chat host badge is 12px and readable in dark mode (was about 1.8:1). */
.host-badge{font-size:.75rem}
@media (prefers-color-scheme:dark){.host-badge{background:#3a2f12;color:#ffd27a}}
/* Two heading levels (finalize A4): one section title with an optional link, one small label for groups inside it. */
.sec-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:32px 0 8px}
.sec-head h2{font-family:var(--display);font-size:1.25rem;line-height:1.3;margin:0;min-width:0}
.sec-head>a{display:inline-flex;align-items:center;min-height:44px;flex:none;font-weight:600;font-size:.94rem;text-decoration:none}
.sub-label{font-family:var(--font);font-size:.8125rem;font-weight:700;line-height:1.4;color:var(--ink-2);letter-spacing:.01em;margin:16px 4px 8px}
.sub-label+.me-menu{margin-top:0}
.quick>.sub-label{margin-top:0}
/* Me (finalize A1, C1): one plain card surface, the colour only in the icon bubbles; the type card is full width and straight. */
main .me-type{margin:0}
main .me-type>a.teaser{display:flex;width:100%;transform:none}
.me-grow{margin:12px 0 0}
/* My events (finalize C3): past events as compact rows under month labels; buttons only while the 72-hour window is open. */
.past-month .sub-label{margin-top:16px}
.past-rows{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.past-row+.past-row{border-top:1px solid var(--line)}
.past-main{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;text-decoration:none;color:var(--ink)}
.past-day{display:flex;flex-direction:column;align-items:center;flex:none;min-width:40px;line-height:1.15;font-family:var(--display)}
.past-day b{font-size:1.1rem}
.past-day small{font-size:.75rem;color:var(--ink-2)}
.past-text{flex:1;min-width:0;display:grid;gap:2px}
.past-text b{font-weight:600;line-height:1.35}
.past-state{font-size:.8125rem;color:var(--ink-2)}
.past-state.is-ok{color:var(--ok)}
.past-chev{flex:none;font-size:1.4rem;line-height:1;color:var(--ink-3)}
.past-acts{display:flex;flex-wrap:wrap;gap:8px;padding:0 14px 12px 66px}
.past-acts .btn{margin:0}
@media (max-width:480px){.past-acts{padding-left:14px}.past-acts .btn{flex:1 1 auto}}
/* Pass (finalize C4): what happens next as a three-step progress strip, not radio-like circles. */
.pass-steps{list-style:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 16px;padding:0}
.pass-steps li{display:grid;align-content:start;gap:2px;min-width:0}
.pass-steps .ps-bar{display:block;height:6px;border-radius:3px;background:var(--line);margin-bottom:6px}
.pass-steps li.is-done .ps-bar{background:var(--brand)}
.pass-steps li.is-now .ps-bar{background:linear-gradient(90deg,var(--brand) 50%,var(--line) 50%)}
.pass-steps b{font-size:.875rem;font-weight:700;line-height:1.3;color:var(--ink)}
.pass-steps li:not(.is-done):not(.is-now) b{color:var(--ink-2)}
.pass-steps .ps-mark{font-variant-numeric:tabular-nums}
.pass-steps li.is-done .ps-mark{color:var(--ok)}
.pass-steps small{font-size:.8125rem;line-height:1.35;color:var(--ink-2)}
.pass-steps .ps-now{justify-self:start;padding:0 8px;border-radius:999px;background:var(--brand-soft);color:var(--brand);font-weight:700;font-size:.75rem}
.countdown{white-space:nowrap}
/* A2 One button family (finalize review): the only .btn definition. Three kinds share one radius and
   48px: solid primary, tonal (class ghost or tonal, soft green fill) and quiet text. Danger and the
   💘 love red are variants. Contrast: primary 5.7:1 light, 9.6:1 dark; tonal 5.0:1 light, 7.1:1 dark. */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:10px 20px;border-radius:16px;border:1.5px solid transparent;font:inherit;font-size:1rem;font-family:var(--sub);font-weight:700;letter-spacing:-.005em;line-height:1.3;text-align:center;text-decoration:none;cursor:pointer;transition:transform .12s ease,background-color .2s ease,border-color .2s ease,box-shadow .2s ease}
.btn:active{transform:scale(.97)}
.btn.block{width:100%}
.btn.primary{background:var(--brand);color:var(--brand-ink);box-shadow:var(--lift)}
.btn.primary:hover{background:color-mix(in srgb,var(--brand) 88%,#000)}
.btn:is(.ghost,.tonal),.chip-btn{background:var(--brand-soft);color:var(--brand);border-color:color-mix(in srgb,var(--brand) 22%,transparent)}
.btn:is(.ghost,.tonal):hover,.chip-btn:hover{border-color:var(--brand)}
.btn.quiet{background:transparent;color:var(--brand);padding-inline:12px;text-decoration:underline;text-underline-offset:3px}
.btn.quiet:hover{background:var(--brand-soft)}
.btn.danger{background:var(--err-soft);color:var(--err);border-color:color-mix(in srgb,var(--err) 25%,transparent)}
.btn.danger:hover{border-color:var(--err)}
.btn.love{background:#c0222f;border-color:#c0222f;color:#fff}
.btn.love:hover{background:#a51c27;border-color:#a51c27}
.btn:disabled,.btn[aria-disabled=true]{opacity:.55;cursor:not-allowed;transform:none}
.btn.is-busy{pointer-events:none;opacity:.85}
.btn.is-busy::after{content:"";display:inline-block;width:1.1em;height:.3em;margin-left:8px;vertical-align:middle;background:radial-gradient(circle,currentColor 45%,transparent 50%) 0 50%/33% 100% repeat-x;animation:busy .9s steps(3) infinite;clip-path:inset(0 100% 0 0)}
/* Pick chips and calendar or directions links take the tonal kind's look and height. */
.chip-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:10px 18px;border-radius:16px;border-width:1.5px;border-style:solid;font:inherit;font-family:var(--sub);font-weight:700;text-decoration:none;cursor:pointer}
/* On a green or photo tile: primary turns white with deep green text (7.8:1), tonal a dark glass with white text (4.7:1 or more). */
:is(.tile2.t-brand,.tile2.t-deep,.tile2:has(.tile2-art)) .btn.primary{background:#fff;color:#0e5f33;border-color:#fff;text-shadow:none;box-shadow:0 6px 18px rgba(0,0,0,.18)}
:is(.tile2.t-brand,.tile2.t-deep,.tile2:has(.tile2-art)) .btn.primary:hover{background:#f2fbf5}
:is(.tile2.t-brand,.tile2.t-deep,.tile2:has(.tile2-art)) .btn.ghost{background:rgba(0,0,0,.28);color:#fff;border-color:rgba(255,255,255,.5);text-shadow:none}
:is(.tile2.t-brand,.tile2.t-deep,.tile2:has(.tile2-art)) .btn.ghost:hover{background:rgba(0,0,0,.38)}
/* A3 One fact tile: icon and bold answer, an optional quiet line, then the small sentence-case label.
   Two columns on phones; a tile alone at the end of a row stretches across it. */
.fact-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
@media (min-width:720px){.fact-tiles[data-cols="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}.fact-tiles[data-cols="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}.fact-tiles[data-cols] .ft-lone{grid-column:auto}}
.fact-tile{display:flex;flex-direction:column;gap:2px;min-width:0;margin:0;padding:10px 12px;border-radius:14px;background:var(--surface-2)}
.fact-tile.ft-wide,.fact-tile.ft-lone{grid-column:1/-1}
.fact-tile dt{order:1;margin:0;font-size:.78rem;font-weight:600;color:var(--ink-3);text-transform:none;letter-spacing:0}
.fact-tile dd{margin:0}
.fact-tile .ft-a{order:-1;font-size:.95rem;font-weight:700;line-height:1.3;color:var(--ink);overflow-wrap:anywhere}
.fact-tile .ft-i{margin-right:2px}
.fact-tile .ft-sub{font-size:.82rem;line-height:1.35;color:var(--ink-2)}
.fact-tile .ft-sub .seats{margin:4px 0 0}
.pc-group-h+.fact-tiles{margin-top:8px}
/* Tiles straight on the page (the quiz result) get the card surface and an edge. */
.type-facts .fact-tile{background:var(--surface);border:1px solid var(--line)}
/* The type facts are sentences: one per row on phones, three across from 720px. */
@media (min-width:720px){.type-facts[data-cols] .ft-wide{grid-column:auto}}
`);
