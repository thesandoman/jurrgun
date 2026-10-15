/**
 * Bangkok Type quiz simulation: many simulated people take the quiz the way
 * the live app builds and scores it (generateSession -> scoreSession ->
 * typeOf, as in src/routes/quiz.tsx), so we can check that the question bank
 * stays fair as it grows.
 *
 * Used by test/quiz-balance.test.ts (a fast sample on every `npm test`) and by
 * scripts/quiz-sim.ts (the full 50,000 run that writes
 * design/reference/quiz-balance.md).
 *
 * Everything is seeded, so a run is repeatable: the same options give the same
 * numbers.
 */
import { typeOf } from "../src/vibe/archetypes";
import { generateSession, scoreSession, type Answers, type Personal, type Question } from "../src/vibe/generator";
import { createRng, type Rng } from "../src/vibe/rng";
import { oppositeCode, SCENARIOS, TYPE_CODES, type TypeCode } from "../src/vibe/scenarios";
import { DISTRICTS } from "../src/lib/constants";

const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;

// ------------------------------------------------------------ answerers --

/**
 * How a simulated person answers one question: the index of the option they
 * pick. `i` is the question's position, `n` the quiz length.
 */
export type Answerer = (q: Question, rng: Rng, i: number, n: number) => number;

/** Picks any option, with no preference: the baseline for fairness. */
export const randomAnswerer: Answerer = (q, rng) => Math.floor(rng() * q.options.length);

/** The option closest to `code` (its own type when offered), ties broken at random. */
function closest(q: Question, code: TypeCode, rng: Rng): number {
  const top = Math.max(...q.options.map((o) => shared(o.type, code)));
  const ties = q.options.map((_, j) => j).filter((j) => shared(q.options[j].type, code) === top);
  return ties[Math.floor(rng() * ties.length)];
}

/** A neighbour of `code`: any other option, more likely the closer it is (weights 1, 2, 4, 8 by letters shared). */
function neighbour(q: Question, code: TypeCode, rng: Rng, skip: number): number {
  const idx = q.options.map((_, j) => j).filter((j) => j !== skip);
  const w = idx.map((j) => 2 ** shared(q.options[j].type, code));
  let r = rng() * w.reduce((t, x) => t + x, 0);
  for (let k = 0; k < idx.length; k++) {
    r -= w[k];
    if (r <= 0) return idx[k];
  }
  return idx[idx.length - 1];
}

/**
 * A person who really is `code`: with probability `p` they pick what fits
 * them best (their own type, or the closest answer when it isn't offered);
 * otherwise a neighbouring answer, like a real person having an off moment.
 */
export const personaAnswerer =
  (code: TypeCode, p: number): Answerer =>
  (q, rng) => {
    const best = closest(q, code, rng);
    return rng() < p ? best : neighbour(q, code, rng, best);
  };

/** Answers as `code` for the first half and as its opposite for the second: should come out unsure, not confident. */
export const contradictoryAnswerer =
  (code: TypeCode): Answerer =>
  (q, rng, i, n) =>
    closest(q, i < n / 2 ? code : oppositeCode(code), rng);

// ------------------------------------------------------------ one run --

export type Outcome = {
  type: TypeCode;
  range: TypeCode[];
  unsureLetters: number;
  consistency: number | null;
};

/** Score a session exactly like POST /quiz in src/routes/quiz.tsx. */
export function outcomeOf(questions: Question[], answers: Answers): Outcome {
  const result = scoreSession(questions, answers);
  const { archetype, range } = typeOf(result.vector, result.affinity, result.unsure);
  const codeUnsure = result.unsure.filter((c) => c === "energy" || c === "explore" || c === "motion" || c === "culture").length;
  return { type: archetype as TypeCode, range: range as TypeCode[], unsureLetters: codeUnsure, consistency: result.consistency };
}

