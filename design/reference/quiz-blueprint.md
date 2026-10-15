# Bangkok Type quiz: blueprint for a 200-scenario bank

*Quiz chat, 2026-10-15. Builds on [quiz-audit.md](quiz-audit.md). How to write one scenario is in `src/vibe/bank/WRITING.md`; this file says what the whole bank should become, the checklist every new scenario must pass, and how new question formats will score. Approvals go through the Branding chat (project-state.md).*

## 0. Owner decisions (2026-10-15, choice cards in the Quiz chat)

| # | Question | Owner's answer | What it means for the work |
|---|---|---|---|
| Q-D1 | Where do the 9 romance `date` scenarios go? | "flexible. if both users prefer to be friends" | Date scenarios stay, but must work both ways: as a date for members who chose Open to something more, and as a one-to-one friendship meetup when both people prefer to be friends. Q5 decides the mechanism (for example a friendship wording of each prompt, shown to friends-only members). **The Branding chat should confirm this reading.** |
| Q-D2 | Fix the two places in the wrong district now? | Fix both now | Done: Krung Thep Aphiwat moved to Chatuchak, Chokchai 4 to Lat Phrao; Bang Sue and Wang Thonglang got new answers (Bang Pho lanes, Gateway at Bangsue, the Rama VII riverside; Wat Thepleela and its Saen Saep pier) |
| Q-D3 | Which new formats? | "something BKK related + this or that + would you + letter association + more categories" | Build: a Bangkok-themed format (for example pick a place photo, a BTS or MRT stop, or a street-food dish), this or that (2.5 B), would you rather (2.5 F, the letter duel), letter association (pick the word, sound or picture you link with a moment; scores one letter, like F), and more question categories (new contexts and moments beyond the seven). The interactive formats chat builds them; scoring follows section 4 |
| Q-D4 | Use the new tags to choose questions? | Prefer in-season, Segment questions, Table Host set | All three approved: prefer in-season scenarios by `months`, show `audience` scenarios by the member's segment, and give Table Hosts the `table-host` set. Q5 wires them into the generator |

## 1. Why 200

Today a session draws 16 of 35 core scenarios, a friends-only member has 28 to draw from, and the 2 meetup questions come from a pool of 3. With 200 scenarios:

- a member can retake the quiz about ten times (eight if friends-only) before a core scenario repeats; the generator already avoids seen ones;
- the launch audience, the Rebuilder new to Bangkok (D6), finally sees moments written for them;
- each type's answers stop leaning on one place, so a result feels earned, not stereotyped;
- seasonal and funny questions keep the quiz worth sharing.

## 2. The target mix

**200 scenarios = 160 core + 20 rhythm + 20 plan.** Each has 16 answers, one per type: 3,200 answers.

### 2.1 By context

Meeting new people matters most (WRITING.md), so meetup grows the most. Coworkers stays a small slice but gets enough for variety.

| Context | Now (core / rhythm / plan) | Target core | Target rhythm | Target plan | Target total |
|---|---|---|---|---|---|
| meetup | 3 / 1 / 1 | 32 | 4 | 4 | 40 |
| friends | 7 / 1 / 1 | 28 | 3 | 3 | 34 |
| solo | 5 / 1 / 1 | 22 | 3 | 3 | 28 |
| date | 7 / 1 / 1 | 20 | 3 | 3 | 26 |
| family | 6 / 1 / 1 | 20 | 3 | 3 | 26 |
| coworkers | 3 / 0 / 0 | 20 | 2 | 2 | 24 |
| party | 4 / 1 / 1 | 18 | 2 | 2 | 22 |
| **Total** | **35 / 6 / 6** | **160** | **20** | **20** | **200** |

Date scenarios become the open-to-more set (2.3b), so every member has the 140 non-date core scenarios.

### 2.2 By mood (the field `mood`)

The brief calls this "tone"; in the code `tone` is already the postcard sky, so the field is `mood`.

| Mood | What it is | Now | Target | Example prompt |
|---|---|---|---|---|
| everyday | an ordinary week in Bangkok | 30 | 80 | "Your Tuesday lunch break is an hour long for once. You…" |
| landmark | the moment is about a famous place or view | 4 | 36 | "Someone hands you a free ticket to the top of MahaNakhon, tonight only. Who do you bring?" |
| seasonal | tied to a month or the weather; carries `months` | 4 | 30 | "Chinese New Year weekend in Yaowarat:" |
| funny | a small, true Bangkok absurdity; light, never mocking anyone | 0 | 24 | "The BTS stops between stations for ten minutes and nobody knows why. You…" |
| personality | about how you are, not where you go | 9 | 30 | "Your phone dies at 10 am on a free Saturday. The day turns into…" |

