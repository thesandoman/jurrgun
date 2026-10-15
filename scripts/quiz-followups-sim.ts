/**
 * Q7: do the adaptive follow-ups help? The same simulated people take the
 * curated 16, then (only when a letter is unsure) 1 or 2 curated follow-ups.
 * Accuracy is reported with 95% confidence intervals (Wilson), as the owner
 * asked.
 *
 *   npx tsx scripts/quiz-followups-sim.ts          5,000 people
 *   npx tsx scripts/quiz-followups-sim.ts 20000
 */
import { closeLetters, followUpPlan } from "../src/vibe/adaptive";
import { followUpQuestions, generateSession, scoreSession, type Answers, type Question } from "../src/vibe/generator";

const outcomeUnsure = (qs: Question[], a: Answers) => scoreSession(qs, a).unsure;
import { createRng } from "../src/vibe/rng";
import { TYPE_CODES } from "../src/vibe/scenarios";
import { answerAll, answerOne, outcomeOf, personaAnswerer, randomAnswerer, sessionSpec, type Answerer } from "../test/quiz-sim";

const n = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 5000);

/** 95% Wilson interval for k successes out of n. */
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
  return `${pct(k / total)} (95% CI ${pct(lo)} to ${pct(hi)})`;
};

function run(label: string, who: (k: number) => { answerer: Answerer; truth?: string }) {
  const rng = createRng(`followups:${label}`);
  let before = 0;
  let after = 0;
  let inRangeBefore = 0;
  let inRangeAfter = 0;
  let unsureBefore = 0;
  let unsureAfter = 0;
  const asked = [0, 0, 0];
  let questions = 0;
  for (let k = 0; k < n; k++) {
    const spec = sessionSpec(k);
    const qs = generateSession({ seed: spec.seed, personal: spec.personal, month: spec.month });
    const fus = followUpQuestions(spec.personal);
    const { answerer, truth } = who(k);
    const answers: Answers = answerAll(qs, answerer, rng);
    const o1 = outcomeOf(qs, answers);
    const plan = followUpPlan(qs, answers, fus);
    asked[plan.length] += 1;
    const extra = plan.map((i) => fus[i]);
    extra.forEach((q, j) => (answers[q.id] = answerOne(q, answerer, rng, qs.length + j, qs.length + extra.length, true)));
    const o2 = outcomeOf([...qs, ...extra], answers);
    questions += qs.length + extra.length;
    if (closeLetters(scoreSession(qs, answers).vector, outcomeUnsure(qs, answers)).length > 0) unsureBefore += 1;
    if (closeLetters(scoreSession([...qs, ...extra], answers).vector, outcomeUnsure([...qs, ...extra], answers)).length > 0) unsureAfter += 1;
    if (truth) {
      if (o1.type === truth) before += 1;
      if (o2.type === truth) after += 1;
      if (o1.range.includes(truth as never)) inRangeBefore += 1;
      if (o2.range.includes(truth as never)) inRangeAfter += 1;
    }
  }
  console.log(`\n### ${label} (${n.toLocaleString("en-US")} people)\n`);
  if (!label.startsWith("No preference")) {
    console.log(`- Own type after the 16: ${ci(before, n)}`);
    console.log(`- Own type after follow-ups: **${ci(after, n)}**`);
    console.log(`- Own type within the near types shown: ${ci(inRangeBefore, n)} → **${ci(inRangeAfter, n)}**`);
  }
  console.log(`- A letter shown as "not sure yet" (genuinely close): ${pct(unsureBefore / n)} → ${pct(unsureAfter / n)}`);
  console.log(`- Follow-ups asked: none ${pct(asked[0] / n)}, one ${pct(asked[1] / n)}, two ${pct(asked[2] / n)}; ${(questions / n).toFixed(2)} questions on average (16 to 18)`);
}

run("A real person (best fit 70% of the time)", (k) => {
  const truth = TYPE_CODES[k % 16];
  return { answerer: personaAnswerer(truth, 0.7), truth };
});
run("A noisy person (best fit 50% of the time)", (k) => {
  const truth = TYPE_CODES[k % 16];
  return { answerer: personaAnswerer(truth, 0.5), truth };
});
run("No preference (random answers)", () => ({ answerer: randomAnswerer }));
