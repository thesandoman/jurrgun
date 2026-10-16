/**
 * The warm light look (the default). Lighter, friendlier and welcoming, chosen
 * with the ui-ux-pro-max skill (community and social palettes: warm cream
 * ground, white cards, a soft sunny accent, ink that isn't pure black) and
 * kept on brand: Jurrgun green stays for actions and links, deep enough that
 * white text on it passes WCAG AA. Mango and coral bring the warmth; the
 * header and tab bar become light frosted glass instead of solid dark green.
 *
 * Light mode only: it applies when the Appearance menu says Light (the new
 * default) or says Auto on a light device. Dark mode is untouched.
 */
const RULES = `
  --bg:#fff9f0;--surface:#ffffff;--surface-2:#fff1df;
  --ink:#1e2b22;--ink-2:#46564b;--ink-3:#5f6d63;
  --line:#f0e2cc;--brand:#11763f;--brand-ink:#ffffff;--brand-soft:#e3f5ea;--fresh:#2fb866;--lime:#c6ef6e;
  --gold:#f5a524;--gold-soft:#fff0d6;--sun:#ffb443;--sun-soft:#fff0d6;--coral:#ff7a5c;--coral-soft:#ffe8e1;--sky-soft:#e3f2fc;
  --deep:#11763f;--deep-2:#0e6b39;--on-deep:#ffffff;--on-deep-2:#e3f5ea;
  --shadow:0 1px 2px rgba(120,80,30,.06),0 10px 28px rgba(160,110,40,.10);
  --hero:linear-gradient(135deg,#2fb866 0%,#8fd96b 55%,#ffd27a 120%);

  & body{background:radial-gradient(900px 460px at 100% -80px,rgba(255,180,67,.20),transparent 70%),radial-gradient(900px 520px at 0% -100px,rgba(47,184,102,.14),transparent 70%),var(--bg);background-attachment:fixed}

  /* header: light frosted glass, dark ink */
  & .topbar{background:color-mix(in srgb,var(--bg) 82%,transparent);-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);color:var(--ink);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
  & .topbar .brand{color:var(--ink)}
  & .topbar .brand small{color:var(--brand)}
  & .topbar .brand-mark svg rect:first-child{fill:var(--brand)}
  & .topbar .chip{background:var(--surface);border-color:var(--line);color:var(--ink-2)}
  & .topbar .icon-link,& .topbar summary{color:var(--ink)}
  & .proto-banner{background:var(--sun-soft);color:#7a4a00}

  /* tab bar: floating white glass, green for where you are, mango for My events */
  & .tabbar{background:color-mix(in srgb,var(--surface) 86%,transparent);-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);border:1px solid var(--line);box-shadow:0 12px 30px rgba(160,110,40,.16)}
  & .tabbar a{color:var(--ink-3)}
  & .tabbar a.on{background:var(--brand-soft);color:var(--brand);font-weight:700}
  & .tabbar a.center,& .tabbar a.center.on{background:linear-gradient(160deg,#ffc766,#ffa53a);color:#3b2400;box-shadow:0 0 0 5px var(--bg),0 10px 22px rgba(255,150,40,.35)}
  & .tabbar a.center.on{box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--brand)}
  & .top-nav{background:var(--surface-2);border-color:var(--line)}
  & .top-nav a{color:var(--ink-2)}
  & .top-nav a:hover{background:var(--surface);color:var(--ink)}
  & .top-nav a.on{background:var(--brand);color:#fff}
  & .top-nav a.center:not(.on){color:#9a5100}

  /* hero cards and teasers: warm gradients with dark text instead of dark green blocks */
  & .card.hero,& .teaser{background:linear-gradient(135deg,#fff3dc 0%,#ffe6da 55%,#e6f6e9 100%);color:var(--ink);border:1px solid var(--line)}
  & .card.hero *,& .teaser *{color:inherit}
  & .teaser small,& .teaser .muted,& .card.hero .muted{color:var(--ink-2)}
  & .teaser::after{color:var(--brand)}
  & .ticket-top{background:linear-gradient(135deg,#2fb866,#137f45);color:#fff}

  /* tiles: brighter greens, and light small print on every dark or photo tile */
  & .tile2.t-deep{background:linear-gradient(160deg,#2fb866,#137f45 70%)}
  & .tile2.t-deep small,& .tile2.t-brand small,& .tile2:has(.tile2-art) small,& .tile2.t-deep .muted,& .tile2:has(.tile2-art) .muted{color:rgba(255,255,255,.92);opacity:1}

  /* picked pills and answers */
  & .pill input:checked+span,& .answer input:checked+span{background:var(--brand);border-color:var(--brand);color:#fff}
  & .a11y-row input:checked{background:var(--brand)}

  /* cards: white on cream, warm hairline */
  & .card{border-color:var(--line)}
  & .card.link:hover{box-shadow:0 14px 34px rgba(160,110,40,.16)}

  /* the floating Map / Cards switch */
  & .view-switch{background:color-mix(in srgb,var(--surface) 88%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-color:var(--line);box-shadow:0 10px 26px rgba(160,110,40,.22)}
  & .view-switch a{color:var(--ink-2)}
  & .view-switch a.on{background:var(--brand);color:#fff}

  /* success toast: sunny */
  & .notice.ok.toast{background:#fff;color:var(--ink);box-shadow:0 14px 34px rgba(160,110,40,.22),0 0 0 1px var(--line) inset}
  & .notice.ok.toast::before{background:var(--brand);color:#fff}

  /* checkboxes and radios in brand green, not the browser's blue */
  & input[type=checkbox],& input[type=radio],& progress{accent-color:var(--brand)}

  /* focus rings stay visible on the light ground */
  & :focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
`;

export const WARM_CSS = `
html[data-theme="light"]{${RULES}}
@media (prefers-color-scheme:light){html:not([data-theme]){${RULES}}}
`;
