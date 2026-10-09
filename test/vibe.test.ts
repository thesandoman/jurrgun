/**
 * Bangkok Vibe quiz generator: determinism, balance, formats, uniqueness and scoring.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  BOTHERS,
  CATEGORIES,
  COMPANIONS,
  PLACES,
  SITUATIONS,
  SLIDER_ENDS,
  STATEMENTS,
  SUPERPOWERS,
  WHENS,
  type Pole,
  type Text,
} from "../src/vibe/content";
import {
  COINS,
  generateSession,
  itemScore,
  mixCounts,
  questionSpace,
  scoreSession,
  toPublic,
  type Answer,
  type Answers,
  type Question,
} from "../src/vibe/generator";

const mixed = (seed: string, extra: Partial<Parameters<typeof generateSession>[0]> = {}) => generateSession({ seed, formats: "mixed", ...extra });

/** The answer that pushes `q` fully toward `pole`. */
export function answerFor(q: Question, pole: Pole): Answer {
  switch (q.format) {
    case "scale":
      return q.pole === pole ? 5 : 1;
    case "slider":
      return q.options[1].pole === pole ? 100 : 0;
    case "rank": {
      const idx = q.options.map((_, j) => j);
      return [...idx.filter((j) => q.options[j].pole === pole), ...idx.filter((j) => q.options[j].pole !== pole)];
    }
    case "budget": {
      const mine = q.options.map((o) => o.pole === pole);
      const n = mine.filter(Boolean).length;
      let left = COINS;
      return mine.map((m, j) => {
        if (!m) return 0;
        const isLast = mine.slice(j + 1).every((x) => !x);
        const c = isLast ? left : Math.floor(COINS / n);
        left -= c;
        return c;
      });
    }
    default:
      return q.options.findIndex((o) => o.pole === pole);
  }
}

describe("generateSession", () => {
  it("is deterministic for a seed and different across seeds", () => {
    for (const formats of ["classic", "mixed"] as const) {
      const a = generateSession({ seed: "alpha", formats }).map((q) => q.id);
      expect(generateSession({ seed: "alpha", formats }).map((q) => q.id)).toEqual(a);
      expect(generateSession({ seed: "beta", formats }).map((q) => q.id)).not.toEqual(a);
    }
  });

  it("classic sessions balance categories with a scale item per category", () => {
    for (const seed of ["1", "2", "3", "bkk", "thonburi"]) {
      const qs = generateSession({ seed, perCategory: 3 });
      expect(qs).toHaveLength(18);
      for (const c of CATEGORIES) {
        const items = qs.filter((q) => q.category === c);
        expect(items).toHaveLength(3);
        expect(items.some((q) => q.format === "scale")).toBe(true);
      }
      expect(qs.every((q) => q.format === "choice" || q.format === "scale")).toBe(true);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    }
  });

  it("mixed sessions keep perCategory balance and include every format", () => {
    for (let i = 0; i < 200; i++) {
      for (const per of [2, 3, 4, 6]) {
        const qs = mixed(`mix${i}`, { perCategory: per });
        expect(qs).toHaveLength(per * 6);
        for (const c of CATEGORIES) expect(qs.filter((q) => q.category === c)).toHaveLength(per);
        const count = (f: string) => qs.filter((q) => q.format === f).length;
        const want = mixCounts(per);
        expect(count("slider")).toBe(want.slider);
        expect(count("rank")).toBe(want.rank);
        expect(count("budget")).toBe(want.budget);
        expect(count("bothers")).toBe(want.bothers);
        expect(count("scale")).toBe(want.scale);
        expect(count("slider")).toBeGreaterThanOrEqual(1);
        expect(count("rank") + count("budget")).toBeGreaterThanOrEqual(2);
        expect(count("choice")).toBeGreaterThanOrEqual(per === 2 ? 4 : 6);
      }
    }
  });

  it("never puts the same category, or (in mixed sessions) the same format, twice in a row", () => {
    for (let i = 0; i < 300; i++) {
      for (const qs of [generateSession({ seed: `order${i}` }), mixed(`order${i}`), mixed(`order${i}`, { perCategory: 6 })]) {
        for (let k = 1; k < qs.length; k++) expect(qs[k].category).not.toBe(qs[k - 1].category);
      }
      const qs = mixed(`order${i}`);
      for (let k = 1; k < qs.length; k++) expect(qs[k].format, `${i}:${k}`).not.toBe(qs[k - 1].format);
    }
  });

  it("puts the + option first only about half the time", () => {
    let plusFirst = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      for (const q of mixed(`pos${i}`)) {
        if ((q.format !== "choice" && q.format !== "slider") || q.template === "skip") continue;
        total += 1;
        if (q.options[0].pole === 1) plusFirst += 1;
      }
    }
    expect(plusFirst / total).toBeGreaterThan(0.4);
    expect(plusFirst / total).toBeLessThan(0.6);
  });

  it("rank and budget offer two activities from each pole", () => {
    for (let i = 0; i < 50; i++) {
      for (const q of mixed(`four${i}`)) {
        if (q.format !== "rank" && q.format !== "budget") continue;
        expect(q.options).toHaveLength(4);
        expect(q.options.filter((o) => o.pole === 1)).toHaveLength(2);
        expect(new Set(q.options.map((o) => o.label.en)).size).toBe(4);
        if (q.format === "budget") expect(q.coins).toBe(10);
      }
    }
  });

  it("avoids questions the user has already seen", () => {
    for (const formats of ["classic", "mixed"] as const) {
      const first = generateSession({ seed: "u1-a", formats });
      const seen = new Set(first.map((q) => q.id));
      const second = generateSession({ seed: "u1-b", seen, formats });
      expect(second.filter((q) => seen.has(q.id)).length).toBeLessThanOrEqual(2);
    }
  });

  it("public questions leak no category or pole, in any format", () => {
    const formats = new Set<string>();
    for (let i = 0; i < 20; i++) {
      for (const q of mixed(`pub${i}`)) {
        const pub = toPublic(q);
        formats.add(pub.format);
        const json = JSON.stringify(pub);
        for (const key of ["category", "pole", "template", "districts", "tags"]) expect(json).not.toContain(`"${key}"`);
        expect(json).not.toContain("pole");
        if (pub.format !== "scale") expect(pub.options).toHaveLength(q.format === "scale" ? 0 : q.options.length);
      }
    }
    expect([...formats].sort()).toEqual(["bothers", "budget", "choice", "rank", "scale", "slider"]);
  });
});

