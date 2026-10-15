/**
 * The Bangkok Type quiz: 16 hand-written scenario questions, the same for
 * everyone in a segment (owner, D26; design/reference/quiz-curated.md).
 *
 * Nothing here writes a question. Every scenario and every answer is
 * hand-written in src/vibe/bank/ (one answer per Bangkok Type), and which
 * questions a segment gets, with which four answers and in what order, is
 * data in curated-sets.ts (built by scripts/curate-quiz.ts, read by a
 * person). Nothing is drawn at random, so a retake shows real change.
 *
 * A set:
 *   - 12 core + 2 rhythm + 2 plan questions;
 *   - each question shows two opposite pairs of types (X, its opposite, Y,
 *     its opposite), so every letter has two answers on each side and a pick
 *     votes on all four letters; every type is shown exactly 4 times;
 *   - 2 "twin" pairs (the same idea in other words), at least 8 apart, to
 *     check consistency;
 *   - one seasonal slot: the month picks its scenario, its answers' types stay.
 *
 * Who the member is (Personal) shapes the session without changing how types
 * are scored:
 *   - romance wording (owner, Q-D1): date moments are in everyone's quiz, but
 *     only members who opted into 💘 Open to something more read them as
 *     dates; everyone else reads the same moment as a one-to-one friend
 *     meetup (Scenario.friend), with the same answers and types;
 *   - segment: which curated set (local, newcomer, international); a set only
 *     holds scenarios its members are offered (`offered`: set and audience);
 *   - style sets (styles.ts, generateStyleQuestions): 4 "how you date"
 *     questions for opted-in members and 2 "how you host" questions for Table
 *     Hosts, after the 16. They are their own question type with no type
 *     codes, and scoreSession only takes the 16, so they never move the type;
 *   - segment flavour: local, newcomer or international members see some
 *     prompts told through their own Bangkok story (bank/segment-prompts.ts),
 *     with the same answers;
 *   - language flavour (Task 10, bank/plain-english.ts): members who don't
 *     speak Thai get local words explained and a few expat moments, in the
 *     English only. It never changes which questions or answers appear, and
 *     it stays out of the seed, so switching language mid-quiz is safe.
 *
 * Scoring allows for a margin of error: people are subjective, so a letter
 * only counts as clear when it is clear beyond the margin (see scoreSession).
 */

import { CATEGORIES, MOTIVES, motivePlace, POLES, type Category, type Motive, type Pole, type Text } from "./content";
import type { Segment } from "../domain/segment";
import { SEGMENT_PROMPTS } from "./bank/segment-prompts";
import { EXPAT_PROMPTS, explainLocal } from "./bank/plain-english";
import { hashString } from "./rng";
import { codePoles, SCENARIOS, type Context, type Kind, type Scenario, type ScenarioSet, type TypeCode } from "./scenarios";
import { STYLE_DIMENSIONS, STYLE_SCENARIOS, type StyleCard, type StyleScenario, type StyleSet } from "./styles";
import { DEFAULT_SEGMENT, entriesFor, type CuratedEntry } from "./curated";
import { CURATED_SETS } from "./curated-sets";
import type { Art } from "./visuals";

export const QUIZ_LENGTH = 16;
export const OPTIONS_PER_QUESTION = 4;
/** Style questions after the 16: one per "how you date" dimension, two "how you host". */
export const DATE_STYLE_ITEMS = Object.keys(STYLE_DIMENSIONS["open-to-more"]).length;
export const HOST_STYLE_ITEMS = 2;

/** The least of each context in one session's 16 core questions. */
export const CONTEXT_MIN: Record<Context, number> = { friends: 2, family: 3, date: 3, solo: 1, coworkers: 1, party: 2, meetup: 2 };

export type Option = { label: Text; icon: string; type: TypeCode; district: string; flavour?: Pole; motive?: Motive };

export type Question = {
  id: string;
  /** Every question is a plain pick-one (owner, D26). */
  format: "choice";
  scenario: string;
  kind: Kind;
  context: Context;
  twin?: string;
  prompt: Text;
  options: Option[];
  art: Art;
};

