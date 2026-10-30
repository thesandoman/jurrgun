/**
 * Counts and seat codes for the roster rule in src/domain/roster.ts.
 */
import { and, eq, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { bkkDayStart } from "../domain/pulse-heard";
import { seatCode } from "../domain/roster";
import { chunks, KEYSET_CHUNK } from "../lib/bulk";
import { registrations } from "../schema";
import { DEMO_ACCOUNTS, DEMO_EVENTS } from "./demo";

/**
 * Bookings that count in partner figures (owner P3, 30 Oct 2026, after C2): a
 * demo or test account's place never counts, except at an event a demo account
 * hosts, where everyone is demo and the numbers are the demo's own.
 */
export const countsForPartners = () => sql`(${registrations.accountId} not in ${DEMO_ACCOUNTS} or ${registrations.eventId} in ${DEMO_EVENTS})`;

type Db = ReturnType<typeof getDb>;

/**
 * Booked seats and check-ins per event, as of 00:00 Bangkok time today: a seat
 * counts if it was booked before then and not cancelled before then, so new
 * bookings, cancellations and arrivals don't show until the next day.
 * Registrations keep no status history, so three rare same-day changes can
 * still show: a re-booking (the row keeps its old createdAt), a waitlist place
 * filled today, and a place waitlisted at midnight and cancelled today. Shown
 * counts are "under 10" or rounded to 5, which blunts them. A true snapshot
 * would need a daily table (a migration). Demo and test accounts never count
 * (countsForPartners).
 */
export async function frozenCounts(db: Db, eventIds: string[], now = new Date()): Promise<Map<string, { booked: number; checkedIn: number }>> {
  const out = new Map<string, { booked: number; checkedIn: number }>();
  if (!eventIds.length) return out;
  const cutoff = bkkDayStart(now);
  for (const part of chunks(eventIds, KEYSET_CHUNK)) {
    const rows = await db
      .select({
        eventId: registrations.eventId,
        booked: sql<number>`count(*)`.mapWith(Number),
        checkedIn: sql<number>`count(*) filter (where ${registrations.checkedInAt} < ${cutoff})`.mapWith(Number),
      })
      .from(registrations)
      .where(
        and(
          inArray(registrations.eventId, part),
          lt(registrations.createdAt, cutoff),
          or(isNull(registrations.cancelledAt), gte(registrations.cancelledAt, cutoff)),
          notInArray(registrations.status, ["waitlisted", "requested", "offered"]),
          countsForPartners(),
        ),
      )
      .groupBy(registrations.eventId)
      .limit(part.length);
    for (const r of rows) out.set(r.eventId, { booked: r.booked, checkedIn: r.checkedIn });
  }
  return out;
}

/** Seat codes for these members at one event (a 💘 event's host sees these instead of names). */
export async function seatCodes(db: Db, eventId: string, accountIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(accountIds)];
  for (const part of chunks(ids, KEYSET_CHUNK)) {
    const rows = await db
      .select({ accountId: registrations.accountId, passToken: registrations.passToken })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), inArray(registrations.accountId, part)))
      .limit(part.length * 2);
    for (const r of rows) out.set(r.accountId, seatCode(r.passToken));
  }
  return out;
}
