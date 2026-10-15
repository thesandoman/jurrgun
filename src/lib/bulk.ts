/**
 * Reading and writing lists that can be large (an event can hold 100,000
 * registrations): read in keyset pages, write in chunked statements.
 *
 * Every page query keeps a `.limit()` (SVAGENTS §5) and no statement carries
 * more than WRITE_CHUNK rows, so nothing silently stops at a fixed cap.
 */
import { gt, type AnyColumn, type SQL } from "drizzle-orm";
import { batch, type DatabaseEnv } from "../db";

/** Rows per keyset page. */
export const KEYSET_CHUNK = 2000;
/** Rows per insert / update statement. */
export const WRITE_CHUNK = 1000;
/** Statements per `batch()` call. */
export const STATEMENTS_PER_BATCH = 10;

/**
 * Every row a query matches, read in pages ordered by a unique text id.
 *
 * `page(after, limit)` must run the query with `after` added to its WHERE
 * (it is undefined for the first page), ORDER BY `idCol` ascending, and
 * `.limit(limit)`:
 *
 *   const rows = await keysetAll(registrations.id, (after, n) =>
 *     db.select({ id: registrations.id, accountId: registrations.accountId })
 *       .from(registrations)
 *       .where(and(eq(registrations.eventId, id), after))
 *       .orderBy(asc(registrations.id))
 *       .limit(n));
 */
export async function keysetAll<T extends { id: string }>(
  idCol: AnyColumn,
  page: (after: SQL | undefined, limit: number) => Promise<T[]>,
  chunk = KEYSET_CHUNK,
): Promise<T[]> {
  const out: T[] = [];
  let lastId: string | null = null;
  for (;;) {
    const rows = await page(lastId === null ? undefined : gt(idCol, lastId), chunk);
    out.push(...rows);
    if (rows.length < chunk) return out;
    lastId = rows[rows.length - 1].id;
  }
}

/** Split a list into pieces of at most `size`. */
export function chunks<T>(list: T[], size = WRITE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Statement = Parameters<typeof batch>[1][number];

/**
 * Run statements in order, `per` statements to a `batch()` call. A list that
 * fits one call is all-or-nothing, as before; a longer one commits call by call.
 */
export async function batchAll(env: DatabaseEnv, statements: Statement[], per = STATEMENTS_PER_BATCH): Promise<void> {
  for (const group of chunks(statements, per)) await batch(env, group);
}
