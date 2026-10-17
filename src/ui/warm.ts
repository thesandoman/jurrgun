/**
 * The warm light look (the default): the header and tab bar are light
 * frosted glass instead of solid dark green. Colours come from ui/palette.ts.
 *
 * Light mode only: it applies when the Appearance menu says Light (the new
 * default) or says Auto on a light device. Dark mode is untouched.
 */
const RULES = `
  & body{background:radial-gradient(900px 460px at 100% -80px,color-mix(in srgb,var(--mango) 20%,transparent),transparent 70%),radial-gradient(900px 520px at 0% -100px,color-mix(in srgb,var(--fresh) 14%,transparent),transparent 70%),var(--bg);background-attachment:fixed}

  /* header: light frosted glass, dark ink */
  & .topbar{background:color-mix(in srgb,var(--bg) 82%,transparent);-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);color:var(--ink);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}
  & .topbar .brand{color:var(--ink)}
  & .topbar .brand small{color:var(--brand)}
  & .topbar .brand-mark svg>rect:first-child{fill:var(--brand)}
  & .topbar .chip{background:var(--surface);border-color:var(--line);color:var(--ink-2)}
  & .topbar .icon-link,& .topbar summary{color:var(--ink)}
  & .proto-banner{background:var(--mango-soft);color:var(--mango-ink)}

  /* tab bar: floating white glass, green for where you are, mango for My events */
  & .tabbar{background:color-mix(in srgb,var(--surface) 86%,transparent);-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);border:1px solid var(--line);box-shadow:0 12px 30px rgba(160,110,40,.16)}
  & .tabbar a{color:var(--ink-3)}
  & .tabbar a.on{background:var(--sel);color:var(--sel-ink);font-weight:700}
  & .tabbar a.center,& .tabbar a.center.on{background:linear-gradient(160deg,var(--mango-1),var(--mango-2));color:var(--on-mango);box-shadow:0 0 0 5px var(--bg),0 10px 22px rgba(255,150,40,.35)}
  & .tabbar a.center.on{box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--sel)}
  & .top-nav{background:var(--surface-2);border-color:var(--line)}
  & .top-nav a{color:var(--ink-2)}
  & .top-nav a:hover{background:var(--surface);color:var(--ink)}
  & .top-nav a.on{background:var(--sel);color:var(--sel-ink)}
  & .top-nav a.center:not(.on){color:var(--mango-ink)}

  /* hero cards and teasers: warm gradients with dark text instead of dark green blocks */
  & .card.hero,& .teaser{background:linear-gradient(135deg,var(--mango-soft) 0%,var(--info-soft) 60%,var(--brand-soft) 100%);color:var(--ink);border:1px solid var(--line)}
  & .card.hero *,& .teaser *{color:inherit}
  & .teaser small,& .teaser .muted,& .card.hero .muted{color:var(--ink-2)}
  & .teaser::after{color:var(--brand)}
  & .ticket-top{background:linear-gradient(160deg,var(--brand),var(--deep-2) 70%);color:var(--on-deep)}

  /* tiles: brighter greens, and light small print on every dark or photo tile */
  & .tile2.t-deep,& .tile2.t-brand{background:linear-gradient(160deg,var(--brand),var(--deep-2) 70%)}
  /* The light hero gradient is too pale for white text (2.57 at best): initials and stamps on it use deep green. */
  & .me-avatar,& .pf-initial,& .pc-initial span,& .stamps li.on{color:var(--deep)}
  & .tile2.t-deep small,& .tile2.t-brand small,& .tile2:has(.tile2-art) small,& .tile2.t-deep .muted,& .tile2:has(.tile2-art) .muted{color:rgba(255,255,255,.92);opacity:1}

  /* picked pills and answers */
  & .a11y-row input:checked{background:var(--sel)}

  /* cards: white on cream, warm hairline */
  & .card{border-color:var(--line)}
  & .card.link:hover{box-shadow:0 14px 34px rgba(160,110,40,.16)}

  /* the floating Map / Cards switch */
  & .view-switch{background:color-mix(in srgb,var(--surface) 88%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-color:var(--line);box-shadow:0 10px 26px rgba(160,110,40,.22)}
  & .view-switch a{color:var(--ink-2)}
  & .view-switch a.on{background:var(--sel);color:var(--sel-ink)}

  /* success toast: sunny */
  & .notice.ok.toast{background:var(--surface);color:var(--ink);box-shadow:0 14px 34px rgba(160,110,40,.22),0 0 0 1px var(--line) inset}
  & .notice.ok.toast::before{background:var(--brand);color:var(--brand-ink)}

  /* checkboxes and radios in brand green, not the browser's blue */
  & input[type=checkbox],& input[type=radio],& progress{accent-color:var(--brand)}

  /* focus rings stay visible on the light ground */
  & :focus-visible{outline:3px solid var(--focus);outline-offset:2px}
`;

export const WARM_CSS = `
html[data-theme="light"]{${RULES}}
@media (prefers-color-scheme:light){html:not([data-theme]){${RULES}}}
`;
