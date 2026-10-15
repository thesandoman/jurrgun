/**
 * Bangkok Type quiz: the curated sets (D26), scoring and the margin of error.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, MOTIVE_PLACES, motivePlace, motiveSentence } from "../src/vibe/content";
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
import { followUpQuestions, offered } from "../src/vibe/generator";
import { CURATED_SETS } from "../src/vibe/curated-sets";
import { answerAs, answersAs } from "./quiz-helpers";

const session = (seed: string, extra: Partial<Parameters<typeof generateSession>[0]> = {}) => generateSession({ seed, ...extra });
const ids = (qs: Question[]) => qs.map((q) => q.id).join(",");
const CODE_CATS = ["energy", "explore", "motion", "culture"] as const;

const SEGMENTS = ["local", "newcomer", "international"] as const;
const MONTHS = Array.from({ length: 12 }, (_, k) => k + 1);
/** Every set a member can get: each segment, each month. */
const allSets = () => SEGMENTS.flatMap((segment) => MONTHS.map((month) => ({ segment, month, qs: session("any", { personal: { segment }, month }) })));

describe("the curated quiz (owner D26, quiz-curated.md)", () => {
  it("everyone in a segment gets the same questions in the same order, whatever the seed, history or district", () => {
    for (const segment of SEGMENTS) {
      const base = ids(session("alpha", { personal: { segment }, month: 2 }));
      expect(ids(session("beta", { personal: { segment }, month: 2 }))).toBe(base);
      expect(ids(session("gamma", { personal: { segment, district: "nong_chok" }, month: 2, seen: new Set(base.split(",")) }))).toBe(base);
    }
    // No Bangkok story yet (anonymous, onboarding): the local set.
    expect(ids(session("x", { month: 2 }))).toBe(ids(session("y", { personal: { segment: "local" }, month: 2 })));
  });

  it("16 questions: 12 core, 2 rhythm, 2 plan, every scenario once, four answers in two opposite pairs", () => {
    for (const { qs } of allSets()) {
      expect(qs).toHaveLength(QUIZ_LENGTH);
      expect(QUIZ_LENGTH).toBe(16);
      expect(qs.filter((q) => q.kind === "core")).toHaveLength(12);
      expect(qs.filter((q) => q.kind === "rhythm")).toHaveLength(2);
      expect(qs.filter((q) => q.kind === "plan")).toHaveLength(2);
      expect(new Set(qs.map((q) => q.scenario)).size).toBe(QUIZ_LENGTH);
      for (const q of qs) {
        expect(q.format).toBe("choice");
        expect(q.options).toHaveLength(OPTIONS_PER_QUESTION);
        const codes = q.options.map((o) => o.type);
        expect(new Set(codes).size).toBe(4);
        for (const c of codes) expect(codes).toContain(oppositeCode(c));
        for (let k = 0; k < 4; k++) expect(codes.filter((c) => LETTERS[c[k]].pole === 1)).toHaveLength(2);
        if (q.kind !== "core") expect(q.options.filter((o) => o.flavour === 1)).toHaveLength(2);
        // Every answer is the hand-written one for that type (the friend wording for anyone not open to something more).
        const sc = SCENARIOS.find((s) => s.id === q.scenario)!;
        for (const o of q.options) expect(o.label.en).toBe((sc.friend?.answers?.[o.type] ?? sc.answers[o.type]).en);
      }
    }
  });

  it("every type is shown exactly 4 times, in every set and every month", () => {
    for (const { segment, month, qs } of allSets()) {
      const shown = new Map<string, number>(TYPE_CODES.map((c) => [c, 0]));
      for (const q of qs) for (const o of q.options) shown.set(o.type, shown.get(o.type)! + 1);
      for (const c of TYPE_CODES) expect(shown.get(c), `${segment} ${month} ${c}`).toBe(4);
    }
  });

  it("mixes who you're with: every context in the 12 core questions", () => {
    for (const { qs } of allSets()) {
      const contexts = new Set(qs.filter((q) => q.kind === "core").map((q) => q.context));
      for (const ctx of Object.keys(CONTEXT_MIN)) expect(contexts, ctx).toContain(ctx);
    }
  });

  it("personality picks give one 'what moves you' sentence with a real place, never changing the type", () => {
    // Every curated set carries at least one personality question with motives (D32, D37).
    for (const { segment, month, qs } of allSets()) expect(qs.some((q) => q.options.some((o) => o.motive)), `${segment} ${month}`).toBe(true);
    const qs = session("motive", { personal: { segment: "local" }, month: 2 });
    for (const code of ARCHETYPE_KEYS) {
      const answers = answersAs(qs, code);
      const r = scoreSession(qs, answers);
      const all = (v: Answers[string]) => (Array.isArray(v) ? v : [v]);
      const picked = qs.flatMap((q) => all(answers[q.id]).map((i) => q.options[i]?.motive)).filter((m) => m !== undefined);
      expect(picked.length).toBeGreaterThan(0);
      expect(r.moves).not.toBeNull();
      expect(picked).toContain(r.moves!.motive);
      expect(MOTIVE_PLACES[r.moves!.motive].map((p) => p.id)).toContain(r.moves!.place);
      const line = motiveSentence(r.moves!.motive, r.moves!.place);
      expect(line.th && line.en).toBeTruthy();
      // Same answers with the personality questions skipped: no sentence, same letters.
      const without = Object.fromEntries(Object.entries(answers).filter(([id]) => !qs.find((q) => q.id === id)!.options.some((o) => o.motive)));
      const r2 = scoreSession(qs, without);
      expect(r2.moves).toBeNull();
      expect(typeOf(r2.vector, r2.affinity, r2.unsure).archetype).toBe(code);
    }
  });

  it("the place in the sentence comes from the member's own picks when it can", () => {
    expect(motivePlace("discovery", ["phasi_charoen", "phasi_charoen", "pathum_wan"], 0).id).toBe("khlong-bang-luang");
    expect(motivePlace("calm", ["bang_rak"], 0).id).toBe("neilson-hays");
    for (const seed of [0, 1, 2, 7]) expect(MOTIVE_PLACES.calm.map((p) => p.id)).toContain(motivePlace("calm", ["nong_chok"], seed).id);
  });

  it("includes two twin pairs, at least 8 questions apart, with the same answers' types", () => {
    for (const { qs } of allSets()) {
      const pairs = qs.filter((q) => q.twin && qs.some((x) => x.scenario === q.twin) && q.scenario < q.twin!);
      expect(pairs).toHaveLength(2);
      for (const q of pairs) {
        const t = qs.find((x) => x.scenario === q.twin)!;
        expect(Math.abs(qs.indexOf(q) - qs.indexOf(t))).toBeGreaterThanOrEqual(8);
        expect(new Set(t.options.map((o) => o.type))).toEqual(new Set(q.options.map((o) => o.type)));
      }
    }
  });

  it("most questions are shared across segments, and each set only holds scenarios its members are offered", () => {
    const local = session("s", { personal: { segment: "local" }, month: 2 });
    for (const segment of SEGMENTS) {
      const qs = session("s", { personal: { segment }, month: 2 });
      expect(qs.filter((q, k) => q.scenario === local[k].scenario).length).toBeGreaterThanOrEqual(12);
      for (const q of qs) expect(offered(SCENARIOS.find((s) => s.id === q.scenario)!, { segment }), q.scenario).toBe(true);
    }
  });

  it("the seasonal slot follows the month and keeps its answers' types", () => {
    const set = CURATED_SETS.local;
    const slot = set.entries[set.season];
    for (const month of MONTHS) {
      const q = session("s", { personal: { segment: "local" }, month })[set.season];
      expect(q.scenario).toBe(set.calendar[month] ?? slot.scenario);
      expect(q.options.map((o) => o.type)).toEqual(slot.codes);
      const sc = SCENARIOS.find((s) => s.id === q.scenario)!;
      if (set.calendar[month]) expect(sc.months).toContain(month);
    }
  });

  it("someone answering at random lands evenly: the paired-letter pushes cancel in every set", () => {
    // See scripts/curate-quiz.ts randomTilt: for each split of the four letters into two pairs, the
    // questions whose two opposite pairs agree on both halves must cancel, or random answers tilt.
    const sign = (code: string, k: number) => (code[k] === "BDMN"[k] ? 1 : -1);
    for (const { segment, month, qs } of allSets()) {
      for (const [k, l, m, n] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
        let sum = 0;
        for (const q of qs) {
          const [x, y] = q.options.map((o) => o.type).filter((c) => c[0] === "B");
          const c1 = (sign(x, k) * sign(x, l) + sign(y, k) * sign(y, l)) / 2;
          const c2 = (sign(x, m) * sign(x, n) + sign(y, m) * sign(y, n)) / 2;
          sum += c1 * c2;
        }
        expect(sum, `${segment} ${month} split ${k}${l}|${m}${n}`).toBe(0);
      }
    }
  });

  it("Q7's follow-ups: 4 more questions per segment, not in the set, together showing every opposite pair once", () => {
    for (const segment of SEGMENTS) {
      const fu = followUpQuestions({ segment });
      expect(fu).toHaveLength(4);
      const inSet = new Set(allSets().filter((x) => x.segment === segment).flatMap((x) => x.qs.map((q) => q.scenario)));
      for (const q of fu) expect(inSet.has(q.scenario), q.scenario).toBe(false);
      const pairs = fu.flatMap((q) => q.options.map((o) => o.type).filter((c) => c[0] === "B"));
      expect(new Set(pairs).size).toBe(8);
    }
  });

  it("public questions leak no type, district or flavour", () => {
    for (const { qs } of allSets()) {
      for (const q of qs) {
        const json = JSON.stringify(toPublic(q));
        expect(json).not.toMatch(/"type"|"district"|"flavour"|"kind"|"context"|"twin"|"motive"|"mood"/);
        for (const code of TYPE_CODES) expect(json).not.toContain(`"${code}"`);
      }
    }
  });

  it("every type is reachable in every set: a consistent person gets exactly their type", () => {
    for (const { segment, month, qs } of allSets()) {
      for (const code of ARCHETYPE_KEYS) {
        const r = scoreSession(qs, answersAs(qs, code));
        expect(typeOf(r.vector, r.affinity, r.unsure).archetype, `${segment} ${month} ${code}`).toBe(code);
      }
    }
  });
});

