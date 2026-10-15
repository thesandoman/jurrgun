/**
 * The Bangkok Type quiz: 20 hand-written scenario questions per session.
 *
 * Nothing here writes a question. Every scenario and every answer is
 * hand-written in src/vibe/bank/ (one answer per Bangkok Type). This file only
 * PICKS which scenarios a person sees, which six of the sixteen answers each
 * one shows, and in what order. A session is fully determined by its seed (and
 * the optional home district), so the server rebuilds it to score the answers
 * without keeping any session state.
 *
 * A session:
 *   - 16 core scenarios + 2 rhythm + 2 plan scenarios;
 *   - a mix of who you're with (friends, family, dates, solo, coworkers,
 *     parties, meetups), at least CONTEXT_MIN of each;
 *   - 2 "twin" pairs (the same idea in other words), at least 8 questions
 *     apart, to check consistency;
 *   - each question shows 3 opposite pairs of types (X and its opposite), so
 *     every letter has 3 answers on each side and no letter is favoured;
 *   - every type is offered 7 or 8 times;
 *   - scenarios the person has already seen are avoided where possible.
 *
 * Who the member is (Personal) shapes the session without changing how types
 * are scored:
 *   - romance wording (owner, Q-D1): date moments are in everyone's quiz, but
 *     only members who opted into 💘 Open to something more read them as
 *     dates; everyone else reads the same moment as a one-to-one friend
 *     meetup (Scenario.friend), with the same answers and types;
 *   - sets (quiz-blueprint 2.3b): "open-to-more" scenarios only for opted-in
 *     members, "table-host" only for Table Hosts;
 *   - season: scenarios with `months` are preferred in those months and kept
 *     for when nothing else fits outside them;
 *   - audience: scenarios written for one Bangkok story (local, newcomer,
 *     international) only for those members;
 *   - style sets (styles.ts, generateStyleQuestions): 4 "how you date"
 *     questions for opted-in members and 2 "how you host" questions for Table
 *     Hosts, after the 20. They are their own question type with no type
 *     codes, and scoreSession only takes the 20, so they never move the type;
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

import { CATEGORIES, POLES, type Category, type Pole, type Text } from "./content";
import type { Segment } from "../domain/segment";
import { SEGMENT_PROMPTS } from "./bank/segment-prompts";
import { EXPAT_PROMPTS, explainLocal } from "./bank/plain-english";
import { createRng, hashString, shuffle, type Rng } from "./rng";
import { codePoles, oppositeCode, SCENARIOS, TYPE_CODES, type Context, type Kind, type Scenario, type ScenarioSet, type TypeCode } from "./scenarios";
import { STYLE_DIMENSIONS, STYLE_SCENARIOS, type StyleCard, type StyleScenario, type StyleSet } from "./styles";
import type { Art } from "./visuals";

export const QUIZ_LENGTH = 20;
export const OPTIONS_PER_QUESTION = 6;
/** Style questions after the 20: one per "how you date" dimension, two "how you host". */
export const DATE_STYLE_ITEMS = Object.keys(STYLE_DIMENSIONS["open-to-more"]).length;
export const HOST_STYLE_ITEMS = 2;
const CORE_ITEMS = 16;
const FLAVOUR_ITEMS = 2; // per flavour kind (rhythm, plan)
const TWIN_PAIRS = 2;
const TWIN_GAP = 8;

/** The least of each context in one session's 16 core questions. */
export const CONTEXT_MIN: Record<Context, number> = { friends: 2, family: 3, date: 3, solo: 1, coworkers: 1, party: 2, meetup: 2 };

export type Option = { label: Text; icon: string; type: TypeCode; district: string; flavour?: Pole };

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

/** Everything the quiz form shows: the 20 type questions, then any style questions. */
export type AnyQuestion = Question | StyleQuestion;
export const isStyleQuestion = (q: AnyQuestion): q is StyleQuestion => q.kind === "style";
/** The type questions only, for scoreSession. */
export const typeQuestions = (qs: AnyQuestion[]): Question[] => qs.filter((q): q is Question => !isStyleQuestion(q));


/** What the browser gets: no type, no district, nothing to game. */
export type PublicQuestion = { id: string; format: "choice"; prompt: Text; options: Text[]; icons: string[]; art: Art };

