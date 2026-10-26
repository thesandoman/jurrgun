/**
 * Pinky Plans idea ranking (src/domain/pinky-plans.ts): ranked by the pair's
 * overlap, but every three keeps at least one idea that isn't
 * preference-driven, so neither person can work out the other's answers.
 */
import { describe, expect, it } from "vitest";
import { DATE_IDEAS, IDEAS_PER_DAY } from "../src/content/date-ideas";
import { bothConfirmed, dayIdeas, ideaBatch, sharedKinds } from "../src/domain/pinky-plans";

describe("Pinky Plans ideas", () => {
  it("uses only the overlap of both people's first-date kinds", () => {
    expect([...sharedKinds(["coffee", "walk"], ["walk", "museum"])]).toEqual(["walk"]);
    expect(sharedKinds(undefined, ["walk"]).size).toBe(0);
  });

  it("gives up to 9 ideas a day, no repeats, the same for the same pair and day", () => {
    const shared = new Set(["walk"]);
    const day = dayIdeas("p1:2026-10-26", shared);
    expect(day.length).toBe(IDEAS_PER_DAY);
    expect(new Set(day.map((i) => i.key)).size).toBe(day.length);
    expect(dayIdeas("p1:2026-10-26", shared).map((i) => i.key)).toEqual(day.map((i) => i.key));
    expect(dayIdeas("p1:2026-10-27", shared).map((i) => i.key)).not.toEqual(day.map((i) => i.key));
  });

  it("every three has at least one idea that isn't preference-driven, and at most two that are", () => {
    for (const kinds of [["walk"], ["walk", "coffee"], ["museum", "street_food", "market"]]) {
      const shared = new Set(kinds);
      for (let s = 0; s < 20; s++) {
        const day = dayIdeas(`seed-${s}`, shared);
        for (let b = 0; b < 3; b++) {
          const three = ideaBatch(day, b);
          expect(three.length).toBe(3);
          const liked = three.filter((i) => shared.has(i.kind)).length;
          expect(liked).toBeLessThanOrEqual(2);
          expect(3 - liked).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("ranks the overlap first when there is one", () => {
    const shared = new Set(["walk"]);
    const walks = DATE_IDEAS.filter((i) => i.kind === "walk").length;
    const day = dayIdeas("rank", shared);
    // Two of each three are walks while walks last (there are enough for the day).
    expect(day.filter((i) => i.kind === "walk").length).toBe(Math.min(6, walks));
  });

  it("with no overlap, ideas still come, in threes", () => {
    const day = dayIdeas("none", new Set());
    expect(ideaBatch(day, 0).length).toBe(3);
  });

  it("both confirmed needs both", () => {
    expect(bothConfirmed({ aConfirmedAt: new Date(), bConfirmedAt: null })).toBe(false);
    expect(bothConfirmed({ aConfirmedAt: new Date(), bConfirmedAt: new Date() })).toBe(true);
  });

  it("every idea is complete in both languages", () => {
    for (const i of DATE_IDEAS) for (const f of [i.place, i.when, i.why]) expect(f.th && f.en).toBeTruthy();
    expect(new Set(DATE_IDEAS.map((i) => i.key)).size).toBe(DATE_IDEAS.length);
  });
});
