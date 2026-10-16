/**
 * Running late, to the host (owner, 2026-10-16). When a confirmed attendee
 * says they're running late on the day, the event's host gets one quiet
 * in-app notification with the attendee's first name, linking to the host
 * tools for that event. "On my way" sends nothing.
 *
 * One per attendee and event, ever: the row id is made from the kind, the
 * host, the attendee and the event (as the clock builds its ids), so an undo
 * and a second tap, or two taps at once, insert it once. Only the request
 * that inserted it pushes. The text never names the event (lock screens
 * never show event titles). Push follows the clock's rules: not when the
 * host said no to notifications, and not from 21:00 to 08:00 (the in-app
 * row is still there).
 */
import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "../db";
import type { Bindings } from "../lib/env";
import type { Lang } from "../lib/i18n";
import { sha256 } from "../lib/crypto";
import { consents, notifications } from "../schema";
import { quietHours } from "./clock";
import { pushToAccount } from "./push";

type Db = ReturnType<typeof getDb>;

export const KIND_ETA_LATE = "eta_late";

/** The same id for the same host, attendee and event, however many taps. */
export function etaLateNotificationId(hostId: string, attendeeId: string, eventId: string): Promise<string> {
  return sha256(`${KIND_ETA_LATE} ${hostId} ${attendeeId} ${eventId}`).then((h) => `eta_${h}`);
}

/** "{name} จะไปสายนิดหน่อย" / "{name} is running a little late". First name only, never the event. */
export function etaLateText(name: string | null, lang: Lang): string {
  const who = name?.trim() || null;
  if (lang === "en") return who ? `${who} is running a little late` : "Someone is running a little late";
  return who ? `${who} จะไปสายนิดหน่อย` : "มีคนจะไปสายนิดหน่อย";
}

/** Tells the host once. Returns true when this call wrote the notification. */
export async function notifyHostRunningLate(
  env: Bindings,
  db: Db,
  p: { eventId: string; hostId: string; attendeeId: string; firstName: string | null; hostLocale: string | null },
  now: Date = new Date(),
): Promise<boolean> {
  if (p.hostId === p.attendeeId) return false;
  const id = await etaLateNotificationId(p.hostId, p.attendeeId, p.eventId);
  const link = `/admin/events/${p.eventId}#day-of`;
  const inserted = await db
    .insert(notifications)
    .values({ id, accountId: p.hostId, kind: KIND_ETA_LATE, titleTh: etaLateText(p.firstName, "th"), titleEn: etaLateText(p.firstName, "en"), link })
    .onConflictDoNothing({ target: notifications.id })
    .returning({ id: notifications.id });
  if (!inserted.length) return false;
  if (quietHours(now)) return true;
  // The newest answer counts; no answer at all counts as yes, as for the clock.
  const [said] = await db
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, p.hostId), eq(consents.category, "notifications")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  if (said && !said.granted) return true;
  const lang: Lang = p.hostLocale === "en" ? "en" : "th";
  // The event is about to start or under way: an hour is long enough to matter.
  await pushToAccount(env, db, p.hostId, { title: "Jurrgun", body: etaLateText(p.firstName, lang), url: link, tag: `${KIND_ETA_LATE}:${p.eventId}` }, 3600);
  return true;
}
