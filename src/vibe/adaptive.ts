/**
 * Adaptive follow-ups for the curated Bangkok Type quiz (Q7; owner D26, D29, D30).
 *
 * Everyone answers the same 16 curated questions. Only when a letter is
 * genuinely close (near a 50/50 split, see CLOSE) does the quiz ask more:
 * one curated follow-up per two unsure letters, at most 2, so a quiz never
 * goes past 18 questions and most people get none. Follow-ups come from the
 * member's own curated set (followUpQuestions), in a fixed order, so the same
 * answers always get the same follow-ups. Letters still unsure after that
 * show as an honest range on the result.
 */
import { typeOf } from "./archetypes";
import type { Category } from "./content";
import { scoreSession, type Answers, type Question } from "./generator";
import { oppositeCode, type TypeCode } from "./scenarios";

/** At most this many follow-ups (owner, 10-15): 16 + 2 = 18 questions at most. */
export const MAX_FOLLOW_UPS = 2;

const CODE: Category[] = ["energy", "explore", "motion", "culture"];
/**
 * A letter is genuinely close when its lean is under this (−1..+1): about a
 * 60/40 split or nearer (owner, 10-15). Only close letters get a follow-up
 * and show as "not sure yet" or a range. Q5's 95% margin still decides
 * whether a letter can be claimed, but with 16 questions almost everyone
 * (98.6% in simulation) has a letter inside it, so the margin alone would
 * make nearly everyone look undecided and nearly everyone get follow-ups.
 */
export const CLOSE = 0.2;
export const closeLetter = (lean: number) => Math.abs(lean) < CLOSE;
const flip = (code: string, i: number): string => code.slice(0, i) + oppositeCode(code as TypeCode)[i] + code.slice(i + 1);

/** The code letters that are genuinely close: inside the 95% margin and near an even split. */
export function closeLetters(vector: Record<string, number>, unsure: readonly string[]): Category[] {
  return CODE.filter((c) => unsure.includes(c) && closeLetter(vector[c] ?? 0));
}

/**
 * Which follow-ups to ask (indices into `followUps`), or [] when no letter is
 * close. One per two close letters, at most MAX_FOLLOW_UPS. Each
 * follow-up shows two opposite pairs, so any of them votes on every letter;
 * the ones chosen are those that put the person's likely types side by side
 * with their mirror across an unsure letter. Ties keep the curated order.
 */
export function followUpPlan(questions: Question[], answers: Answers, followUps: Question[]): number[] {
  const result = scoreSession(questions, answers);
  const unsure = CODE.map((c, i) => ({ c, i })).filter((x) => closeLetter(result.vector[x.c] ?? 0));
  if (unsure.length === 0 || followUps.length === 0) return [];
  const n = Math.min(MAX_FOLLOW_UPS, Math.ceil(unsure.length / 2), followUps.length);
  const { range, blend } = typeOf(result.vector, result.affinity, result.unsure);
  const likely = new Set<string>([...range, ...blend.map((b) => b.key)]);
  const asked = new Set(questions.map((q) => q.scenario));
  const score = (q: Question): number => {
    const types = new Set<string>(q.options.map((o) => o.type));
    let s = 0;
    for (const t of types) if (likely.has(t)) s += 1;
    for (const { i } of unsure) for (const t of types) if (likely.has(t) && types.has(flip(t, i))) s += 3;
    return s;
  };
  return followUps
    .map((q, k) => ({ k, s: asked.has(q.scenario) ? -1 : score(q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.k - b.k)
    .slice(0, n)
    .map((x) => x.k)
    .sort((a, b) => a - b);
}
