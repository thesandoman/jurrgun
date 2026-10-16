/**
 * Bias benchmark for the curated Bangkok Type quiz (owner, 10-16): simulated
 * people with real-world answering habits, old vs new answer order, and the
 * live scoring vs a Bayesian model. Every share has a 95% Wilson interval.
 *
 *   npx tsx scripts/quiz-bias-bench.ts          4,000 people per row
 *   npx tsx scripts/quiz-bias-bench.ts 20000
 *
 * Habits (layered on a person who picks their best fit 70% of the time):
 *  - primacy: 15% of the time just taps the top answer;
 *  - fatigue: best fit drops from 75% on question 1 to 55% on the last;
 *  - gamer (game theory): half the time picks toward a type they want
 *    (The Party Host, BFSN), the rest answers honestly.
 * Bayesian model: P(pick | type) ∝ e^(β · letters shared), β = 1 (not fitted to
 * the simulator); the type is the most likely one; follow-ups chosen by expected
 * information gain instead of the curated rule, same number asked.
 */
import { followUpPlan } from "../src/vibe/adaptive";
import { followUpQuestions, generateSession, NONE, type Answers, type Question } from "../src/vibe/generator";
import { createRng, type Rng } from "../src/vibe/rng";
import { TYPE_CODES, type TypeCode } from "../src/vibe/scenarios";
import { answerAll, outcomeOf, personaAnswerer, randomAnswerer, sessionSpec, type Answerer } from "../test/quiz-sim";

const n = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 4000);
const BETA = 1;
const TARGET: TypeCode = "BFSN";

