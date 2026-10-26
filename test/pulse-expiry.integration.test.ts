/**
 * Unsorted City Pulse suggestions expire (owner C2, 26 Oct 2026): words and
 * row go 60 days after their month ends, moderators see how long is left,
 * and the once-a-week suggestion flag goes once its week is over.
 */
import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { profiles, pulseSuggestions } from "../src/schema";
import { daysUntilWipe, runRetention, unsortedCutoffMonth } from "../src/services/retention";
import { bkkMonth, bkkWeekKey } from "../src/domain/pulse-heard";

describe("unsorted suggestion expiry (pure)", () => {
  it("wipes a month's suggestions 60 days after the month ends, Bangkok time", () => {
    // August ends at 1 Sep 00:00 Bangkok (31 Aug 17:00 UTC); +60 days = 31 Oct 00:00 Bangkok.
    const due = new Date("2026-10-30T17:00:00Z");
    expect(unsortedCutoffMonth(new Date(due.getTime() - 60_000))).toBe("2026-08");
    expect(unsortedCutoffMonth(due)).toBe("2026-09");
    expect(daysUntilWipe("2026-08", new Date("2026-10-29T17:00:00Z"))).toBe(1);
    expect(daysUntilWipe("2026-08", due)).toBe(0);
    expect(daysUntilWipe("2026-10", new Date("2026-10-26T05:00:00Z"))).toBe(66);
  });
});

describe.skipIf(!HAS_DB)("unsorted suggestion expiry", () => {
  it("deletes unsorted suggestions past 60 days, keeps sorted ones and recent ones", async () => {
    const now = new Date("2026-10-31T05:00:00Z");
    const tag = newId();
    const old = { id: newId(), body: `old ${tag}`, status: "new", month: "2026-08" };
    const recent = { id: newId(), body: `recent ${tag}`, status: "new", month: "2026-09" };
    const sorted = { id: newId(), body: "", topic: "getting_around", status: "sorted", month: "2026-08" };
    await db().insert(pulseSuggestions).values([old, recent, sorted]);
    await runRetention(ENV, now);
    const left = await db().select({ id: pulseSuggestions.id }).from(pulseSuggestions).where(inArray(pulseSuggestions.id, [old.id, recent.id, sorted.id]));
    expect(left.map((r) => r.id).sort()).toEqual([recent.id, sorted.id].sort());
  });

  it("clears the once-a-week flag after its week, and keeps this week's", async () => {
    const now = new Date();
    const [past, current] = await Promise.all([createMember({ research: true }), createMember({ research: true })]);
    await db().update(profiles).set({ bio: { pulseSuggestWeek: "2026-01-05" } }).where(eq(profiles.accountId, past.id));
    await db().update(profiles).set({ bio: { pulseSuggestWeek: bkkWeekKey(now) } }).where(eq(profiles.accountId, current.id));
    await runRetention(ENV, now);
    const [p] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, past.id));
    const [c] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, current.id));
    expect(p.bio).not.toHaveProperty("pulseSuggestWeek");
    expect(c.bio).toHaveProperty("pulseSuggestWeek", bkkWeekKey(now));
  });

  it("tells moderators when each waiting suggestion wipes", async () => {
    const words = `Night buses please ${newId()}`;
    await db().insert(pulseSuggestions).values({ id: newId(), body: words, status: "new", month: bkkMonth(new Date()) });
    const mod = await createMember({ role: "moderator" });
    const html = await (await req("/admin/pulse-suggestions?lang=en", { cookie: mod.cookie })).text();
    expect(html).toContain(words);
    expect(html).toMatch(/Wipes in \d+ days if not sorted/);
  });
});
