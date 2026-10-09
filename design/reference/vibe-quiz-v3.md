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
