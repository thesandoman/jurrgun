/**
 * The hourly clock (owner card, 2026-10-16). SV Cloud has no cron, so one
 * scheduled task named "clock" on the object "clock:app" books the next hour
 * first, then does the work (SVAGENTS.md §5.4):
 *
 *   retention      at most once a day (src/services/retention.ts)
 *   day before     confirmed seats at events starting in 18 to 30 hours
 *   window open    checked-in members of events that ended 1 to 14 hours ago,
 *                  while the 72-hour People I Met window is open
 *
 * Messages are in-app notifications, plus Web Push for members who turned it
 * on. Nothing is sent from 21:00 to 08:00 Bangkok time: the windows above are
 * wide enough that a held message goes out at 08:00. Each message is sent
 * once per member and event; the notification row is the record, so a task
 * that arrives twice sends nothing new. Members who said no to event
 * reminders at sign-up get neither.
 *
 * An admin starts and stops the chain from /admin. Locally there are no
 * stateful objects; tests call runClock directly.
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import type { Bindings } from "../lib/env";
import { fmtParts, type Lang } from "../lib/i18n";
import { newId } from "../lib/crypto";
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
export const KIND_WINDOW = "people_window";

export type ClockRun = { retention: boolean; quiet: boolean; tomorrow: number; windowOpen: number; pushed: number };

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
  const out: ClockRun = { retention: false, quiet: false, tomorrow: 0, windowOpen: 0, pushed: 0 };
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

/** Writes one notification per (member, link) that has none of this kind yet, and pushes it. */
async function sendOnce(
  env: Bindings,
  kind: string,
  due: Due[],
  linkOf: (d: Due) => string,
  textOf: (d: Due, lang: Lang) => string,
  ttl: number,
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
      .where(and(eq(notifications.kind, kind), sql`(${notifications.accountId}, ${notifications.link}) in (${pairs})`))
      .limit(due.length * 2),
    // The newest answer per member, however many times anyone saved their consents.
    db
      .selectDistinctOn([consents.accountId], { accountId: consents.accountId, granted: consents.granted })
      .from(consents)
      .where(and(eq(consents.category, "notifications"), inArray(consents.accountId, ids)))
      .orderBy(consents.accountId, desc(consents.createdAt))
      .limit(ids.length),
  ]);
  const done = new Set(already.map((r) => `${r.accountId} ${r.link}`));
  // No answer at all counts as yes (older accounts never saw the question).
  const optedOut = new Set(said.filter((c) => !c.granted).map((c) => c.accountId));
  const todo = due.filter((d) => !optedOut.has(d.accountId) && !done.has(`${d.accountId} ${linkOf(d)}`));
  if (!todo.length) return { sent: 0, pushed: 0 };
  await db.insert(notifications).values(
    todo.map((d) => ({ id: newId(), accountId: d.accountId, kind, titleTh: textOf(d, "th"), titleEn: textOf(d, "en"), link: linkOf(d) })),
  );
  let pushed = 0;
  for (const d of todo) {
    const lang: Lang = d.locale === "en" ? "en" : "th";
    pushed += await pushToAccount(env, db, d.accountId, { title: "Jurrgun", body: textOf(d, lang), url: linkOf(d), tag: `${kind}:${d.event.id}` }, ttl);
  }
  return { sent: todo.length, pushed };
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
 * "Tomorrow" only when the event really is on tomorrow's date in Bangkok. A
 * table just after midnight can be reminded the evening two days before
 * (quiet hours hold the later slots), so that one names the weekday instead.
 */
export function tomorrowText(e: Event, lang: Lang, now: Date): string {
  const time = fmtParts(e.startsAt, lang).time;
  const name = shownTitle(e, lang);
  const isTomorrow = bangkokDaysApart(now, e.startsAt) === 1;
  const weekday = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { weekday: "long", timeZone: "Asia/Bangkok" }).format(e.startsAt);
  if (lang === "en") {
    const when = isTomorrow ? `Tomorrow at ${time}` : `${weekday} at ${time}`;
    return name ? `${when}: ${name}, at ${e.venueName}. Your pass is ready.` : `You have a table ${isTomorrow ? "tomorrow" : `on ${weekday}`} at ${time}. Your pass is ready.`;
  }
  const when = isTomorrow ? `พรุ่งนี้ ${time}` : `${weekday} ${time}`;
  return name ? `${when} ${name} ที่ ${e.venueName} บัตรเข้างานพร้อมแล้ว` : `${when} คุณมีนัดที่โต๊ะ บัตรเข้างานพร้อมแล้ว`;
}

export function windowText(e: Event, lang: Lang, now: Date): string {
  const left = Math.max(1, Math.floor((e.endsAt.getTime() + PEOPLE_WINDOW_HOURS * HOUR - now.getTime()) / HOUR));
  const name = shownTitle(e, lang);
  if (lang === "en") return name ? `Who would you like to meet again from ${name}? You have ${left} hours to choose.` : `Who would you like to meet again? You have ${left} hours to choose.`;
  return name ? `อยากเจอใครอีกจาก ${name} เลือกได้อีก ${left} ชั่วโมง` : `อยากเจอใครอีกจากโต๊ะล่าสุด เลือกได้อีก ${left} ชั่วโมง`;
}
