/**
 * Event services shared by the member app and the staff dashboard:
 * waitlist offers, buddy rounds and loading attendees for matching.
 *
 * All timers are LAZY: these run when someone loads or changes the event,
 * comparing timestamps — no cron, no polling (SVAGENTS hard rule 10).
 */
import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
import { batch, getDb, type DatabaseEnv } from "../db";
import { buddyRound, type Attendee } from "../domain/matching";
import { ageOn, OFFER_HOURS, seatAvailable, strikeStanding, waitlistOrder } from "../domain/rules";
import { newId } from "../lib/crypto";
import { cleanBio, universityKey } from "../content/profile";
import { audit, notify } from "../lib/records";
import { accounts, blocks, buddyPairs, events, profiles, registrations, strikes, vibes, type Event } from "../schema";

type Db = ReturnType<typeof getDb>;

export const SEAT_STATUSES = ["confirmed", "offered"] as const;

/** Seats currently held (confirmed + offered), split by resident status. */
export async function seatState(db: Db, event: Event) {
  const rows = await db
    .select({ status: registrations.status, bkk: accounts.bkkRegistered })
    .from(registrations)
    .innerJoin(accounts, eq(accounts.id, registrations.accountId))
    .where(and(eq(registrations.eventId, event.id), inArray(registrations.status, [...SEAT_STATUSES])))
    .limit(5000);
  const taken = rows.length;
  const takenByNonResidents = rows.filter((r) => r.bkk !== "verified").length;
  return { capacity: event.capacity, residentQuota: event.residentQuota, taken, takenByNonResidents };
}

/**
 * Expire stale offers and offer free seats to the next people on the
 * waitlist (PRD §13.1: 12h to accept). Safe to call often; does nothing when
 * nothing changed. Returns how many offers were made.
 */
export async function refreshWaitlist(env: DatabaseEnv, eventId: string, now = new Date()): Promise<number> {
  const db = getDb(env);
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || event.status !== "published" || event.startsAt.getTime() <= now.getTime()) return 0;

  // 1. Expired offers lapse (no strike — they never confirmed).
  const expired = await db
    .update(registrations)
    .set({ status: "cancelled", cancelledAt: now, offeredUntil: null })
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "offered"), lt(registrations.offeredUntil, now)))
    .returning({ accountId: registrations.accountId });

  // 2. Fill free seats in waitlist order.
  const waiting = await db
    .select({ id: registrations.id, accountId: registrations.accountId, createdAt: registrations.createdAt, bkk: accounts.bkkRegistered })
    .from(registrations)
    .innerJoin(accounts, eq(accounts.id, registrations.accountId))
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "waitlisted")))
    .limit(1000);
  if (waiting.length === 0) return 0;

  const strikeRows = await db
    .select({ accountId: strikes.accountId, createdAt: strikes.createdAt, expiresAt: strikes.expiresAt, waivedBy: strikes.waivedBy })
    .from(strikes)
    .where(inArray(strikes.accountId, waiting.map((w) => w.accountId)))
    .limit(5000);
  const ordered = waitlistOrder(
    waiting.map((w) => ({
      id: w.id,
      createdAt: w.createdAt,
      isResident: w.bkk === "verified",
      priority: strikeStanding(strikeRows.filter((s) => s.accountId === w.accountId), now).waitlistPriority,
    })),
    event.residentPriority,
  );

  const state = await seatState(db, event);
  const offerUntil = new Date(Math.min(now.getTime() + OFFER_HOURS * 3_600_000, event.startsAt.getTime()));
  const queries = [];
  let offers = 0;
  for (const entry of ordered) {
    if (!seatAvailable(state, entry.isResident)) {
      if (state.taken >= state.capacity) break;
      continue; // seat reserved for residents; try the next person
    }
    const w = waiting.find((x) => x.id === entry.id)!;
    queries.push(
      // Only if still waiting: the member may have cancelled since we read the list.
      db.update(registrations).set({ status: "offered", offeredUntil: offerUntil }).where(and(eq(registrations.id, entry.id), eq(registrations.status, "waitlisted"))),
      notify(db, w.accountId, "waitlist_offer", "มีที่ว่างแล้ว! ยืนยันภายใน 12 ชม.", "A spot opened up! Confirm within 12 hours.", `/events/${eventId}`),
    );
    state.taken += 1;
    if (!entry.isResident) state.takenByNonResidents += 1;
    offers += 1;
  }
  if (queries.length) await batch(env, queries);
  void expired;
  return offers;
}

/**
 * Give back every upcoming seat and waitlist place this account holds (on
 * deactivation or a ban), then offer the freed seats to the next people
 * waiting. Past events are left alone so attendance history stays intact.
 */
