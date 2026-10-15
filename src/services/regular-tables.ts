/**
 * Regular tables (โต๊ะประจำ) against the database: who sits at a table, the
 * tables a member is part of, and sending a Table Host's hangout to the
 * table. The rules themselves live in src/domain/regular-tables.ts; the pages
 * in src/routes/tables.tsx.
 */
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { batch, getDb, type DatabaseEnv } from "../db";
import { newId, randomToken } from "../lib/crypto";
import { audit, notify } from "../lib/records";
import { accounts, blocks, circleShares, events, profiles, regularTableConflicts, regularTableMembers, regularTables, registrations, type Event, type RegularTable } from "../schema";
import { isWoman } from "../domain/rules";
import { conflictPair, DESCRIPTION_MAX, NAME_MAX } from "../domain/regular-tables";

type Db = ReturnType<typeof getDb>;

/** The insert for a new regular table (for a batch). */
export function newTable(db: Db, t: { hostAccountId: string; name: string; district: string; description?: string; requestId?: string | null }) {
  const id = newId();
  return {
    id,
    query: db.insert(regularTables).values({
      id,
      hostAccountId: t.hostAccountId,
      name: t.name.slice(0, NAME_MAX),
      district: t.district,
      description: (t.description ?? "").replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX),
      joinToken: randomToken(18),
      requestId: t.requestId ?? null,
    }),
  };
}

export async function getTable(db: Db, id: string): Promise<RegularTable | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const [t] = await db.select().from(regularTables).where(and(eq(regularTables.id, id), isNull(regularTables.archivedAt))).limit(1);
  return t ?? null;
}

/** The host's open regular table, if they have one. */
export async function hostTable(db: Db, hostId: string): Promise<RegularTable | null> {
  const [t] = await db
    .select()
    .from(regularTables)
    .where(and(eq(regularTables.hostAccountId, hostId), isNull(regularTables.archivedAt)))
    .orderBy(desc(regularTables.createdAt))
    .limit(1);
  return t ?? null;
}

/** Everyone with a block either way with `me`, among `others`. */
export async function blockedAmong(db: Db, me: string, others: string[]): Promise<Set<string>> {
  if (!others.length) return new Set();
  const rows = await db
    .select({ a: blocks.blocker, b: blocks.blocked })
    .from(blocks)
    .where(or(and(eq(blocks.blocker, me), inArray(blocks.blocked, others)), and(eq(blocks.blocked, me), inArray(blocks.blocker, others))))
    .limit(1000);
  return new Set(rows.map((r) => (r.a === me ? r.b : r.a)));
}

/** Current members (not the host), newest last. */
export async function memberIds(db: Db, tableId: string): Promise<string[]> {
  const rows = await db
    .select({ id: regularTableMembers.accountId })
    .from(regularTableMembers)
    .where(and(eq(regularTableMembers.tableId, tableId), isNull(regularTableMembers.leftAt)))
    .orderBy(regularTableMembers.joinedAt)
    .limit(200);
  return rows.map((r) => r.id);
}

/**
 * Where `me` stands with this table. A member who has a block either way with
 * the host is treated as outside it (and the table is hidden from them).
 */
export async function standing(db: Db, t: RegularTable, me: string): Promise<{ isHost: boolean; isMember: boolean; blockedWithHost: boolean }> {
  if (t.hostAccountId === me) return { isHost: true, isMember: true, blockedWithHost: false };
  const [[row], blocked] = await Promise.all([
    db
      .select({ id: regularTableMembers.id })
      .from(regularTableMembers)
      .where(and(eq(regularTableMembers.tableId, t.id), eq(regularTableMembers.accountId, me), isNull(regularTableMembers.leftAt)))
      .limit(1),
    blockedAmong(db, me, [t.hostAccountId]),
  ]);
  const blockedWithHost = blocked.size > 0;
  return { isHost: false, isMember: !!row && !blockedWithHost, blockedWithHost };
}

/** The regular tables `me` hosts or sits at, open ones only. */
export async function myTables(db: Db, me: string): Promise<(RegularTable & { hosting: boolean })[]> {
  const joined = await db
    .select({ id: regularTableMembers.tableId })
    .from(regularTableMembers)
    .where(and(eq(regularTableMembers.accountId, me), isNull(regularTableMembers.leftAt)))
    .limit(50);
  const ids = joined.map((j) => j.id);
  const rows = await db
    .select()
    .from(regularTables)
    .where(and(isNull(regularTables.archivedAt), ids.length ? or(eq(regularTables.hostAccountId, me), inArray(regularTables.id, ids)) : eq(regularTables.hostAccountId, me)))
    .orderBy(desc(regularTables.createdAt))
    .limit(60);
  const hidden = await blockedAmong(db, me, [...new Set(rows.filter((r) => r.hostAccountId !== me).map((r) => r.hostAccountId))]);
  return rows.filter((r) => !hidden.has(r.hostAccountId)).map((r) => ({ ...r, hosting: r.hostAccountId === me }));
}

/** Did `me` go to a hangout with this host (a confirmed seat at one of their events that has started)? */
export async function wentWithHost(db: Db, hostId: string, me: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, me), eq(registrations.status, "confirmed"), eq(events.hostAccountId, hostId), lte(events.startsAt, now)))
    .limit(1);
  return !!row;
}

/** May `me` see this table hangout because they sit at its table? */
export async function seatedFor(db: Db, e: Pick<Event, "regularTableId">, me: string): Promise<boolean> {
  if (!e.regularTableId) return false;
  const t = await getTable(db, e.regularTableId);
  return !!t && (await standing(db, t, me)).isMember;
}

