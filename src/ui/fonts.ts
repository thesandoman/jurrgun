/**
 * Based on the BMA type system (design/fonts/README.md):
 *  1. Headings: Sao Chingcha (เสาชิงช้า), the city's own typeface.
 *  2. Subheadings, UI labels and body text: Anuphan.
 * The sheet sets body in TH Sarabun New, but that reads as an official
 * document on screen and draws small, so body uses Anuphan too (2026-10-15).
 * Both cover Thai and Latin, so one family serves both languages.
 *
 * Served by the Worker itself (routes/vendor.ts) at hashed URLs, so the files
 * can be cached for a year and a new build gets new URLs.
 */
import { FONT_FILES } from "../vendor/fonts.generated";

export type FontFile = keyof typeof FONT_FILES;

export const fontUrl = (f: FontFile) => `/fonts/${f}.${FONT_FILES[f].hash}.woff2`;

const face = (family: string, f: FontFile, weight: number, range?: string) =>
  `@font-face{font-family:'${family}';src:url(${fontUrl(f)}) format("woff2");font-weight:${weight};font-display:swap${range ? `;unicode-range:${range}` : ""}}`;

/** Fontsource's Latin and Latin Extended ranges for Atkinson Hyperlegible: the browser fetches a file only when the page needs it. */
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

export const FONT_CSS = [
  face("Sao Chingcha", "saochingcha-400", 400),
  face("Sao Chingcha", "saochingcha-700", 700),
  face("Anuphan", "anuphan-400", 400),
  face("Anuphan", "anuphan-500", 500),
  face("Anuphan", "anuphan-600", 600),
  face("Anuphan", "anuphan-700", 700),
  // The "easier to read" font in the accessibility menu (card S2: self-hosted, no longer from Google Fonts).
  // Only loaded when a page uses it, i.e. when a member turns that setting on.
  face("Atkinson Hyperlegible", "atkinson-400", 400, LATIN),
  face("Atkinson Hyperlegible", "atkinson-700", 700, LATIN),
  face("Atkinson Hyperlegible", "atkinson-ext-400", 400, LATIN_EXT),
  face("Atkinson Hyperlegible", "atkinson-ext-700", 700, LATIN_EXT),
].join("");

/** Fonts the first paint needs: worth a preload. */
export const PRELOAD_FONTS: FontFile[] = ["saochingcha-700", "anuphan-400", "anuphan-600"];

/** The bytes of a font file, from a request path like "anuphan-400.ab12cd34ef.woff2". */
export function fontBytes(file: string): ArrayBuffer | null {
  const m = /^([a-z0-9-]+)\.([0-9a-f]{10})\.woff2$/.exec(file);
  if (!m || !(m[1] in FONT_FILES)) return null;
  const entry = FONT_FILES[m[1] as FontFile];
  if (entry.hash !== m[2]) return null;
  return Uint8Array.from(atob(entry.b64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

/**
 * Who gets which face. Loaded last so it wins over `font:inherit` on buttons
 * and the older display rules. Body text (the default) is Anuphan too.
 */
export const TYPE_CSS = `
input,select,textarea{font-family:inherit}
h1,h2,.flow-title,.me-hi,.topbar .brand,.big-n{font-family:var(--display);letter-spacing:0}
h3,h4,h5,h6,.btn,button,label,legend,th,.pill,.chip,.seg a,.tabbar a,.top-nav a,.eyebrow,.notice,.ev-date,.ticket .code,.a11y-h,.a11y-size b,.topbar .brand small,.big-l{font-family:var(--sub)}
`;