function wilson(k: number, total: number): [number, number] {
  const z = 1.96;
  const p = k / total;
  const d = 1 + (z * z) / total;
  const c = (p + (z * z) / (2 * total)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / d;
  return [c - h, c + h];
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const ci = (k: number, total: number) => {
  const [lo, hi] = wilson(k, total);
  return `${pct(k / total)} (${pct(lo)}–${pct(hi)})`;
};
const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;

// ------------------------------------------------------------ answer order --
/** The order before the 10-16 card, for the two questions that changed. */
const OLD_ORDER: Record<string, string[]> = {
  newfriend: ["BFSH", "CDMN", "CFMH", "BDSN"],
  "drive-yes-tonight": ["BDMN", "BFMN", "CFSH", "CDSH"],
};
const oldOrder = (qs: Question[]): Question[] =>
  qs.map((q) => (OLD_ORDER[q.scenario] ? { ...q, options: OLD_ORDER[q.scenario].map((t) => q.options.find((o) => o.type === t)!) } : q));

// ------------------------------------------------------------ people --
const primacy = (base: Answerer, rate = 0.15): Answerer => (q, rng, i, total, canPass) => (rng() < rate ? 0 : base(q, rng, i, total, canPass));
const fatigued = (truth: TypeCode): Answerer => (q, rng, i, total, canPass) => personaAnswerer(truth, 0.75 - (0.2 * i) / Math.max(1, total - 1))(q, rng, i, total, canPass);
const gamer = (truth: TypeCode, rate = 0.5): Answerer => (q, rng, i, total, canPass) => (rng() < rate ? personaAnswerer(TARGET, 1)(q, rng, i, total, canPass) : personaAnswerer(truth, 0.7)(q, rng, i, total, canPass));

// ------------------------------------------------------------ Bayesian model --
function likelihood(q: Question, pick: number, t: string): number {
  const w = q.options.map((o) => Math.exp(BETA * shared(o.type, t)));
  return w[pick] / w.reduce((a, b) => a + b, 0);
}
function posterior(qs: Question[], answers: Answers): number[] {
  const logp = TYPE_CODES.map(() => 0);
  for (const q of qs) {
    const a = answers[q.id];
    if (typeof a !== "number" || a === NONE) continue;
    TYPE_CODES.forEach((t, k) => (logp[k] += Math.log(likelihood(q, a, t))));
  }
  const m = Math.max(...logp);
  const p = logp.map((x) => Math.exp(x - m));
  const s = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / s);
}
const entropy = (p: number[]) => -p.reduce((t, x) => t + (x > 0 ? x * Math.log2(x) : 0), 0);
const mapType = (p: number[]) => TYPE_CODES[p.indexOf(Math.max(...p))];
/** The follow-up whose answer is expected to leave the least uncertainty about the type. */
function bestByInfo(qs: Question[], answers: Answers, pool: Question[], skip: Set<string>): Question | undefined {
  const prior = posterior(qs, answers);
  let best: Question | undefined;
  let bestH = Infinity;
  for (const f of pool) {
    if (skip.has(f.scenario)) continue;
    let h = 0;
    f.options.forEach((_, o) => {
      const po = TYPE_CODES.reduce((t, ty, k) => t + prior[k] * likelihood(f, o, ty), 0);
      const post = TYPE_CODES.map((ty, k) => prior[k] * likelihood(f, o, ty));
      const s = post.reduce((a, b) => a + b, 0);
      h += po * entropy(post.map((x) => x / s));
    });
    if (h < bestH) [bestH, best] = [h, f];
  }
  return best;
}

// ------------------------------------------------------------ runs --
type Tally = { live: number; bayes: number; bayesInfo: number; target: number; bLetter: number; n: number };

function run(label: string, who: (k: number) => { answerer: Answerer; truth?: TypeCode }, order: "new" | "old" = "new"): Tally {
  const rng: Rng = createRng(`bias:${label}:${order}`);
  const t: Tally = { live: 0, bayes: 0, bayesInfo: 0, target: 0, bLetter: 0, n };
  for (let k = 0; k < n; k++) {
    const spec = sessionSpec(k);
    const base = generateSession({ seed: spec.seed, personal: spec.personal, month: spec.month });
    const qs = order === "old" ? oldOrder(base) : base;
    const pool = followUpQuestions(spec.personal);
    const { answerer, truth } = who(k);
    const answers = answerAll(qs, answerer, rng);
    // Live: the curated follow-up rule, then the live scoring.
    const plan = followUpPlan(qs, answers, pool).map((i) => pool[i]);
    const live = { ...answers };
    plan.forEach((q, j) => (live[q.id] = answerer(q, rng, qs.length + j, qs.length + plan.length, true)));
    const liveType = outcomeOf([...qs, ...plan], live).type;
    // Bayesian scoring on the same answers.
    const bayesType = mapType(posterior([...qs, ...plan], live));
    // Bayesian with information-gain follow-ups: same number of follow-ups as the live rule.
    const info = { ...answers };
    const asked: Question[] = [];
    const skip = new Set(qs.map((q) => q.scenario));
    for (let j = 0; j < plan.length; j++) {
      const f = bestByInfo([...qs, ...asked], info, pool, skip);
      if (!f) break;
      skip.add(f.scenario);
      info[f.id] = answerer(f, rng, qs.length + j, qs.length + plan.length, true);
      asked.push(f);
    }
    const infoType = mapType(posterior([...qs, ...asked], info));
    if (truth) {
      if (liveType === truth) t.live += 1;
      if (bayesType === truth) t.bayes += 1;
      if (infoType === truth) t.bayesInfo += 1;
    }
    if (liveType === TARGET) t.target += 1;
    if (liveType[0] === "B") t.bLetter += 1;
  }
  return t;
}

const truthOf = (k: number) => TYPE_CODES[k % 16];
console.log(`# Quiz bias benchmark (${n.toLocaleString("en-US")} simulated people per row, 95% intervals)\n`);

console.log("## 1. Answer order: people who tap the top answer more\n");
console.log("| Person | Order | Own type (live) | Social (B) results |");
console.log("|---|---|---|---|");
for (const order of ["old", "new"] as const) {
  const p = run("primacy", (k) => ({ answerer: primacy(personaAnswerer(truthOf(k), 0.7)), truth: truthOf(k) }), order);
  console.log(`| Real + taps the top answer 15% | ${order} | ${ci(p.live, n)} | ${ci(p.bLetter, n)} |`);
}
for (const order of ["old", "new"] as const) {
  const p = run("primacy-random", () => ({ answerer: primacy(randomAnswerer, 0.25) }), order);
  console.log(`| No preference + taps the top 25% | ${order} | n/a | ${ci(p.bLetter, n)} (50% is fair) |`);
}

console.log("\n## 2. Live scoring vs a Bayesian model\n");
console.log("| Person | Live (today) | Bayesian scoring | Bayesian + info-gain follow-ups |");
console.log("|---|---|---|---|");
const people: [string, (k: number) => { answerer: Answerer; truth: TypeCode }][] = [
  ["Real (best fit 70%)", (k) => ({ answerer: personaAnswerer(truthOf(k), 0.7), truth: truthOf(k) })],
  ["Noisy (best fit 50%)", (k) => ({ answerer: personaAnswerer(truthOf(k), 0.5), truth: truthOf(k) })],
  ["Taps the top answer 15%", (k) => ({ answerer: primacy(personaAnswerer(truthOf(k), 0.7)), truth: truthOf(k) })],
  ["Tires (75% → 55%)", (k) => ({ answerer: fatigued(truthOf(k)), truth: truthOf(k) })],
];
for (const [label, who] of people) {
  const r = run(label, who);
  console.log(`| ${label} | ${ci(r.live, n)} | ${ci(r.bayes, n)} | ${ci(r.bayesInfo, n)} |`);
}

console.log("\n## 3. Game theory: can someone steer their result?\n");
const honest = run("honest", (k) => ({ answerer: personaAnswerer(truthOf(k), 0.7), truth: truthOf(k) }));
const gamed = run("gamer", (k) => ({ answerer: gamer(truthOf(k)), truth: truthOf(k) }));
console.log(`- Honest people who end up The Party Host (BFSN): ${ci(honest.target, n)} (1 in 16 is 6.3%)`);
console.log(`- People steering toward it half the time: ${ci(gamed.target, n)}`);
console.log(`- Their real type still shows: ${ci(gamed.live, n)}`);
