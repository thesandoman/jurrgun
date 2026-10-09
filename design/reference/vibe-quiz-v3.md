# BKK Social — Bangkok Vibe Quiz (v3)

*Replaces the civic "City Values" quiz (`city-values-quiz-v1/v2.md`). Code: `src/vibe/`. Tests: `test/vibe.test.ts`.*

## Why it changed

The v1/v2 quiz measured civic trade-offs: rules vs freedom, experts vs residents, development vs preservation, CCTV, public money. Those answers can reveal political opinion, which is sensitive data under PDPA s.26, so they can't safely be used to match people. The v3 quiz measures **only how someone likes to spend time in the city**. That makes it safe and genuinely useful as a matching input.

Civic and service questions still exist, but they live in **City Pulse**: they are never used for matching and are always shown aggregated.

## The 6 categories

| Category | + pole | − pole | Why it matters for meeting people |
|---|---|---|---|
| **Social energy** | Buzz: crowds, big tables, parties | Chill: small, quiet, one-on-one | Group size and venue comfort |
| **Exploring** | Discover: new places, new food, new classes | Familiar: favourite spots, being a regular | Event novelty |
| **Daily rhythm** | Night owl | Early bird | Which time slots people will actually turn up to |
| **Activity style** | Move: walking quests, sport, hands-on classes | Savour: long meals, galleries, talk | Activity vs conversation events |
| **Planning style** | Spontaneous | Planner | Last-minute vs booked-ahead events |
| **Culture taste** | Creative: galleries, design markets, indie gigs | Old-town: temples, heritage streets, traditional markets | Which VisitBangkok routes appeal |

**Content rule (enforced by a test):** items describe leisure only. There is nothing about policy, rules, public money, voting, police/CCTV, religion, income, gender or identity.

## How questions are generated

Nothing is hand-written per question. Each question is **assembled from a template plus random pieces of a content bank**:

| Bank | Size | Source |
|---|---|---|
| Activities per pole | 5–6 × 12 poles | Written to the content rule |
| Places | 13 | VisitBangkok routes and attractions (Yaowarat, Talat Phlu, Khlong Bang Luang, Charoenkrung–Talat Noi, Little India, Rattanakosin, Charoen Nakhon Rd, Asiatique…) plus everyday spots (Ari, Lumphini, Benjakitti, Chatuchak, Siam) |
| Times | 6 | "Saturday morning", "a rainy Friday evening"… |
| Companions | 4 | "a new friend from a BKK Social event", "a colleague who just moved to Bangkok"… |
| Statements per pole | 2 × 12 poles | For 1–5 "how much is this you?" items |

**Templates**

| Template | Example (generated) | Scoring |
|---|---|---|
| `scene` | "Sunday afternoon, you're near Talat Phlu. Which sounds better?" A: *a walking food quest* · B: *a long lunch where nobody rushes* | The chosen option's pole |
| `host` | "You're showing a colleague who just moved to Bangkok around Ari. You'd suggest…" | The chosen option's pole |
| `quick` | "Quick one — which is more you?" A: *a route planned stop by stop* · B: *picking a random BTS stop and exploring* | The chosen option's pole |
| `skip` (reversed) | "Your weekend only has room for one of these. Which do you skip?" A: *a late-night jazz bar* · B: *a weekend morning yoga session* | The **opposite** of the chosen option's pole |
| `scale` | "How much is this you? 'My favourite Bangkok is the city before 9 am.'" (1–5) | (answer − 3) / 2 × the statement's pole |

Every question is generated in Thai and English, e.g. *"บ่ายวันอาทิตย์ คุณอยู่แถวตลาดพลู แบบไหนน่าสนใจกว่า?"*

**Variety:** 1,000 simulated sessions produced about 6,300 distinct questions. Adding one activity to a pole adds dozens more combinations.

## Session rules (guaranteed by the generator, checked by tests)

