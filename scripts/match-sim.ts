/**
 * Matching experiment. Run with:  npx vite-node scripts/match-sim.ts
 *
 * Synthetic Bangkok populations (Thai-only, bilingual and English-only
 * speakers; personal category weights) are matched three ways and compared.
 * Prints Markdown tables for design/reference/matching-experiment.md.
 */
import { CATEGORIES, type Category } from "../src/vibe/content";
import { createRng, pick, shuffle, type Rng } from "../src/vibe/rng";
import { canPair, preferenceList, score, type Profile } from "../src/match/profile";
import { blockingPairs, greedyPairs, stableRoommates, type Preferences } from "../src/match/roommates";
import { formGroups, type GroupMethod } from "../src/match/clearinghouse";

const INTERESTS = ["food", "running", "art", "music", "pets", "books", "volunteering", "games", "cafés", "nightlife", "culture", "sports"];

/** Four loose "personas" plus noise, so the population has real structure. */
const PERSONAS: Record<Category, number>[] = [
  { energy: 0.7, explore: 0.6, rhythm: 0.7, motion: 0.2, plan: 0.6, culture: 0.6 },
  { energy: -0.6, explore: -0.3, rhythm: -0.6, motion: -0.5, plan: -0.6, culture: -0.5 },
  { energy: 0.2, explore: 0.5, rhythm: -0.5, motion: 0.8, plan: -0.2, culture: 0.1 },
  { energy: -0.2, explore: 0.3, rhythm: 0.3, motion: -0.6, plan: 0.4, culture: 0.7 },
];

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

