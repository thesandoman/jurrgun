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
 *   - every type is offered about equally often (within one of each other);
 *   - scenarios the person has already seen are avoided where possible;
 *   - 7 or 8 questions (at most 40%) use an interactive format instead of a
 *     plain pick-one (see FORMATS below); twin questions always stay pick-one
 *     so their answers can be compared; the slider pair only in a quarter of
 *     sessions (SLIDER_SESSIONS).
 *
 * Formats, and how each one scores. Every format turns an answer into votes
 * on the answers shown (see votesFor): a weight for the letters and a credit
 * for the type votes (affinity), following quiz-blueprint 4.2.
 *   choice        pick one of six (3 opposite pairs)              1 vote
 *   this-or-that  two answers from opposite types, swipe or tap     0.75 (a forced choice says a little less)
 *   slider        two answers whose types differ in ONE letter;     that letter only,
 *                 sliders come as a mirrored pair (X / X with the   by position, with
 *                 letter flipped, then the opposites of both), so   a dead zone in the
 *                 together they still show two opposite pairs      middle (SLIDER_MARGIN)
 *   rank          first and second choice of four (2 opposite pairs)  1 and 0.5 (quiz-blueprint 4.2 C)
 *   map           six pins on a Bangkok map, one per answer         1 vote
 *   photo         six answers, each with a postcard of its place    1 vote
 *   sentence      finish a sentence with one of six chips           1 vote
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
import { DISTRICTS } from "../lib/constants";
import { pinsFor } from "./quiz-map";

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

export const FORMATS = ["choice", "this-or-that", "slider", "rank", "map", "photo", "sentence"] as const;
export type Format = (typeof FORMATS)[number];

/** At most this many questions per session are not a plain pick-one (40% of 20). */
export const NON_CHOICE_MAX = 8;
const NON_CHOICE_MIN = 7;
/** Slider positions within this of the middle (0..100 scale) count as "both equally". */
export const SLIDER_MARGIN = 10;
/**
 * Share of sessions that get the mirrored slider pair. A slider stands in for
 * a question that would have measured all four letters, so each one costs
 * accuracy: in the 5,000-session simulation, sliders in every session cut
 * "real person gets their own type" from 86.7% to 81.6%; in a quarter of
 * sessions the cost is about one point.
 */
export const SLIDER_SESSIONS = 0.25;
/** Slider positions this far from the middle or further count as a full pick. */
const SLIDER_FULL = 40;
/** Rank: how many to rank, and their weights, favourite first. */
export const RANK_PICKS = 2;
/** Rank weights, first pick first: the second choice is real but weaker (quiz-blueprint 4.2, format C). */
export const RANK_WEIGHTS = [1, 0.5] as const;
/** A this-or-that pick's letter weight (quiz-blueprint 4.2). */
export const THIS_OR_THAT_WEIGHT = 0.75;

/** Opposite pairs each format shows (a slider shows half of one pair and half of another). */
const PAIRS_FOR: Record<Format, number> = { choice: 3, "this-or-that": 1, slider: 1, rank: 2, map: 3, photo: 3, sentence: 3 };

