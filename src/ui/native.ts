/**
 * The "native app" layer, loaded after the base styles and before the
 * screen-size layout. Same palette; quieter chrome. Patterns follow mobile
 * conventions (studied from 21st.dev components): sentence-case labels
 * instead of shouty eyebrows, one-line pill segmented controls, filled
 * inputs, chevron disclosure rows, a full-width blurred save bar, no web
 * footer inside the member app, and a floating Map ⇄ Cards switch.
 */
export const NATIVE_CSS = `
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
/* The fade-in must not leave a transform behind: it would trap fixed elements (the Map/Cards switch, sheets) inside main. */
main.wrap{animation-fill-mode:backwards}
.filters{background:var(--surface);border-radius:18px;padding:4px 16px;margin:12px 0}
/* labels: sentence case, calm */
.eyebrow{text-transform:none;letter-spacing:0;font-size:.82rem;font-weight:600;margin:0 0 4px;color:var(--leaf,var(--brand))}
h1{font-size:1.7rem;margin:.25rem 0 .9rem}
h2{font-size:1.18rem;letter-spacing:-.015em}
/* thinner prototype strip and app bar */
.proto-banner{font-size:.68rem;padding:2px 12px;font-weight:600}
.topbar{padding:8px 14px}
.topbar .chip{min-height:34px;padding:4px 12px;font-size:.85rem}
/* segmented controls: one line, pill thumb, scrolls sideways when tight */
.seg{border-radius:999px;padding:3px;gap:0;flex-wrap:nowrap}
.seg a{flex:1 0 auto;white-space:nowrap;border-radius:999px;min-height:36px;padding:6px 14px;font-size:.9rem;transition:background-color .2s ease,color .2s ease,box-shadow .2s ease}
.seg-row{gap:8px}
/* disclosure rows: chevron, no triangle */
details.how>summary,.filters>summary,details.card>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}
details.how>summary::-webkit-details-marker,.filters>summary::-webkit-details-marker,details.card>summary::-webkit-details-marker{display:none}
details.how>summary::after,.filters>summary::after,details.card>summary::after{content:"";flex:none;width:8px;height:8px;border-right:2px solid var(--ink-3);border-bottom:2px solid var(--ink-3);transform:rotate(45deg);margin:0 4px 4px 0;transition:transform .2s ease}
details.how[open]>summary::after,.filters[open]>summary::after,details.card[open]>summary::after{transform:rotate(-135deg);margin:4px 4px 0 0}
details.how{border-radius:18px}
/* text links inside the app read as taps, not web links */
main a:not(.btn):not(.card):not(.tile):not(.tile2):not(.place-card):not(.feature){text-decoration:none;font-weight:600}
.spread>a:first-child:not(.btn){display:inline-flex;align-items:center;min-height:40px}
/* inputs: filled, soft, 16px so iOS doesn't zoom */
input[type=text],input[type=password],input[type=date],input[type=datetime-local],input[type=number],input[type=search],input[type=url],input[type=email],select,textarea{background:var(--surface-2);border-color:transparent;font-size:16px}
input:focus,select:focus,textarea:focus{background:var(--surface);border-color:var(--brand)}
input[type=file]{font:inherit;font-size:.9rem;color:var(--ink-2)}
input[type=file]::file-selector-button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:8px 14px;margin-right:10px;background:var(--brand-soft);color:var(--brand);cursor:pointer}
/* choice pills: softer, filled when picked */
.pill span{border-color:transparent;background:var(--surface-2)}
.pill input:checked+span{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
/* the profile form saves from a full-width bar, like an app */
.pf-save{left:0;right:0;margin:28px calc(-1 * var(--gx,20px)) 0;padding:10px var(--gx,20px);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line)}
.pf-save .btn{width:100%;max-width:520px;box-shadow:none}
/* no web footer inside the member app (FAQ, privacy and terms live under Me and Learn) */
body:has(.tabbar) .foot{display:none}
/* cards: lighter edges, softer shadow */
.card{box-shadow:0 1px 2px rgba(6,40,22,.05),0 8px 24px rgba(6,40,22,.06)}
/* floating Map ⇄ Cards switch on Discover */
.view-switch{position:fixed;z-index:9;left:50%;transform:translateX(-50%);bottom:calc(118px + env(safe-area-inset-bottom));display:flex;padding:4px;border-radius:999px;background:var(--deep,#06492a);border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 26px rgba(4,40,22,.35)}
.view-switch a{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:6px 16px;border-radius:999px;color:var(--on-deep,#fff);text-decoration:none;font-weight:700;font-size:.92rem;white-space:nowrap}
.view-switch a.on{background:var(--lime);color:var(--deep,#06492a)}
.fullmap .view-switch{bottom:calc(var(--tab-h) + var(--sheet-h) + 14px)}
.fullmap .svm-key{bottom:calc(var(--tab-h) + var(--sheet-h) + 70px)}
@media (min-width:1024px){body:not(.fullmap-body) .view-switch{bottom:28px}}
@media (prefers-reduced-motion:reduce){.seg a,details.how>summary::after{transition:none}}
`;
