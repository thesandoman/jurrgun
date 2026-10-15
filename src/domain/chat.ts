/**
 * Chat with limits. Pure rules, no database: who may write, how much, and
 * what a message may hold. Routes in src/routes/chat.tsx apply them.
 *
 * The aim is a conversation that leads to meeting, not endless texting:
 *  - short messages, a daily cap per thread and overall;
 *  - before the first meet: no links, phone numbers or social handles (share
 *    contacts through the mutual flow instead) and a small message budget;
 *  - money requests are delivered with a scam warning for the receiver;
 *  - after enough messages without meeting, a nudge to plan a meet;
 *  - no read receipts, typing indicators or online status;
 *  - quiet hours: messages still send, the notification waits until morning.
 */

export const MAX_CHARS = 500;
export const PER_THREAD_PER_DAY = 40;
export const PER_DAY_TOTAL = 120;
/** Messages each person may send before the first meet. */
export const BEFORE_MEET_BUDGET = 25;
/** Messages in a thread with no meet yet before the "plan a meet" nudge. */
export const NUDGE_AFTER = 30;
/** A circle hangout's thread stays open this long after it ends. */
export const HANGOUT_OPEN_DAYS = 7;
/** Bangkok quiet hours, local time. */
export const QUIET_FROM = 23;
export const QUIET_TO = 7;

export type ThreadKind = "buddy" | "conn" | "circle" | "table";
/** Group threads: a hangout's chat, or a regular table's. Photos and polls work in these. */
export const isGroupKind = (k: ThreadKind) => k === "circle" || k === "table";
export type ThreadKey = { kind: ThreadKind; ref: string };

export function parseThread(key: string): ThreadKey | null {
  const m = /^(buddy|conn|circle|table):([A-Za-z0-9_-]{1,80})$/.exec(key);
  return m ? { kind: m[1] as ThreadKind, ref: m[2] } : null;
}
export const threadKey = (t: ThreadKey) => `${t.kind}:${t.ref}`;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|co|me|io|ly|th|link|app|xyz)\b/i;
// Thai and international phone numbers: 9+ digits, allowing spaces, dots and dashes.
const PHONE_RE = /(?:\+?\d[\s.-]?){9,}/;
const HANDLE_RE = /(?:^|\s)@[a-z0-9_.]{3,}|\b(?:line\s*id|ไลน์ไอดี|ไอดีไลน์|ig|instagram|ไอจี)\s*[:：]?\s*[a-z0-9_.@-]{3,}/i;
const MONEY_RE = /โอน(?:เงิน)?|ยืมเงิน|ขอเงิน|ส่งเงิน|พร้อมเพย์|promptpay|transfer|wire|lend me|borrow money|send (?:me )?money|bank account|เลขบัญชี|crypto|usdt|bitcoin|gift ?card/i;

export type CheckResult =
  | { ok: true; body: string; moneyFlag: boolean }
  | { ok: false; reason: "empty" | "too_long" | "contact_before_meet" | "budget" | "thread_cap" | "day_cap" | "closed" };

/**
 * May this message be sent? `counts` are the sender's messages today in this
 * thread and overall, and their total in this thread so far.
 */
export function checkMessage(
  raw: string,
  ctx: { met: boolean; open: boolean; sentToday: number; sentTodayAll: number; sentInThread: number },
): CheckResult {
  if (!ctx.open) return { ok: false, reason: "closed" };
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body) return { ok: false, reason: "empty" };
  if (body.length > MAX_CHARS) return { ok: false, reason: "too_long" };
  if (ctx.sentToday >= PER_THREAD_PER_DAY) return { ok: false, reason: "thread_cap" };
  if (ctx.sentTodayAll >= PER_DAY_TOTAL) return { ok: false, reason: "day_cap" };
  if (!ctx.met) {
    if (ctx.sentInThread >= BEFORE_MEET_BUDGET) return { ok: false, reason: "budget" };
    if (URL_RE.test(body) || PHONE_RE.test(body) || HANDLE_RE.test(body)) return { ok: false, reason: "contact_before_meet" };
  }
  return { ok: true, body, moneyFlag: MONEY_RE.test(body) };
}

/** Show the "plan a meet instead?" nudge. */
export const shouldNudge = (met: boolean, threadTotal: number) => !met && threadTotal >= NUDGE_AFTER;

/**
 * When a notification about a message should appear: now, or at the end of
 * quiet hours (07:00 Bangkok) when it's sent between 23:00 and 07:00.
 */
export function notifyAt(now: Date): Date {
  const local = new Date(now.getTime() + 7 * 3600_000);
  const h = local.getUTCHours();
  if (h >= QUIET_FROM || h < QUIET_TO) {
    const morning = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), QUIET_TO, 0, 0));
    if (h >= QUIET_FROM) morning.setUTCDate(morning.getUTCDate() + 1);
    return new Date(morning.getTime() - 7 * 3600_000);
  }
  return now;
}

