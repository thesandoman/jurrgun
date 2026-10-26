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
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { batch, type getDb } from "../db";
import { BUDDY_PINKY_DAYS, buddyKey, endedKey, pinkyOffered, pinkyOn, pinkyUnlocked } from "../domain/pinky";
import { ROMANCE_AFTER_QUESTS, romanceUnlocked } from "../domain/buddy";
import { endPinkiesOf, endPinkyOnConnection, pinkyIdsFor, startPinky } from "./pinky-plans";
import { romanceCompatible } from "../domain/rules";
import { peopleWindow } from "../domain/rules";
import { newId } from "../lib/crypto";
import { notify } from "../lib/records";
import { blocks, buddyMatches, buddyQuests, connectionChoices, connections, events, profiles, registrations, type Profile } from "../schema";

type Db = ReturnType<typeof getDb>;
type Env = Parameters<typeof batch>[0];

export type PinkyState = { eventId: string; mine: boolean; mutual: boolean; connectionId: string | null; open: boolean; pinkyId?: string | null };

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

/** Whether this pair went "Back to friends" at this pairing key: then no new tap, ever, for that key. */
export async function pinkyEnded(db: Db, x: string, y: string, key: string): Promise<boolean> {
  const rows = await db
    .select({ id: connectionChoices.id })
    .from(connectionChoices)
    .where(and(eq(connectionChoices.eventId, endedKey(key)), or(and(eq(connectionChoices.fromAccount, x), eq(connectionChoices.toAccount, y)), and(eq(connectionChoices.fromAccount, y), eq(connectionChoices.toAccount, x)))))
    .limit(1);
  return rows.length > 0;
}

/** Of these people, the ones I went "Back to friends" with at this event (People I Met keeps romance off for them). */
export async function endedWith(db: Db, me: string, others: string[], key: string): Promise<Set<string>> {
  if (!others.length) return new Set();
  const rows = await db
    .select({ from: connectionChoices.fromAccount, to: connectionChoices.toAccount })
    .from(connectionChoices)
    .where(
      and(
        eq(connectionChoices.eventId, endedKey(key)),
        or(and(eq(connectionChoices.fromAccount, me), inArray(connectionChoices.toAccount, others)), and(eq(connectionChoices.toAccount, me), inArray(connectionChoices.fromAccount, others))),
      ),
    )
    .limit(others.length * 2);
  return new Set(rows.map((r) => (r.from === me ? r.to : r.from)));
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
  const [conn, ended] = await Promise.all([pinkyConnection(db, event.id, me.accountId, otherId), pinkyEnded(db, me.accountId, otherId, event.id)]);
  // After "Back to friends" there is no row and no tap for that table (owner, C4 panel).
  if (ended) return null;
  const mutual = !!conn && !conn.removedAt && conn.level === "romance";
  const open = peopleWindow(event.endsAt) === "open";
  if (!pinkyOffered(me, { met: true, blocked, windowOpen: open, mutual })) return null;
  return { event, open, mutual, conn };
}

