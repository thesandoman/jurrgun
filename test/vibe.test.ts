/**
 * Bangkok Type quiz: session building, balance, the 2,500-quiz rule, scoring
 * and the margin of error.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/vibe/content";
import {
  CONTEXT_MIN,
  OPTIONS_PER_QUESTION,
  QUIZ_LENGTH,
  generateSession,
  itemScore,
  scoreSession,
  toPublic,
  type Answers,
  type Question,
} from "../src/vibe/generator";
import { LETTERS, SCENARIOS, TYPE_CODES, oppositeCode, type TypeCode } from "../src/vibe/scenarios";
import { ARCHETYPE_KEYS, typeOf } from "../src/vibe/archetypes";
import { answerAs, answersAs } from "./quiz-helpers";

const session = (seed: string, extra: Partial<Parameters<typeof generateSession>[0]> = {}) => generateSession({ seed, ...extra });
const ids = (qs: Question[]) => qs.map((q) => q.id).join(",");
const CODE_CATS = ["energy", "explore", "motion", "culture"] as const;

describe("generateSession", () => {
  it("is deterministic for a seed and different across seeds", () => {
    expect(ids(session("alpha"))).toBe(ids(session("alpha")));
    expect(ids(session("beta"))).not.toBe(ids(session("alpha")));
  });

  it("20 questions: 16 core, 2 rhythm, 2 plan, six answers each, every scenario once", () => {
    for (let i = 0; i < 300; i++) {
      const qs = session(`shape${i}`);
      expect(qs).toHaveLength(QUIZ_LENGTH);
      expect(qs.filter((q) => q.kind === "core")).toHaveLength(16);
      expect(qs.filter((q) => q.kind === "rhythm")).toHaveLength(2);
      expect(qs.filter((q) => q.kind === "plan")).toHaveLength(2);
      expect(new Set(qs.map((q) => q.scenario)).size).toBe(QUIZ_LENGTH);
      for (const q of qs) expect(q.options).toHaveLength(OPTIONS_PER_QUESTION);
    }
  });

  it("every question shows three opposite pairs, so each letter (and flavour) is split 3/3", () => {
    for (let i = 0; i < 300; i++) {
      for (const q of session(`split${i}`)) {
        const codes = q.options.map((o) => o.type);
        expect(new Set(codes).size).toBe(6);
        for (const c of codes) expect(codes).toContain(oppositeCode(c));
        for (let k = 0; k < 4; k++) expect(codes.filter((c) => LETTERS[c[k]].pole === 1)).toHaveLength(3);
        if (q.kind !== "core") expect(q.options.filter((o) => o.flavour === 1)).toHaveLength(3);
        // Every answer is the hand-written one for that type.
        const sc = SCENARIOS.find((s) => s.id === q.scenario)!;
        for (const o of q.options) expect(o.label.en).toBe(sc.answers[o.type].en);
      }
    }
  });

  it("every type is offered 7 or 8 times per session", () => {
    for (let i = 0; i < 300; i++) {
      const offered = new Map<string, number>(TYPE_CODES.map((c) => [c, 0]));
      for (const q of session(`fair${i}`)) for (const o of q.options) offered.set(o.type, offered.get(o.type)! + 1);
      for (const n of offered.values()) expect([7, 8]).toContain(n);
    }
  });

  it("mixes who you're with: the context minimums hold in every session (date only for opted-in members)", () => {
    for (let i = 0; i < 300; i++) {
      const openToMore = i % 2 === 0;
      const core = session(`ctx${i}`, { personal: { openToMore } }).filter((q) => q.kind === "core");
      for (const [ctx, min] of Object.entries(CONTEXT_MIN)) {
        if (ctx === "date" && !openToMore) continue;
        expect(core.filter((q) => q.context === ctx).length, ctx).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("includes two twin pairs, at least 8 questions apart", () => {
    for (let i = 0; i < 300; i++) {
      const qs = session(`twin${i}`);
      const pairs = qs.filter((q) => q.twin && qs.some((x) => x.scenario === q.twin) && q.scenario < q.twin!);
      expect(pairs).toHaveLength(2);
      for (const q of pairs) {
        const j = qs.findIndex((x) => x.scenario === q.twin);
        expect(Math.abs(qs.indexOf(q) - j)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("avoids scenarios the person has already seen", () => {
    const first = session("u1-a");
    const second = session("u1-b", { seen: new Set(first.map((q) => q.id)) });
    const firstScenarios = new Set(first.map((q) => q.scenario));
    // 47 scenarios, 20 per quiz: twins and context minimums may force a few back.
    expect(second.filter((q) => firstScenarios.has(q.scenario)).length).toBeLessThanOrEqual(6);
  });

  it("a home district puts an answer set near home into the session", () => {
    for (let i = 0; i < 100; i++) {
      const qs = session(`home${i}`, { personal: { district: "nong_chok" } });
      expect(qs.some((q) => q.options.some((o) => o.district === "nong_chok"))).toBe(true);
    }
  });

  it("public questions leak no type, district or flavour", () => {
    for (let i = 0; i < 30; i++) {
      for (const q of session(`pub${i}`)) {
        const json = JSON.stringify(toPublic(q));
        expect(json).not.toMatch(/"type"|"district"|"flavour"|"kind"|"context"|"twin"/);
        for (const code of TYPE_CODES) expect(json).not.toContain(`"${code}"`);
      }
    }
  });
});

describe("no two people get the same quiz", () => {
  it("5,000 seeds give 5,000 different sessions", () => {
    const all = new Set<string>();
    for (let i = 0; i < 5000; i++) all.add(ids(session(`u${i}`)));
    expect(all.size).toBe(5000);
  });

  it("at least 2,500 different quizzes lead to each of the 16 types", () => {
    const quizzes = Array.from({ length: 2500 }, (_, i) => session(`perm${i}`));
    expect(new Set(quizzes.map(ids)).size).toBe(2500);
    for (const code of ARCHETYPE_KEYS) {
      let reached = 0;
      for (const qs of quizzes) {
        const r = scoreSession(qs, answersAs(qs, code));
        if (typeOf(r.vector, r.affinity, r.unsure).archetype === code) reached += 1;
      }
      expect(reached, code).toBe(2500);
    }
  }, 120_000);
});

describe("scoring and the margin of error", () => {
  it("only option indices are valid answers", () => {
    const q = session("valid")[0];
    expect(itemScore(q, 0)).toBe(1);
    expect(itemScore(q, 5)).toBe(1);
    for (const bad of [6, -1, 1.5, NaN, "2", [1], null]) expect(itemScore(q, bad)).toBeNull();
  });

  it("someone answering consistently as a type gets exactly that type, every letter clear", () => {
    for (const code of ARCHETYPE_KEYS) {
      const qs = session(`clear-${code}`);
      const r = scoreSession(qs, answersAs(qs, code));
      expect(r.answered).toBe(20);
      for (const c of CODE_CATS) expect(r.unsure, `${code} ${c}`).not.toContain(c);
      expect(r.consistency).toBe(1);
      const t = typeOf(r.vector, r.affinity, r.unsure);
      expect(t.archetype).toBe(code);
      expect(t.range).toEqual([code]);
      expect(r.affinity[code]).toBe(1);
    }
  });

  it("a 50/50 answerer gets unsure letters and a range instead of one type", () => {
    const qs = session("split-mind");
    const answers: Answers = Object.fromEntries(qs.map((q, i) => [q.id, answerAs(q, i % 2 ? "BDSH" : "CFMN")]));
    const r = scoreSession(qs, answers);
    expect(r.unsure.filter((c) => (CODE_CATS as readonly string[]).includes(c)).length).toBeGreaterThanOrEqual(2);
    expect(typeOf(r.vector, r.affinity, r.unsure).range.length).toBeGreaterThan(1);
  });

  it("one unsure letter gives a range of the two types either side of it", () => {
    const v = { energy: 0.1, explore: 0.8, motion: -0.8, culture: -0.8, rhythm: 0, plan: 0 };
    const t = typeOf(v, null, ["energy", "rhythm", "plan"]);
    expect(t.range).toHaveLength(2);
    expect(t.range.map((k) => k.slice(1))).toEqual(["DSH", "DSH"]);
    expect(new Set(t.range.map((k) => k[0]))).toEqual(new Set(["B", "C"]));
  });

  it("a twin pair answered differently lowers consistency and widens the margin", () => {
    const qs = session("twin-margin");
    const base = answersAs(qs, "BDSH");
    const r1 = scoreSession(qs, base);
    const twin = qs.find((q) => q.twin && qs.some((x) => x.scenario === q.twin))!;
    const r2 = scoreSession(qs, { ...base, [twin.id]: answerAs(twin, "CFMN") });
    expect(r2.consistency).toBeLessThan(1);
    const wider = (["energy", "explore", "motion", "culture"] as const).filter((c) => r2.margin[c] > r1.margin[c]);
    expect(wider.length).toBeGreaterThan(0);
  });

  it("flavours come from the rhythm and plan questions and need both answers to agree", () => {
    const qs = session("flavour");
    const answers: Answers = {};
    for (const q of qs) answers[q.id] = q.kind === "core" ? 0 : q.options.findIndex((o) => o.flavour === 1);
    const r = scoreSession(qs, answers);
    expect(r.vector.rhythm).toBe(1);
    expect(r.vector.plan).toBe(1);
    expect(r.unsure).not.toContain("rhythm");
    const rq = qs.filter((q) => q.kind === "rhythm");
    const split = { ...answers, [rq[1].id]: rq[1].options.findIndex((o) => o.flavour === -1) };
    expect(scoreSession(qs, split).unsure).toContain("rhythm");
  });

  it("random answerers mostly get a range result: we don't overclaim", () => {
    let ranged = 0;
    for (let i = 0; i < 300; i++) {
      const qs = session(`rand${i}`);
      const answers: Answers = Object.fromEntries(qs.map((q, k) => [q.id, (i * 7 + k * 5 + ((i * k) % 3)) % 6]));
      const r = scoreSession(qs, answers);
      if (typeOf(r.vector, r.affinity, r.unsure).range.length > 1) ranged += 1;
    }
    expect(ranged / 300).toBeGreaterThan(0.7);
  });

  it("ignores malformed answers instead of throwing", () => {
    const qs = session("junk");
    const junk: unknown[] = [NaN, Infinity, -1, 1e9, [], "a", null, 7];
    const answers = Object.fromEntries(qs.map((q, i) => [q.id, junk[i % junk.length]])) as unknown as Answers;
    const r = scoreSession(qs, answers);
    expect(r.answered).toBe(0);
    for (const c of CATEGORIES) expect(r.vector[c]).toBe(0);
  });

  it("every scenario has an answer in each type's own voice", () => {
    for (const sc of SCENARIOS) for (const code of TYPE_CODES) expect(sc.answers[code as TypeCode]?.en, `${sc.id} ${code}`).toBeTruthy();
  });
});

describe("romance in the core quiz", () => {
  it("never shows a date scenario unless the member opted into Open to something more, and still asks 20 questions", async () => {
    const { generateSession, QUIZ_LENGTH } = await import("../src/vibe/generator");
    const { SCENARIOS } = await import("../src/vibe/scenarios");
    const ctxOf = new Map(SCENARIOS.map((s) => [s.id, s.context]));
    for (let i = 0; i < 40; i++) {
      for (const qs of [generateSession({ seed: `f${i}` }), generateSession({ seed: `f${i}`, personal: { district: "bang_rak", segment: "newcomer", tableHost: true } })]) {
        expect(qs).toHaveLength(QUIZ_LENGTH);
        expect(qs.some((q) => ctxOf.get(q.id.split(".")[0]) === "date")).toBe(false);
      }
    }
    // Opted-in members still get some, at least the context minimum.
    for (let i = 0; i < 10; i++) {
      const qs = generateSession({ seed: `f${i}`, personal: { openToMore: true } });
      expect(qs.filter((q) => q.context === "date").length).toBeGreaterThanOrEqual(3);
    }
  });
});