describe("scoring and the margin of error", () => {
  it("only option indices are valid answers", () => {
    const q = session("valid")[0];
    expect(itemScore(q, 0)).toBe(1);
    expect(itemScore(q, 3)).toBe(1);
    for (const bad of [4, -2, 1.5, NaN, "2", [1], null]) expect(itemScore(q, bad)).toBeNull();
  });

  it("someone answering consistently as a type gets exactly that type, at most one letter left for a follow-up", () => {
    // 16 questions of 4: their own type is shown in only 4, so even a consistent person gives a few
    // votes against a letter, and at 95% certainty (D28) one letter can stay open. That's when Q7 asks
    // a follow-up; the headline type is still theirs and always within the range shown.
    let allClear = 0;
    for (const code of ARCHETYPE_KEYS) {
      const qs = session(`clear-${code}`);
      const r = scoreSession(qs, answersAs(qs, code));
      expect(r.answered).toBe(QUIZ_LENGTH);
      const open = CODE_CATS.filter((c) => r.unsure.includes(c));
      expect(open.length, code).toBeLessThanOrEqual(1);
      if (open.length === 0) allClear += 1;
      expect(r.consistency).toBe(1);
      const t = typeOf(r.vector, r.affinity, r.unsure);
      expect(t.archetype).toBe(code);
      expect(t.range).toContain(code);
      expect(r.affinity[code]).toBe(1);
    }
    expect(allClear).toBeGreaterThanOrEqual(8);
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
    // Invalid everywhere: 101 is past any option index.
    const junk: unknown[] = [NaN, Infinity, -1, 1e9, [], "a", null, 101];
    const answers = Object.fromEntries(qs.map((q, i) => [q.id, junk[i % junk.length]])) as unknown as Answers;
    const r = scoreSession(qs, answers);
    expect(r.answered).toBe(0);
    for (const c of CATEGORIES) expect(r.vector[c]).toBe(0);
  });

  it("every scenario has an answer in each type's own voice", () => {
    for (const sc of SCENARIOS) for (const code of TYPE_CODES) expect(sc.answers[code as TypeCode]?.en, `${sc.id} ${code}`).toBeTruthy();
  });
});