**Seasonal calendar:** at least two scenarios for every month, so any day of the year has an in-season question. Ideas: Chinese New Year and Kaset Fair (Jan, Feb), Bangkok Design Week (Feb), school holidays and the hottest weeks (Mar to May), Songkran (Apr), first rains (May, Jun), rainy-season evenings (Jun to Oct), the vegetarian festival (Oct), Loy Krathong and the Golden Mount fair (Nov), the cool-season mornings and New Year countdown (Dec). Nothing that is a religious practice in itself (WRITING.md): festivals appear as food, crowds, lights and music.

**Funny, the rules:** the joke is the situation (traffic, heat, a motorbike taxi that knows a shortcut, the 7-Eleven bell, a group chat with 40 unread), never a person, group, accent or body. Every answer is still a real thing that type would do, so the result stays accurate.

### 2.3 By audience (the field `audience`)

The member's Bangkok story is local, newcomer or international (D7, `src/domain/segment.ts`). Most scenarios are for everyone; some are written for one story only and are only offered to those members.

| Audience | Target | Example |
|---|---|---|
| everyone (no `audience`) | 150 | most scenarios |
| newcomer (new to Bangkok within two years, Thai or foreign) | 25 | "Your first free weekend since you moved here. Where do you start?" |
| international | 15 | "A Thai friend asks what you miss from home and offers to find it in Bangkok…" |
| local | 10 | "A friend from your old school is back in town for a day:" |

Rule: a newcomer or international scenario must make sense for someone who does not know the city yet, so its D answers can be ordinary places and its F answers are "the spot you have already made yours".

### 2.3b By set (the field `set`): profile-aware sets

Some scenarios are only for members in a set. The structure is in place (`ScenarioSet` in `scenarios.ts`, checked by `bank-rules.ts`); which members get which set is Q5's job ("Make the quiz fit each member's profile and mode", lands after this blueprint, D14).

| Set | Who gets it | Target | Rule |
|---|---|---|---|
| core (no `set`) | everyone | 164 | **no romance** (brand rule): friends, family, solo, coworkers, party, meetup |
| `open-to-more` | only members who switched on 💘 Open to something more (D4) | 26 (the whole `date` row in 2.1) | dating moments; red only on these screens (D9); never shown or hinted to anyone else |
| `table-host` | Table Hosts (เจ้าภาพโต๊ะ) of a Regular Table (โต๊ะประจำ) | 10 (taken from the meetup and party rows) | hosting moments: welcoming a newcomer to the table, choosing the next spot |

**Owner decision Q-D1 (section 0) replaces this note: date scenarios become flexible, working as a date or as a friendship meetup.** The earlier note: the 9 `date` scenarios in today's bank (7 core, 1 rhythm, 1 plan) are romance, and they are shown to every member who is not friends-only. Under "no romance in the core quiz" they belong in `open-to-more`. They are left untagged here so Q5 can move them together with the generator change. In 2.1 the `date` row is the open-to-more set; one-to-one friendship moments belong under meetup or friends.

`audience` (segment flavour) and `set` combine: a scenario can be for newcomers in the open-to-more set.

### 2.4 By time of day (`tone`, the sky)

| dawn | morning | afternoon | evening | night | rain |
|---|---|---|---|---|---|
| 10 | 40 | 40 | 55 | 35 | 20 |

### 2.5 By format

Formats are chosen per question when a session is built, not when a scenario is written: every scenario with 16 answers can be shown as pick-one, this-or-that or top-two. Only the letter duels (2.5.F) need their own content. Section 4 says how each scores.

| Format | Shows | Content needed | Target per 20-question session |
|---|---|---|---|
| A. Pick one (today) | 6 answers, 3 opposite pairs | any scenario | 12 to 16 |
| B. This or that | 2 answers, one opposite pair (every letter differs) | any scenario | up to 4 |
| C. Top two | 4 answers, 2 opposite pairs; pick first and second | any scenario | up to 2 |
| D. Most and least | 4 answers; pick most like you and least like you | any scenario | up to 2 (C or D, not both) |
| E. Photo pick | pick one, shown as place photos | landmark scenarios with photos in `design/assets/` | up to 2 (counts as A) |
| F. Letter duel | 2 answers about ONE letter (one each side) | written as duels, usually funny or personality | up to 2 |

