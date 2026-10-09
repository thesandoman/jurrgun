/**
 * The 16 Bangkok Types, built on the 6 Vibe categories.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/vibe/content";
import {
  ARCHETYPES,
  ARCHETYPE_KEYS,
  LEGEND,
  codeLetters,
  displayName,
  flavourBadges,
  matchLabel,
  normalizeType,
  suggestedMatches,
  typeOf,
} from "../src/vibe/archetypes";

const vec = (o: Record<string, number>) => Object.fromEntries(CATEGORIES.map((c) => [c, o[c] ?? 0]));

describe("16 types", () => {
  it("has exactly 16 codes, every combination of the four letter pairs, fully bilingual", () => {
    expect(ARCHETYPE_KEYS).toHaveLength(16);
    const all = new Set<string>();
    for (const a of "BC") for (const b of "DF") for (const c of "MS") for (const d of "NH") all.add(a + b + c + d);
    expect(new Set(ARCHETYPE_KEYS)).toEqual(all);
    for (const a of Object.values(ARCHETYPES)) for (const f of [a.name, a.tagline, a.description, a.bangkok, a.starter]) {
      expect(f.th.length).toBeGreaterThan(0);
      expect(f.en.length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(ARCHETYPES).map((a) => a.name.en)).size).toBe(16);
  });

  it("legend explains every letter and both badges", () => {
    for (const k of ARCHETYPE_KEYS) expect(codeLetters(k).every(Boolean)).toBe(true);
    for (const k of ["rhythm+", "rhythm-", "plan+", "plan-"]) expect(LEGEND.some((l) => l.key === k)).toBe(true);
  });
});

describe("typeOf", () => {
  it("takes letters from energy, explore, motion, culture and a flavour from rhythm and plan", () => {
    expect(typeOf(vec({ energy: 0.8, explore: -0.5, motion: -0.4, culture: 0.6, rhythm: 0.9 }))).toEqual({ archetype: "BFSN", modifier: "rhythm+" });
    expect(typeOf(vec({ energy: -1, explore: 1, motion: 1, culture: -1, rhythm: -0.7, plan: -0.6 }))).toEqual({ archetype: "CDMH", modifier: "rhythm-,plan-" });
  });
  it("breaks exact ties toward the first letter and drops balanced flavours", () => {
    expect(typeOf(vec({ rhythm: 0.1 }))).toEqual({ archetype: "BDMN", modifier: null });
  });
  it("recomputes results saved by the old 13-type version", () => {
    expect(normalizeType({ archetype: "plan+", modifier: "energy-", vector: vec({ energy: -0.5, plan: 0.8 }) })).toEqual({ archetype: "CDMN", modifier: "plan+" });
    expect(normalizeType({ archetype: "BDSH", modifier: null, vector: {} })).toEqual({ archetype: "BDSH", modifier: null });
  });
});

describe("names and badges", () => {
  it("adds flavour icons to the name", () => {
    expect(displayName("BDSH", "rhythm+").en).toBe("The Food Hunter 🌙");
    expect(displayName("BDSH", null).en).toBe("The Food Hunter");
    expect(flavourBadges("rhythm-,plan+").map((b) => b.icon)).toEqual(["🌅", "🎲"]);
  });
});

describe("match labels", () => {
  it("natural = same code, complementary = one letter apart, interesting = all four opposite", () => {
    expect(matchLabel("BDMN", "BDMN")).toBe("natural");
    expect(matchLabel("BDMN", "BDSN")).toBe("complementary");
    expect(matchLabel("BDSN", "BDMN")).toBe("complementary");
    expect(matchLabel("BDMN", "CFSH")).toBe("interesting");
    expect(matchLabel("BDMN", "BFSN")).toBeNull();
  });
  it("suggests self, the Move/Savour flip, and the full opposite", () => {
    expect(suggestedMatches("BDMN")).toEqual({ natural: "BDMN", complementary: "BDSN", interesting: "CFSH" });
  });
});
