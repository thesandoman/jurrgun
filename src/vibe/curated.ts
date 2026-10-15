/**
 * The curated Bangkok Type quiz (design/reference/quiz-curated.md, owner D26).
 *
 * Everyone in a segment gets the same 16 questions in the same order, so a
 * retake shows real change, not a different draw. The sets themselves are
 * data (curated-sets.ts, built by scripts/curate-quiz.ts and read by a
 * person). Each question shows two opposite pairs of types (X, its opposite,
 * Y, its opposite), so a pick votes on all four letters, and every type is
 * shown exactly 4 times.
 *
 * Per member, only the wording changes (generator.ts wordingFor): the friend
 * or 💘 wording of a date moment, the segment's prompt, plain English. The
 * one seasonal slot takes its scenario from the month but keeps its answers'
 * types, so it measures the same thing all year.
 */
import type { Segment } from "../domain/segment";
import type { TypeCode } from "./scenarios";

/** One question: a scenario and its 4 answers by type, in display order (two opposite pairs). */
export type CuratedEntry = { scenario: string; codes: TypeCode[]; twin?: string };

export type CuratedSet = {
  entries: CuratedEntry[];
  /** Index of the seasonal slot in `entries`. */
  season: number;
  /** Month (1 to 12) → scenario for the seasonal slot; months not listed keep the entry's own scenario. */
  calendar: Record<number, string>;
  /** For Q7: curated follow-up questions, asked only when a result is unsure; together they show every opposite pair once. */
  followUps: CuratedEntry[];
};

export type CuratedSets = Record<Segment, CuratedSet>;

/** Members with no Bangkok story yet (anonymous, onboarding before basics) get the local set. */
export const DEFAULT_SEGMENT: Segment = "local";

/** The set's entries for a month: the seasonal slot's scenario follows the calendar. */
export function entriesFor(set: CuratedSet, month?: number): CuratedEntry[] {
  const seasonal = month ? set.calendar[month] : undefined;
  if (!seasonal) return set.entries;
  return set.entries.map((e, k) => (k === set.season ? { ...e, scenario: seasonal } : e));
}