describe("no user receives the same quiz", () => {
  it("5,000 different seeds give 5,000 different sessions, with no repeated id inside any session", () => {
    const sessions = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const ids = mixed(`acct-${i}:0`).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      sessions.add(ids.join(","));
    }
    expect(sessions.size).toBe(5000);
  }, 30_000);

  it("the same seed with different personalisation gives a different session", () => {
    const base = mixed("same-seed").map((q) => q.id).join(",");
    const a = mixed("same-seed", { personal: { district: "bang_rak", interests: ["food"] } }).map((q) => q.id).join(",");
    const b = mixed("same-seed", { personal: { district: "lat_krabang", interests: ["food"] } }).map((q) => q.id).join(",");
    const c = mixed("same-seed", { personal: { district: "bang_rak", interests: ["running", "pets"] } }).map((q) => q.id).join(",");
    expect(new Set([base, a, b, c]).size).toBe(4);
    // Empty personalisation is the same as none.
    expect(mixed("same-seed", { personal: { district: null, interests: [] } }).map((q) => q.id).join(",")).toBe(base);
  });

  it("personalisation leans scenes toward the person's district and interests", () => {
    let local = 0;
    let scenes = 0;
    let liked = 0;
    for (let i = 0; i < 400; i++) {
      for (const q of mixed(`p${i}`, { personal: { district: "lat_krabang", interests: ["running"] } })) {
        if (q.template !== "scene" && q.template !== "host") continue;
        scenes += 1;
        const place = PLACES.find((p) => p.en === q.art.caption?.en)!;
        if (place.districts.includes("lat_krabang")) local += 1;
        if (place.tags.includes("running")) liked += 1;
      }
    }
    // Uniform picking would give about 1/39 and 6/39.
    expect(local / scenes).toBeGreaterThan(0.15);
    expect(liked / scenes).toBeGreaterThan(0.3);
  });

  it("the question space is well over 100,000 and real sessions reach a wide part of it", () => {
    expect(questionSpace()).toBeGreaterThanOrEqual(100_000);
    const ids = new Set<string>();
    for (let i = 0; i < 1500; i++) for (const q of mixed(`space${i}`)) ids.add(q.id);
    expect(ids.size).toBeGreaterThanOrEqual(15_000);
  });
});