describe("romance in the core quiz (owner, Q-D1)", () => {
  it("date moments read as friend meetups unless the member opted into Open to something more; same answers and types", async () => {
    const { generateSession, QUIZ_LENGTH } = await import("../src/vibe/generator");
    const { ROMANCE_EN, ROMANCE_TH, ROMANCE_ICONS } = await import("../src/vibe/bank-rules");
    // Date moments carry the wording switch; other scenarios may mention someone else's partner (a sibling's), which is fine.
    const words = (qs: ReturnType<typeof generateSession>) => qs.filter((q) => q.context === "date").flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)]);
    for (let i = 0; i < 40; i++) {
      for (const qs of [generateSession({ seed: `f${i}` }), generateSession({ seed: `f${i}`, personal: { district: "bang_rak", segment: "newcomer", tableHost: true } })]) {
        expect(qs).toHaveLength(QUIZ_LENGTH);
        expect(qs.filter((q) => q.context === "date").length).toBeGreaterThanOrEqual(2);
        for (const x of words(qs)) {
          expect(ROMANCE_EN.test(x.en), x.en).toBe(false);
          expect(ROMANCE_TH.test(x.th), x.th).toBe(false);
        }
        for (const q of qs.filter((x) => x.context === "date")) expect(ROMANCE_ICONS.test(q.art.icons.join("")), q.scenario).toBe(false);
      }
      // Opted in: each date moment's own wording, not the friend one.
      const dated = generateSession({ seed: `f${i}`, personal: { openToMore: true } }).filter((q) => q.context === "date");
      expect(dated.length).toBeGreaterThanOrEqual(1);
      for (const q of dated) expect(q.prompt).toEqual(SCENARIOS.find((s) => s.id === q.scenario)!.prompt);
    }
  });
});
