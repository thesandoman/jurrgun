/**
 * Builds the curated Bangkok Type question sets (design/reference/quiz-curated.md)
 * and writes them to src/vibe/curated-sets.ts. Run it again when the bank
 * grows, then read the result: the script keeps the rules, a person keeps
 * the sense (D23).
 *
 *   npx vite-node scripts/curate-quiz.ts            write src/vibe/curated-sets.ts
 *   npx vite-node scripts/curate-quiz.ts --print    print the sets, write nothing
 *
 * Each set is 16 questions in a fixed order. Each question shows two opposite
 * pairs of types (X, its opposite, Y, its opposite), so every letter has two
 * answers on each side and a pick votes on all four letters. Every type is
 * shown exactly 4 times and sits in each answer position about once. There
 * are 2 rhythm and 2 plan questions, 2 twin pairs at least 8 apart, 1 funny
 * and 1 or 2 personality questions where the bank has them (D32), and one
 * seasonal slot: the month picks its scenario, its answers' types stay.
 *
 * Deterministic: the same bank always gives the same sets.
 */
import { writeFileSync } from "node:fs";
import { SEGMENT_PROMPTS } from "../src/vibe/bank/segment-prompts";
import { createRng, shuffle, type Rng } from "../src/vibe/rng";
import { oppositeCode, SCENARIOS, TYPE_CODES, type Context, type Scenario, type TypeCode } from "../src/vibe/scenarios";
import type { Segment } from "../src/domain/segment";
import type { Question } from "../src/vibe/generator";
import { answerAll, outcomeOf, personaAnswerer, randomAnswerer } from "../test/quiz-sim";

const SEGMENTS: Segment[] = ["local", "newcomer", "international"];
const SIZE = 16;
/** Each opposite pair is shown in this many questions: 16 questions x 2 pairs / 8 pairs. */
const PAIR_USES = 4;
const TWIN_GAP = 8;
/** The least of each context among the 12 core questions. */
const CORE_MIN: Partial<Record<Context, number>> = { friends: 2, family: 2, date: 2, solo: 1, coworkers: 1, party: 1, meetup: 2 };
/** Up to this many core slots per segment may use a scenario told for that segment. */
const SEGMENT_SLOTS = 4;
const FOLLOW_UPS = 4;
/** Candidate sets tried; the one that clears the balance bars by the most is kept. */
const CANDIDATES = Number(process.env.CANDIDATES ?? 30);

/** The 8 opposite pairs, e.g. [BDSH, CFMN], keyed by their B-side code. */
const PAIRS: [TypeCode, TypeCode][] = TYPE_CODES.filter((c) => c[0] === "B").map((c) => [c, oppositeCode(c)]);

export type Entry = { scenario: string; codes: TypeCode[]; twin?: string };

// ------------------------------------------------------------ helpers --

const forAll = (s: Scenario) => !s.set && !s.audience && (s.context !== "date" || !!s.friend);
const forSegment = (s: Scenario, seg: Segment) => !s.set && (!s.audience || s.audience.includes(seg)) && (s.context !== "date" || !!s.friend);
const hasMotives = (s: Scenario) => TYPE_CODES.every((c) => !!s.answers[c].motive);
const toldFor = (s: Scenario, seg: Segment) => !!s.audience?.includes(seg) || !!SEGMENT_PROMPTS[s.id]?.[seg];

const STOCK = /\b(usual|regular|never|new|first time|none of you|neither of you|same)\b/i;

/** Lower is better: answers of 6 to 12 words that show their letters through a detail (quiz-review rules 1 and 2). */
function answerCost(sc: Scenario, code: TypeCode): number {
  const en = (sc.friend?.answers?.[code] ?? sc.answers[code]).en;
  const words = en.split(/\s+/).filter(Boolean).length;
  return Math.max(0, words - 12) + Math.max(0, 6 - words) + (STOCK.test(en) ? 1.5 : 0);
}

