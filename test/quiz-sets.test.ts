/**
 * Profile- and mode-aware question sets: who sees which set, that the style
 * sets never move the type, segment flavour, and that the seed rebuilds the
 * same session from the same profile inputs.
 */
import { describe, expect, it } from "vitest";
import { personalOf } from "../src/routes/quiz";
import { cleanBio, withoutDating } from "../src/content/profile";
import {
  DATE_STYLE_ITEMS,
  HOST_STYLE_ITEMS,
  QUIZ_LENGTH,
  generateSession,
  generateStyleQuestions,
  scoreSession,
  styleOf,
  type Answers,
  type Personal,
} from "../src/vibe/generator";
import { SCENARIOS } from "../src/vibe/scenarios";
import { STYLE_DIMENSIONS, STYLE_SCENARIOS, isStyleValue } from "../src/vibe/styles";
import { SEGMENT_PROMPTS } from "../src/vibe/bank/segment-prompts";
import { EXPAT_PROMPTS, GLOSSES, explainLocal } from "../src/vibe/bank/plain-english";
import { answersAs } from "./quiz-helpers";

const build = (seed: string, personal?: Personal) => ({ typed: generateSession({ seed, personal }), styles: generateStyleQuestions({ seed, personal }) });

describe("who sees which set", () => {
  it("everyone gets the 20; no style questions without a reason", () => {
    for (let i = 0; i < 20; i++) {
      for (const personal of [undefined, { district: "bang_rak" }, { segment: "international" as const }]) {
        const { typed, styles } = build(`w${i}`, personal);
        expect(typed).toHaveLength(QUIZ_LENGTH);
        expect(styles).toHaveLength(0);
      }
    }
  });

  it("Open to something more: one date-style question per dimension, nothing for hosting", () => {
    for (let i = 0; i < 30; i++) {
      const { styles } = build(`d${i}`, { openToMore: true });
      expect(styles).toHaveLength(DATE_STYLE_ITEMS);
      expect(styles.every((q) => q.set === "date")).toBe(true);
      expect(new Set(styles.map((q) => q.dimension))).toEqual(new Set(Object.keys(STYLE_DIMENSIONS.date)));
    }
  });

  it("Table Host: two host questions on two different dimensions, nothing about dating", () => {
    for (let i = 0; i < 30; i++) {
      const { typed, styles } = build(`h${i}`, { tableHost: true });
      expect(styles).toHaveLength(HOST_STYLE_ITEMS);
      expect(styles.every((q) => q.set === "host")).toBe(true);
      expect(new Set(styles.map((q) => q.dimension)).size).toBe(HOST_STYLE_ITEMS);
      expect(typed.some((q) => q.context === "date")).toBe(false);
    }
  });

  it("an opted-in Table Host gets both sets, dating first", () => {
    const { styles } = build("both", { openToMore: true, tableHost: true });
    expect(styles.map((q) => q.set)).toEqual([...Array(DATE_STYLE_ITEMS).fill("date"), ...Array(HOST_STYLE_ITEMS).fill("host")]);
  });

  it("personalOf reads the profile: romance only when single and switched on, host only for circle_head", () => {
    const base = { district: "bang_rak", interests: [], newcomer: false, bio: {}, relationship: "single", romanceOn: false };
    expect(personalOf(base)).toMatchObject({ openToMore: false, tableHost: false, segment: "local" });
    expect(personalOf({ ...base, romanceOn: true })?.openToMore).toBe(true);
    expect(personalOf({ ...base, romanceOn: true, relationship: "married" })?.openToMore).toBe(false);
    expect(personalOf(base, "circle_head")?.tableHost).toBe(true);
    expect(personalOf(base, "host")?.tableHost).toBe(false);
    expect(personalOf({ ...base, newcomer: true })?.segment).toBe("newcomer");
    expect(personalOf({ ...base, bio: { story: "expat" } })?.segment).toBe("international");
    expect(personalOf(null)).toBeUndefined();
  });
});

