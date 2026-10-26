/**
 * เกี่ยวก้อย · Pinky, with the database (rules in src/domain/pinky.ts).
 *
 * Privacy rules kept here:
 *  - The other person's choice is read only to decide whether a Pinky
 *    unlocks. It is never returned, shown, counted or logged, so a one-sided
 *    tap never leaks: the tapper sees "your pinky is out" whether or not the
 *    other person did anything, until it is mutual.
 *  - Nothing here writes to the audit log (staff never see romance data).
 *  - Stepping back tells nobody and withdraws the tap. Ending a Pinky turns it back into friends.
 */
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { batch, type getDb } from "../db";
import { buddyKey, pinkyOffered, pinkyOn, pinkyUnlocked } from "../domain/pinky";
import { peopleWindow } from "../domain/rules";
import { newId } from "../lib/crypto";
import { notify } from "../lib/records";
import { blocks, connectionChoices, connections, events, profiles, registrations, type Profile } from "../schema";

type Db = ReturnType<typeof getDb>;
type Env = Parameters<typeof batch>[0];

export type PinkyState = { eventId: string; mine: boolean; mutual: boolean; connectionId: string | null; open: boolean };

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** The newest event both checked in to (they met there), or null. */
async function sharedEvent(db: Db, me: string, other: string): Promise<{ id: string; endsAt: Date } | null> {
  const theirs = alias(registrations, "theirs");
  const [row] = await db
    .select({ id: events.id, endsAt: events.endsAt })
    .from(registrations)
    .innerJoin(theirs, and(eq(theirs.eventId, registrations.eventId), eq(theirs.accountId, other), isNotNull(theirs.checkedInAt)))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, me), isNotNull(registrations.checkedInAt)))
    .orderBy(desc(events.startsAt))
    .limit(1);
  return row ?? null;
}

async function blockedEitherWay(db: Db, x: string, y: string): Promise<boolean> {
  const rows = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(or(and(eq(blocks.blocker, x), eq(blocks.blocked, y)), and(eq(blocks.blocker, y), eq(blocks.blocked, x))))
    .limit(1);
  return rows.length > 0;
}

async function myChoice(db: Db, eventId: string, from: string, to: string) {
  const [row] = await db
    .select({ id: connectionChoices.id, choice: connectionChoices.choice })
    .from(connectionChoices)
    .where(and(eq(connectionChoices.eventId, eventId), eq(connectionChoices.fromAccount, from), eq(connectionChoices.toAccount, to)))
    .limit(1);
  return row ?? null;
}

async function pinkyConnection(db: Db, eventId: string, x: string, y: string) {
  const [a, b] = pair(x, y);
  const [row] = await db.select().from(connections).where(and(eq(connections.aAccount, a), eq(connections.bAccount, b), eq(connections.eventId, eventId))).limit(1);
  return row ?? null;
}

type Ctx = { event: { id: string; endsAt: Date }; open: boolean; mutual: boolean; conn: Awaited<ReturnType<typeof pinkyConnection>> };

/**
 * Everything about the table we shared, or null when the row isn't offered.
 * Nothing here reads the other person's profile: whether the row shows never
 * depends on them (owner card C2).
 */
async function load(db: Db, me: Profile, otherId: string): Promise<Ctx | null> {
  if (otherId === me.accountId || !pinkyOn(me)) return null;
  const [event, blocked] = await Promise.all([sharedEvent(db, me.accountId, otherId), blockedEitherWay(db, me.accountId, otherId)]);
  if (!event) return null;
  const conn = await pinkyConnection(db, event.id, me.accountId, otherId);
  const mutual = !!conn && !conn.removedAt && conn.level === "romance";
  const open = peopleWindow(event.endsAt) === "open";
  if (!pinkyOffered(me, { met: true, blocked, windowOpen: open, mutual })) return null;
  return { event, open, mutual, conn };
}

/** What `me` may see on `otherId`'s card: my own tap and a mutual Pinky, nothing about theirs. Null: no row. */
export async function pinkyState(db: Db, me: Profile, otherId: string): Promise<PinkyState | null> {
  const ctx = await load(db, me, otherId);
  if (!ctx) return null;
  const mine = await myChoice(db, ctx.event.id, me.accountId, otherId);
  return { eventId: ctx.event.id, mine: mine?.choice === "romance", mutual: ctx.mutual, connectionId: ctx.conn && !ctx.conn.removedAt ? ctx.conn.id : null, open: ctx.open };
}

/**
 * Hook my pinky. It is stored whatever the other person's status, and the
 * caller answers the same way every time: only a mutual Pinky ever changes
 * anything they can see. It unlocks when they tapped too and every rule
 * holds. Their profile is read only here, to decide that.
 */