const pairCost = (sc: Scenario, p: number) => answerCost(sc, PAIRS[p][0]) + answerCost(sc, PAIRS[p][1]);

/** +1 / -1 per letter of a pair's B-side code (B is always +1). */
const SIGNS = PAIRS.map(([b]) => [0, 1, 2, 3].map((k) => (b[k] === "BDMN"[k] ? 1 : -1)));
const SPLITS = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
];

/**
 * How unevenly someone answering at random would land on the 16 types. Each
 * letter, and each two letters together, already even out when every pair is
 * shown 4 times. What's left is two letter-pairs moving together inside a
 * question (BD with MN, BM with DN, BN with DM): for each split, the questions
 * whose two opposite pairs agree on both halves push one way or the other,
 * and those pushes must cancel across the set.
 */
function randomTilt(a: [number, number][]): number {
  let tilt = 0;
  for (const [k, l, m, n] of SPLITS) {
    let sum = 0;
    for (const [x, y] of a) {
      const c1 = (SIGNS[x][k] * SIGNS[x][l] + SIGNS[y][k] * SIGNS[y][l]) / 2;
      const c2 = (SIGNS[x][m] * SIGNS[x][n] + SIGNS[y][m] * SIGNS[y][n]) / 2;
      sum += c1 * c2;
    }
    tilt += Math.abs(sum);
  }
  return tilt;
}

// -------------------------------------------------------------- build --

type Slot = { sc: Scenario; pairs: [number, number]; season?: boolean };

/** Choose the 16 scenarios: twins, flavours, funny and personality, then core to the context minimums. */
function pickScenarios(rng: Rng): { list: Scenario[]; season: Scenario } {
  const list: Scenario[] = [];
  const used = new Set<string>();
  const take = (sc: Scenario) => {
    list.push(sc);
    used.add(sc.id);
  };
  // Two twin pairs, all year, for everyone. Date-moment twins last: their friend wording is the one most people read.
  const twins = shuffle(rng, SCENARIOS.filter((s) => s.kind === "core" && s.twin && s.id < s.twin && forAll(s) && !s.months))
    .map((s) => [s, SCENARIOS.find((x) => x.id === s.twin)] as const)
    .filter((x): x is readonly [Scenario, Scenario] => !!x[1] && forAll(x[1]) && !x[1].months)
    .sort(([a], [b]) => (a.context === "date" ? 1 : 0) - (b.context === "date" ? 1 : 0))
    .slice(0, 2);
  for (const [a, b] of twins) {
    take(a);
    take(b);
  }
  // Rhythm and plan: not date moments (the core already has two), and not two of the same context.
  for (const kind of ["rhythm", "plan"] as const) {
    const pool = shuffle(rng, SCENARIOS.filter((s) => s.kind === kind && forAll(s) && !s.months)).sort((a, b) => (a.context === "date" ? 1 : 0) - (b.context === "date" ? 1 : 0));
    for (const sc of pool) {
      if (list.filter((x) => x.kind === kind).length === 2) break;
      if (!list.some((x) => x.kind !== "core" && x.context === sc.context)) take(sc);
    }
  }
  const core = shuffle(rng, SCENARIOS.filter((s) => s.kind === "core" && forAll(s) && !s.twin && !s.months));
  // D32, D37: one warm funny moment, and a personality question whose answers carry motives, so
  // the "what moves you" sentence always has picks to work from. More personality may follow.
  core.filter((s) => s.mood === "funny").slice(0, 1).forEach(take);
  core.filter((s) => s.mood === "personality" && hasMotives(s) && !used.has(s.id)).slice(0, 1).forEach(take);
  const counts = () => {
    const m: Partial<Record<Context, number>> = {};
    for (const s of list) if (s.kind === "core") m[s.context] = (m[s.context] ?? 0) + 1;
    return m;
  };
  // The other 15 meet every context minimum on their own: the 16th is the seasonal slot, whose
  // scenario the month replaces (with a full calendar, every month).
  const BEFORE_SEASON = SIZE - 1;
  for (const [ctx, min] of Object.entries(CORE_MIN) as [Context, number][]) {
    for (const sc of core.filter((s) => s.context === ctx && !used.has(s.id))) {
      if ((counts()[ctx] ?? 0) >= min || list.length >= BEFORE_SEASON) break;
      take(sc);
    }
  }
  for (const sc of core) {
    if (list.length >= BEFORE_SEASON) break;
    if (!used.has(sc.id)) take(sc);
  }
  // The seasonal slot's own scenario only shows in a month with nothing in season: an everyday
  // meetup (the calendar prefers meetups too), never a date moment.
  const fits = (sc: Scenario) => sc.kind === "core" && sc.mood === "everyday" && sc.context !== "date" && !used.has(sc.id);
  const season = core.find((sc) => fits(sc) && sc.context === "meetup") ?? core.find(fits)!;
  take(season);
  return { list, season };
}

