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

const face = (family: string, f: FontFile, weight: number) =>
  `@font-face{font-family:'${family}';src:url(${fontUrl(f)}) format("woff2");font-weight:${weight};font-display:swap}`;

export const FONT_CSS = [
  face("Sao Chingcha", "saochingcha-400", 400),
  face("Sao Chingcha", "saochingcha-700", 700),
  face("Anuphan", "anuphan-400", 400),
  face("Anuphan", "anuphan-500", 500),
  face("Anuphan", "anuphan-600", 600),
  face("Anuphan", "anuphan-700", 700),
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
