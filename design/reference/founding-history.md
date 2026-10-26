# Founding history: sessions 1.0 and 2.0

Written by Core Platform on 2026-10-26 from the transcripts of the two founding
build sessions, which now sit under Core Platform:

- **1.0**: 9 Oct 2026, from an empty folder to a live app, PR [thesandoman/jurrgun#1](https://github.com/thesandoman/jurrgun/pull/1).
- **2.0**: 10 to 13 Oct 2026. Bug hunts, sign-in providers, profile depth, community hosting, staff setup.

Each "status now" note was checked against `origin/main` at `459c806` (26 Oct).
A lot has changed since the founding sessions. Where the code now disagrees
with what they said, the code wins, and the note says so.

---

## 1. Session 1.0 (9 Oct): from brief to live app

### What it built, in order

| Time (UTC) | Owner asked | What shipped |
|---|---|---|
| 04:30 | Review the BKK Social brief and the City Values quiz | A review: the civic quiz broke the brief's own rule against political data (PDPA s.26). It also listed the brief's gaps and suggested a smaller MVP. |
| 04:37 | Make it inclusive (LGBTQ+, expats, people not looking to date); SWOT, stakeholders, risks, a USP | PRD v2/v3, `city-values-quiz-v2.md`, `vibe-quiz-v3.md`, `strategy-swot-stakeholders-risks.md` and `matching-experiment.md`. Prototype quiz generator in `src/vibe/`, matching in `src/match/`. |
| 04:53 | Merge | **PR #1** merged. `GET /api/vibe/quiz` and `POST /api/vibe/score` went live. |
| 07:58 to 08:50 | Build everything in the PRD | P0 and P1 built by 5 parallel agents and merged locally to `main`. GitHub refused to create the PR, so there is no PR for this release. 21 tables were created on the live database through a protected setup route. 151 tests. |
| 08:53 to 09:22 | FAQ, Learn (dating, consent, sex ed, responsible dating) with sources; the brief gaps; quiz-first onboarding | `/faq`, `/learn` with dated sources and helplines (two factual errors were found and fixed), `brief-coverage.md`, 13 archetypes, invites and +1, cover photos, resident badge, sign-in throttling, automatic retention, offline page. 201 tests. |
| 09:29 to 10:23 | Discover map: merge the Sanroo patch, then switch to `sv-map`, then go full screen in the floodmap style | List and map views, then `sv-map` pinned to commit `9fac259`, then a full-screen map with a weather and PM2.5 ticker (Open-Meteo, 15-minute cache). Tests moved to a throwaway `cloud_test` database. |
| 09:42 to 09:54 | 16 types, more than 10,000 question combinations, a types legend in Learn, visuals on questions | 16 Bangkok Types with 4-letter codes plus two flavour badges, 167,488 possible questions, postcard art on each question, `/learn/bangkok-types`. |
| 11:03 | Brighter, green, still dark-capable; Learn as a tab; intro; the name Jurrgun | Renamed BKK Social to **Jurrgun (เจอกัน)**, green palette, a Learn tab, a 5-slide `/intro`. City Pulse moved into the Me tab. |
| 11:11 to 11:42 | Logo and type; a rich profile and bio card; a deeper quiz | Shipped as 3 separate pushes. (1) A waving-hand logo, Inter with IBM Plex Sans Thai, more spacing. (2) 150 interests, communication styles, a 90-prompt bank in 8 formats, a bio card visible only to people you've met at an event or are connected to, and migration `0002` (`social_profiles.bio jsonb`). (3) A quiz with slider, rank, 10-coin budget, "bothers" and superpower formats, about 93.7M possible questions, and a political and religious word block. 265 tests. |

### Decisions 1.0 made, and whether they still hold

- **The quiz never touches politics.** Six non-political categories, with a test
  that blocks political words. Civic items (CCTV, who decides, public money)
  are permanently out. Q27 (families and relationships) was dropped as too close
  to asking about orientation. *Still holds.*
- **The quiz feeds table seating.** v2 said the quiz should never be used for
  matching. 1.0 later wired it into table and buddy matching, at the owner's
  request, and changed the copy to match. Type labels are conversation starters
  only and never hide or rank anyone. *Still holds.*
- **Data is kept in three stores:** identity, social and research. City Pulse
  needs at least 10 people before showing a figure. The host scans each
  member's own pass, so a screenshot can't check anyone in. People I Met shows
  only your own group, for 72 hours. Friends-only is the default, and no staff
  role can see romance settings. *Still holds.* City Pulse counts are now also
  rounded to 5 (`9bd7a66`).
- **Accounts** use a username and password, with hashed passwords and session
  tokens, and refuse cross-site form posts. Email sign-up was planned so expats
  wouldn't need a Thai SIM. *Status now:* email-code sign-in landed (migration
  0021), plus Google and LINE (2.0).
- **Live schema changes** go through a protected `/api/setup` route, opened with
  a one-time key that is deleted afterwards. *Still holds.* QA & Release now
  owns migrations, and additive ones may be self-applied.
- **Dependency pinning:** `sv-map` is pinned to a commit, installed over https
  git with no SSH key. Its files are bundled encoded, because the deploy
  scanner had matched a `from "./…"` string inside it.
