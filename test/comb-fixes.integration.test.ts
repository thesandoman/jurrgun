/**
 * Fixes from the October bug comb: redirect safety, bad-input crashes,
 * duplicate side effects from overlapping page loads, cancelled-event offers,
 * moderators reviving deactivated accounts, CSV formula cells.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import { accounts, buddyPairs, events, notifications, profiles, registrations, reports } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { safeNext } from "../src/ui/kit";
import { csvField } from "../src/routes/admin/pulse";
import { refreshWaitlist, runBuddyRound } from "../src/services/events";

const HOUR = 3_600_000;

describe("safe redirects and CSV cells", () => {
  it("refuses next/back values a browser would turn into another site", () => {
    expect(safeNext("/\t/evil.example", "/")).toBe("/");
    expect(safeNext("/\n/evil.example", "/")).toBe("/");
    expect(safeNext("/\\evil.example", "/")).toBe("/");
    expect(safeNext("//evil.example", "/")).toBe("/");
    expect(safeNext("/events?q=board games", "/")).toBe("/events?q=board games");
  });

  it("keeps spreadsheet formulas out of exported cells", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("Bang Rak")).toBe("Bang Rak");
  });
});

async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * 24 * HOUR);
  await db().insert(events).values({ id, title: `EV-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", ...over });
  return id;
}
const reg = (eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) =>
  db().insert(registrations).values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(), ...over });

describe.skipIf(!HAS_DB)("bug comb fixes", () => {
  it("never redirects off-site or crashes on control characters in back/next", async () => {
    const tab = await req("/lang/en?back=%2F%09%2Fevil.example");
    expect(tab.status).toBe(302);
    expect(tab.headers.get("location") ?? "").not.toContain("evil.example");
    expect((await req("/lang/en?back=%2F%0A%2Fx")).status).toBe(302);
    expect((await req("/login", { form: { username: "a\u0000b", password: "x" } })).status).toBeLessThan(500);
  });

  it("rejects impossible input instead of crashing or storing nonsense", async () => {
    const m = await createMember();
    expect((await req("/settings/connections", { cookie: m.cookie, form: { relationship: "prefer_not", ageMin: "30.5", ageMax: "40.2" } })).status).toBeLessThan(500);
    const [p] = await db().select({ ageMin: profiles.ageMin }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.ageMin).toBe(30);

    const fresh = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, fresh.id));
    const bad = await req("/onboarding/basics", { cookie: fresh.cookie, form: { nickname: "Lek", birthDate: "1990-02-31", district: "bang_rak", residency: "lives" } });
    expect(bad.status).toBe(400);
    expect((await req("/onboarding/basics", { cookie: fresh.cookie, form: { nickname: "Lek", birthDate: "1990-13-01", district: "bang_rak", residency: "lives" } })).status).toBe(400);
    expect((await req("/onboarding/wellbeing", { cookie: m.cookie, form: { q1: "1.5", q2: "2", q3: "3" } })).status).toBeLessThan(500);
  });

  it("runs the buddy round once even when several pages load at the same moment", async () => {
    const [a, b, c2, d] = await Promise.all([createMember(), createMember(), createMember(), createMember()]);
    const ev = await mkEvent({ startsAt: new Date(Date.now() + 10 * HOUR), buddyEnabled: true });
    for (const m of [a, b, c2, d]) await reg(ev, m.id, { wantsBuddy: true });
    const [event] = await db().select().from(events).where(eq(events.id, ev));
    const runs = await Promise.all([1, 2, 3].map(() => runBuddyRound(ENV, event)));
    expect(runs.filter((r) => r.ran)).toHaveLength(1);
    expect((await db().select().from(buddyPairs).where(eq(buddyPairs.eventId, ev))).length).toBeLessThanOrEqual(2);
  });

  it("offers a freed seat once, with one notification, however many pages load", async () => {
    const [x, w] = await Promise.all([createMember(), createMember()]);
    const ev = await mkEvent({ capacity: 1 });
    await reg(ev, w.id, { status: "waitlisted" });
    await Promise.all([1, 2, 3, 4, 5].map(() => refreshWaitlist(ENV, ev)));
    const offers = await db().select().from(notifications).where(and(eq(notifications.accountId, w.id), eq(notifications.kind, "waitlist_offer")));
    expect(offers).toHaveLength(1);
    void x;
  });

  it("won't let a waitlist offer be accepted after staff cancel the event", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    await reg(ev, m.id, { status: "offered", offeredUntil: new Date(Date.now() + 6 * HOUR) });
    await db().update(events).set({ status: "cancelled" }).where(eq(events.id, ev));
    const r = await req(`/events/${ev}/offer`, { cookie: m.cookie, form: { action: "accept" } });
    expect(r.status).toBe(409);
    const [row] = await db().select({ status: registrations.status }).from(registrations).where(and(eq(registrations.eventId, ev), eq(registrations.accountId, m.id)));
    expect(row.status).toBe("offered");
  });

  it("'lift' never switches a deactivated account back on", async () => {
    const [mod, reporter, target] = await Promise.all([createMember({ role: "moderator" }), createMember(), createMember()]);
    const id = newId();
    await db().insert(reports).values({ id, reporter: reporter.id, targetAccount: target.id, reason: "harassment", details: "test" });
    await db().update(accounts).set({ status: "deactivated", deactivatedAt: new Date() }).where(eq(accounts.id, target.id));
    const r = await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "lift", note: "x" } });
    expect(r.status).toBe(400);
    const [acct] = await db().select({ status: accounts.status }).from(accounts).where(eq(accounts.id, target.id));
    expect(acct.status).toBe("deactivated");
  });
});