describe("style sets never change the type", () => {
  it("style answers carry no type, and the type is the same whatever they say", () => {
    for (let i = 0; i < 20; i++) {
      const { typed, styles } = build(`t${i}`, { openToMore: true, tableHost: true });
      for (const q of styles) for (const o of q.options) expect(o).not.toHaveProperty("type");
      const base = answersAs(typed, "CDSN");
      const results = [0, 1, 2].map((k) => {
        const answers: Answers = { ...base, ...Object.fromEntries(styles.map((q) => [q.id, k % q.options.length])) };
        return scoreSession(typed, answers);
      });
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    }
  });

  it("styleOf turns picks into a card of known values", () => {
    const { styles } = build("card", { openToMore: true, tableHost: true });
    const answers: Answers = Object.fromEntries(styles.map((q) => [q.id, 0]));
    const date = styleOf(styles, answers, "date");
    const host = styleOf(styles, answers, "host");
    expect(Object.keys(date)).toHaveLength(DATE_STYLE_ITEMS);
    expect(Object.keys(host)).toHaveLength(HOST_STYLE_ITEMS);
    for (const [d, v] of Object.entries(date)) expect(isStyleValue("date", d, v!)).toBe(true);
    for (const [d, v] of Object.entries(host)) expect(isStyleValue("host", d, v!)).toBe(true);
    expect(styleOf(styles, {}, "date")).toEqual({});
  });

  it("the dating card is romance data: kept in the bio, cleared with romance mode; the host card stays", () => {
    const bio = cleanBio({ dateStyle: { place: "walk", pace: "nope", bogus: "x" }, hostStyle: { plan: "vote" } });
    expect(bio.dateStyle).toEqual({ place: "walk" });
    expect(bio.hostStyle).toEqual({ plan: "vote" });
    const off = withoutDating(bio);
    expect(off.dateStyle).toBeUndefined();
    expect(off.hostStyle).toEqual({ plan: "vote" });
  });
});

describe("segment flavour", () => {
  it("only the prompt changes: same scenarios, answers and types", () => {
    let flavoured = 0;
    for (let i = 0; i < 60; i++) {
      for (const segment of ["local", "newcomer", "international"] as const) {
        const plain = generateSession({ seed: `s${i}`, personal: { district: "bang_rak" } });
        const told = generateSession({ seed: `s${i}`, personal: { district: "bang_rak", segment } });
        told.forEach((q) => {
          const variant = SEGMENT_PROMPTS[q.scenario]?.[segment];
          const base = SCENARIOS.find((s) => s.id === q.scenario)!.prompt;
          expect(q.prompt).toEqual(variant ?? base);
          if (variant) flavoured += 1;
        });
        // A different seed key, but the same kind of session: answers still come from the scenario.
        for (const q of told) {
          const sc = SCENARIOS.find((s) => s.id === q.scenario)!;
          for (const o of q.options) expect(o.label.en).toBe(sc.answers[o.type].en);
        }
        expect(plain).toHaveLength(told.length);
      }
    }
    expect(flavoured).toBeGreaterThan(0);
  });

  it("every variant is for a real scenario that isn't about dating", () => {
    for (const id of Object.keys(SEGMENT_PROMPTS)) {
      const sc = SCENARIOS.find((s) => s.id === id);
      expect(sc, id).toBeDefined();
      expect(sc!.context).not.toBe("date");
    }
  });
});

describe("the seed rebuilds the session", () => {
  it("same seed and profile inputs give the same questions; changing an input changes the session", () => {
    const p: Personal = { district: "bang_rak", segment: "newcomer", openToMore: true, tableHost: true };
    const ids = (x: ReturnType<typeof build>) => [...x.typed, ...x.styles].map((q) => q.id);
    expect(ids(build("r1", p))).toEqual(ids(build("r1", { ...p })));
    for (const change of [{ segment: "local" as const }, { openToMore: false }, { tableHost: false }, { district: "nong_chok" }]) {
      const other = { ...p, ...change };
      const prompts = (x: ReturnType<typeof build>) => [...x.typed, ...x.styles].map((q) => q.id + q.prompt.en);
      expect(prompts(build("r1", other)), JSON.stringify(change)).not.toEqual(prompts(build("r1", p)));
    }
  });
});

