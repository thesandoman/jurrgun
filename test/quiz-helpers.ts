/**
 * Answer helpers for Bangkok Type quiz tests. Each returns the answer in the
 * question's own format: an option index, a slider position (0..100) or a
 * rank list (favourite first).
 */
import { RANK_PICKS, type Answer, type Answers, type Question } from "../src/vibe/generator";
import type { TypeCode } from "../src/vibe/scenarios";

const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;

/** Slider: all the way to the end whose letter matches the person's. */
function sliderAs(q: Question, code: TypeCode): number {
  return q.options[1].type[q.letter!] === code[q.letter!] ? 100 : 0;
}

/** Rank: `first` (the person's pick) on top, then the closest types; ties by `cost` (letters given up so far), then option order. */
function rankAs(q: Question, code: TypeCode, first?: number, cost: (t: string) => number = () => 0): number[] {
  const order = q.options
    .map((_, j) => j)
    .sort((a, b) => (b === first ? 1 : 0) - (a === first ? 1 : 0) || shared(q.options[b].type, code) - shared(q.options[a].type, code) || cost(q.options[a].type) - cost(q.options[b].type) || a - b);
  return order.slice(0, RANK_PICKS);
}

/**
 * The answer a person of type `code` gives: their own type if offered, else
 * the closest. Ties go a different way per question, like a real person
 * whose second choice depends on the moment.
 */
export function answerAs(q: Question, code: TypeCode): Answer {
  if (q.format === "slider") return sliderAs(q, code);
  const top = Math.max(...q.options.map((o) => shared(o.type, code)));
  const ties = q.options.map((o, j) => j).filter((j) => shared(q.options[j].type, code) === top);
  let h = 0;
  // Same six types, same choice: a consistent person answers twin questions alike.
  for (const ch of q.options.map((o) => o.type).sort().join("")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = ties[h % ties.length];
  return q.format === "rank" ? rankAs(q, code, pick) : pick;
}

/**
 * A whole quiz answered by a consistent person of type `code`: their own type
 * when offered; otherwise the closest answer, giving up a different letter
 * each time rather than always the same one, and the same answer to the same
 * six types (twin questions). Sliders go all the way to their own letter;
 * rank puts that same pick first, then the next closest.
 */
export function answersAs(qs: Question[], code: TypeCode): Answers {
  const given = [0, 0, 0, 0];
  const memo = new Map<string, TypeCode>();
  const out: Answers = {};
  for (const q of qs) {
    if (q.format === "slider") {
      out[q.id] = sliderAs(q, code);
      continue;
    }
    const key = q.options.map((o) => o.type).sort().join("");
    const top = Math.max(...q.options.map((o) => shared(o.type, code)));
    const ties = q.options.filter((o) => shared(o.type, code) === top);
    const cost = (t: string) => [0, 1, 2, 3].reduce((sum, i) => sum + (t[i] === code[i] ? 0 : given[i] + 1), 0);
    const pick = memo.get(key) ?? ties.sort((a, b) => cost(a.type) - cost(b.type))[0].type;
    memo.set(key, pick);
    for (let i = 0; i < 4; i++) if (pick[i] !== code[i]) given[i] += 1;
    const j = q.options.findIndex((o) => o.type === pick);
    out[q.id] = q.format === "rank" ? rankAs(q, code, j, cost) : j;
  }
  return out;
}

/** The form fields a browser posts for an answer: a{i}, with rank as "j,j,j". */
export function formValue(answer: Answer): string {
  return Array.isArray(answer) ? answer.join(",") : String(answer);
}
