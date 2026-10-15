/**
 * The final quiz check (owner, D39): the same simulated people take the quiz
 * as it was before the quiz work began and as it is now, per profile.
 *
 *   npx vite-node scripts/quiz-before-after.ts -- --root <checkout> --side before|after --out <file.json> [--n 5000]
 *   npx vite-node scripts/quiz-before-after.ts -- --report <before.json> <after.json>   writes design/reference/quiz-before-after.md
 *
 * Each side runs in its own checkout (baseline 1fe5922, final main) and uses
 * that version's own question building and scoring; "after" also asks Q7's
 * follow-ups exactly as the live quiz does. The answer models and the people
 * (seed, true type) live here, so they are identical for both sides.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Code = string;
type Q = { id: string; scenario: string; twin?: string; options: { type: Code }[] };
type Answers = Record<string, number>;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// ---------------------------------------------------------------- people --

/** A small seeded generator (mulberry32), so both sides draw exactly the same numbers. */
function rngOf(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CODES: Code[] = ["BDMN", "BDMH", "BDSN", "BDSH", "BFMN", "BFMH", "BFSN", "BFSH", "CDMN", "CDMH", "CDSN", "CDSH", "CFMN", "CFMH", "CFSN", "CFSH"];
const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;
/** "None of these are me" (after) or leaving it blank (before). */
const PASS = -1;

/**
 * A person of type `truth`: picks their best fit with probability p, else a
 * neighbouring answer (weights 1, 2, 4, 8 by letters shared). They pass when
 * even the best answer shares fewer than `fits` letters: 2 for real people,
 * 4 for a picky person who passes unless their own type is shown.
 */
function answerer(truth: Code, p: number, fits: number) {
  return (q: Q, rng: () => number): number => {
    const sc = q.options.map((o) => shared(o.type, truth));
    const top = Math.max(...sc);
    const ties = sc.map((s, j) => (s === top ? j : -1)).filter((j) => j >= 0);
    const best = ties[Math.floor(rng() * ties.length)];
    let pick = best;
    if (rng() >= p) {
      const idx = q.options.map((_, j) => j).filter((j) => j !== best);
      const w = idx.map((j) => 2 ** sc[j]);
      let r = rng() * w.reduce((t, x) => t + x, 0);
      pick = idx[idx.length - 1];
      for (let k = 0; k < idx.length; k++) {
        r -= w[k];
        if (r <= 0) {
          pick = idx[k];
          break;
        }
      }
    }
    return top < fits ? PASS : pick;
  };
}
const randomPick = (q: Q, rng: () => number) => Math.floor(rng() * q.options.length);

// --------------------------------------------------------------- profiles --

type Profile = { key: string; group: string; label: string; after?: (k: number) => { personal?: Record<string, unknown>; month?: number }; before?: (k: number) => { personal?: Record<string, unknown>; friendsOnly?: boolean } };

const SEGS = ["local", "newcomer", "international"] as const;
/** The overall mix: segments even, months cycling, a quarter 💘, plain English for international members, one in ten a Table Host. */
const mixAfter = (k: number, over: Record<string, unknown> = {}, month?: number) => {
  const segment = SEGS[k % 3];
  return {
    personal: { segment, openToMore: k % 4 === 3, explainLocal: segment === "international", tableHost: k % 10 === 9, ...over },
    month: month ?? 1 + (Math.floor(k / 3) % 12),
  };
};
let DISTRICT_KEYS: string[] = [];
/** Before: members with a home district, a quarter not friends-only (so date scenarios), like the mix above. */
const mixBefore = (k: number, friendsOnly?: boolean) => ({ personal: { district: DISTRICT_KEYS[k % DISTRICT_KEYS.length] }, friendsOnly: friendsOnly ?? k % 4 !== 3 });

const PROFILES: Profile[] = [
  { key: "overall", group: "Overall", label: "Overall (the mix)", after: (k) => mixAfter(k), before: (k) => mixBefore(k) },
  ...SEGS.map((s): Profile => ({ key: `seg-${s}`, group: "Segment", label: s, after: (k) => mixAfter(k, { segment: s, explainLocal: s === "international" }) })),
  { key: "ui-thai", group: "UI language", label: "Thai", after: (k) => mixAfter(k, { explainLocal: false }) },
  { key: "ui-english", group: "UI language", label: "English, plain-English glosses", after: (k) => mixAfter(k, { explainLocal: true }) },
  { key: "mode-friends", group: "Mode", label: "Friends only", after: (k) => mixAfter(k, { openToMore: false }), before: (k) => mixBefore(k, true) },
  { key: "mode-romance", group: "Mode", label: "💘 Open to something more", after: (k) => mixAfter(k, { openToMore: true }), before: (k) => mixBefore(k, false) },
  { key: "host-yes", group: "Table Host", label: "Table Host", after: (k) => mixAfter(k, { tableHost: true }) },
  { key: "host-no", group: "Table Host", label: "Member", after: (k) => mixAfter(k, { tableHost: false }) },
  { key: "quiz-onboarding", group: "Quiz", label: "Onboarding (no profile yet)", after: (k) => ({ personal: undefined, month: 1 + (Math.floor(k / 3) % 12) }), before: () => ({ personal: undefined, friendsOnly: false }) },
  { key: "quiz-member", group: "Quiz", label: "Member", after: (k) => mixAfter(k), before: (k) => mixBefore(k) },
  ...Array.from({ length: 12 }, (_, i): Profile => ({ key: `month-${i + 1}`, group: "Season", label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i], after: (k) => mixAfter(k, {}, i + 1) })),
];

