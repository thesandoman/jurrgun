/** Weekly plan and outcome maths (src/domain/plan.ts, src/domain/outcomes.ts): pure. */
import { describe, expect, it } from "vitest";
import { EXPLORE_TABLES, freshWeek, pickPlan, scoreEvent, timeWindow, type PlanEvent, type PlanMember } from "../src/domain/plan";
import { countsAtLeast, feedbackSummary, pctOf, returnRate } from "../src/domain/outcomes";

const now = new Date("2026-10-12T00:00:00Z"); // Mon 07:00 Bangkok
const member: PlanMember = { id: "m", age: 28, district: "bang_rak", languages: ["th"], interests: ["food"], typeDistricts: ["phaya_thai"], activities: ["walk"], budgetMax: 300, times: ["weekend_morning"], access: [], energy: "chill" };
const ev = (over: Partial<PlanEvent>): PlanEvent => ({
  id: "e", tags: ["food"], district: "bang_rak", costThb: 0, startsAt: new Date("2026-10-17T02:00:00Z"), endsAt: new Date("2026-10-17T04:00:00Z"),
  languages: ["th"], intensity: "chill", groupMax: 6, ageMin: 18, ageMax: 99, seatsLeft: 5, friendsGoing: 0, ...over,
});

describe("weekly plan scoring", () => {
  it("hard rules: past, full, age, language, budget", () => {
    expect(scoreEvent(member, ev({ startsAt: new Date("2026-10-01T00:00:00Z") }), now)).toBeNull();
    expect(scoreEvent(member, ev({ seatsLeft: 0 }), now)).toBeNull();
    expect(scoreEvent(member, ev({ ageMin: 30 }), now)).toBeNull();
    expect(scoreEvent(member, ev({ languages: ["en"] }), now)).toBeNull();
    expect(scoreEvent(member, ev({ costThb: 450 }), now)).toBeNull();
  });

  it("gives plain reasons from objective signals", () => {
    // Sat 09:00 Bangkok, food, home district, free, calm, a friend going.
    const p = scoreEvent(member, ev({ friendsGoing: 1 }), now)!;
    expect(timeWindow(new Date("2026-10-17T02:00:00Z"))).toBe("weekend_morning");
    expect(p.reasons).toEqual(expect.arrayContaining(["likes:food", "near:bang_rak", "free", "time:weekend_morning", "friends:1", "calm"]));
    const typeSpot = scoreEvent(member, ev({ district: "phaya_thai" }), now)!;
    expect(typeSpot.reasons).toContain("type_spot:phaya_thai");
  });

  it("picks two, preferring a buddy quest and different kinds of meetup", () => {
    const evs = [ev({ id: "a", tags: ["food"] }), ev({ id: "b", tags: ["food"], district: "dusit" }), ev({ id: "c", tags: ["walk"], district: "dusit" })];
    expect(pickPlan(member, evs, now).map((p) => p.ref)).toEqual(["a", "c"]);
    expect(pickPlan(member, evs, now, { id: "q" }).map((p) => p.ref)).toEqual(["q", "a"]);
    expect(pickPlan(member, [], now)).toEqual([]);
  });

  it("explore, then regulars: once a month after 3 meetups, one pick is for new faces (owner card 10-16)", () => {
    expect(freshWeek("2026-W44", EXPLORE_TABLES - 1)).toBe(false); // still exploring
    expect(freshWeek("2026-W44", EXPLORE_TABLES)).toBe(true);
    expect(freshWeek("2026-W43", 10)).toBe(false);
    // Your people go to a and b; c is all new faces.
    const evs = [ev({ id: "a", friendsGoing: 2 }), ev({ id: "b", friendsGoing: 1, tags: ["walk"] }), ev({ id: "c", district: "dusit" })];
    expect(pickPlan(member, evs, now).map((p) => p.ref)).toEqual(["a", "b"]);
    const fresh = pickPlan(member, evs, now, null, true);
    expect(fresh.map((p) => p.ref)).toEqual(["a", "c"]);
    expect(fresh[1].reasons).toContain("new_faces");
    expect(pickPlan(member, evs, now, { id: "q" }, true).map((p) => p.ref)).toEqual(["q", "c"]);
  });
});

describe("outcomes", () => {
  it("suppresses small bases", () => {
    expect(pctOf(3, 9)).toBeNull();
    expect(pctOf(5, 10)).toBe(50);
    expect(pctOf(2, 5, 5)).toBe(40);
  });
  it("summarises feedback and return rate", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ feltSafe: i < 9 ? 5 : 2, feltHeard: 4, wouldMeetAgain: i % 2 === 0 }));
    expect(feedbackSummary(rows)).toMatchObject({ responses: 10, feltSafePct: 90, feltHeardAvg: 4, againPct: 50 });
    const att = ["a", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((accountId) => ({ accountId }));
    expect(returnRate(att)).toBe(10);
    expect(countsAtLeast(["x", "x", "y"], 2)).toEqual([["x", 2]]);
  });
});
