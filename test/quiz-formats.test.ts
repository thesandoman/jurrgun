/**
 * The Bangkok Type quiz's interactive formats: the format mix per session, the
 * opposite-pair balance of each format, how each format scores, the form
 * parsing, and that the browser never learns a type.
 */
import { describe, expect, it } from "vitest";
import {
  FORMATS,
  NON_CHOICE_MAX,
  QUIZ_LENGTH,
  RANK_PICKS,
  SLIDER_SESSIONS,
  THIS_OR_THAT_WEIGHT,
  SLIDER_MARGIN,
  generateSession,
  itemScore,
  scoreSession,
  sliderLean,
  toPublic,
  votesFor,
  type Answer,
  type Format,
  type Question,
} from "../src/vibe/generator";
import { LETTERS, TYPE_CODES, oppositeCode, type TypeCode } from "../src/vibe/scenarios";
import { typeOf, ARCHETYPE_KEYS } from "../src/vibe/archetypes";
import { parseAnswers } from "../src/routes/quiz";
import { answersAs, formValue } from "./quiz-helpers";

const CODE_CATS = ["energy", "explore", "motion", "culture"] as const;
const sessions = (n: number, tag: string) => Array.from({ length: n }, (_, i) => generateSession({ seed: `${tag}${i}` }));
/** The first question of a format across a few sessions. */
function first(format: Format, tag = "fmt"): Question {
  for (let i = 0; i < 50; i++) {
    const q = generateSession({ seed: `${tag}${i}` }).find((x) => x.format === format);
    if (q) return q;
  }
  throw new Error(`no ${format} question`);
}
/** The four letter scores of one answer to one question (0 for a letter it doesn't touch). */
const letters = (q: Question, a: Answer) => {
  const r = scoreSession([q], { [q.id]: a });
  return CODE_CATS.map((c) => r.vector[c]);
};
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));
const poles = (code: string) => code.split("").map((ch) => LETTERS[ch].pole);
const mirrorIndex = (q: Question, j: number) => q.options.findIndex((o) => o.type === oppositeCode(q.options[j].type));

describe("the format mix", () => {
  it("7 or 8 interactive questions per session (at most 40%), every format but the slider in every session", () => {
    let withSliders = 0;
    const all = sessions(800, "mix");
    for (const qs of all) {
      const others = qs.filter((q) => q.format !== "choice");
      expect(others.length).toBeGreaterThanOrEqual(7);
      expect(others.length).toBeLessThanOrEqual(NON_CHOICE_MAX);
      expect(others.length / QUIZ_LENGTH).toBeLessThanOrEqual(0.4);
      for (const f of FORMATS) if (f !== "slider") expect(qs.some((q) => q.format === f), f).toBe(true);
      expect([0, 2]).toContain(qs.filter((q) => q.format === "slider").length);
      expect(qs.filter((q) => q.format === "rank")).toHaveLength(1);
      if (qs.some((q) => q.format === "slider")) withSliders += 1;
    }
    // A slider measures one letter instead of four, so only some sessions get the pair.
    expect(withSliders / all.length).toBeGreaterThan(SLIDER_SESSIONS - 0.07);
    expect(withSliders / all.length).toBeLessThan(SLIDER_SESSIONS + 0.07);
  });

  it("the first question is a plain pick-one, and twin questions always are", () => {
    for (const qs of sessions(400, "tw")) {
      expect(qs[0].format).toBe("choice");
      for (const q of qs) if (q.twin && qs.some((x) => x.scenario === q.twin)) expect(q.format).toBe("choice");
    }
  });

  it("sliders and rank are only on core questions, so flavours always come from whole picks", () => {
    for (const qs of sessions(400, "core")) for (const q of qs) if (q.format === "slider" || q.format === "rank") expect(q.kind).toBe("core");
  });

  it("a session's format mix depends on its seed, and is the same every time", () => {
    const mix = (s: string) => generateSession({ seed: s }).map((q) => q.format).join(",");
    expect(mix("same")).toBe(mix("same"));
    expect(new Set(Array.from({ length: 30 }, (_, i) => mix(`m${i}`))).size).toBeGreaterThan(20);
  });
});

