# BKK Social — Matching Experiment: Clearinghouse & Stable Matching

*2026-10-09 · Code: `src/match/` · Tests: `test/match.test.ts` · Reproduce: `npx vite-node scripts/match-sim.ts`*

## Question

Can a **clearinghouse** (a central, batch matching round, like medical residency matching) built on **stable matching** do better than random or greedy matching for BKK Social, while staying inclusive and fair?

## Two clearinghouses, two problems

| Where | Problem | Algorithm | Stability guarantee |
|---|---|---|---|
| **Small groups at an event** (§8.1) | Split 12–100 checked-in attendees into tables of 4–6 | Greedy seed, then steepest-ascent swaps until **exchange-stable** | No two people at different tables would *both* be happier swapping places |
| **Event Buddy** (§10.5) | Pair people who asked for a buddy, 48h before an event | **Irving's stable roommates** (1985), with a greedy fallback | No two people would both rather be paired with each other than with their assigned buddy |

**Why not Gale–Shapley?** Gale–Shapley needs two sides (classically "men" and "women"). BKK Social has one pool where anyone can be matched with anyone. That is the *roommates* problem, and solving it this way also makes matching **gender-neutral and inclusive by construction**. Gender identity is never an input to group or buddy matching. It is read only by the romance gate, and only after an event, when both people have already said yes to each other.

## Inputs and the score

Each person has a **6-category Bangkok Vibe vector** (non-political; see `vibe-quiz-v3.md`), optional **personal weights** saying how much each category matters to them, interest tags, and languages.

`score(a → b)` = how much **a** would enjoy **b**, from 0 to 1:

| Part | Weight | Meaning |
|---|---|---|
| Vibe similarity | 0.55 | Closeness of the two vectors, weighted by *a's* personal weights |
| Shared interests | 0.30 | Overlap of interest tags (Jaccard) |
| Novelty | 0.15 | Bonus for exactly **one** strong difference: "mostly alike, one thing to talk about" |

**Hard rules:**
- **Buddies** must share a language, be inside each other's private age range, have no block between them, and both have a non-romance intent.
- **Groups:** +1 friends stay together, blocked pairs are never seated together, and **nobody is left at a table where no one shares their language**. A swap that would strand a bystander is not allowed.

## Correctness checks

- Irving's algorithm agrees with **brute-force enumeration** on 300 random instances of 3–8 people. It finds a stable matching exactly when one exists, and that matching has zero blocking pairs.
- It reports the classic 4-person instance with no stable matching as unsolvable.
- The group clearinghouse is tested for: sizes within 4–6, everyone placed, +1 pairs kept together, no blocked pairs at a table, zero blocking swaps, and better results than random.

## Simulation set-up

Synthetic Bangkok populations with:
- **Personas:** 4 loose lifestyle personas plus noise.
- **Languages:** 60% Thai-only, 25% Thai + English, 15% English-only.
- **Ages:** 20–40, each with a private age range of ±5–10 years.
- **Intents:** 80% friends, 20% activity-buddy / explore.
- **+1 pairs:** about 10% of attendees came with a friend.
- **Preferences:** both equal weights and personal weights were tested.

Buddy results average 200 rounds per size. Group results average 50 rounds (20 at 96 attendees).

## Results: 1:1 Event Buddy

