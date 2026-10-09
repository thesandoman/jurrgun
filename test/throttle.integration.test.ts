/**
 * Sign-in and sign-up throttling (PRD §11), against local Postgres.
 * Each test uses its own random client IP so reruns don't collide.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import app from "../src/index";
import { ENV, HAS_DB, TEST_PASSWORD, createMember, db } from "./helpers";
import { randomToken } from "../src/lib/crypto";
import { loginAttempts } from "../src/schema";

const octet = () => Math.floor(Math.random() * 250) + 1;
const randomIp = () => `10.${octet()}.${octet()}.${octet()}`;

function post(path: string, form: Record<string, string>, ip?: string) {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (ip) headers["cf-connecting-ip"] = ip;
  return app.request(path, { method: "POST", headers, body: new URLSearchParams(form).toString() }, ENV);
}

const login = (username: string, password: string, ip?: string) => post("/login", { username, password }, ip);

describe.skipIf(!HAS_DB)("login throttling", () => {
  it("locks a username after 5 failures, even for the right password, without touching others", async () => {
    const ip = randomIp();
    const m = await createMember();
    const other = await createMember();
    for (let i = 0; i < 5; i++) expect((await login(m.username, "wrongpass1", ip)).status).toBe(400);

    const locked = await login(m.username, TEST_PASSWORD, ip);
    expect(locked.status).toBe(429);
    expect(locked.headers.get("set-cookie") ?? "").not.toMatch(/bkk_sid=/);
    const html = await locked.text();
    expect(html).toContain("15 นาที");
    // A locked attempt is not recorded again.
    const rows = await db().select().from(loginAttempts).where(eq(loginAttempts.username, m.username)).limit(50);
    expect(rows.length).toBe(5);

    // Another username from the same IP still works.
    expect((await login(other.username, TEST_PASSWORD, ip)).status).toBe(302);
  });

  it("answers the same way for a username that doesn't exist", async () => {
    const ip = randomIp();
    const ghost = `ghost_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    for (let i = 0; i < 5; i++) expect((await login(ghost, "wrongpass1", ip)).status).toBe(400);
    expect((await login(ghost, "wrongpass1", ip)).status).toBe(429);
  });

  it("clears the failures on a successful sign-in", async () => {
    const ip = randomIp();
    const m = await createMember();
    for (let i = 0; i < 4; i++) await login(m.username, "wrongpass1", ip);
    expect((await login(m.username, TEST_PASSWORD, ip)).status).toBe(302);
    const rows = await db().select().from(loginAttempts).where(eq(loginAttempts.username, m.username)).limit(50);
    expect(rows.length).toBe(0);
    // Four more failures are allowed again before the lock.
    for (let i = 0; i < 4; i++) expect((await login(m.username, "wrongpass1", ip)).status).toBe(400);
    expect((await login(m.username, TEST_PASSWORD, ip)).status).toBe(302);
  });

  it("locks an IP after 20 failures across usernames", async () => {
    const ip = randomIp();
    const m = await createMember();
    for (let i = 0; i < 20; i++) {
      await login(`spray_${i}_${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`, "wrongpass1", ip);
    }
    expect((await login(m.username, TEST_PASSWORD, ip)).status).toBe(429);
    // The same member from a different network is fine.
    expect((await login(m.username, TEST_PASSWORD, randomIp())).status).toBe(302);
  });
});

describe.skipIf(!HAS_DB)("signup throttling", () => {
  it("refuses an 11th sign-up from one IP within the hour", async () => {
    const ip = randomIp();
    const signup = (ipAddr: string) => {
      const username = `s_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
      return post("/signup", { username, password: "longenough1", confirm: "longenough1" }, ipAddr);
    };
    for (let i = 0; i < 10; i++) expect((await signup(ip)).status).toBe(302);
    const r = await signup(ip);
    expect(r.status).toBe(429);
    expect(await r.text()).toContain("1 ชั่วโมง");
    expect((await signup(randomIp())).status).toBe(302);
  });
});