export function answerAll(questions: Question[], who: Answerer, rng: Rng): Answers {
  const answers: Answers = {};
  questions.forEach((q, i) => (answers[q.id] = who(q, rng, i, questions.length)));
  return answers;
}

// ------------------------------------------------------------ sessions --

export type SessionSpec = { seed: string; personal?: Personal };

const SEGMENTS = ["local", "newcomer", "international"] as const;

/**
 * The mix of sessions the live app builds: anonymous and onboarding (no
 * personalisation, so no romance), and members with a home district, a
 * segment, sometimes 💘 Open to something more (date scenarios) and sometimes
 * a Table Host. Add new profile options here as the quiz gains them.
 */
export function sessionSpec(k: number, rng: Rng): SessionSpec {
  const roll = rng();
  const district = DISTRICTS[Math.floor(rng() * DISTRICTS.length)].value;
  const segment = SEGMENTS[Math.floor(rng() * SEGMENTS.length)];
  const openToMore = rng() < 0.3;
  const tableHost = rng() < 0.1;
  return {
    seed: `sim-${k}`,
    personal: roll < 0.5 ? { district, segment, openToMore, tableHost, explainLocal: segment === "international" } : undefined,
  };
}

// ------------------------------------------------------------ the run --

export type SimReport = {
  sessions: number;
  questionsPerSession: { min: number; max: number };
  /** Distinct sessions (scenario order + options shown) among `sessions` runs. */
  distinctSessions: number;
  structure: {
    /** Questions where some letter did not have exactly half its options on each side. */
    unbalancedQuestions: number;
    /** Sessions where some type was offered outside 7 or 8 times (20-question sessions). */
    offerOutOfRange: number;
    /** How often each type sits in each of the 6 option positions, as max/min ratio across all cells. */
    positionSpread: number;
  };
  random: { counts: Record<TypeCode, number>; maxDeviation: number; letterShare: Record<string, number> };
  persona: { p: number; recovered: Record<TypeCode, number>; overall: number; withinRange: number; meanConsistency: number };
  perfect: { recovered: number; meanConsistency: number };
  noisy: { p: number; overall: number };
  contradictory: { confident: number; meanUnsureLetters: number };
  scenariosUsed: number;
  scenariosInBank: number;
};

const LETTERS = ["B", "C", "D", "F", "M", "S", "N", "H"];

/**
 * Runs `sessions` simulated quizzes. Each session is built once and answered
 * by every answerer model, so the models are compared on the same questions.
 */
