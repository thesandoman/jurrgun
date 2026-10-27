/**
 * Demo and test accounts (owner C2, 27 Oct 2026): identity_accounts.is_demo is set
 * by bma_admin only, with an audit row, and flagged accounts are left out of the
 * north star (which also counts members only, never staff or hosts) and of the
 * City Insight funnel.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { accounts, auditLog, connections, events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { weeklyReconnected } from "../src/routes/admin/dashboard";
import { segmentFunnel } from "../src/routes/admin/insights";

const DAY = 86_400_000;

/** a and b met 40 days ago, then both checked in at a table 2 days ago. */
async function reconnect(a: Member, b: Member, host: Member) {
  const now = Date.now();
  const mk = async (daysAgo: number) => {
    const id = newId();
    const endsAt = new Date(now - daysAgo * DAY);
    await db().insert(events).values({ id, title: "Demo flag", startsAt: new Date(endsAt.getTime() - 2 * 3_600_000), endsAt, venueName: "V", district: "bang_rak", capacity: 10, status: "published", createdBy: host.id, hostAccountId: host.id });
    return { id, at: new Date(endsAt.getTime() - 3_600_000) };
  };
  const [first, recent] = await Promise.all([mk(40), mk(2)]);
  const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await db().insert(connections).values({ id: newId(), aAccount: lo, bAccount: hi, level: "friend", eventId: first.id, createdAt: new Date(now - 40 * DAY) });
  for (const m of [a, b]) await db().insert(registrations).values({ id: newId(), eventId: recent.id, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: recent.at });
}

const since = () => new Date(Date.now() - 7 * DAY);

describe.skipIf(!HAS_DB)("demo and test accounts", () => {
  it("leaves demo accounts, staff and hosts out of the north star", async () => {
    const host = await createMember({ role: "host" });
    const [a, b] = await Promise.all([createMember(), createMember()]);
    await reconnect(a, b, host);
    expect(await weeklyReconnected(db(), since(), [a.id, b.id])).toBe(2);

    await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, b.id));
    // a sat with a demo account, and b is one: neither counts.
    expect(await weeklyReconnected(db(), since(), [a.id, b.id])).toBe(0);

    const staff = await createMember({ role: "moderator" });
    const c = await createMember();
    await reconnect(staff, c, host);
    expect(await weeklyReconnected(db(), since(), [staff.id, c.id])).toBe(1);
  });

  it("leaves everything at a demo-hosted table out", async () => {
    const demoHost = await createMember({ role: "host" });
    await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, demoHost.id));
    const [a, b] = await Promise.all([createMember(), createMember()]);
    await reconnect(a, b, demoHost);
    expect(await weeklyReconnected(db(), since(), [a.id, b.id])).toBe(0);
  });

  it("leaves demo accounts out of the City Insight funnel", async () => {
    const [real, demo] = await Promise.all([createMember(), createMember()]);
    await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, demo.id));
    const from = new Date(Date.now() - DAY).toISOString();
    const to = new Date(Date.now() + DAY).toISOString();
    const rows = await segmentFunnel(db(), from, to, [real.id, demo.id]);
    expect(rows.reduce((n, r) => n + r.members, 0)).toBe(1);
    expect(rows.reduce((n, r) => n + r.joined, 0)).toBe(1);
  });

  it("lets only a BMA admin set the flag, and audits every change", async () => {
    const [admin, mod, m] = await Promise.all([createMember({ role: "bma_admin" }), createMember({ role: "moderator" }), createMember()]);
    expect((await req(`/admin/users/${m.id}/demo`, { cookie: mod.cookie, form: { value: "yes" } })).status).toBe(403);
    expect((await req(`/admin/users/${m.id}/demo`, { cookie: admin.cookie, form: { value: "maybe" } })).status).toBe(400);
    expect((await req(`/admin/users/${m.id}/demo`, { cookie: admin.cookie, form: { value: "yes" } })).status).toBe(302);
    const [acct] = await db().select({ isDemo: accounts.isDemo }).from(accounts).where(eq(accounts.id, m.id));
    expect(acct.isDemo).toBe(true);
    const rows = await db().select().from(auditLog).where(and(eq(auditLog.actor, admin.id), eq(auditLog.action, "users.set_demo")));
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toMatchObject({ from: false, to: true });
    const page = await (await req(`/admin/users/${m.id}?lang=en`, { cookie: admin.cookie })).text();
    expect(page).toContain("Yes: left out of every staff figure");
  });
});