export async function tapPinky(env: Env, db: Db, me: Profile, otherId: string): Promise<void> {
  const ctx = await load(db, me, otherId);
  if (!ctx || !ctx.open || ctx.mutual) return;
  const eventId = ctx.event.id;
  await db
    .insert(connectionChoices)
    .values({ id: newId(), eventId, fromAccount: me.accountId, toAccount: otherId, choice: "romance" })
    .onConflictDoUpdate({ target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount], set: { choice: "romance" } });
  const [[them], theirs] = await Promise.all([db.select().from(profiles).where(eq(profiles.accountId, otherId)).limit(1), myChoice(db, eventId, otherId, me.accountId)]);
  if (!them) return;
  const unlocked = pinkyUnlocked({
    taps: [true, theirs?.choice === "romance"],
    sides: [me, them],
    blocked: false,
    bothCheckedIn: true,
  });
  if (!unlocked) return;
  const [a, b] = pair(me.accountId, otherId);
  // Neutral words: a phone's lock screen never says "date".
  const th = "มีเรื่องดี ๆ รอคุณอยู่ที่คนรู้จัก";
  const en = "Something nice is waiting in My people";
  await batch(env, [
    db
      .insert(connections)
      .values({ id: newId(), aAccount: a, bAccount: b, level: "romance", eventId })
      .onConflictDoUpdate({ target: [connections.aAccount, connections.bAccount, connections.eventId], set: { level: "romance", removedAt: null } }),
    notify(db, me.accountId, "connection", th, en, `/people/${otherId}`),
    notify(db, otherId, "connection", th, en, `/people/${me.accountId}`),
  ]);
}

/**
 * Step back: my tap is withdrawn, quietly (deleted, never turned into a
 * "friend" pick I didn't make). If we were a Pinky, it goes back to friends
 * and BOTH taps are cleared (owner, C4 panel), so nothing is left waiting for
 * either of us. Returns "friends" when a Pinky ended, so the page can say so
 * kindly.
 */
export async function stepBack(env: Env, db: Db, me: Profile, otherId: string): Promise<"friends" | "withdrawn" | null> {
  const event = await sharedEvent(db, me.accountId, otherId);
  if (!event) return null;
  const [mine, conn] = await Promise.all([myChoice(db, event.id, me.accountId, otherId), pinkyConnection(db, event.id, me.accountId, otherId)]);
  const mutual = !!conn && !conn.removedAt && conn.level === "romance";
  const writes: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  if (mutual) {
    writes.push(withdrawPairTaps(db, me.accountId, otherId, event.id), db.update(connections).set({ level: "friend" }).where(eq(connections.id, conn.id)));
  } else if (mine?.choice === "romance") {
    writes.push(db.delete(connectionChoices).where(eq(connectionChoices.id, mine.id)));
  }
  if (!writes.length) return null;
  await batch(env, writes);
  return mutual ? "friends" : "withdrawn";
}

/**
 * Both people's Pinky taps on each other, deleted: at one event or pairing
 * key, or everywhere (a block withdraws both, owner C4 panel).
 */
export function withdrawPairTaps(db: Db, x: string, y: string, key?: string) {
  const pairWhere = or(and(eq(connectionChoices.fromAccount, x), eq(connectionChoices.toAccount, y)), and(eq(connectionChoices.fromAccount, y), eq(connectionChoices.toAccount, x)));
  return db.delete(connectionChoices).where(and(eq(connectionChoices.choice, "romance"), pairWhere, key ? eq(connectionChoices.eventId, key) : undefined));
}

/** My buddy Pinky tap on this pairing, withdrawn (I asked to wrap up). */
export function withdrawBuddyTap(db: Db, matchId: string, accountId: string) {
  return db.delete(connectionChoices).where(and(eq(connectionChoices.eventId, buddyKey(matchId)), eq(connectionChoices.fromAccount, accountId), eq(connectionChoices.choice, "romance")));
}

/**
 * 💘 switched off (owner card, 2026-10-26): every tap I made is withdrawn,
 * not turned into a "friend" pick I never made, and every Pinky I'm in goes
 * back to friends, silently.
 */
export function endPinkies(db: Db, accountId: string) {
  return [
    db.delete(connectionChoices).where(and(eq(connectionChoices.fromAccount, accountId), eq(connectionChoices.choice, "romance"))),
    db
      .update(connections)
      .set({ level: "friend" })
      .where(and(eq(connections.level, "romance"), isNull(connections.removedAt), or(eq(connections.aAccount, accountId), eq(connections.bAccount, accountId)))),
  ];
}