describe("content is non-political, positive and complete", () => {
  const allTexts = (): Text[] => [
    ...Object.values(ACTIVITIES).flatMap((p) => [...p.plus, ...p.minus]),
    ...Object.values(STATEMENTS).flatMap((p) => [...p.plus, ...p.minus]),
    ...Object.values(SLIDER_ENDS).flatMap((p) => [...p.plus, ...p.minus]),
    ...Object.values(BOTHERS).flatMap((p) => [...p.plus, ...p.minus]),
    ...Object.values(SUPERPOWERS).flatMap((p) => [...p.plus, ...p.minus]),
    ...SITUATIONS,
    ...PLACES,
    ...WHENS,
    ...COMPANIONS,
  ];

  it("contains none of the civic / political words from the old quiz, in English or Thai", () => {
    const banned =
      /policy|policies|government|politic|vote|voting|election|ballot|budget|tax|rules?\b|regulat|law\b|cctv|surveillance|police|security guard|expert|resident|public money|subsid|campaign|party (?:member|leader|line|politics)|ideolog|religio|worship|monk|alms|merit|pray|LGBT|gender|income|salary|protest|candidate|parliament|minister|governor|BMA\b/i;
    const bannedTh = /การเมือง|เลือกตั้ง|โหวต|ลงคะแนน|ภาษี|งบประมาณ|ตำรวจ|กล้องวงจรปิด|ศาสนา|ไหว้พระ|ตักบาตร|ทำบุญ|พรรค|รัฐบาล|นโยบาย|กฎหมาย|ผู้ว่า|ประท้วง|รายได้|เงินเดือน/;
    const texts = allTexts();
    expect(texts.length).toBeGreaterThanOrEqual(450);
    for (const text of texts) {
      expect(text.en).not.toMatch(banned);
      expect(text.th).not.toMatch(bannedTh);
    }
    // Generated prompts too (they add template words around the bank).
    for (let i = 0; i < 100; i++) {
      for (const q of mixed(`words${i}`)) {
        expect(q.prompt.en).not.toMatch(banned);
        expect(q.prompt.th).not.toMatch(bannedTh);
      }
    }
  });

  it("new copy uses no em or en dashes, and every item is bilingual", () => {
    for (const text of allTexts()) {
      expect(text.en, text.en).not.toMatch(/[–—]/);
      expect(text.th, text.en).not.toMatch(/[–—]/);
      expect(text.th.trim().length, text.en).toBeGreaterThan(0);
      expect(text.en.trim().length).toBeGreaterThan(0);
    }
    for (let i = 0; i < 50; i++) for (const q of mixed(`dash${i}`)) expect(q.prompt.en).not.toMatch(/[–—]/);
  });

  it("bank sizes: 14+ activities and 6+ statements and slider ends per pole, 30+ places, 15+ situations", () => {
    for (const c of CATEGORIES) {
      for (const bank of [ACTIVITIES[c], STATEMENTS[c], SLIDER_ENDS[c], BOTHERS[c], SUPERPOWERS[c]]) {
        expect(bank.plus.length).toBeGreaterThanOrEqual(bank === ACTIVITIES[c] ? 14 : bank === BOTHERS[c] ? 5 : bank === SUPERPOWERS[c] ? 3 : 6);
        expect(bank.minus.length).toBe(bank.plus.length);
      }
    }
    expect(Object.values(ACTIVITIES).flatMap((p) => [...p.plus, ...p.minus]).length).toBeGreaterThanOrEqual(168);
    expect(PLACES.length).toBeGreaterThanOrEqual(30);
    expect(SITUATIONS.length).toBeGreaterThanOrEqual(15);
    expect(COMPANIONS.length).toBeGreaterThanOrEqual(12);
    // No item appears twice anywhere in a bank (it would blur the two poles).
    for (const c of CATEGORIES) {
      for (const bank of [ACTIVITIES, STATEMENTS, SLIDER_ENDS, BOTHERS, SUPERPOWERS]) {
        const all = [...bank[c].plus, ...bank[c].minus].map((x) => x.en);
        expect(new Set(all).size).toBe(all.length);
      }
    }
    const acts = Object.values(ACTIVITIES).flatMap((p) => [...p.plus, ...p.minus]).map((a) => a.en);
    expect(new Set(acts).size).toBe(acts.length);
  });
});