/**
 * Two opposite pairs per question, each pair in exactly PAIR_USES questions,
 * twins sharing theirs: the cheapest answers, and the same two pairs together
 * as rarely as possible.
 */
function assignPairs(rng: Rng, list: Scenario[]): [number, number][] {
  const twinOf = (k: number) => list.findIndex((s) => s.id === list[k].twin);
  // Units: a twin pair is one unit that uses its pairs twice.
  const units: number[][] = [];
  list.forEach((_, k) => {
    const t = twinOf(k);
    if (t < 0) units.push([k]);
    else if (k < t) units.push([k, t]);
  });
  const tokens = shuffle(
    rng,
    PAIRS.flatMap((_, p) => Array.from({ length: PAIR_USES }, () => p)),
  );
  // Start: deal tokens to units (twin units take each of their pairs twice).
  let best: [number, number][] | null = null;
  let bestCost = Infinity;
  const costOf = (a: [number, number][]) => {
    let c = 0;
    const combo = new Map<string, number>();
    a.forEach(([x, y], k) => {
      c += pairCost(list[k], x) + pairCost(list[k], y);
      const key = x < y ? `${x}-${y}` : `${y}-${x}`;
      combo.set(key, (combo.get(key) ?? 0) + 1);
      if (x === y) c += 1000;
    });
    // The same two pairs together twice is fine only for twins (they count once per twin pair).
    for (const [key, n] of combo) {
      const twinsHere = units.filter((u) => u.length === 2 && (() => { const [x, y] = a[u[0]]; return (x < y ? `${x}-${y}` : `${y}-${x}`) === key; })()).length;
      c += 6 * Math.max(0, n - 1 - twinsHere);
    }
    const uses = new Array(PAIRS.length).fill(0);
    for (const [x, y] of a) {
      uses[x] += 1;
      uses[y] += 1;
    }
    c += 1000 * uses.reduce((t, u) => t + Math.abs(u - PAIR_USES), 0);
    c += 20 * randomTilt(a);
    return c;
  };
  for (let attempt = 0; attempt < 60; attempt++) {
    const deck = shuffle(rng, tokens);
    const a: [number, number][] = new Array(list.length);
    // Twin units first, each drawing a distinct pair twice.
    const left = [...deck];
    const draw = (not?: number) => {
      const i = left.findIndex((p) => p !== not);
      return left.splice(i < 0 ? 0 : i, 1)[0];
    };
    for (const u of units.filter((x) => x.length === 2)) {
      const x = draw();
      const y = draw(x);
      // and their second copies
      left.splice(left.indexOf(x), 1);
      left.splice(left.indexOf(y), 1);
      for (const k of u) a[k] = [x, y];
    }
    for (const u of units.filter((x) => x.length === 1)) {
      const x = draw();
      a[u[0]] = [x, draw(x)];
    }
    // Improve: swap one pair between two single questions.
    let cost = costOf(a);
    for (let round = 0; round < 3000; round++) {
      const singles = units.filter((u) => u.length === 1).map((u) => u[0]);
      const k = singles[Math.floor(rng() * singles.length)];
      const m = singles[Math.floor(rng() * singles.length)];
      if (k === m) continue;
      const i = Math.floor(rng() * 2);
      const j = Math.floor(rng() * 2);
      const before = [a[k], a[m]] as const;
      const ak = [...a[k]] as [number, number];
      const am = [...a[m]] as [number, number];
      [ak[i], am[j]] = [am[j], ak[i]];
      a[k] = ak;
      a[m] = am;
      const now = costOf(a);
      if (now <= cost) cost = now;
      else [a[k], a[m]] = before;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = a.map((x) => [...x] as [number, number]);
    }
  }
  return best!;
}