/** What `me` may see on `otherId`'s card: my own tap and a mutual Pinky, nothing about theirs. Null: no row. */
export async function pinkyState(db: Db, me: Profile, otherId: string): Promise<PinkyState | null> {
  const ctx = await load(db, me, otherId);
  if (!ctx) return null;
  const [mine, pinkyId] = await Promise.all([myChoice(db, ctx.event.id, me.accountId, otherId), ctx.mutual && ctx.conn ? pinkyIdsFor(db, [ctx.conn.id]).then((m) => m.get(ctx.conn!.id) ?? null) : null]);
  return { eventId: ctx.event.id, mine: mine?.choice === "romance", mutual: ctx.mutual, connectionId: ctx.conn && !ctx.conn.removedAt ? ctx.conn.id : null, open: ctx.open, pinkyId };
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
  // The connection and its Pinky change in one batch (Pinky Plans).
  const connId = ctx.conn?.id ?? newId();
  await batch(env, [
    db
      .insert(connections)
      .values({ id: connId, aAccount: a, bAccount: b, level: "romance", eventId })
      .onConflictDoUpdate({ target: [connections.aAccount, connections.bAccount, connections.eventId], set: { level: "romance", removedAt: null } }),
    startPinky(db, { x: me.accountId, y: otherId, source: "table", sourceKey: eventId, connectionId: connId }),
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
    writes.push(
      withdrawPairTaps(db, me.accountId, otherId, event.id),
      ...endPinkyOnConnection(db, conn.id),
      db.update(connections).set({ level: "friend" }).where(eq(connections.id, conn.id)),
      // No new tap for this table, so nobody can re-tap and pressure the other.
      db
        .insert(connectionChoices)
        .values({ id: newId(), eventId: endedKey(event.id), fromAccount: me.accountId, toAccount: otherId, choice: "none" })
        .onConflictDoNothing({ target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount] }),
    );
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
    // Pinky Plans: turning 💘 off deletes the Pinky rows, plans and Pinky-period chat (3 Wise Men condition).
    ...endPinkiesOf(db, accountId),
    db.delete(connectionChoices).where(and(eq(connectionChoices.fromAccount, accountId), eq(connectionChoices.choice, "romance"))),
    db
      .update(connections)
      .set({ level: "friend" })
      .where(and(eq(connections.level, "romance"), isNull(connections.removedAt), or(eq(connections.aAccount, accountId), eq(connections.bAccount, accountId)))),
  ];
}

// ---------------------------------------------------- buddy-to-partner Pinky --
//
// Owner card C4: the same Pinky between two Bangkok Buddies. The row depends
// only on the viewer and the pairing, never on the buddy's status: I have 💘
// on, we finished ROMANCE_AFTER_QUESTS quests together, neither blocks the
// other, we never went "Back to friends" on this pairing, and the pairing is
// active or ended less than BUDDY_PINKY_DAYS ago (taps expire with it). A
// mutual Pinky keeps showing. Whether it unlocks is checked silently, only at
// the tap (domain/buddy.ts romanceUnlocked). A Pinky never changes quests.

export type BuddyPinkyState = PinkyState & { openUntil: Date | null };

type MatchRow = typeof buddyMatches.$inferSelect;

async function finishedQuests(db: Db, matchId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(buddyQuests)
    .where(and(eq(buddyQuests.matchId, matchId), isNotNull(buddyQuests.aDoneAt), isNotNull(buddyQuests.bDoneAt)))
    .limit(1);
  return row?.n ?? 0;
}

/** When taps on this pairing stop being taken: null while it's active. */
export function buddyOpenUntil(m: Pick<MatchRow, "state" | "endedAt">): Date | null {
  if (m.state !== "ended") return null;
  return new Date((m.endedAt ?? new Date(0)).getTime() + BUDDY_PINKY_DAYS * 86_400_000);
}

type BuddyCtx = { key: string; otherId: string; open: boolean; mutual: boolean; conn: Awaited<ReturnType<typeof pinkyConnection>>; quests: number };

async function loadBuddy(db: Db, me: Profile, m: MatchRow, now = new Date()): Promise<BuddyCtx | null> {
  if (m.aAccount !== me.accountId && m.bAccount !== me.accountId) return null;
  if (!pinkyOn(me) || m.state === "proposed") return null;
  const otherId = m.aAccount === me.accountId ? m.bAccount : m.aAccount;
  const key = buddyKey(m.id);
  const [blocked, ended, conn, quests] = await Promise.all([blockedEitherWay(db, me.accountId, otherId), pinkyEnded(db, me.accountId, otherId, key), pinkyConnection(db, key, me.accountId, otherId), finishedQuests(db, m.id)]);
  if (blocked || ended) return null;
  const mutual = !!conn && !conn.removedAt && conn.level === "romance";
  const until = buddyOpenUntil(m);
  const open = quests >= ROMANCE_AFTER_QUESTS && (!until || until.getTime() > now.getTime());
  if (!mutual && !open) return null;
  return { key, otherId, open, mutual, conn, quests };
}

