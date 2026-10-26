/**
 * The hourly clock (owner card, 2026-10-16). SV Cloud has no cron, so one
 * scheduled task named "clock" on the object "clock:app" books the next hour
 * first, then does the work (SVAGENTS.md §5.4):
 *
 *   retention      at most once a day (src/services/retention.ts)
 *   day before     confirmed seats at events starting in 18 to 30 hours
 *   same day       confirmed seats that never got the day-before reminder
 *                  (booked too late for it): about 3 hours before the start,
 *                  or, when that falls in quiet hours, at the last allowed
 *                  hour before the start (sameDayDue)
 *   window open    checked-in members of events that ended 1 to 14 hours ago,
 *                  while the 72-hour People I Met window is open
 *   feeds          outside calendar feeds into the host inbox, each at most
 *                  once a day (src/services/outside-events.ts)
 *   summary        once a day from 18:00: one push per member counting the
 *                  day's unread non-urgent notifications (src/domain/digest.ts)
 *   district alert members who opted in to "Tell me when an event opens in
 *                  my district", at most once a week (runDistrictAlerts);
 *                  non-urgent, so the phone hears about it in the summary
 *
 * Messages are in-app notifications, plus Web Push for members who turned it
 * on. Nothing is sent from 21:00 to 08:00 Bangkok time: the windows above are
 * wide enough that a held message goes out at 08:00. Each message is sent
 * once per member and event, and a seat gets the day-before or the same-day
 * reminder, never both. The notification row is the record, and its id is
 * made from the kind, member and link, so two runs at once (a task that
 * arrives twice) insert it once and only the run that inserted it pushes.
 * Members who said no to event reminders get none of these.
 *
 * An admin starts and stops the chain from /admin. Locally there are no
 * stateful objects; tests call runClock directly.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import type { Bindings } from "../lib/env";
import { fmtParts, type Lang } from "../lib/i18n";
import { sha256 } from "../lib/crypto";
import { createLogger } from "../logger";
import { OPEN_TO_MORE_TAG, PEOPLE_WINDOW_HOURS, ageOn, isPaused, romanceEventOk, womenOnlyEventOk } from "../domain/rules";
import { DIGEST_HOUR, DIGEST_KINDS, KIND_DIGEST, digestText, isDigest } from "../domain/digest";
import { DISTRICT_ALERT_DAYS, DISTRICT_ALERT_ON, KIND_DISTRICT_ALERT, PUBLISH_ACTIONS, alertCutoff, alertLink, alertText, districtName, publishedAt } from "../domain/district-alert";
import { accounts, auditLog, blocks, consents, events, notifications, profiles, registrations, type Event } from "../schema";
import { getStatefulObject } from "../state";
import { pushToAccount } from "./push";
import { retentionIfDue } from "./retention";
import { readDueFeeds } from "./outside-events";
import { consentsFor, NOTIFICATIONS_CONSENT } from "./consent";
import { listableBase } from "./events";

const HOUR = 3_600_000;
export const CLOCK_TASK = "clock";
const CLOCK_OBJECT = "clock:app";
const BATCH = 500;

export const KIND_TOMORROW = "event_tomorrow";
export const KIND_TODAY = "event_today";
export const KIND_WINDOW = "people_window";
/** The same-day reminder aims for this long before the start. */
export const SAME_DAY_LEAD_MS = 3 * HOUR;
/** Below this, the day-before reminder's window (18 to 30 hours) has passed. */
const DAY_BEFORE_MIN_MS = 18 * HOUR;

export type ClockRun = { retention: boolean; quiet: boolean; feeds: number; tomorrow: number; today: number; windowOpen: number; digest: number; districtAlert: number; pushed: number };

/** The next hourly slot after `firedAt`, skipping any that already passed. */
export function nextSlot(firedAt: number, now: number): number {
  let next = firedAt + HOUR;
  while (next <= now) next += HOUR;
  return next;
}

/** The hour of the day in Bangkok, 0 to 23. */
export function bangkokHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Bangkok" }).format(now));
}

/** 21:00 to 07:59 in Bangkok: hold messages until morning. */
export function quietHours(now: Date): boolean {
  const h = bangkokHour(now);
  return h >= 21 || h < 8;
}

