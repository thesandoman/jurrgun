/**
 * The guarded one-time migration route, run against a FRESH throwaway local
 * database (created and dropped by this test).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import app from "../src/index";
import { ENV, HAS_DB } from "./helpers";

const NAME = `setup_test_${Date.now()}`;
const adminUrl = ENV.DATABASE_URL.replace(/\/[^/]+$/, "/postgres");
const freshUrl = ENV.DATABASE_URL.replace(/\/[^/]+$/, `/${NAME}`);
const env = { DATABASE_URL: freshUrl, SETUP_KEY: "test-setup-key-123" };

describe.skipIf(!HAS_DB)("POST /api/setup/migrate", () => {
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

  it("is invisible without SETUP_KEY and refuses a wrong key", async () => {
    expect((await app.request("/api/setup/migrate", { method: "POST" }, { DATABASE_URL: freshUrl })).status).toBe(404);
    expect((await app.request("/api/setup/migrate", { method: "POST", headers: { "x-setup-key": "nope" } }, env)).status).toBe(403);
  });

  it("creates every table once, and is idempotent", async () => {
    const first = await app.request("/api/setup/migrate", { method: "POST", headers: { "x-setup-key": env.SETUP_KEY } }, env);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { applied: string[] }).applied.length).toBeGreaterThan(0);
    const second = await app.request("/api/setup/migrate", { method: "POST", headers: { "x-setup-key": env.SETUP_KEY } }, env);
    expect(((await second.json()) as { applied: string[] }).applied).toEqual([]);

    const sql = postgres(freshUrl, { max: 1 });
    const tables = await sql`select table_name from information_schema.tables where table_schema='public'`;
    await sql.end();
    const names = tables.map((t) => t.table_name);
    for (const t of ["identity_accounts", "social_events", "social_registrations", "research_pulse_responses", "identity_audit_log"]) {
      expect(names).toContain(t);
    }
  });

  it("promotes an account to admin", async () => {
    const signup = await app.request(
      "/signup",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "username=first_admin&password=longenough1&confirm=longenough1" },
      env,
    );
    expect(signup.status).toBe(302);
    const res = await app.request("/api/setup/promote", { method: "POST", headers: { "x-setup-key": env.SETUP_KEY, "content-type": "application/json" }, body: JSON.stringify({ username: "first_admin" }) }, env);
    expect(await res.json()).toEqual({ ok: true, username: "first_admin", role: "bma_admin" });
  });
});

describe("resumable()", () => {
  it("adds IF NOT EXISTS to tables and indexes, once", async () => {
    const { resumable } = await import("../src/routes/setup");
    expect(resumable('CREATE TABLE "a" (id text)')).toBe('CREATE TABLE IF NOT EXISTS "a" (id text)');
    expect(resumable('CREATE UNIQUE INDEX "i" ON "a" ("id")')).toBe('CREATE UNIQUE INDEX IF NOT EXISTS "i" ON "a" ("id")');
    expect(resumable('CREATE INDEX "j" ON "a" ("id")')).toBe('CREATE INDEX IF NOT EXISTS "j" ON "a" ("id")');
    expect(resumable('CREATE TABLE IF NOT EXISTS "a" (id text)')).toBe('CREATE TABLE IF NOT EXISTS "a" (id text)');
    expect(resumable('ALTER TABLE "p" ADD COLUMN "x" boolean')).toBe('ALTER TABLE "p" ADD COLUMN IF NOT EXISTS "x" boolean');
  });
});
