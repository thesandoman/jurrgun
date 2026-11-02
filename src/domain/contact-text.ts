/**
 * Contact details in free text (owner card F2, 2026-11): LINE ids, phone numbers, handles, links, emails.
 * Used by chat (refused before the first meet) and profile text (shown as •••• until connected).
 *
 * Written from the review panel's cases. It should catch "ไลน์ sando99", "LINE: sando99", Telegram and Thai
 * digits, and leave "I post on Instagram sometimes" and "Worked at Agoda.com" alone. It also keeps everything the
 * old chat filter refused, including letters-only handles ("ig sando", "ไอจี sando", "my line is sandosit").
 * A platform name counts when what follows looks like a handle: a separator or linking word ("LINE: x", "ไอดี x",
 * "my line is x", "ไลน์ผม x"), a token with a digit, "_" or ".", or, after ig, insta, instagram or ไอจี only, any
 * other word that isn't everyday English ("ig sando" yes, "Instagram sometimes" no). A bare domain only counts
 * with a path, unless it's a contact or short-link site.
 * Deliberately simple: spaced-out spellings ("l i n e") get through. This raises the cost; it isn't a wall.
 */
export const HIDDEN = "••••";

const D = "[0-9๐-๙０-９]";
/** A Latin name must end at a word boundary ("insta" isn't "instagram" + "gram"); a Thai one can run straight into a handle. */
const WORDS = [
  ...["line", "ig", "insta", "instagram", "telegram", "tg", "whatsapp", "wechat", "facebook", "fb", "tiktok", "snapchat", "snap", "discord", "kakao", "signal"].map((w) => `${w}(?![a-z0-9_])`),
  ...["ไลน์", "ไอจี", "เทเลแกรม", "วอทส์แอป", "วอทแอป", "วีแชท", "เฟซบุ๊ก", "เฟสบุ๊ค", "เฟส", "ติ๊กต็อก", "ติ๊กตอก"],
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
const PLATFORM = new RegExp(`(?<![a-z0-9_])(${WORDS})(\\s*(?:(?:id|ไอดี|is|ผม|ฉัน|เรา|หนู|ของผม|ของฉัน|ของเรา)\\s*)*(?:[:：=]|คือ)?\\s*)(@?[a-z0-9_.\\-]{3,})`, "gi");
/**
 * The names the old chat filter refused a plain word after ("ig sando"). For every other platform a plain word
 * proves nothing ("I saw it on TikTok yesterday", "I use Facebook marketplace"), so those need the stronger signs.
 */
const PLAIN_WORD_COUNTS = /^(?:ig|insta|instagram|ไอจี)$/i;
/** Plain words that follow a platform name in ordinary sentences ("Instagram sometimes", "TikTok videos"). */
const EVERYDAY = new Set(
  "sometimes often always never usually rarely mostly mainly only just also too again now then today tonight here there a an the and or but so for from with without about after before when while because if at in on of to by as is are was were be been that this these those it its my your our their his her me you we they i not no yes more less much many some all any most very really reel reels story stories post posts page pages account accounts video videos photo photos picture pictures content creator creators influencer influencers marketing ads ad shop shops group groups live lives feed feeds app apps user users addict fan fans friend friends ban banned scroller scrolling busy free down open closed good bad long short dead full new old yesterday tomorrow week weeks month months year years last next first once twice everyday time times thing things stuff people messages message chat chats".split(" "),
);
const notEveryday = (token: string) => !EVERYDAY.has(token.toLowerCase()) && !/(?:ly|ing)$/i.test(token);

type Range = [number, number];

export function findContacts(text: string): Range[] {
  const out: Range[] = [];
  for (const re of PLAIN) for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(ID_FIRST)) out.push([m.index + m[0].length - m[1].length, m.index + m[0].length]);
  for (const m of text.matchAll(PLATFORM)) {
    const [whole, name, between, token] = m;
    const strong = /id|ไอดี|is|ผม|ฉัน|เรา|หนู|[:：=]|คือ/i.test(between);
    const shaped = /[0-9_.]/.test(token) || token.startsWith("@");
    if (strong ? notEveryday(token) || shaped : shaped || (PLAIN_WORD_COUNTS.test(name) && notEveryday(token))) out.push([m.index + whole.length - token.length, m.index + whole.length]);
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
