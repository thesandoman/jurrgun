/**
 * Dating on Jurrgun: the three "what brings you here" modes, the two
 * questions dating members answer at the start, and the dating safety net
 * (/safety). Bilingual, gender neutral, no em or en dashes.
 */
export type Text = { th: string; en: string };
const t = (en: string, th: string): Text => ({ en, th });

export const MODES = ["friends", "dating", "dating_only"] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (x: string): x is Mode => (MODES as readonly string[]).includes(x);

export const MODE_OPTS: { value: Mode; emoji: string; label: Text }[] = [
  { value: "friends", emoji: "👋", label: t("Friends and group hangouts only", "เพื่อนใหม่และกิจกรรมกลุ่มเท่านั้น") },
  { value: "dating", emoji: "🌱", label: t("Friends, and open to dating", "เพื่อนใหม่ และเปิดใจเรื่องเดท") },
  { value: "dating_only", emoji: "💘", label: t("Here for dating", "มาเพื่อหาเดทโดยเฉพาะ") },
];

/** "Why are you here for dating?" Pick up to three. */
export const DATING_REASONS: { value: string; emoji: string; label: Text }[] = [
  { value: "long_term", emoji: "💞", label: t("A long-term relationship", "หาความสัมพันธ์ระยะยาว") },
  { value: "slow", emoji: "🐢", label: t("Dating slowly, no swiping", "ค่อย ๆ ทำความรู้จัก ไม่ต้องปัด") },
  { value: "real_things", emoji: "🗺️", label: t("Dates doing real things", "เดทแบบได้ทำกิจกรรมจริง") },
  { value: "new_city", emoji: "🧳", label: t("New to Bangkok", "เพิ่งมาอยู่กรุงเทพฯ") },
  { value: "back", emoji: "🔄", label: t("Back to dating after a while", "กลับมาเดทอีกครั้ง") },
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

/** How Jurrgun answers each challenge, shown right after the questions. */
export const CHALLENGE_ANSWERS: Record<string, Text> = {
  swiping: t("No swiping here: small tables and one Bangkok Buddy at a time.", "ที่นี่ไม่มีการปัด มีแต่โต๊ะเล็ก ๆ และบัดดี้ทีละคน"),
  meet: t("Tables of 4 to 6 at real places, every week.", "โต๊ะละ 4 ถึง 6 คน ที่สถานที่จริง ทุกสัปดาห์"),
  time: t("Quests and tables near your district.", "เควสต์และโต๊ะใกล้ย่านของคุณ"),
  safety: t("Public places only, plus a safety net to share your plans.", "นัดในที่สาธารณะเท่านั้น และมีตัวช่วยแชร์แผนให้คนที่ไว้ใจ"),
  ghosting: t("No ghosting: every pairing ends kindly.", "ไม่ทิ้งเงียบ ทุกคู่ปิดอย่างเป็นมิตร"),
  fake: t("You meet in person first, in a group.", "เจอตัวจริงก่อน ในกลุ่ม"),
  language: t("Pick tables in your languages.", "เลือกโต๊ะตามภาษาที่คุณใช้"),
  nightlife: t("Daytime quests, cafés, parks and markets.", "เควสต์กลางวัน คาเฟ่ สวน ตลาด"),
  pressure: t("Romance only shows when it's mutual, and stays private.", "เรื่องหัวใจขึ้นเฉพาะเมื่อตรงกัน และเป็นความลับ"),
};

/** The dating safety net checklist (/safety). Short on purpose. */
export const SAFETY_TIPS: { emoji: string; text: Text }[] = [
  { emoji: "📍", text: t("Meet somewhere public and busy", "นัดในที่สาธารณะที่มีคน") },
  { emoji: "🚇", text: t("Get there and home on your own", "เดินทางไปและกลับเอง") },
  { emoji: "📲", text: t("Share your plan with someone you trust", "แชร์แผนให้คนที่ไว้ใจ") },
  { emoji: "🎥", text: t("Video call first if you haven't met", "วิดีโอคอลก่อน ถ้ายังไม่เคยเจอ") },
  { emoji: "🥤", text: t("Keep your drink and phone with you", "เก็บเครื่องดื่มและโทรศัพท์ไว้กับตัว") },
  { emoji: "💸", text: t("Never send money or codes", "ห้ามโอนเงินหรือให้รหัสใด ๆ") },
  { emoji: "🚪", text: t("Feel off? Leave. That's always OK", "รู้สึกไม่ดี ออกมาได้เลยเสมอ") },
];
