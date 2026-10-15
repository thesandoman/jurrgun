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
 * Scoring allows for a margin of error: people are subjective, so a letter
 * only counts as clear when it is clear beyond the margin (see scoreSession).
 */

import { CATEGORIES, POLES, type Category, type Pole, type Text } from "./content";
import { createRng, hashString, shuffle, type Rng } from "./rng";
import { codePoles, oppositeCode, SCENARIOS, TYPE_CODES, type Context, type Kind, type Scenario, type TypeCode } from "./scenarios";
import type { Art } from "./visuals";

export const QUIZ_LENGTH = 20;
export const OPTIONS_PER_QUESTION = 6;
const CORE_ITEMS = 16;
const FLAVOUR_ITEMS = 2; // per flavour kind (rhythm, plan)
const TWIN_PAIRS = 2;
const TWIN_GAP = 8;

/** The least of each context in one session's 16 core questions. */
export const CONTEXT_MIN: Record<Context, number> = { friends: 2, family: 3, date: 3, solo: 1, coworkers: 1, party: 2, meetup: 2 };

export type Option = { label: Text; icon: string; type: TypeCode; district: string; flavour?: Pole };

export type Question = {
  id: string;
  /** Kept for the question-art and older call sites: every question is a pick-one. */
  format: "choice";
  scenario: string;
  kind: Kind;
  context: Context;
  twin?: string;
  prompt: Text;
  options: Option[];
  art: Art;
};

/** What the browser gets: no type, no district, nothing to game. */
export type PublicQuestion = { id: string; format: "choice"; prompt: Text; options: Text[]; icons: string[]; art: Art };

/** Light personalisation: the person's home district leans one or two questions toward it. */
export type Personal = { district?: string | null; interests?: readonly string[] | null };

export type SessionOptions = {
  seed: string;
  /** Question ids this user has already answered; their scenarios are avoided where possible. */
  seen?: ReadonlySet<string>;
  personal?: Personal;
};

/** The 8 opposite pairs, e.g. [BDSH, CFMN], keyed by their B-side code. */
const TYPE_PAIRS: [TypeCode, TypeCode][] = TYPE_CODES.filter((c) => c[0] === "B").map((c) => [c, oppositeCode(c)]);

const scenarioOfId = (id: string) => id.split(".")[0];

// ------------------------------------------------------------ picking --

/** Unseen first, then (if `prefer` is given) the preferred ones, then random. */
function preferUnseen(rng: Rng, list: Scenario[], seen: ReadonlySet<string>, prefer?: (s: Scenario) => boolean): Scenario[] {
  const rank = (s: Scenario) => (seen.has(s.id) ? 2 : 0) + (prefer && !prefer(s) ? 1 : 0);
  return shuffle(rng, list).sort((a, b) => rank(a) - rank(b));
}

const HOME_SCENARIOS = 2;
const nearHome = (home: string | null | undefined) => (s: Scenario) => !!home && TYPE_CODES.some((c) => s.answers[c].district === home);

/** 16 core scenarios: two twin pairs, the context minimums, then anything. */
function pickCore(rng: Rng, seen: ReadonlySet<string>, home?: string | null): Scenario[] {
  const core = SCENARIOS.filter((s) => s.kind === "core");
  const twinPairs: [Scenario, Scenario][] = [];
  for (const s of core) {
    const t = s.twin ? core.find((x) => x.id === s.twin) : undefined;
    if (t && s.id < t.id) twinPairs.push([s, t]);
  }
  const pairSeen = (p: [Scenario, Scenario]) => (seen.has(p[0].id) ? 1 : 0) + (seen.has(p[1].id) ? 1 : 0);
  const pairs = shuffle(rng, twinPairs).sort((a, b) => pairSeen(a) - pairSeen(b)).slice(0, TWIN_PAIRS);
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
    for (let k = 0; k < need; k++) take(preferUnseen(rng, core.filter((s) => s.context === ctx && !has(s)), seen, prefer).slice(0, 1));
  }
  while (chosen.length < CORE_ITEMS) take(preferUnseen(rng, core.filter((s) => !has(s)), seen, prefer).slice(0, 1));
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

function buildQuestion(rng: Rng, sc: Scenario, pairs: [TypeCode, TypeCode][]): Question {
  const codes = shuffle(rng, pairs.flat());
  const options: Option[] = codes.map((code) => {
    const a = sc.answers[code];
    return { label: { en: a.en, th: a.th }, icon: a.icon, type: code, district: a.district, ...(a.flavour ? { flavour: a.flavour } : {}) };
  });
  return {
    id: `${sc.id}.${hashString(codes.join("")).toString(36)}`,
    format: "choice",
    scenario: sc.id,
    kind: sc.kind,
    context: sc.context,
    ...(sc.twin ? { twin: sc.twin } : {}),
    prompt: sc.prompt,
    options,
    art: { tone: sc.tone, icons: [sc.icon], seed: hashString(sc.id + codes.join("")) },
  };
}

function personalKey(p: Personal | undefined): string {
  return p?.district ? `|d=${p.district}` : "";
}

export function generateSession(options: SessionOptions): Question[] {
  const key = personalKey(options.personal);
  const rng = createRng(`bkk-type:${options.seed}${key}`);
  const seenScenarios = new Set([...(options.seen ?? [])].map(scenarioOfId));
  const flavour = (kind: Kind) => preferUnseen(rng, SCENARIOS.filter((s) => s.kind === kind), seenScenarios).slice(0, FLAVOUR_ITEMS);
  const scenarios = arrange(rng, [...pickCore(rng, seenScenarios, options.personal?.district), ...flavour("rhythm"), ...flavour("plan")]);
  const pairs = pairsPerQuestion(rng, scenarios);
  // Home district: in up to two questions, swap in the pair whose answer is set near home.
  const home = options.personal?.district;
  if (home) {
    let swapped = 0;
    for (let i = 0; i < scenarios.length && swapped < 2; i++) {
      const code = TYPE_CODES.find((c) => scenarios[i].answers[c].district === home);
      if (!code || scenarios[i].twin || pairs[i].some((p) => p.includes(code))) continue;
      pairs[i] = [TYPE_PAIRS.find((p) => p.includes(code))!, ...pairs[i].slice(1)];
      swapped += 1;
    }
  }
  return scenarios.map((sc, i) => buildQuestion(rng, sc, pairs[i]));
}

export function toPublic(q: Question): PublicQuestion {
  return { id: q.id, format: "choice", prompt: q.prompt, options: q.options.map((o) => ({ en: o.label.en, th: o.label.th })), icons: q.options.map((o) => o.icon), art: q.art };
}

// ---------------------------------------------------------------- scoring --

/** The index of the picked option. */
export type Answer = number;
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

/** The picked option, or null when the answer is not valid for the question. */
export function pickedOption(q: Question, answer: unknown): Option | null {
  return isInt(answer) && answer >= 0 && answer < q.options.length ? q.options[answer] : null;
}

/** 1 for a valid answer, null otherwise (kept for form validation). */
export function itemScore(q: Question, answer: unknown): number | null {
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
