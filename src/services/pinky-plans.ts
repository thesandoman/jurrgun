/**
 * Pinky Plans with the database (owner, 2026-10-26; rules in src/domain/pinky-plans.ts).
 *
 * A Pinky lives on a romance connection. social_pinkies and that connection
 * always change in ONE batch (3 Wise Men condition), so the two never drift:
 *  - startPinky goes in the same batch as the connection becoming "romance";
 *  - endPinky goes in the same batch as the connection leaving "romance"
 *    (Back to friends, End kindly, 💘 off, a block).
 *
 * Ending deletes the Pinky, its plan, its idea count and the chat messages the
 * two sent during the Pinky period, except any message with a report: the
 * report keeps its own copy and the message stays until the review ends.
 * Nothing here is audited: staff never see Pinky.
 */
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { getDb } from "../db";
import { bkkDayStart } from "../domain/pulse-heard";
import { dayIdeas, ideaBatch, sharedKinds } from "../domain/pinky-plans";
import type { DateIdea } from "../content/date-ideas";
import { newId } from "../lib/crypto";
import { buddyMatches, chatMessages, connections, datingIntents, pinkies, pinkyIdeaViews, pinkyPlans, reports, type Pinky } from "../schema";

type Db = ReturnType<typeof getDb>;
type Write = { toSQL(): { sql: string; params: unknown[] } };

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** The new Pinky, written in the same batch as its connection becoming "romance". */
export function startPinky(db: Db, p: { x: string; y: string; source: "table" | "buddy"; sourceKey: string; connectionId: string }): Write {
  const [a, b] = pair(p.x, p.y);
  return db
    .insert(pinkies)
    .values({ id: newId(), aAccount: a, bAccount: b, source: p.source, sourceKey: p.sourceKey, connectionId: p.connectionId })
    .onConflictDoNothing({ target: pinkies.connectionId });
}

/**
 * Every write that ends the Pinkies matching `which` (a WHERE on
 * social_pinkies). Chat first, while the Pinky rows still say when it began.
 */
function endWhere(db: Db, which: SQL): Write[] {
  const live = sql`select p.id, p.a_account, p.b_account, p.created_at from ${pinkies} p where ${which}`;
  return [
    // The pair's messages from the Pinky period, in any of their threads (conn: and buddy:), unless reported.
    db.delete(chatMessages).where(
      sql`exists (
        select 1 from (${live}) lp
        where ${chatMessages.createdAt} >= lp.created_at
          and ${chatMessages.sender} in (lp.a_account, lp.b_account)
          and (
            ${chatMessages.thread} in (select 'conn:' || c.id from ${connections} c where c.a_account = lp.a_account and c.b_account = lp.b_account)
            or ${chatMessages.thread} in (
              select 'buddy:' || m.id from ${buddyMatches} m
              where (m.a_account = lp.a_account and m.b_account = lp.b_account) or (m.a_account = lp.b_account and m.b_account = lp.a_account)
            )
          )
      ) and not exists (select 1 from ${reports} r where r.target_message = ${chatMessages.id})`,
    ),
    db.delete(pinkyPlans).where(sql`${pinkyPlans.pinkyId} in (select lp.id from (${live}) lp)`),
    db.delete(pinkyIdeaViews).where(sql`${pinkyIdeaViews.pinkyId} in (select lp.id from (${live}) lp)`),
    db.delete(pinkies).where(sql`${pinkies.id} in (select lp.id from (${live}) lp)`),
  ];
}

/** End the Pinky that lives on this connection (if any). Goes in the batch that moves the connection off "romance". */
export const endPinkyOnConnection = (db: Db, connectionId: string) => endWhere(db, sql`p.connection_id = ${connectionId}`);

/** End every Pinky between these two (a block). */
export function endPinkiesBetween(db: Db, x: string, y: string) {
  const [a, b] = pair(x, y);
  return endWhere(db, sql`p.a_account = ${a} and p.b_account = ${b}`);
}

/** End every Pinky this member is in (💘 off, account deletion). */
export const endPinkiesOf = (db: Db, accountId: string) => endWhere(db, sql`(p.a_account = ${accountId} or p.b_account = ${accountId})`);

/** The Pinky with this id, only for one of its two people. */
export async function pinkyFor(db: Db, id: string, me: string): Promise<Pinky | null> {
  const [p] = await db
    .select()
    .from(pinkies)
    .where(and(eq(pinkies.id, id), or(eq(pinkies.aAccount, me), eq(pinkies.bAccount, me))))
    .limit(1);
  return p ?? null;
}

/** Pinky ids by connection, for the /connections tag linking to the space. */
export async function pinkyIdsFor(db: Db, connectionIds: string[]): Promise<Map<string, string>> {
  if (!connectionIds.length) return new Map();
  const rows = await db.select({ id: pinkies.id, conn: pinkies.connectionId }).from(pinkies).where(inArray(pinkies.connectionId, connectionIds)).limit(connectionIds.length);
  return new Map(rows.map((r) => [r.conn, r.id]));
}

const bkkDay = (now: Date) => new Date(bkkDayStart(now).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/**
 * Today's ideas for this Pinky: the ones showing now, and whether more are
 * left today. Ranked by the overlap in both people's 💘 first-date answers
 * (nothing new is asked); the reason is never returned.
 */
export async function ideasNow(db: Db, p: Pinky, now = new Date()): Promise<{ ideas: DateIdea[]; more: boolean; batches: number }> {
  const day = bkkDay(now);
  const [prefs, [view]] = await Promise.all([
    db.select({ id: datingIntents.accountId, prefs: datingIntents.prefs }).from(datingIntents).where(inArray(datingIntents.accountId, [p.aAccount, p.bAccount])).limit(2),
    db.select().from(pinkyIdeaViews).where(and(eq(pinkyIdeaViews.pinkyId, p.id), eq(pinkyIdeaViews.day, day))).limit(1),
  ]);
  const first = (id: string) => {
    const v = prefs.find((r) => r.id === id)?.prefs?.firstDate;
    return Array.isArray(v) ? (v as string[]) : [];
  };
  const all = dayIdeas(`${p.id}:${day}`, sharedKinds(first(p.aAccount), first(p.bAccount)));
  const batches = view?.shown ?? 0;
  return { ideas: ideaBatch(all, batches), more: ideaBatch(all, batches + 1).length > 0, batches };
}

/** "Other ideas": move on to the next three today (no-op once they're used up). */
export function showMoreIdeas(db: Db, p: Pinky, now = new Date()) {
  const day = bkkDay(now);
  return db
    .insert(pinkyIdeaViews)
    .values({ id: newId(), pinkyId: p.id, day, shown: 1 })
    .onConflictDoUpdate({ target: [pinkyIdeaViews.pinkyId, pinkyIdeaViews.day], set: { shown: sql`least(${pinkyIdeaViews.shown} + 1, 2)` } });
}