/** Order the 16: twins 8 or more apart, flavour questions and contexts never back to back, a warm everyday start. */
function order(rng: Rng, slots: Slot[]): Slot[] {
  const cost = (o: Slot[]) => {
    let c = 0;
    for (let k = 1; k < o.length; k++) {
      const a = o[k - 1].sc;
      const b = o[k].sc;
      if (a.kind !== "core" && b.kind !== "core") c += 50;
      if (a.context === b.context) c += 10;
      if (o[k - 1].pairs.some((p) => o[k].pairs.includes(p))) c += 3;
    }
    o.forEach((s, k) => {
      const t = o.findIndex((x) => x.sc.id === s.sc.twin);
      if (t >= 0 && Math.abs(t - k) < TWIN_GAP) c += 1000;
    });
    const first = o[0].sc;
    if (first.kind !== "core" || first.mood !== "everyday" || !["friends", "solo", "meetup"].includes(first.context)) c += 20;
    if (o[0].season) c += 20;
    return c;
  };
  let best = slots;
  let bestCost = Infinity;
  for (let k = 0; k < 6000 && bestCost > 0; k++) {
    const o = shuffle(rng, slots);
    const c = cost(o);
    if (c < bestCost) {
      best = o;
      bestCost = c;
    }
  }
  return best;
}

/** A segment's set: the shared set with up to SEGMENT_SLOTS core slots swapped, in place, for scenarios told for that segment. */
function forSegmentSet(rng: Rng, shared: Slot[], seg: Segment): Slot[] {
  const slots = shared.map((s) => ({ ...s }));
  const used = new Set(slots.map((s) => s.sc.id));
  let swapped = slots.filter((s) => toldFor(s.sc, seg)).length;
  const candidates = shuffle(rng, SCENARIOS.filter((s) => s.kind === "core" && !s.twin && !s.months && forSegment(s, seg) && toldFor(s, seg) && !used.has(s.id)));
  for (const sc of candidates) {
    if (swapped >= SEGMENT_SLOTS) break;
    // The motives question and the funny one stay for everyone; others may be told for the segment.
    const k = slots.findIndex((s) => s.sc.kind === "core" && !s.sc.twin && !s.season && !hasMotives(s.sc) && s.sc.mood !== "funny" && s.sc.mood === sc.mood && s.sc.context === sc.context && !toldFor(s.sc, seg));
    if (k < 0) continue;
    slots[k] = { ...slots[k], sc };
    used.add(sc.id);
    swapped += 1;
  }
  return slots;
}

const PERMS = (() => {
  const out: number[][] = [];
  const go = (rest: number[], acc: number[]) => (rest.length ? rest.forEach((x, k) => go([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, x])) : out.push(acc));
  go([0, 1, 2, 3], []);
  return out;
})();

/** Answer orders for the whole set so each type sits in each position about once, and a pair's two halves aren't always side by side. */
function balancedOrders(rng: Rng, slots: Slot[]): TypeCode[][] {
  const count = new Map<string, number>();
  return slots.map((s) => {
    const codes = s.pairs.flatMap((p) => PAIRS[p]);
    const cost = (perm: number[]) => perm.reduce((t, c, pos) => t + (count.get(`${codes[c]}@${pos}`) ?? 0) ** 2, 0);
    const best = shuffle(rng, PERMS).sort((a, b) => cost(a) - cost(b))[0];
    best.forEach((c, pos) => count.set(`${codes[c]}@${pos}`, (count.get(`${codes[c]}@${pos}`) ?? 0) + 1));
    return best.map((c) => codes[c]);
  });
}