/** A style question (styles.ts): its answers fill a style card and carry no type code. */
export type StyleOption = { label: Text; icon: string; style: string };
export type StyleQuestion = {
  id: string;
  format: "choice";
  scenario: string;
  kind: "style";
  set: StyleSet;
  dimension: string;
  prompt: Text;
  options: StyleOption[];
  art: Art;
};

/** Everything the quiz form shows: the 16 type questions, then any style questions. */
export type AnyQuestion = Question | StyleQuestion;
export const isStyleQuestion = (q: AnyQuestion): q is StyleQuestion => q.kind === "style";
/** The type questions only, for scoreSession. */
export const typeQuestions = (qs: AnyQuestion[]): Question[] => qs.filter((q): q is Question => !isStyleQuestion(q));


/** What the browser gets: no type, no district, nothing to game. */
export type PublicQuestion = { id: string; format: "choice"; prompt: Text; options: Text[]; icons: string[]; art: Art };

/** Who the member is: which set, which wording, which style questions (see the top of this file). */
export type Personal = {
  district?: string | null;
  interests?: readonly string[] | null;
  /** local / newcomer / international (src/domain/segment.ts). */
  segment?: Segment | null;
  /** Opted into 💘 Open to something more (romanceEligible): date scenarios and the "how you date" set. */
  openToMore?: boolean;
  /** Hosts a Regular Table: the "how you host" set. */
  tableHost?: boolean;
  /** Doesn't speak Thai, or here from abroad: plain-English wording (bank/plain-english.ts). Wording only, never in the seed. */
  explainLocal?: boolean;
};

export type SessionOptions = {
  seed: string;
  /** Kept for callers; a retake repeats the same questions on purpose (D26). */
  seen?: ReadonlySet<string>;
  personal?: Personal;
  /** 1 to 12, the month in Bangkok: picks the seasonal slot's scenario. The quiz seed carries it. */
  month?: number;
};

const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

// ------------------------------------------------------------ the set --

/** Whether this member is offered the scenario: its set (if any) is one of theirs, and so is its audience. */
export function offered(s: Pick<Scenario, "set" | "audience" | "context" | "friend">, p: Personal | undefined): boolean {
  const sets: ScenarioSet[] = [...(p?.openToMore ? (["open-to-more"] as const) : []), ...(p?.tableHost ? (["table-host"] as const) : [])];
  if (s.set && !sets.includes(s.set)) return false;
  // A date moment reaches someone not open to something more only through its friend wording (bank-rules also checks).
  if (s.context === "date" && !p?.openToMore && !s.friend) return false;
  return !s.audience || (!!p?.segment && s.audience.includes(p.segment));
}

/** The words a member reads for a scenario: a date moment reads as a friend meetup unless they're open to something more. */
function wordingFor(sc: Scenario, p?: Personal): { prompt: Text; icon: string; answer: (code: TypeCode) => Text } {
  const friend = sc.friend && !p?.openToMore ? sc.friend : undefined;
  return {
    prompt: friend?.prompt ?? ((p?.segment && SEGMENT_PROMPTS[sc.id]?.[p.segment]) || sc.prompt),
    icon: friend?.icon ?? sc.icon,
    answer: (code) => friend?.answers?.[code] ?? sc.answers[code],
  };
}

/** One curated question: the entry's 4 answers (two opposite pairs) in its order. */
function buildQuestion(e: CuratedEntry, p?: Personal): Question {
  const sc = SCENARIO_BY_ID.get(e.scenario);
  if (!sc) throw new Error(`curated scenario ${e.scenario} is not in the bank`);
  const en = (x: string) => (p?.explainLocal ? explainLocal(x) : x);
  const words = wordingFor(sc, p);
  const options: Option[] = e.codes.map((code) => {
    const a = sc.answers[code];
    const label = words.answer(code);
    return { label: { en: en(label.en), th: label.th }, icon: a.icon, type: code, district: a.district, ...(a.flavour ? { flavour: a.flavour } : {}), ...(a.motive ? { motive: a.motive } : {}) };
  });
  return {
    id: `${sc.id}.${hashString(e.codes.join("")).toString(36)}`,
    format: "choice",
    scenario: sc.id,
    kind: sc.kind,
    context: sc.context,
    ...(e.twin ? { twin: e.twin } : {}),
    prompt: { en: (p?.explainLocal && EXPAT_PROMPTS[sc.id]) || en(words.prompt.en), th: words.prompt.th },
    options,
    art: { tone: sc.tone, icons: [words.icon], seed: hashString(sc.id + e.codes.join("")) },
  };
}

