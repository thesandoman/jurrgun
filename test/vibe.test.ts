/**
 * Bangkok Vibe quiz generator: determinism, balance, and scoring.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, ACTIVITIES, STATEMENTS } from "../src/vibe/content";
import { generateSession, itemScore, scoreSession, toPublic, type Answers } from "../src/vibe/generator";

describe("generateSession", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const a = generateSession({ seed: "alpha" }).map((q) => q.id);
    expect(generateSession({ seed: "alpha" }).map((q) => q.id)).toEqual(a);
    expect(generateSession({ seed: "beta" }).map((q) => q.id)).not.toEqual(a);
  });

  it("balances categories and always includes a scale item per category", () => {
    for (const seed of ["1", "2", "3", "bkk", "thonburi"]) {
      const qs = generateSession({ seed, perCategory: 3 });
      expect(qs).toHaveLength(18);
      for (const c of CATEGORIES) {
        const items = qs.filter((q) => q.category === c);
        expect(items).toHaveLength(3);
        expect(items.some((q) => q.format === "scale")).toBe(true);
      }
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    }
  });

  it("never puts the same category twice in a row", () => {
    const qs = generateSession({ seed: "order" });
    for (let i = 1; i < qs.length; i++) expect(qs[i].category).not.toBe(qs[i - 1].category);
  });

  it("puts the + option first only about half the time", () => {
    let plusFirst = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      for (const q of generateSession({ seed: `pos${i}` })) {
        if (q.format !== "choice" || q.template === "skip") continue;
        total += 1;
        if (q.options[0].pole === 1) plusFirst += 1;
      }
    }
    expect(plusFirst / total).toBeGreaterThan(0.4);
    expect(plusFirst / total).toBeLessThan(0.6);
  });

  it("avoids questions the user has already seen", () => {
    const first = generateSession({ seed: "u1-a" });
    const seen = new Set(first.map((q) => q.id));
    const second = generateSession({ seed: "u1-b", seen });
    const repeats = second.filter((q) => seen.has(q.id)).length;
    expect(repeats).toBeLessThanOrEqual(2);
  });

  it("public questions leak no category or pole", () => {
    const pub = generateSession({ seed: "x" }).map(toPublic);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("category");
    expect(json).not.toContain("pole");
  });
});

describe("content is non-political", () => {
  it("contains none of the civic / political words from the old quiz", () => {
    const banned = /policy|government|vote|budget|tax|rules?\b|cctv|police|expert|resident|public money|political party|ideolog|religio|LGBT|gender/i;
    const texts = [
      ...Object.values(ACTIVITIES).flatMap((p) => [...p.plus, ...p.minus]),
      ...Object.values(STATEMENTS).flatMap((p) => [...p.plus, ...p.minus]),
    ].map((t) => t.en);
    for (const text of texts) expect(text).not.toMatch(banned);
  });
});

describe("scoring", () => {
  it("scores choice and scale items, including reversed 'skip' items", () => {
    const qs = generateSession({ seed: "score" });
    for (const q of qs) {
      if (q.format === "scale") {
        expect(itemScore(q, 5)).toBe(q.pole);
        expect(itemScore(q, 3)).toBe(0);
        expect(itemScore(q, 6)).toBeNull();
      } else {
        expect(itemScore(q, 0)).toBe(q.options[0].pole);
        expect(itemScore(q, 2)).toBeNull();
      }
    }
  });

  it("an all-+ answer sheet scores +1 everywhere", () => {
    const qs = generateSession({ seed: "allplus" });
    const answers: Answers = {};
    for (const q of qs) {
      answers[q.id] = q.format === "scale" ? (q.pole === 1 ? 5 : 1) : q.options.findIndex((o) => o.pole === 1);
    }
    const r = scoreSession(qs, answers);
    for (const c of CATEGORIES) {
      expect(r.vector[c]).toBe(1);
      expect(r.strength[c]).toBe("strong");
    }
    expect(r.highlights).toHaveLength(2);
    expect(r.name.en).toBe("Curious Connector");
  });

  it("all-neutral answers give the All-Rounder", () => {
    const qs = generateSession({ seed: "neutral" });
    const answers: Answers = Object.fromEntries(qs.filter((q) => q.format === "scale").map((q) => [q.id, 3]));
    const r = scoreSession(qs, answers);
    expect(r.name.en).toBe("Bangkok All-Rounder");
  });
});

describe("procedural question space and visuals", () => {
  it("can generate well over 10,000 distinct questions, and real sessions reach them", async () => {
    const { questionSpace } = await import("../src/vibe/generator");
    expect(questionSpace()).toBeGreaterThanOrEqual(10_000);
    const ids = new Set<string>();
    for (let i = 0; i < 1500; i++) for (const q of generateSession({ seed: `space${i}` })) ids.add(q.id);
    expect(ids.size).toBeGreaterThanOrEqual(10_000);
  });

  it("every bank item has an icon or a sky tone", async () => {
    const { ACTIVITY_ICONS, PLACE_ICONS, WHEN_TONES } = await import("../src/vibe/visuals");
    const { PLACES, WHENS } = await import("../src/vibe/content");
    for (const p of Object.values(ACTIVITIES)) for (const a of [...p.plus, ...p.minus]) expect(ACTIVITY_ICONS[a.en], a.en).toBeTruthy();
    for (const p of PLACES) expect(PLACE_ICONS[p.en], p.en).toBeTruthy();
    for (const w of WHENS) expect(WHEN_TONES[w.en], w.en).toBeTruthy();
  });

  it("every question carries a picture and every option an icon", () => {
    for (let i = 0; i < 50; i++) {
      for (const q of generateSession({ seed: `art${i}` })) {
        expect(q.art.icons.length).toBeGreaterThan(0);
        expect(q.art.tone).toBeTruthy();
        if (q.format === "choice") for (const o of q.options) expect(o.icon).toBeTruthy();
        const pub = toPublic(q);
        expect(pub.art).toEqual(q.art);
      }
    }
  });

  it("every one of the 16 Bangkok Types is reachable through real answers", async () => {
    const { ARCHETYPE_KEYS, CODE_AXES, typeOf } = await import("../src/vibe/archetypes");
    const qs = generateSession({ seed: "reach" });
    for (const code of ARCHETYPE_KEYS) {
      const want: Record<string, 1 | -1> = {};
      CODE_AXES.forEach((axis, i) => (want[axis.category] = code[i] === axis.plus ? 1 : -1));
      const answers: Answers = {};
      for (const q of qs) {
        const pole = want[q.category] ?? 1;
        answers[q.id] = q.format === "scale" ? (q.pole === pole ? 5 : 1) : q.options.findIndex((o) => o.pole === pole);
      }
      expect(typeOf(scoreSession(qs, answers).vector).archetype).toBe(code);
    }
  });
});
