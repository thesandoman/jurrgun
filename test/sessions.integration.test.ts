/**
 * Card S4 (owner, 2026-10-27): idle timeout, last seen, signed-in devices and
 * "sign out on all other devices".
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import app from "../src/index";
import { createMember, db, ENV, HAS_DB, req, TEST_PASSWORD } from "./helpers";
import { auditLog, sessions } from "../src/schema";
import { randomToken, sha256 } from "../src/lib/crypto";

const DAY = 86_400_000;
const sid = async (cookie: string) => sha256(cookie.replace(/^bkk_sid=/, ""));

async function extraSession(accountId: string, device: string) {
  const token = randomToken();
  await db().insert(sessions).values({ id: await sha256(token), accountId, expiresAt: new Date(Date.now() + 10 * DAY), device, lastSeenAt: new Date() });
  return `bkk_sid=${token}`;
}

describe.skipIf(!HAS_DB)("card S4: sessions", () => {
  it("signs out after 14 days without use and brings the member back to the page", async () => {
    const m = await createMember();
    await db().update(sessions).set({ lastSeenAt: new Date(Date.now() - 15 * DAY) }).where(eq(sessions.id, await sid(m.cookie)));
    const r = await req("/settings/consents", { cookie: m.cookie });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(`/login?next=${encodeURIComponent("/settings/consents")}`);
    expect(await db().select().from(sessions).where(eq(sessions.id, await sid(m.cookie))).limit(1)).toHaveLength(0);
  });

  it("refreshes last seen at most once an hour", async () => {
    const m = await createMember();
    const id = await sid(m.cookie);
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await db().update(sessions).set({ lastSeenAt: old }).where(eq(sessions.id, id));
    await req("/settings", { cookie: m.cookie });
    const [a] = await db().select({ at: sessions.lastSeenAt }).from(sessions).where(eq(sessions.id, id)).limit(1);
    expect(a.at!.getTime()).toBeGreaterThan(old.getTime());
    await req("/settings", { cookie: m.cookie });
    const [b] = await db().select({ at: sessions.lastSeenAt }).from(sessions).where(eq(sessions.id, id)).limit(1);
    expect(b.at!.getTime()).toBe(a.at!.getTime());
  });

  it("lists devices by kind and date only, and signs out the others but not this one", async () => {
    const m = await createMember();
    const phone = await extraSession(m.id, "phone");
    const html = await (await req("/settings/devices?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain('data-device="phone"');
    expect(html).toContain("This device");
    expect(html).toContain("Sign out on all other devices (1)");
    const r = await req("/settings/devices/sign-out-others", { cookie: m.cookie, form: {} });
    expect(r.headers.get("location")).toBe("/settings/devices?notice=signed_out_others");
    expect((await req("/settings", { cookie: m.cookie })).status).toBe(200);
    expect((await req("/settings", { cookie: phone })).status).toBe(302);
    const logged = await db().select().from(auditLog).where(and(eq(auditLog.actor, m.id), eq(auditLog.action, "account.signed_out_others"))).limit(1);
    expect(logged).toHaveLength(1);
  });

  it("stores the device kind at sign-in, never the user agent", async () => {
    const m = await createMember();
    const r = await app.request(
      "/login",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile" },
        body: new URLSearchParams({ username: m.username, password: TEST_PASSWORD }).toString(),
      },
      ENV,
    );
    expect(r.status).toBe(302);
    const token = /bkk_sid=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];
    const [row] = await db().select().from(sessions).where(eq(sessions.id, await sha256(token!))).limit(1);
    expect(row.device).toBe("phone");
    expect(JSON.stringify(row)).not.toContain("iPhone OS");
  });
});