/**
 * Who the member is. The home district leans one or two questions toward it;
 * the rest choose which sets they see (see the top of this file). All of it
 * goes into the seed, so the server rebuilds the same session to score it.
 */
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
  /** Question ids this user has already answered; their scenarios are avoided where possible. */
  seen?: ReadonlySet<string>;
  personal?: Personal;
  /** 1 to 12, the month in Bangkok: seasonal scenarios are preferred in season. Part of the seed key. */
  month?: number;
};

/** The 8 opposite pairs, e.g. [BDSH, CFMN], keyed by their B-side code. */
const TYPE_PAIRS: [TypeCode, TypeCode][] = TYPE_CODES.filter((c) => c[0] === "B").map((c) => [c, oppositeCode(c)]);

const scenarioOfId = (id: string) => id.split(".")[0];

// ------------------------------------------------------------ picking --

/** Unseen first, then (if `prefer` is given) the preferred ones, then random. */
/** A seasonal scenario outside its months (with no month given, everything is in season). */
const outOfSeason = (s: Scenario, month?: number) => !!month && !!s.months && !s.months.includes(month);

/** In season first, then unseen, then (if `prefer` is given) the preferred ones, then random. */
function preferUnseen(rng: Rng, list: Scenario[], seen: ReadonlySet<string>, prefer?: (s: Scenario) => boolean, month?: number): Scenario[] {
  const rank = (s: Scenario) => (outOfSeason(s, month) ? 4 : 0) + (seen.has(s.id) ? 2 : 0) + (prefer && !prefer(s) ? 1 : 0);
  return shuffle(rng, list).sort((a, b) => rank(a) - rank(b));
}

const HOME_SCENARIOS = 2;
const nearHome = (home: string | null | undefined) => (s: Scenario) => !!home && TYPE_CODES.some((c) => s.answers[c].district === home);

/** 16 core scenarios: two twin pairs, the context minimums, then anything. */
/** Whether this member is offered the scenario: its set (if any) is one of theirs, and so is its audience. */
export function offered(s: Pick<Scenario, "set" | "audience" | "context" | "friend">, p: Personal | undefined): boolean {
  const sets: ScenarioSet[] = [...(p?.openToMore ? (["open-to-more"] as const) : []), ...(p?.tableHost ? (["table-host"] as const) : [])];
  if (s.set && !sets.includes(s.set)) return false;
  // A date moment reaches someone not open to something more only through its friend wording (bank-rules also checks).
  if (s.context === "date" && !p?.openToMore && !s.friend) return false;
  return !s.audience || (!!p?.segment && s.audience.includes(p.segment));
}

function pickCore(rng: Rng, seen: ReadonlySet<string>, home: string | null | undefined, p: Personal | undefined, month?: number): Scenario[] {
  const core = SCENARIOS.filter((s) => s.kind === "core" && offered(s, p));
  const twinPairs: [Scenario, Scenario][] = [];
  for (const s of core) {
    const t = s.twin ? core.find((x) => x.id === s.twin) : undefined;
    if (t && s.id < t.id) twinPairs.push([s, t]);
  }
  // Out-of-season pairs go last too: twins are picked first, so without this a seasonal twin
  // would show up just as often out of season once the bank is big.
  const pairRank = (p: [Scenario, Scenario]) =>
    (p.some((s) => outOfSeason(s, month)) ? 4 : 0) + (seen.has(p[0].id) ? 1 : 0) + (seen.has(p[1].id) ? 1 : 0);
  const pairs = shuffle(rng, twinPairs).sort((a, b) => pairRank(a) - pairRank(b)).slice(0, TWIN_PAIRS);
  const chosen: Scenario[] = pairs.flat();
  // From the other twin pairs, at most one half may appear, so exactly two pairs are checked.
  const blocked = new Set<string>();
  const has = (s: Scenario) => chosen.includes(s) || blocked.has(s.id);
  const isHome = nearHome(home);
  const prefer = home ? (s: Scenario) => chosen.filter(isHome).length >= HOME_SCENARIOS || isHome(s) : undefined;
  const take = (list: Scenario[]) => {
    for (const s of list) {
      chosen.push(s);
      if (s.twin) blocked.add(s.twin);
    }
  };
  for (const ctx of shuffle(rng, Object.keys(CONTEXT_MIN) as Context[])) {
    const need = CONTEXT_MIN[ctx] - chosen.filter((s) => s.context === ctx).length;
    for (let k = 0; k < need; k++) take(preferUnseen(rng, core.filter((s) => s.context === ctx && !has(s)), seen, prefer, month).slice(0, 1));
  }
  while (chosen.length < CORE_ITEMS) take(preferUnseen(rng, core.filter((s) => !has(s)), seen, prefer, month).slice(0, 1));
  return chosen;
}

