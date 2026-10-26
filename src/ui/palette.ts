/**
 * Jurrgun colour: the one place colours are defined (owner direction
 * 2026-10-17: green, mango, Bangkok colours, lighter and friendlier, a bit
 * of sky blue). Three layers:
 *
 *   1. PRIMITIVES: the raw Bangkok colours. BTS green, mango sticky rice,
 *      Chao Phraya sky, canal teal, cream, and love red (only for 💘).
 *   2. Semantic roles (LIGHT and DARK): text levels, action, selected,
 *      success, warning, danger, info, mine, and the four category tints.
 *   3. Component tokens: the tab bar, the deep green tiles, the hero, fields.
 *
 * Components use the semantic and component names, never primitives or hex.
 * Meaning: green acts and marks outdoors and active; sky is info, new things,
 * the river, culture and language exchange; teal is food and nights; light
 * mint is the city. Mango is only the My events tab and warnings (waitlist,
 * almost full). Tints carry no yellow or cream (owner, 2026-10-17); cream is
 * only the page itself.
 * test/palette.test.ts checks every text pair against WCAG AA and the
 * category tints against each other (CIEDE2000 of 15 or more).
 */

export const PRIMITIVES = {
  green: { 50: "#f1f9f3", 100: "#e3f5ea", 200: "#acecb4", 500: "#2fb866", 600: "#11763f", 700: "#0b5a30", 800: "#06492a", 900: "#06301c" },
  mango: { 50: "#fff8ea", 100: "#fff0d2", 200: "#ffdc94", 300: "#ffc766", 400: "#ffa53a", 800: "#9a5100", 900: "#3b2400" },
  sky: { 100: "#e3f2fc", 200: "#c6dcfa", 400: "#5cb8e6", 700: "#0a6390" },
  teal: { 100: "#dff7f4", 200: "#8ff2ea", 500: "#22a99f", 700: "#0b6b66" },
  mint: { 50: "#effcf6", 300: "#a8dcc0" },
  cream: { 50: "#fff9f0", 200: "#f0e2cc" },
  love: { 500: "#e23744", 700: "#c0222f", 100: "#fde3e5" },
  ink: { 900: "#1e2b22", 700: "#46564b", 600: "#56635a" },
  danger: { 700: "#c2261d", 100: "#fde8e6" },
  white: "#ffffff",
} as const;

const P = PRIMITIVES;

export type Palette = Record<string, string>;

/** Light theme: cream ground, white surfaces, soft bright tints. */
export const LIGHT: Palette = {
  // surfaces
  bg: P.cream[50],
  surface: P.white,
  "surface-2": P.green[50],
  line: P.cream[200],
  "field-line": "#8c7a66",
  "switch-off": P.ink[600],
  // text levels
  ink: P.ink[900],
  "ink-2": P.ink[700],
  "ink-3": P.ink[600],
  // action
  brand: P.green[600],
  "brand-ink": P.white,
  "brand-strong": P.green[700],
  "brand-soft": P.green[100],
  fresh: P.green[500],
  // selected: one look everywhere (time tabs, Map/Cards, tab bar, chips, pills)
  sel: P.green[600],
  "sel-ink": P.white,
  // status
  ok: P.green[600],
  "ok-soft": P.green[100],
  warn: P.mango[800],
  "warn-soft": P.mango[100],
  err: P.danger[700],
  "err-soft": P.danger[100],
  info: P.sky[700],
  "info-soft": P.sky[100],
  "on-info": P.white,
  teal: P.teal[700],
  "teal-soft": P.teal[100],
  // mango: only the My events tab and warnings
  mango: P.mango[400],
  "mango-1": P.mango[300],
  "mango-2": P.mango[400],
  "mango-ink": P.mango[800],
  "on-mango": P.mango[900],
  // love red: only for 💘
  love: P.love[500],
  "love-ink": P.love[700],
  "love-soft": P.love[100],
  // category tints (ticket stubs) and their scene grounds (cover landscapes)
  "cat-green": P.green[200],
  "cat-teal": P.teal[200],
  "cat-sky": P.sky[200],
  "cat-mint": P.mint[50],
  "cat-green-2": P.green[500],
  "cat-teal-2": P.teal[500],
  "cat-sky-2": P.sky[400],
  "cat-mint-2": P.mint[300],
  // component: deep green tiles, pass header, QR back
  deep: P.green[800],
  "deep-2": P.green[700],
  "on-deep": P.white,
  "on-deep-2": P.green[100],
  "on-deep-accent": P.teal[200],
};