describe("opposite-pair balance per format", () => {
  it("this-or-that shows one opposite pair: every letter one each side", () => {
    for (const qs of sessions(200, "tot")) {
      for (const q of qs.filter((x) => x.format === "this-or-that")) {
        expect(q.options).toHaveLength(2);
        expect(q.options[1].type).toBe(oppositeCode(q.options[0].type));
      }
    }
  });

  it("a slider's two ends differ in exactly its one letter, and the two sliders mirror each other", () => {
    for (const qs of sessions(300, "sl")) {
      const [a, b] = qs.filter((q) => q.format === "slider");
      if (!a) continue;
      for (const q of [a, b]) {
        const [x, y] = q.options.map((o) => o.type);
        const diff = [0, 1, 2, 3].filter((k) => x[k] !== y[k]);
        expect(diff).toEqual([q.letter]);
      }
      expect(a.letter).toBe(b.letter);
      // Together they show two whole opposite pairs: every letter 2 and 2.
      const codes = [...a.options, ...b.options].map((o) => o.type);
      for (const c of codes) expect(codes).toContain(oppositeCode(c));
      for (let k = 0; k < 4; k++) expect(codes.filter((c) => LETTERS[c[k]].pole === 1)).toHaveLength(2);
    }
  });

  it("across a whole session every letter is offered equally on both sides", () => {
    for (const qs of sessions(300, "side")) {
      const plus = [0, 0, 0, 0];
      const total = [0, 0, 0, 0];
      for (const q of qs) for (const o of q.options) poles(o.type).forEach((p, k) => ((total[k] += 1), (plus[k] += p === 1 ? 1 : 0)));
      for (let k = 0; k < 4; k++) expect(plus[k] * 2).toBe(total[k]);
    }
  });
});

