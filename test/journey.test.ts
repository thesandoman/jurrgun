/** D1: one progress bar for the first-time journey, in four chapters, never going backwards. */
import { describe, expect, it } from "vitest";
import { CHAPTERS, journeyAt, journeyPct, type JourneyStep } from "../src/ui/journey";

const ORDER: JourneyStep[] = ["welcome", "dating", "heard", "quiz", "type", "basics", "privacy", "connections", "wellbeing", "guide"];

describe("journey bar", () => {
  it("friends: 30 screens, welcome first, the guide last, four chapters in order", () => {
    expect(journeyAt("welcome", false)).toEqual({ from: 0, total: 30, chapter: 1 });
    expect(journeyAt("quiz", false)).toMatchObject({ from: 1, chapter: 1 });
    expect(journeyAt("type", false)).toMatchObject({ from: 19, chapter: 1 });
    expect(journeyAt("basics", false).chapter).toBe(2);
    expect(journeyAt("privacy", false).chapter).toBe(3);
    expect(journeyAt("guide", false)).toEqual({ from: 24, total: 30, chapter: 4 });
    expect(CHAPTERS).toHaveLength(4);
  });

  it("dating members get their extra screens, and the bar still only moves forward", () => {
    for (const dating of [false, true]) {
      let last = -1;
      let chapter = 1;
      for (const s of ORDER) {
        const j = journeyAt(s, dating);
        expect(j.from).toBeGreaterThanOrEqual(last);
        expect(j.chapter).toBeGreaterThanOrEqual(chapter);
        last = j.from;
        chapter = j.chapter;
      }
    }
    expect(journeyAt("guide", true).total).toBe(39);
    expect(journeyPct(journeyAt("guide", true), 5)).toBe(100);
  });
});