const SEND_MAX = 100;

/**
 * Sends a published hangout to everyone at the host's regular table: each
 * gets a notification, and it shows under Group hangouts on My people. Members
 * with a block either way with the host, and accounts that aren't active, are
 * skipped. Safe to repeat: people already sent to are skipped. Returns how
 * many were sent to now.
 */
export async function sendToTable(env: DatabaseEnv, e: Event, t: RegularTable, hostNick: string): Promise<number> {
  const db = getDb(env);
  if (e.status !== "published" || e.regularTableId !== t.id) return 0;
  const host = t.hostAccountId;
  const [ids, already] = await Promise.all([memberIds(db, t.id), db.select({ to: circleShares.toAccount }).from(circleShares).where(eq(circleShares.eventId, e.id)).limit(1000)]);
  const sent = new Set(already.map((x) => x.to));
  const blocked = await blockedAmong(db, host, ids);
  const candidates = ids.filter((id) => !sent.has(id) && !blocked.has(id) && id !== host);
  const active = candidates.length
    ? (await db.select({ id: accounts.id, status: accounts.status }).from(accounts).where(inArray(accounts.id, candidates)).limit(candidates.length)).filter((a) => a.status === "active").map((a) => a.id)
    : [];
  const to = active.slice(0, SEND_MAX);
  if (!to.length) return 0;
  await batch(env, [
    db
      .insert(circleShares)
      .values(to.map((id) => ({ id: newId(), eventId: e.id, fromAccount: host, toAccount: id, createdAt: new Date() })))
      .onConflictDoNothing({ target: [circleShares.eventId, circleShares.toAccount] }),
    ...to.map((id) =>
      notify(db, id, "table_hangout", `${hostNick} ชวนโต๊ะประจำ "${t.name}" ไปแฮงเอาต์: ${e.title}`, `${hostNick} invited "${t.name}" to a hangout: ${e.titleEn ?? e.title}`, `/events/${e.id}`),
    ),
    audit(db, host, "event.table_share", { type: "event", id: e.id }, { table: t.id }),
  ]);
  return to.length;
}

/** When the host asked `me` to step back from this table, the date they may join again (null otherwise). */
export async function rejoinAfterFor(db: Db, tableId: string, me: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: regularTableMembers.rejoinAfter })
    .from(regularTableMembers)
    .where(and(eq(regularTableMembers.tableId, tableId), eq(regularTableMembers.accountId, me)))
    .limit(1);
  return row?.at ?? null;
}

/**
 * After `x` and `y` block each other: for every regular table they both sit
 * at, open a conflict for the host to decide on (nobody is removed), and tell
 * the host privately. The pair is stored and named in id order, so neither the
 * record nor the notification says who blocked whom, and no reason is kept.
 * A pair already raised at a table isn't raised again.
 */
export async function raiseConflicts(env: DatabaseEnv, x: string, y: string): Promise<number> {
  const db = getDb(env);
  const rows = await db
    .select({ tableId: regularTableMembers.tableId, accountId: regularTableMembers.accountId })
    .from(regularTableMembers)
    .where(and(inArray(regularTableMembers.accountId, [x, y]), isNull(regularTableMembers.leftAt)))
    .limit(200);
  const shared = [...new Set(rows.map((r) => r.tableId))].filter((t) => rows.some((r) => r.tableId === t && r.accountId === x) && rows.some((r) => r.tableId === t && r.accountId === y));
  if (!shared.length) return 0;
  const tables = await db.select().from(regularTables).where(and(inArray(regularTables.id, shared), isNull(regularTables.archivedAt))).limit(shared.length);
  const [a, b] = conflictPair(x, y);
  const names = await db.select({ id: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, [a, b])).limit(2);
  const n = (id: string) => names.find((r) => r.id === id)?.nickname ?? "";
  let raised = 0;
  for (const t of tables) {
    const made = await db
      .insert(regularTableConflicts)
      .values({ id: newId(), tableId: t.id, aAccount: a, bAccount: b })
      .onConflictDoNothing({ target: [regularTableConflicts.tableId, regularTableConflicts.aAccount, regularTableConflicts.bAccount] })
      .returning({ id: regularTableConflicts.id });
    if (!made.length) continue;
    raised++;
    await notify(
      db,
      t.hostAccountId,
      "table_conflict",
      `สองคนในโต๊ะประจำของคุณมีเรื่องไม่สบายใจกัน: ${n(a)} กับ ${n(b)}`,
      `Two people at your regular table aren't comfortable with each other: ${n(a)} and ${n(b)}`,
      `/tables/${t.id}/conflicts`,
    );
  }
  return raised;
}

/**
 * "Regular at" on a profile card: the open tables the member hosts or sits
 * at, minus any the viewer couldn't join (women-only for someone who isn't a
 * woman or non-binary) and any whose host has a block either way with the viewer.
 */
export async function regularAt(db: Db, owner: string, viewer: { id: string; gender?: string | null }): Promise<string[]> {
  const tables = await myTables(db, owner);
  const open = tables.filter((t) => !t.womenOnly || isWoman(viewer));
  if (viewer.id === owner) return open.map((t) => t.name);
  const hidden = await blockedAmong(db, viewer.id, [...new Set(open.map((t) => t.hostAccountId))]);
  return open.filter((t) => !hidden.has(t.hostAccountId)).map((t) => t.name);
}
