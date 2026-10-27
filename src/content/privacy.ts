/**
 * The facts behind the privacy notice (/privacy), the Terms (/terms), the
 * consent centre (/settings/consents) and "How we keep you safe" (/safety/how),
 * in one place so the pages and the tests read the same list.
 *
 * Owner rule (16 Oct 2026, design/reference/privacy-risk-assessment.md §7):
 * where the notice promises more than the code does, the code changes; where
 * the code does something reasonable the notice leaves out, the notice says so.
 * test/privacy-promises.test.ts checks each line here against the code.
 */
export type Text = { th: string; en: string };

/**
 * The date of the current privacy notice and Terms (one date for both). Change
 * it whenever either changes: the date at the top of both pages, the version on
 * every new consent row (CONSENT_VERSION in services/consent.ts) and the Terms
 * version members accept (TERMS_VERSION) all follow it, and members who
 * accepted an older version see the "updated Terms" card on Me.
 */
export const NOTICE_ISO = "2026-10-30";

/** Research & Data's per-code landing counter (owner-approved 2026-10-27): daily counts, no person, no IP, no cookie. */
export const CAMPAIGN_COUNT: Text = {
  th: "ลิงก์แคมเปญนับเป็นจำนวนต่อวัน โดยไม่เก็บข้อมูลใด ๆ ของคนที่เปิด",
  en: "Campaign links are counted per day, with nothing about the person who opened them.",
};
const CAMPAIGN_COUNT_CHANGE: Text = CAMPAIGN_COUNT;

/**
 * What changed since the version before, in plain words: shown once on the
 * "updated Terms" card on Me (owner, 2026-10-26: one calm card, no reminders).
 */
export const NOTICE_CHANGES: Text[] = [
  {
    th: "ใหม่: เกี่ยวก้อย · Pinky ถ้าคุณกับคนที่เคยเจอเลือกกันทั้งสองฝ่าย จะมีแผนนัดและแชตส่วนตัวของสองคน เมื่อคนใดคนหนึ่งจบ แผนและข้อความช่วงนั้นจะถูกลบ ทีมงานไม่เห็น",
    en: "New: เกี่ยวก้อย · Pinky. If you and someone you met both choose it, the two of you get a private shared plan and chat. When either of you ends it, the plan and the messages from that time are deleted. Staff never see it.",
  },
  {
    th: "รูปที่คุณอัปโหลด เราลบข้อมูลตำแหน่ง กล้อง และเวลาที่ถ่ายออกให้แล้ว รูปที่มีอยู่ก่อนหน้าก็ลบให้แล้วเช่นกัน",
    en: "We now remove location, camera and time details from every photo you upload, and did the same for photos already here.",
  },
  {
    th: "ฟอนต์อ่านง่ายในการตั้งค่าการเข้าถึงมาจากเราเองแล้ว ไม่ใช่ Google Fonts จึงไม่มีข้อมูลการเข้าเว็บส่งไปที่ Google",
    en: "The easier-to-read font now comes from us, not Google Fonts, so Google no longer sees your visit.",
  },
  {
    th: "หน้าอุปกรณ์ที่เข้าสู่ระบบใหม่ ดูได้ว่าเข้าสู่ระบบไว้ที่ไหน และออกจากระบบในเครื่องอื่นได้ เราเก็บแค่ประเภทอุปกรณ์และวันที่ ถ้าไม่ได้ใช้ 14 วัน จะออกจากระบบให้เอง",
    en: "A new Signed-in devices page shows where you're signed in and lets you sign out elsewhere. We keep only the kind of device and the dates. A device unused for 14 days is signed out by itself.",
  },
  CAMPAIGN_COUNT_CHANGE,
];

const MONTHS: [string, string][] = [
  ["มกราคม", "January"], ["กุมภาพันธ์", "February"], ["มีนาคม", "March"], ["เมษายน", "April"], ["พฤษภาคม", "May"], ["มิถุนายน", "June"],
  ["กรกฎาคม", "July"], ["สิงหาคม", "August"], ["กันยายน", "September"], ["ตุลาคม", "October"], ["พฤศจิกายน", "November"], ["ธันวาคม", "December"],
];

/** "2026-10-16" as "16 ตุลาคม 2569" / "16 October 2026" (Buddhist-era year in Thai). */
export function isoDateText(iso: string): Text {
  const [y, m, d] = iso.split("-").map(Number);
  return { th: `${d} ${MONTHS[m - 1][0]} ${y + 543}`, en: `${d} ${MONTHS[m - 1][1]} ${y}` };
}

