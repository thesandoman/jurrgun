/** Q7: curated follow-ups only for genuinely close letters, at most 2, the same every time. */
import { describe, expect, it } from "vitest";
import { CLOSE, closeLetters, followUpPlan, MAX_FOLLOW_UPS } from "../src/vibe/adaptive";
import { followUpQuestions, generateSession, scoreSession } from "../src/vibe/generator";
import { answersAs } from "./quiz-helpers";

const personal = { segment: "local" as const };
const qs = generateSession({ seed: "fu", personal, month: 3 });
const fus = followUpQuestions(personal);

describe("adaptive follow-ups (Q7)", () => {
  it("asks nothing when every letter is clear", () => {
    expect(followUpPlan(qs, answersAs(qs, "BDSH"), fus)).toEqual([]);
  });

  it("asks 1 or 2 when a letter is close, never more, and the same ones every time", () => {
    const a = answersAs(qs, "BFSH");
    const b = answersAs(qs, "CFSH");
    const mixed = Object.fromEntries(qs.map((q, i) => [q.id, i % 2 ? a[q.id] : b[q.id]]));
    const plan = followUpPlan(qs, mixed, fus);
    expect(plan.length).toBeGreaterThanOrEqual(1);
    expect(plan.length).toBeLessThanOrEqual(MAX_FOLLOW_UPS);
    expect(followUpPlan(qs, mixed, fus)).toEqual(plan);
    for (const k of plan) expect(qs.map((q) => q.scenario)).not.toContain(fus[k].scenario);
  });

  it("only close letters read as not sure: inside the margin and near an even split", () => {
    const r = scoreSession(qs, answersAs(qs, "BDSH"));
    expect(closeLetters(r.vector, r.unsure)).toEqual([]);
    expect(closeLetters({ energy: CLOSE / 2, explore: 0.9, motion: -0.9, culture: 0.5 }, ["energy", "culture"])).toEqual(["energy"]);
  });
});
