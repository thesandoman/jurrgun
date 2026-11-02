/**
 * Contact details in free text (owner card F2, 2026-11): LINE ids, phone numbers, handles, links, emails.
 * Used by chat (refused before the first meet) and profile text (shown as •••• until connected).
 *
 * Written from the review panel's cases. It should catch "ไลน์ sando99", "LINE: sando99", Telegram and Thai
 * digits, and leave "I post on Instagram sometimes" and "Worked at Agoda.com" alone. So a platform name only
 * counts with something handle-shaped after it: a separator ("LINE: x", "ไอดี x") or a token with a digit,
 * "_" or ".". A bare domain only counts with a path, unless it's a contact or short-link site.
 * Deliberately simple: spaced-out spellings ("l i n e") get through. This raises the cost; it isn't a wall.
 */
export const HIDDEN = "••••";

const D = "[0-9๐-๙０-９]";
const WORDS = [
  "line", "ไลน์", "ig", "insta", "instagram", "ไอจี", "telegram", "เทเลแกรม", "tg", "whatsapp", "วอทส์แอป", "วอทแอป", "wechat", "วีแชท",
  "facebook", "fb", "เฟซบุ๊ก", "เฟสบุ๊ค", "เฟส", "tiktok", "ติ๊กต็อก", "ติ๊กตอก", "snapchat", "snap", "discord", "kakao", "signal",
].join("|");

const PLAIN: RegExp[] = [
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /\b(?:line\.me|lin\.ee|t\.me|wa\.me|m\.me|instagram\.com|facebook\.com|fb\.com|fb\.me|tiktok\.com|x\.com|twitter\.com|discord\.gg|bit\.ly|tinyurl\.com)(?:\/\S*)?/gi,
  /\b[a-z0-9-]+\.(?:com|net|org|co|me|io|ly|th|link|app|xyz)\/\S+/gi,
  /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z.]{2,}/gi,
  /(?<![^\s(:：])@[a-z0-9_.]{3,}/gi,
  // 9 to 15 digits, Arabic, Thai or full-width, with spaces, dots, dashes or brackets between them.
  new RegExp(`\\+?${D}(?:[\\s.\\-()]?${D}){8,14}(?!${D})`, "g"),
];
/** "ไอดีไลน์ x" / "id line x": the id word comes first. */
const ID_FIRST = /(?:ไอดีไลน์|id\s*line)\s*[:：=]?\s*(@?[a-z0-9_.-]{3,})/gi;
const PLATFORM = new RegExp(`(?<![a-z0-9_])(?:${WORDS})(\\s*(?:id|ไอดี)?\\s*(?:[:：=]|คือ)?\\s*)(@?[a-z0-9_.\\-]{3,})`, "gi");

type Range = [number, number];

export function findContacts(text: string): Range[] {
  const out: Range[] = [];
  for (const re of PLAIN) for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(ID_FIRST)) out.push([m.index + m[0].length - m[1].length, m.index + m[0].length]);
  for (const m of text.matchAll(PLATFORM)) {
    const strong = /id|ไอดี|[:：=]|คือ/i.test(m[1]);
    if (strong || /[0-9_.]/.test(m[2])) out.push([m.index + m[0].length - m[2].length, m.index + m[0].length]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

export const hasContact = (text: string) => findContacts(text).length > 0;

/** The text with each contact detail replaced by ••••. */
export function maskContacts(text: string): string {
  let out = "";
  let at = 0;
  for (const [a, b] of findContacts(text)) {
    out += text.slice(at, a) + HIDDEN;
    at = b;
  }
  return out + text.slice(at);
}