- **Retention is automatic** (owner's choice): it permanently deletes accounts
  deactivated more than 30 days ago. *Status now:* it runs from the clock
  (`services/clock.ts`) as well as from the admin dashboard.

### Caveats 1.0 left open

1. **The public `/api/vibe/quiz` was on the old format** (scale and choice only)
   while members got the mixed formats. *Status now: changed, and still
   inconsistent.* The member quiz has since become the curated D26 set: 16
   fixed questions per segment, with the slider, rank and budget formats
   removed (`b1df64f`, `bd2abde`). The API now calls `generateSession({ seed })`
   with no `personal`. The result:
   - it always serves the **default segment's** curated set, and the `seed`
     no longer changes the questions;
   - it **echoes `per` but ignores it**;
   - it leaves out the style questions and the follow-ups that members get;
   - `POST /api/vibe/score` accepts only `{ questionId: number }`.

   The API's contract no longer describes what it does. Nothing in the app
   calls it. It could be retired, or rebuilt on `quizQuestions()`.
2. **The Thai copy needs a native read.** The quiz, profile, Learn and
   onboarding Thai was written as a draft. *Status now: partly done.* There
   were model-made passes: `5175ff5` (238 corrections), `30ca8a0` (about 830
   strings, written against `thai-voice.md`) and `11f3fd8`. The repo records
   **no review by a human native speaker.** The Learn health and legal pages
   also still say BMA's health and legal teams should review them before
   public launch.
3. **Medical and legal content** in Learn is general information, so the same
   BMA review applies.
4. **Login was username and password only, with no rate limit.** *Status now:*
   throttling landed the same day, with HMAC-keyed IP and username
   (`0ff0ca8`).
5. **Notifications were in-app only.** *Status now:* web push (VAPID) exists.
   LINE OA messaging belongs to Marketing (Composio).
6. **Camera check-in had not been tried on a real device.** There is no record
   that it was tried since.
7. **Blocked on outside parties:** phone OTP (needs an SMS provider), ThaiD,
   and a named data protection officer with the privacy impact assessment.
   *Status now:* the lawyer questions are parked by the owner, so don't raise
   them unless asked.
8. **The weights in the matching score were guesses.** They need tuning against
   real post-event ratings. *Still open:* there aren't enough events yet.
9. **Process incidents** to remember:
   - A commit went out with a failing test, because the check only looked for a
     result line.
   - An agent's `pkill -f workerd` stopped another project's dev server
     (Mentalme, port 8787).
   - zsh read `$C:r` as one of its own modifiers and mangled a push target.

   The rules learned from these: check for a pass, not just for output; never
   use a broad `pkill`; put braces around shell variables.

---

## 2. Session 2.0 (10 to 13 Oct): hardening, depth, hosting, staff

### What it built

| When | Owner asked | What shipped |
|---|---|---|
| 10 Oct 02:34 | People can't get past the nickname screen on Android | **The real cause:** Chrome's whole-form check stopped on hidden required fields, which hit every new account on every browser (3 of 4 live sign-ups were stuck). `flow.tsx` now checks only the current step, then checks every step before submit. |
| 02:59 to 03:28 | More interests, a spiritual group, occupation; remove "What I do"; a livelier Me tab | 354 interests in 18 groups. Spiritual interests are framed as things people do. An occupation dropdown with an "Other" box. A Timeleft and Beli-style Me hub. |
| 03:34 to 04:12 | Make it unique (Bangkok livery); show password; Google and LINE sign-in; drop the stripes | A livery pass that was later flattened (Inter everywhere, no stripes), Show/Hide on passwords, **Google and LINE OAuth** (asks for an ID only), a new sign-in table on live, "across N crews" on the Circle stat. |
| 04:13 to 05:38 | Hide Change password for OAuth accounts; hunt bugs, fix and push | Three review passes. **Fixed:** skipping consent, editing your age after onboarding, seats held by banned members, blocked pairs at late seating, **RSVP overbooking races** (save, then recount, then waitlist), double taps, a City Pulse leak through subtraction on "Other", unpublishing stranding attendees, data export gaps, ages counted in UTC instead of Bangkok time, the tab bar covering buttons. Retention extended (12 months for check-in detail, 24 months for Pulse answers). |
| 06:46 to 07:17 | Education; a notifications dropdown; a movable map key; profile details for expats, transplants and visitors; 3 to 5 residency options | Degree, university search (about 10,300 universities under MIT licence, plus 26 Thai ones) and graduation year; a "same university" badge that also nudges seating; a bell dropdown; a draggable key; **My Bangkok** (story, time here, from, happy to help); **sign-up opened** to 4 residency options (live here, nearby, moving soon, here for a while). |
| 07:20 to 13:02 | Comb for bugs; set up an agent that fixes bugs | **A nightly bug-hunter routine**, 03:00 Bangkok time, `trig_016p7xVDVSuBY5FS4wUexa5B`. It opens PRs only and never pushes. Also `npm run check` (types, tests, assets, build, a smoke test of live). **Fixed:** an open redirect after sign-in or a language switch, Thai university search, duplicate notifications, accepting an offer for a cancelled event, "Lift" re-activating deleted accounts, crashes on bad input, CSV formula injection, **a separate test database for each run**. The first cloud run failed to download `sv-map`, so the install moved to git over https. The second run was clean, with 318 tests. |
| 12 Oct | Use the Kaipa API (a friend's ticketing platform); study it and build our own hosting | Kaipa listings built but switched off. A study of a hosting framework, borrowing ticket types, private links and fee-inclusive prices. **Community hosting Phase 1**: members propose, staff review, private link-only events, a 3-pending cap, a "trusted host" skip. Also fixed: drafts were visible to any staff host. *Status now:* **Kaipa was removed** (`b224341`, then `c5cefd3`). Partner organisations and outside events (D45 to D50) cover that ground. |
| 13 Oct | Admins, moderators and members can all host; who are the admins? | Hosting for every role, with **no self-approval**, and moderators get tools for their own events only. **sandosit, pjj and aey made admins**, each through a one-time setup key that was deleted right after. Old account `sando` is deactivated. |

### Decisions 2.0 made

- **Sign-in providers ask for the minimum:** an ID only. No email, name or photo
  is requested from Google or LINE. A provider link is removed on deactivation
  and again in the 30-day cleanup.
- **Onboarding locks once finished.** The earlier screens redirect to Discover,
  so age and consents can't be changed by posting to them again.
- **Capacity is settled after the write.** Every RSVP is inserted, the seats
  are recounted, and anyone over the limit goes to the waitlist. This is the
  pattern for any capacity-limited feature.
- **Events with sign-ups can't go back to draft.** They can only be cancelled,
  which notifies everyone.
- **Hosting tiers:** admin, moderator and partner admin publish straight away.
  Members go through review unless trusted. Nobody approves their own event.
- **Tests own their own database.** Each run creates its own and drops it
  afterwards, so parallel runs don't clash. Full suites now run on GitHub CI
  (`ci/*` branches, `tests.yml`).
- **Staff roles are granted with a one-time key:** `POST /api/setup/promote` with
  a temporary `SETUP_KEY`, deleted afterwards. Trust & Operations now owns the
  roles policy. Core Platform owns this mechanism.

### Caveats 2.0 left open

1. **Secrets were pasted into the chat** on 10 Oct: the Google OAuth client
   secret, the LINE channel secret and a 21st.dev API key. 2.0 asked the owner
   to rotate all three. **There is no record they were rotated.** The breach
   plan (`breach-response-plan.md` §2) lists the rotation steps.
2. **OAuth publication:** the Google app (Audience → Publish) and the LINE
   channel (Developing → Publish) had to be published by the owner, or only
   test users can sign in. A full sign-in was never tested end to end by
   Claude, because it needs a real account.
3. **The nightly bug hunter** was created on 10 Oct. Whether it is still
   enabled, and where its PRs go now that QA & Release is the push gate, was
   not checked in this pass.
4. **Short trips** of a few days fit none of the residency options. "Just
   passing through" was offered and not taken up.
5. **Hosting phases 2 to 4** were not built: ticket types, a public partner API
   and online payments. *Status now:* partner keys and feeds landed with D45 to
   D50. Ticket types and payments are still not built.
6. **`.mcp.json` in the working folder** may hold the 21st key. It must stay
   untracked.

---

## 3. Still unfinished, as of 26 Oct

| Item | From | Owner |
|---|---|---|
| `/api/vibe/quiz` and `/api/vibe/score` don't match the curated quiz; `seed` and `per` are misleading | 1.0 | Core Platform (with Quiz) |
| A native Thai read by a person, for quiz, profile, Learn and onboarding | 1.0 | Branding / Quiz, owner to source a reader |
| BMA health and legal review of the Learn pages | 1.0 | Trust & Operations (parked with the lawyer questions) |
| Rotate the Google and LINE secrets and the 21st key | 2.0 | Owner (only the owner can issue new ones) |
| Confirm the Google and LINE apps are published; test a real sign-in | 2.0 | Owner, then QA & Release |
| Whether the nightly bug hunter is still running, and how it fits the QA gate | 2.0 | Core Platform |
| Camera check-in tried on a real phone | 1.0 | QA & Release |
| Matching weights tuned on real ratings | 1.0 | Core Platform, once there is event data |
| Phone OTP, ThaiD, DPO and DPIA | 1.0 | Blocked outside, parked |
| Ticket types and payments (hosting phases 2 and 4) | 2.0 | Not started, needs an owner card |

## 4. Where the details are

- Product docs: `design/reference/bkk-social-prd-v3.md`, `vibe-quiz-v3.md`,
  `matching-experiment.md`, `brief-coverage.md`,
  `strategy-swot-stakeholders-risks.md`.
- Session transcripts: 1.0 is `local_e55b5e31-761b-4a22-9ea7-8df0f95f82c6` and
  2.0 is `local_97825108-a695-443f-9546-103e8bb18d57`. Read them with
  `list_events`.
- Platform rules: `SVAGENTS.md` §2 (hard rules), §5 (data), §10 (deploys).
