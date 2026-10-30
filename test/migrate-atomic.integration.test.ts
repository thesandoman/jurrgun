/**
 * Each migration is all or nothing (Main, 2026-10-30): it runs as one transaction with its
 * app_migrations row, so nobody can catch it half applied. Run against a FRESH throwaway database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { applyMigrations, isSchemaLockError } from "../src/routes/setup";
import { MIGRATIONS } from "../src/migrations";
import { ENV, HAS_DB } from "./helpers";

const NAME = `migrate_atomic_${Date.now()}`;
const adminUrl = ENV.DATABASE_URL.replace(/\/[^/]+$/, "/postgres");
const freshUrl = ENV.DATABASE_URL.replace(/\/[^/]+$/, `/${NAME}`);
const env = { DATABASE_URL: freshUrl } as never;

describe("isSchemaLockError", () => {
  it("recognises the platform's schema-lock refusal, and nothing else", () => {
    expect(isSchemaLockError(new Error('this schema change is disallowed because table "social_events" is locked'))).toBe(true);
    expect(isSchemaLockError({ cause: "ERROR: schema_locked table" })).toBe(true);
    expect(isSchemaLockError(new Error('relation "nope" does not exist'))).toBe(false);
    expect(isSchemaLockError(null)).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("applyMigrations", () => {
  beforeAll(async () => {
    const sql = postgres(adminUrl, { max: 1 });
    await sql.unsafe(`CREATE DATABASE ${NAME}`);
    await sql.end();
  });
  afterAll(async () => {
    const sql = postgres(adminUrl, { max: 1 });
    await sql.unsafe(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);
    await sql.end();
  });

  it("applies every real migration as one transaction each, and only once", async () => {
    const first = await applyMigrations(env, MIGRATIONS);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.applied).toHaveLength(MIGRATIONS.length);
    expect(first.applied.every((a) => a.mode === "transaction")).toBe(true);
    const again = await applyMigrations(env, MIGRATIONS);
    expect(again.ok && again.applied).toEqual([]);
  });

  it("leaves nothing behind when a statement fails: no table, no record", async () => {
    const bad = { id: "zz_atomic_bad", statements: ['CREATE TABLE "zz_atomic" ("id" text PRIMARY KEY NOT NULL)', 'SELECT * FROM "no_such_table"'] };
    const r = await applyMigrations(env, [bad]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.migration).toBe("zz_atomic_bad");
    expect(r.detail).toMatch(/no_such_table/);
    const sql = postgres(freshUrl, { max: 1 });
    try {
      expect(await sql`select 1 from information_schema.tables where table_name = 'zz_atomic'`).toHaveLength(0);
      expect(await sql`select 1 from app_migrations where id = 'zz_atomic_bad'`).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });

  it("a good migration after a bad one still applies, alone and atomically", async () => {
    const good = { id: "zz_atomic_good", statements: ['CREATE TABLE "zz_good" ("id" text PRIMARY KEY NOT NULL)', 'CREATE INDEX "zz_good_idx" ON "zz_good" USING btree ("id")'] };
    const r = await applyMigrations(env, [good]);
    expect(r.ok && r.applied).toEqual([{ id: "zz_atomic_good", mode: "transaction" }]);
  });
});
