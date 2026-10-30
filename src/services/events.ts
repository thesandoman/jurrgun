/**
 * Event services shared by the member app and the staff dashboard:
 * waitlist offers, buddy rounds and loading attendees for matching.
 *
 * All timers are LAZY: these run when someone loads or changes the event,
 * comparing timestamps — no cron, no polling (SVAGENTS hard rule 10).
 */
import { DEMO_EVENTS, realPeopleFor } from "./demo";
import { and, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { batch, getDb, type DatabaseEnv } from "../db";
import { buddyRound, type Attendee } from "../domain/matching";
import { ageOn, OFFER_HOURS, reliableAttender, romanceEligible, seatAvailable, strikeStanding, waitlistOrder } from "../domain/rules";
import { newId } from "../lib/crypto";
import { cleanBio, universityKey } from "../content/profile";
import { audit, notify } from "../lib/records";
import { accounts, blocks, buddyPairs, connections, events, partnerOrgs, profiles, registrations, strikes, vibes, type Event } from "../schema";
import { segmentOf } from "../domain/segment";
import { consentsFor, PERSONALIZATION_CONSENT } from "./consent";
import { noOpenInvite } from "./collabs";

type Db = ReturnType<typeof getDb>;

export const SEAT_STATUSES = ["confirmed", "offered"] as const;

/**
 * What Discover may list for anyone, before the member's own rules (dating
 * and women-only events, added by each caller): published, public (private
 * events open only through their link), not over yet, and no open co-host
 * invite (D53). Discover and the empty-district alert both start here.
 */
export function listableBase(now: Date, viewerIsDemo = false) {
  const where = [eq(events.status, "published"), eq(events.visibility, "public"), gt(events.endsAt, now), noOpenInvite()];
  // Demo-hosted tables are listed only to demo accounts (owner C2): real members and visitors never see them.
  if (!viewerIsDemo) where.push(sql`${events.id} not in ${DEMO_EVENTS}`);
  return where;
}

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
  // Showing up pays (owner card 10-16): kept the last 4 plans, or a mutual "again"
  // with the host or someone already going. Never shown as a score.
  const waitingIds = waiting.map((w) => w.accountId);
  const [past, going] = await Promise.all([
    db
      .select({ accountId: registrations.accountId, startsAt: events.startsAt, checkedInAt: registrations.checkedInAt })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(inArray(registrations.accountId, waitingIds), inArray(registrations.status, ["confirmed", "late_cancelled"]), lt(events.startsAt, now)))
      .limit(5000),
    db
      .select({ accountId: registrations.accountId })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "confirmed")))
      .limit(1000),
  ]);
  const people = [...new Set([...going.map((g) => g.accountId), ...(event.hostAccountId ? [event.hostAccountId] : [])])];
  const ties = people.length
    ? await db
        .select({ a: connections.aAccount, b: connections.bAccount })
        .from(connections)
        .where(
          and(
            isNull(connections.removedAt),
            or(and(inArray(connections.aAccount, waitingIds), inArray(connections.bAccount, people)), and(inArray(connections.bAccount, waitingIds), inArray(connections.aAccount, people))),
          ),
        )
        .limit(5000)
    : [];
  const reunites = new Set(ties.flatMap((t) => [t.a, t.b]).filter((id) => waitingIds.includes(id)));
  const ordered = waitlistOrder(
    waiting.map((w) => ({
      id: w.id,
      createdAt: w.createdAt,
      isResident: w.bkk === "verified",
      priority: strikeStanding(strikeRows.filter((s) => s.accountId === w.accountId), now).waitlistPriority,
      boost:
        reunites.has(w.accountId) ||
        reliableAttender(past.filter((r) => r.accountId === w.accountId).map((r) => ({ startsAt: r.startsAt, checkedIn: !!r.checkedInAt }))),
    })),
    event.residentPriority,
  );

  const state = await seatState(db, event);
  const offerUntil = new Date(Math.min(now.getTime() + OFFER_HOURS * 3_600_000, event.startsAt.getTime()));
  const updates = [];
  for (const entry of ordered) {
    if (!seatAvailable(state, entry.isResident)) {
      if (state.taken >= state.capacity) break;
      continue; // seat reserved for residents; try the next person
    }
    updates.push(
      // Only if still waiting: the member may have cancelled, or another page
      // load may have made this same offer a moment ago.
      db
        .update(registrations)
        .set({ status: "offered", offeredUntil: offerUntil })
        .where(and(eq(registrations.id, entry.id), eq(registrations.status, "waitlisted")))
        .returning({ accountId: registrations.accountId }),
    );
    state.taken += 1;
    if (!entry.isResident) state.takenByNonResidents += 1;
  }
  void expired;
  if (updates.length === 0) return 0;
  // Notify only the rows this call actually changed, so overlapping page loads send one message.
  // batch() returns positional rows: [accountId] for each changed registration.
  const changed = (await batch(env, updates)).flat().map((row) => String(row[0]));
  if (changed.length) {
    await batch(
      env,
      changed.map((accountId) => notify(db, accountId, "waitlist_offer", "มีที่ว่างแล้ว! ยืนยันภายใน 12 ชม.", "A spot opened up! Confirm within 12 hours.", `/events/${eventId}`)),
    );
  }
  return changed.length;
}