/** A style question, its answers in the bank's order (the same for everyone). */
function buildStyleQuestion(sc: StyleScenario, p?: Personal): StyleQuestion {
  const answers = sc.answers;
  const en = (x: string) => (p?.explainLocal ? explainLocal(x) : x);
  return {
    id: `${sc.id}.${hashString(answers.map((a) => a.value).join("")).toString(36)}`,
    format: "choice",
    scenario: sc.id,
    kind: "style",
    set: sc.set,
    dimension: sc.dimension,
    prompt: { en: en(sc.prompt.en), th: sc.prompt.th },
    options: answers.map((a) => ({ label: { en: en(a.en), th: a.th }, icon: a.icon, style: a.value })),
    art: { tone: sc.tone, icons: [sc.icon], seed: hashString(sc.id + answers.map((a) => a.value).join("")) },
  };
}

/**
 * The member's questions: their segment's curated set (local for anyone with
 * no Bangkok story yet), in its fixed order, with the month's seasonal
 * scenario. Only the wording depends on the member. The seed only proves the
 * form is current; it doesn't change the questions.
 */
export function generateSession(options: SessionOptions): Question[] {
  const p = options.personal;
  const set = CURATED_SETS[p?.segment ?? DEFAULT_SEGMENT];
  return entriesFor(set, options.month).map((e) => buildQuestion(e, p));
}

/** For Q7: the curated follow-up questions for this member's set, in order; ask 1 or 2 only when a result is unsure. */
export function followUpQuestions(personal?: Personal): Question[] {
  const set = CURATED_SETS[personal?.segment ?? DEFAULT_SEGMENT];
  return set.followUps.map((e) => buildQuestion(e, personal));
}

/** The fixed style questions: one per "how you date" dimension, and two "how you host". */
export const STYLE_FIXED: Record<StyleSet, string[]> = {
  "open-to-more": ["ds-place-saturday", "ds-pace-met", "ds-ease-safe", "ds-ask-best"],
  "table-host": ["hs-welcome-first", "hs-include-quiet"],
};

/**
 * The style questions for this member, after the 16: "how you date" only when
 * opted into Open to something more, "how you host" only for Table Hosts. The
 * same ones every time, like the rest of the quiz.
 */
export function generateStyleQuestions(options: SessionOptions): StyleQuestion[] {
  const p = options.personal;
  const ids = [...(p?.openToMore ? STYLE_FIXED["open-to-more"] : []), ...(p?.tableHost ? STYLE_FIXED["table-host"] : [])];
  return ids.map((id) => buildStyleQuestion(STYLE_SCENARIOS.find((s) => s.id === id)!, p));
}

/** The style card a session's answers give for one set: dimension → picked value. */
export function styleOf(questions: AnyQuestion[], answers: Answers, set: StyleSet): StyleCard {
  const out: StyleCard = {};
  for (const q of questions) {
    if (!isStyleQuestion(q) || q.set !== set) continue;
    const o = pickedOption(q, answers[q.id]);
    if (o) out[q.dimension] = o.style;
  }
  return out;
}

export function toPublic(q: AnyQuestion): PublicQuestion {
  return { id: q.id, format: "choice", prompt: q.prompt, options: q.options.map((o) => ({ en: o.label.en, th: o.label.th })), icons: q.options.map((o) => o.icon), art: q.art };
}

// ---------------------------------------------------------------- scoring --

/** The index of the picked option, or NONE. */
export type Answer = number;

/** "None of these are me" (quiz-review 7): a valid answer that casts no vote, like an unanswered question. */
export const NONE = -1;
export type Answers = Record<string, Answer>;

