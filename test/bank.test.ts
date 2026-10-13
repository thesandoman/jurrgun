/**
 * The hand-written quiz bank: content rules, coverage of all 50 districts,
 * contexts, twins and flavours.
 */
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../src/vibe/scenarios";
import { checkScenarios, DISTRICT_KEYS } from "../src/vibe/bank-rules";
import { LANDMARKS } from "../src/vibe/landmarks";
import { ARCHETYPES } from "../src/vibe/archetypes";

describe("quiz bank", () => {
  it("passes every content rule: bilingual, gender neutral, family friendly, non-political, no dashes, no duplicates", () => {
    const { errors } = checkScenarios(SCENARIOS);
    expect(errors).toEqual([]);
  });

  it("has 47 scenarios: 35 core, 6 rhythm, 6 plan", () => {
    expect(SCENARIOS).toHaveLength(47);
    expect(SCENARIOS.filter((s) => s.kind === "core")).toHaveLength(35);
    expect(SCENARIOS.filter((s) => s.kind === "rhythm")).toHaveLength(6);
    expect(SCENARIOS.filter((s) => s.kind === "plan")).toHaveLength(6);
  });

  it("covers friends, family, dates, solo, coworkers, parties and meetups", () => {
    for (const ctx of ["friends", "family", "date", "solo", "coworkers", "party", "meetup"]) {
      expect(SCENARIOS.filter((s) => s.kind === "core" && s.context === ctx).length, ctx).toBeGreaterThanOrEqual(3);
    }
  });

  it("has four twin pairs that point at each other", () => {
    const twins = SCENARIOS.filter((s) => s.twin);
    expect(twins).toHaveLength(8);
    for (const s of twins) expect(SCENARIOS.find((x) => x.id === s.twin)?.twin).toBe(s.id);
  });

  it("features all 50 districts: each in at least 6 answers, none in more than 8% of them", () => {
    const { counts } = checkScenarios(SCENARIOS).districts;
    const total = SCENARIOS.length * 16;
    expect(DISTRICT_KEYS.size).toBe(50);
    for (const d of DISTRICT_KEYS) {
      expect(counts.get(d) ?? 0, d).toBeGreaterThanOrEqual(6);
      expect(counts.get(d) ?? 0, d).toBeLessThanOrEqual(total * 0.08);
    }
  });

  it("every district has a landmark, and every landmark and type hangout is in a real district", () => {
    for (const d of DISTRICT_KEYS) expect(LANDMARKS.some((l) => l.district === d && l.kind === "landmark"), d).toBe(true);
    for (const l of LANDMARKS) expect(DISTRICT_KEYS.has(l.district), l.name.en).toBe(true);
    for (const a of Object.values(ARCHETYPES)) for (const h of a.hangouts) expect(DISTRICT_KEYS.has(h.district), h.name.en).toBe(true);
  });
});

describe("monthly big quests", () => {
  it("one per month, in a real district, bilingual and following the same content rules", async () => {
    const { SEASON_QUESTS } = await import("../src/domain/seasons");
    const { ADULT_EN, ADULT_TH, BANNED_EN, BANNED_TH, GENDERED_EN, GENDERED_TH } = await import("../src/vibe/bank-rules");
    expect(SEASON_QUESTS.map((q) => q.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const q of SEASON_QUESTS) {
      expect(DISTRICT_KEYS.has(q.district), q.district).toBe(true);
      for (const x of [q.theme, q.quest]) {
        expect(x.en && x.th).toBeTruthy();
        for (const re of [BANNED_EN, GENDERED_EN, ADULT_EN, /[–—]/]) expect(x.en, x.en).not.toMatch(re);
        for (const re of [BANNED_TH, GENDERED_TH, ADULT_TH, /[–—]/]) expect(x.th, x.th).not.toMatch(re);
      }
    }
  });
});
