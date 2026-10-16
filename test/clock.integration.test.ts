/**
 * The hourly clock (src/services/clock.ts): the day-before reminder and the
 * People I Met note go out once each, only to the right people, never in
 * quiet hours, never against a "no" to event reminders, and never with an
 * Open to something more event's title. Plus the push subscribe route.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import app from "../src/index";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import { consents, events, notifications, pushSubscriptions, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { KIND_TOMORROW, KIND_WINDOW, nextSlot, quietHours, runClock } from "../src/services/clock";

const HOUR = 3_600_000;
// 10:00 in Bangkok today: outside quiet hours whatever time the suite runs.
const day = new Date();
const NOW = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 3, 0, 0));

async function mkEvent(over: Partial<typeof events.$inferInsert>) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(NOW.getTime() + 24 * HOUR);
  await db()
    .insert(events)
    .values({ id, title: `CLK-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", ...over });
  return id;
}

async function mkReg(eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(18), ...over });
}

const mine = (accountId: string, kind: string) =>
  db().select().from(notifications).where(and(eq(notifications.accountId, accountId), eq(notifications.kind, kind))).limit(10);

describe.skipIf(!HAS_DB)("hourly clock", () => {
  it("books the next slot from firedAt and skips missed ones; knows quiet hours", () => {
    expect(nextSlot(10 * HOUR, 10 * HOUR + 5_000)).toBe(11 * HOUR);
    expect(nextSlot(10 * HOUR, 13.5 * HOUR)).toBe(14 * HOUR);
    expect(quietHours(new Date("2026-10-16T14:30:00Z"))).toBe(true); // 21:30 Bangkok
    expect(quietHours(new Date("2026-10-16T00:59:00Z"))).toBe(true); // 07:59
    expect(quietHours(new Date("2026-10-16T01:00:00Z"))).toBe(false); // 08:00
  });

  it("reminds confirmed seats the day before, once", async () => {
    const going = await createMember();
    const waiting = await createMember();
    const ev = await mkEvent({ startsAt: new Date(NOW.getTime() + 24 * HOUR) });
    await mkReg(ev, going.id);
    await mkReg(ev, waiting.id, { status: "waitlisted" });
    await runClock(ENV, NOW);
    const got = await mine(going.id, KIND_TOMORROW);
    expect(got.length).toBe(1);
    expect(got[0].link).toBe(`/me/events/${ev}/pass`);
    expect(got[0].titleEn).toContain(`CLK-${ev.slice(0, 8)}`);
    expect(got[0].titleTh).toContain("พรุ่งนี้");
    expect(await mine(waiting.id, KIND_TOMORROW)).toEqual([]);
    await runClock(ENV, new Date(NOW.getTime() + HOUR)); // the next hour, or a task that arrived twice
    expect((await mine(going.id, KIND_TOMORROW)).length).toBe(1);
  });

  it("tells checked-in members the People I Met window is open, with the hours left", async () => {
    const came = await createMember();
    const missed = await createMember();
    const ev = await mkEvent({ startsAt: new Date(NOW.getTime() - 4 * HOUR), endsAt: new Date(NOW.getTime() - 2 * HOUR) });
    await mkReg(ev, came.id, { checkedInAt: new Date(NOW.getTime() - 4 * HOUR) });
    await mkReg(ev, missed.id);
    await runClock(ENV, NOW);
    const got = await mine(came.id, KIND_WINDOW);
    expect(got.length).toBe(1);
    expect(got[0].link).toBe(`/events/${ev}/people`);
    expect(got[0].titleEn).toContain("70 hours");
    expect(await mine(missed.id, KIND_WINDOW)).toEqual([]);
  });

  it("sends nothing in quiet hours, nothing to people who said no, and no dating event titles", async () => {
    const m = await createMember();
    const no = await createMember();
    await db().insert(consents).values({ id: newId(), accountId: no.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 1000) });
    const quietNow = new Date(NOW.getTime() + 12 * HOUR); // 22:00 Bangkok
    const ev = await mkEvent({ startsAt: new Date(quietNow.getTime() + 24 * HOUR) });
    await mkReg(ev, m.id);
    expect((await runClock(ENV, quietNow)).quiet).toBe(true);
    expect(await mine(m.id, KIND_TOMORROW)).toEqual([]);

    const date = await mkEvent({ startsAt: new Date(NOW.getTime() + 20 * HOUR), tags: ["open_to_more"] });
    await mkReg(date, m.id);
    await mkReg(date, no.id);
    await runClock(ENV, NOW);
    const got = (await mine(m.id, KIND_TOMORROW)).find((n) => n.link === `/me/events/${date}/pass`)!;
    expect(got.titleEn).toContain("You have a table tomorrow");
    expect(got.titleEn).not.toContain("CLK-");
    expect(got.titleTh).not.toContain("CLK-");
    expect(await mine(no.id, KIND_TOMORROW)).toEqual([]);
  });

  it("stores a push subscription only from a real push service, and only once keys are set", async () => {
    const m = await createMember();
    const sub = { endpoint: `https://fcm.googleapis.com/fcm/send/${randomToken(12)}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
    const off = await req("/settings/push", { cookie: m.cookie, json: sub });
    expect(off.status).toBe(503);
    const withKeys = { ...ENV, VAPID_PUBLIC_KEY: "x".repeat(87), VAPID_PRIVATE_KEY: "y".repeat(43) };
    const call = (path: string, body: unknown, cookie = m.cookie) =>
      app.request(path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }, withKeys);
    expect((await call("/settings/push", { ...sub, endpoint: "https://evil.example/x" })).status).toBe(400);
    expect((await call("/settings/push", sub)).status).toBe(200);
    expect((await call("/settings/push", sub)).status).toBe(200); // the same browser again: still one row
    const rows = await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).limit(5);
    expect(rows.map((r) => r.accountId)).toEqual([m.id]);
    const other = await createMember();
    expect((await call("/settings/push/off", { endpoint: sub.endpoint }, other.cookie)).status).toBe(200);
    expect((await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).limit(5)).length).toBe(1);
    expect((await call("/settings/push/off", { endpoint: sub.endpoint })).status).toBe(200);
    expect((await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).limit(5)).length).toBe(0);
  });

  it("Notifications page: no badge once they're read, and the phone switch once keys are set", async () => {
    const m = await createMember();
    await db().insert(notifications).values({ id: newId(), accountId: m.id, kind: "test", titleTh: "ทดสอบ", titleEn: "Test", link: "/events" });
    const withKeys = { ...ENV, VAPID_PUBLIC_KEY: "x".repeat(87), VAPID_PRIVATE_KEY: "y".repeat(43) };
    const html = await (await app.request("/notifications", { headers: { cookie: `${m.cookie}; lang=en` } }, withKeys)).text();
    expect(html).toContain("Test");
    expect(html).toContain('class="notif-new"');
    expect(html).not.toContain('class="notif-dot"');
    expect(html).toContain('id="push"');
    expect(html).toContain("Notifications on this phone");
    const without = await (await req("/notifications", { cookie: m.cookie })).text();
    expect(without).not.toContain('id="push"');
  });

  it("refuses an unsigned clock webhook", async () => {
    const res = await req("/api/tasks/webhook", { json: { id: 1, name: "clock", payload: {}, firedAt: Date.now() } });
    expect(res.status).toBe(401);
  });
});