export const REASON_TEXT: Record<Exclude<CheckResult, { ok: true }>["reason"], { th: string; en: string }> = {
  empty: { th: "พิมพ์ข้อความก่อนนะ", en: "Write a message first." },
  too_long: { th: `ข้อความยาวได้ไม่เกิน ${MAX_CHARS} ตัวอักษร`, en: `Messages can be up to ${MAX_CHARS} characters.` },
  contact_before_meet: {
    th: "ยังไม่ได้เจอกัน เลยยังส่งลิงก์ เบอร์ หรือไอดีไม่ได้ อยากแลกช่องทางติดต่อ ใช้ปุ่มแชร์ช่องทางติดต่อเมื่อพร้อมทั้งสองคน",
    en: "You haven't met yet, so links, numbers and handles wait. When you both want to, use Share contact.",
  },
  budget: {
    th: `ก่อนเจอกันส่งได้คนละ ${BEFORE_MEET_BUDGET} ข้อความ นัดเจอกันเลยดีกว่า`,
    en: `Before you meet, each of you can send ${BEFORE_MEET_BUDGET} messages. Time to plan a meet!`,
  },
  thread_cap: { th: "วันนี้คุยในห้องนี้พอแล้ว พรุ่งนี้ค่อยคุยต่อนะ", en: "That's enough for this chat today. Pick it up tomorrow." },
  day_cap: { th: "วันนี้ส่งข้อความครบแล้ว พักสายตาหน่อยนะ", en: "You've hit today's message limit. Time for a screen break." },
  closed: { th: "ห้องแชตนี้ปิดแล้ว", en: "This chat has closed." },
};

// ------------------------------------------------------- circle extras --
// Group chats for a circle hangout get two more things: photos from the day
// and quick polls ("which Sunday?"). Both stay inside the circle.

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Photos each person may share in one circle chat per day. */
export const PHOTOS_PER_DAY = 10;
export const POLL_MIN = 2;
export const POLL_MAX = 4;
export const POLL_Q_MAX = 120;
export const POLL_OPT_MAX = 60;

/**
 * Photos are for circles only, and only once the hangout has started: they
 * are photos from the day, not a way to share images with strangers.
 */
export function checkPhoto(
  file: { type: string; size: number } | null,
  ctx: { kind: ThreadKind; met: boolean; open: boolean; sentToday: number },
): { ok: true } | { ok: false; reason: "closed" | "not_circle" | "not_yet" | "type" | "size" | "photo_cap" } {
  if (!ctx.open) return { ok: false, reason: "closed" };
  if (!isGroupKind(ctx.kind)) return { ok: false, reason: "not_circle" };
  if (!ctx.met) return { ok: false, reason: "not_yet" };
  if (!file || !(PHOTO_TYPES as readonly string[]).includes(file.type)) return { ok: false, reason: "type" };
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) return { ok: false, reason: "size" };
  if (ctx.sentToday >= PHOTOS_PER_DAY) return { ok: false, reason: "photo_cap" };
  return { ok: true };
}

/** A poll: a short question and 2 to 4 distinct options. */
export function checkPoll(
  question: string,
  options: string[],
  ctx: { kind: ThreadKind; open: boolean },
): { ok: true; question: string; options: string[] } | { ok: false; reason: "closed" | "not_circle" | "question" | "options" } {
  if (!ctx.open) return { ok: false, reason: "closed" };
  if (!isGroupKind(ctx.kind)) return { ok: false, reason: "not_circle" };
  const q = question.replace(/\s+/g, " ").trim();
  if (!q || q.length > POLL_Q_MAX) return { ok: false, reason: "question" };
  const opts = [...new Set(options.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (opts.length < POLL_MIN || opts.length > POLL_MAX || opts.some((o) => o.length > POLL_OPT_MAX)) return { ok: false, reason: "options" };
  return { ok: true, question: q, options: opts };
}

/** Votes per option (index), from one row per voter. */
export function tally(optionCount: number, votes: { option: number }[]): number[] {
  const out = new Array(optionCount).fill(0);
  for (const v of votes) if (v.option >= 0 && v.option < optionCount) out[v.option]++;
  return out;
}

export const EXTRA_TEXT: Record<string, { th: string; en: string }> = {
  closed: { th: "ห้องแชตนี้ปิดแล้ว", en: "This chat has closed." },
  not_circle: { th: "รูปและโพลใช้ได้ในแชตโต๊ะประจำเท่านั้น", en: "Photos and polls are for regular table chats." },
  not_yet: { th: "แชร์รูปได้เมื่อแฮงเอาต์เริ่มแล้ว", en: "You can share photos once the hangout has started." },
  type: { th: "รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP", en: "Photos must be JPG, PNG or WebP." },
  size: { th: "รูปต้องมีขนาดไม่เกิน 5 MB", en: "Photos must be 5 MB or smaller." },
  photo_cap: { th: `วันนี้แชร์รูปในแชตนี้ครบ ${PHOTOS_PER_DAY} รูปแล้ว`, en: `That's ${PHOTOS_PER_DAY} photos in this chat today.` },
  question: { th: `คำถามยาวได้ไม่เกิน ${POLL_Q_MAX} ตัวอักษร`, en: `Questions can be up to ${POLL_Q_MAX} characters.` },
  options: { th: `ใส่ตัวเลือก ${POLL_MIN} ถึง ${POLL_MAX} ข้อ ไม่ซ้ำกัน`, en: `Add ${POLL_MIN} to ${POLL_MAX} different options.` },
};
