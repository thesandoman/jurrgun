/**
 * Dating on Jurrgun: the "what brings you here" modes, the two
 * questions dating members answer at the start, and the dating safety net
 * (/safety). Bilingual, gender neutral, no em or en dashes.
 */
export type Text = { th: string; en: string };
const t = (en: string, th: string): Text => ({ en, th });

export const MODES = ["friends", "dating", "dating_only"] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (x: string): x is Mode => (MODES as readonly string[]).includes(x);

/**
 * The two choices a member sees (owner, Phase 2B): friends first, 💘 as the
 * opt-in. "dating_only" stays a valid stored mode for existing members and
 * old form posts, but it is no longer offered; it shows as the 💘 option.
 */
export const MODE_OPTS: { value: Mode; emoji: string; label: Text }[] = [
  { value: "friends", emoji: "👋", label: t("New friends and group plans", "เพื่อนใหม่และกิจกรรมกลุ่ม") },
  { value: "dating", emoji: "💘", label: t("New friends, and open to something more", "เพื่อนใหม่ และเปิดใจมากกว่าเพื่อน") },
];

/** The offered choice a stored mode shows as: dating_only reads as the 💘 option. */
export const offeredMode = (m: Mode | undefined): Mode | undefined => (m === "dating_only" ? "dating" : m);

/** "Why are you here for dating?" Pick up to three. */
export const DATING_REASONS: { value: string; emoji: string; label: Text }[] = [
  { value: "long_term", emoji: "💞", label: t("A long-term relationship", "หาความสัมพันธ์ระยะยาว") },
  { value: "slow", emoji: "🐢", label: t("Dating slowly, no endless swiping", "ค่อย ๆ ทำความรู้จัก ไม่ต้องปัดไม่รู้จบ") },
  { value: "real_things", emoji: "🗺️", label: t("Dates doing real things", "เดตที่ได้ทำกิจกรรมจริง ๆ") },
  { value: "new_city", emoji: "🧳", label: t("New to Bangkok", "เพิ่งมาอยู่กรุงเทพฯ") },
  { value: "back", emoji: "🔄", label: t("Back to dating after a while", "กลับมาเดตอีกครั้งหลังพักไปนาน") },
  { value: "see", emoji: "✨", label: t("Seeing where it goes", "เปิดใจ ดูว่าจะไปทางไหน") },
];

/** "What makes dating in Bangkok hard?" Pick any. */
export const DATING_CHALLENGES: { value: string; emoji: string; label: Text }[] = [
  { value: "swiping", emoji: "📱", label: t("Endless swiping", "ปัดไปเรื่อย ๆ ไม่จบ") },
  { value: "meet", emoji: "🏢", label: t("Hard to meet people outside work", "เจอคนใหม่นอกที่ทำงานยาก") },
  { value: "time", emoji: "🚗", label: t("Long hours and traffic", "งานหนัก รถติด ไม่มีเวลา") },
  { value: "safety", emoji: "🛡️", label: t("Safety meeting strangers", "ความปลอดภัยเวลาเจอคนแปลกหน้า") },
  { value: "ghosting", emoji: "👻", label: t("Ghosting and flaky plans", "โดนเทหรือหายเงียบ") },
  { value: "fake", emoji: "🎭", label: t("Fake profiles and scams", "โปรไฟล์ปลอมและมิจฉาชีพ") },
  { value: "language", emoji: "🗣️", label: t("Language or culture gaps", "ภาษาและวัฒนธรรมต่างกัน") },
  { value: "nightlife", emoji: "🌙", label: t("Nightlife isn't my scene", "ไม่ใช่สายเที่ยวกลางคืน") },
  { value: "pressure", emoji: "👪", label: t("Pressure from family or friends", "แรงกดดันจากครอบครัวหรือเพื่อน") },
];

export const MAX_REASONS = 3;

// ------------------------------------------------------ dating preferences --
// Private, like the reasons above: never shown to anyone. They only shape who
// a dating member is paired with (domain/buddy.ts datingFit) and the deck order.

type Pref = { value: string; emoji: string; label: Text };
export type DatingPrefs = { goal?: string; kids?: string; pace?: string; firstDate?: string[]; distance?: string };

