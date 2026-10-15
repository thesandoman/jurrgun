/**
 * The Bangkok Type quiz stays fair as the question bank grows: a 5,000-session
 * sample of the full balance run (scripts/quiz-sim.ts, 50,000 sessions,
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
  it("builds every session to the rules", () => {
    expect(r.structure.unbalancedQuestions).toBe(0); // every letter split evenly on every question (the two sliders as a pair)
    expect(r.structure.offerOutOfRange).toBe(0); // every type offered at least 6 times and within one of the others, home district or not
    expect(r.structure.positionSpread).toBeLessThan(1.25); // no type favoured in any option position
    expect(r.distinctSessions).toBe(SESSIONS);
    expect(r.scenariosUsed).toBe(r.scenariosInBank); // no scenario is unreachable
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
    expect(r.persona.withinRange).toBeGreaterThan(0.97);
    expect(r.perfect.meanConsistency).toBeGreaterThan(0.8); // a consistent person answers the twin questions alike
  });

  it('"None of these are me" casts no vote and still finds people', () => {
    // Real people pass only when nothing fits; that costs no accuracy (checked above with it on).
    expect(r.persona.meanPasses).toBeGreaterThan(0);
    // Someone who passes whenever their own type isn't there passes on most questions, and still mostly gets their type.
    expect(r.picky.meanPasses).toBeGreaterThan(8);
    expect(r.picky.overall).toBeGreaterThan(0.78);
  });

  it("doesn't sound confident about someone who contradicts themselves", () => {
    expect(r.contradictory.confident).toBeLessThan(0.05);
    expect(r.contradictory.meanUnsureLetters).toBeGreaterThan(2.5);
  });
});