/**
 * Give back every upcoming seat and waitlist place this account holds (on
 * deactivation or a ban), then offer the freed seats to the next people
 * waiting. Past events are left alone so attendance history stays intact.
 *
 * With `until` (a suspension, owner card D), only events that start before
 * the suspension ends. Either way it reads exactly like the member cancelling
 * (status, time, no strike, no note to the host), so the timing doesn't say
 * anything about why.
 */
export async function releaseUpcomingSeats(env: DatabaseEnv, accountId: string, now = new Date(), opts: { until?: Date } = {}): Promise<number> {
  const db = getDb(env);
  const held = await db
    .select({ id: registrations.id, eventId: registrations.eventId })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(
      and(
        eq(registrations.accountId, accountId),
        inArray(registrations.status, ["confirmed", "offered", "waitlisted"]),
        gt(events.startsAt, now),
        opts.until ? lt(events.startsAt, opts.until) : undefined,
      ),
    )
    .limit(500);
  if (held.length === 0) return 0;
  await db
    .update(registrations)
    .set({ status: "cancelled", cancelledAt: now, offeredUntil: null })
    .where(inArray(registrations.id, held.map((h) => h.id)));
  for (const eventId of new Set(held.map((h) => h.eventId))) await refreshWaitlist(env, eventId, now);
  return held.length;
}

/**
 * Attendees in the shape the matching code wants, blocks included, plus what
 * seating needs to mix tables (D31): Bangkok Type, segment, romance mode, who
 * chose each other before (connections) and who sat together before without
 * clicking. `eventId` (the event being seated) is left out of the history.
 */