• **Deterministic from a seed.** The server can rebuild any session from its seed to score it, so no session needs to be stored.  
• **Balanced:** 3 items per category, 18 in total, about 3 minutes. `perCategory` can be set from 2 to 6.  
• **At least 1 scale item per category**, plus random `skip` (reversed) items. Someone who always picks "A", or always the fun-sounding option, doesn't end up with an extreme result.  
• **The "+" option is on side A only about half the time** (tested at 40–60%).  
• **Ordering:** the same category never appears twice in a row, and the same template appears twice in a row only when it can't be avoided.  
• **Retakes:** the generator avoids question ids the user has already seen.  
• No activity is used twice in one session.  
• **The browser never receives the category or pole** (`toPublic`), so the scoring can't be gamed.

## Scoring

For each category: score = the mean of its item scores, from −1 to +1. Skipped or invalid answers are ignored.

| abs(score) | Strength |
|---|---|
| ≥ 0.60 | Strong |
| 0.25–0.59 | Leans |
| < 0.25 | Balanced |

**Result name:** built from the two strongest non-balanced poles, as *adjective of the 2nd* + *noun of the 1st*. Examples: "Curious Night Owl", "Old-Town Explorer", "Spontaneous Mover". In Thai the order is noun + adjective: "นกฮูกราตรีสายลองของใหม่". If all six categories are balanced, the result is **"Bangkok All-Rounder"**.

## How the vibe is used

| Use | Allowed? |
|---|---|
| Small-group clearinghouse at events (§8.1) | ✅ the main use |
| Event Buddy pairing (§10.5) | ✅ |
| Suggesting events ("night owls loved this jazz walk") | ✅ |
| Showing the vibe name on the profile | ✅ optional, off by default |
| Romance matching | ❌ romance is only ever mutual post-event consent |
| Any ranking or filtering that hides people | ❌ |
| BMA dashboards | Aggregates only, k ≥ 10 (e.g. "night-owl share by district" to plan event times) |

## API (prototype)

| Route | Purpose |
|---|---|
| `GET /api/vibe/quiz?seed=…&per=3&lang=th\|en` | A public session: questions with no scoring data |
| `POST /api/vibe/score` `{ seed, per?, answers: { [id]: number } }` | Rebuilds the session from the seed, scores it, and returns the vector, strengths and name |

## Next steps

1. Thai copy review by a native writer. The current Thai text is a working draft.  
2. Pilot with 300+ people. Check each category's internal consistency (α ≥ 0.6) and retest stability (≥ 70% keep the same pole on non-balanced categories). Prune weak items.  
3. Grow the place bank directly from the VisitBangkok directory. Its categories (photo, food, heritage, art, café, walking street) map onto the Exploring and Culture categories.

## v3.1: richer formats, a bigger bank, a quiz nobody else gets

*Code: `src/vibe/content.ts`, `generator.ts`, `visuals.ts`, `src/routes/quiz.tsx`. Tests: `test/vibe.test.ts`, `test/archetypes.test.ts`, `test/quiz.integration.test.ts`.*

The owner asked for "lots for the quiz", more comprehensive than simple questions, genuine and positive, and that no user receives the same quiz. v3.1 brings in the **response formats** and the **everyday Bangkok scenarios** of the original City Values draft (`city-values-quiz-v1.md`), reframed around how people like to spend time. It stays non-political: every item still feeds table matching, so every item is about time, people and places.

### Formats (all scored onto the same 6 categories, each item −1..+1)

| Format | What the member does | Scoring |
|---|---|---|
| `choice` | Taps one of two (templates `scene`, `host`, `quick`, `skip`, plus new `moment` and `power`) | The option's pole (`skip` reversed) |
| `bothers` | "Which would bother you more?" two light annoyances | Reversed: the text describes the other side, so "A 7 am meet-up" scores Night owl |
| `scale` | 1–5 "how much is this you?" | (answer − 3) / 2 × pole |
| `slider` | Drags 0–100 between two pole phrases ("A table of three ↔ A table of twenty"), live label, then Next | (value − 50) / 50 × the right end's pole |
| `rank` | Taps four activities in order, favourite first (two from each pole), numbered badges and Undo; without JS, number selects | Weights 3, 1, −1, −3 by position × pole, ÷ 8 |
| `budget` | Spreads 10 coins over four activities with − / + and a remaining counter; must total 10 (or 0 to skip); without JS, number inputs checked on the server | Σ coins × pole ÷ 10 |