/**
 * Three distinct opposite pairs per question, so that across the session
 * each pair (and so each type) is offered 7 or 8 times. The two halves of a
 * twin pair show the same six types, so their answers can be compared.
 */
function pairsPerQuestion(rng: Rng, scenarios: Scenario[]): [TypeCode, TypeCode][][] {
  const n = scenarios.length;
  const total = n * 3;
  const quota = new Map<string, number>();
  const extra = new Set(shuffle(rng, TYPE_PAIRS.map((p) => p[0])).slice(0, total % TYPE_PAIRS.length));
  for (const [b] of TYPE_PAIRS) quota.set(b, Math.floor(total / TYPE_PAIRS.length) + (extra.has(b) ? 1 : 0));
  const out: [TypeCode, TypeCode][][] = new Array(n);
  const take = (times: number) => {
    // Most quota left first, random among equals.
    const three = shuffle(rng, TYPE_PAIRS)
      .sort((a, b) => quota.get(b[0])! - quota.get(a[0])!)
      .slice(0, 3);
    for (const [b] of three) quota.set(b, quota.get(b)! - times);
    return three;
  };
  const twinOf = (i: number) => scenarios.findIndex((s) => s.id === scenarios[i].twin);
  const done = new Set<number>();
  for (let i = 0; i < n; i++) {
    const j = twinOf(i);
    if (j < 0 || done.has(i)) continue;
    out[i] = out[j] = take(2);
    done.add(i).add(j);
  }
  for (const i of shuffle(rng, Array.from({ length: n }, (_, k) => k))) if (!done.has(i)) out[i] = take(1);
  return out;
}

/** Order with twins far apart and the same context (or flavour kind) never back to back where avoidable. */
function orderCost(order: Scenario[]): number {
  let cost = 0;
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    if (a.kind !== "core" && a.kind === b.kind) cost += 50;
    if (a.kind === "core" && b.kind === "core" && a.context === b.context) cost += 10;
  }
  for (let i = 0; i < order.length; i++) {
    const t = order[i].twin;
    if (!t) continue;
    const j = order.findIndex((s) => s.id === t);
    if (j >= 0 && Math.abs(i - j) < TWIN_GAP) cost += 1000;
  }
  return cost;
}

function arrange(rng: Rng, list: Scenario[]): Scenario[] {
  let best = list;
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 300 && bestCost > 0; attempt++) {
    const order = shuffle(rng, list);
    const cost = orderCost(order);
    if (cost < bestCost) {
      best = order;
      bestCost = cost;
    }
  }
  return best;
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

function buildQuestion(rng: Rng, sc: Scenario, pairs: [TypeCode, TypeCode][], p?: Personal): Question {
  const codes = shuffle(rng, pairs.flat());
  const en = (x: string) => (p?.explainLocal ? explainLocal(x) : x);
  const words = wordingFor(sc, p);
  const told = words.prompt;
  const options: Option[] = codes.map((code) => {
    const a = sc.answers[code];
    const label = words.answer(code);
    return { label: { en: en(label.en), th: label.th }, icon: a.icon, type: code, district: a.district, ...(a.flavour ? { flavour: a.flavour } : {}) };
  });
  return {
    id: `${sc.id}.${hashString(codes.join("")).toString(36)}`,
    format: "choice",
    scenario: sc.id,
    kind: sc.kind,
    context: sc.context,
    ...(sc.twin ? { twin: sc.twin } : {}),
    prompt: { en: (p?.explainLocal && EXPAT_PROMPTS[sc.id]) || en(told.en), th: told.th },
    options,
    art: { tone: sc.tone, icons: [words.icon], seed: hashString(sc.id + codes.join("")) },
  };
}