export async function releaseUpcomingSeats(env: DatabaseEnv, accountId: string, now = new Date()): Promise<number> {
  const db = getDb(env);
  const held = await db
    .select({ id: registrations.id, eventId: registrations.eventId })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, accountId), inArray(registrations.status, ["confirmed", "offered", "waitlisted"]), gt(events.startsAt, now)))
    .limit(500);
  if (held.length === 0) return 0;
  await db
    .update(registrations)
    .set({ status: "cancelled", offeredUntil: null })
    .where(inArray(registrations.id, held.map((h) => h.id)));
  for (const eventId of new Set(held.map((h) => h.eventId))) await refreshWaitlist(env, eventId, now);
  return held.length;
}

/** Attendees in the shape the matching code wants, blocks included. */
export async function loadAttendees(db: Db, accountIds: string[], now = new Date()): Promise<Attendee[]> {
  if (accountIds.length === 0) return [];
  const [profs, blockRows, vibeRows] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.accountId, accountIds)).limit(5000),
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(inArray(blocks.blocker, accountIds), inArray(blocks.blocked, accountIds)))
      .limit(10_000),
    db.select({ accountId: vibes.accountId, vector: vibes.vector }).from(vibes).where(inArray(vibes.accountId, accountIds)).limit(5000),
  ]);
  const vibeOf = new Map(vibeRows.map((v) => [v.accountId, v.vector]));
  return profs.map((p) => ({
    accountId: p.accountId,
    age: ageOn(p.birthDate, now),
    ageMin: p.ageMin,
    ageMax: p.ageMax,
    languages: p.languages,
    interests: p.interests,
    socialStyles: p.socialStyles,
    intents: p.intents,
    blocked: blockRows
      .filter((b) => b.blocker === p.accountId || b.blocked === p.accountId)
      .map((b) => (b.blocker === p.accountId ? b.blocked : b.blocker)),
    vibe: vibeOf.get(p.accountId) ?? null,
    university: universityKey(cleanBio(p.bio)),
  }));
}

export const BUDDY_LEAD_HOURS = 48;

/**
 * Event Buddy round (PRD §10.5). Runs once per event, from 48h before start,
 * over confirmed registrations that ticked "find me a buddy". Pass
 * `force` for the staff "run now" button.
 */
export async function runBuddyRound(
  env: DatabaseEnv,
  event: Event,
  opts: { force?: boolean; actor?: string; now?: Date } = {},
): Promise<{ ran: boolean; groups: number; method?: string }> {
  const now = opts.now ?? new Date();
  if (!event.buddyEnabled || event.buddyRoundAt || event.status !== "published") return { ran: false, groups: 0 };
  if (!opts.force && now.getTime() < event.startsAt.getTime() - BUDDY_LEAD_HOURS * 3_600_000) return { ran: false, groups: 0 };
  const db = getDb(env);

  // Claim the round first so two concurrent page loads can't both run it.
  const claimed = await db
    .update(events)
    .set({ buddyRoundAt: now })
    .where(and(eq(events.id, event.id), eq(events.buddyEnabled, true)))
    .returning({ id: events.id, at: events.buddyRoundAt });
  if (claimed.length === 0) return { ran: false, groups: 0 };

  const regs = await db
    .select({ accountId: registrations.accountId })
    .from(registrations)
    .where(and(eq(registrations.eventId, event.id), eq(registrations.status, "confirmed"), eq(registrations.wantsBuddy, true)))
    .limit(2000);
  const people = await loadAttendees(db, regs.map((r) => r.accountId), now);
  const round = buddyRound(people);
  const queries = [];
  for (const g of round.groups) {
    queries.push(db.insert(buddyPairs).values({ id: newId(), eventId: event.id, members: g, method: round.method }));
    for (const m of g) {
      queries.push(notify(db, m, "buddy", "เราจับคู่บัดดี้ให้คุณแล้ว ดูได้ในหน้ากิจกรรม", "You've got an event buddy — see the event page", `/events/${event.id}`));
    }
  }
  for (const m of round.unmatched) {
    queries.push(notify(db, m, "buddy_none", "รอบนี้ยังหาบัดดี้ไม่ได้ แต่โฮสต์จะดูแลคุณที่งาน", "No buddy match this time — your host will look after you", `/events/${event.id}`));
  }
  queries.push(audit(db, opts.actor ?? "system", "event.buddy_round", { type: "event", id: event.id }, { groups: round.groups.length, method: round.method, unmatched: round.unmatched.length }));
  await batch(env, queries);
  return { ran: true, groups: round.groups.length, method: round.method };
}
