/**
 * Screen-size layout, loaded last. Phones keep the floating bottom tab bar;
 * tablets get the same bar as a centred pill. Laptops and desktops (1024px+)
 * are top-down: the main menu sits in the header and the page reads in one
 * wider column below it. The full-screen map keeps its floating bar.
 */
export const LAYOUT_CSS = `
html.a11y-small{font-size:90%}
html.a11y-spacing body{line-height:1.85;letter-spacing:.01em}
html.a11y-spacing p,html.a11y-spacing li{margin-bottom:.6em}
html.a11y-touch .btn,html.a11y-touch .pill span,html.a11y-touch .chip,html.a11y-touch .seg a,html.a11y-touch .tabbar a,html.a11y-touch .top-nav a{min-height:56px;padding-top:12px;padding-bottom:12px}
html.a11y-touch input[type=checkbox],html.a11y-touch input[type=radio]{width:26px;height:26px}
@media (min-width:1024px){html.a11y-wide .wrap{max-width:1180px}html.a11y-wide .foot{max-width:1180px}}
.top-nav{display:none}
@media (min-width:700px) and (max-width:1023.98px){
  .tabbar{left:50%;right:auto;width:min(560px,calc(100% - 40px));transform:translateX(-50%)}
}
@media (min-width:1024px){
  body:not(.fullmap-body) .tabbar{display:none}
  body:not(.fullmap-body):has(.top-nav){padding-bottom:0}
  body.fullmap-body .tabbar{left:50%;right:auto;width:560px;transform:translateX(-50%)}
  .topbar{gap:16px}
  .top-nav{display:flex;align-items:center;gap:4px;margin:0 auto;padding:5px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
  .top-nav a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:6px 16px;border-radius:999px;color:color-mix(in srgb,var(--on-deep) 82%,transparent);text-decoration:none;font-weight:600;font-size:.95rem;white-space:nowrap;transition:background-color .2s ease,color .2s ease,transform .15s ease}
  .top-nav a:hover{background:rgba(255,255,255,.1);color:var(--on-deep)}
  .top-nav a span{display:inline-grid;place-items:center}
  .top-nav a span svg{width:18px;height:18px}
  .top-nav a.on{background:var(--lime);color:var(--deep)}
  .top-nav a.center:not(.on){color:var(--lime)}
  body:has(.top-nav) .flow-bar,body:has(.top-nav) .chat-send{bottom:0}
  .wrap{max-width:880px;padding:32px 40px 56px}
  .foot{max-width:880px}
}
`;