describe("scoring, format by format", () => {
  it("choice, map, photo and sentence: one pick moves all four letters by a full vote", () => {
    for (const f of ["choice", "map", "photo", "sentence"] as const) {
      const q = first(f);
      for (let j = 0; j < q.options.length; j++) close(letters(q, j), poles(q.options[j].type));
      for (const bad of [6, -1, 1.5, "2", [1], null]) expect(itemScore(q, bad), `${f} ${String(bad)}`).toBeNull();
    }
  });

  it("this-or-that: either side moves all four letters, at 0.75 weight; only 0 and 1 are answers", () => {
    const q = first("this-or-that");
    close(letters(q, 0), poles(q.options[0].type));
    close(letters(q, 1), poles(q.options[1].type));
    close(letters(q, 0), letters(q, 1).map((x) => -x));
    for (const bad of [2, 5, -1, [0]]) expect(itemScore(q, bad)).toBeNull();
    // The weight shows next to a full pick-one vote: a pick-one plus a this-or-that against it leans to the pick-one.
    const against = oppositeCode(q.options[0].type);
    const c = sessions(50, "against").flat().find((x) => x.format === "choice" && x.options.some((o) => o.type === against))!;
    const r = scoreSession([c, q], { [c.id]: c.options.findIndex((o) => o.type === against), [q.id]: 0 });
    expect(THIS_OR_THAT_WEIGHT).toBe(0.75);
    for (const cat of CODE_CATS) expect(Math.abs(r.vector[cat])).toBeCloseTo(0.25 / 1.75, 9);
  });

  it("slider: scores only its one letter, by position, with a dead zone in the middle", () => {
    const q = first("slider");
    const k = q.letter!;
    const end0 = LETTERS[q.options[0].type[k]].pole;
    const only = (v: number) => CODE_CATS.map((_, i) => (i === k ? v : 0));
    close(letters(q, 0), only(end0));
    close(letters(q, 100), only(-end0));
    // Inside the margin: both equally, but it still counts as an answer.
    for (const v of [50 - SLIDER_MARGIN, 45, 50, 55, 50 + SLIDER_MARGIN]) {
      close(letters(q, v), only(0));
      expect(scoreSession([q], { [q.id]: v }).answered).toBe(1);
    }
    // Halfway between the margin and the full end: half a vote.
    close(letters(q, 75), only(-end0 * 0.5));
    close(letters(q, 25), only(end0 * 0.5));
    expect(sliderLean(95)).toBe(1);
    expect(sliderLean(5)).toBe(-1);
    for (const bad of [-1, 101, 2.5, "50", [50], null]) expect(itemScore(q, bad)).toBeNull();
  });

  it("slider: the type votes follow the position", () => {
    const q = first("slider");
    const [x, y] = q.options.map((o) => o.type);
    expect(scoreSession([q], { [q.id]: 0 }).affinity).toEqual({ [x]: 1, [y]: 0 });
    expect(scoreSession([q], { [q.id]: 50 }).affinity).toEqual({ [x]: 0.5, [y]: 0.5 });
  });

  it("rank: first and second choice of four, weighted 1 and 0.5 for the letters and the type votes", () => {
    const q = first("rank");
    expect(q.options).toHaveLength(4);
    const pick = [3, 0];
    const want = [0, 1, 2, 3].map((k) => (poles(q.options[3].type)[k] + 0.5 * poles(q.options[0].type)[k]) / 1.5);
    close(letters(q, pick), want);
    const aff = scoreSession([q], { [q.id]: pick }).affinity;
    expect(aff[q.options[3].type]).toBe(1);
    expect(aff[q.options[0].type]).toBe(0.5);
    expect(aff[q.options[1].type]).toBe(0);
    expect(votesFor(q, pick)!.map((v) => v.share)).toEqual([1, 0.5]);
    for (const bad of [[0], [0, 1, 2], [0, 0], [0, 4], [0, -1], [0, 1.5], 0, "0,1", null]) expect(itemScore(q, bad), JSON.stringify(bad)).toBeNull();
    expect(RANK_PICKS).toBe(2);
  });

  it("every format is symmetric: the mirror answer scores the exact opposite", () => {
    for (const f of FORMATS) {
      const q = first(f, "sym");
      if (f === "slider") {
        for (const v of [0, 20, 35, 50, 70, 100]) close(letters(q, v), letters(q, 100 - v).map((x) => -x));
      } else if (f === "rank") {
        const pick = [1, 3];
        close(letters(q, pick), letters(q, pick.map((j) => mirrorIndex(q, j))).map((x) => -x));
      } else {
        for (let j = 0; j < q.options.length; j++) close(letters(q, j), letters(q, mirrorIndex(q, j)).map((x) => -x));
      }
    }
  });

  it("no format favours a side: averaged over every possible answer, each letter scores 0", () => {
    const perms = (n: number) => {
      const out: number[][] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) out.push([a, b]);
      return out;
    };
    for (const f of FORMATS) {
      const q = first(f, "avg");
      const all: Answer[] = f === "slider" ? Array.from({ length: 101 }, (_, v) => v) : f === "rank" ? perms(q.options.length) : q.options.map((_, j) => j);
      const sum = [0, 0, 0, 0];
      for (const a of all) letters(q, a).forEach((x, k) => (sum[k] += x));
      close(sum, [0, 0, 0, 0]);
    }
  });

  it("a consistent person still gets exactly their type in sessions with every format; a letter is rarely left unsure", () => {
    // A this-or-that offers only X and its opposite, so someone who is neither
    // must give up a letter or two, and a slider measures one letter, not four.
    // The margin of error reports that honestly: a few sessions show a range
    // of two types, but the top type is always right.
    let unsure = 0;
    let total = 0;
    for (const code of ARCHETYPE_KEYS) {
      for (let i = 0; i < 60; i++) {
        const qs = generateSession({ seed: `every-${code}-${i}` });
        const r = scoreSession(qs, answersAs(qs, code as TypeCode));
        expect(r.answered).toBe(QUIZ_LENGTH);
        const t = typeOf(r.vector, r.affinity, r.unsure);
        expect(t.archetype, `${code} ${i}`).toBe(code);
        expect(t.range).toContain(code);
        total += 1;
        if (CODE_CATS.some((c) => r.unsure.includes(c))) unsure += 1;
      }
    }
    expect(unsure / total).toBeLessThan(0.03);
  });

  it("the opposite person gets the opposite letters on the same quiz", () => {
    const qs = generateSession({ seed: "opposite" });
    const a = scoreSession(qs, answersAs(qs, "BDSH"));
    const b = scoreSession(qs, answersAs(qs, "CFMN"));
    for (const c of CODE_CATS) expect(Math.sign(a.vector[c])).toBe(-Math.sign(b.vector[c]));
  });
});

