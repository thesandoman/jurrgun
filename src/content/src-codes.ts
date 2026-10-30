/**
 * Campaign codes that may be counted and shown (Marketing's M4 link register,
 * design/marketing/m4-link-register.md). An allow-list on purpose (owner C3,
 * Marketing 27 Oct 2026): anyone can type ?src=<a name> into a URL, and a
 * person's name must never reach the database or BMA Insights, so any code
 * not listed here is counted and shown as "other".
 *
 * Marketing keeps this file in line with the register; changes go through QA.
 */
export type SrcChannel = "line" | "ig" | "tt" | "fb" | "yt" | "poster" | "creator" | "bio" | "founder" | "bma" | "press";

export const SRC_CODES: { code: string; channel: SrcChannel }[] = [
  { code: "line-rich-tables", channel: "line" },
  { code: "line-rich-new", channel: "line" },
  { code: "line-rich-intl", channel: "line" },
  { code: "line-rich-quiz", channel: "line" },
  { code: "line-greeting", channel: "line" },
  { code: "line-bc-eve", channel: "line" },
  { code: "line-bc-reminder", channel: "line" },
  { code: "line-voom", channel: "line" },
  { code: "ig-bio", channel: "bio" },
  { code: "ig-reel04", channel: "ig" },
  { code: "ig-promo05-1x1", channel: "ig" },
  { code: "ig-promo05-9x16", channel: "ig" },
  { code: "tt-bio", channel: "bio" },
  { code: "tt-reel04", channel: "tt" },
  { code: "fb-page", channel: "fb" },
  { code: "fb-promo05", channel: "fb" },
  { code: "yt-film01", channel: "yt" },
  { code: "yt-film03", channel: "yt" },
  { code: "yt-film06", channel: "yt" },
  { code: "founder-li", channel: "founder" },
  { code: "creator", channel: "creator" },
  { code: "poster-new", channel: "poster" },
  { code: "poster-intl", channel: "poster" },
  { code: "poster-uni", channel: "poster" },
  { code: "poster-cowork", channel: "poster" },
  { code: "bma-district", channel: "bma" },
  { code: "bma-line", channel: "bma" },
  { code: "press", channel: "press" },
];

/** What every unlisted code is stored and shown as. */
export const OTHER_CODE = "other";

const BY_CODE = new Map(SRC_CODES.map((c) => [c.code, c.channel]));

/** The code as it may be stored: listed codes as they are, anything else as "other". */
export const allowedCode = (code: string | null | undefined): string => (code && BY_CODE.has(code) ? code : OTHER_CODE);

/** The channel of a code, or "other". */
export const channelOf = (code: string): SrcChannel | typeof OTHER_CODE => BY_CODE.get(code) ?? OTHER_CODE;