describe("scoring", () => {
  it("scores every format, including reversed 'skip' and 'bothers' items", () => {
    for (let i = 0; i < 30; i++) {
      for (const q of mixed(`score${i}`)) {
        switch (q.format) {
          case "scale":
            expect(itemScore(q, 5)).toBe(q.pole);
            expect(itemScore(q, 3)).toBe(0);
            expect(itemScore(q, 6)).toBeNull();
            expect(itemScore(q, [5])).toBeNull();
            break;
          case "slider":
            expect(itemScore(q, 100)).toBe(q.options[1].pole);
            expect(itemScore(q, 0)).toBe(q.options[0].pole);
            expect(itemScore(q, 50)).toBe(0);
            expect(itemScore(q, 75)).toBe(0.5 * q.options[1].pole);
            expect(itemScore(q, 101)).toBeNull();
            expect(itemScore(q, 12.5)).toBeNull();
            break;
          case "rank": {
            expect(itemScore(q, answerFor(q, 1))).toBe(1);
            expect(itemScore(q, answerFor(q, -1))).toBe(-1);
            const alt = [q.options.findIndex((o) => o.pole === 1), q.options.findIndex((o) => o.pole === -1)];
            const rest = [0, 1, 2, 3].filter((j) => !alt.includes(j)).sort((a, b) => q.options[b].pole - q.options[a].pole);
            expect(itemScore(q, [...alt, ...rest])).toBe(0.5); // + − + −  →  (3 − 1 − 1 + 3) / 8
            expect(itemScore(q, [0, 0, 1, 2])).toBeNull();
            expect(itemScore(q, [0, 1, 2])).toBeNull();
            expect(itemScore(q, [0, 1, 2, 4])).toBeNull();
            expect(itemScore(q, 1)).toBeNull();
            break;
          }
          case "budget": {
            expect(itemScore(q, answerFor(q, 1))).toBe(1);
            expect(itemScore(q, answerFor(q, -1))).toBe(-1);
            const even = q.options.map(() => 0);
            even[q.options.findIndex((o) => o.pole === 1)] = 5;
            even[q.options.findIndex((o) => o.pole === -1)] = 5;
            expect(itemScore(q, even)).toBe(0);
            const lean = q.options.map((o) => (o.pole === 1 ? 4 : 1)); // 8 vs 2
            expect(itemScore(q, lean)).toBeCloseTo(0.6);
            expect(itemScore(q, [1, 1, 1, 1])).toBeNull();
            expect(itemScore(q, [11, 0, 0, -1])).toBeNull();
            expect(itemScore(q, [10, 0, 0])).toBeNull();
            expect(itemScore(q, [2.5, 2.5, 5, 0])).toBeNull();
            break;
          }
          default:
            expect(itemScore(q, 0)).toBe(q.options[0].pole);
            expect(itemScore(q, 2)).toBeNull();
            expect(itemScore(q, [0])).toBeNull();
        }
      }
    }
  });

  it("'bothers' and 'skip' items score the opposite of the side their text describes", () => {
    for (let i = 0; i < 30; i++) {
      for (const q of mixed(`rev${i}`)) {
        if (q.format === "bothers") {
          for (const o of q.options) {
            const filedUnder = BOTHERS[q.category].plus.some((b) => b.en === o.label.en) ? 1 : -1;
            expect(o.pole).toBe(filedUnder);
          }
        }
        if (q.template === "skip" && q.format === "choice") {
          for (const o of q.options) {
            const isPlusActivity = ACTIVITIES[q.category].plus.some((a) => a.en === o.label.en);
            expect(o.pole).toBe(isPlusActivity ? -1 : 1);
          }
        }
      }
    }
  });

  it("an all-+ answer sheet scores +1 everywhere, in classic and mixed sessions", () => {
    for (const qs of [generateSession({ seed: "allplus" }), mixed("allplus")]) {
      const answers: Answers = Object.fromEntries(qs.map((q) => [q.id, answerFor(q, 1)]));
      const r = scoreSession(qs, answers);
      for (const c of CATEGORIES) {
        expect(r.vector[c]).toBe(1);
        expect(r.strength[c]).toBe("strong");
      }
      expect(r.answered).toBe(qs.length);
      expect(r.highlights).toHaveLength(2);
      expect(r.name.en).toBe("Curious Connector");
    }
  });

  it("all-neutral answers give the All-Rounder", () => {
    const qs = mixed("neutral");
    const answers: Answers = {};
    for (const q of qs) {
      if (q.format === "scale") answers[q.id] = 3;
      if (q.format === "slider") answers[q.id] = 50;
    }
    const r = scoreSession(qs, answers);
    expect(r.name.en).toBe("Bangkok All-Rounder");
  });

  it("ignores malformed answers instead of throwing", () => {
    const qs = mixed("junk");
    const junk: unknown[] = [NaN, Infinity, -1, 1e9, [], [NaN, 1, 2, 3], ["a"], [1, 2, 3, 4, 5, 6]];
    for (const q of qs) for (const j of junk) expect(() => itemScore(q, j as Answer)).not.toThrow();
    const answers = Object.fromEntries(qs.map((q, i) => [q.id, junk[i % junk.length] as Answer]));
    expect(scoreSession(qs, answers).answered).toBe(0);
  });
});