function toEntries(rng: Rng, slots: Slot[]): Entry[] {
  const orders = balancedOrders(rng, slots);
  return slots.map((s, k) => ({
    scenario: s.sc.id,
    codes: orders[k],
    ...(s.sc.twin && slots.some((x) => x.sc.id === s.sc.twin) ? { twin: s.sc.twin } : {}),
  }));
}

/** Month → scenario for the seasonal slot (core, for that segment, not already in the set). */
function calendar(slots: Slot[], seg: Segment): Record<number, string> {
  const used = new Set(slots.map((s) => s.sc.id));
  const out: Record<number, string> = {};
  for (let m = 1; m <= 12; m++) {
    const fit = SCENARIOS.filter((s) => s.kind === "core" && s.months?.includes(m) && forSegment(s, seg) && !used.has(s.id) && !s.twin)
      // Meeting people first (it's what Jurrgun is for, and festivals like Loy Krathong are meetups),
      // then the shortest season: a short season is the more special one.
      .sort((a, b) => (a.context === "meetup" ? 0 : 1) - (b.context === "meetup" ? 0 : 1) || a.months!.length - b.months!.length || a.id.localeCompare(b.id));
    if (fit[0]) out[m] = fit[0].id;
  }
  return out;
}

/** For Q7: a few more questions not in the set, together showing every opposite pair once. */
function followUps(rng: Rng, slots: Slot[], seg: Segment): Entry[] {
  const used = new Set(slots.map((s) => s.sc.id));
  const pool = shuffle(rng, SCENARIOS.filter((s) => s.kind === "core" && forSegment(s, seg) && !s.twin && !s.months && !used.has(s.id))).slice(0, FOLLOW_UPS);
  const pairs = shuffle(rng, PAIRS.map((_, p) => p));
  return pool.map((sc, k) => ({ scenario: sc.id, codes: shuffle(rng, [...PAIRS[pairs[2 * k]], ...PAIRS[pairs[2 * k + 1]]]) }));
}

// --------------------------------------------------------------- main --

/** The questions a set gives (types only; wording doesn't change scoring). */
function asQuestions(slots: Slot[]): Question[] {
  return toEntries(createRng("curate-quiz:v2:display"), slots).map((e) => {
    const sc = SCENARIOS.find((s) => s.id === e.scenario)!;
    return {
      id: `${sc.id}.${e.codes.join("")}`,
      format: "choice",
      scenario: sc.id,
      kind: sc.kind,
      context: sc.context,
      ...(e.twin ? { twin: e.twin } : {}),
      prompt: sc.prompt,
      options: e.codes.map((c) => ({ label: sc.answers[c], icon: "", type: c, district: sc.answers[c].district, ...(sc.answers[c].flavour ? { flavour: sc.answers[c].flavour } : {}) })),
      art: { tone: sc.tone, icons: [], seed: 0 },
    };
  });
}

/**
 * How far a set clears the balance bars of test/quiz-balance.test.ts, in the
 * worst of them (above 0 means every bar passes): real people get their own
 * type and find it among the near types shown, picky people still do, a
 * perfectly consistent person answers twins alike, and people with no
 * preference come out evenly.
 */