Every session still has 2 twin pairs (shown as A or B), 2 rhythm and 2 plan questions.

### 2.6 By type profile (variety rules)

Across the bank, each type's answers must look like a person, not a postcode.

- **P1.** Every type answers in every context and every mood.
- **P2.** Each type uses at least 25 districts across the 200 scenarios.
- **P3.** No district takes more than 5% or fewer than 1% of all answers (now: at least 6 answers and at most 8%).
- **P4.** No named place more than 12 times in the whole bank.
- **P5.** No named place more than 4 times for one type (fixes the ruts in the audit, V11).
- **P6.** The same idea (Songkran on Khao San, a run club, mocktails on a rooftop) at most 3 times per type.
- **P7.** Every scenario offers at least 3 answers that need little walking, 2 that are free or cheap, and, when the answers are about food, at least one halal or vegetarian choice.

## 3. The scenario spec and checklist

### 3.1 Fields

```ts
{
  id: "first-free-weekend",          // kebab-case, unique
  kind: "core",                      // core | rhythm | plan
  context: "solo",                   // friends | family | date | solo | coworkers | party | meetup
  mood: "everyday",                  // everyday | landmark | seasonal | funny | personality
  months: [5, 6, 7, 8, 9, 10],       // seasonal only: the months it fits
  audience: ["newcomer", "international"], // optional: only for these members
  set: "table-host",                 // optional: "open-to-more" | "table-host"; absent = core quiz
  twin: "some-other-id",             // optional: same question in other words; both point at each other
  prompt: { en: "…?", th: "…?" },
  icon: "🧳",
  tone: "morning",                   // the postcard sky
  answers: { BDMN: a(icon, district, en, th, flavour?), /* all 16 codes */ },
}
```

### 3.2 Checklist (every new scenario must pass all of it)

**Automatic** (`npx vite-node scripts/check-bank.ts <file> <EXPORT>` and `npm test`; the rule lives in `src/vibe/bank-rules.ts`):

| # | Rule | Error or hint |
|---|---|---|
| A1 | All 16 type codes, unique id, valid kind, context, tone, mood, months, audience, set | error |
| A2 | Prompt ends with "?", ":" or "…" in both languages | error |
| A3 | Answer is 6 to 24 words in English (aim for 8 to 18), written as the action, no "I" | error |
| A4 | No dashes, gendered words, alcohol, politics, religious practice | error |
| A5 | No retired names: "circle", "dating mode", "Made with the BMA"; no "วง" for a group; no หาคู่ or โหมดเดต | error |
| A6 | Thai glossary spellings (เดต, แชต, เช็กอิน, ลิงก์, แมตช์…) and no polite particles | error |
| A7 | A D answer says it is new to you in words; an F answer says it is your usual | error |
| A8 | A D answer does not read as a habit; an F answer does not read as a first | error |
| A9 | A rhythm answer makes the time obvious; a plan answer makes planned or spontaneous obvious | error |
| A10 | Opposite types lean opposite ways on rhythm and plan (so 8 and 8) | error |
| A11 | Every place on the checker's place list that is named in English is named in Thai too, and every baht amount matches | error |
| A12 | Real district key; every district used at least once per file; twin points back | error |
| A13 | No answer text repeats one anywhere else in the bank | error |
| A14 | Nothing in the English shows B, C, M, S, N or H | hint (printed as WARN) |

The letter checks look for words, so they are generous on purpose. If an answer truly fits and still fails, add the word to the list in `bank-rules.ts` rather than bending the answer.

**The sense check** (by a person, for every answer; write the scenario, then do this with fresh eyes or in a second chat):