describe("format extras", () => {
  it("map: six pins inside the map, spread out enough to tap", () => {
    for (const qs of sessions(200, "map")) {
      for (const q of qs.filter((x) => x.format === "map")) {
        expect(q.pins).toHaveLength(6);
        for (const p of q.pins!) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(100);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(100);
        }
        for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) expect(Math.hypot(q.pins![a].x - q.pins![b].x, q.pins![a].y - q.pins![b].y)).toBeGreaterThan(5);
      }
    }
  });

  it("photo: a postcard per answer, captioned with its area; sentence: a stem", () => {
    const p = toPublic(first("photo"));
    expect(p.photos).toHaveLength(6);
    for (const a of p.photos!) expect(a.caption?.en).toBeTruthy();
    const s = toPublic(first("sentence"));
    expect(s.stem?.en).toBeTruthy();
    expect(s.stem?.th).toBeTruthy();
    expect(s.stem!.th).not.toMatch(/[–—]|ครับ|ค่ะ/);
  });

  it("the browser never learns a type, a district key or a slider's letter, in any format", () => {
    for (const qs of sessions(60, "pub")) {
      for (const q of qs) {
        const json = JSON.stringify(toPublic(q));
        expect(json).not.toMatch(/"type"|"district"|"flavour"|"kind"|"context"|"twin"|"letter"|"scenario"/);
        for (const code of TYPE_CODES) expect(json).not.toContain(code);
      }
    }
  });
});

describe("form answers per format", () => {
  // A session with every format, sliders included.
  const qs = Array.from({ length: 50 }, (_, i) => generateSession({ seed: `form${i}` })).find((x) => FORMATS.every((f) => x.some((q) => q.format === f)))!;
  const at = (f: Format) => qs.findIndex((q) => q.format === f);

  it("every format's answer posts and parses back to itself", () => {
    const picks = answersAs(qs, "CDSN");
    const body = Object.fromEntries(qs.map((q, i) => [`a${i}`, formValue(picks[q.id])]));
    const { answers, invalid } = parseAnswers(body, qs);
    expect(invalid).toEqual([]);
    expect(answers).toEqual(picks);
  });

  it("rank without JavaScript: 1 and 2 in the per-answer selects", () => {
    const i = at("rank");
    const q = qs[i];
    expect(parseAnswers({ [`a${i}`]: "", [`a${i}_2`]: "1", [`a${i}_3`]: "2" }, qs).answers[q.id]).toEqual([2, 3]);
    // Only one numbered, a duplicate, or a 3: needs another look.
    for (const bad of [{ [`a${i}_2`]: "1" }, { [`a${i}_2`]: "1", [`a${i}_3`]: "1" }, { [`a${i}_2`]: "3" }]) {
      expect(parseAnswers(bad, qs).invalid).toEqual([i]);
    }
    // Nothing numbered: skipped.
    expect(parseAnswers({ [`a${i}`]: "", [`a${i}_0`]: "" }, qs).invalid).toEqual([]);
  });

  it("slider: 0 to 100; this-or-that: 0 or 1", () => {
    const s = at("slider");
    expect(parseAnswers({ [`a${s}`]: "65" }, qs).answers[qs[s].id]).toBe(65);
    expect(parseAnswers({ [`a${s}`]: "101" }, qs).invalid).toEqual([s]);
    const t = at("this-or-that");
    expect(parseAnswers({ [`a${t}`]: "2" }, qs).invalid).toEqual([t]);
  });
});