/**
 * Should the hourly run at `now` send the same-day reminder for a table at
 * `startsAt`? Yes once the table is 3 hours away or less. Earlier than that
 * only when no later hourly run before the start is outside quiet hours:
 * then this is the last allowed chance (a table at 00:30 is reminded at
 * 20:00; one at 09:00 waits for 08:00). Never in quiet hours, never after
 * the start.
 */
export function sameDayDue(startsAt: Date, now: Date): boolean {
  const start = startsAt.getTime();
  const left = start - now.getTime();
  if (left <= 0 || left >= DAY_BEFORE_MIN_MS || quietHours(now)) return false;
  if (left <= SAME_DAY_LEAD_MS) return true;
  for (let at = now.getTime() + HOUR; at < start; at += HOUR) if (!quietHours(new Date(at))) return false;
  return true;
}

export async function startClock(env: Bindings, now: Date = new Date()): Promise<number> {
  const obj = await getStatefulObject(env, CLOCK_OBJECT);
  await obj.cancelTasks(CLOCK_TASK); // never two chains
  const next = Math.ceil((now.getTime() + 1) / HOUR) * HOUR;
  await obj.scheduleTask(CLOCK_TASK, next, { secret: env.TASK_WEBHOOK_SECRET, data: {} });
  await obj.put("next", next);
  return next;
}

export async function stopClock(env: Bindings): Promise<void> {
  const obj = await getStatefulObject(env, CLOCK_OBJECT);
  await obj.cancelTasks(CLOCK_TASK);
  await obj.delete("next");
}

/** When the clock fires next, or null when it is stopped (or not deployed). */
export async function clockNext(env: Bindings): Promise<number | null> {
  try {
    const obj = await getStatefulObject(env, CLOCK_OBJECT);
    const next = await obj.get("next");
    return typeof next === "number" ? next : null;
  } catch {
    return null;
  }
}

/** The webhook's handler: book the next hour FIRST, then work, so one failure never ends the chain. */
export async function onClockTask(env: Bindings, firedAt: number): Promise<ClockRun | null> {
  const obj = await getStatefulObject(env, CLOCK_OBJECT);
  const next = nextSlot(firedAt, Date.now());
  await obj.scheduleTask(CLOCK_TASK, next, { secret: env.TASK_WEBHOOK_SECRET, data: {} });
  await obj.put("next", next);
  try {
    return await runClock(env, new Date());
  } catch (err) {
    createLogger(env).error("clock run failed", { error: String(err) });
    return null;
  }
}

type Due = { accountId: string; locale: string; event: Event };

/** Active accounts, plus suspended ones whose suspension has ended (as accountUsable in src/lib/session.ts). */
function usable(now: Date) {
  return or(eq(accounts.status, "active"), and(eq(accounts.status, "suspended"), lt(accounts.suspendedUntil, now)));
}