**Equal weights (everyone's preferences come from one shared score)**

| People | Stable matching exists | Method | Matched | Mean score | Worst-off | Blocking pairs |
|---|---|---|---|---|---|---|
| 40 | 100% | random | 96.0% | 0.511 | 0.275 | 110.07 |
| 40 | | greedy | 94.9% | 0.652 | 0.438 | **0.00** |
| 40 | | Irving | 94.9% | 0.652 | 0.438 | **0.00** |
| 80 | 100% | random | 98.2% | 0.511 | 0.245 | 450.08 |
| 80 | | greedy / Irving | 97.1% | 0.677 | 0.425 | **0.00** |

**Personal weights (asymmetric preferences, which is realistic)**

| People | Stable matching exists | Method | Matched | Mean score | Worst-off | Blocking pairs | Irving runtime |
|---|---|---|---|---|---|---|---|
| 20 | 97% | random | 92.4% | 0.503 | 0.293 | 26.20 | |
| 20 | | greedy | 90.9% | 0.622 | 0.441 | 0.59 | |
| 20 | | **Irving** (greedy fallback) | 91.2% | 0.621 | 0.437 | **0.04** | 0.05 ms |
| 40 | 93% | random | 96.3% | 0.511 | 0.259 | 110.06 | |
| 40 | | greedy | 95.1% | 0.652 | 0.414 | 1.54 | |
| 40 | | **Irving** (greedy fallback) | 95.0% | 0.653 | 0.420 | **0.15** | 0.19 ms |
| 80 | 90% | random | 98.1% | 0.508 | 0.230 | 454.94 | |
| 80 | | greedy | 97.3% | 0.677 | 0.389 | 4.00 | |
| 80 | | **Irving** (greedy fallback) | 97.1% | 0.677 | 0.399 | **0.54** | 0.93 ms |

## Results: small-group clearinghouse (tables of 4–6)

| Attendees | Method | Mean happiness | Worst-off | Blocking swaps left | Language-isolated | Time |
|---|---|---|---|---|---|---|
| 12 | random | 0.501 | 0.372 | 3.98 | 0.06 | 0.2 ms |
| 12 | greedy | 0.518 | 0.392 | 1.48 | 0.06 | 0.2 ms |
| 12 | **stable** | **0.534** | **0.412** | **0.00** | 0.02 | 0.3 ms |
| 24 | random | 0.507 | 0.297 | 25.14 | 0.26 | 0.6 ms |
| 24 | greedy | 0.547 | 0.390 | 6.94 | 0.04 | 0.7 ms |
| 24 | **stable** | **0.576** | **0.445** | **0.00** | **0.00** | 1.5 ms |
| 48 | random | 0.506 | 0.240 | 134.30 | 0.40 | 2.3 ms |
| 48 | greedy | 0.569 | 0.344 | 15.18 | 0.12 | 2.8 ms |
| 48 | **stable** | **0.597** | **0.420** | **0.00** | 0.02 | 10.4 ms |
| 96 | random | 0.502 | 0.086 | 598.05 | 1.15 | 9.8 ms |
| 96 | greedy | 0.591 | 0.334 | 32.70 | 0.10 | 11.8 ms |
| 96 | **stable** | **0.615** | **0.422** | **0.00** | **0.00** | 75.9 ms |

## Findings

1. **Random matching is clearly unfair.** At 96 attendees, a random split leaves about 600 swaps that both people involved would take. Its worst-placed person scores 0.09, against 0.42 for the stable split. Random seating is not a neutral default.
2. **For groups, the stable clearinghouse wins on every measure.** Against greedy it gives:
   - 3–5% higher average happiness;
   - a 5–26% better worst-placed attendee (the gain grows with event size);
   - zero blocking swaps at every size;
   - essentially no language-isolated attendees.
   It takes under 0.1 s even at 96 people, so it can run live when check-in closes.
3. **For buddies, the method only matters when preferences differ between people.** If everyone's preferences come from one shared score, the greedy "best pair first" rule is already stable. If people weigh categories differently, which is realistic, greedy leaves 0.6–4 blocking pairs per round and Irving's algorithm cuts that by about 85–95% at no cost to the average score. Pairs that are fair in this sense are pairs people are less likely to resent.
4. **A stable 1:1 matching doesn't always exist.** It failed in 3–10% of rounds, more often in larger pools. The greedy fallback handles these cases, and the rounds where it is needed are logged.
5. **A first version of the group swap search caused a fairness bug.** It allowed a swap that left a *third* person with nobody who spoke their language. Isolation rose from 0.10 to 0.25 people per round at 96 attendees. The guard against stranding bystanders brought it to 0. Lesson: group stability must include constraints that protect the people who are not making the swap.
6. **Matching takes a group from 0.50 to 0.62 average happiness, but the score weights are guesses.** The weights (0.55 / 0.30 / 0.15) and the novelty rule must be calibrated against real post-event ratings ("How was your table?") before anyone can claim the matching improves real experiences.

## Recommendation

- **Adopt the exchange-stable group clearinghouse for P0.** It is simple, fast, explainable and clearly better than both baselines. The host can still override it.
- **Adopt Irving's algorithm with a greedy fallback for Event Buddy in P1.**
- **Keep romance out of the algorithm.** It stays mutual post-event consent only, with the inclusive identity / "open to" gate.
- **Publish the fairness rule in plain language:** "We seat you so that no two people at different tables would both rather swap."

## Limitations and next experiments

- The populations are synthetic. Re-run on pilot data once there are 300 or more quiz results and post-event ratings.
- Learn the score weights from post-event "would meet again" ratings, using a simple logistic model kept as interpretable as the current one.
- Add a diversity metric (spread of vibe, age and language within each table) to the dashboard, to catch echo chambers.
- Try "popular-matching" and "rank-maximal" variants for buddies when a stable matching doesn't exist.