/** Dark theme: designed, not inverted. A night-green ground, surfaces clearly above it, brighter accents. */
export const DARK: Palette = {
  bg: "#0e1712",
  surface: "#202f26",
  "surface-2": "#2a3c31",
  line: "#3a5244",
  "field-line": "#7d9a88",
  "switch-off": "#9fb6a7",
  ink: "#eef6f0",
  "ink-2": "#c3d5c9",
  "ink-3": "#a3b9ab",
  brand: "#4cc884",
  "brand-ink": "#062112",
  "brand-strong": "#86e0ac",
  "brand-soft": "#1b3d29",
  fresh: "#3fd17f",
  sel: "#4cc884",
  "sel-ink": "#062112",
  ok: "#86e0ac",
  "ok-soft": "#1b3d29",
  warn: "#ffc766",
  "warn-soft": "#3d2e12",
  err: "#ff8a80",
  "err-soft": "#401c1a",
  info: "#7cc8f0",
  "info-soft": "#13324a",
  "on-info": "#062112",
  teal: "#6fe0d6",
  "teal-soft": "#0f3a38",
  mango: "#ffb347",
  "mango-1": P.mango[300],
  "mango-2": P.mango[400],
  "mango-ink": "#ffc766",
  "on-mango": P.mango[900],
  love: "#f0505c",
  "love-ink": "#ff6b74",
  "love-soft": "#3a1a1e",
  "cat-green": "#19431d",
  "cat-teal": "#0b4c50",
  "cat-sky": "#0b3250",
  "cat-mint": "#1a231f",
  "cat-green-2": "#14683f",
  "cat-teal-2": "#0f6e6a",
  "cat-sky-2": "#1d5a80",
  "cat-mint-2": "#2d4a3b",
  deep: "#0b3520",
  "deep-2": "#0e4429",
  "on-deep": P.white,
  "on-deep-2": "#a7e9bf",
  "on-deep-accent": P.teal[200],
};

/** Gradients and shadows built from the tokens above. */
const LIGHT_EXTRA = `--hero:linear-gradient(135deg,${P.green[500]} 0%,${P.green[200]} 60%,${P.sky[200]} 120%);--shadow:0 1px 2px rgba(120,80,30,.06),0 10px 28px rgba(160,110,40,.10);--focus:color-mix(in srgb,var(--brand) 55%,transparent)`;
const DARK_EXTRA = `--hero:linear-gradient(135deg,${P.green[700]} 0%,#13703f 60%,#0f6e6a 130%);--shadow:0 1px 2px rgba(0,0,0,.35),0 8px 24px rgba(0,0,0,.25);--focus:color-mix(in srgb,var(--brand) 60%,transparent)`;

const decls = (p: Palette) =>
  Object.entries(p)
    .map(([k, v]) => `--${k}:${v}`)
    .join(";");

/** The token sheet. Dark is written as a dark media block so themed() can scope it. */
export const PALETTE_CSS = `:root{${decls(LIGHT)};${LIGHT_EXTRA}}
@media (prefers-color-scheme:dark){:root{${decls(DARK)};${DARK_EXTRA}}}`;

/**
 * The text and background pairs the app uses, by role. Each is [text, background, minimum].
 * 4.5 for body text, 3 for large text and control edges.
 */
export const TEXT_PAIRS: [string, string, number][] = [
  ["ink", "bg", 4.5], ["ink", "surface", 4.5], ["ink", "surface-2", 4.5],
  ["ink-2", "bg", 4.5], ["ink-2", "surface", 4.5], ["ink-2", "surface-2", 4.5],
  ["ink-3", "bg", 4.5], ["ink-3", "surface", 4.5], ["ink-3", "surface-2", 4.5],
  ["brand", "bg", 4.5], ["brand", "surface", 4.5], ["brand", "surface-2", 4.5],
  ["brand-ink", "brand", 4.5], ["brand-strong", "brand-soft", 4.5], ["brand", "brand-soft", 4.5], ["ink", "brand-soft", 4.5],
  ["sel-ink", "sel", 4.5],
  ["ok", "ok-soft", 4.5], ["warn", "warn-soft", 4.5], ["warn", "surface", 4.5], ["err", "err-soft", 4.5], ["err", "surface", 4.5],
  ["info", "info-soft", 4.5], ["info", "surface", 4.5], ["ink", "info-soft", 4.5], ["on-info", "info", 4.5],
  ["teal", "teal-soft", 4.5], ["teal", "surface", 4.5], ["ink", "teal-soft", 4.5],
  ["mango-ink", "warn-soft", 4.5], ["mango-ink", "bg", 4.5], ["mango-ink", "surface", 4.5], ["ink", "warn-soft", 4.5],
  ["on-mango", "mango-1", 4.5], ["on-mango", "mango-2", 4.5],
  ["love-ink", "love-soft", 4.5], ["love-ink", "surface", 4.5],
  ["ink", "cat-green", 4.5], ["ink", "cat-teal", 4.5], ["ink", "cat-sky", 4.5], ["ink", "cat-mint", 4.5],
  ["ink-3", "cat-green", 4.5], ["ink-3", "cat-teal", 4.5], ["ink-3", "cat-sky", 4.5], ["ink-3", "cat-mint", 4.5],
  ["on-deep", "deep", 4.5], ["on-deep-2", "deep", 4.5], ["on-deep-accent", "deep", 4.5], ["on-deep", "deep-2", 4.5],
  ["field-line", "surface", 3], ["switch-off", "surface", 3], ["sel", "surface", 3], ["sel", "bg", 3],
];