describe("style banks", () => {
  const DASH = /[–—]/;
  const GENDERED = /\b(he|she|him|her|his|hers|boyfriend|girlfriend|husband|wife|guys|girls)\b/i;
  const PARTICLES = /(ครับ|ค่ะ|แฟนหนุ่ม|แฟนสาว|สามี|ภรรยา|เดท|แชท)/;

  it("about 20 date scenarios and about 10 host scenarios, ids unique", () => {
    expect(STYLE_SCENARIOS.filter((s) => s.set === "date")).toHaveLength(20);
    expect(STYLE_SCENARIOS.filter((s) => s.set === "host")).toHaveLength(10);
    const ids = [...STYLE_SCENARIOS.map((s) => s.id), ...SCENARIOS.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every answer is a value of its dimension, and no value repeats in a scenario", () => {
    for (const s of STYLE_SCENARIOS) {
      expect(s.answers.length, s.id).toBeGreaterThanOrEqual(3);
      for (const a of s.answers) expect(isStyleValue(s.set, s.dimension, a.value), `${s.id} ${a.value}`).toBe(true);
      expect(new Set(s.answers.map((a) => a.value)).size, s.id).toBe(s.answers.length);
    }
    for (const set of ["date", "host"] as const)
      for (const d of Object.keys(STYLE_DIMENSIONS[set])) expect(STYLE_SCENARIOS.some((s) => s.set === set && s.dimension === d), d).toBe(true);
  });

  it("copy rules: no dashes, gender neutral, no polite particles, Thai spellings", () => {
    const texts: { en: string; th: string }[] = [
      ...STYLE_SCENARIOS.flatMap((s) => [s.prompt, ...s.answers]),
      ...Object.values(SEGMENT_PROMPTS).flatMap((v) => Object.values(v)),
      ...Object.values(STYLE_DIMENSIONS).flatMap((set) => Object.values(set).flatMap((d: { title: { en: string; th: string }; values: Record<string, { label: { en: string; th: string } }> }) => [d.title, ...Object.values(d.values).map((x) => x.label)])),
    ];
    for (const x of texts) {
      expect(DASH.test(x.en) || DASH.test(x.th), x.en).toBe(false);
      expect(GENDERED.test(x.en), x.en).toBe(false);
      expect(PARTICLES.test(x.th), x.th).toBe(false);
      expect(x.en.toLowerCase(), x.en).not.toContain("circle");
    }
  });
});

describe("language flavour (Task 10)", () => {
  const profile = { district: "bang_rak", interests: [], newcomer: false, bio: {}, relationship: "single", romanceOn: true };

  it("plain English for members who don't speak Thai or are here from abroad; Thai speakers keep local wording", () => {
    expect(personalOf({ ...profile, languages: ["th", "en"] })?.explainLocal).toBe(false);
    expect(personalOf({ ...profile, languages: ["en"] })?.explainLocal).toBe(true);
    expect(personalOf({ ...profile, languages: ["th", "en"], bio: { story: "expat" } })?.explainLocal).toBe(true);
    expect(explainLocal("Hot jok at your usual stall")).toBe("Hot jok (rice porridge) at your usual stall");
    expect(explainLocal("Loy Krathong on the riverside, floating the krathong you made")).toBe(
      "Loy Krathong (the festival of floating flower baskets) on the riverside, floating the krathong (a small floating flower basket) you made",
    );
    expect(explainLocal(explainLocal("Old-school khao tom"))).toBe("Old-school khao tom (rice soup)");
  });

  it("the same member answering in either language gets the same questions, answers and type", () => {
    for (let i = 0; i < 40; i++) {
      for (const seg of [{}, { bio: { story: "expat" } }, { newcomer: true }]) {
        const thai = personalOf({ ...profile, ...seg, languages: ["th", "en"] }, "circle_head")!;
        const plain = { ...thai, explainLocal: true };
        const a = [...generateSession({ seed: `l${i}`, personal: thai }), ...generateStyleQuestions({ seed: `l${i}`, personal: thai })];
        const b = [...generateSession({ seed: `l${i}`, personal: plain }), ...generateStyleQuestions({ seed: `l${i}`, personal: plain })];
        expect(b.map((q) => q.id)).toEqual(a.map((q) => q.id));
        b.forEach((q, k) => {
          expect(q.prompt.th).toBe(a[k].prompt.th);
          q.options.forEach((o, j) => expect(o.label.th).toBe(a[k].options[j].label.th));
        });
        const typedA = generateSession({ seed: `l${i}`, personal: thai });
        const typedB = generateSession({ seed: `l${i}`, personal: plain });
        expect(typedB.map((q) => q.options.map((o) => o.type))).toEqual(typedA.map((q) => q.options.map((o) => o.type)));
        for (const code of ["BDSH", "CFMN", "CDSN"] as const) {
          const answers = answersAs(typedA, code);
          expect(scoreSession(typedB, answers)).toEqual(scoreSession(typedA, answers));
        }
      }
    }
  });

  it("explains local words somewhere in a plain-English session", () => {
    let explained = 0;
    for (let i = 0; i < 60; i++) {
      const qs = generateSession({ seed: `x${i}`, personal: { explainLocal: true } });
      explained += qs.flatMap((q) => [q.prompt.en, ...q.options.map((o) => o.label.en)]).filter((x) => / \([a-z]/.test(x)).length;
    }
    expect(explained).toBeGreaterThan(0);
  });

  it("expat prompts are for real scenarios outside dating, with no dashes", () => {
    for (const [id, en] of Object.entries(EXPAT_PROMPTS)) {
      const sc = SCENARIOS.find((s) => s.id === id);
      expect(sc, id).toBeDefined();
      expect(sc!.context).not.toBe("date");
      expect(/[–—]/.test(en)).toBe(false);
    }
    for (const [, gloss] of GLOSSES) expect(/[–—]/.test(gloss)).toBe(false);
  });
});
