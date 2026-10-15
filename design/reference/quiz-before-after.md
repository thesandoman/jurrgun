# Bangkok Type quiz: before and after (D39)

*Q5 chat, the final quiz check (owner, D39). The same 5,000 simulated people per profile take the quiz as it was before the quiz work began (`1fe5922`) and as it is now (`ca650c1`). Each side uses its own question building and scoring; "after" asks Q7's follow-ups as the live quiz does. Built by `scripts/quiz-before-after.ts`.*

## Headline (overall mix)

| | Before | After |
|---|---|---|
| Questions asked (average) | 20.0 | 16.4 |
| Answers per question | 6 | 4 |
| Real people get their own type (best answer 70% of the time) | 86.3% (95% CI 85.3 to 87.2) | 92.4% (95% CI 91.7 to 93.1) |
| Weakest type | 84.3% (BFSH) | 90.1% (CFMN) |
| Picky people (pass unless their own type is shown) | 84.7% if scored, but 100.0% refused (under 14 answers) | 87.7% (95% CI 86.8 to 88.6), 0.0% refused, 100.0% shown as a rough start |
| Noisy people (best answer 50% of the time) | 61.0% (95% CI 59.7 to 62.4) | 67.7% (95% CI 66.4 to 68.9) |
| Own type within what the result shows | 99.3% (95% CI 99.1 to 99.5) | 97.5% (95% CI 97.1 to 97.9) |
| A perfectly consistent person answers twins alike | 0.89 | 1.00 |
| People with no preference: worst type off the even share | 10.7% | 13.3% |
| Results shown as a range of types | 76.5% | 39.7% |
| Rough-start results (under 10 real picks): real people | n/a | 0.0% |
| Rough-start results: picky people | n/a | 100.0% |

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
| Overall | Overall (the mix) | 86.3% → 92.4% | 84.3% → 90.1% | 84.7% → 87.7% | 61.0% → 67.7% | 99.3% → 97.5% | 0.89 → 1.00 | 10.7% → 13.3% | 20.0 → 16.4 | 76.5% → 39.7% | 0.0% |
| Segment | local | n/a → 92.1% | n/a → 89.4% | n/a → 87.6% | n/a → 67.4% | n/a → 97.4% | n/a → 1.00 | n/a → 11.4% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Segment | newcomer | n/a → 92.2% | n/a → 89.4% | n/a → 88.1% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 11.0% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Segment | international | n/a → 92.5% | n/a → 90.4% | n/a → 87.6% | n/a → 68.0% | n/a → 97.6% | n/a → 1.00 | n/a → 14.6% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| UI language | Thai | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| UI language | English, plain-English glosses | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Mode | Friends only | 86.7% → 92.4% | 84.6% → 90.1% | 84.4% → 87.7% | 61.4% → 67.7% | 99.4% → 97.5% | 0.89 → 1.00 | 11.4% → 13.3% | 20.0 → 16.4 | 76.4% → 39.7% | 0.0% |
| Mode | 💘 Open to something more | 86.0% → 92.4% | 83.4% → 90.1% | 84.1% → 87.7% | 60.6% → 67.7% | 99.4% → 97.5% | 0.89 → 1.00 | 12.6% → 13.3% | 20.0 → 16.4 | 77.3% → 39.7% | 0.0% |
| Table Host | Table Host | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Table Host | Member | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Quiz | Onboarding (no profile yet) | 86.9% → 92.1% | 83.1% → 89.4% | 84.6% → 87.6% | 59.5% → 67.4% | 99.6% → 97.4% | 0.88 → 1.00 | 13.0% → 11.4% | 20.0 → 16.4 | 77.6% → 39.7% | 0.0% |
| Quiz | Member | 86.3% → 92.4% | 84.3% → 90.1% | 84.7% → 87.7% | 61.0% → 67.7% | 99.3% → 97.5% | 0.89 → 1.00 | 10.7% → 13.3% | 20.0 → 16.4 | 76.5% → 39.7% | 0.0% |
| Season | Jan | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Feb | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Mar | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Apr | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | May | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Jun | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Jul | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Aug | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Sep | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Oct | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Nov | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |
| Season | Dec | n/a → 92.4% | n/a → 90.1% | n/a → 87.7% | n/a → 67.7% | n/a → 97.5% | n/a → 1.00 | n/a → 13.3% | n/a → 16.4 | n/a → 39.7% | 0.0% |

## Flags

- None: no profile is more than 3 points below the overall figure on own type, weakest type, picky, noisy or within shown.