export const DATING_GOALS: Pref[] = [
  { value: "long_term", emoji: "💞", label: t("A long-term partner", "แฟนระยะยาว") },
  { value: "marriage", emoji: "💍", label: t("Partner for life, marriage minded", "คู่ชีวิต มองไปถึงการแต่งงาน") },
  { value: "see", emoji: "✨", label: t("Open, seeing where it goes", "เปิดใจ ดูว่าจะไปทางไหน") },
  { value: "companion", emoji: "🫶", label: t("Companionship first", "อยากมีเพื่อนคู่ใจก่อน") },
];
export const DATING_KIDS: Pref[] = [
  { value: "want", emoji: "👶", label: t("I'd like kids someday", "อยากมีลูกสักวัน") },
  { value: "have_more", emoji: "👨‍👧", label: t("Have kids, open to more", "มีลูกแล้ว ถ้ามีเพิ่มก็ยินดี") },
  { value: "have_done", emoji: "👨‍👦", label: t("Have kids, not planning more", "มีลูกแล้ว ไม่วางแผนมีเพิ่ม") },
  { value: "no", emoji: "🙅", label: t("Don't want kids", "ไม่อยากมีลูก") },
  { value: "open", emoji: "🤷", label: t("Not sure yet", "ยังไม่แน่ใจ") },
];
/** Kids answers that can't work together. */
const KIDS_YES = ["want", "have_more"];
const KIDS_NO = ["no", "have_done"];
export const kidsClash = (a?: string, b?: string) => !!a && !!b && ((KIDS_YES.includes(a) && KIDS_NO.includes(b)) || (KIDS_NO.includes(a) && KIDS_YES.includes(b)));

export const DATING_PACE: Pref[] = [
  { value: "group_first", emoji: "👥", label: t("Meet in a group a few times first", "เจอกันเป็นกลุ่มสักพักก่อน") },
  { value: "steady", emoji: "🚶", label: t("Steady, one step at a time", "ค่อยเป็นค่อยไป") },
  { value: "soon", emoji: "☕", label: t("Happy to meet one to one soon", "พร้อมนัดเจอกันสองคนในเร็ว ๆ นี้") },
];
export const DATING_FIRST: Pref[] = [
  { value: "coffee", emoji: "☕", label: t("Coffee", "กาแฟ") },
  { value: "walk", emoji: "🌳", label: t("A walk in a park", "เดินเล่นในสวน") },
  { value: "street_food", emoji: "🍜", label: t("Street food", "สตรีทฟู้ด") },
  { value: "museum", emoji: "🖼️", label: t("A gallery or museum", "แกลเลอรีหรือพิพิธภัณฑ์") },
  { value: "activity", emoji: "🧗", label: t("Doing something active", "ทำกิจกรรมที่ได้ขยับตัว") },
  { value: "market", emoji: "🛍️", label: t("A night market", "ตลาดกลางคืน") },
];
export const MAX_FIRST = 3;
export const DATING_DISTANCE: Pref[] = [
  { value: "near", emoji: "📍", label: t("Near my district", "ใกล้เขตที่อยู่") },
  { value: "rail", emoji: "🚇", label: t("Anywhere on BTS or MRT", "ที่ไหนก็ได้ที่ BTS หรือ MRT ไปถึง") },
  { value: "anywhere", emoji: "🗺️", label: t("Anywhere in Bangkok", "ที่ไหนก็ได้ในกรุงเทพฯ") },
];

/** Keep only known values from a stored or posted prefs object. */
export function cleanPrefs(raw: unknown): DatingPrefs {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const one = (v: unknown, list: Pref[]) => (typeof v === "string" && list.some((o) => o.value === v) ? v : undefined);
  const out: DatingPrefs = {};
  const goal = one(r.goal, DATING_GOALS);
  if (goal) out.goal = goal;
  const kids = one(r.kids, DATING_KIDS);
  if (kids) out.kids = kids;
  const pace = one(r.pace, DATING_PACE);
  if (pace) out.pace = pace;
  const distance = one(r.distance, DATING_DISTANCE);
  if (distance) out.distance = distance;
  if (Array.isArray(r.firstDate)) {
    const firsts = [...new Set(r.firstDate.filter((x): x is string => typeof x === "string" && DATING_FIRST.some((o) => o.value === x)))].slice(0, MAX_FIRST);
    if (firsts.length) out.firstDate = firsts;
  }
  return out;
}