// -------------------------------------------------------------------- run --

type Metrics = {
  people: number;
  own: number;
  worst: number;
  worstType: string;
  picky: number;
  noisy: number;
  near: number;
  consistency: number;
  spread: number;
  questions: number;
  roughStart: number;
  range: number;
  refused: number;
  pickyRefused: number;
  pickyRough: number;
};

async function run(root: string, side: "before" | "after", n: number) {
  const gen = await import(resolve(root, "src/vibe/generator.ts"));
  const arch = await import(resolve(root, "src/vibe/archetypes.ts"));
  const consts = await import(resolve(root, "src/lib/constants.ts"));
  DISTRICT_KEYS = consts.DISTRICTS.map((d: { value: string }) => d.value);
  const adaptive = side === "after" ? await import(resolve(root, "src/vibe/adaptive.ts")) : null;
  const MIN_BEFORE = 14;
  const out: Record<string, Metrics> = {};
  for (const prof of PROFILES) {
    const spec = side === "after" ? prof.after : prof.before;
    if (!spec) continue;
    const ownByType = new Map<string, [number, number]>();
    let own = 0, picky = 0, noisy = 0, near = 0, cons = 0, consN = 0, questions = 0, rough = 0, range = 0, refused = 0, pickyRefused = 0, pickyRough = 0;
    const random = new Map<string, number>();
    for (let k = 0; k < n; k++) {
      const truth = CODES[k % 16];
      const s = spec(k);
      const qs: Q[] = gen.generateSession({ seed: `d39-${k}`, ...s });
      const fus: Q[] = adaptive ? gen.followUpQuestions((s as { personal?: unknown }).personal) : [];
      /** One person's quiz, follow-ups included (after), as the live quiz scores it. */
      const take = (who: (q: Q, r: () => number) => number, seed: string) => {
        const rng = rngOf(seed);
        const answers: Answers = {};
        for (const q of qs) {
          const a = who(q, rng);
          if (a !== PASS) answers[q.id] = a;
        }
        let asked = qs;
        if (adaptive) {
          const plan: number[] = adaptive.followUpPlan(qs, answers, fus);
          const extra = plan.map((i) => fus[i]);
          for (const q of extra) {
            const a = who(q, rng);
            if (a !== PASS) answers[q.id] = a;
          }
          asked = [...qs, ...extra];
        }
        const r = gen.scoreSession(asked, answers);
        const t = arch.typeOf(r.vector, r.affinity, r.unsure);
        // What the result page shows besides the type: after, near types only when a letter is close (Q7); before, the range.
        const shownRange: string[] = adaptive ? (adaptive.closeLetters(r.vector, r.unsure).length > 0 ? t.range : [t.archetype]) : t.range;
        return { r, t, asked: asked.length, shownRange };
      };
      const pr = take(answerer(truth, 0.7, 2), `p:${k}`);
      const [h, m] = ownByType.get(truth) ?? [0, 0];
      ownByType.set(truth, [h + (pr.t.archetype === truth ? 1 : 0), m + 1]);
      if (pr.t.archetype === truth) own += 1;
      if (pr.shownRange.includes(truth)) near += 1;
      if (pr.shownRange.length > 1) range += 1;
      questions += pr.asked;
      if (side === "after" && pr.r.answered < 10) rough += 1;
      if (side === "before" ? pr.r.answered < MIN_BEFORE : pr.r.answered < 1) refused += 1;
      const pk = take(answerer(truth, 0.7, 4), `k:${k}`);
      if (pk.t.archetype === truth) picky += 1;
      if (side === "before" ? pk.r.answered < MIN_BEFORE : pk.r.answered < 1) pickyRefused += 1;
      if (side === "after" && pk.r.answered < 10) pickyRough += 1;
      if (take(answerer(truth, 0.5, 2), `n:${k}`).t.archetype === truth) noisy += 1;
      const pf = take(answerer(truth, 1, 2), `f:${k}`);
      if (pf.r.consistency !== null) {
        cons += pf.r.consistency;
        consN += 1;
      }
      const rd = take(randomPick, `r:${k}`).t.archetype;
      random.set(rd, (random.get(rd) ?? 0) + 1);
    }
    const rates = [...ownByType.entries()].map(([c, [h, m]]) => ({ c, v: h / m })).sort((a, b) => a.v - b.v);
    const even = n / 16;
    out[prof.key] = {
      people: n,
      own: own / n,
      worst: rates[0].v,
      worstType: rates[0].c,
      picky: picky / n,
      noisy: noisy / n,
      near: near / n,
      consistency: consN ? cons / consN : NaN,
      spread: Math.max(...CODES.map((c) => Math.abs((random.get(c) ?? 0) - even) / even)),
      questions: questions / n,
      roughStart: rough / n,
      range: range / n,
      refused: refused / n,
      pickyRefused: pickyRefused / n,
      pickyRough: pickyRough / n,
    };
    console.error(`${side} ${prof.key}: own ${(100 * out[prof.key].own).toFixed(1)}%`);
  }
  return out;
}

