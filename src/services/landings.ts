/**
 * Landings per campaign code (owner C3, 27 Oct 2026). Each GET of a public
 * landing that carries ?src= (or utm_source) adds 1 to a counter for that
 * Bangkok day and code. Nothing about the person is kept: no IP, no user
 * agent, no new cookie, no account. Obvious bots and link previews are
 * dropped in memory only, from the user agent, which is never stored.
 *
 * A reload counts again, so these are landings, never people. City Insight
 * shows them through roundedCount (10 or more, rounded to 5).
 */
import { sql } from "drizzle-orm";
import { getDb, type DatabaseEnv } from "../db";
import { bkkDayStart } from "../domain/pulse-heard";
import { srcLandings } from "../schema";

/** Crawlers, link unfurlers and scripted clients: not someone opening a link. */
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|line-poker|linkedin|embedly|skype|telegram|discord|curl|wget|python|httpclient|headless|lighthouse|pingdom|uptime|monitor/i;

/** True when a request looks like a person's browser opening the link. */
export function looksHuman(userAgent: string | undefined, purpose: string | undefined): boolean {
  if (!userAgent || BOT_UA.test(userAgent)) return false;
  // Browsers prefetching or prerendering a link the person hasn't opened yet.
  if (purpose && /prefetch|prerender/i.test(purpose)) return false;
  return true;
}

/** The Bangkok calendar day (YYYY-MM-DD) holding `now`. */
export function bkkDay(now: Date): string {
  return new Date(bkkDayStart(now).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Adds one landing for this Bangkok day and code. */
export async function countLanding(env: DatabaseEnv, code: string, now = new Date()): Promise<void> {
  const db = getDb(env);
  await db
    .insert(srcLandings)
    .values({ day: bkkDay(now), code, n: 1 })
    .onConflictDoUpdate({ target: [srcLandings.day, srcLandings.code], set: { n: sql`${srcLandings.n} + 1` } });
}