/** What `me` may see on this buddy pairing: my own tap and a mutual Pinky, nothing about theirs. Null: no row. */
export async function buddyPinkyState(db: Db, me: Profile, m: MatchRow): Promise<BuddyPinkyState | null> {
  const ctx = await loadBuddy(db, me, m);
  if (!ctx) return null;
  const [mine, pinkyId] = await Promise.all([myChoice(db, ctx.key, me.accountId, ctx.otherId), ctx.mutual && ctx.conn ? pinkyIdsFor(db, [ctx.conn.id]).then((x) => x.get(ctx.conn!.id) ?? null) : null]);
  return { eventId: ctx.key, mine: mine?.choice === "romance", mutual: ctx.mutual, connectionId: ctx.conn && !ctx.conn.removedAt ? ctx.conn.id : null, open: ctx.open, openUntil: buddyOpenUntil(m), pinkyId };
}

/** Hook my pinky on my buddy. Stored and answered the same way whatever their status. */
export async function tapBuddyPinky(env: Env, db: Db, me: Profile, m: MatchRow): Promise<void> {
  const ctx = await loadBuddy(db, me, m);
  if (!ctx || !ctx.open || ctx.mutual) return;
  await db
    .insert(connectionChoices)
    .values({ id: newId(), eventId: ctx.key, fromAccount: me.accountId, toAccount: ctx.otherId, choice: "romance" })
    .onConflictDoUpdate({ target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount], set: { choice: "romance" } });
  const [[them], theirs] = await Promise.all([db.select().from(profiles).where(eq(profiles.accountId, ctx.otherId)).limit(1), myChoice(db, ctx.key, ctx.otherId, me.accountId)]);
  if (!them || theirs?.choice !== "romance") return;
  const unlocked = romanceUnlocked({ eligible: [pinkyOn(me), pinkyOn(them)], compatible: romanceCompatible(me, them), blocked: false, finishedQuests: ctx.quests });
  if (!unlocked) return;
  const [a, b] = pair(me.accountId, ctx.otherId);
  const th = "มีเรื่องดี ๆ รอคุณอยู่ที่คนรู้จัก";
  const en = "Something nice is waiting in My people";
  const connId = ctx.conn?.id ?? newId();
  await batch(env, [
    db
      .insert(connections)
      .values({ id: connId, aAccount: a, bAccount: b, level: "romance", eventId: ctx.key })
      .onConflictDoUpdate({ target: [connections.aAccount, connections.bAccount, connections.eventId], set: { level: "romance", removedAt: null } }),
    startPinky(db, { x: me.accountId, y: ctx.otherId, source: "buddy", sourceKey: ctx.key, connectionId: connId }),
    notify(db, me.accountId, "connection", th, en, "/buddy?pinky=open#pinky"),
    notify(db, ctx.otherId, "connection", th, en, "/buddy?pinky=open#pinky"),
  ]);
}

/**
 * Step back on a buddy: my tap goes quietly. A mutual Pinky goes back to the
 * buddy friendship ("activity", what "meet" made), both taps are cleared and
 * no new tap is taken on this pairing.
 */
export async function stepBackBuddy(env: Env, db: Db, me: Profile, m: MatchRow): Promise<"friends" | "withdrawn" | null> {
  if (m.aAccount !== me.accountId && m.bAccount !== me.accountId) return null;
  const otherId = m.aAccount === me.accountId ? m.bAccount : m.aAccount;
  const key = buddyKey(m.id);
  const [mine, conn] = await Promise.all([myChoice(db, key, me.accountId, otherId), pinkyConnection(db, key, me.accountId, otherId)]);
  const mutual = !!conn && !conn.removedAt && conn.level === "romance";
  const writes: { toSQL(): { sql: string; params: unknown[] } }[] = [];
  if (mutual) {
    writes.push(
      withdrawPairTaps(db, me.accountId, otherId, key),
      ...endPinkyOnConnection(db, conn.id),
      db.update(connections).set({ level: "activity" }).where(eq(connections.id, conn.id)),
      db
        .insert(connectionChoices)
        .values({ id: newId(), eventId: endedKey(key), fromAccount: me.accountId, toAccount: otherId, choice: "none" })
        .onConflictDoNothing({ target: [connectionChoices.eventId, connectionChoices.fromAccount, connectionChoices.toAccount] }),
    );
  } else if (mine?.choice === "romance") {
    writes.push(db.delete(connectionChoices).where(eq(connectionChoices.id, mine.id)));
  }
  if (!writes.length) return null;
  await batch(env, writes);
  return mutual ? "friends" : "withdrawn";
}