export type Strength = "strong" | "leans" | "balanced";

export type VibeResult = {
  /** −1..+1 per category; + is the first pole in POLES. */
  vector: Record<Category, number>;
  strength: Record<Category, Strength>;
  /** ± around each vector value, in the same −1..+1 units (90% margin of error). */
  margin: Record<Category, number>;
  /** Categories whose result is within the margin of error. */
  unsure: Category[];
  /** 0..1: how much the two answers in each twin pair agreed (null with no twin pair answered). */
  consistency: number | null;
  answered: number;
  name: Text;
  /** Two strongest clear poles, for display. */
  highlights: { category: Category; pole: Pole }[];
  /** 0..1 per type: how often the person picked that type's answer when it was offered. */
  affinity: Partial<Record<TypeCode, number>>;
  /**
   * What moves you (D32): the motive picked most often in the personality
   * answers, and a place to try chosen from the districts the member picked.
   * It becomes one sentence on the result (content.ts motiveSentence); it
   * never changes the type. Null when no answer with a motive was picked.
   */
  moves: { motive: Motive; place: string } | null;
};

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

export function pickedOption<O>(q: { options: O[] }, answer: unknown): O | null {
  return isInt(answer) && answer >= 0 && answer < q.options.length ? q.options[answer] : null;
}

/** 1 for a valid answer, 0 for NONE (valid, no vote), null otherwise (kept for form validation). */
export function itemScore(q: { options: unknown[] }, answer: unknown): number | null {
  if (answer === NONE) return 0;
  return pickedOption(q, answer) ? 1 : null;
}

export function strengthOf(score: number): Strength {
  const a = Math.abs(score);
  if (a >= 0.6) return "strong";
  if (a >= 0.25) return "leans";
  return "balanced";
}

const CODE_CATEGORIES: Category[] = ["energy", "explore", "motion", "culture"];
/** How much wider a letter's margin gets for each twin pair that disagreed on it. */
const TWIN_WIDEN = 1.25;
/** z for a 95% margin of error (owner, D28): a letter counts as settled only at 95% confidence; below that Q7 asks a follow-up and the result shows a range. */
const Z = 1.96;
/** Floor on p(1−p) so a perfect run of picks still carries some margin. */
const VAR_FLOOR = 0.04;

/** 90% margin of error on a share p from n picks, in −1..+1 units. */
function marginOf(p: number, n: number): number {
  if (n === 0) return 1;
  return 2 * Z * Math.sqrt(Math.max(p * (1 - p), VAR_FLOOR) / n);
}