function clearance(slots: Slot[], runs = 50): number {
  const qs = asQuestions(slots);
  const rng = createRng("curate-quiz:eval");
  let own = 0, range = 0, picky = 0, cons = 0, consN = 0, n = 0;
  const random = new Map<string, number>();
  for (const truth of TYPE_CODES) {
    for (let r = 0; r < runs; r++) {
      const o = outcomeOf(qs, answerAll(qs, personaAnswerer(truth, 0.7), rng));
      if (o.type === truth) own += 1;
      if (o.range.includes(truth)) range += 1;
      if (outcomeOf(qs, answerAll(qs, personaAnswerer(truth, 0.7, 4), rng)).type === truth) picky += 1;
      const rt = outcomeOf(qs, answerAll(qs, randomAnswerer, rng)).type;
      random.set(rt, (random.get(rt) ?? 0) + 1);
      n += 1;
    }
    for (let r = 0; r < 10; r++) {
      const pf = outcomeOf(qs, answerAll(qs, personaAnswerer(truth, 1), rng));
      if (pf.consistency !== null) {
        cons += pf.consistency;
        consN += 1;
      }
    }
  }
  const expected = n / 16;
  const dev = Math.max(...TYPE_CODES.map((c) => Math.abs((random.get(c) ?? 0) - expected) / expected));
  return Math.min(own / n - 0.82, range / n - 0.95, picky / n - 0.78, (consN ? cons / consN : 1) - 0.8, 0.25 - dev);
}

export function curate() {
  // The shared set fixes the order and each question's pairs; each segment then swaps a
  // few scenarios in place, so most questions are the same for everyone. Several candidate
  // pairings are tried, and the one that clears the balance bars by the most is kept.
  const rng = createRng("curate-quiz:v2");
  const { list, season } = pickScenarios(rng);
  let shared: Slot[] = [];
  let best = -Infinity;
  for (let k = 0; k < CANDIDATES; k++) {
    const r = createRng(`curate-quiz:v2:candidate:${k}`);
    const pairs = assignPairs(r, list);
    const candidate = order(
      r,
      list.map((sc, i) => ({ sc, pairs: pairs[i], ...(sc === season ? { season: true } : {}) })),
    );
    const c = clearance(candidate);
    if (c > best) {
      best = c;
      shared = candidate;
    }
  }
  console.error(`best candidate clears the balance bars by ${(100 * best).toFixed(1)} points`);
  const sets = {} as Record<Segment, { entries: Entry[]; season: number; calendar: Record<number, string>; followUps: Entry[] }>;
  for (const seg of SEGMENTS) {
    const r = createRng(`curate-quiz:v2:${seg}`);
    const slots = forSegmentSet(r, shared, seg);
    const entries = toEntries(createRng("curate-quiz:v2:display"), slots);
    sets[seg] = { entries, season: slots.findIndex((s) => s.season), calendar: calendar(slots, seg), followUps: followUps(r, slots, seg) };
  }
  return sets;
}

{
  const sets = curate();
  if (process.argv.includes("--print")) {
    for (const [seg, set] of Object.entries(sets)) {
      console.log(`\n== ${seg} (seasonal slot ${set.season + 1}, calendar ${JSON.stringify(set.calendar)})`);
      set.entries.forEach((e, k) => {
        const sc = SCENARIOS.find((s) => s.id === e.scenario)!;
        const prompt = (sc.friend?.prompt ?? SEGMENT_PROMPTS[sc.id]?.[seg as Segment] ?? sc.prompt).en;
        console.log(`${String(k + 1).padStart(2)}. ${sc.id} [${sc.kind}/${sc.context}/${sc.mood}]${e.twin ? ` twin:${e.twin}` : ""}  ${prompt}`);
        for (const c of e.codes) console.log(`      ${c}${sc.answers[c].flavour ? (sc.answers[c].flavour === 1 ? " +" : " -") : "  "}  ${(sc.friend?.answers?.[c] ?? sc.answers[c]).en}`);
      });
    }
  } else {
    const body = `/**
 * The curated Bangkok Type question sets (design/reference/quiz-curated.md).
 * Generated by scripts/curate-quiz.ts from the bank, then read by a person.
 * Hand edits are fine if they keep the rules test/quiz-curated.test.ts checks.
 */
import type { CuratedSets } from "./curated";

export const CURATED_SETS: CuratedSets = ${JSON.stringify(sets, null, 2)};
`;
    writeFileSync(new URL("../src/vibe/curated-sets.ts", import.meta.url), body);
    console.log("wrote src/vibe/curated-sets.ts");
  }
}