/** Shown at the top of the notice and the Terms. */
export const NOTICE_DATE: Text = isoDateText(NOTICE_ISO);

/** The Terms version recorded on a "terms" consent row when a member accepts them. */
export const TERMS_VERSION = `terms-${NOTICE_ISO}`;

/** The consent category that records accepting the Terms (and reading the privacy notice). */
export const TERMS_CONSENT = "terms";

/**
 * How soon we aim to answer a member who asks us to look again at a warning,
 * strike or suspension (an ops commitment, quoted in the Terms).
 */
export const APPEAL_REPLY_DAYS = 7;

// ------------------------------------------------------------- periods --

export type Unit = "hours" | "days" | "months" | "years";
export type Period = { n: number; unit: Unit };

const UNIT: Record<Unit, [string, string, string]> = {
  hours: ["ชั่วโมง", "hour", "hours"],
  days: ["วัน", "day", "days"],
  months: ["เดือน", "month", "months"],
  years: ["ปี", "year", "years"],
};

/** "2 ปี" / "2 years". */
export function periodText(p: Period): Text {
  const [th, one, many] = UNIT[p.unit];
  return { th: `${p.n} ${th}`, en: `${p.n} ${p.n === 1 ? one : many}` };
}

/** The same period in the unit the code uses (hours stay hours, the rest become days). */
export function periodDays(p: Period): number {
  if (p.unit === "hours") return p.n;
  if (p.unit === "days") return p.n;
  if (p.unit === "years") return p.n * 365;
  return p.n % 12 === 0 ? (p.n / 12) * 365 : p.n * 30;
}

// ----------------------------------------------------------- retention --

/**
 * How long each kind of record is kept. `code` names the exported constant in
 * src/services/retention.ts (or the file in `from`) that enforces the period;
 * the test checks the two agree. Items without a period describe an event
 * ("deleted at once", "until you remove it").
 */
export type RetentionItem = { what: Text; keep: Text; period?: Period; code?: string | RegExp; from?: string };

