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
import { and, desc, eq, gt, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import type { Bindings } from "../lib/env";
import { fmtParts, type Lang } from "../lib/i18n";
import { sha256 } from "../lib/crypto";
import { createLogger } from "../logger";
import { OPEN_TO_MORE_TAG, PEOPLE_WINDOW_HOURS } from "../domain/rules";
import { accounts, consents, events, notifications, profiles, registrations, type Event } from "../schema";
import { getStatefulObject } from "../state";
import { pushToAccount } from "./push";
import { retentionIfDue } from "./retention";

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

export type ClockRun = { retention: boolean; quiet: boolean; tomorrow: number; today: number; windowOpen: number; pushed: number };

/** The next hourly slot after `firedAt`, skipping any that already passed. */
export function nextSlot(firedAt: number, now: number): number {
  let next = firedAt + HOUR;
  while (next <= now) next += HOUR;
  return next;
}

/** 21:00 to 07:59 in Bangkok: hold messages until morning. */
export function quietHours(now: Date): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Bangkok" }).format(now));
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
  const out: ClockRun = { retention: false, quiet: false, tomorrow: 0, today: 0, windowOpen: 0, pushed: 0 };
  const before = await retentionIfDue(env, "system", now);
  out.retention = !!before && before.at.getTime() === now.getTime();
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
  return out;
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
 */
async function sendOnce(
  env: Bindings,
  kind: string,
  due: Due[],
  linkOf: (d: Due) => string,
  textOf: (d: Due, lang: Lang) => string,
  ttl: number,
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
