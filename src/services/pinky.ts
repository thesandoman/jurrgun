/**
 * เกี่ยวก้อย · Pinky, with the database (rules in src/domain/pinky.ts).
 *
 * Privacy rules kept here:
 *  - The other person's choice is read only to decide whether a Pinky
 *    unlocks. It is never returned, shown, counted or logged, so a one-sided
 *    tap never leaks: the tapper sees "your pinky is out" whether or not the
 *    other person did anything, until it is mutual.
 *  - Nothing here writes to the audit log (staff never see romance data).
 *  - Stepping back tells nobody. Ending a Pinky turns it back into friends.
 */
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { batch, type getDb } from "../db";
import { pinkyOffered, pinkyUnlocked, type PinkySide } from "../domain/pinky";
import { peopleWindow } from "../domain/rules";
import { newId } from "../lib/crypto";
import { notify } from "../lib/records";
import { blocks, connectionChoices, connections, datingIntents, events, profiles, registrations, type Profile } from "../schema";

type Db = ReturnType<typeof getDb>;
type Env = Parameters<typeof batch>[0];

export type PinkyState = { eventId: string; mine: boolean; mutual: boolean; connectionId: string | null };

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

async function modeOf(db: Db, ids: string[]): Promise<Map<string, string>> {
  const rows = await db.select({ id: datingIntents.accountId, mode: datingIntents.mode }).from(datingIntents).where(inArray(datingIntents.accountId, ids)).limit(ids.length);
  return new Map(rows.map((r) => [r.id, r.mode]));
}

const side = (p: Profile, mode: string | undefined): PinkySide => ({ ...p, datingMode: mode ?? null });

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

type Ctx = { event: { id: string; endsAt: Date }; mePro: Profile; themPro: Profile; modes: Map<string, string>; blocked: boolean };

/** Everything the rules need, or null when the Pinky row isn't offered at all. */
async function load(db: Db, me: Profile, otherId: string): Promise<Ctx | null> {
  if (otherId === me.accountId) return null;
  const [them] = await db.select().from(profiles).where(eq(profiles.accountId, otherId)).limit(1);
  if (!them) return null;
  const [event, blocked, modes] = await Promise.all([sharedEvent(db, me.accountId, otherId), blockedEitherWay(db, me.accountId, otherId), modeOf(db, [me.accountId, otherId])]);
  if (!pinkyOffered(side(me, modes.get(me.accountId)), side(them, modes.get(otherId)), !!event, blocked)) return null;
  return { event: event!, mePro: me, themPro: them, modes, blocked };
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

/** What `me` may see on `otherId`'s card: my own tap and a mutual Pinky, nothing about theirs. Null: no row. */
export async function pinkyState(db: Db, me: Profile, otherId: string): Promise<PinkyState | null> {
  const ctx = await load(db, me, otherId);
  if (!ctx) return null;
  const [mine, conn] = await Promise.all([myChoice(db, ctx.event.id, me.accountId, otherId), pinkyConnection(db, ctx.event.id, me.accountId, otherId)]);
  const mutual = !!conn && !conn.removedAt && conn.level === "romance";
  return { eventId: ctx.event.id, mine: mine?.choice === "romance", mutual, connectionId: conn && !conn.removedAt ? conn.id : null };
}

/**
 * Hook my pinky. Unlocks a Pinky when they did too and every rule holds.
 * Returns false when the row isn't offered (the caller answers the same way
 * whatever the other person did).
 */
export async function tapPinky(env: Env, db: Db, me: Profile, otherId: string): Promise<boolean> {
  const ctx = await load(db, me, otherId);
  if (!ctx) return false;
  const eventId = ctx.event.id;
  await db
    .insert(connectionChoices)
    .values({ id: newId(), eventId, fromAccount: me.accountId, toAccount: otherId, choice: "romance" })
    .onConflictDoUpdate({ target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount], set: { choice: "romance" } });
  const [theirs, conn] = await Promise.all([myChoice(db, eventId, otherId, me.accountId), pinkyConnection(db, eventId, me.accountId, otherId)]);
  const unlocked = pinkyUnlocked({
    taps: [true, theirs?.choice === "romance"],
    sides: [side(ctx.mePro, ctx.modes.get(me.accountId)), side(ctx.themPro, ctx.modes.get(otherId))],
    blocked: ctx.blocked,
    bothCheckedIn: true,
  });
  if (!unlocked || (conn && !conn.removedAt && conn.level === "romance")) return true;
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
  return true;
}

/**
 * Step back: my tap goes, quietly. If we were a Pinky, it turns back into
 * friends. My choice becomes "friend" when we're connected or People I Met is
 * still open (the same as switching 💘 off), and is removed otherwise.
 */
export async function stepBack(env: Env, db: Db, me: Profile, otherId: string): Promise<void> {
  const event = await sharedEvent(db, me.accountId, otherId);
  if (!event) return;
  const [mine, conn] = await Promise.all([myChoice(db, event.id, me.accountId, otherId), pinkyConnection(db, event.id, me.accountId, otherId)]);
  if (mine?.choice !== "romance" && !(conn && !conn.removedAt && conn.level === "romance")) return;
  const connected = !!conn && !conn.removedAt;
  const keep = connected || peopleWindow(event.endsAt) === "open";
  const writes: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  if (mine?.choice === "romance") {
    writes.push(keep ? db.update(connectionChoices).set({ choice: "friend" }).where(eq(connectionChoices.id, mine.id)) : db.delete(connectionChoices).where(eq(connectionChoices.id, mine.id)));
  }
  if (conn && !conn.removedAt && conn.level === "romance") writes.push(db.update(connections).set({ level: "friend" }).where(eq(connections.id, conn.id)));
  if (writes.length) await batch(env, writes);
}

/**
 * 💘 switched off: every tap I made becomes "friend" and every Pinky I'm in
 * goes back to friends, silently. (Pending People I Met choices are handled
 * the same way by settings.)
 */
export function endPinkies(db: Db, accountId: string) {
  return [
    db.update(connectionChoices).set({ choice: "friend" }).where(and(eq(connectionChoices.fromAccount, accountId), eq(connectionChoices.choice, "romance"))),
    db
      .update(connections)
      .set({ level: "friend" })
      .where(and(eq(connections.level, "romance"), isNull(connections.removedAt), or(eq(connections.aAccount, accountId), eq(connections.bAccount, accountId)))),
  ];
}
