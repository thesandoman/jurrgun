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
 *   svcloud secrets remove jurrgun SETUP_KEY
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb, unlockTables } from "../db";
import type { AppEnv } from "../lib/env";
import { safeEqual } from "../lib/crypto";
import { MIGRATIONS } from "../migrations";
import { accounts } from "../schema";
import { audit } from "../lib/records";

export const setup = new Hono<AppEnv>();

setup.use("*", async (c, next) => {
  const key = c.env.SETUP_KEY;
  if (!key) return c.json({ error: "Not found" }, 404);
  const given = c.req.header("x-setup-key") ?? "";
  if (given.length !== key.length || !safeEqual(given, key)) return c.json({ error: "Forbidden" }, 403);
  await next();
});

setup.post("/migrate", async (c) => {
  const db = getDb(c.env);
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS app_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set((await db.execute<{ id: string }>(sql`SELECT id FROM app_migrations LIMIT 1000`)).map((r) => (Array.isArray(r) ? String(r[0]) : r.id)));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    let unlocked = false;
    for (const statement of m.statements) {
      // New tables start schema-locked; indexes and ALTERs need them unlocked.
      if (!unlocked && !/^CREATE TABLE/i.test(statement)) {
        await unlockTables(c.env);
        unlocked = true;
      }
      await db.execute(sql.raw(statement));
    }
    if (!unlocked) await unlockTables(c.env);
    await db.execute(sql`INSERT INTO app_migrations (id) VALUES (${m.id})`);
    applied.push(m.id);
  }
  return c.json({ applied, alreadyApplied: [...done] });
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