export async function loadAttendees(db: Db, accountIds: string[], now = new Date(), eventId?: string): Promise<Attendee[]> {
  if (accountIds.length === 0) return [];
  const [profs, blockRows, vibeRows, connRows, seatRows, personal] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.accountId, accountIds)).limit(5000),
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(inArray(blocks.blocker, accountIds), inArray(blocks.blocked, accountIds)))
      .limit(10_000),
    db.select({ accountId: vibes.accountId, vector: vibes.vector, archetype: vibes.archetype }).from(vibes).where(inArray(vibes.accountId, accountIds)).limit(5000),
    db
      .select({ a: connections.aAccount, b: connections.bAccount })
      .from(connections)
      .where(and(inArray(connections.aAccount, accountIds), inArray(connections.bAccount, accountIds), isNull(connections.removedAt)))
      .limit(10_000),
    db
      .select({ accountId: registrations.accountId, eventId: registrations.eventId, groupNo: registrations.groupNo })
      .from(registrations)
      .where(and(inArray(registrations.accountId, accountIds), isNotNull(registrations.groupNo), isNotNull(registrations.checkedInAt)))
      .limit(20_000),
    consentsFor(db, accountIds, PERSONALIZATION_CONSENT),
  ]);
  const vibeOf = new Map(vibeRows.map((v) => [v.accountId, v.vector]));
  const typeOf = new Map(vibeRows.map((v) => [v.accountId, v.archetype]));
  const mutualOf = new Map<string, Set<string>>();
  const link = (m: Map<string, Set<string>>, a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const c of connRows) {
    link(mutualOf, c.a, c.b);
    link(mutualOf, c.b, c.a);
  }
  // Sat at the same table at an earlier event, and neither chose the other.
  const tables = new Map<string, string[]>();
  for (const r of seatRows) {
    if (r.eventId === eventId) continue;
    const key = `${r.eventId}#${r.groupNo}`;
    tables.set(key, [...(tables.get(key) ?? []), r.accountId]);
  }
  const noClickOf = new Map<string, Set<string>>();
  for (const members of tables.values()) {
    for (const a of members) for (const b of members) if (a !== b && !mutualOf.get(a)?.has(b)) link(noClickOf, a, b);
  }
  // Privacy R7: without the personalization consent (newest answer yes), seating doesn't read
  // interests, social styles, university, the quiz vector or the Bangkok Type. What seating
  // needs stays: languages, ages, blocks, history, segment and the 💘 opt-in on 💘 events.
  return profs.map((p) => {
    const mine = personal.has(p.accountId);
    return {
      accountId: p.accountId,
      age: ageOn(p.birthDate, now),
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      languages: p.languages,
      interests: mine ? p.interests : [],
      socialStyles: mine ? p.socialStyles : [],
      intents: p.intents,
      blocked: blockRows
        .filter((b) => b.blocker === p.accountId || b.blocked === p.accountId)
        .map((b) => (b.blocker === p.accountId ? b.blocked : b.blocker)),
      vibe: mine ? (vibeOf.get(p.accountId) ?? null) : null,
      university: mine ? universityKey(cleanBio(p.bio)) : null,
      type: mine && /^[BC][DF][MS][NH]$/.test(typeOf.get(p.accountId) ?? "") ? typeOf.get(p.accountId)! : null,
      segment: segmentOf(p),
      openToMore: romanceEligible(p),
      mutual: [...(mutualOf.get(p.accountId) ?? [])],
      metNoClick: [...(noClickOf.get(p.accountId) ?? [])],
    };
  });
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
    // isNull: only the first of several simultaneous page loads wins the claim.
    .where(and(eq(events.id, event.id), eq(events.buddyEnabled, true), isNull(events.buddyRoundAt)))
    .returning({ id: events.id, at: events.buddyRoundAt });
  if (claimed.length === 0) return { ran: false, groups: 0 };

  const regs = await db
    .select({ accountId: registrations.accountId })
    .from(registrations)
    .where(and(eq(registrations.eventId, event.id), eq(registrations.status, "confirmed"), eq(registrations.wantsBuddy, true)))
    .limit(2000);
  // Never pair a demo account with a real member (owner C2).
  const people = await loadAttendees(db, await realPeopleFor(db, event.hostAccountId ?? event.createdBy, regs.map((r) => r.accountId)), now);
  const round = buddyRound(people);
  const queries = [];
  for (const g of round.groups) {
    queries.push(db.insert(buddyPairs).values({ id: newId(), eventId: event.id, members: g, method: round.method }));
    for (const m of g) {
      queries.push(notify(db, m, "buddy", "เราจับคู่บัดดี้ให้คุณแล้ว ดูได้ในหน้ากิจกรรม", "You've got an event buddy. See the event page", `/events/${event.id}`));
    }
  }
  for (const m of round.unmatched) {
    queries.push(notify(db, m, "buddy_none", "รอบนี้ยังหาบัดดี้ไม่ได้ แต่โฮสต์จะดูแลคุณที่งาน", "No buddy match this time, but your host will look after you", `/events/${event.id}`));
  }
  queries.push(audit(db, opts.actor ?? "system", "event.buddy_round", { type: "event", id: event.id }, { groups: round.groups.length, method: round.method, unmatched: round.unmatched.length }));
  await batch(env, queries);
  return { ran: true, groups: round.groups.length, method: round.method };
}

/** A partner organisation's kind (events, dating, venue, community), or null for none. */
export async function partnerKindOf(db: Db, partnerOrgId: string | null | undefined): Promise<string | null> {
  if (!partnerOrgId) return null;
  const [org] = await db.select({ kind: partnerOrgs.kind }).from(partnerOrgs).where(eq(partnerOrgs.id, partnerOrgId)).limit(1);
  return org?.kind ?? null;
}
