/**
 * Host announcements (owner-approved 2026-10-17), like a "send a blast": the
 * event's host, or staff, tells the people going something in one short
 * message. Four kinds:
 *
 *   update     free text (required), no change to the event
 *   time       new start and end; the event's times change
 *   venue      new venue name, address and map link; the event's venue changes
 *   cancelled  the event is cancelled, every seat is released
 *
 * Who hears it ("Going + waitlist", the owner's choice): confirmed seats get
 * every kind; waitlisted and offered people only the three that change their
 * plans (time, venue, cancelled), never a plain update.
 *
 * A plain update is not urgent: it lands in the bell and waits for the
 * evening summary (notification kind "event_update"). The other three are
 * urgent ("event_changed", "event_cancelled") and push at once. Lock-screen
 * text never names the event, and never carries the host's message.
 *
 * Limits: at most ANNOUNCE_PER_DAY per event in any 24 hours, and the same
 * message not twice within ANNOUNCE_DUPLICATE_MINUTES.
 *
 * Pure: no database, no Hono.
 */
import { fmtDate, type Lang } from "../lib/i18n";

export const ANNOUNCEMENT_KINDS = ["update", "time", "venue", "cancelled"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];
export const isAnnouncementKind = (x: string): x is AnnouncementKind => (ANNOUNCEMENT_KINDS as readonly string[]).includes(x);

/** One short message. */
export const ANNOUNCE_MAX = 280;
/** At most this many announcements per event in any 24 hours. */
export const ANNOUNCE_PER_DAY = 5;
/** The same message again within this many minutes is refused. */
export const ANNOUNCE_DUPLICATE_MINUTES = 10;

/** Notification kinds. Only "event_update" is non-urgent (the evening summary picks it up). */
export const NOTIFY_KIND: Record<AnnouncementKind, string> = {
  update: "event_update",
  time: "event_changed",
  venue: "event_changed",
  cancelled: "event_cancelled",
};
export const isUrgent = (k: AnnouncementKind) => k !== "update";

/** Labels, Thai first. */
export const KIND_TEXT: Record<AnnouncementKind, { th: string; en: string; icon: "note" | "time" | "place" | "pause" }> = {
  update: { th: "อัปเดต", en: "Update", icon: "note" },
  time: { th: "เปลี่ยนเวลา", en: "Time changed", icon: "time" },
  venue: { th: "ย้ายสถานที่", en: "Venue moved", icon: "place" },
  cancelled: { th: "ยกเลิก", en: "Cancelled", icon: "pause" },
};

/** Registration statuses that hear about each kind. */
export function hearsAbout(status: string, kind: AnnouncementKind): boolean {
  if (status === "confirmed") return true;
  if (status === "offered" || status === "waitlisted") return kind !== "update";
  return false;
}

/** Registration statuses to read for a kind. */
export function recipientStatuses(kind: AnnouncementKind): string[] {
  return kind === "update" ? ["confirmed"] : ["confirmed", "offered", "waitlisted"];
}

export type Viewer = { id: string; role: string; partnerOrgId: string | null };

/**
 * The host (hostAccountId, or createdBy when there is no host), the
 * organiser (a partner admin of the event's organisation) and bma_admin.
 */
export function canAnnounce(e: { hostAccountId: string | null; createdBy: string; partnerOrgId: string | null }, v: Viewer): boolean {
  if (v.role === "bma_admin") return true;
  if ((e.hostAccountId ?? e.createdBy) === v.id) return true;
  return v.role === "partner_admin" && !!v.partnerOrgId && e.partnerOrgId === v.partnerOrgId;
}

/** One line, trimmed, at most ANNOUNCE_MAX characters. */
export function cleanBody(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, ANNOUNCE_MAX);
}

const sameText = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export type LimitRefusal = "too_many" | "duplicate";

/**
 * Checks the limits against this event's recent announcements (newest at
 * least 24 hours back). Null when it may go out.
 */
export function limitRefusal(recent: { body: string; createdAt: Date }[], body: string, now: Date): LimitRefusal | null {
  const t = now.getTime();
  if (recent.filter((r) => t - r.createdAt.getTime() < 86_400_000).length >= ANNOUNCE_PER_DAY) return "too_many";
  if (body && recent.some((r) => t - r.createdAt.getTime() < ANNOUNCE_DUPLICATE_MINUTES * 60_000 && sameText(r.body, body))) return "duplicate";
  return null;
}

const snippet = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The notification line, which is also what a lock screen shows for the
 * urgent kinds. Never the event title. A plain update carries the start of
 * the message (it is never pushed on its own; the evening summary only counts).
 */
export function notifyText(kind: AnnouncementKind, lang: Lang, x: { body: string; startsAt?: Date }): string {
  const en = lang === "en";
  switch (kind) {
    case "update":
      return en ? `New from your host: ${snippet(x.body)}` : `โฮสต์มีประกาศใหม่: ${snippet(x.body)}`;
    case "time": {
      const when = x.startsAt ? fmtDate(x.startsAt, lang) : null;
      if (en) return when ? `Your event has a new time: ${when}` : "Your event has a new time";
      return when ? `นัดของคุณเปลี่ยนเวลาเป็น ${when}` : "นัดของคุณเปลี่ยนเวลา";
    }
    case "venue":
      return en ? "Your event has moved to a new place. Tap to see where" : "นัดของคุณย้ายสถานที่ แตะเพื่อดูที่ใหม่";
    case "cancelled":
      return en ? "An event you signed up for was cancelled. Sorry for the change of plans" : "นัดที่คุณลงชื่อไว้ถูกยกเลิก ขอโทษที่ทำให้เปลี่ยนแผนนะ";
  }
}

/** Urgent pushes go at once, except in quiet hours for an event more than 12 hours away (the bell has it by morning). */
export function pushNow(quiet: boolean, startsAt: Date, now: Date): boolean {
  return !quiet || startsAt.getTime() - now.getTime() < 12 * 3_600_000;
}
