/**
 * My events (owner card, 2026-10-17): upcoming, then past events from this
 * month and the two before it by month; older ones behind one native
 * <details> row that opens in place without script.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { pastCutoff } from "../src/routes/events";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function attended(accountId: string, startsAt: Date) {
  const id = newId();
  await db()
    .insert(events)
    .values({ id, title: `PAST-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
  await db().insert(registrations).values({ id: newId(), eventId: id, accountId, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(startsAt.getTime() + HOUR) });
  return id;
}

describe("pastCutoff", () => {
  it("is the start of the month two months back, in Bangkok time", () => {
    expect(pastCutoff(new Date("2026-10-17T03:00:00Z")).toISOString()).toBe("2026-07-31T17:00:00.000Z");
    // 1 Jan 00:30 in Bangkok is still December in UTC: the Bangkok month counts.
    expect(pastCutoff(new Date("2025-12-31T17:30:00Z")).toISOString()).toBe("2025-10-31T17:00:00.000Z");
  });
});

describe.skipIf(!HAS_DB)("My events: older past events fold away", () => {
  it("recent months show as now; older ones sit in a details row with their count", async () => {
    const m = await createMember();
    const recent = await attended(m.id, new Date(Date.now() - 6 * HOUR));
    const old1 = await attended(m.id, new Date(Date.now() - 150 * DAY));
    const old2 = await attended(m.id, new Date(Date.now() - 200 * DAY));
    const html = await (await req("/me/events?lang=en", { cookie: m.cookie })).text();
    const fold = html.indexOf('<details class="how past-older">');
    expect(fold).toBeGreaterThan(-1);
    expect(html).toContain("<summary>Show all past events (2)</summary>");
    // The recent one (with its 72-hour buttons) is above the fold; the old ones are inside it.
    expect(html.indexOf(`href="/events/${recent}"`)).toBeLessThan(fold);
    expect(html).toContain(`/events/${recent}/people`);
    expect(html.indexOf(`href="/events/${old1}"`)).toBeGreaterThan(fold);
    expect(html.indexOf(`href="/events/${old2}"`)).toBeGreaterThan(fold);
    expect(html).not.toContain(`/events/${old1}/people`);
    const th = await (await req("/me/events?lang=th", { cookie: m.cookie })).text();
    expect(th).toContain("ดูกิจกรรมที่ผ่านมาทั้งหมด (2)");
  });

  it("no fold when everything is recent", async () => {
    const m = await createMember();
    await attended(m.id, new Date(Date.now() - 2 * DAY));
    const html = await (await req("/me/events?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain('class="past-month"');
    expect(html).not.toContain('<details class="how past-older">');
  });
});