export function simulate(sessions: number, opts: { personaP?: number; noisyP?: number; seed?: string } = {}): SimReport {
  const personaP = opts.personaP ?? 0.7;
  const noisyP = opts.noisyP ?? 0.5;
  const rng = createRng(`quiz-sim:${opts.seed ?? "v1"}`);
  const signatures = new Set<string>();
  const scenariosUsed = new Set<string>();
  const randomCounts = Object.fromEntries(TYPE_CODES.map((c) => [c, 0])) as Record<TypeCode, number>;
  const letterCount = Object.fromEntries(LETTERS.map((l) => [l, 0])) as Record<string, number>;
  const personaHit = Object.fromEntries(TYPE_CODES.map((c) => [c, 0])) as Record<TypeCode, number>;
  const personaRuns = Object.fromEntries(TYPE_CODES.map((c) => [c, 0])) as Record<TypeCode, number>;
  const position = new Map<string, number>();
  let personaInRange = 0;
  let personaCons = 0;
  let personaConsN = 0;
  let perfectHit = 0;
  let perfectCons = 0;
  let perfectConsN = 0;
  let noisyHit = 0;
  let contraConfident = 0;
  let contraUnsure = 0;
  let unbalanced = 0;
  let offerOut = 0;
  let qMin = Infinity;
  let qMax = 0;

  for (let k = 0; k < sessions; k++) {
    const spec = sessionSpec(k, rng);
    const qs = generateSession({ seed: spec.seed, personal: spec.personal });
    qMin = Math.min(qMin, qs.length);
    qMax = Math.max(qMax, qs.length);
    signatures.add(qs.map((q) => q.id).join(","));

    // Structure: letters balanced on every question, each type offered 7 or 8 times.
    const offered = new Map<string, number>();
    for (const q of qs) {
      scenariosUsed.add(q.scenario);
      const types = q.options.map((o) => o.type);
      for (let i = 0; i < 4; i++) {
        const plus = types.filter((t) => t[i] === TYPE_CODES[0][i]).length;
        if (plus * 2 !== types.length) {
          unbalanced += 1;
          break;
        }
      }
      q.options.forEach((o, j) => {
        offered.set(o.type, (offered.get(o.type) ?? 0) + 1);
        position.set(`${o.type}@${j}`, (position.get(`${o.type}@${j}`) ?? 0) + 1);
      });
    }
    if (qs.length === 20 && TYPE_CODES.some((c) => { const n = offered.get(c) ?? 0; return n < 7 || n > 8; })) offerOut += 1;

    // Random answerer.
    const r = outcomeOf(qs, answerAll(qs, randomAnswerer, rng));
    randomCounts[r.type] += 1;
    for (const ch of r.type) letterCount[ch] += 1;

    // A real person of a known type (cycled so every type gets equal runs).
    const truth = TYPE_CODES[k % 16];
    const pr = outcomeOf(qs, answerAll(qs, personaAnswerer(truth, personaP), rng));
    personaRuns[truth] += 1;
    if (pr.type === truth) personaHit[truth] += 1;
    if (pr.range.includes(truth)) personaInRange += 1;
    if (pr.consistency !== null) {
      personaCons += pr.consistency;
      personaConsN += 1;
    }

    // A perfectly consistent person: always the best fit.
    const pf = outcomeOf(qs, answerAll(qs, personaAnswerer(truth, 1), rng));
    if (pf.type === truth) perfectHit += 1;
    if (pf.consistency !== null) {
      perfectCons += pf.consistency;
      perfectConsN += 1;
    }

    // A noisy person, and one who contradicts themselves halfway.
    if (outcomeOf(qs, answerAll(qs, personaAnswerer(truth, noisyP), rng)).type === truth) noisyHit += 1;
    const cr = outcomeOf(qs, answerAll(qs, contradictoryAnswerer(truth), rng));
    if (cr.unsureLetters === 0) contraConfident += 1;
    contraUnsure += cr.unsureLetters;
  }

  const expected = sessions / 16;
  const posValues = [...position.values()];
  return {
    sessions,
    questionsPerSession: { min: qMin, max: qMax },
    distinctSessions: signatures.size,
    structure: { unbalancedQuestions: unbalanced, offerOutOfRange: offerOut, positionSpread: Math.max(...posValues) / Math.min(...posValues) },
    random: {
      counts: randomCounts,
      maxDeviation: Math.max(...TYPE_CODES.map((c) => Math.abs(randomCounts[c] - expected) / expected)),
      letterShare: Object.fromEntries(LETTERS.map((l) => [l, letterCount[l] / sessions])),
    },
    persona: {
      p: personaP,
      recovered: Object.fromEntries(TYPE_CODES.map((c) => [c, personaRuns[c] ? personaHit[c] / personaRuns[c] : 0])) as Record<TypeCode, number>,
      overall: TYPE_CODES.reduce((t, c) => t + personaHit[c], 0) / sessions,
      withinRange: personaInRange / sessions,
      meanConsistency: personaConsN ? personaCons / personaConsN : 0,
    },
    perfect: { recovered: perfectHit / sessions, meanConsistency: perfectConsN ? perfectCons / perfectConsN : 0 },
    noisy: { p: noisyP, overall: noisyHit / sessions },
    contradictory: { confident: contraConfident / sessions, meanUnsureLetters: contraUnsure / sessions },
    scenariosUsed: scenariosUsed.size,
    scenariosInBank: SCENARIOS.length,
  };
}
