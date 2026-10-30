/**
 * Demo, seed and staff-test accounts (owner C2, 27 Oct 2026). identity_accounts.is_demo
 * marks them; every staff metric leaves them out, and so does anything hosted by one.
 *
 * SQL fragments only, for raw aggregate queries. Research tables are filtered by
 * research id without ever selecting an account: the subquery only removes rows.
 */
import { sql, type SQL } from "drizzle-orm";

/** Account ids flagged as demo. */
export const DEMO_ACCOUNTS = sql`(select id from identity_accounts where is_demo)`;
/** Research codes of demo accounts (research answers are keyed by code, not account). */
export const DEMO_RESEARCH_IDS = sql`(select research_id from identity_accounts where is_demo and research_id is not null)`;
/** Events hosted by a demo account. */
export const DEMO_EVENTS = sql`(select id from social_events where host_account_id in (select id from identity_accounts where is_demo))`;

/** `and <col> is not a demo account`. */
export const notDemo = (col: SQL): SQL => sql`and ${col} not in ${DEMO_ACCOUNTS}`;
/** `and <col> is not a demo event`. */
export const notDemoEvent = (col: SQL): SQL => sql`and ${col} not in ${DEMO_EVENTS}`;
/** `and <col> is not a demo research code`. */
export const notDemoResearch = (col: SQL): SQL => sql`and ${col} not in ${DEMO_RESEARCH_IDS}`;

/**
 * For member-facing services (Dating & Pinky, Discover, people lists): true when an
 * account is real, false for a demo or test one, or one that doesn't exist. Filter
 * where accounts enter a pool, so a row never depends on the other person's status.
 * A viewer who is demo themselves should still see demo accounts (seenBy below).
 */
export async function isRealAccount(db: ReturnType<typeof import("../db").getDb>, id: string): Promise<boolean> {
  const rows = (await db.execute(sql`select is_demo from identity_accounts where id = ${id} limit 1`)) as unknown as unknown[];
  const first = rows[0] as Record<string, unknown> | unknown[] | undefined;
  if (!first) return false;
  const v = Array.isArray(first) ? first[0] : Object.values(first)[0];
  return !(v === true || v === "t" || v === "true");
}

/**
 * `and <col> is visible to this viewer`: demo accounts are hidden from real
 * viewers and signed-out visitors, while a demo viewer sees everything (so local
 * demos and screenshot runs keep their demo world).
 */
export const seenBy = (col: SQL, viewerIsDemo: boolean): SQL => (viewerIsDemo ? sql`` : notDemo(col));

/** The demo accounts among these ids (one query). */
export async function demoAmong(db: ReturnType<typeof import("../db").getDb>, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = (await db.execute(
    sql`select id from identity_accounts where is_demo and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
  )) as unknown as unknown[];
  return new Set(rows.map((r) => String(Array.isArray(r) ? r[0] : Object.values(r as Record<string, unknown>)[0])));
}

/**
 * Who may share a group or a buddy round at this event (owner C2): at a demo-hosted
 * event everyone, anywhere else only real accounts, so a demo account is never
 * seated with, or paired to, a real member. Those left out stay unplaced.
 */
export async function realPeopleFor(db: ReturnType<typeof import("../db").getDb>, hostId: string | null, ids: string[]): Promise<string[]> {
  const demo = await demoAmong(db, hostId ? [...ids, hostId] : ids);
  if (hostId && demo.has(hostId)) return ids;
  return ids.filter((id) => !demo.has(id));
}

/**
 * Viewer-aware in SQL, for services that only hold the viewer's id: an event is
 * visible when it isn't demo-hosted, or when the viewer is a demo account.
 */
export const eventSeenBy = (eventId: SQL, viewerId: string | null): SQL =>
  viewerId
    ? sql`(${eventId} not in ${DEMO_EVENTS} or ${viewerId} in ${DEMO_ACCOUNTS})`
    : sql`${eventId} not in ${DEMO_EVENTS}`;

/**
 * Viewer-aware in SQL for a pair of accounts (a connection, a buddy match): visible
 * when neither is demo, or when the viewer is a demo account (owner C2, 30 Oct 2026:
 * Me-page counts and chat unread counts follow the same rule as people lists).
 */
export const pairSeenBy = (a: SQL, b: SQL, viewerId: SQL | string): SQL =>
  sql`(${viewerId} in ${DEMO_ACCOUNTS} or (${a} not in ${DEMO_ACCOUNTS} and ${b} not in ${DEMO_ACCOUNTS}))`;

/** Chat links (/chat/conn:<id>, /chat/buddy:<id>) whose two people include a demo account. */
export const DEMO_CHAT_LINKS = sql`(
  select '/chat/conn:' || c.id from social_connections c where c.a_account in ${DEMO_ACCOUNTS} or c.b_account in ${DEMO_ACCOUNTS}
  union all
  select '/chat/buddy:' || b.id from social_buddy_matches b where b.a_account in ${DEMO_ACCOUNTS} or b.b_account in ${DEMO_ACCOUNTS}
)`;
