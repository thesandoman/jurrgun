/**
 * Outside events into the host inbox (D45, D46).
 *
 *   importLink   a host pastes any event page: the link is checked, then the
 *                page is read for its own event description when its source
 *                allows that (src/content/sources.ts) and robots.txt agrees.
 *                Otherwise only the link and the source name are kept.
 *   readDueFeeds the hourly clock reads each active feed at most once a day
 *                (lastReadAt older than FEED_EVERY_HOURS), a few per run, into
 *                the inbox, de-duplicated by the feed's UID.
 *
 * Nothing in the inbox is on Discover. A host or partner turns an item into a
 * go-together event with a meeting point, a host and a table (/host/new?inbox=…).
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, type DatabaseEnv } from "../db";
import { newId } from "../lib/crypto";
import { sourceForHost, sourceName } from "../content/sources";
import { dedupeKey, readEventPage, readIcal, type OutsideEvent } from "../domain/outside-events";
import { eventFeeds, eventInbox, type EventFeed } from "../schema";
import { checkOutsideUrl, FEED_MAX_BYTES, outsideGet, PAGE_MAX_BYTES, robotsPermit, type FetchError } from "./outside-fetch";

export const FEED_EVERY_HOURS = 20;
const FEEDS_PER_RUN = 5;
const HOUR = 3_600_000;

export type ImportResult =
  | { ok: true; inboxId: string; read: boolean; online: boolean; reason?: FetchError | "link_only" | "no_event" }
  | { ok: false; error: "bad_url" | "no_date" };

/** Paste an event link: one inbox row per page (the same link again reuses it). */
export async function importLink(
  env: DatabaseEnv,
  raw: string,
  by: { accountId: string; partnerOrgId: string | null },
  now = new Date(),
): Promise<ImportResult> {
  const url = checkOutsideUrl(raw);
  if (!url) return { ok: false, error: "bad_url" };
  const key = dedupeKey({ url: url.toString() })!;
  const db = getDb(env);
  const [existing] = await db.select({ id: eventInbox.id }).from(eventInbox).where(eq(eventInbox.dedupeKey, key)).limit(1);
  if (existing) return { ok: true, inboxId: existing.id, read: false, online: false };

  const source = sourceForHost(url.hostname);
  let ev: OutsideEvent | null = null;
  let reason: FetchError | "link_only" | "no_event" | undefined;
  if (source?.read === "link") reason = "link_only";
  else if (!(await robotsPermit(url))) reason = "robots";
  else {
    const page = await outsideGet(url.toString(), { maxBytes: PAGE_MAX_BYTES, accept: "text/html,application/xhtml+xml", textTypes: /html|xml/ });
    if (page.ok) {
      ev = readEventPage(page.text, page.url);
      if (!ev) reason = "no_event";
    } else reason = page.error;
  }
  const id = newId();
  await db
    .insert(eventInbox)
    .values({
      id,
      dedupeKey: key,
      partnerOrgId: by.partnerOrgId,
      sourceName: sourceName(url.hostname),
      sourceUrl: url.toString(),
      credit: ev?.organizer ?? null,
      title: ev?.title || url.hostname.replace(/^www\./, ""),
      description: ev?.description ?? "",
      // Unknown until the host types it: the inbox sorts by date, so "now" keeps it at the top.
      startsAt: ev?.startsAt ?? now,
      endsAt: ev?.endsAt ?? null,
      venueName: ev?.venueName ?? null,
      venueAddress: ev?.venueAddress ?? null,
      addedBy: by.accountId,
    })
    .onConflictDoNothing({ target: eventInbox.dedupeKey });
  const [row] = await db.select({ id: eventInbox.id }).from(eventInbox).where(eq(eventInbox.dedupeKey, key)).limit(1);
  return { ok: true, inboxId: row?.id ?? id, read: !!ev, online: !!ev?.online, reason };
}

/** Read one feed into the inbox. Returns how many events it listed. */
export async function readFeed(env: DatabaseEnv, feed: EventFeed, now = new Date()): Promise<{ result: string; count: number }> {
  const db = getDb(env);
  const res = await outsideGet(feed.url, { maxBytes: FEED_MAX_BYTES, timeoutMs: 10_000, accept: "text/calendar", textTypes: /calendar|text\/plain|octet-stream/ });
  let result = "ok";
  let count = 0;
  if (!res.ok) result = res.error;
  else if (!/BEGIN:VCALENDAR/.test(res.text.slice(0, 2000))) result = "not_ical";
  else {
    // Online-only events never become Discover events (D50), so they never reach the inbox.
    const found = readIcal(res.text, now).filter((e) => !e.online);
    count = found.length;
    const rows = found
      .map((e) => ({ e, key: dedupeKey(e, feed.id) }))
      .filter((x): x is { e: OutsideEvent; key: string } => !!x.key)
      .map(({ e, key }) => ({
        id: newId(),
        dedupeKey: key,
        feedId: feed.id,
        partnerOrgId: feed.partnerOrgId,
        sourceName: feed.sourceName,
        sourceUrl: e.url,
        credit: feed.credit ?? e.organizer,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt!,
        endsAt: e.endsAt,
        venueName: e.venueName,
        venueAddress: e.venueAddress,
      }));
    for (let i = 0; i < rows.length; i += 100) {
      // A changed time or place in the feed updates items still waiting; attached ones are left alone.
      await db
        .insert(eventInbox)
        .values(rows.slice(i, i + 100))
        .onConflictDoUpdate({
          target: eventInbox.dedupeKey,
          set: {
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            startsAt: sql`excluded.starts_at`,
            endsAt: sql`excluded.ends_at`,
            venueName: sql`excluded.venue_name`,
            venueAddress: sql`excluded.venue_address`,
            sourceUrl: sql`excluded.source_url`,
            updatedAt: now,
          },
          setWhere: eq(eventInbox.status, "new"),
        });
    }
  }
  await db.update(eventFeeds).set({ lastReadAt: now, lastResult: result, lastCount: count }).where(eq(eventFeeds.id, feed.id));
  return { result, count };
}

/** The clock's daily read: feeds not read for FEED_EVERY_HOURS, a few per hourly run. */
export async function readDueFeeds(env: DatabaseEnv, now = new Date()): Promise<number> {
  const db = getDb(env);
  const due = await db
    .select()
    .from(eventFeeds)
    .where(and(eq(eventFeeds.status, "active"), or(isNull(eventFeeds.lastReadAt), lt(eventFeeds.lastReadAt, new Date(now.getTime() - FEED_EVERY_HOURS * HOUR)))))
    .orderBy(sql`${eventFeeds.lastReadAt} asc nulls first`)
    .limit(FEEDS_PER_RUN);
  let read = 0;
  for (const feed of due) {
    await readFeed(env, feed, now);
    read++;
  }
  return read;
}