export const RETENTION: RetentionItem[] = [
  {
    what: { th: "ข้อมูลเปิดใจมากกว่าเพื่อนและเป้าหมายการเดต", en: "Open to something more details and dating goals" },
    keep: { th: "ลบทันทีเมื่อกลับเป็นโหมดเพื่อน หรือถอนความยินยอม", en: "deleted at once when you switch back to friends only or withdraw consent" },
  },
  {
    what: { th: "เกี่ยวก้อย · Pinky: แผนนัด โน้ตที่เขียนร่วมกัน ใครกดพัก และข้อความที่ส่งช่วงเกี่ยวก้อย", en: "เกี่ยวก้อย · Pinky: the shared plan, the shared note, who paused it, and the messages sent while it lasted" },
    keep: {
      th: "ลบทันทีเมื่อคนใดคนหนึ่งจบหรือถอยออก ปิด 💘 บล็อก หรือปิดบัญชี แชตก่อนเกี่ยวก้อยยังอยู่ตามปกติ ถ้าคนใดคนหนึ่งมีรายงานที่ยังเปิดอยู่เกี่ยวกับอีกคน แชตช่วงเกี่ยวก้อยจะเก็บไว้จนกว่ารายงานจะปิด แล้วจึงลบ",
      en: "deleted at once when either of you ends it or steps back, turns 💘 off, blocks, or closes their account. Your chat from before the Pinky stays as usual. If either of you has an open report about the other, the Pinky chat is kept until the report closes, then deleted",
    },
  },
  {
    what: { th: "จำนวนไอเดียนัดที่เห็นวันนี้", en: "How many date ideas you were shown today" },
    keep: { th: "ลบในวันถัดไป", en: "deleted the next day" },
  },
  {
    what: { th: "การเกี่ยวก้อยหลังบัดดี้ที่อีกฝ่ายไม่ได้เลือก และเครื่องหมายกลับเป็นเพื่อนของคู่นั้น", en: "A Pinky tap after a buddy pairing that wasn't mutual, and that pairing's Back to friends marker" },
    keep: { th: "ลบหลังจบการจับคู่", en: "deleted after the pairing ends, within" },
    period: { n: 7, unit: "days" },
    code: "BUDDY_PINKY_DAYS",
    from: "domain/pinky",
  },
  {
    what: { th: "ตัวเลือกหลังกิจกรรมที่ไม่ตรงกัน", en: "Post-event choices that weren't mutual" },
    keep: { th: "ลบเมื่อครบ", en: "deleted after" },
    period: { n: 72, unit: "hours" },
    code: "PEOPLE_WINDOW_HOURS",
    from: "domain/rules",
  },
  {
    what: { th: "สัญญาณว่าอยากคุยเรื่องอะไรที่งาน", en: "What you'd like to talk about at an event" },
    keep: { th: "ลบหลังกิจกรรมจบ", en: "deleted after the event ends, within" },
    period: { n: 7, unit: "days" },
    code: "SIGNAL_RETENTION_DAYS",
  },
  {
    what: { th: "แชตและรูปในแชต", en: "Chats and chat photos" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 180, unit: "days" },
    code: "CHAT_RETENTION_DAYS",
  },
  {
    what: { th: "การถามว่าถึงบ้านปลอดภัยไหม", en: "\"Home safe?\" check-ins" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 180, unit: "days" },
    code: "CHAT_RETENTION_DAYS",
  },
  {
    what: { th: "รายละเอียดการเช็กอินและโต๊ะ", en: "Check-in and table details" },
    keep: { th: "เหลือแค่ยอดรวมหลัง", en: "kept only as totals after" },
    period: { n: 12, unit: "months" },
    code: "CHECKIN_RETENTION_DAYS",
  },
  {
    what: { th: "คำตอบ City Pulse และแบบสอบถามความรู้สึก", en: "City Pulse and wellbeing answers" },
    keep: { th: "เก็บโดยใช้รหัสแทนชื่อ ลบหลัง", en: "kept under a code, not your name, deleted after" },
    period: { n: 24, unit: "months" },
    code: "RESEARCH_RETENTION_DAYS",
  },
  {
    what: { th: "เช็กสถานที่หลังโต๊ะ และคำถามที่คุณเสนอให้ City Pulse", en: "After-table place checks and questions you suggest to City Pulse" },
    keep: { th: "เก็บกับสถานที่และเดือนเท่านั้น ไม่มีชื่อหรือรหัส คำที่คุณเสนอถูกลบเมื่อทีมดูแลจัดเป็นหัวข้อ ลบทั้งหมดหลัง", en: "kept with the place and month only, no name or code; your suggested words are deleted once a moderator sorts them into a topic; all deleted after" },
    period: { n: 24, unit: "months" },
    code: "RESEARCH_RETENTION_DAYS",
  },
  {
    what: { th: "คำถามที่คุณเสนอซึ่งยังไม่มีใครจัดหัวข้อ", en: "Suggested questions no moderator has sorted yet" },
    keep: { th: "ลบทั้งข้อความและรายการ เมื่อเดือนที่ส่งผ่านไปแล้ว", en: "the words and the entry are deleted once the month you sent it in has been over for" },
    period: { n: 60, unit: "days" },
    code: "SUGGESTION_RETENTION_DAYS",
  },
  {
    what: { th: "การแจ้งเตือนที่อ่านแล้ว", en: "Notifications you've read" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 90, unit: "days" },
    code: "READ_NOTIFICATION_RETENTION_DAYS",
  },
  {
    what: { th: "การแจ้งเตือนที่ยังไม่ได้อ่าน", en: "Notifications you haven't read" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 1, unit: "years" },
    code: "UNREAD_NOTIFICATION_RETENTION_DAYS",
  },
  {
    what: { th: "ประกาศจากโฮสต์ถึงคนที่มา", en: "Host announcements to people going" },
    keep: { th: "ลบหลังจบกิจกรรม", en: "deleted after the event ends, after" },
    period: { n: 180, unit: "days" },
    code: "ANNOUNCEMENT_RETENTION_DAYS",
  },
  {
    what: { th: "รายงาน การดำเนินการของทีมงาน และใบเตือน", en: "Reports, moderation actions and strikes" },
    keep: { th: "เก็บเพื่อความปลอดภัย ลบหลัง", en: "kept for safety, deleted after" },
    period: { n: 2, unit: "years" },
    code: /^(REPORTS?|MODERATION|SAFETY)_.*DAYS$/,
  },
  {
    what: { th: "บันทึกการทำงานของระบบ", en: "The system's audit log" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 2, unit: "years" },
    code: /^AUDIT_.*DAYS$/,
  },
  {
    what: { th: "การเข้าสู่ระบบในเครื่อง", en: "Signed-in sessions" },
    keep: { th: "หมดอายุหลัง", en: "expire after" },
    period: { n: 30, unit: "days" },
    code: "SESSION_DAYS",
    from: "lib/session",
  },
  {
    what: { th: "การเข้าสู่ระบบที่ไม่ได้ใช้ 14 วัน", en: "Signed-in sessions unused for 14 days" },
    keep: { th: "ออกจากระบบและลบเอง", en: "end and are deleted by themselves" },
  },
  {
    what: { th: "ความพยายามเข้าสู่ระบบและรหัสทางอีเมล", en: "Sign-in attempts and email codes" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 24, unit: "hours" },
    // The email codes' own constant; the sign-in attempts' LOGIN_ATTEMPT_RETENTION_HOURS is tested equal to it.
    code: "CODE_RETENTION_HOURS",
    from: "services/email-code",
  },
  {
    what: { th: "คนรู้จัก ช่องทางติดต่อที่แชร์ และลิงก์โซเชียล", en: "Connections, shared contacts and social links" },
    keep: {
      th: "จนกว่าคุณหรืออีกฝ่ายจะลบหรือบล็อก หรือปิดบัญชี ช่องทางติดต่อที่แชร์จะถูกลบทันทีเมื่อเลิกเป็นคนรู้จักหรือมีการบล็อก",
      en: "until you or the other person removes them or blocks, or an account is closed. Shared contacts are deleted at once when the connection is removed or either of you blocks",
    },
  },
  {
    what: { th: "ข้อความที่คุณเขียนตอนปิดบัญชี", en: "The note you write when you leave" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 1, unit: "years" },
    code: "EXIT_NOTE_RETENTION_DAYS",
  },
  {
    what: { th: "บัญชีที่ปิดแล้ว", en: "Closed accounts" },
    keep: {
      th: "ซ่อนโปรไฟล์ ลบรูป ลิงก์โซเชียล คำตอบ City Pulse และแบบสอบถามความรู้สึก และการเข้าสู่ระบบด้วย Google LINE หรืออีเมลทันที ส่วนการเข้าร่วมกิจกรรมและคะแนนความพึงพอใจยังเก็บไว้เพื่อนับยอดรวม โดยลบชื่อและรายละเอียดของคุณออก แล้วลบข้อมูลที่เหลือหลัง",
      en: "profile hidden, and photos, social links, City Pulse and wellbeing answers and Google, LINE or email sign-in removed at once; event attendance and ratings stay, with your name and details removed, for totals; the rest is deleted after",
    },
    period: { n: 30, unit: "days" },
    code: "DEACTIVATED_RETENTION_DAYS",
  },
];