function population(rng: Rng, n: number, personalWeights: boolean): Profile[] {
  return Array.from({ length: n }, (_, i) => {
    const base = pick(rng, PERSONAS);
    const vibe = Object.fromEntries(CATEGORIES.map((c) => [c, clamp(base[c] + (rng() - 0.5) * 0.9)])) as Record<Category, number>;
    const weights = personalWeights
      ? Object.fromEntries(CATEGORIES.map((c) => [c, 0.2 + rng() * 0.8]))
      : undefined;
    const r = rng();
    const languages = r < 0.6 ? ["th"] : r < 0.85 ? ["th", "en"] : ["en"];
    const age = 20 + Math.floor(rng() * 21);
    const slack = 5 + Math.floor(rng() * 6);
    return {
      id: `u${i}`,
      vibe,
      weights,
      interests: shuffle(rng, INTERESTS).slice(0, 2 + Math.floor(rng() * 4)),
      languages,
      age,
      ageRange: [Math.max(18, age - slack), age + slack] as [number, number],
      intents: rng() < 0.8 ? ["friends"] : ["activity-buddy", "explore"],
    } satisfies Profile;
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f = (x: number, d = 3) => x.toFixed(d);

// ------------------------------------------------------------ 1:1 buddies --

type PairStats = { matched: number[]; meanScore: number[]; minScore: number[]; blocking: number[] };
const emptyStats = (): PairStats => ({ matched: [], meanScore: [], minScore: [], blocking: [] });

function record(stats: PairStats, people: Profile[], prefs: Preferences, pairs: [string, string][]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const own: number[] = [];
  for (const [a, b] of pairs) {
    own.push(score(byId.get(a)!, byId.get(b)!), score(byId.get(b)!, byId.get(a)!));
  }
  // Unmatched people who COULD have been matched count as 0 for fairness.
  const matchable = people.filter((p) => (prefs.get(p.id) ?? []).length > 0).length;
  stats.matched.push((2 * pairs.length) / Math.max(1, matchable));
  stats.meanScore.push(mean(own));
  stats.minScore.push(own.length ? Math.min(...own) : 0);
  stats.blocking.push(blockingPairs(prefs, pairs).length);
}

function randomPairs(rng: Rng, people: Profile[]): [string, string][] {
  const order = shuffle(rng, people);
  const used = new Set<string>();
  const pairs: [string, string][] = [];
  for (const a of order) {
    if (used.has(a.id)) continue;
    const b = order.find((x) => !used.has(x.id) && x.id !== a.id && canPair(a, x));
    if (!b) continue;
    used.add(a.id);
    used.add(b.id);
    pairs.push([a.id, b.id]);
  }
  return pairs;
}

function buddyExperiment(n: number, trials: number, personalWeights: boolean) {
  const rng = createRng(`buddy:${n}:${personalWeights}`);
  const stats = { random: emptyStats(), greedy: emptyStats(), stable: emptyStats() };
  let stableExists = 0;
  let ms = 0;
  for (let t = 0; t < trials; t++) {
    const people = population(rng, n, personalWeights);
    const byId = new Map(people.map((p) => [p.id, p]));
    const prefs: Preferences = new Map(people.map((p) => [p.id, preferenceList(p, people)]));
    const mutual = (a: string, b: string) => {
      const pa = byId.get(a)!;
      const pb = byId.get(b)!;
      return canPair(pa, pb) ? (score(pa, pb) + score(pb, pa)) / 2 : null;
    };
    const greedy = greedyPairs(people.map((p) => p.id), mutual);
    const t0 = performance.now();
    const sr = stableRoommates(prefs);
    ms += performance.now() - t0;
    if (sr.stable) stableExists += 1;
    record(stats.random, people, prefs, randomPairs(rng, people));
    record(stats.greedy, people, prefs, greedy);
    // Production rule: use the stable matching if it exists, else fall back to greedy.
    record(stats.stable, people, prefs, sr.stable ? sr.pairs : greedy);
  }
  return { stats, stableRate: stableExists / trials, avgMs: ms / trials };
}

// ------------------------------------------------------------ groups -------

function groupExperiment(n: number, trials: number) {
  const rng = createRng(`groups:${n}`);
  const methods: GroupMethod[] = ["random", "greedy", "stable"];
  const acc = Object.fromEntries(methods.map((m) => [m, { mean: [] as number[], min: [] as number[], blocking: [] as number[], isolated: [] as number[], swaps: [] as number[], ms: [] as number[] }]));
  for (let t = 0; t < trials; t++) {
    const people = population(rng, n, true);
    // ~10% came with a +1 who asked to stay together.
    const keepTogether: [string, string][] = [];
    for (let i = 0; i + 1 < n; i += 10) keepTogether.push([`u${i}`, `u${i + 1}`]);
    for (const method of methods) {
      const t0 = performance.now();
      const r = formGroups(people, { seed: `${n}:${t}`, method, keepTogether });
      const a = acc[method];
      a.ms.push(performance.now() - t0);
      a.mean.push(r.metrics.meanUtility);
      a.min.push(r.metrics.minUtility);
      a.blocking.push(r.metrics.blockingSwaps);
      a.isolated.push(r.metrics.isolated);
      a.swaps.push(r.metrics.swapsMade);
    }
  }
  return acc;
}

// ------------------------------------------------------------ report -------

console.log("## 1:1 buddy pairing (Irving stable roommates vs baselines)\n");
for (const personalWeights of [false, true]) {
  console.log(`### ${personalWeights ? "Personal category weights (asymmetric preferences)" : "Equal weights (symmetric preferences)"}\n`);
  console.log("| People | Stable matching exists | Method | Matched | Mean score | Worst-off score | Blocking pairs | Irving time |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const n of [20, 40, 80]) {
    const { stats, stableRate, avgMs } = buddyExperiment(n, 200, personalWeights);
    for (const m of ["random", "greedy", "stable"] as const) {
      const s = stats[m];
      console.log(
        `| ${n} | ${m === "random" ? `${f(stableRate * 100, 1)}%` : ""} | ${m === "stable" ? "stable (greedy fallback)" : m} | ${f(mean(s.matched) * 100, 1)}% | ${f(mean(s.meanScore))} | ${f(mean(s.minScore))} | ${f(mean(s.blocking), 2)} | ${m === "stable" ? `${f(avgMs, 2)} ms` : ""} |`,
      );
    }
  }
  console.log("");
}

console.log("## Small-group clearinghouse (tables of 4–6)\n");
console.log("| Attendees | Method | Mean happiness | Worst-off | Blocking swaps left | Language-isolated | Swaps made | Time |");
console.log("|---|---|---|---|---|---|---|---|");
for (const n of [12, 24, 48, 96]) {
  const acc = groupExperiment(n, n >= 96 ? 20 : 50);
  for (const m of ["random", "greedy", "stable"] as const) {
    const a = acc[m];
    console.log(`| ${n} | ${m} | ${f(mean(a.mean))} | ${f(mean(a.min))} | ${f(mean(a.blocking), 2)} | ${f(mean(a.isolated), 2)} | ${f(mean(a.swaps), 1)} | ${f(mean(a.ms), 1)} ms |`);
  }
}
