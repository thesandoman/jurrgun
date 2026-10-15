# Bangkok Type quiz: one curated question set (design, D26 and D27)

*Q5 chat, 2026-10-15. Approved by the owner (D29), with one change after "None of these" landed: opposite pairs, not two-letter questions. This is what's built. It builds on [quiz-blueprint.md](quiz-blueprint.md) and [quiz-review.md](quiz-review.md).*

## What the owner asked for (D26)

- No randomisation: everyone in a segment gets the same questions in the same order, so a retake shows real change and not a different draw.
- About 15 questions, at most 4 answers each, plus "none of these", which never counts toward the type.
- Plain scenarios only. Keep segment flavour, the date-moment wordings (friend or 💘), in-season questions, and the 💘 and Table Host style sets.
- Keep the 82% balance bar. Q7's adaptive follow-ups add 1 or 2 questions only when a result is unsure.

## The measurement that shapes everything

I simulated fixed sets with the balance simulator's people: personas pick their best answer 70% of the time; when nothing fits, they say "none" half the time. Today's scoring was used, unchanged.

| Fixed set | Own type | Own type within the near types shown | Four letters right |
|---|---|---|---|
| 20 questions × 6 answers (today's shape) | 86% | 99% | 98% |
| 16 × 4 | 55% | 89% | 89% |
| 15 × 4 | 53% | 86% | 87% |

At 15 × 4 the letters are still mostly right (87%), but the headline type is right only half the time. A short quiz leaves most letters within the margin of error. When that happens, `typeOf` picks the headline type by **affinity**: how often each type was picked when shown. With 4 answers, each type is shown only 3 or 4 times, so affinity is mostly noise.

**Fix:** read the headline type from the letters (the sign of each letter's score). Use affinity only to break an exact tie. With that rule, a letter tally of the same people gives:

| 4-answer design | 12 questions | 15 | 16 | 18 |
|---|---|---|---|---|
| A. Two opposite pairs per question (today's rule, X, its opposite, Y, its opposite) | 81% | 87% | 89% | 91% |
| B. **Two-letter questions** (below) | 84% | **91%** | **91%** | 96% |

These are tally numbers. The real simulator run happens once it's built, and the 82% bar is checked there.

## What's built

### 1. Sixteen questions, two opposite pairs each

- **Each question shows two opposite pairs of types:** X, its opposite, Y and its opposite. So every letter has two answers on each side, and a pick votes on all four letters.
- **16 questions × 2 pairs = 32:** each of the 8 opposite pairs appears in exactly 4 questions, so **every type is shown exactly 4 times** and sits in each answer position about once.
- **The mix:** 12 core, 2 rhythm and 2 plan questions, with rhythm and plan never on date moments. 2 twin pairs, at least 8 apart, show the same types.
- **D32:** 1 funny question (once the bank has funny scenarios) and 1 or 2 personality questions.
- **Every answer is still hand-written,** one of the scenario's 16, so the bank and its checks don't change.

**Why not two-letter questions** (the owner's first pick)? Once "None of these" was live, a two-letter question meant all four answers shared two letters. If those weren't you, nothing fit, and passing threw the vote away:

| 16 × 4, simulated people | Two-letter | Opposite pairs |
|---|---|---|
| Pass only when nothing fits | 90.7% | 87.6% |
| Pass when two letters are off | 86.0% | 91.3% |
| Pass unless their own type is shown | **56.2%** | **87.7%** |

### 2. One set per segment, built once and stored

- `src/vibe/curated-sets.ts` holds three ordered sets, **local, newcomer and international**. Each is 16 `{ scenario, codes, twin? }` entries, plus a seasonal slot with its calendar and Q7's follow-ups.
- **What the segments share:** they share the order and every question's pairs. A segment swaps up to 4 core scenarios in place for ones told for it (its `audience` scenarios or its prompt versions), so at least 12 questions are the same for everyone.
- **`scripts/curate-quiz.ts` builds the sets.** It picks the scenarios, then tries 30 pairings and keeps the one that clears the balance bars by the most, measured with the same simulated people as the balance test. It orders the questions (twins apart, no flavour or context back to back, a warm everyday start) and balances answer positions.
  - It also **cancels the random-answer tilt**: the questions whose two pairs agree on both halves of a letter split (BD with MN, BM with DN, BN with DM) must cancel across the set. Without that, someone answering at random lands on some types far more than others, even though each letter is even.
- **A person reads the result** (D23): the script keeps the rules, a person keeps the sense. Re-run it when the bank grows.

### 3. What changes per member (wording only, never the set)

| Input | Effect |
|---|---|
| Segment | which of the three sets (anyone with no Bangkok story yet gets local) |
| 💘 Open to something more | date moments read as dates; everyone else reads the friend wording (D20) |
| English reader without Thai | local words explained (`plain-english.ts`) |
| Table Host | 2 fixed "how you host" questions after the 16 |
| 💘 | 4 fixed "how you date" questions after the 16, one per dimension |
| Month | **one seasonal slot**: a calendar maps the month to an in-season scenario (meetups first, then the shortest season), and its answers' types stay the same all year. The quiz seed carries the month, so a form sent after the month turns is "expired" rather than scored against other questions |

**Dropped:** the home-district lean and avoiding scenarios already seen. A retake asks the same questions on purpose.

### 4. "None of these"

- Every question needs a response, a pick or "None of these" (`a{i}=none`, as review 6 to 8 landed). A blank question comes back to be answered.
- "None" is no vote, and there's no cap.
- At least one real pick is needed. Under 10 picks, the result is saved and says plainly that it's a rough start (`ROUGH_START`; the count is kept in the result as `answered`).

### 5. Scoring

- **The headline type is the side each letter leans to,** unsure or not. Affinity (which types were picked) only settles a letter that sits exactly in the middle.
- **An exact tie** (8 and 8) leans by a hair to one of the person's latest answers: B/C to the last answer, D/F to the one before, and so on. One pick votes on all four letters, so reusing the same pick for every tied letter would favour that pick's types.
- **The margin of error is 95%** (z 1.96, D28): a letter is settled only beyond it. Q7 asks a follow-up when one isn't.
- Twins and consistency work as before. Saved results stay valid.

### 6. For Q7

`followUpQuestions(personal)` returns 4 curated questions not in the member's set, together showing every opposite pair once. Ask 1 or 2 only when a letter is unsure (D34 caps the quiz at 18). They append after the 16, before the style questions.

### 7. Results (5,000 simulated people over every set and month)

| | Result | Bar |
|---|---|---|
| Real people get their own type (70% best answer) | 89.5% | 82% |
| Own type among the near types shown | 96.8% | 95% |
| Weakest type | 82% | 72% |
| Picky people (pass unless their type is shown) | 82% | 78% |
| A perfectly consistent person answers twins alike | 0.87 | 0.80 |
| People with no preference: worst type off the even share | 14% | under 25% |
| A consistent person with every letter settled at 95% | 81% (the rest have one open letter, which Q7 follows up) | |

## Owner decisions (D29)

1. The type comes from the letters; affinity only breaks exact ties.
2. **Opposite pairs** (changed from two-letter questions after "None of these" landed).
3. 16 questions.
4. No home-district lean, no seen-avoidance.
5. "None of these" with no cap; a rough-start note under 10 picks.

## Q7: follow-ups and the result (owner, 10-15)

- **Follow-ups only when a letter is genuinely close** (its lean under 0.2, about a 60/40 split or nearer): one curated follow-up per two close letters, at most 2, so 18 questions at most (`src/vibe/adaptive.ts`). They come from the member's own set (`followUpQuestions`) in a fixed order, so the same answers always get the same follow-ups.
- **Why not every letter inside the 95% margin?** With 16 questions, 98.6% of simulated real people have a letter inside it, so that trigger asked nearly everyone 2 more and was less accurate.
- **"Not sure yet" and the near types in the headline are shown only for close letters.** Q5's 95% margin still decides whether a letter can be claimed; a letter outside "close" reads "Leans …".
- **The result is a starting point:** "How you seem to enjoy Bangkok right now", the plain type name, "A starting point, not a label. People change; retake it any time." No percentages anywhere (blend tiles and letter meters use words). "Why you got this" quotes two of the person's own picks. "Not quite me?" is gone; Retake is one tap.

`npx tsx scripts/quiz-followups-sim.ts` (5,000 people, 95% Wilson intervals):

| Person | Own type after the 16 | After follow-ups | Follow-ups asked (none / one / two) | Questions on average |
|---|---|---|---|---|
| Real (best fit 70%) | 91.1% (90.2–91.8) | **93.0% (92.3–93.7)** | 60% / 39% / 1% | 16.4 |
| Noisy (best fit 50%) | 64.9% (63.5–66.2) | **67.8% (66.5–69.1)** | 24% / 69% / 7% | 16.8 |
| No preference | n/a | n/a | 4% / 59% / 37% | 17.3 |
