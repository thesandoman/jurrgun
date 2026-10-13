/**
 * Answer helpers for Bangkok Type quiz tests.
 */
import type { Answers, Question } from "../src/vibe/generator";
import type { TypeCode } from "../src/vibe/scenarios";

const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;

/**
 * The option a person of type `code` picks: their own type if offered, else
 * the closest. Ties go a different way per question, like a real person
 * whose second choice depends on the moment.
 */
export function answerAs(q: Question, code: TypeCode): number {
  const top = Math.max(...q.options.map((o) => shared(o.type, code)));
  const ties = q.options.map((o, j) => j).filter((j) => shared(q.options[j].type, code) === top);
  let h = 0;
  // Same six types, same choice: a consistent person answers twin questions alike.
  for (const ch of q.options.map((o) => o.type).sort().join("")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ties[h % ties.length];
}

/**
 * A whole quiz answered by a consistent person of type `code`: their own type
 * when offered; otherwise the closest answer, giving up a different letter
 * each time rather than always the same one, and the same answer to the same
 * six types (twin questions).
 */
export function answersAs(qs: Question[], code: TypeCode): Answers {
  const given = [0, 0, 0, 0];
  const memo = new Map<string, TypeCode>();
  const out: Answers = {};
  for (const q of qs) {
    const key = q.options.map((o) => o.type).sort().join("");
    const top = Math.max(...q.options.map((o) => shared(o.type, code)));
    const ties = q.options.filter((o) => shared(o.type, code) === top);
    const cost = (t: string) => [0, 1, 2, 3].reduce((sum, i) => sum + (t[i] === code[i] ? 0 : given[i] + 1), 0);
    const pick = memo.get(key) ?? ties.sort((a, b) => cost(a.type) - cost(b.type))[0].type;
    memo.set(key, pick);
    for (let i = 0; i < 4; i++) if (pick[i] !== code[i]) given[i] += 1;
    out[q.id] = q.options.findIndex((o) => o.type === pick);
  }
  return out;
}
