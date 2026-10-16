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
import { and, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
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
        eq(accounts.status, "active"),
        gte(events.startsAt, new Date(t + 18 * HOUR)),
        lt(events.startsAt, new Date(t + 30 * HOUR)),
      ),
    )
    .limit(BATCH);
  const sentTomorrow = await sendOnce(env, KIND_TOMORROW, tomorrow, (d) => `/me/events/${d.event.id}/pass`, (d, lang) => tomorrowText(d.event, lang), 12 * 3600);
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
        eq(accounts.status, "active"),
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
  const links = [...new Set(due.map(linkOf))];
  const [already, said] = await Promise.all([
    db
      .select({ accountId: notifications.accountId, link: notifications.link })
      .from(notifications)
      .where(and(eq(notifications.kind, kind), inArray(notifications.accountId, ids), inArray(notifications.link, links)))
      .limit(due.length),
    db
      .select({ accountId: consents.accountId, granted: consents.granted })
      .from(consents)
      .where(and(eq(consents.category, "notifications"), inArray(consents.accountId, ids)))
      .orderBy(desc(consents.createdAt))
      .limit(ids.length * 4),
  ]);
  const done = new Set(already.map((r) => `${r.accountId} ${r.link}`));
  // The newest answer wins; no answer at all counts as yes (older accounts never saw the question).
  const optedOut = new Set<string>();
  const seen = new Set<string>();
  for (const c of said) {
    if (seen.has(c.accountId)) continue;
    seen.add(c.accountId);
    if (!c.granted) optedOut.add(c.accountId);
  }
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

export function tomorrowText(e: Event, lang: Lang): string {
  const time = fmtParts(e.startsAt, lang).time;
  const name = shownTitle(e, lang);
  if (lang === "en") return name ? `Tomorrow at ${time}: ${name}, at ${e.venueName}. Your pass is ready.` : `You have a table tomorrow at ${time}. Your pass is ready.`;
  return name ? `พรุ่งนี้ ${time} ${name} ที่ ${e.venueName} บัตรเข้างานพร้อมแล้ว` : `พรุ่งนี้ ${time} คุณมีนัดหนึ่งโต๊ะ บัตรเข้างานพร้อมแล้ว`;
}

export function windowText(e: Event, lang: Lang, now: Date): string {
  const left = Math.max(1, Math.floor((e.endsAt.getTime() + PEOPLE_WINDOW_HOURS * HOUR - now.getTime()) / HOUR));
  const name = shownTitle(e, lang);
  if (lang === "en") return name ? `Who would you like to meet again from ${name}? You have ${left} hours to choose.` : `Who would you like to meet again? You have ${left} hours to choose.`;
  return name ? `อยากเจอใครอีกจาก ${name} เลือกได้อีก ${left} ชั่วโมง` : `อยากเจอใครอีกจากโต๊ะล่าสุด เลือกได้อีก ${left} ชั่วโมง`;
}