export function scoreSession(questions: Question[], answers: Answers): VibeResult {
  const plus = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  const n = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  const offered: Partial<Record<TypeCode, number>> = {};
  const picked: Partial<Record<TypeCode, number>> = {};
  const pickByScenario = new Map<string, TypeCode>();
  const motiveCount = new Map<Motive, number>();
  const pickedDistricts: string[] = [];
  /** Each letter's votes in order: a recent one settles an exact tie (see below). */
  const poles = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Pole[]])) as Record<Category, Pole[]>;
  let answered = 0;
  for (const q of questions) {
    const o = pickedOption(q, answers[q.id]);
    if (!o) continue;
    answered += 1;
    pickByScenario.set(q.scenario, o.type);
    for (const opt of q.options) offered[opt.type] = (offered[opt.type] ?? 0) + 1;
    picked[o.type] = (picked[o.type] ?? 0) + 1;
    if (o.motive) motiveCount.set(o.motive, (motiveCount.get(o.motive) ?? 0) + 1);
    pickedDistricts.push(o.district);
    for (const { category, pole } of codePoles(o.type)) {
      n[category] += 1;
      if (pole === 1) plus[category] += 1;
      poles[category].push(pole);
    }
    if (o.flavour && q.kind !== "core") {
      n[q.kind] += 1;
      if (o.flavour === 1) plus[q.kind] += 1;
    }
  }
  // Twins: letters on which the two answers of a pair disagreed.
  const widen = Object.fromEntries(CATEGORIES.map((c) => [c, 1])) as Record<Category, number>;
  const agreements: number[] = [];
  for (const q of questions) {
    if (!q.twin || q.scenario > q.twin) continue;
    const a = pickByScenario.get(q.scenario);
    const b = pickByScenario.get(q.twin);
    if (!a || !b) continue;
    let same = 0;
    CODE_CATEGORIES.forEach((c, i) => {
      if (a[i] === b[i]) same += 1;
      else widen[c] *= TWIN_WIDEN;
    });
    agreements.push(same / 4);
  }
  const vector = {} as Record<Category, number>;
  const strength = {} as Record<Category, Strength>;
  const margin = {} as Record<Category, number>;
  const unsure: Category[] = [];
  for (const c of CATEGORIES) {
    const p = n[c] === 0 ? 0.5 : plus[c] / n[c];
    // An exact tie (8 and 8 happens often in a 16-question quiz) leans, by a hair, to one of the
    // person's latest answers: how they seem right now. Each letter looks back a different number
    // of answers (B/C the last, D/F the one before, ...): one pick votes on all four letters, so
    // using the same pick for every tied letter would favour that pick's types.
    const back = Math.max(0, CODE_CATEGORIES.indexOf(c));
    const recent = poles[c][poles[c].length - 1 - back] ?? poles[c][poles[c].length - 1] ?? 0;
    vector[c] = 2 * p - 1 + 0 || recent * 1e-9;
    margin[c] = Math.min(1, marginOf(p, n[c]) * widen[c]);
    strength[c] = strengthOf(vector[c]);
    // Flavours come from 2 questions: only clear when every one agreed.
    const clear = CODE_CATEGORIES.includes(c) ? Math.abs(vector[c]) > margin[c] : n[c] >= 2 && Math.abs(vector[c]) === 1;
    if (!clear) unsure.push(c);
  }
  const affinity: Partial<Record<TypeCode, number>> = {};
  for (const [code, k] of Object.entries(offered) as [TypeCode, number][]) affinity[code] = (picked[code] ?? 0) / k;
  const highlights = CATEGORIES.filter((c) => !unsure.includes(c))
    .sort((a, b) => Math.abs(vector[b]) - Math.abs(vector[a]) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
    .slice(0, 2)
    .map((category) => ({ category, pole: (vector[category] >= 0 ? 1 : -1) as Pole }));
  return {
    vector,
    strength,
    margin,
    unsure,
    consistency: agreements.length ? agreements.reduce((t, x) => t + x, 0) / agreements.length : null,
    answered,
    name: vibeName(highlights),
    highlights,
    affinity,
    moves: movesOf(motiveCount, pickedDistricts, questions),
  };
}

/** The most picked motive (MOTIVES order on a tie) and its place, from the member's own picks. */
function movesOf(count: Map<Motive, number>, districts: string[], questions: Question[]): VibeResult["moves"] {
  const top = Math.max(0, ...count.values());
  if (top === 0) return null;
  const motive = MOTIVES.find((m) => count.get(m) === top)!;
  return { motive, place: motivePlace(motive, districts, hashString(questions.map((q) => q.id).join())).id };
}

function poleInfo(category: Category, pole: Pole) {
  return pole === 1 ? POLES[category].plus : POLES[category].minus;
}

const t = (en: string, th: string): Text => ({ en, th });

/** "Curious Night Owl" / "นกฮูกราตรีสายลองของใหม่". */
export function vibeName(highlights: { category: Category; pole: Pole }[]): Text {
  if (highlights.length === 0) return t("Bangkok All-Rounder", "คนกรุงเทพฯ สายรอบด้าน");
  const main = poleInfo(highlights[0].category, highlights[0].pole);
  if (highlights.length === 1) return t(`Bangkok ${main.noun.en}`, `${main.noun.th}แห่งกรุงเทพฯ`);
  const second = poleInfo(highlights[1].category, highlights[1].pole);
  return t(`${second.adjective.en} ${main.noun.en}`, `${main.noun.th}${second.adjective.th}`);
}