describe("procedural visuals", () => {
  it("every bank item has an icon or a sky tone", async () => {
    const { ACTIVITY_ICONS, PLACE_ICONS, WHEN_TONES, SITUATION_ART, COMPANION_ICONS, SLIDER_ICONS, BOTHER_ICONS, POWER_ICONS } = await import("../src/vibe/visuals");
    for (const p of Object.values(ACTIVITIES)) for (const a of [...p.plus, ...p.minus]) expect(ACTIVITY_ICONS[a.en], a.en).toBeTruthy();
    for (const p of PLACES) expect(PLACE_ICONS[p.en], p.en).toBeTruthy();
    for (const w of WHENS) expect(WHEN_TONES[w.en], w.en).toBeTruthy();
    for (const s of SITUATIONS) expect(SITUATION_ART[s.en]?.icon, s.en).toBeTruthy();
    for (const c of COMPANIONS) expect(COMPANION_ICONS[c.en], c.en).toBeTruthy();
    for (const p of Object.values(SLIDER_ENDS)) for (const a of [...p.plus, ...p.minus]) expect(SLIDER_ICONS[a.en], a.en).toBeTruthy();
    for (const p of Object.values(BOTHERS)) for (const a of [...p.plus, ...p.minus]) expect(BOTHER_ICONS[a.en], a.en).toBeTruthy();
    for (const p of Object.values(SUPERPOWERS)) for (const a of [...p.plus, ...p.minus]) expect(POWER_ICONS[a.en], a.en).toBeTruthy();
  });

  it("every question carries a picture and every option an icon", () => {
    for (let i = 0; i < 50; i++) {
      for (const q of mixed(`art${i}`)) {
        expect(q.art.icons.length).toBeGreaterThan(0);
        expect(q.art.tone).toBeTruthy();
        if (q.format !== "scale") for (const o of q.options) expect(o.icon).toBeTruthy();
        expect(toPublic(q).art).toEqual(q.art);
      }
    }
  });

  it("every one of the 16 Bangkok Types is reachable through real answers, in every format mix", async () => {
    const { ARCHETYPE_KEYS, CODE_AXES, typeOf } = await import("../src/vibe/archetypes");
    for (const qs of [generateSession({ seed: "reach" }), mixed("reach"), mixed("reach2", { perCategory: 2 })]) {
      for (const code of ARCHETYPE_KEYS) {
        const want: Record<string, Pole> = {};
        CODE_AXES.forEach((axis, i) => (want[axis.category] = code[i] === axis.plus ? 1 : -1));
        const answers: Answers = Object.fromEntries(qs.map((q) => [q.id, answerFor(q, want[q.category] ?? 1)]));
        expect(typeOf(scoreSession(qs, answers).vector).archetype).toBe(code);
      }
    }
  });
});