export async function runClock(env: Bindings, now: Date = new Date()): Promise<ClockRun> {
  const out: ClockRun = { retention: false, quiet: false, feeds: 0, tomorrow: 0, today: 0, windowOpen: 0, digest: 0, districtAlert: 0, pushed: 0 };
  const before = await retentionIfDue(env, "system", now);
  out.retention = !!before && before.at.getTime() === now.getTime();
  // Outside calendar feeds into the host inbox, each at most once a day (D46). Quiet hours don't matter: nobody is messaged.
  out.feeds = await readDueFeeds(env, now);
  if (quietHours(now)) {
    out.quiet = true;
    return out;
  }
  const db = getDb(env);
  const t = now.getTime();

  // Day before: confirmed seats at events starting 18 to 30 hours from now.
  const tomorrow = await db
    .select({ accountId: registrations.accountId, locale: profiles.locale, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .innerJoin(accounts, eq(accounts.id, registrations.accountId))
    .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
    .where(
      and(
        eq(events.status, "published"),
        eq(registrations.status, "confirmed"),
        usable(now),
        gte(events.startsAt, new Date(t + 18 * HOUR)),
        lt(events.startsAt, new Date(t + 30 * HOUR)),
      ),
    )
    .limit(BATCH);
  const sentTomorrow = await sendOnce(env, KIND_TOMORROW, tomorrow, (d) => `/me/events/${d.event.id}/pass`, (d, lang) => tomorrowText(d.event, lang, now), 12 * 3600);
  out.tomorrow = sentTomorrow.sent;
  out.pushed += sentTomorrow.pushed;

  // Same day: confirmed seats starting within 18 hours, when this run is the
  // one sameDayDue picks. A seat that had the day-before reminder is skipped
  // in sendOnce (it runs after the day-before send, so this run's count too).
  const soon = await db
    .select({ accountId: registrations.accountId, locale: profiles.locale, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .innerJoin(accounts, eq(accounts.id, registrations.accountId))
    .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
    .where(
      and(
        eq(events.status, "published"),
        eq(registrations.status, "confirmed"),
        usable(now),
        gt(events.startsAt, now),
        lt(events.startsAt, new Date(t + DAY_BEFORE_MIN_MS)),
      ),
    )
    .limit(BATCH);
  const sentToday = await sendOnce(
    env,
    KIND_TODAY,
    soon.filter((d) => sameDayDue(d.event.startsAt, now)),
    (d) => `/me/events/${d.event.id}/pass`,
    (d, lang) => tomorrowText(d.event, lang, now),
    3 * 3600,
    [KIND_TOMORROW],
  );
  out.today = sentToday.sent;
  out.pushed += sentToday.pushed;

  // Window open: people who checked in to an event that ended 1 to 14 hours ago.
  const ended = await db
    .select({ accountId: registrations.accountId, locale: profiles.locale, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .innerJoin(accounts, eq(accounts.id, registrations.accountId))
    .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
    .where(
      and(
        eq(events.status, "published"),
        isNotNull(registrations.checkedInAt),
        usable(now),
        gte(events.endsAt, new Date(t - 14 * HOUR)),
        lt(events.endsAt, new Date(t - HOUR)),
      ),
    )
    .limit(BATCH);
  const sentWindow = await sendOnce(env, KIND_WINDOW, ended, (d) => `/events/${d.event.id}/people`, (d, lang) => windowText(d.event, lang, now), 24 * 3600);
  out.windowOpen = sentWindow.sent;
  out.pushed += sentWindow.pushed;

  // Before the summary, so an alert written at 18:00 is in that evening's push.
  out.districtAlert = await runDistrictAlerts(env, now);

  const summary = await runDigest(env, now);
  out.digest = summary.sent;
  out.pushed += summary.pushed;
  return out;
}

/** The Bangkok calendar date, "2026-10-17". */
function bangkokDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * The evening summary (src/domain/digest.ts), at the first run from 18:00
 * Bangkok (runClock has already returned in quiet hours). For each member who
 * said yes to notifications and has unread non-urgent rows written since
 * their last summary (at most 24 hours back), it writes one marker row of
 * kind "digest" (already read, never listed in the bell) and pushes one
 * message with the counts. The marker's id is made from the member and the
 * Bangkok date, so two runs at once insert it once and only that run pushes:
 * no schema change. Rows stay unread in the bell either way.
 */
export async function runDigest(env: Bindings, now: Date): Promise<{ sent: number; pushed: number }> {
  if (quietHours(now) || bangkokHour(now) < DIGEST_HOUR) return { sent: 0, pushed: 0 };
  const db = getDb(env);
  const t = now.getTime();
  const rows = await db
    .select({ accountId: notifications.accountId, kind: notifications.kind, link: notifications.link, createdAt: notifications.createdAt, locale: profiles.locale })
    .from(notifications)
    .innerJoin(accounts, eq(accounts.id, notifications.accountId))
    .innerJoin(profiles, eq(profiles.accountId, notifications.accountId))
    .where(
      and(
        inArray(notifications.kind, Object.keys(DIGEST_KINDS)),
        isNull(notifications.readAt),
        gt(notifications.createdAt, new Date(t - 24 * HOUR)),
        lte(notifications.createdAt, now),
        usable(now),
      ),
    )
    .limit(BATCH * 20);
  const due = rows.filter((r) => isDigest(r.kind, r.link));
  if (!due.length) return { sent: 0, pushed: 0 };
  const ids = [...new Set(due.map((r) => r.accountId))];
  const [said, last] = await Promise.all([
    db
      .selectDistinctOn([consents.accountId], { accountId: consents.accountId, granted: consents.granted })
      .from(consents)
      .where(and(eq(consents.category, "notifications"), inArray(consents.accountId, ids)))
      .orderBy(consents.accountId, desc(consents.createdAt))
      .limit(ids.length),
    // Each member's last summary in the past two days: rows before it were already counted.
    db
      .selectDistinctOn([notifications.accountId], { accountId: notifications.accountId, createdAt: notifications.createdAt })
      .from(notifications)
      .where(and(eq(notifications.kind, KIND_DIGEST), inArray(notifications.accountId, ids), gt(notifications.createdAt, new Date(t - 48 * HOUR))))
      .orderBy(notifications.accountId, desc(notifications.createdAt))
      .limit(ids.length),
  ]);
  // Only a yes counts: no answer at all means no (privacy R7).
  const optedIn = new Set(said.filter((c) => c.granted).map((c) => c.accountId));
  const since = new Map(last.map((r) => [r.accountId, r.createdAt.getTime()]));
  const byMember = new Map<string, { locale: string; kinds: string[] }>();
  for (const r of due) {
    if (!optedIn.has(r.accountId) || r.createdAt.getTime() <= (since.get(r.accountId) ?? 0)) continue;
    const m = byMember.get(r.accountId) ?? { locale: r.locale, kinds: [] };
    m.kinds.push(r.kind);
    byMember.set(r.accountId, m);
  }
  if (!byMember.size) return { sent: 0, pushed: 0 };
  const date = bangkokDate(now);
  const todo = await Promise.all(
    [...byMember].map(async ([accountId, m]) => ({
      row: {
        id: `dig_${await sha256(`digest ${accountId} ${date}`)}`,
        accountId,
        kind: KIND_DIGEST,
        titleTh: digestText(m.kinds, "th"),
        titleEn: digestText(m.kinds, "en"),
        link: "/notifications",
        createdAt: now,
        readAt: now,
      },
      lang: (m.locale === "en" ? "en" : "th") as Lang,
    })),
  );
  const inserted = new Set<string>();
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH).map((x) => x.row);
    for (const r of await db.insert(notifications).values(part).onConflictDoNothing({ target: notifications.id }).returning({ id: notifications.id })) inserted.add(r.id);
  }
  let pushed = 0;
  for (const x of todo.filter((x) => inserted.has(x.row.id))) {
    pushed += await pushToAccount(env, db, x.row.accountId, { title: "Jurrgun", body: x.lang === "en" ? x.row.titleEn : x.row.titleTh, url: "/notifications", tag: `${KIND_DIGEST}:${date}` }, 3 * 3600);
  }
  return { sent: inserted.size, pushed };
}

/**
 * The empty-district alert (owner card 7, src/domain/district-alert.ts), on
 * every hourly run outside quiet hours. Due: usable members (as `usable`)
 * who opted in, are not on a break, whose newest notifications answer is
 * yes, and whose last alert was 7 or more days ago (or never). Each gets ONE
 * in-app row when an event in their own district went public after their
 * last alert (or after they opted in, when that is later or there was no
 * alert yet).
 *
 * The events are Discover's own (listableBase: published, public, not over,
 * no open co-host invite) that have not started, minus private talks (D52,
 * never in a public feed). Per member, the same rules as the event page and
 * RSVP: dating events only with 💘 on (romanceEventOk), women-only events
 * only for women and non-binary members (womenOnlyEventOk), the member's age
 * inside the event's range, nothing hosted by someone either side blocked
 * (as a Regular Table is hidden, tableVisible), and never their own event.
 *
 * When an event went public: social_events has no published_at, and the
 * "event.publish" audit row only covers the admin Publish button, so the
 * job takes the latest of created_at and the publishing audit rows
 * (publishedAt in the domain module).
 *
 * The row is non-urgent: no push of its own, the evening summary says
 * "มีกิจกรรมใหม่ในเขตของคุณ / something new in your district" and never names
 * the event. Its id comes from clockNotificationId with a link carrying the
 * Bangkok date, so a duplicate task inserts it once; district_alert_last_sent_at
 * is then set for everyone due, so the next run skips them for a week.
 */
export async function runDistrictAlerts(env: Bindings, now: Date): Promise<number> {
  if (quietHours(now)) return 0;
  const db = getDb(env);
  const weekAgo = new Date(now.getTime() - DISTRICT_ALERT_DAYS * 24 * HOUR);
  let sent = 0;
  let after = "";
  // Page through everyone due, so members whose district is still empty (they stay due) never crowd out the rest.
  for (let pageNo = 0; pageNo < DISTRICT_ALERT_PAGES; pageNo++) {
    const members = await db
      .select({
        accountId: profiles.accountId,
        locale: profiles.locale,
        district: profiles.district,
        birthDate: profiles.birthDate,
        relationship: profiles.relationship,
        romanceOn: profiles.romanceOn,
        gender: profiles.gender,
        pausedUntil: profiles.pausedUntil,
        lastSentAt: profiles.districtAlertLastSentAt,
      })
      .from(profiles)
      .innerJoin(accounts, eq(accounts.id, profiles.accountId))
      .where(
        and(
          eq(profiles.districtAlertOptIn, true),
          usable(now),
          or(isNull(profiles.districtAlertLastSentAt), lte(profiles.districtAlertLastSentAt, weekAgo)),
          // The newest notifications answer is yes (no row means no); checked again per batch below.
          sql`(select ${consents.granted} from ${consents} where ${consents.accountId} = ${profiles.accountId} and ${consents.category} = ${NOTIFICATIONS_CONSENT} order by ${consents.createdAt} desc limit 1) = true`,
          gt(profiles.accountId, after),
        ),
      )
      .orderBy(asc(profiles.accountId))
      .limit(BATCH);
    sent += await districtAlertBatch(env, members, now);
    if (members.length < BATCH) break;
    after = members[members.length - 1].accountId;
  }
  return sent;
}

/** At most this many pages of BATCH members per hourly run. */
const DISTRICT_ALERT_PAGES = 20;

type AlertMember = {
  accountId: string;
  locale: string;
  district: string;
  birthDate: string;
  relationship: string;
  romanceOn: boolean;
  gender: string | null;
  pausedUntil: Date | null;
  lastSentAt: Date | null;
};

async function districtAlertBatch(env: Bindings, members: AlertMember[], now: Date): Promise<number> {
  const db = getDb(env);
  const named = members.filter((m) => districtName(m.district, "en") && !isPaused(m, now));
  if (!named.length) return 0;
  const ids = named.map((m) => m.accountId);
  const [said, optIns] = await Promise.all([
    // The newest notifications answer per member: only a yes counts (privacy R7).
    consentsFor(db, ids, NOTIFICATIONS_CONSENT),
    db
      .selectDistinctOn([auditLog.actor], { actor: auditLog.actor, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.action, DISTRICT_ALERT_ON), inArray(auditLog.actor, ids)))
      .orderBy(auditLog.actor, desc(auditLog.createdAt))
      .limit(ids.length),
  ]);
  const optedInAt = new Map(optIns.map((r) => [r.actor, r.createdAt]));
  const asked = named.flatMap((m) => {
    // No opt-in row left (audit rows are kept for 730 days) and no alert yet: the past week counts.
    const cutoff = said.has(m.accountId) ? (alertCutoff(m.lastSentAt, optedInAt.get(m.accountId) ?? null) ?? new Date(now.getTime() - DISTRICT_ALERT_DAYS * 24 * HOUR)) : null;
    return cutoff ? [{ ...m, cutoff }] : [];
  });
  if (!asked.length) return 0;
  const list = await db
    .select()
    .from(events)
    .where(and(...listableBase(now), gt(events.startsAt, now), eq(events.talkMode, false), inArray(events.district, [...new Set(asked.map((m) => m.district))])))
    .orderBy(asc(events.startsAt))
    .limit(BATCH);
  if (!list.length) return 0;
  const hostOf = (e: Event) => e.hostAccountId ?? e.createdBy;
  const askedIds = asked.map((m) => m.accountId);
  const hosts = [...new Set(list.map(hostOf))];
  const since = new Date(Math.min(...asked.map((m) => m.cutoff.getTime())));
  const [audits, blockRows] = await Promise.all([
    db
      .select({ targetId: auditLog.targetId, action: auditLog.action, detail: auditLog.detail, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, "event"), inArray(auditLog.action, [...PUBLISH_ACTIONS]), inArray(auditLog.targetId, list.map((e) => e.id)), gt(auditLog.createdAt, since)))
      .limit(list.length * 20),
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(and(inArray(blocks.blocker, askedIds), inArray(blocks.blocked, hosts)), and(inArray(blocks.blocked, askedIds), inArray(blocks.blocker, hosts))))
      .limit(5000),
  ]);
  const auditsOf = new Map<string, typeof audits>();
  for (const a of audits) if (a.targetId) auditsOf.set(a.targetId, [...(auditsOf.get(a.targetId) ?? []), a]);
  const wentPublic = new Map(list.map((e) => [e.id, publishedAt(e.createdAt, auditsOf.get(e.id) ?? []).getTime()]));
  const blocked = new Set(blockRows.flatMap((b) => [`${b.blocker} ${b.blocked}`, `${b.blocked} ${b.blocker}`]));
  const due: Due[] = [];
  for (const m of asked) {
    const age = ageOn(m.birthDate, now);
    const event = list.find(
      (e) =>
        e.district === m.district &&
        wentPublic.get(e.id)! > m.cutoff.getTime() &&
        wentPublic.get(e.id)! <= now.getTime() &&
        romanceEventOk(e.tags, m) &&
        womenOnlyEventOk(e.tags, m) &&
        e.ageMin <= age &&
        age <= e.ageMax &&
        hostOf(e) !== m.accountId &&
        !blocked.has(`${m.accountId} ${hostOf(e)}`),
    );
    if (event) due.push({ accountId: m.accountId, locale: m.locale, event });
  }
  if (!due.length) return 0;
  const date = bangkokDate(now);
  const sent = await sendOnce(env, KIND_DISTRICT_ALERT, due, (d) => alertLink(d.event.district, date), (d, lang) => alertText(d.event.district, lang), null);
  // Everyone due has their alert now (this run's, or a racing run's with the same id): the week starts here.
  await db
    .update(profiles)
    .set({ districtAlertLastSentAt: now })
    .where(inArray(profiles.accountId, due.map((d) => d.accountId)));
  return sent.sent;
}

/**
 * The notification id for one message: the same kind, member and link always
 * give the same id, so a second run inserting it at the same moment hits the
 * primary key and inserts nothing (no schema change, no lock to hold).
 */
export function clockNotificationId(kind: string, accountId: string, link: string): Promise<string> {
  return sha256(`clock ${kind} ${accountId} ${link}`).then((h) => `clk_${h}`);
}

/**
 * Writes one notification per (member, link) that has none of this kind (or
 * of the `blockedBy` kinds) yet, and pushes only the ones this call inserted.
 * A null `ttl` pushes nothing: a non-urgent kind reaches the phone in the
 * evening summary instead (runDigest).
 */
async function sendOnce(
  env: Bindings,
  kind: string,
  due: Due[],
  linkOf: (d: Due) => string,
  textOf: (d: Due, lang: Lang) => string,
  ttl: number | null,
  blockedBy: string[] = [],
): Promise<{ sent: number; pushed: number }> {
  if (!due.length) return { sent: 0, pushed: 0 };
  const db = getDb(env);
  const ids = [...new Set(due.map((d) => d.accountId))];
  // Exactly the (member, link) pairs that are due. Matching ids and links
  // separately also returns other pairs, which could push a real one past the limit.
  const pairs = sql.join(
    due.map((d) => sql`(${d.accountId}, ${linkOf(d)})`),
    sql`, `,
  );
  const [already, said] = await Promise.all([
    db
      .select({ accountId: notifications.accountId, link: notifications.link })
      .from(notifications)
      .where(and(inArray(notifications.kind, [kind, ...blockedBy]), sql`(${notifications.accountId}, ${notifications.link}) in (${pairs})`))
      .limit(due.length * (2 + blockedBy.length)),
    // The newest answer per member, however many times anyone saved their consents.
    db
      .selectDistinctOn([consents.accountId], { accountId: consents.accountId, granted: consents.granted })
      .from(consents)
      .where(and(eq(consents.category, "notifications"), inArray(consents.accountId, ids)))
      .orderBy(consents.accountId, desc(consents.createdAt))
      .limit(ids.length),
  ]);
  const done = new Set(already.map((r) => `${r.accountId} ${r.link}`));
  // Only a yes counts: no answer at all means no (privacy R7).
  const optedIn = new Set(said.filter((c) => c.granted).map((c) => c.accountId));
  const todo = due.filter((d) => optedIn.has(d.accountId) && !done.has(`${d.accountId} ${linkOf(d)}`));
  if (!todo.length) return { sent: 0, pushed: 0 };
  const rows = await Promise.all(
    todo.map(async (d) => ({ id: await clockNotificationId(kind, d.accountId, linkOf(d)), accountId: d.accountId, kind, titleTh: textOf(d, "th"), titleEn: textOf(d, "en"), link: linkOf(d) })),
  );
  // Only rows this run actually inserted are pushed: a run racing this one gets nothing back for them.
  const inserted = new Set(
    (await db.insert(notifications).values(rows).onConflictDoNothing({ target: notifications.id }).returning({ id: notifications.id })).map((r) => r.id),
  );
  const mineToSend = todo.filter((_, i) => inserted.has(rows[i].id));
  let pushed = 0;
  if (ttl === null) return { sent: mineToSend.length, pushed: 0 };
  for (const d of mineToSend) {
    const lang: Lang = d.locale === "en" ? "en" : "th";
    pushed += await pushToAccount(env, db, d.accountId, { title: "Jurrgun", body: textOf(d, lang), url: linkOf(d), tag: `${kind}:${d.event.id}` }, ttl);
  }
  return { sent: mineToSend.length, pushed };
}

/** Event titles stay off lock screens for Open to something more events. */
function shownTitle(e: Event, lang: Lang): string | null {
  if (e.tags.includes(OPEN_TO_MORE_TAG)) return null;
  return lang === "en" && e.titleEn ? e.titleEn : e.title;
}

/** Bangkok calendar days from `now` to `at` (0 today, 1 tomorrow). */
export function bangkokDaysApart(now: Date, at: Date): number {
  const day = (d: Date) => {
    const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
    return Date.UTC(y, m - 1, dd) / 86_400_000;
  };
  return day(at) - day(now);
}

/**
 * The reminder's text, for the day-before and the same-day reminder. It says
 * "today" or "tomorrow" only when the event really is on that date in
 * Bangkok. A table just after midnight can be reminded the evening two days
 * before (quiet hours hold the later slots), so that one names the weekday.
 */
export function tomorrowText(e: Event, lang: Lang, now: Date): string {
  const time = fmtParts(e.startsAt, lang).time;
  const name = shownTitle(e, lang);
  const days = bangkokDaysApart(now, e.startsAt);
  const weekday = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { weekday: "long", timeZone: "Asia/Bangkok" }).format(e.startsAt);
  if (lang === "en") {
    const day = days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${weekday}`;
    const when = days === 0 ? `Today at ${time}` : days === 1 ? `Tomorrow at ${time}` : `${weekday} at ${time}`;
    return name ? `${when}: ${name}, at ${e.venueName}. Your pass is ready.` : `You have a table ${day} at ${time}. Your pass is ready.`;
  }
  const when = days === 0 ? `วันนี้ ${time}` : days === 1 ? `พรุ่งนี้ ${time}` : `${weekday} ${time}`;
  return name ? `${when} ${name} ที่ ${e.venueName} บัตรเข้างานพร้อมแล้ว` : `${when} คุณมีนัดที่โต๊ะ บัตรเข้างานพร้อมแล้ว`;
}

export function windowText(e: Event, lang: Lang, now: Date): string {
  const left = Math.max(1, Math.floor((e.endsAt.getTime() + PEOPLE_WINDOW_HOURS * HOUR - now.getTime()) / HOUR));
  const name = shownTitle(e, lang);
  if (lang === "en") return name ? `Who would you like to meet again from ${name}? You have ${left} hours to choose.` : `Who would you like to meet again? You have ${left} hours to choose.`;
  return name ? `อยากเจอใครอีกจาก ${name} เลือกได้อีก ${left} ชั่วโมง` : `อยากเจอใครอีกจากโต๊ะล่าสุด เลือกได้อีก ${left} ชั่วโมง`;
}
