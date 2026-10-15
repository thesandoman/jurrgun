/**
 * Style sets: short extra questions after the Bangkok Type quiz for members
 * they fit. They never move the 4-letter type: their answers carry a style
 * trait, not a type code, and scoreSession skips them.
 *
 *  - date: only for members who opted into 💘 Open to something more. Four
 *    questions, one per dimension, give the "how you date" card on the dating
 *    profile (src/ui/profile-card.tsx).
 *  - host: only for Table Hosts. Two questions give a "how you host" line.
 *
 * Every scenario belongs to one dimension and every answer is one value of
 * it, so a picked answer is that dimension's value. Bilingual, gender
 * neutral, no em or en dashes (same rules as bank/WRITING.md).
 */
import type { Text } from "./content";
import type { Tone } from "./visuals";
import { DATE_STYLE } from "./bank/date-style";
import { HOST_STYLE } from "./bank/host-style";

export type StyleSet = "date" | "host";

const t = (en: string, th: string): Text => ({ en, th });

type Value = { emoji: string; label: Text };
type Dimension = { title: Text; values: Record<string, Value> };

/** The dimensions of each set and the card wording for each value. */
export const STYLE_DIMENSIONS = {
  date: {
    place: {
      title: t("First date at", "เดตแรกที่"),
      values: {
        cafe: { emoji: "☕", label: t("A daytime café", "คาเฟ่ตอนกลางวัน") },
        walk: { emoji: "🌳", label: t("A walk in a park", "เดินเล่นในสวน") },
        food: { emoji: "🍜", label: t("A busy food spot", "ร้านอร่อยที่คนเยอะ") },
        culture: { emoji: "🖼️", label: t("A gallery or museum", "แกลเลอรีหรือพิพิธภัณฑ์") },
      },
    },
    pace: {
      title: t("Pace", "จังหวะ"),
      values: {
        group_first: { emoji: "👥", label: t("Meet at a table a few times first", "เจอกันที่โต๊ะสักสองสามครั้งก่อน") },
        steady: { emoji: "🚶", label: t("Steady, one step at a time", "ค่อยเป็นค่อยไป") },
        soon: { emoji: "☕", label: t("Happy to meet one to one soon", "พร้อมนัดเจอกันสองคนเร็ว ๆ นี้") },
      },
    },
    ease: {
      title: t("At ease when", "สบายใจเมื่อ"),
      values: {
        plan: { emoji: "🗓️", label: t("There's a clear plan and an end time", "มีแพลนชัด ๆ และเวลาเลิก") },
        public: { emoji: "☀️", label: t("It's daytime somewhere busy", "เป็นตอนกลางวันในที่ที่มีคน") },
        doing: { emoji: "🎨", label: t("We're doing something side by side", "ได้ทำอะไรสักอย่างไปด้วยกัน") },
        friends: { emoji: "📍", label: t("A friend knows where I am", "มีเพื่อนรู้ว่าฉันอยู่ไหน") },
      },
    },
    ask: {
      title: t("Ask me out", "ชวนฉันแบบ"),
      values: {
        direct: { emoji: "💬", label: t("Plainly, in a message", "ตรง ๆ ทางแชต") },
        plan: { emoji: "📌", label: t("With a real plan: a place and a time", "มีแพลนจริง บอกที่และเวลามาเลย") },
        slow: { emoji: "🐢", label: t("After we've chatted for a while", "หลังจากแชตกันมาสักพัก") },
        table: { emoji: "🍽️", label: t("Invite me to a Table first", "ชวนมาโต๊ะก่อน") },
      },
    },
  },
  host: {
    welcome: {
      title: t("Opens a Table with", "เปิดโต๊ะด้วย"),
      values: {
        game: { emoji: "🎲", label: t("A quick name game", "เกมจำชื่อสั้น ๆ") },
        food: { emoji: "🥟", label: t("Food on the table first", "ของกินขึ้นโต๊ะก่อน") },
        task: { emoji: "🧺", label: t("A small job for everyone", "งานเล็ก ๆ ให้ทุกคน") },
        hello: { emoji: "👋", label: t("A hello for each person", "ทักทายทีละคน") },
      },
    },
    include: {
      title: t("Brings in the quiet ones by", "ดึงคนเงียบเข้าวงด้วย"),
      values: {
        ask: { emoji: "❓", label: t("An easy question", "คำถามง่าย ๆ") },
        pair: { emoji: "🤝", label: t("Pairing people up", "จับคู่ให้คุยกัน") },
        job: { emoji: "🎯", label: t("Giving them a role", "ให้หน้าที่สักอย่าง") },
        beside: { emoji: "🪑", label: t("Sitting beside them", "นั่งข้าง ๆ") },
      },
    },
    plan: {
      title: t("Plans", "วางแผน"),
      values: {
        detail: { emoji: "📋", label: t("Every detail ahead", "ละเอียดทุกขั้นล่วงหน้า") },
        loose: { emoji: "🌊", label: t("A loose plan, room to wander", "แพลนหลวม ๆ เปลี่ยนได้") },
        vote: { emoji: "🗳️", label: t("Let the Table choose", "ให้คนในโต๊ะเลือก") },
        ritual: { emoji: "🔁", label: t("The same ritual every time", "แบบเดิมทุกครั้ง") },
      },
    },
  },
} as const satisfies Record<StyleSet, Record<string, Dimension>>;

export type DateDimension = keyof typeof STYLE_DIMENSIONS.date;
export type HostDimension = keyof typeof STYLE_DIMENSIONS.host;
export type StyleDimension = DateDimension | HostDimension;

export type StyleAnswer = Text & { icon: string; value: string };

export type StyleScenario = {
  id: string;
  set: StyleSet;
  dimension: string;
  prompt: Text;
  icon: string;
  tone: Tone;
  /** Three or four answers, each a value of the dimension. */
  answers: StyleAnswer[];
};

export const STYLE_SCENARIOS: StyleScenario[] = [...DATE_STYLE, ...HOST_STYLE];

/** Dimension → picked value, e.g. { place: "walk", pace: "steady" }. */
export type StyleCard = Partial<Record<string, string>>;

const dims = (set: StyleSet): Record<string, Dimension> => STYLE_DIMENSIONS[set];

export function isStyleValue(set: StyleSet, dimension: string, value: string): boolean {
  return Object.prototype.hasOwnProperty.call(dims(set)[dimension]?.values ?? {}, value);
}

/** Keep only known dimensions and values from a stored card. */
export function cleanStyle(set: StyleSet, raw: unknown): StyleCard | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: StyleCard = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string" && isStyleValue(set, k, v)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/** The card's lines in dimension order, for display. */
export function styleLines(set: StyleSet, card: StyleCard | undefined, lang: "th" | "en"): { title: string; emoji: string; label: string }[] {
  if (!card) return [];
  return Object.entries(dims(set)).flatMap(([k, d]) => {
    const v = card[k];
    const val = v ? d.values[v] : undefined;
    return val ? [{ title: lang === "en" ? d.title.en : d.title.th, emoji: val.emoji, label: lang === "en" ? val.label.en : val.label.th }] : [];
  });
}