1. **Letter by letter.** Read the four letters aloud against the answer. B: is it with a group or a busy place? C: alone or one or two people? D: new to you? F: your usual? M: are you moving (walking, riding, dancing, playing, making something)? Sitting on a boat, watching a show or floating a krathong is not M. S: sitting, eating, talking, watching? N: modern, creative, a new venue? H: old Bangkok (temples, old markets, canals, shophouses, old recipes, traditional crafts)? A mall food court is not H. A plain park is weak N and weak H; give it a detail that says which.
2. **Would a real person do this?** Right time of day for the dish (no dim sum at midnight), the place is open then (museums close in the late afternoon), it is the right season, it costs what the answer says, and the thing is possible there (no seats on an orchid farm, check whether bikes are allowed).
3. **Is the place real and in that district?** Check the district key against where the place actually is, not the name of the nearest station (Benjasiri Park is in Khlong Toei, not Watthana; Krung Thep Aphiwat is in Chatuchak, not Bang Sue). If unsure, use a landmark from `landmarks.ts` or add it with `verify: true` and list it for the owner. Do not call somewhere "new" if it opened more than a year ago.
4. **Do the Thai and English say the same thing?** Same place, same people, same time, same numbers. The Thai is written Thai first (thai-voice.md), short and spoken, not a translation.
5. **Who is it for?** Works for any gender, age 23 to 32 and up, no assumption that the member has children or a partner (say "your young cousin", not "your kid"), works on a small budget, and someone new to the city can picture it.
6. **Is it fresh?** Not the same idea or place this type already has too often (P4 to P6). Read the type's other answers before writing.

**Done means:** the file prints `OK`, the sense check found nothing, and the batch is listed for the Branding chat with any `verify` places.

## 4. How the formats score

### 4.1 Today

Each pick-one answer gives one vote to each of its four letters: for each category, `n += 1` and `plus += 1` if the letter is the + pole. A letter's score is `2p − 1` with `p = plus / n`; its margin of error is the 90% interval on `p` (z = 1.645, with a variance floor), widened by 1.25 for every twin pair that disagreed on it. A letter is clear only outside its margin. Affinity per type is "picked ÷ offered". Rhythm and plan add one vote to their category from the picked answer's `flavour`.

### 4.2 The general rule for new formats

Every response becomes a list of **(category, pole, weight)** votes. Scoring sums them the same way: `plus[c] += w` for a + vote, `n[c] += w` for any vote. The margin uses the effective number of votes, `n_eff = (Σw)² / Σw²`, so many light votes do not look as certain as the same number of full ones. Everything else (twins, margin, strength, highlights, names) stays as it is.

| Format | Votes | Affinity | Why this weight |
|---|---|---|---|
| A. Pick one | the picked type's 4 letters, weight 1 | picked +1; all 6 offered +1 | unchanged |
| B. This or that | the picked type's 4 letters, weight 0.75 | picked +1; both offered +1 | two full opposites force a choice even when neither fits, so it says a little less |
| C. Top two | first pick's 4 letters weight 1, second pick's 4 letters weight 0.5 | first +1, second +0.5; all 4 offered +1 | the second choice is real but weaker |
| D. Most and least | most: its 4 letters weight 1; least: the OPPOSITE of each of its 4 letters, weight 0.5 | most +1; least −0 (offered only) | rejecting an answer is weaker evidence than choosing one |
| E. Photo pick | as A | as A | only the look changes |
| F. Letter duel | the picked side of its one category, weight 1 | none (no type) | it only measures one letter |

Session guard rails (checked in the generator tests):

- every one of the four letters gets at least 14 weight of votes;
- every type is offered at least 6 times in type-level formats (A to E);
- twins are compared only when both halves were shown as A or B;
- a session stays fully rebuilt from its seed, so the server never stores questions.

### 4.3 What changes in the app, and what does not

- **No database change.** Results are stored as the vector, the blend and the seen question ids (`social_vibes`); single answers are never stored, and none of that changes shape.
- **Code change:** `Question.format` gains the new values; the answer for C and D becomes two option indices instead of one; `scoreSession` moves to weighted votes; the quiz page renders the new formats. The current results must not shift: pick-one sessions must score exactly as today (a test pins this).
- **Approved by the owner** (section 0, Q-D3 and Q-D4): this or that, would you rather, letter association, a Bangkok-themed format and more categories; preferring in-season scenarios, segment questions and the Table Host set.

## 5. How to get there

| Batch | Scenarios | Focus |
|---|---|---|
| 1 | 25 | newcomer and international meetups and solo firsts (the launch audience) |
| 2 | 25 | coworkers and party; everyday |
| 3 | 30 | seasonal calendar, two per month |
| 4 | 24 | funny, across all contexts |
| 5 | 25 | personality, plus letter duels for format F |
| 6 | 24 | landmark, with photos for format E |
| 7 | the rest | fill context and mood gaps; rewrite the one-place ruts in the existing 47 (audit V11) |

Each batch: write in a new file under `src/vibe/bank/`, run the checker until `OK`, do the sense check, list `verify` places, and send the batch to the Branding chat. Adding scenarios needs no approval beyond that; it changes no schema and no screens.
