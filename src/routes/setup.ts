/**
 * One-time setup for the DEPLOYED database (SVAGENTS.md hard rule 11).
 *
 * Tables are never created while serving normal requests. Instead the owner
 * sets an SV Cloud secret SETUP_KEY, calls these routes once, then removes the
 * secret — with no SETUP_KEY set, every route here answers 404.
 *
 *   svcloud secrets set jurrgun SETUP_KEY <random>
 *   curl -X POST https://…/api/setup/migrate -H "x-setup-key: <random>"
 *   curl -X POST https://…/api/setup/promote -H "x-setup-key: <random>" -d '{"username":"…"}'
 *   SETUP_URL=https://… SETUP_KEY=<random> npx vite-node scripts/load-universities.ts
 *   svcloud secrets remove jurrgun SETUP_KEY
 */
import { Hono } from "hono";
import { count, eq, sql } from "drizzle-orm";
import { batch, getDb, unlockTables } from "../db";
import type { AppEnv } from "../lib/env";
import { safeEqual } from "../lib/crypto";
import { MIGRATIONS } from "../migrations";
import { accounts, socialUniversities } from "../schema";
import { audit } from "../lib/records";

export const setup = new Hono<AppEnv>();

/**
 * Makes a generated statement safe to re-run, so a migration that stopped
 * halfway (e.g. tables created, an index failed) can simply be called again.
 */
