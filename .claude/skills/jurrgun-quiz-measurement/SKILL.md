---
name: jurrgun-quiz-measurement
description: Check that Jurrgun's Bangkok Type quiz measures what it claims, with real people and not only simulations. Covers question-writing checks, a think-aloud test plan, per-question health from live answers (the "none of these" rate, agreement with the final type, time), "Feels like me?" totals, retake stability, and fairness across Thai/English readers and segments. Use for "is the quiz accurate", "validate the quiz", "which questions are weak", "quiz health", "test-retest", "fairness of the quiz", "think-aloud test", "pilot the quiz", or before rewriting curated questions. Not for writing new scenarios (src/vibe/bank/WRITING.md) or UI polish (jurrgun-ui).
---

# Bangkok Type quiz: measure it with real people

The quiz is 16 curated questions per segment (src/vibe/curated-sets.ts), each with two opposite pairs of type answers plus "None of these are me", then 1 or 2 curated follow-ups only when a letter is genuinely close (src/vibe/adaptive.ts). Simulations (scripts/quiz-sim.ts, scripts/quiz-followups-sim.ts) prove the design is fair to simulated people. This skill is about the evidence that only real members can give.

Adapted for Jurrgun from standard scale-development practice (AERA/APA/NCME Standards for Educational and Psychological Testing, 2014; DeVellis, *Scale Development*). The quiz is a type sorter with pick-one answers, not a Likert scale, so factor analysis and Cronbach's alpha don't apply directly; use the checks below instead.

## House rules (they override anything here)

- Read `design/reference/project-state.md`, `quiz-curated.md`, `quiz-review.md` and `thai-voice.md` first.
- **Privacy:** only totals, and only from 10 or more people (the City Pulse rule). Never show or export one member's answers. Nothing here is ever shown to members as a score (owner D26: no percentages, no fixed labels).
- **No randomisation** (D26): measurement must not change what members are asked.
- Design changes go to the owner as decision cards; plain bugs get fixed directly.

## 1. Question checks (before any question ships)

For each curated question and its four answers:

1. **One moment, one choice.** The prompt is a single concrete Bangkok situation. No double-barrelled prompts ("eat and then walk?"), no "always/never", no double negatives.
2. **Every type has a believable answer.** If one of the four reads as a stretch, the scenario is wrong; change the scenario, not the answer.
3. **The letter shows through a detail, never a stock word** (quiz-review rule 1; bank-rules caps usual/regular/never/new at 3 of 16).
4. **6 to 12 words, reads well alone** ("Why you got this" quotes picked answers).
5. **No answer is the obvious "good person" choice.** Social desirability skews the type: generous, healthy or cultured answers must be balanced across both sides of each letter.
6. **Thai written first, in its own voice**, with the same meaning as the English (two-way check by a native reader).
7. **Fair to everyone:** no answer needs money, a car, a partner, a family nearby or Thai fluency to be "you". Prices are rare in the bank (13 of 3,168 answers); keep it that way.

## 2. Think-aloud test (cognitive interviews)

5 to 8 people per round: Thai and foreign members, locals, newcomers and internationals, and at least one person who reads English as a second language. 20 minutes each, on their own phone.

- They take the quiz saying out loud what they think. Don't help.
- After each question, probe only where they hesitated:
  - "What does this question mean to you?"
  - "Which answer was closest, and why that one?"
  - "Was anything confusing, odd or uncomfortable?"
- At the result: "Does this feel like you? What's off?"
- Log one row per problem: question id, what they said, the type of problem (wording, missing answer, translation, social pressure), and a proposed fix.
- A question with the same problem from 2 or more people gets rewritten before the next round.

## 3. Question health from live answers

Totals per curated question (and per follow-up), from members who finished the quiz, shown only with 10 or more answers:

| Measure | Flag when | Usually means |
|---|---|---|
| "None of these" rate | above 20% | the answers don't fit real life for many people |
| Agreement: share of picks whose type shares 3+ letters with the person's final type | clearly below the other questions | the question measures something else, or reads differently than intended |
| Pick spread across the 4 answers | one answer above 60% | one answer is the "obvious" choice (social desirability) |
| Median time to answer | above 2x the quiz median | confusing or too long |
| Gap between Thai and English readers on any of the above | large and consistent | a translation problem, not a personality difference |

Use the flags to pick the next rewrites. Re-curate with scripts/curate-quiz.ts and re-run both simulations after any change.

## 4. "Does this feel like you?"

A one-tap answer on the result (Yes / Partly / Not really), stored with the result and counted per type, never shown per person. It's the closest thing to real accuracy:

- **Track:** the "Yes" share overall, per type, per segment and per language.
- **Act:** a type with a high "Not really" share points to its description, or to the questions that lead to it.
- **Compare:** set the "Yes" share against the simulation's own-type accuracy. A big gap means the simulated people don't behave like real ones; fix the simulator's answerers.

## 5. Retake stability

The questions are fixed, so a retake is a real re-measurement.

- **Measure:** among members who retake within 14 to 30 days, the share whose type stays the same, and how many letters changed. Changes on close letters are expected; changes on clear letters are not.
- **Expect:** about 70% or more keep the same type, and nearly all keep 3 or more letters.
- **Act on lower:** it means ambiguous questions; cross-check with the question health flags.
- **Where:** a retake keeps only the last type, its unsure letters and date (`blend.prev`, owner card 10-16, never a full history); the Retakes table on /admin/quiz-health counts it per segment, 10 or more only.

## 6. Fairness across groups

Compare locals, newcomers and internationals, and Thai and English readers, on:

- the "Feels like me" Yes share;
- the "none" rate;
- the type spread;
- the share with a "not sure yet" letter.

A group that consistently feels less seen, or passes more, needs its own segment wording or scenario swaps (curated-sets supports up to 4 swaps per segment).

## Output

A short report in `design/reference/quiz-measurement.md`: date, sample sizes, the flags table, think-aloud findings, and the proposed rewrites as decision cards for the owner.