export type Question = {
  id: string;
  format: Format;
  scenario: string;
  kind: Kind;
  context: Context;
  twin?: string;
  prompt: Text;
  options: Option[];
  art: Art;
  /** slider: the letter (0..3 of the code) its two ends differ on. Never sent to the browser. */
  letter?: number;
  /** map: each answer's pin, in % of the map box. */
  pins?: { x: number; y: number }[];
  /** sentence: the start of the sentence the chips finish. */
  stem?: Text;
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


/**
 * What the browser gets: no type, no district key, no letter, nothing to game.
 * `areas` (map, photo) are display names of the places, which say nothing
 * about a type.
 */
export type PublicQuestion = {
  id: string;
  format: Format;
  prompt: Text;
  options: Text[];
  icons: string[];
  art: Art;
  pins?: { x: number; y: number }[];
  areas?: Text[];
  photos?: Art[];
  stem?: Text;
  pick?: number;
  min?: number;
  max?: number;
};

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

/** The opposite pair a code belongs to. */
const pairOf = (code: TypeCode) => TYPE_PAIRS.find((p) => p.includes(code))!;
/** The code with letter k flipped: BDSH, 0 → CDSH. */
function flipLetter(code: TypeCode, k: number): TypeCode {
  const opp = oppositeCode(code);
  return (code.slice(0, k) + opp[k] + code.slice(k + 1)) as TypeCode;
}

/**
 * The types each question shows, as opposite pairs, so that across the
 * session every pair (and so every type) is offered about equally often.
 * Most formats show three pairs, this-or-that one. The two halves of a twin
 * pair show the same six types, so their answers can be compared. The two
 * sliders share one letter k: the first shows X and X with k flipped, the
 * second the opposites of both, so together they show two whole opposite
 * pairs and every other letter is balanced too.
 */
function pairsPerQuestion(rng: Rng, scenarios: Scenario[], formats: Format[]): [TypeCode, TypeCode][][] {
  const n = scenarios.length;
  const total = formats.reduce((t, f) => t + PAIRS_FOR[f], 0);
  const quota = new Map<string, number>();
  const extra = new Set(shuffle(rng, TYPE_PAIRS.map((p) => p[0])).slice(0, total % TYPE_PAIRS.length));
  for (const [b] of TYPE_PAIRS) quota.set(b, Math.floor(total / TYPE_PAIRS.length) + (extra.has(b) ? 1 : 0));
  const out: [TypeCode, TypeCode][][] = new Array(n);
  const most = () => shuffle(rng, TYPE_PAIRS).sort((a, b) => quota.get(b[0])! - quota.get(a[0])!);
  const take = (times: number, k: number) => {
    // Most quota left first, random among equals.
    const chosen = most().slice(0, k);
    for (const [b] of chosen) quota.set(b, quota.get(b)! - times);
    return chosen;
  };
  const twinOf = (i: number) => scenarios.findIndex((s) => s.id === scenarios[i].twin);
  const done = new Set<number>();
  for (let i = 0; i < n; i++) {
    const j = twinOf(i);
    if (j < 0 || done.has(i)) continue;
    out[i] = out[j] = take(2, 3);
    done.add(i).add(j);
  }
  const sliders = formats.flatMap((f, i) => (f === "slider" && !done.has(i) ? [i] : []));
  for (let s = 0; s + 1 < sliders.length; s += 2) {
    const k = Math.floor(rng() * 4);
    const p = most()[0];
    const x = p[0];
    const y = flipLetter(x, k);
    const q = pairOf(y);
    quota.set(p[0], quota.get(p[0])! - 1);
    quota.set(q[0], quota.get(q[0])! - 1);
    out[sliders[s]] = [[x, y]];
    out[sliders[s + 1]] = [[oppositeCode(x), oppositeCode(y)]];
    done.add(sliders[s]).add(sliders[s + 1]);
  }
  // Three-pair questions next; one-pair questions last, where they fill whatever quota is left.
  const rest = shuffle(rng, Array.from({ length: n }, (_, k) => k)).filter((i) => !done.has(i));
  for (const i of [...rest].sort((a, b) => PAIRS_FOR[formats[b]] - PAIRS_FOR[formats[a]])) out[i] = take(1, PAIRS_FOR[formats[i]]);
  return out;
}

/**
 * Which questions use which format: two mirrored sliders and one rank on core
 * scenarios (their votes are partial, and flavours need whole picks), then one
 * each of this-or-that, map, photo and sentence, and sometimes one more of
 * those: 7 or 8 in all (35 to 40%). Never the first question (it teaches tap-to-pick) and never a
 * twin. Spread out where possible, so two interactive questions are rarely
 * back to back.
 */
function assignFormats(rng: Rng, scenarios: Scenario[], home?: string | null): Format[] {
  const formats: Format[] = scenarios.map(() => "choice");
  const inSession = new Set(scenarios.map((s) => s.id));
  const free = (i: number) => i > 0 && formats[i] === "choice" && !(scenarios[i].twin && inSession.has(scenarios[i].twin!));
  const crowd = (i: number) => (formats[i - 1] && formats[i - 1] !== "choice" ? 1 : 0) + (formats[i + 1] && formats[i + 1] !== "choice" ? 1 : 0);
  // Sliders can't take in the home pair (they keep their mirrored pair), so they go elsewhere where they can.
  const isHome = nearHome(home);
  const place = (f: Format, coreOnly: boolean) => {
    const spots = shuffle(rng, scenarios.map((_, i) => i)).filter((i) => free(i) && (!coreOnly || scenarios[i].kind === "core"));
    const cost = (i: number) => crowd(i) + (f === "slider" && isHome(scenarios[i]) ? 10 : 0);
    const best = spots.sort((a, b) => cost(a) - cost(b))[0];
    if (best !== undefined) formats[best] = f;
    return best !== undefined;
  };
  // Sliders only in mirrored pairs, and only in some sessions: place both or neither.
  if (rng() < SLIDER_SESSIONS && place("slider", true) && !place("slider", true)) formats[formats.indexOf("slider")] = "choice";
  place("rank", true);
  const light: Format[] = ["this-or-that", "map", "photo", "sentence"];
  for (const f of light) place(f, false);
  // Fill up to 7 or 8 with the formats that score like a pick-one.
  const target = NON_CHOICE_MIN + Math.floor(rng() * (NON_CHOICE_MAX - NON_CHOICE_MIN + 1));
  for (const f of shuffle(rng, [...EXTRA, ...EXTRA])) {
    if (formats.filter((x) => x !== "choice").length >= target) break;
    place(f, false);
  }
  return formats;
}

/** Formats that top a session up to 7 or 8: they score exactly like a pick-one, so they cost no accuracy. */
const EXTRA: Format[] = ["map", "photo", "sentence"];

/** Sentence starts for "finish the sentence": each fits any answer after it. */
const STEMS: Text[] = [
  { en: "If I'm honest, it's this:", th: "ถ้าพูดตรง ๆ ก็คือ" },
  { en: "Knowing me, I'd go for:", th: "รู้จักฉันดีก็รู้ว่าฉันเลือก" },
  { en: "The most me answer is:", th: "คำตอบที่เป็นตัวฉันที่สุดคือ" },
  { en: "My friends would bet on:", th: "เพื่อน ๆ คงเดาถูกว่าฉันจะ" },
];

const districtText = (key: string): Text => {
  const d = DISTRICTS.find((x) => x.value === key);
  return d ? { en: d.en, th: d.th } : { en: key, th: key };
};

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

function buildQuestion(rng: Rng, sc: Scenario, pairs: [TypeCode, TypeCode][], format: Format, p?: Personal): Question {
  const codes = shuffle(rng, pairs.flat());
  const en = (x: string) => (p?.explainLocal ? explainLocal(x) : x);
  const words = wordingFor(sc, p);
  const told = words.prompt;
  const options: Option[] = codes.map((code) => {
    const a = sc.answers[code];
    const label = words.answer(code);
    return { label: { en: en(label.en), th: label.th }, icon: a.icon, type: code, district: a.district, ...(a.flavour ? { flavour: a.flavour } : {}) };
  });
  // Pick-one questions keep the ids they always had; other formats get their own.
  const key = format === "choice" ? codes.join("") : `${format}:${codes.join("")}`;
  const extra: Partial<Question> = {};
  if (format === "slider") extra.letter = [0, 1, 2, 3].find((k) => codes[0][k] !== codes[1][k]);
  if (format === "map") extra.pins = pinsFor(options.map((o) => o.district));
  if (format === "sentence") extra.stem = STEMS[Math.floor(rng() * STEMS.length)];
  return {
    id: `${sc.id}.${hashString(key).toString(36)}`,
    format,
    scenario: sc.id,
    kind: sc.kind,
    context: sc.context,
    ...(sc.twin ? { twin: sc.twin } : {}),
    prompt: { en: (p?.explainLocal && EXPAT_PROMPTS[sc.id]) || en(told.en), th: told.th },
    options,
    art: { tone: sc.tone, icons: [words.icon], seed: hashString(sc.id + codes.join("")) },
    ...extra,
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
  const formats = assignFormats(rng, scenarios, p?.district);
  const pairs = pairsPerQuestion(rng, scenarios, formats);
  // Home district: in up to two questions, bring in the pair whose answer is set near home.
  // The pair is traded with another question, not just swapped in, so every type is
  // still offered 7 or 8 times (test/quiz-balance.test.ts checks this). Sliders keep
  // their mirrored pair, so they never trade.
  const home = options.personal?.district;
  if (home) {
    let swapped = 0;
    for (let i = 0; i < scenarios.length && swapped < 2; i++) {
      const code = TYPE_CODES.find((c) => scenarios[i].answers[c].district === home);
      if (!code || scenarios[i].twin || formats[i] === "slider" || pairs[i].some((p) => p.includes(code))) continue;
      const want = TYPE_PAIRS.find((p) => p.includes(code))!;
      const give = pairs[i][0];
      const j = pairs.findIndex((ps, k) => k !== i && !scenarios[k].twin && formats[k] !== "slider" && ps.includes(want) && !ps.includes(give));
      if (j < 0) continue;
      pairs[j] = pairs[j].map((p) => (p === want ? give : p));
      pairs[i] = [want, ...pairs[i].slice(1)];
      swapped += 1;
    }
  }
  return scenarios.map((sc, i) => buildQuestion(rng, sc, pairs[i], formats[i], p));
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

/** A postcard per answer for photo cards: the answer's icon over its area, in the scenario's light. */
export function photoArts(q: Question): Art[] {
  return q.options.map((o) => ({ tone: q.art.tone, icons: [o.icon], caption: districtText(o.district), seed: hashString(q.scenario + o.label.en) }));
}

export function toPublic(q: AnyQuestion): PublicQuestion {
  const base: PublicQuestion = { id: q.id, format: q.format, prompt: q.prompt, options: q.options.map((o) => ({ en: o.label.en, th: o.label.th })), icons: q.options.map((o) => o.icon), art: q.art };
  if (isStyleQuestion(q)) return base;
  switch (q.format) {
    case "slider":
      return { ...base, min: 0, max: 100 };
    case "rank":
      return { ...base, pick: RANK_PICKS };
    case "map":
      return { ...base, pins: q.pins, areas: q.options.map((o) => districtText(o.district)) };
    case "photo":
      return { ...base, photos: photoArts(q).map((a) => ({ ...a })), areas: q.options.map((o) => districtText(o.district)) };
    case "sentence":
      return { ...base, stem: q.stem };
    default:
      return base;
  }
}

// ---------------------------------------------------------------- scoring --

/**
 * choice, this-or-that, map, photo, sentence: the index of the picked option.
 * slider: 0..100, from the first option (0) to the second (100).
 * rank: RANK_PICKS distinct option indices, favourite first.
 * Any format: NONE, "None of these are me" (quiz-review 7).
 */
export type Answer = number | number[];

/** "None of these are me": a valid answer that casts no vote, like an unanswered question. */
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

/** One answer's vote: `share` is its weight on the letters (1 for a pick-one), `credit` its weight toward the type vote (0..1). */
export type Vote = { option: Option; share: number; credit: number };

/** −1..+1: how far a slider position leans to the second option, 0 inside the margin. */
export function sliderLean(value: number): number {
  const d = value - 50;
  const a = Math.abs(d);
  if (a <= SLIDER_MARGIN) return 0;
  return Math.sign(d) * Math.min(1, (a - SLIDER_MARGIN) / (SLIDER_FULL - SLIDER_MARGIN));
}

/** The votes an answer casts, or null when it is not a valid answer to the question. */
export function votesFor(q: Question, answer: unknown): Vote[] | null {
  switch (q.format) {
    case "slider": {
      if (!isInt(answer) || answer < 0 || answer > 100 || q.options.length !== 2) return null;
      const r = (1 + sliderLean(answer)) / 2;
      return [
        { option: q.options[0], share: 1 - r, credit: 1 - r },
        { option: q.options[1], share: r, credit: r },
      ];
    }
    case "rank": {
      if (!Array.isArray(answer) || answer.length !== RANK_PICKS) return null;
      if (!answer.every((j) => isInt(j) && j >= 0 && j < q.options.length) || new Set(answer).size !== answer.length) return null;
      return answer.map((j, k) => ({ option: q.options[j], share: RANK_WEIGHTS[k], credit: RANK_WEIGHTS[k] }));
    }
    default: {
      const o = pickedOption(q, answer);
      // Two full opposites force a choice even when neither fits, so this-or-that says a little less (quiz-blueprint 4.2).
      return o ? [{ option: o, share: q.format === "this-or-that" ? THIS_OR_THAT_WEIGHT : 1, credit: 1 }] : null;
    }
  }
}

/** The picked option, or null when the answer is not valid for the question. */
export function pickedOption<O>(q: { options: O[] }, answer: unknown): O | null {
  return isInt(answer) && answer >= 0 && answer < q.options.length ? q.options[answer] : null;
}

/** 1 for a valid answer, 0 for NONE (valid, no vote), null otherwise (kept for form validation). */
export function itemScore(q: { options: unknown[]; format?: string }, answer: unknown): number | null {
  if (answer === NONE) return 0;
  if (q.format === "slider" || q.format === "rank") return votesFor(q as Question, answer) ? 1 : null;
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
    // Unanswered and NONE both cast no vote (votesFor is null for them).
    const votes = votesFor(q, answers[q.id]);
    if (!votes) continue;
    answered += 1;
    pickByScenario.set(q.scenario, votes.reduce((a, b) => (b.share > a.share ? b : a)).option.type);
    for (const opt of q.options) offered[opt.type] = (offered[opt.type] ?? 0) + 1;
    for (const { option: o, share, credit } of votes) {
      picked[o.type] = (picked[o.type] ?? 0) + credit;
      // A slider's two ends differ in one letter only: that letter is all it measures.
      codePoles(o.type).forEach(({ category, pole }, k) => {
        if (q.format === "slider" && k !== q.letter) return;
        n[category] += share;
        if (pole === 1) plus[category] += share;
      });
      // Flavours count whole picks (only pick-one style formats reach rhythm and plan), so "both agreed" stays two votes.
      if (o.flavour && q.kind !== "core") {
        n[q.kind] += credit;
        if (o.flavour === 1) plus[q.kind] += credit;
      }
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