// ----------------------------------------------------------------- report --

function report(before: Record<string, Metrics>, after: Record<string, Metrics>): string {
  /** 95% Wilson interval, as D28 asks accuracy reports to carry. */
  const ci = (x: number, n: number) => {
    const z = 1.96;
    const d = 1 + (z * z) / n;
    const c = (x + (z * z) / (2 * n)) / d;
    const h = (z * Math.sqrt((x * (1 - x)) / n + (z * z) / (4 * n * n))) / d;
    return ` (95% CI ${(100 * (c - h)).toFixed(1)} to ${(100 * (c + h)).toFixed(1)})`;
  };
  const pct = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? "n/a" : `${(100 * x).toFixed(1)}%`);
  const num = (x: number | undefined, d = 2) => (x === undefined || Number.isNaN(x) ? "n/a" : x.toFixed(d));
  const o = after.overall;
  const FLAGGED = ["own", "worst", "picky", "noisy", "near"] as const;
  const flags: string[] = [];
  const rows = PROFILES.map((p) => {
    const a = after[p.key];
    const b = before[p.key];
    const low = a ? FLAGGED.filter((m) => o[m] - a[m] > 0.03) : [];
    if (low.length) flags.push(`**${p.group}: ${p.label}**: ${low.map((m) => `${m} ${pct(a[m])} vs ${pct(o[m])} overall`).join(", ")}`);
    const cell = (m: keyof Metrics, f = pct) => `${b ? f(b[m] as number) : "n/a"} → ${a ? f(a[m] as number) : "n/a"}${low.includes(m as (typeof FLAGGED)[number]) ? " ⚠️" : ""}`;
    return `| ${p.group} | ${p.label} | ${cell("own")} | ${cell("worst")} | ${cell("picky")} | ${cell("noisy")} | ${cell("near")} | ${cell("consistency", num)} | ${cell("spread")} | ${cell("questions", (x) => num(x, 1))} | ${cell("range")} | ${a ? pct(a.roughStart) : "n/a"} |`;
  });
  const b = before.overall;
  return `# Bangkok Type quiz: before and after (D39)

*Q5 chat, the final quiz check (owner, D39). The same 5,000 simulated people per profile take the quiz as it was before the quiz work began (\`1fe5922\`) and as it is now (\`${arg("--after-sha") ?? "main"}\`). Each side uses its own question building and scoring; "after" asks Q7's follow-ups as the live quiz does. Built by \`scripts/quiz-before-after.ts\`.*

## Headline (overall mix)

| | Before | After |
|---|---|---|
| Questions asked (average) | ${num(b.questions, 1)} | ${num(o.questions, 1)} |
| Answers per question | 6 | 4 |
| Real people get their own type (best answer 70% of the time) | ${pct(b.own)}${ci(b.own, b.people)} | ${pct(o.own)}${ci(o.own, o.people)} |
| Weakest type | ${pct(b.worst)} (${b.worstType}) | ${pct(o.worst)} (${o.worstType}) |
| Picky people (pass unless their own type is shown) | ${pct(b.picky)} if scored, but ${pct(b.pickyRefused)} refused (under 14 answers) | ${pct(o.picky)}${ci(o.picky, o.people)}, ${pct(o.pickyRefused)} refused, ${pct(o.pickyRough)} shown as a rough start |
| Noisy people (best answer 50% of the time) | ${pct(b.noisy)}${ci(b.noisy, b.people)} | ${pct(o.noisy)}${ci(o.noisy, o.people)} |
| Own type within what the result shows | ${pct(b.near)}${ci(b.near, b.people)} | ${pct(o.near)}${ci(o.near, o.people)} |
| A perfectly consistent person answers twins alike | ${num(b.consistency)} | ${num(o.consistency)} |
| People with no preference: worst type off the even share | ${pct(b.spread)} | ${pct(o.spread)} |
| Results shown as a range of types | ${pct(b.range)} | ${pct(o.range)} |
| Rough-start results (under 10 real picks): real people | n/a | ${pct(o.roughStart)} |
| Rough-start results: picky people | n/a | ${pct(o.pickyRough)} |

## How to read it

- **Before**: 20 random questions of 6 answers, a new draw each time, no "None of these" (a blank needed 14 answers to score), and a range shown whenever a letter was within a 90% margin.
- **After**: the same 16 curated questions for everyone in a segment, 4 answers each, "None of these" on every question, the type read from the letters, a 95% margin, and 1 or 2 follow-ups only when a letter is genuinely close (Q7). Near types show only for those close letters.
- **"Picky"** passes on every question that doesn't show their own type. Before, that left most of them under the 14 answers needed, so their quiz was refused; the before figure is what they would have got if it had been scored.
- **Profiles the old quiz didn't have** (segment, UI language, Table Host, season) are n/a on the before side. In the new quiz, UI language, 💘 mode and Table Host only change wording or add unscored style questions, so their numbers match the mix within chance; segment, onboarding and month change the questions themselves.

## What a simulator can and can't say

- **Simulated people choose by type, not by words.** In the new quiz, segments, months, UI language, 💘 mode and Table Host keep the same answer types in the same places and change only the scenario or its wording. So those profiles come out equal, or within a few tenths where the follow-ups differ by segment. That shows the scoring treats every profile alike. It can't show whether a newcomer finds their questions as easy to answer as a local does; only real answers can.
- **Within what the result shows** dips from 99.3% to 97.5% on purpose: the old quiz showed a range of types for three people in four (76.5%), the new one for about two in five (39.7%, owner D26 and Q7: near types only for genuinely close letters). A few people now see one type that isn't theirs instead of a range that included it.
- **Picky people** get their type more often now (87.7%), but with about 4 real picks out of 16 every one of them sees the rough-start note. That's the honest result for someone who passes on most questions.
- **No-preference spread** rises a little (10.7% to 13.3%), inside the 25% bar: with fixed sets there is less averaging over random draws.

## Every profile (before → after)

Flagged ⚠️: more than 3 points below the overall "after" figure.

| Group | Profile | Own type | Weakest type | Picky | Noisy | Within shown | Twin consistency | No-preference spread | Questions | Range shown | Rough start |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Flags

${flags.length ? flags.map((f) => `- ${f}`).join("\n") : "- None: no profile is more than 3 points below the overall figure on own type, weakest type, picky, noisy or within shown."}
`;
}

// ------------------------------------------------------------------- main --

if (process.argv.includes("--report")) {
  const i = process.argv.indexOf("--report");
  const before = JSON.parse(readFileSync(process.argv[i + 1], "utf8"));
  const after = JSON.parse(readFileSync(process.argv[i + 2], "utf8"));
  writeFileSync(new URL("../design/reference/quiz-before-after.md", import.meta.url), report(before, after));
  console.log("wrote design/reference/quiz-before-after.md");
} else {
  const root = arg("--root")!;
  const side = arg("--side") as "before" | "after";
  const n = Number(arg("--n") ?? 5000);
  const out = await run(root, side, n);
  writeFileSync(arg("--out")!, JSON.stringify(out, null, 1));
  console.log(`wrote ${arg("--out")}`);
}