/** Said once under the list. */
export const RETENTION_NOTES: Text[] = [
  { th: "ระบบลบข้อมูลตามรายการนี้ทุกวัน", en: "Our clean-up runs every day." },
  {
    th: "ถ้ามีรายงานเรื่องบัญชีที่ยังตรวจไม่เสร็จ เราจะเก็บบัญชีนั้นไว้จนกว่าจะตรวจเสร็จ",
    en: "If a report about an account is still open, we keep that account until the report is closed.",
  },
  {
    th: "ถ้ามีคนรายงานข้อความหรือรูปในแชต เราเก็บสำเนาไว้กับรายงานเฉพาะสิ่งที่ถูกรายงาน ไม่ใช่ทั้งแชต ข้อความเก็บตามระยะเวลาของรายงาน ส่วนรูปเก็บไว้จนกว่าจะปิดรายงาน",
    en: "If someone reports a chat message or photo, we keep a copy of just that item with the report, never the whole chat. Text is kept as long as the report; a photo only until the report is closed.",
  },
  {
    th: "เหตุผลที่ออก (ถ้าบอกเรา) เก็บโดยไม่มีชื่อบัญชี จึงโยงกลับมาหาคุณไม่ได้ เหตุผลที่เลือกไว้เก็บเป็นยอดรวม ส่วนข้อความที่เขียนเองลบหลัง 1 ปี",
    en: "Reasons for leaving, if you give them, are kept without your account, so they can't be linked back to you. The reasons you pick stay as totals; a note you write is deleted after 1 year.",
  },
];

// -------------------------------------------------------------- cookies --

/** Every cookie the app sets. test/privacy-promises.test.ts greps setCookie calls against this list. */
export type CookieItem = { name: string; what: Text; life: Text };

