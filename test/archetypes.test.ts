/**
 * Bangkok Types (archetypes) built on the 6 Vibe categories.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/vibe/content";
import { ARCHETYPES, displayName, matchLabel, suggestedMatches, typeOf } from "../src/vibe/archetypes";

const vec = (o: Record<string, number>) => Object.fromEntries(CATEGORIES.map((c) => [c, o[c] ?? 0]));

describe("typeOf", () => {
  it("picks the strongest pole and the second as modifier", () => {
    expect(typeOf(vec({ rhythm: 0.9, explore: 0.5 }))).toEqual({ archetype: "rhythm+", modifier: "explore+" });
    expect(typeOf(vec({ culture: -0.7 }))).toEqual({ archetype: "culture-", modifier: null });
  });
  it("is the All-Rounder when everything is balanced", () => {
    expect(typeOf(vec({ energy: 0.1, plan: -0.2 }))).toEqual({ archetype: "allrounder", modifier: null });
  });
});

describe("names", () => {
  it("combines modifier and archetype in both languages", () => {
    expect(displayName("rhythm+", "explore+").en).toBe("The Curious Night Owl");
    expect(displayName("rhythm+", "explore+").th).toBe("นกฮูกราตรีสายลองของใหม่");
    expect(displayName("allrounder", null).en).toBe("The Bangkok All-Rounder");
  });
  it("has 13 archetypes, each fully bilingual", () => {
    const all = Object.values(ARCHETYPES);
    expect(all).toHaveLength(13);
    for (const a of all) for (const f of [a.name, a.tagline, a.description, a.bangkok, a.starter]) {
      expect(f.th.length).toBeGreaterThan(0);
      expect(f.en.length).toBeGreaterThan(0);
    }
  });
});

describe("match labels", () => {
  it("labels natural, complementary and interesting pairings symmetrically", () => {
    expect(matchLabel("rhythm+", "rhythm+")).toBe("natural");
    expect(matchLabel("explore+", "plan-")).toBe("complementary");
    expect(matchLabel("plan-", "explore+")).toBe("complementary");
    expect(matchLabel("rhythm+", "rhythm-")).toBe("interesting");
    expect(matchLabel("rhythm+", "culture-")).toBeNull();
  });
  it("suggests a natural, complementary and interesting type", () => {
    expect(suggestedMatches("rhythm+")).toEqual({ natural: "rhythm+", complementary: "energy+", interesting: "rhythm-" });
  });
});
