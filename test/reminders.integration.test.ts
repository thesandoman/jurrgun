/**
 * Reminders (owner, 2026-10-16): the phone switch turns event reminders on,
 * a seat booked too late for the day-before reminder gets one on the day
 * (about 3 hours before, never in quiet hours, never twice, never on top of
 * the day-before one), and two clock runs at once never send anything twice.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import app from "../src/index";
import { ENV, HAS_DB, createMember, db } from "./helpers";
import { consents, events, notifications, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { KIND_TODAY, KIND_TOMORROW, clockNotificationId, runClock, sameDayDue } from "../src/services/clock";

const HOUR = 3_600_000;
// 10:00 in Bangkok today: outside quiet hours whatever time the suite runs.
const day = new Date();
const NOW = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 3, 0, 0));
/** A Bangkok wall-clock time on 2026-10-20 (UTC+7), for the pure checks. */
const bkk = (hhmm: string, dayOffset = 0) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 20 + dayOffset, h - 7, m));
};

async function mkEvent(startsAt: Date, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  await db()
    .insert(events)
    .values({ id, title: `REM-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", ...over });
  return id;
}

async function seat(eventId: string, accountId: string) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(18) });
}

const mine = (accountId: string, kinds: string[]) =>
  db().select().from(notifications).where(and(eq(notifications.accountId, accountId), inArray(notifications.kind, kinds))).limit(20);

describe("same-day reminder timing", () => {
  it("goes about 3 hours before a daytime table, not earlier", () => {
    const start = bkk("15:00");
    expect(sameDayDue(start, bkk("10:00"))).toBe(false);
    expect(sameDayDue(start, bkk("11:00"))).toBe(false);
    expect(sameDayDue(start, bkk("12:00"))).toBe(true);
    expect(sameDayDue(start, bkk("13:00"))).toBe(true); // still due if 12:00 was missed
    expect(sameDayDue(start, bkk("15:00"))).toBe(false); // never at or after the start
    expect(sameDayDue(start, bkk("16:00"))).toBe(false);
  });

  it("never in quiet hours: the last allowed hour before the start instead", () => {
    // 00:30: 3 hours before is 21:30 (quiet), so 20:00 the evening before.
    const late = bkk("00:30", 1);
    expect(sameDayDue(late, bkk("19:00"))).toBe(false);
    expect(sameDayDue(late, bkk("20:00"))).toBe(true);
    expect(sameDayDue(late, bkk("21:00"))).toBe(false);
    expect(sameDayDue(late, bkk("23:00"))).toBe(false);
    // 09:00: 3 hours before is 06:00 (quiet), and 08:00 is still before the start.
    const early = bkk("09:00", 1);
    expect(sameDayDue(early, bkk("20:00"))).toBe(false);
    expect(sameDayDue(early, bkk("06:00", 1))).toBe(false);
    expect(sameDayDue(early, bkk("08:00", 1))).toBe(true);
    // 08:00 sharp: no allowed hour on the day before it starts, so 20:00 the evening before.
    const eight = bkk("08:00", 1);
    expect(sameDayDue(eight, bkk("19:00"))).toBe(false);
    expect(sameDayDue(eight, bkk("20:00"))).toBe(true);
  });

  it("leaves tables 18 hours or more away to the day-before reminder", () => {
    expect(sameDayDue(bkk("12:00", 1), bkk("18:00"))).toBe(false); // 18 hours
    expect(sameDayDue(bkk("11:30", 1), bkk("18:00"))).toBe(false); // 17.5 hours, 08:00 comes later
  });
});

describe.skipIf(!HAS_DB)("reminders", () => {
  it("turning on notifications on this phone also turns on event reminders, and says so", async () => {
    const m = await createMember();
    await db().insert(consents).values({ id: newId(), accountId: m.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 10) });
    const withKeys = { ...ENV, VAPID_PUBLIC_KEY: "x".repeat(87), VAPID_PRIVATE_KEY: "y".repeat(43) };
    const html = await (await app.request("/notifications", { headers: { cookie: `${m.cookie}; lang=en` } }, withKeys)).text();
    expect(html).toContain("Switching this on also turns on event reminders.");
    const th = await (await app.request("/notifications", { headers: { cookie: `${m.cookie}; lang=th` } }, withKeys)).text();
    expect(th).toContain("เปิดแล้ว การเตือนกิจกรรมจะเปิดให้ด้วย");

    const sub = { endpoint: `https://fcm.googleapis.com/fcm/send/${randomToken(12)}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
    const on = await app.request("/settings/push", { method: "POST", headers: { cookie: m.cookie, "content-type": "application/json" }, body: JSON.stringify(sub) }, withKeys);
    expect(on.status).toBe(200);
    const latest = async () =>
      db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "notifications"))).orderBy(desc(consents.createdAt)).limit(10);
    const [newest] = await latest();
    expect(newest.granted).toBe(true);
    expect(newest.version).not.toBe("test");
    // Already yes: switching on again adds no row.
    const before = (await latest()).length;
    await app.request("/settings/push", { method: "POST", headers: { cookie: m.cookie, "content-type": "application/json" }, body: JSON.stringify(sub) }, withKeys);
    expect((await latest()).length).toBe(before);
    // And the clock now reminds them.
    const ev = await mkEvent(new Date(NOW.getTime() + 24 * HOUR));
    await seat(ev, m.id);
    await runClock(ENV, NOW);
    expect((await mine(m.id, [KIND_TOMORROW])).length).toBe(1);
  });

  it("a seat booked too late for the day before gets one reminder about 3 hours before", async () => {
    const m = await createMember();
    const ev = await mkEvent(new Date(NOW.getTime() + 5 * HOUR)); // 15:00 Bangkok
    await seat(ev, m.id);
    await runClock(ENV, NOW);
    expect(await mine(m.id, [KIND_TODAY])).toEqual([]);
    await runClock(ENV, new Date(NOW.getTime() + 2 * HOUR));
    const got = await mine(m.id, [KIND_TODAY]);
    expect(got.length).toBe(1);
    expect(got[0].link).toBe(`/me/events/${ev}/pass`);
    expect(got[0].titleTh).toContain("วันนี้");
    expect(got[0].titleEn).toContain("Today at");
    await runClock(ENV, new Date(NOW.getTime() + 3 * HOUR));
    await runClock(ENV, new Date(NOW.getTime() + 4 * HOUR));
    expect((await mine(m.id, [KIND_TODAY])).length).toBe(1);
  });

  it("holds the same-day reminder out of quiet hours: 20:00 for a table at 00:30", async () => {
    const m = await createMember();
    const ev = await mkEvent(new Date(NOW.getTime() + 14.5 * HOUR)); // 00:30 Bangkok, tomorrow
    await seat(ev, m.id);
    await runClock(ENV, new Date(NOW.getTime() + 9 * HOUR)); // 19:00
    expect(await mine(m.id, [KIND_TODAY])).toEqual([]);
    await runClock(ENV, new Date(NOW.getTime() + 10 * HOUR)); // 20:00
    const got = await mine(m.id, [KIND_TODAY]);
    expect(got.length).toBe(1);
    expect(got[0].titleTh).toContain("พรุ่งนี้ 00:30");
  });

  it("never sends the same-day reminder on top of the day-before one, or to someone who said no", async () => {
    const m = await createMember();
    const no = await createMember();
    await db().insert(consents).values({ id: newId(), accountId: no.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 1000) });
    const ev = await mkEvent(new Date(NOW.getTime() + 26 * HOUR)); // 12:00 tomorrow
    await seat(ev, m.id);
    await runClock(ENV, NOW);
    expect((await mine(m.id, [KIND_TOMORROW])).length).toBe(1);
    const late = await mkEvent(new Date(NOW.getTime() + 25 * HOUR)); // 11:00 tomorrow: due at 08:00
    await seat(late, no.id);
    for (const h of [22, 23, 24, 25]) await runClock(ENV, new Date(NOW.getTime() + h * HOUR));
    expect(await mine(m.id, [KIND_TODAY])).toEqual([]);
    expect((await mine(m.id, [KIND_TOMORROW, KIND_TODAY])).length).toBe(1);
    expect(await mine(no.id, [KIND_TODAY, KIND_TOMORROW])).toEqual([]);
  });

  it("two runs at once send each reminder once, and only the run that wrote it counts it", async () => {
    const members = await Promise.all([createMember(), createMember(), createMember()]);
    const ev = await mkEvent(new Date(NOW.getTime() + 24 * HOUR));
    const soon = await mkEvent(new Date(NOW.getTime() + 2 * HOUR));
    for (const m of members) {
      await seat(ev, m.id);
      await seat(soon, m.id);
    }
    const clockRows = async () =>
      new Set((await db().select({ id: notifications.id }).from(notifications).where(like(notifications.id, "clk_%")).limit(20_000)).map((r) => r.id));
    const before = await clockRows();
    const runs = await Promise.all([runClock(ENV, NOW), runClock(ENV, NOW), runClock(ENV, NOW), runClock(ENV, NOW)]);
    for (const m of members) {
      const got = await mine(m.id, [KIND_TOMORROW, KIND_TODAY]);
      expect(got.filter((n) => n.kind === KIND_TOMORROW).length).toBe(1);
      expect(got.filter((n) => n.kind === KIND_TODAY).length).toBe(1);
      const t = got.find((n) => n.kind === KIND_TOMORROW)!;
      expect(t.id).toBe(await clockNotificationId(KIND_TOMORROW, m.id, `/me/events/${ev}/pass`));
    }
    // What the runs say they sent (and pushed) adds up to the rows that exist, never more.
    const written = [...(await clockRows())].filter((id) => !before.has(id));
    const claimed = runs.reduce((n, r) => n + r.tomorrow + r.today + r.windowOpen, 0);
    expect(written.length).toBeGreaterThanOrEqual(members.length * 2);
    expect(claimed).toBe(written.length);
  });
});
