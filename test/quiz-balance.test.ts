/**
 * The curated Bangkok Type quiz stays fair: 5,000 simulated people through the
 * fixed sets (one per segment, with the seasonal slot), a sample of the full balance run (scripts/quiz-sim.ts, 50,000 sessions,
 * results in design/reference/quiz-balance.md).
 *
 * If this fails after adding scenarios, don't loosen the numbers: run
 * `npx tsx scripts/quiz-sim.ts` to see which type or letter moved and fix the
 * scenarios or the generator.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { TYPE_CODES } from "../src/vibe/scenarios";
import { simulate, type SimReport } from "./quiz-sim";

const SESSIONS = 5000;
let r: SimReport;

beforeAll(() => {
  r = simulate(SESSIONS);
}, 60_000);

describe("Bangkok Type quiz balance (5,000 simulated sessions)", () => {
  it("builds every curated set to the rules", () => {
    expect(r.structure.unbalancedQuestions).toBe(0); // every question is two opposite pairs
    expect(r.structure.offerOutOfRange).toBe(0); // every type shown exactly 4 times, twins 8 or more apart
    expect(r.structure.positionSpread).toBeLessThan(4); // each type shown 4 times: no type stuck in one answer position
    expect(r.questionsPerSession).toEqual({ min: 16, max: 16 });
    // Fixed sets: one per segment, plus the seasonal slot's months.
    expect(r.distinctSessions).toBeGreaterThanOrEqual(3);
    expect(r.distinctSessions).toBeLessThanOrEqual(3 * 12);
  });

  it("gives people with no preference every type, close to evenly", () => {
    for (const c of TYPE_CODES) expect(r.random.counts[c], c).toBeGreaterThan(0);
    // 312 expected per type; chance alone moves a type by about 6%, so 25% means a real tilt.
    expect(r.random.maxDeviation).toBeLessThan(0.25);
    for (const share of Object.values(r.random.letterShare)) {
      expect(share).toBeGreaterThan(0.46);
      expect(share).toBeLessThan(0.54);
    }
  });

  it("gives real people their own type back", () => {
    expect(r.perfect.recovered).toBeGreaterThan(0.99);
    expect(r.persona.overall).toBeGreaterThan(0.82);
    for (const c of TYPE_CODES) expect(r.persona.recovered[c], c).toBeGreaterThan(0.72);
    expect(r.persona.withinRange).toBeGreaterThan(0.95); // own type among the near types shown (quiz-curated.md)
    expect(r.perfect.meanConsistency).toBeGreaterThan(0.8); // a consistent person answers the twin questions alike
  });

  it('"None of these are me" casts no vote and still finds people', () => {
    // Real people pass only when nothing fits (the best answer shares fewer than 2 letters). With two
    // opposite pairs per question the best answer always shares at least 2, so they never need to.
    expect(r.persona.meanPasses).toBe(0);
    // Someone who passes whenever their own type isn't there passes on most questions, and still mostly gets their type.
    expect(r.picky.meanPasses).toBeGreaterThan(8);
    expect(r.picky.overall).toBeGreaterThan(0.78);
  });

  it("doesn't sound confident about someone who contradicts themselves", () => {
    expect(r.contradictory.confident).toBeLessThan(0.05);
    expect(r.contradictory.meanUnsureLetters).toBeGreaterThan(2.5);
  });
});
