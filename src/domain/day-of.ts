/**
 * Day-of status (owner-approved 10-16): on the day of a table, the host says
 * one thing about it (on time, running late, moved, called off) with a short
 * note, and an attendee with a confirmed seat can say they're running late or
 * on their way. Both only count inside the day-of window: from a few hours
 * before the start until the end. Anything set outside it is never shown, so
 * an old status can't leak onto a later date. Pure: no database, no Hono.
 */

export const DAY_STATUSES = ["on_time", "running_late", "moved", "cancelled"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const isDayStatus = (x: string): x is DayStatus => (DAY_STATUSES as readonly string[]).includes(x);

export const ETA_STATUSES = ["running_late", "on_my_way"] as const;
export type EtaStatus = (typeof ETA_STATUSES)[number];
export const isEtaStatus = (x: string): x is EtaStatus => (ETA_STATUSES as readonly string[]).includes(x);

/** The window opens this many hours before the start. */
export const DAY_OF_LEAD_HOURS = 3;
/** The host's note is short: one calm line. */
export const DAY_NOTE_MAX = 140;

const HOUR = 3_600_000;

export function dayOfOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - DAY_OF_LEAD_HOURS * HOUR);
}

/** Inside the day-of window: from DAY_OF_LEAD_HOURS before the start until the end. */
export function dayOfOpen(e: { startsAt: Date; endsAt: Date }, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= dayOfOpensAt(e.startsAt).getTime() && t < e.endsAt.getTime();
}

/** A status set at `at` is current when the window is open now and it was set inside this window. */
function current(e: { startsAt: Date; endsAt: Date }, at: Date | null | undefined, now: Date): boolean {
  return !!at && dayOfOpen(e, now) && at.getTime() >= dayOfOpensAt(e.startsAt).getTime() && at.getTime() < e.endsAt.getTime();
}

export type ShownStatus = { status: DayStatus; note: string | null; at: Date };

/** The host's status to show now, or null. */
export function shownDayStatus(
  e: { startsAt: Date; endsAt: Date; dayStatus: string | null; dayStatusNote: string | null; dayStatusAt: Date | null },
  now: Date = new Date(),
): ShownStatus | null {
  if (!e.dayStatus || !isDayStatus(e.dayStatus) || !current(e, e.dayStatusAt, now)) return null;
  return { status: e.dayStatus, note: e.dayStatusNote?.trim() || null, at: e.dayStatusAt! };
}

/** An attendee's running late / on my way to show now, or null. */
export function shownEta(e: { startsAt: Date; endsAt: Date }, r: { etaStatus: string | null; etaAt: Date | null }, now: Date = new Date()): EtaStatus | null {
  if (!r.etaStatus || !isEtaStatus(r.etaStatus) || !current(e, r.etaAt, now)) return null;
  return r.etaStatus;
}

/** What the host says, Thai first. Calm words: no alarm, no blame. */
export const DAY_STATUS_TEXT: Record<DayStatus, { th: string; en: string; icon: string }> = {
  on_time: { th: "ตรงเวลา เจอกันตามนัด", en: "On time. See you as planned", icon: "check" },
  running_late: { th: "เริ่มช้ากว่ากำหนดนิดหน่อย", en: "Starting a little late", icon: "time" },
  moved: { th: "ย้ายจุดนัดพบ", en: "The meeting point has moved", icon: "place" },
  cancelled: { th: "วันนี้งดก่อน", en: "Called off for today", icon: "pause" },
};

export const ETA_TEXT: Record<EtaStatus, { th: string; en: string }> = {
  running_late: { th: "ไปสายนิดหน่อย", en: "Running late" },
  on_my_way: { th: "กำลังไป", en: "On my way" },
};

/** Clean the host's note: one line, trimmed, at most DAY_NOTE_MAX characters; null when empty. */
export function cleanNote(raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim().slice(0, DAY_NOTE_MAX);
  return s || null;
}