/** How Jurrgun answers each challenge, shown right after the questions. */
export const CHALLENGE_ANSWERS: Record<string, Text> = {
  swiping: t("No swiping at all: up to 15 people a day, each one read before you choose, small tables, and one Bangkok Buddy at a time.", "ไม่มีการปัดเลย วันละไม่เกิน 15 คน อ่านก่อนแล้วค่อยเลือก โต๊ะเล็ก ๆ และบัดดี้ทีละคน"),
  meet: t("Tables of 4 to 6 at real places, every week.", "โต๊ะละ 4 ถึง 6 คน ที่สถานที่จริง ทุกสัปดาห์"),
  time: t("Quests and tables near your district.", "เควสต์และโต๊ะใกล้ย่านของคุณ"),
  safety: t("Public places only, plus a safety net to share your plans.", "นัดในที่สาธารณะเท่านั้น และมีตัวช่วยแชร์แผนให้คนที่ไว้ใจ"),
  ghosting: t("No ghosting: every pairing ends kindly.", "ไม่มีหายเงียบ ถ้าจะแยกย้ายก็บอกลากันดี ๆ"),
  fake: t("You meet in person first, in a group.", "เจอตัวจริงก่อน แบบเป็นกลุ่ม"),
  language: t("Pick tables in your languages.", "เลือกโต๊ะตามภาษาที่คุณใช้"),
  nightlife: t("Daytime quests, cafés, parks and markets.", "เควสต์กลางวัน คาเฟ่ สวน ตลาด"),
  pressure: t("Romance only shows when it's mutual, and stays private.", "เรื่องหัวใจจะขึ้นก็ต่อเมื่อชอบกันทั้งสองฝ่าย และเก็บเป็นความลับ"),
};

/** The dating safety net checklist (/safety). Short on purpose. */
export const SAFETY_TIPS: { emoji: string; text: Text }[] = [
  { emoji: "📍", text: t("Meet somewhere public and busy", "นัดในที่สาธารณะที่มีคนพลุกพล่าน") },
  { emoji: "🚇", text: t("Get there and home on your own", "เดินทางไปและกลับเอง") },
  { emoji: "📲", text: t("Share your plan with someone you trust", "แชร์แผนให้คนที่ไว้ใจ") },
  { emoji: "🎥", text: t("Video call first if you haven't met", "วิดีโอคอลก่อน ถ้ายังไม่เคยเจอ") },
  { emoji: "🥤", text: t("Keep your drink and phone with you", "เก็บเครื่องดื่มและโทรศัพท์ไว้กับตัว") },
  { emoji: "💸", text: t("Never send money or codes", "อย่าโอนเงินหรือบอกรหัสใด ๆ เด็ดขาด") },
  { emoji: "🚪", text: t("Feel off? Leave. That's always OK", "รู้สึกไม่ดีเมื่อไหร่ ขอตัวกลับได้เสมอ") },
];

/** Why someone is leaving (anonymous, optional). */
export const EXIT_REASONS: { value: string; emoji: string; label: Text }[] = [
  { value: "made_friends", emoji: "🎓", label: t("I made friends, I don't need it now", "ได้เพื่อนแล้ว ตอนนี้ยังไม่ต้องใช้") },
  { value: "found_partner", emoji: "💞", label: t("I found someone", "เจอคนที่ใช่แล้ว") },
  { value: "too_busy", emoji: "⏰", label: t("Too busy right now", "ช่วงนี้ยุ่งเกินไป") },
  { value: "nothing_near", emoji: "📍", label: t("Not enough near me", "ใกล้บ้านมีกิจกรรมน้อย") },
  { value: "cost", emoji: "💸", label: t("Too expensive", "ค่าใช้จ่ายสูงไป") },
  { value: "didnt_click", emoji: "🤷", label: t("Didn't click with people", "ไม่ค่อยคลิกกับใคร") },
  { value: "unsafe", emoji: "🛡️", label: t("Didn't feel safe", "รู้สึกไม่ปลอดภัย") },
  { value: "privacy", emoji: "🔒", label: t("Privacy worries", "กังวลเรื่องความเป็นส่วนตัว") },
  { value: "too_many", emoji: "🔔", label: t("Too many notifications", "แจ้งเตือนเยอะไป") },
  { value: "other", emoji: "💬", label: t("Something else", "อื่น ๆ") },
];
