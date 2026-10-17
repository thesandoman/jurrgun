/**
 * Host announcements: writing one, and reading them back for the event page,
 * the pass and the host tools. The rules (kinds, who hears what, limits,
 * lock-screen text) live in src/domain/announcements.ts.
 *
 * One announcement is one batch: the row, the change to the event (new
 * times, new venue, or cancelled with every seat released), the audit row
 * (event and kind only, never the message) and the in-app notifications.
 * Urgent kinds then push to members who said yes to notifications.
 */
import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import type { getDb } from "../db";
import type { Bindings } from "../lib/env";
import type { Lang } from "../lib/i18n";
import { batchAll, keysetAll } from "../lib/bulk";
import { newId } from "../lib/crypto";
import { audit, notifyMany } from "../lib/records";
import { createLogger } from "../logger";
import { announcements, consents, events, profiles, registrations, type Announcement, type AnnouncementDetail, type Event } from "../schema";
import {
  isUrgent,
  limitRefusal,
  NOTIFY_KIND,
  notifyText,
  pushNow,
  recipientStatuses,
  type AnnouncementKind,
  type LimitRefusal,
} from "../domain/announcements";
import { quietHours } from "./clock";
import { pushToAccount } from "./push";

type Db = ReturnType<typeof getDb>;

/** Registrations that hold a seat or a waitlist place. */
export const HELD = ["confirmed", "offered", "waitlisted"];
/** Pushes sent inline per announcement; everyone still gets the in-app row. */
const PUSH_MAX = 300;

/**
 * Cancelling an event: the status, and every seat and waitlist place given
 * back (no strike, nothing for the member to do). Shared by the staff
 * cancel button and a Cancelled announcement.
 */
export function cancelWrites(db: Db, eventId: string, now: Date) {
  return [
    db.update(events).set({ status: "cancelled" }).where(eq(events.id, eventId)),
    db
      .update(registrations)
      .set({ status: "cancelled", cancelledAt: now, offeredUntil: null })
      .where(and(eq(registrations.eventId, eventId), inArray(registrations.status, HELD))),
  ];
}

export type AnnounceInput = {
  kind: AnnouncementKind;
  body: string;
  startsAt?: Date;
  endsAt?: Date;
  venueName?: string;
  venueAddress?: string;
  mapUrl?: string | null;
};

export type AnnounceResult = { ok: true; id: string; recipients: number; pushed: number } | { ok: false; reason: LimitRefusal | "closed" };

/** May this event still get an announcement? Published and not yet over. */
export const announceOpen = (e: Pick<Event, "status" | "endsAt">, now: Date) => e.status === "published" && now.getTime() < e.endsAt.getTime();

export async function postAnnouncement(
  env: Bindings,
  db: Db,
  e: Event,
  authorId: string,
  input: AnnounceInput,
  now: Date = new Date(),
  defer?: (p: Promise<unknown>) => void,
): Promise<AnnounceResult> {
  if (!announceOpen(e, now)) return { ok: false, reason: "closed" };
  const recent = await db
    .select({ body: announcements.body, createdAt: announcements.createdAt })
    .from(announcements)
    .where(and(eq(announcements.eventId, e.id), gt(announcements.createdAt, new Date(now.getTime() - 86_400_000))))
    .orderBy(desc(announcements.createdAt))
    .limit(50);
  const refused = limitRefusal(recent, input.body, now);
  if (refused) return { ok: false, reason: refused };

  const { kind } = input;
  const people = await keysetAll(registrations.id, (after, n) =>
    db
      .select({ id: registrations.id, accountId: registrations.accountId, locale: profiles.locale })
      .from(registrations)
      .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
      .where(and(eq(registrations.eventId, e.id), inArray(registrations.status, recipientStatuses(kind)), ne(registrations.accountId, authorId), after))
      .orderBy(asc(registrations.id))
      .limit(n),
  );

  let detail: AnnouncementDetail | null = null;
  const change = [];
  if (kind === "time" && input.startsAt && input.endsAt) {
    detail = { startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() };
    change.push(db.update(events).set({ startsAt: input.startsAt, endsAt: input.endsAt }).where(eq(events.id, e.id)));
  } else if (kind === "venue" && input.venueName) {
    detail = { venueName: input.venueName, venueAddress: input.venueAddress ?? "", mapUrl: input.mapUrl ?? null };
    // The old station and "how to find the table" describe the old place, so they go too.
    change.push(
      db
        .update(events)
        .set({ venueName: input.venueName, venueAddress: input.venueAddress ?? "", mapUrl: input.mapUrl ?? null, nearestStation: null, walkMinutes: null, venueNotes: null, venueNotesEn: null })
        .where(eq(events.id, e.id)),
    );
  } else if (kind === "cancelled") {
    change.push(...cancelWrites(db, e.id, now));
  }

  const id = newId();
  const startsAt = input.startsAt ?? e.startsAt;
  const text = { th: notifyText(kind, "th", { body: input.body, startsAt }), en: notifyText(kind, "en", { body: input.body, startsAt }) };
  await batchAll(env, [
    db.insert(announcements).values({ id, eventId: e.id, authorAccountId: authorId, kind, body: input.body, detail, createdAt: now }),
    ...change,
    // Event and kind only: the message itself never goes into the audit log.
    audit(db, authorId, "event.announce", { type: "event", id: e.id }, { kind, recipients: people.length }),
    ...notifyMany(db, people.map((p) => ({ accountId: p.accountId, ...text })), NOTIFY_KIND[kind], `/events/${e.id}`),
  ]);

  let pushed = 0;
  if (isUrgent(kind) && people.length && pushNow(quietHours(now), startsAt, now)) {
    const send = pushUrgent(env, db, e.id, kind, people, text).then((n) => (pushed = n));
    if (defer) defer(send.catch((err) => createLogger(env).warn("announcement push failed", { error: String(err) })));
    else await send;
  }
  return { ok: true, id, recipients: people.length, pushed };
}

/** Pushes the urgent line to members whose newest notifications answer is yes (no answer means no, privacy R7). */
async function pushUrgent(
  env: Bindings,
  db: Db,
  eventId: string,
  kind: AnnouncementKind,
  people: { accountId: string; locale: string | null }[],
  text: { th: string; en: string },
): Promise<number> {
  const ids = [...new Set(people.map((p) => p.accountId))].slice(0, PUSH_MAX);
  const said = await db
    .selectDistinctOn([consents.accountId], { accountId: consents.accountId, granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.category, "notifications"), inArray(consents.accountId, ids)))
    .orderBy(consents.accountId, desc(consents.createdAt))
    .limit(ids.length);
  const yes = new Set(said.filter((s) => s.granted).map((s) => s.accountId));
  const lang = new Map(people.map((p) => [p.accountId, (p.locale === "en" ? "en" : "th") as Lang]));
  let n = 0;
  for (const accountId of ids) {
    if (!yes.has(accountId)) continue;
    const body = lang.get(accountId) === "en" ? text.en : text.th;
    n += await pushToAccount(env, db, accountId, { title: "Jurrgun", body, url: `/events/${eventId}`, tag: `${NOTIFY_KIND[kind]}:${eventId}` }, 6 * 3600);
  }
  return n;
}

/** The newest announcements for an event, newest first. */
export function eventAnnouncements(db: Db, eventId: string, limit = 20): Promise<Announcement[]> {
  return db.select().from(announcements).where(eq(announcements.eventId, eventId)).orderBy(desc(announcements.createdAt)).limit(limit);
}
