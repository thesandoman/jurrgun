# Bangkok Buddy: spec for approval

**Status:** proposal. Nothing is built yet. Approve or adjust this, then it gets
built in one pass.

## What Jurrgun is (one line)

A social meetup app for Bangkok: make friends and feel at home in the city
through small group meetups, shared tables and hangouts. Your Bangkok Type
seats you with people you'll click with, and romance is optional and only
when both people want it.

## The unique feature: Bangkok Buddy

You opt in and get **one buddy**:
- whose type clicks with yours (each type's `clicks` list in `src/vibe/archetypes.ts`);
- whose districts overlap with yours;
- with whom you explore the city on a shared **Bangkok Passport** covering all 50 districts.

**Why nobody else has it.** The partner apps each own one moment:
- Timeleft: one dinner.
- Coffee Meets Bagel: one daily pick.
- Hinge and Raya: one profile.
- Meetup: one group.

Buddy is a **relationship with the city, shared with one person**, and it can
open up into groups at any time.

### How it works
1. **Opt in.** Choose what you're open to: friends, an activity buddy, or
   "open to more". This choice is private.
2. **Match.** Matches come weekly, not daily, so this isn't a swipe feed. The
   scoring:
   - type affinity (the `clicks` list, then the "complementary" or "natural" match from `matchLabel`);
   - district overlap (home district plus the districts of each person's type `spots` and `hangouts`);
   - plus a check that the pair's language and age ranges overlap.

   Both people see the other's type, their shared types and one suggested
   quest. Both must tap "Meet". There are no one-sided reveals.
3. **Quest.** Each week you get one quest made for your two types, at a real
   landmark from the 50-district table (`src/vibe/landmarks.ts`).
   - Example: Food Hunter + Story Collector get "Nang Loeng market, then ask a
     stall owner how long they've been there".
   - Doing a quest stamps that district in **both** passports.
4. **Grow it.** Either buddy can tap "Make it a table" to turn a quest into a
   small public meetup of 4 to 6 people. This uses the existing events and
   community hosting.
5. **Romance, only if mutual.** The romance flag works like the existing
   `romance_on` / intents settings.
   - If both people privately chose "open to more", both see a gentle "you
     both said you're open to more" after the second meetup.
   - If not, nobody ever sees the other person's choice.
6. **End it kindly.** Either person can tap "Thanks, new buddy". There's no
   blame and a rematch comes the next week. Blocks and reports use the
   existing safety tools.

### Safety (non-negotiable)
- Quests take place only in **public places** from the landmark table.
- The first two meetups happen in daytime or early evening.
- A check-in button shares your meetup with a trusted contact.
- Blocking and reporting use the existing flows. The strikes and no-show rules apply.
- Ages: 18+ only, and the age-range preference is respected.

## Partners: what they do best, and how they plug in

Treat the partner apps as collaborators. Jurrgun is the **Bangkok layer** they
plug into.

| Partner | What they do best | How we integrate | What stays ours |
|---|---|---|---|
| **Timeleft** (dinners with strangers) | Curated tables for 6 | Their dinners appear as Discover events (like the existing Kaipa partner events), with type-balanced seating suggestions | Type-aware seating plus the 50-district quests |
| **Meetup** (groups) | Recurring interest groups | Their groups appear under "Groups near your districts"; the "Make it a table" output can post to a partner group | Buddy quests feeding into groups |
| **Coffee Meets Bagel** (daily curated pick) | Low-volume, high-intent matching | Their idea inspires our *weekly* buddy match; we don't copy the daily feed | Platonic first, romance only when both opt in |
| **Hinge / Raya** (rich profiles, curation) | Prompts and a curated feel | Their idea inspires profile prompts tied to your type ("My Bangkok in one dish…") | Type, passport and district map as the profile |

**Partner integration (MVP):**
- Partner events through the existing Kaipa-style partner event pipeline.
- A shared link format: partner events open in their app, and attendance is
  confirmed back through a webhook, which stamps the district in the passport.

## Profile ideas taken from the partners (individual profiles)

- **Type card:** emoji, type name, your blend, and "clicks with".
- **Passport:** a mini map showing which of the 50 districts you've stamped.
- **Three prompts tied to your type,** Hinge-style. For example: "My go-to
  spot in {district}", "A dish I'd queue for", "Best time to find me".
- **"Together" line on someone else's profile:** "You're a Food Hunter,
  they're a Story Collector. Do this together: …", using `clicks[].why` and a
  shared landmark.
- **Curated badge,** Raya-style: shown after 3 attended meetups with no
  reports. It's earned, not paid for.

## MVP scope
1. **Schema:**
   - `buddy_optins`: intent (private), districts, active.
   - `buddy_matches`: a, b, week, state, quest.
   - `passport_stamps`: account, district, source.
2. **Weekly matching job:** reuses `src/match/*` patterns. No polling;
   scheduled as SVAGENTS.md describes.
3. **Screens:** Buddy opt-in, "Your buddy this week", quest card, passport
   map, end and rematch.
4. **Quest generator:** a hand-written template for each type pair, at a
   landmark. It mirrors the quiz bank and uses the same content-rules checker
   (`src/vibe/bank-rules.ts`).
5. **"Together" line and passport on the profile.**

## Open questions for the owner
- Matching weekly or every two weeks?
- Should stamps also come from regular events and partner events, or from buddy quests only?
- Which partner should be first for the integration pilot?