export function resumable(statement: string): string {
  return statement
    .replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i, (_m, u: string | undefined) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS `)
    .replace(/^(ALTER TABLE "[^"]+" ADD COLUMN )(?!IF NOT EXISTS)/i, "$1IF NOT EXISTS ");
}

setup.use("*", async (c, next) => {
  const key = c.env.SETUP_KEY;
  if (!key) return c.json({ error: "Not found" }, 404);
  const given = c.req.header("x-setup-key") ?? "";
  if (given.length !== key.length || !safeEqual(given, key)) return c.json({ error: "Forbidden" }, 403);
  await next();
});

type Migration = { id: string; statements: string[] };
export type MigrateResult =
  | { ok: true; applied: { id: string; mode: "transaction" | "stepwise" }[]; alreadyApplied: string[] }
  | { ok: false; error: string; migration: string; statement?: string; detail: string; applied: string[] };

/** A raw statement in the shape batch() takes. */
const raw = (text: string, params: unknown[] = []) => ({ toSQL: () => ({ sql: text, params }) });

/** Statements Postgres refuses inside a transaction. */
const NO_TRANSACTION = /\bCONCURRENTLY\b/i;

/**
 * True when a transaction failed only because the platform's schema lock refused a change to a table
 * (new tables start locked, and only the platform can unlock them, between statements). Such a
 * migration is applied step by step instead, unlocking as it goes.
 */
export function isSchemaLockError(err: unknown): boolean {
  const e = err as { cause?: unknown; message?: unknown };
  return /schema change is disallowed because table .* is locked|schema[_ ]locked/i.test(`${String(e?.message ?? "")} ${String(e?.cause ?? "")} ${String(err)}`);
}

/**
 * Apply every migration not yet recorded in app_migrations. Each one runs as ONE transaction (batch():
 * one atomic call deployed, BEGIN/COMMIT locally), its app_migrations row included, so a migration is
 * all or nothing and nobody can catch it half applied. Statements stay IF NOT EXISTS, so a re-run is safe.
 *
 * Two exceptions run step by step, as before (unlock, retry, record last): a migration with a statement
 * Postgres refuses in a transaction (CONCURRENTLY), and one the platform refuses as a whole because a
 * table it changes is schema locked (the refused transaction rolled back, so nothing was half applied).
 * Any other failure is returned with nothing applied for that migration.
 */
export async function applyMigrations(env: AppEnv["Bindings"], migrations: Migration[]): Promise<MigrateResult> {
  const db = getDb(env);
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS app_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set((await db.execute<{ id: string }>(sql`SELECT id FROM app_migrations LIMIT 1000`)).map((r) => (Array.isArray(r) ? String(r[0]) : r.id)));
  const applied: { id: string; mode: "transaction" | "stepwise" }[] = [];
  const record = (id: string) => raw("INSERT INTO app_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [id]);
  const fail = (m: Migration, err: unknown, statement?: string): MigrateResult => {
    const e = err as { cause?: unknown };
    return { ok: false, error: "migration failed", migration: m.id, statement: statement?.slice(0, 200), detail: String(e?.cause ?? err), applied: applied.map((a) => a.id) };
  };
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    if (!m.statements.some((s) => NO_TRANSACTION.test(s))) {
      try {
        // Existing tables this migration changes must be unlocked before the transaction starts.
        await unlockTables(env);
        await batch(env, [...m.statements.map((s) => raw(resumable(s))), record(m.id)]);
        applied.push({ id: m.id, mode: "transaction" });
        continue;
      } catch (err) {
        if (!isSchemaLockError(err)) return fail(m, err);
        // Refused as a whole by the schema lock: nothing was applied; go step by step below.
      }
    }
    for (const statement of m.statements) {
      const isCreateTable = /^CREATE TABLE/i.test(statement);
      // New tables start schema-locked, and the database may re-lock after a
      // schema change, so unlock before every non-table step and retry.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!isCreateTable) await unlockTables(env);
          await db.execute(sql.raw(resumable(statement)));
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) return fail(m, lastErr, statement);
    }
    await unlockTables(env);
    await batch(env, [record(m.id)]);
    applied.push({ id: m.id, mode: "stepwise" });
  }
  return { ok: true, applied, alreadyApplied: [...done] };
}

setup.post("/migrate", async (c) => {
  const result = await applyMigrations(c.env, MIGRATIONS);
  // Guarded route, owner-only: a failure returns the database's own message so it can be diagnosed.
  if (!result.ok) return c.json(result, 500);
  return c.json({ applied: result.applied.map((a) => a.id), modes: Object.fromEntries(result.applied.map((a) => [a.id, a.mode])), alreadyApplied: result.alreadyApplied });
});

/** Promote an existing account to BMA admin (bootstraps the first staff user). */
setup.post("/promote", async (c) => {
  const body = await c.req.json<{ username?: unknown; role?: unknown }>().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const role = body?.role === undefined ? "bma_admin" : body.role;
  const allowed = ["user", "host", "partner_admin", "moderator", "insight_viewer", "bma_admin"];
  if (!username || typeof role !== "string" || !allowed.includes(role)) {
    return c.json({ error: "username (and optional role) required" }, 400);
  }
  const db = getDb(c.env);
  const [acct] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).limit(1);
  if (!acct) return c.json({ error: "No such account" }, 404);
  await db.update(accounts).set({ role: role as (typeof accounts.$inferSelect)["role"] }).where(eq(accounts.id, acct.id));
  await audit(db, "setup", "role.set", { type: "account", id: acct.id }, { role });
  return c.json({ ok: true, username, role });
});

/** Most rows one /universities call takes (the loader sends batches of 1,000). */
export const UNIVERSITY_BATCH_MAX = 2000;
const UNI_ID = /^[a-z]{2}:[\p{L}\p{M}\p{N}-]{1,200}$/u;

type UniRow = typeof socialUniversities.$inferInsert;

/** One loader row, checked; null when anything is off. */
export function uniRow(v: unknown): UniRow | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : undefined);
  const opt = (x: unknown, max: number) => (x === undefined || x === null ? null : str(x, max) ?? undefined);
  const id = str(r.id, 210);
  const name = str(r.name, 300);
  const cc = typeof r.cc === "string" && /^[A-Z]{2}$/.test(r.cc) ? r.cc : undefined;
  const search = str(r.search, 2000);
  const nameTh = opt(r.nameTh, 300);
  const thFold = opt(r.thFold, 300);
  if (!id || !UNI_ID.test(id) || !name || !cc || !search || nameTh === undefined || thFold === undefined) return null;
  return { id, name, cc, search, nameTh, thFold };
}

/**
 * Load (or refresh) the university list into social_universities (Core
 * Platform C3, migration 0029), then give every bio that picked a university
 * its display name (bio.universityLabel), so cards never need the list.
 * Idempotent: rows upsert by id and only bios still missing a label change.
 * Body: { rows: [{ id, name, cc, nameTh?, search, thFold? }] }; an empty
 * batch just runs the label fill.
 */
setup.post("/universities", async (c) => {
  const body = await c.req.json<{ rows?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.rows) || body.rows.length > UNIVERSITY_BATCH_MAX) {
    return c.json({ error: `rows must be an array of at most ${UNIVERSITY_BATCH_MAX}` }, 400);
  }
  const rows = body.rows.map(uniRow);
  const bad = rows.findIndex((r) => r === null);
  if (bad >= 0) return c.json({ error: "bad row", index: bad }, 400);
  const db = getDb(c.env);
  if (rows.length > 0) {
    await db
      .insert(socialUniversities)
      .values(rows as UniRow[])
      .onConflictDoUpdate({
        target: socialUniversities.id,
        set: {
          name: sql`excluded.name`,
          cc: sql`excluded.cc`,
          nameTh: sql`excluded.name_th`,
          search: sql`excluded.search`,
          thFold: sql`excluded.th_fold`,
        },
      });
  }
  // Raw execute() returns rows as arrays on the deployed database and as objects locally, so only count them;
  // the total comes from a typed select. (Reading { n } / .count from execute() gave "undefined" in prod.)
  const labelled = await db.execute(sql`
    UPDATE social_profiles p
       SET bio = p.bio || jsonb_build_object('universityLabel',
             jsonb_strip_nulls(jsonb_build_object('en', u.name, 'th', u.name_th)))
      FROM social_universities u
     WHERE p.bio->>'university' = u.id
       AND NOT (p.bio ? 'universityLabel')
    RETURNING p.account_id`);
  const [{ n }] = await db.select({ n: count() }).from(socialUniversities);
  return c.json({ upserted: rows.length, labelled: Array.from(labelled as unknown as unknown[]).length, total: n });
});
