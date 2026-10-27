/**
 * Discover's list view leads with "ยอดนิยม / Popular picks" (3) and "10 อันดับ
 * สัปดาห์นี้ / Top 10 this week" (owner, 2026-10-17), ranked by seats held,
 * then fill rate, any category. The ranking starts from the same visibility
 * rules as the list, so a private, Open to something more, women-only or
 * out-of-age event never shows up in it. No score is ever shown.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, profiles, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { rankPopular } from "../src/routes/events";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("rankPopular", () => {
  const at = (d: number) => new Date(Date.UTC(2026, 9, 20 + d));
  it("puts events with spots left first, then the most seats held, then the fullest, then the soonest", () => {
    const list = [
      { id: "small-full", capacity: 4, startsAt: at(1) },
      { id: "big", capacity: 40, startsAt: at(5) },
      { id: "mid", capacity: 10, startsAt: at(2) },
      { id: "tie-later", capacity: 10, startsAt: at(4) },
      { id: "tie-sooner", capacity: 10, startsAt: at(3) },
      { id: "empty", capacity: 10, startsAt: at(0) },
    ];
    const taken = new Map([
      ["small-full", 4],
      ["big", 12],
      ["mid", 8],
      ["tie-later", 5],
      ["tie-sooner", 5],
    ]);
    expect(rankPopular(list, taken).map((e) => e.id)).toEqual(["big", "mid", "tie-sooner", "tie-later", "empty", "small-full"]);
  });
});

async function mkEvent(title: string, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * DAY);
  await db()
    .insert(events)
    .values({ id, title, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 100, status: "published", createdBy: "test", ...over });
  return id;
}

/** `n` confirmed seats from people who don't need accounts for this test. */
async function fill(eventId: string, n: number) {
  await db()
    .insert(registrations)
    .values(Array.from({ length: n }, () => ({ id: newId(), eventId, accountId: `seat_${newId()}`, status: "confirmed", passToken: randomToken(18) })));
}

describe.skipIf(!HAS_DB)("Discover: popular picks and the top 10 this week", () => {
  it("leads the list with 3 popular picks and the next 10, never repeating, then the filters and the rest", async () => {
    const tag = newId().slice(0, 6);
    const m = await createMember();
    await db().update(profiles).set({ gender: "man" }).where(eq(profiles.accountId, m.id));
    // Far more seats held than anything else in the test database, so these lead.
    const p1 = await mkEvent(`Pop1 ${tag}`, { startsAt: new Date(Date.now() + 20 * DAY) });
    const p2 = await mkEvent(`Pop2 ${tag}`);
    const p3 = await mkEvent(`Pop3 ${tag}`, { tags: ["book_club"] });
    await fill(p1, 90);
    await fill(p2, 85);
    await fill(p3, 80);
    // Hidden from this member: never ranked, however popular.
    const hidden = [
      await mkEvent(`Private ${tag}`, { visibility: "private", privateToken: randomToken(18) }),
      await mkEvent(`Romance ${tag}`, { tags: ["open_to_more"] }),
      await mkEvent(`Women ${tag}`, { tags: ["women_only"] }),
      await mkEvent(`Elders ${tag}`, { ageMin: 60, ageMax: 99 }),
    ];
    for (const id of hidden) await fill(id, 95);
    // This week, next in line. They start within hours, so they sit near the top of the shared test database
    // and never fall past the full list's 100-event limit however many events other files have made.
    const week: string[] = [];
    for (let i = 0; i < 11; i++) {
      const id = await mkEvent(`Week${String(i).padStart(2, "0")} ${tag}`, { startsAt: new Date(Date.now() + (6 + i) * HOUR) });
      await fill(id, 70 - i);
      week.push(id);
    }

    const html = await (await req("/?view=list&lang=en", { cookie: m.cookie })).text();
    const picksAt = html.indexOf('class="disc-picks"');
    const topAt = html.indexOf('class="disc-top"');
    const barAt = html.indexOf('class="disc-bar"');
    expect(picksAt).toBeGreaterThan(-1);
    expect(html).toContain("Popular picks");
    expect(html).toContain("Top 10 this week");
    // Popular picks, then the top 10, then the time tabs, filters and Map or Cards, then the rest.
    expect(picksAt).toBeLessThan(topAt);
    expect(topAt).toBeLessThan(barAt);
    const picks = html.slice(picksAt, topAt);
    const top = html.slice(topAt, barAt);
    const rest = html.slice(barAt);
    expect([p1, p2, p3].map((id) => picks.indexOf(`/events/${id}"`))).toEqual([...[p1, p2, p3].map((id) => picks.indexOf(`/events/${id}"`))].sort((a, b) => a - b));
    for (const id of [p1, p2, p3]) {
      expect(picks).toContain(`/events/${id}"`);
      expect(top).not.toContain(`/events/${id}"`);
      expect(rest).not.toContain(`/events/${id}"`);
    }
    // The top 10 this week: the next ten by the same order, the 11th waits in the full list.
    const order = week.slice(0, 10).map((id) => top.indexOf(`/events/${id}"`));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(top).not.toContain(`/events/${week[10]}"`);
    expect(rest).toContain(`/events/${week[10]}"`);
    // Visibility, exactly as the list: private, Open to something more and women-only events nowhere;
    // an event outside your age stays in the full list (as before) but is never recommended.
    for (const id of hidden.slice(0, 3)) expect(html).not.toContain(`/events/${id}"`);
    expect(`${picks}${top}`).not.toContain(`/events/${hidden[3]}"`);
    // No score, count of seats or percentage in the ranked sections.
    expect(`${picks}${top}`).not.toMatch(/\d+ ?%|score|seats taken/i);
    // Thai headings.
    const th = await (await req("/?view=list&lang=th", { cookie: m.cookie })).text();
    expect(th).toContain("ยอดนิยม");
    expect(th).toContain("10 อันดับสัปดาห์นี้");
  });

  it("filters apply to the full list, and a filtered list shows just the matches", async () => {
    const m = await createMember();
    const tag = newId().slice(0, 6);
    const big = await mkEvent(`Big ${tag}`);
    await fill(big, 99);
    const html = await (await req(`/?view=list&lang=en&q=${tag}`, { cookie: m.cookie })).text();
    expect(html).not.toContain('class="disc-picks"');
    expect(html).not.toContain('class="disc-top"');
    expect(html.slice(html.indexOf('class="disc-bar"'))).toContain(`/events/${big}"`);
    // The For you card still shows on the plain list.
    const plain = await (await req("/?view=list&lang=en", { cookie: m.cookie })).text();
    expect(plain).toContain("hint for-you");
  });
});