A member session (`formats: "mixed"`, 3 per category = 18 items) always has **2 sliders, 1 rank, 1 budget, 2 bothers, 3 scales and 9 choices**, spread so no category gets two of rank/budget, and ordered so neither the **category nor the format** repeats back to back (checked over 300 seeds). `perCategory` 2–6 scales the mix (`mixCounts()`). The public `/api/vibe` prototype keeps the classic scale + choice mix (`formats` defaults to `"classic"`), so its numeric-answer contract is unchanged.

The POST rejects anything malformed with **400** (a half-done or duplicated ranking, coins that don't add to 10, out-of-range values) and reopens the flow on that question. An untouched rank or coin question is simply skipped.

### Bank (exact counts)

| Bank | Size |
|---|---|
| Activities | 168 (14 per pole × 12 poles) |
| Statements (scale) | 72 (6 per pole) |
| Slider ends | 72 (6 per pole) |
| "Bothers" items | 60 (5 per pole) |
| Superpowers | 36 (3 per pole) |
| Places | 39, each tagged with its district(s) and interests (VisitBangkok routes plus everyday spots across the city, from Hua Takhe and Min Buri to Bang Khun Thian's seaside) |
| Situations | 19 ("A free Sunday with nothing booked", "A friend is visiting Bangkok for the weekend", "It's raining hard on a Friday evening", "You just moved to a new neighbourhood", "It's a festival night in the city"…) |
| Times | 15 |
| Companions | 18, some tagged with interests ("a friend from your running club") |

Every item is bilingual and has its own icon or sky tone (tested). New copy has no em or en dashes.

### What we took from the md, and what we left out

**Used:** forced choice (`choice`), "Which bothers you MORE?" (`bothers`, now everyday annoyances instead of neighbourhood change), the 10-coin budget game (`budget`, coins of time and energy across ways to spend a day, not across city services), ranking (`rank`, tap-to-order instead of drag, so it works on any phone and with a keyboard), the scenario slider (`slider`), "Pick your Bangkok superpower" (`power`), the "free Sunday" scenario and the md's real-situation style (`moment`, `SITUATIONS`), and its principles: both options reasonable, mixed categories so the scoring axis isn't visible, a large rotating bank.

**Left out on purpose:** everything civic. No CCTV or police, no rules or regulation trade-offs, no "who should decide" (residents vs experts, majority vs negotiation), no public money, subsidies or taxes, no development vs preservation, no diversity or norms questions, no elections or religion (v3's "giving alms at dawn" was replaced with "coffee on a quiet pier at dawn", and the temple walk is a heritage walk). These reveal political or religious opinion, which is sensitive data under PDPA s.26 and has no place in matching people for a dinner table. The md's "inconvenience you'd delete" (traffic, flooding, sidewalks) was also left out: it is a city-services question and belongs in City Pulse. A test bans these topics in English and Thai across every bank and every generated prompt.

### "No user receives the same quiz"

• **Per account and attempt:** the seed is `accountId:answeredCount`, derived on the server, so every account and every retake gets its own session.  
• **Personalised:** `generateSession({ personal: { district, interests } })` leans scenes toward places in the member's district ("Songkran afternoon, close to home near Sam Yan") and toward places and companions that match their interests, and mixes the personalisation into the seed. The same seed with different personalisation gives a different session (tested). The onboarding quiz runs before the profile exists, so it is not personalised.  
• **Retakes** avoid question ids already seen; ids never repeat inside a session (tested over 5,000 seeds), and situations, places, times and companions are not reused within a session where the bank allows.  
• **Numbers (tested):** 5,000 different seeds → 5,000 distinct sessions. `questionSpace()` ≈ **93.7 million** distinct questions (was ~10,000). 1,500 simulated member sessions reach about 16,000 distinct questions.  
• All 16 Bangkok Types stay reachable through real answers in classic and mixed sessions, with and without personalisation.