function buildStyleQuestion(rng: Rng, sc: StyleScenario, p?: Personal): StyleQuestion {
  const answers = shuffle(rng, sc.answers);
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

/** One style scenario for each of `n` dimensions of the set (random dimensions when fewer than all). */
function pickStyle(rng: Rng, set: StyleSet, n: number, seen: ReadonlySet<string>): StyleScenario[] {
  const dimensions = shuffle(rng, Object.keys(STYLE_DIMENSIONS[set])).slice(0, n);
  return dimensions.flatMap((d) => {
    const list = STYLE_SCENARIOS.filter((s) => s.set === set && s.dimension === d);
    const [first] = shuffle(rng, list).sort((a, b) => (seen.has(a.id) ? 1 : 0) - (seen.has(b.id) ? 1 : 0));
    return first ? [first] : [];
  });
}

/** Everything that changes which questions and answers appear, so the rebuild matches what the member saw. Language (explainLocal) only changes wording and is left out. */
function personalKey(p: Personal | undefined): string {
  if (!p) return "";
  return [p.district ? `|d=${p.district}` : "", p.segment ? `|s=${p.segment}` : "", p.openToMore ? "|r" : "", p.tableHost ? "|h" : ""].join("");
}

export function generateSession(options: SessionOptions): Question[] {
  const p = options.personal;
  const rng = createRng(`bkk-type:${options.seed}${personalKey(p)}${options.month ? `|m=${options.month}` : ""}`);
  const seenScenarios = new Set([...(options.seen ?? [])].map(scenarioOfId));
  const flavour = (kind: Kind) =>
    preferUnseen(rng, SCENARIOS.filter((s) => s.kind === kind && offered(s, p)), seenScenarios, undefined, options.month).slice(0, FLAVOUR_ITEMS);
  const scenarios = arrange(rng, [...pickCore(rng, seenScenarios, p?.district, p, options.month), ...flavour("rhythm"), ...flavour("plan")]);
  const pairs = pairsPerQuestion(rng, scenarios);
  // Home district: in up to two questions, bring in the pair whose answer is set near home.
  // The pair is traded with another question, not just swapped in, so every type is
  // still offered 7 or 8 times (test/quiz-balance.test.ts checks this).
  const home = options.personal?.district;
  if (home) {
    let swapped = 0;
    for (let i = 0; i < scenarios.length && swapped < 2; i++) {
      const code = TYPE_CODES.find((c) => scenarios[i].answers[c].district === home);
      if (!code || scenarios[i].twin || pairs[i].some((p) => p.includes(code))) continue;
      const want = TYPE_PAIRS.find((p) => p.includes(code))!;
      const give = pairs[i][0];
      const j = pairs.findIndex((ps, k) => k !== i && !scenarios[k].twin && ps.includes(want) && !ps.includes(give));
      if (j < 0) continue;
      pairs[j] = pairs[j].map((p) => (p === want ? give : p));
      pairs[i] = [want, ...pairs[i].slice(1)];
      swapped += 1;
    }
  }
  return scenarios.map((sc, i) => buildQuestion(rng, sc, pairs[i], p));
}

/**
 * The style questions for this member, shown after the 20: "how you date"
 * only when opted into Open to something more, "how you host" only for Table
 * Hosts. Their own random stream, so they never change the 20.
 */
export function generateStyleQuestions(options: SessionOptions): StyleQuestion[] {
  const p = options.personal;
  const rng = createRng(`bkk-style:${options.seed}${personalKey(p)}`);
  const seen = new Set([...(options.seen ?? [])].map(scenarioOfId));
  const picked = [...(p?.openToMore ? pickStyle(rng, "open-to-more", DATE_STYLE_ITEMS, seen) : []), ...(p?.tableHost ? pickStyle(rng, "table-host", HOST_STYLE_ITEMS, seen) : [])];
  return picked.map((sc) => buildStyleQuestion(rng, sc, p));
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
/** z for a 90% margin of error: firm enough to be honest, not so strict that a clear 75/25 reads as unsure. */
const Z = 1.645;
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
  let answered = 0;
  for (const q of questions) {
    const o = pickedOption(q, answers[q.id]);
    if (!o) continue;
    answered += 1;
    pickByScenario.set(q.scenario, o.type);
    for (const opt of q.options) offered[opt.type] = (offered[opt.type] ?? 0) + 1;
    picked[o.type] = (picked[o.type] ?? 0) + 1;
    for (const { category, pole } of codePoles(o.type)) {
      n[category] += 1;
      if (pole === 1) plus[category] += 1;
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
    vector[c] = 2 * p - 1 + 0;
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
  };
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
