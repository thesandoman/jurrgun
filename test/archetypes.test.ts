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
  resultOf,
  normalizeType,
  suggestedMatches,
  typeFits,
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
    expect(typeOf(vec({ energy: 0.8, explore: -0.5, motion: -0.4, culture: 0.6, rhythm: 0.9 }))).toMatchObject({ archetype: "BFSN", modifier: "rhythm+" });
    expect(typeOf(vec({ energy: -1, explore: 1, motion: 1, culture: -1, rhythm: -0.7, plan: -0.6 }))).toMatchObject({ archetype: "CDMH", modifier: "rhythm-,plan-" });
  });
  it("breaks exact ties toward the first letter and drops balanced flavours", () => {
    expect(typeOf(vec({ rhythm: 0.1 }))).toMatchObject({ archetype: "BDMN", modifier: null });
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

describe("blend, wing and type-linked picks", () => {
  it("a balanced letter is decided by the types the person picked, a clear letter never is", () => {
    // Energy is balanced (0.1), the rest clearly D, S, H.
    const v = vec({ energy: 0.1, explore: 0.8, motion: -0.8, culture: -0.8 });
    expect(typeOf(v).archetype).toBe("BDSH");
    expect(typeOf(v, { CDSH: 1, BDSH: 0 }).archetype).toBe("CDSH");
    // Even a strong pull toward a type cannot flip a clear letter (explore stays D).
    expect(typeOf(v, { BFSH: 1, BDSH: 0 }).archetype.slice(1)).toBe("DSH");
  });

  it("the blend is the type, its wing and a third, best first, with fits in 0..100", () => {
    const v = vec({ energy: 0.7, explore: 0.3, motion: -0.6, culture: -0.9 });
    const { archetype, blend } = typeOf(v);
    expect(blend).toHaveLength(3);
    expect(blend[0].key).toBe(archetype);
    expect(new Set(blend.map((b) => b.key)).size).toBe(3);
    expect(blend[0].fit).toBeGreaterThanOrEqual(blend[1].fit);
    expect(blend[1].fit).toBeGreaterThanOrEqual(blend[2].fit);
    for (const b of blend) expect(b.fit).toBeGreaterThanOrEqual(0), expect(b.fit).toBeLessThanOrEqual(100);
    // The wing is the closest letter flip: explore (0.3) is the weakest clear letter.
    expect(blend[1].key).toBe("BFSH");
    expect(typeFits(v)).toHaveLength(16);
  });

  it("rebuilds the result extras for results saved before they existed", () => {
    const v = vec({ energy: -0.5, explore: 0.5, motion: 0.5, culture: -0.5 });
    const r = resultOf({ archetype: "CDMH", vector: v, blend: null });
    expect(r.types[0].key).toBe("CDMH");
    expect(r.types).toHaveLength(3);
    expect(r.unsure).toEqual([]);
    expect(r.range).toEqual(["CDMH"]);
    // A saved result is used as is, and one unsure letter gives a two-type range.
    const saved = { types: [{ key: "CDMH" as const, fit: 70 }, { key: "CDSH" as const, fit: 60 }], unsure: ["motion"], consistency: 0.75 };
    const r2 = resultOf({ archetype: "CDMH", vector: v, blend: saved });
    expect(r2.types).toEqual(saved.types);
    expect(r2.consistency).toBe(0.75);
    expect(r2.range).toEqual(["CDMH", "CDSH"]);
  });

  it("every type has a drive, a drain, a best time and three real spots, all bilingual", () => {
    for (const k of ARCHETYPE_KEYS) {
      const a = ARCHETYPES[k];
      for (const x of [a.drive, a.drain, a.bestTime]) expect(x.en && x.th, k).toBeTruthy();
      expect(a.spots, k).toHaveLength(3);
      for (const s of a.spots) for (const x of [s.name, s.area, s.why]) expect(x.en && x.th, k).toBeTruthy();
    }
    // Every type clicks with three other types and has three hangouts.
    for (const k of ARCHETYPE_KEYS) {
      const a = ARCHETYPES[k];
      expect(a.clicks, k).toHaveLength(3);
      for (const c of a.clicks) expect(c.key !== k && c.why.en && c.why.th, k).toBeTruthy();
      expect(a.hangouts, k).toHaveLength(3);
      for (const h of a.hangouts) expect(h.name.en && h.name.th && h.why.en && h.why.th, k).toBeTruthy();
    }
    // No two types share a headline spot.
    const names = ARCHETYPE_KEYS.flatMap((k) => ARCHETYPES[k].spots.map((s) => s.name.en));
    expect(names.length - new Set(names).size).toBeLessThanOrEqual(2);
  });
});

describe("reachability through the real quiz", () => {
  it("every one of the 16 codes comes out of a real session, with and without a home district", async () => {
    const { generateSession, scoreSession } = await import("../src/vibe/generator");
    const { answersAs } = await import("./quiz-helpers");
    for (const [seed, personal] of [["reach-a", undefined], ["reach-b", { district: "bang_rak" }]] as const) {
      const qs = generateSession({ seed, personal });
      for (const code of ARCHETYPE_KEYS) {
        const r = scoreSession(qs, answersAs(qs, code));
        expect(r.answered).toBe(qs.length);
        const t = typeOf(r.vector, r.affinity, r.unsure);
        expect(t.archetype).toBe(code);
        expect(t.blend[0].fit).toBeGreaterThanOrEqual(80);
      }
    }
  });
});