export const COOKIES: CookieItem[] = [
  { name: "bkk_sid", what: { th: "ให้คุณเข้าสู่ระบบค้างไว้", en: "Keeps you signed in" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "lang", what: { th: "ภาษาที่คุณเลือก", en: "Your language" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "jg_src", what: { th: "ลิงก์แคมเปญหรือพาร์ตเนอร์ที่พาคุณมา", en: "The campaign or partner link that brought you" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_oauth", what: { th: "ระหว่างเข้าสู่ระบบด้วย Google หรือ LINE", en: "While you sign in with Google or LINE" }, life: { th: "10 นาที", en: "10 minutes" } },
  { name: "bkk_invite", what: { th: "ลิงก์ชวนจากเพื่อน จนกว่าคุณจะสมัครเสร็จ", en: "A friend's invite link, until you finish signing up" }, life: { th: "7 วัน", en: "7 days" } },
  { name: "bkk_intent", what: { th: "สิ่งที่คุณเลือกในหน้าต้อนรับ (เพื่อน หรือเปิดใจมากกว่าเพื่อน)", en: "Your choice on the welcome screen (friends, or open to more)" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_dating_pending", what: { th: "คำตอบเรื่องเดตตอนสมัคร เก็บไว้ในเครื่องคุณจนกว่าจะยินยอม ถ้าไม่ยินยอมจะถูกลบ", en: "Your sign-up dating answers, kept on your device until you consent; dropped if you don't" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_quiz_skip", what: { th: "จำว่าคุณข้ามแบบทดสอบไว้ก่อน", en: "Remembers you skipped the quiz for now" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "jg_new", what: { th: "จำว่าคุณเพิ่งย้ายมากรุงเทพฯ", en: "Remembers you're new to Bangkok" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "jg_intl", what: { th: "จำว่าคุณมาจากต่างประเทศ", en: "Remembers you're from abroad" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_quiz_hint", what: { th: "ซ่อนคำแนะนำให้ทำแบบทดสอบ", en: "Hides the quiz hint" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "bkk_for_you", what: { th: "ซ่อนแถบแนะนำสำหรับคุณ", en: "Hides the For you strip" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "bkk_pev_", what: { th: "เปิดกิจกรรมส่วนตัวจากลิงก์ที่ได้รับ (หนึ่งคุกกี้ต่อกิจกรรม)", en: "Opens a private event from its link (one per event)" }, life: { th: "60 วัน", en: "60 days" } },
];

/** Kept only in this browser (localStorage); never sent to us. */
export const DEVICE_STORAGE: CookieItem[] = [
  { name: "bkk-a11y", what: { th: "ขนาดตัวอักษร ธีมสว่างหรือมืด และการตั้งค่าการเข้าถึง", en: "Text size, light or dark theme and accessibility settings" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
  { name: "bkk-discover", what: { th: "มุมมองแผนที่หรือรายการที่เลือกไว้", en: "Your map or list view" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
  { name: "bkk-map-style", what: { th: "แบบแผนที่", en: "Your map style" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
  { name: "bkk-key-pos", what: { th: "ตำแหน่งกล่องคำอธิบายบนแผนที่", en: "Where you moved the map key" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
];

// ------------------------------------------------------- who else -----

/**
 * Outside services. `for_us`: they work for us, on our instructions, and see
 * only what that work needs. `own`: their own services, which you or your
 * browser use directly, under their own privacy policies.
 * test/privacy-promises.test.ts checks every outside address in the code has one.
 */
export type Processor = { name: string; group: "for_us" | "own"; does: Text; sees: Text };

export const PROCESSOR_GROUPS: { key: Processor["group"]; title: Text }[] = [
  { key: "for_us", title: { th: "ทำงานให้เรา", en: "Work for us" } },
  { key: "own", title: { th: "บริการของเขาเอง ภายใต้นโยบายของเขา", en: "Their own services, under their own policies" } },
];

export const PROCESSORS: Processor[] = [
  {
    name: "SV Cloud · Cloudflare",
    group: "for_us",
    does: { th: "โฮสต์แอป ฐานข้อมูล และไฟล์ (เช่น รูป)", en: "Host the app, its database and files such as photos" },
    sees: { th: "ข้อมูลทั้งหมดที่แอปเก็บ ในฐานะผู้ให้บริการของเรา", en: "Everything the app stores, as our service providers" },
  },
  {
    name: "Resend · Postmark",
    group: "for_us",
    does: { th: "ส่งรหัสเข้าสู่ระบบทางอีเมล เมื่อเปิดใช้", en: "Send sign-in codes by email, once switched on" },
    sees: { th: "อีเมลของคุณและรหัส ตอนส่ง", en: "Your email address and the code, when one is sent" },
  },
  {
    name: "Google · Apple · Mozilla · Microsoft",
    group: "for_us",
    does: { th: "ส่งการแจ้งเตือนไปที่มือถือหรือเบราว์เซอร์ ถ้าคุณเปิด", en: "Deliver notifications to your phone or browser, if you turn them on" },
    sees: { th: "ที่อยู่สำหรับส่งของเครื่องคุณ ข้อความถูกเข้ารหัส อ่านไม่ได้", en: "Your device's push address. Messages are encrypted, so they can't read them" },
  },
  {
    name: "Google · LINE",
    group: "own",
    does: { th: "ให้เข้าสู่ระบบ ถ้าคุณเลือกใช้ และแชร์ลงใน LINE เมื่อคุณแตะ", en: "Sign-in, if you choose it, and sharing to LINE when you tap it" },
    sees: { th: "ว่าคุณใช้ Jurrgun เราขอแค่รหัสบัญชี ไม่ขออีเมลหรือรายชื่อเพื่อน และสิ่งที่คุณเลือกแชร์", en: "That you use Jurrgun (we only ask for an account ID, never your email or friends), and whatever you choose to share" },
  },
  {
    name: "Esri · OpenStreetMap · jsDelivr",
    group: "own",
    does: { th: "ภาพแผนที่และโค้ดแผนที่", en: "Map images and the map's code" },
    sees: { th: "IP ของคุณและบริเวณแผนที่ที่เปิด", en: "Your IP address and the map area you view" },
  },
  {
    name: "Google Maps",
    group: "own",
    does: { th: "เส้นทางไปสถานที่ เมื่อคุณแตะลิงก์", en: "Directions, when you tap a map link" },
    sees: { th: "สิ่งที่คุณทำใน Google Maps ตามนโยบายของ Google", en: "What you do in Google Maps, under Google's own policy" },
  },
  {
    name: "Open-Meteo",
    group: "own",
    does: { th: "สภาพอากาศและฝุ่นในกรุงเทพฯ", en: "Bangkok weather and air quality" },
    sees: { th: "ไม่มีข้อมูลของคุณ เซิร์ฟเวอร์เราขอข้อมูลของกรุงเทพฯ เอง", en: "Nothing about you. Our server asks for Bangkok's weather" },
  },
];

/** PDPA section 28: data may leave Thailand. */
export const TRANSFERS: Text = {
  th: "ข้อมูลอาจถูกส่งหรือเก็บนอกประเทศไทย เครือข่ายของ Cloudflare มีเซิร์ฟเวอร์ทั่วโลก ส่วนผู้ส่งอีเมล ผู้ส่งการแจ้งเตือน และ Esri อยู่ในสหรัฐอเมริกา เราใช้บริการเหล่านี้ภายใต้ข้อตกลงคุ้มครองข้อมูลมาตรฐานของแต่ละราย และส่งเฉพาะข้อมูลที่จำเป็น",
  en: "Data may be sent to or stored outside Thailand. Cloudflare's network has servers around the world, and the email senders, push services and Esri are based in the United States. We use them under each provider's standard data protection terms, and send only what's needed.",
};

// -------------------------------------------------------------- contact --

/** Owner, 16 Oct 2026: the BMA's public contact, as host and overseer. */
export const CONTACT_ADDRESS: Text = {
  th: "กรุงเทพมหานคร (ผู้ดูแลและกำกับบริการ) ศาลาว่าการกรุงเทพมหานคร 173 ถนนดินสอ แขวงเสาชิงช้า เขตพระนคร กรุงเทพฯ 10200 · สายด่วน 1555",
  en: "Bangkok Metropolitan Administration (host and overseer of this service), Bangkok City Hall, 173 Dinso Road, Sao Chingcha, Phra Nakhon, Bangkok 10200 · Hotline 1555",
};

/**
 * Privacy requests go to the data controller, the Jurrgun team (owner, 16 Oct 2026), not to the BMA,
 * which stays the general host contact (CONTACT_ADDRESS). The address is a clearly marked placeholder
 * on the reserved .example domain until the owner gives the real one: swap PRIVACY_EMAIL then.
 */
export const PRIVACY_EMAIL = "privacy@jurrgun.example";
export const PRIVACY_EMAIL_IS_PLACEHOLDER = true;
export const PRIVACY_CONTACT: Text = {
  th: `ติดต่อเรื่องข้อมูลส่วนตัว: ทีม Jurrgun ที่ ${PRIVACY_EMAIL}${PRIVACY_EMAIL_IS_PLACEHOLDER ? " (ที่อยู่อีเมลชั่วคราว ที่อยู่จริงจะแจ้งเร็ว ๆ นี้)" : ""}`,
  en: `Privacy contact: the Jurrgun team at ${PRIVACY_EMAIL}${PRIVACY_EMAIL_IS_PLACEHOLDER ? " (placeholder address, the real one is coming soon)" : ""}`,
};

/** The in-app route for a problem with a person or an event. */
export const REPORT_LINE: Text = {
  th: "ถ้าเป็นเรื่องของสมาชิกหรือกิจกรรม กดรายงานในโปรไฟล์ของคนนั้น หรือในหน้ากิจกรรม ทีมงานจะเห็นทันที",
  en: "For a problem with a member or an event, tap Report on their profile or the event page. Our team sees it straight away.",
};

// ------------------------------------------------------------- consents --

/**
 * Every consent category the app records (social_consents.category). The
 * consent centre lists all of them; test/privacy-promises.test.ts fails if the
 * code writes a category that is missing here.
 *
 *   required   needed to run the app, so not a consent: explained, never a
 *              switch. The row onboarding writes is an acknowledgement, kept
 *              for history. Ends only by closing the account.
 *   toggle     switched on and off on the consent centre
 *   withdraw   given where the data is entered (`href`), withdrawn here too
 *   record     a one-off agreement, shown with its date
 *
 * `withdraw` is the one-line consequence of switching a consent off.
 */
export type ConsentCategory = {
  key: string;
  control: "required" | "toggle" | "withdraw" | "record";
  title: Text;
  hint: Text;
  withdraw?: Text;
  href?: string;
  sensitive?: boolean;
};

/** The heading over the service and safety rows, in onboarding and the consent centre. */
export const NOT_A_CONSENT: Text = { th: "จำเป็นต่อการให้บริการ (ไม่ใช่การขอความยินยอม)", en: "Needed to run the app (not a consent)" };

/** The research consent, as onboarding and the consent centre word it. */
export const RESEARCH_TITLE: Text = { th: "City Pulse: ช่วยวิจัยเมือง", en: "City Pulse: city research" };
export const RESEARCH_HINT: Text = {
  th: "คำถามสั้น ๆ เรื่องเมือง และคำถามเรื่องความรู้สึก เช่น ความเหงา เก็บโดยใช้รหัสแทนชื่อ กทม. เห็นแค่ยอดรวมจาก 10 คนขึ้นไป",
  en: "Quick city questions and wellbeing questions, such as how lonely you feel, kept under a code, not your name. The BMA only sees totals from 10 or more people.",
};

export const CONSENT_CATEGORIES: ConsentCategory[] = [
  {
    key: "service",
    control: "required",
    title: { th: "บัญชีและบริการกิจกรรม", en: "Account and events" },
    hint: { th: "ใช้ทำให้แอปทำงาน เช่น จัดโต๊ะ แชต และเช็กอิน ตามข้อกำหนดการใช้งาน จบเมื่อปิดบัญชี", en: "Used to run the app: tables, chat and check-in, under the Terms of service. Ends when you close your account." },
  },
  {
    key: "safety",
    control: "required",
    title: { th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation" },
    hint: { th: "ใช้ตรวจรายงานและกันการคุกคาม เพื่อความปลอดภัยของทุกคน", en: "Used to review reports and stop harassment, to keep everyone safe." },
  },
  {
    key: "personalization",
    control: "toggle",
    title: { th: "จัดโต๊ะตามความสนใจ", en: "Seat me by my interests" },
    hint: { th: "ใช้ความสนใจ สไตล์ มหาวิทยาลัย และไทป์กรุงเทพฯ ของคุณช่วยจัดโต๊ะและจับคู่บัดดี้", en: "Uses your interests, styles, university and Bangkok Type to help seat you and pair your buddy." },
    // What loadAttendees (services/events.ts) and canPair (match/profile.ts) still read without it.
    withdraw: {
      th: "ถ้าปิด เราจัดโต๊ะจากภาษา อายุและช่วงอายุที่คุณเลือก สิ่งที่คุณมองหา คนที่คุณบล็อก คนที่เคยเจอกันในงานก่อน และการเป็นคนใหม่ในกรุงเทพฯ เท่านั้น ไม่ใช้ความสนใจ สไตล์ มหาวิทยาลัย หรือไทป์กรุงเทพฯ ของคุณ",
      en: "If you turn it off, we seat you only by your languages, your age and the age range you chose, what you're looking for, who you've blocked, who you've met at earlier events, and whether you're new to Bangkok. Your interests, styles, university and Bangkok Type aren't used.",
    },
  },
  {
    key: "research",
    control: "toggle",
    title: RESEARCH_TITLE,
    hint: RESEARCH_HINT,
    // Owner C3 (26 Oct 2026): place checks and suggestions carry no name or code, so withdrawal can't reach them.
    withdraw: {
      th: "ถ้าปิด เราลบคำตอบ City Pulse และแบบสอบถามเดิมของคุณ และจะไม่ถามคำถามเหล่านี้อีก เช็กสถานที่และคำถามที่คุณเสนอไม่มีชื่อหรือรหัสติดไว้ เราจึงหาของคุณเพื่อลบไม่ได้ ระบบจะลบเองตามกำหนด",
      en: "If you turn it off, we delete your past City Pulse and wellbeing answers and stop asking these questions. Place checks and suggested questions have no name or code on them, so we can't find yours to delete. They're deleted on schedule.",
    },
  },
  {
    key: "notifications",
    control: "toggle",
    title: { th: "แจ้งเตือนกิจกรรม", en: "Event reminders" },
    hint: {
      th: "เตือนก่อนกิจกรรมและเมื่อมีที่ว่าง และหากคุณเปิดไว้ จะมีข้อความสัปดาห์ละครั้งเมื่อมีกิจกรรมเปิดในเขตของคุณ",
      en: "Reminders before events and when a spot opens, and, if you turn it on, a weekly note when something opens in your district.",
    },
    withdraw: { th: "ถ้าปิด เราจะไม่ส่งการเตือนเหล่านี้", en: "If you turn it off, we don't send these reminders." },
  },
  {
    key: "profile_links",
    control: "toggle",
    title: { th: "ให้คนรู้จักเห็นลิงก์โซเชียล", en: "Show my social links to my people" },
    hint: { th: "เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย เพิ่มหรือลบลิงก์ได้ที่แก้ไขโปรไฟล์", en: "Only mutual connections see them. Add or remove links in Edit profile." },
    withdraw: { th: "ถ้าปิด คนรู้จักจะไม่เห็นลิงก์ของคุณ ลิงก์ยังเก็บไว้จนกว่าคุณจะลบ", en: "If you turn it off, your people stop seeing your links. They stay saved until you remove them." },
  },
  {
    key: "relationship_data",
    control: "withdraw",
    href: "/settings/connections",
    sensitive: true,
    title: { th: "สถานะความสัมพันธ์", en: "Relationship status" },
    hint: { th: "ส่วนตัว ทีมงานไม่เห็น ใช้กับเรื่องเปิดใจมากกว่าเพื่อนเท่านั้น", en: "Private, never shown to staff. Used only for Open to something more." },
    withdraw: { th: "ถ้าถอน สถานะจะกลับเป็นไม่ระบุ และคุณจะเปิดใจมากกว่าเพื่อนไม่ได้", en: "If you withdraw it, your status goes back to Prefer not to say, and you can't use Open to something more." },
  },
  {
    key: "gender_data",
    control: "withdraw",
    href: "/settings/connections",
    sensitive: true,
    title: { th: "เพศ (ส่วนตัว)", en: "Gender (private)" },
    hint: { th: "ใช้กับโต๊ะและบัดดี้สำหรับผู้หญิงเท่านั้น ไม่แสดงให้ใครเห็น", en: "Used for women-only tables and buddies. Never shown to anyone." },
    withdraw: { th: "ถ้าถอนเรื่องเพศ เราลบเพศที่บอกไว้ และคุณจะเลือกโต๊ะสำหรับผู้หญิงไม่ได้", en: "If you withdraw gender, we clear it, and you can't choose women-only tables." },
  },
  {
    key: "romance_data",
    control: "withdraw",
    href: "/settings/connections",
    sensitive: true,
    title: { th: "ข้อมูลเปิดใจมากกว่าเพื่อน", en: "Open to something more data" },
    hint: { th: "อัตลักษณ์ทางเพศ คนที่อยากเจอ และเป้าหมายการเดต", en: "Gender identity, who you'd like to meet and dating goals." },
    withdraw: { th: "ถ้าถอน เราลบข้อมูลนี้ทันที และปิดเปิดใจมากกว่าเพื่อน", en: "If you withdraw it, we delete it at once and switch off Open to something more." },
  },
  {
    key: TERMS_CONSENT,
    control: "record",
    title: { th: "ข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว", en: "Terms of service and privacy notice" },
    hint: { th: "บันทึกว่าคุณยอมรับข้อกำหนดการใช้งานและรับทราบนโยบายความเป็นส่วนตัว", en: "A record that you agreed to the Terms of service and read the privacy notice." },
  },
  {
    key: "guide",
    control: "record",
    title: { th: "สัญญาในคู่มือเริ่มต้น", en: "Your promise in the first-time guide" },
    hint: { th: "บันทึกว่าคุณรับหลักปฏิบัติของชุมชนแล้ว", en: "A record that you agreed to the code of conduct." },
  },
];
