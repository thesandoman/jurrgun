/**
 * "See them again": after a member attended an event, the people they met
 * there and one next step back to them.
 *
 * Privacy rules kept here:
 *  - Only people I'm connected with from that event (a mutual choice that
 *    nobody removed). Tablemates I didn't connect with are never named,
 *    counted or looked up.
 *  - Nobody I blocked or who blocked me, and no banned or deactivated account.
 *  - Their bookings: only confirmed seats at published, PUBLIC events (never a
 *    private event or a Regular Table hangout), only from active members who
 *    aren't paused, never an event whose tags would say something private
 *    about them (dating, women-only, LGBTQ+ community), and only events I could
 *    join myself (my age). Shown as a count, never as who.
 *  - The connection level (friend, romance and so on) is never used or shown.
 */
import { DEMO_ACCOUNTS } from "./demo";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { ageOn, isPaused, OPEN_TO_MORE_TAG, WOMEN_ONLY_TAG, withinRange } from "../domain/rules";
import { accounts, blocks, connections, events, profiles, registrations, type Event } from "../schema";

type Db = ReturnType<typeof getDb>;

/** Going to one of these would tell others something private about a person. */
const PRIVATE_TAGS: readonly string[] = [OPEN_TO_MORE_TAG, WOMEN_ONLY_TAG, "lgbtq_community"];
const ACTIVE_REG = ["confirmed", "offered", "waitlisted"];

export type SeeAgainPerson = { id: string; nickname: string; connectionId: string };
export type SeeAgain = {
  event: { id: string; title: string; titleEn: string | null; startsAt: Date };
  people: SeeAgainPerson[];
  next: { kind: "event"; event: Event; going: number } | { kind: "chat"; href: string; with: SeeAgainPerson | null };
};

/**
 * The people I met at my most recent attended event (or at `eventId`), with
 * one next step, or null when there is nobody to show.
 */
export async function seeAgain(
  db: Db,
  me: { id: string; birthDate: string },
  opts: { eventId?: string; now?: Date } = {},
): Promise<SeeAgain | null> {
  const now = opts.now ?? new Date();
  const went = await db
    .select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(
      and(
        eq(registrations.accountId, me.id),
        isNotNull(registrations.checkedInAt),
        lte(events.endsAt, now),
        // A private talk never leads to seeing anyone again (D52).
        eq(events.talkMode, false),
        ...(opts.eventId ? [eq(events.id, opts.eventId)] : []),
      ),
    )
    .orderBy(desc(events.startsAt))
    .limit(20);
  if (went.length === 0) return null;

  const conns = await db
    .select({ id: connections.id, a: connections.aAccount, b: connections.bAccount, eventId: connections.eventId })
    .from(connections)
    .where(
      and(
        or(eq(connections.aAccount, me.id), eq(connections.bAccount, me.id)),
        isNull(connections.removedAt),
        // Demo accounts never show up for real members (owner C2); demo viewers keep their demo world.
        sql`(${me.id} in ${DEMO_ACCOUNTS} or (${connections.aAccount} not in ${DEMO_ACCOUNTS} and ${connections.bAccount} not in ${DEMO_ACCOUNTS}))`,
        inArray(
          connections.eventId,
          went.map((e) => e.id),
        ),
      ),
    )
    .orderBy(asc(connections.createdAt))
    .limit(200);
  if (conns.length === 0) return null;

  const otherOf = (r: { a: string; b: string }) => (r.a === me.id ? r.b : r.a);
  const others = [...new Set(conns.map(otherOf))];
  const [blockRows, people] = await Promise.all([
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(and(eq(blocks.blocker, me.id), inArray(blocks.blocked, others)), and(eq(blocks.blocked, me.id), inArray(blocks.blocker, others))))
      .limit(500),
    db
      .select({ id: accounts.id, status: accounts.status, suspendedUntil: accounts.suspendedUntil, nickname: profiles.nickname, pausedUntil: profiles.pausedUntil })
      .from(accounts)
      .innerJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(inArray(accounts.id, others))
      .limit(others.length),
  ]);
  const blocked = new Set(blockRows.map((r) => (r.blocker === me.id ? r.blocked : r.blocker)));
  const personById = new Map(people.map((p) => [p.id, p]));
  const shown = (id: string) => {
    const p = personById.get(id);
    return !!p && !blocked.has(id) && p.status !== "banned" && p.status !== "deactivated";
  };

  // The most recent event with someone to show.
  for (const ev of went) {
    const seen = new Set<string>();
    const list: SeeAgainPerson[] = [];
    for (const r of conns) {
      const id = otherOf(r);
      if (r.eventId !== ev.id || seen.has(id) || !shown(id)) continue;
      seen.add(id);
      list.push({ id, nickname: personById.get(id)!.nickname, connectionId: r.id });
    }
    if (list.length === 0) continue;
    return { event: ev, people: list, next: await nextStep(db, me, list, personById, now) };
  }
  return null;
}

type PersonRow = { status: string; suspendedUntil: Date | null; pausedUntil: Date | null };

async function nextStep(db: Db, me: { id: string; birthDate: string }, list: SeeAgainPerson[], personById: Map<string, PersonRow>, now: Date): Promise<SeeAgain["next"]> {
  const canShow = list.filter((x) => {
    const p = personById.get(x.id)!;
    const active = p.status === "active" || (p.status === "suspended" && !!p.suspendedUntil && p.suspendedUntil.getTime() <= now.getTime());
    return active && !isPaused(p, now);
  });
  if (canShow.length) {
    const booked = await db
      .select({ accountId: registrations.accountId, event: events })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(
        and(
          inArray(
            registrations.accountId,
            canShow.map((x) => x.id),
          ),
          eq(registrations.status, "confirmed"),
          eq(events.status, "published"),
          eq(events.visibility, "public"),
          isNull(events.regularTableId),
          gt(events.startsAt, now),
          eq(events.talkMode, false),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(60);
    const age = ageOn(me.birthDate, now);
    const fit = booked.filter((r) => !r.event.tags.some((tag) => PRIVATE_TAGS.includes(tag)) && withinRange(age, r.event.ageMin, r.event.ageMax));
    const ids = [...new Set(fit.map((r) => r.event.id))];
    const mine = ids.length
      ? await db
          .select({ eventId: registrations.eventId })
          .from(registrations)
          .where(and(eq(registrations.accountId, me.id), inArray(registrations.eventId, ids), inArray(registrations.status, ACTIVE_REG)))
          .limit(ids.length)
      : [];
    const already = new Set(mine.map((r) => r.eventId));
    const first = fit.find((r) => !already.has(r.event.id));
    if (first) {
      const going = new Set(fit.filter((r) => r.event.id === first.event.id).map((r) => r.accountId)).size;
      return { kind: "event", event: first.event, going };
    }
  }
  // Already connected: their chat. One person, straight to them; several, the chat list.
  if (list.length === 1) return { kind: "chat", href: `/chat/conn:${list[0].connectionId}`, with: list[0] };
  return { kind: "chat", href: "/chat", with: null };
}
