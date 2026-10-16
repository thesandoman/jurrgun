# Changelog

Everything that has shipped in Jurrgun (เจอกัน), from the first commit to now,
oldest version first. Every line links to its commit on GitHub, and each
version links to the full diff.

The repo has no git tags yet, so these versions were assigned afterwards, one
per milestone. Internal "Project state" notes, merge commits and reverted
work are left out.

Categories: **Features** · **UX/UI** · **QOL** · **Quiz** · **Branding** ·
**Website** · **Legal & privacy** · **Fixes** · **Platform** (database,
tests, CI, tooling)

---

## [0.0.1] - 2026-10-08 · Bootstrap

### Platform
- Repository created on SV Cloud with its starter bundle [29cf49a] [85e6dc7]

---

## [0.1.0] - 2026-10-09 · BKK Social P0 + P1

### Features
- Core of the app: schema, sign-up and log-in, onboarding, UI kit, rules and shared services [775958f]
- Member app and staff dashboard [21e9783]
- Quiz results, invites, log-in throttling, archetypes and vibe-aware matching [f47f4e3]
- Native onboarding, with gaps from the brief filled and the app hardened [1ccb922]

### Quiz
- First Bangkok Vibe quiz and the matching experiment, with the v3 docs [19d2bbe]

### Website
- FAQ on the home page and at /faq, and a public Learn section: dating in Bangkok, consent, sexual health, dating responsibly [b6f233e]
- Learn cites its sources for each topic; marriage equality date, 1663 hotline hours, PrEP/PEP and abortion facts corrected [1222403]

### Platform
- Migrations made safe for CockroachDB; setup route tested on a fresh database [54e2f0b]
- Setup migration can resume after a failure, retries, and reports which step failed and why [87e76cd] [0ca2e30]

---

## [0.2.0] - 2026-10-09 · Discover map, Bangkok Types and the Jurrgun name

### Features
- Discover map: List / Map switch, event pins, category chips, map key, sheet, near-me [481f1c4]
- Map is the default view, built on the sv-map package [1362962]
- Full-screen map: ticker with Bangkok weather and PM2.5, floating search, status card, tool rail, events sheet [3368299]
- Rich profile: 150 interests, communication styles, quick facts, a prompt deck in 8 formats and a bio card [5691cf9]

### Quiz
- 16 Bangkok Types (4-letter codes and flavour badges), question visuals, a question generator [39f9e67]
- Deeper quiz: slider, rank, 10-coin budget, bothers, moments and superpowers; 168 activities; every session unique [673bc4e]

### Branding
- Renamed to **Jurrgun (เจอกัน)**: bright green palette with dark mode, new mark and icon, Learn tab, first-time intro [75605f3]
- Minimal waving-hand logo, Inter font with IBM Plex Sans Thai for Thai, more spacing [f9d4809]

### Website
- Learn: a Bangkok Types page with a legend [39f9e67]

### Platform
- Each test run gets its own fresh database; retention test no longer flaky [3c3e35c] [47471c1]
- sv-map bundled as base64 so the deploy scan skips its docs [4134ee3]

---

## [0.3.0] - 2026-10-10 · Sign-in options, Open City redesign and a bug sweep

### Features
- Google and LINE sign-in, and a show-password toggle [a9b272e]
- Sign-up open to anyone in or around Bangkok, with five residency options down to "just passing through" [6eb1a7c] [efc025f]
- Education on the profile, with university search, degree and class year [fa054ae] [8a7d8dd]
- Occupation dropdown, and interests grown to 335 in 17 groups (Spiritual, Collecting, Sports fans, BL series) [5128cca] [9bd1ec8]

### UX/UI
- Bangkok livery look, then flattened (no stripes), Inter everywhere [a9b272e] [b29ee4c]
- Open City redesign on the green livery, plus an accessibility menu [0464183]
- Appearance setting: Auto, Light or Dark [582b4b2]
- Livelier Me tab; notifications as a dropdown from the bell; movable map key [65ce634] [fa054ae] [8a7d8dd]

### Legal & privacy
- Change password hidden for Google and LINE accounts; their username prefixes reserved [0851d7c]

### Fixes
- Card flow Next did nothing for new accounts [d2c2d82]
- Onboarding bypass, locked birth date, seats held by banned members, late check-in next to a blocked person, stale waitlist offers [7370124]
- RSVPs can't overbook, double taps are harmless, cancelled events free their places [27e4e81]
- Bug sweeps: Enter wiping a prompt, dark-mode picks, tab-bar overlap, privacy and export, open redirect, duplicate notifications, bad-input crashes [75726f0] [b67317a] [2f08d9d] [df215fd]

### Platform
- `npm run check`: types, tests, assets, bundle and a live smoke test in one command [c75769f]
- Toolchain set up (INSTALL.md removed); sv-map installed over git [c58fecb] [ae4da38]

---

## [0.4.0] - 2026-10-12 → 10-13 · Hosting, quiz v4 and Bangkok Buddy

### Features
- Community hosting, phase 1: members propose events, the team reviews, private link-only events [28a8ea1] [76cfd01]
- Kaipa partner events on Discover (removed again in 0.8.0) [28e31d1]
- **Bangkok Buddy**: weekly matching, quests and a 50-district passport [e95d0db]
- Friends or dating chosen first, no ghosting, daily buddy rounds, monthly big quests, circle hangouts [e206a8a]

### Quiz
- Bangkok Type quiz v4: 20 hand-written scenarios, a margin of error, all 50 districts, Learn guides [e90b88d]

---

## [0.5.0] - 2026-10-14 · A more visual app

### Features
- Bangkok Buddy becomes a main tab; a dating-only path with a safety net [61da1a5]

### UX/UI
- Lighter pages [61da1a5]
- Bento tiles, a stacked buddy card, postcard fans and passport stamps [20f1441]
- Visual event cards and detail: chips, seat meter, fact tiles; the Me menu as tiles [46babd6]

---

## [0.6.0] - 2026-10-15 · Guardrails, plans and people before the app

### Features
- Phase 1 guardrails: chat with limits, a "home safe?" check, healthy limits [0d95a97]
- Phase 2a: a weekly plan (two picks with reasons, accept or skip, pitch your own), meetup preferences [2cfbc51]
- Phase 2: felt-heard and unsafe-to-report feedback, private buddy feedback, host insights (k ≥ 5) and host ideas (k ≥ 10) [ee9180d]
- Phase 3: graduation and still-in-touch, private thank-yous, monthly energy check-in, pay-it-forward seats, phone-down mode, month in people [16865f8]
- Buddy deck: keen or pass feeds the daily round, private, 15 a day, no photos; private dating preferences [70f9417]
- Inclusive dating: orientation and an optional orientation filter, opt-in pronouns, women and non-binary only spaces [e5add9d] [0824e90]
- Profile: out-and-about options (payment, bill splitting, getting around, food, spice, pets, timing) [43e59a4]
- Live chat over a receive-only connection instead of a 20-second refresh [2f5722c]
- Hosting limited to admins, verified partners and approved circle heads; members can ask to lead a circle [4a721ec]
- Leaving: an optional anonymous "why are you leaving?" and "take a break instead" [b984b4a]
- Fair removal: suspend or ban only for a named rule or 3 flags [03a8f95]
- One-time getting-started guide: how it works, safety, communication, accountability [9433ae5]

### UX/UI
- Laptop layout, then back to top-down with the menu in the header; tablets get a centred tab bar [6753784] [e64bf52]
- Native-feel pass and a Discover Map / Cards switch [427dc1c]
- Livelier app: toasts, confetti for a seat or a stamp, buttons that show they're working, events as ticket stubs [60bcc35]
- Fluid gestures: a spring kit with momentum, rubber-banding and reduced motion; the buddy deck follows your finger [b7bdde2]
- A lighter, friendlier default look: cream ground, white cards, frosted header and tab bar [32e8291]
- Accessibility: small text size, bigger buttons, more line spacing, wider pages [43b132e]

### QOL
- Districts A-Z everywhere (Thai order in Thai) [32d3451]
- Keen / Pass stays above the tab bar on phones [926c94a]

### Quiz
- Friends-only members get no date scenarios [4039bb5]

### Fixes
- Staff pages no longer mention internal docs; keynote and filming polish [4039bb5] [c1ab4fe] [703ea66]

### Platform
- Local demo seeds: a filled-in Yaowarat food crawl, buddy pairs, quests and dating modes, with `--reset` [cb89ea1] [29e578c] [100c263]

---

## [0.7.0] - 2026-10-15 · Brand system and positioning

### Features
- Circle chats: photos from the day (members only, 5 MB), quick polls [2bf29a8]
- A Jurrgun for each person: local, newcomer or international experience, a "For you" card on Discover [f3a6c35]
- The Rebuilder's journey: /new pre-ticks "I'm new in town" and the quiz suggests "Your first table" [ae24ac6]
- Dating partner programme and measurement, admin and BMA only [d937596]

### Branding
- Brand audit fixes: one Jurrgun green (#137f45), one tagline in Thai and English [b1e94d1]
- BMA type system: Sao Chingcha for headings, Anuphan for UI and body text [3fbce66] [964d594]
- Positioning: independent, human-first, with the BMA as host, moderator and oversight admin [b2f7e3c] [5f712a5] [f6808a1]
- Customer profile: "the Rebuilder" as the launch audience [5feb8fe]
- Names: Regular Table (โต๊ะประจำ), Table Host (เจ้าภาพโต๊ะ), My people (คนรู้จัก) [31ecc25]
- Love red #e23744 for the 💘 romance opt-in [568fd2e]
- Thai copy passes: 238 corrections, then ~830 strings against a new Thai voice guide [5175ff5] [30ca8a0]
- Pilot launch playbook (stock example, nothing scheduled) [9a9e593] [badf6cf]

### Website
- Open Graph and X share cards for every page, and one per Bangkok Type in Thai and English [9272405]

### Legal & privacy
- Staff access audit: staff see what safety needs, never a member's private life; consent changes no longer name the member in the audit log [4a9eb34]

### Quiz
- Balance test: 50,000 simulated quiz-takers, and a 5,000-session check on every test run [97d924a]
- Review of what made the quiz feel robotic [27c060c]

---

## [0.8.0] - 2026-10-15 · The curated quiz, Regular Tables and the privacy notice

### Features
- **Regular Tables** become real groups: made when a Table Host is approved, joined by invite link [16488ac] [8a16b44]
- Table seating mixes people instead of sorting them: everyone has an anchor, at most 2 of one type [837e9ba]
- Fewer screens before the first event; about-you after the first RSVP [23e9f80]
- 💘 dating gender identity: a private "Self-described" box, deleted when romance goes off [c9ef81c]
- Moderation queue paging with server search; registrations beyond 2,000 [8dfe196]
- Kaipa partner events removed [b224341] [c5cefd3]

### Quiz
- Curated quiz: the same 16 questions for everyone in a segment, so a retake shows real change [bd2abde]
- Follow-ups (Q7): 1 or 2 only when a letter is close, 18 questions at most [f6ecd12]
- Accuracy before and after: own type 86.3% → 92.4%, weakest type 84.3% → 90.1% [fd38ebb]
- Plain scenarios only; the interactive formats were built and then removed [461a8d7] [b1df64f]
- "None of these are me" on every question, in place of Skip [f174a9b] [a15800a]
- Four optional, unscored "My Bangkok" reflections at the end, editable in Settings [81e0ab2] [2c3dc66]
- New scenarios: 101 Bangkok scenarios (Q2), 30 funny and 20 personality ones, and a "what moves you" sentence (Q3) [83446bb] [97bf28b]
- Fits each member's profile, mode and language (Q5, Task 10) [f122f03] [92dae53]
- Date moments for everyone, romance only for 💘; in-season scenarios first [ffe3e8a] [f50e35a]
- Bank audit, blueprint and stricter bank rules [637eb30] [d640627] [984997f] [039780e]
- Legacy rewrite and a diversity pass on the 47 older scenarios [f62eca6] [c23a41f] [1e2f3bd]
- About 260 places checked against the web, with all 50 districts covered [54b318b] [d17a128] [5ba7019] [d03b572] [5d0de59] [ca650c1]
- The intro says up front how many questions there are and what comes after [3981526]

### UX/UI
- Accessibility (WCAG 2.1 AA) and UX pass across the app and landing [c01becb] [7040d01]
- Inclusive, calmer screens: ticks as well as colour, "2 of 5" on flows, a compact Back [72a4f27]
- Profile edit: sticky section shortcuts and folded interest groups [42adb3d]
- Less empty space on Discover and the event page [247f00e]
- Staff area: table captions, confirm before strikes and bans, sticky headings [fa120c5]
- Reflows down to 320px [aa39f78]

### QOL
- Sticky action bars get a solid ground [a43148c]
- Calendar, directions, countdown, Discover remembers your view, form safety nets [9b74cb1]
- No repeats: a 🪑 Tables tile on Me, one chat per person, people counted once [8c69e5a] [fd5fce6] [7d3f26e]
- Notifications read as an inbox; unique passport stamp codes [b8e08ac]

### Website
- Landing and intro: readable heroes, an h1 and a call to action, a real Next button [0285e8a]

### Legal & privacy
- Final PDPA privacy notice: who runs Jurrgun, what is collected and why, who sees what, how long, your rights [a9ab8b2]

### Fixes
- Profile bio survives being stored as a JSON string [9ff867a]
- No em dashes in staff and host tables [b6caf06]

### Platform
- Flaky tests fixed (seasonal quiz check, weekly rhythm) [fc71e9a] [de66483]
- jurrgun-ui skill: the UI review-and-ship loop for this repo [15c925e] [5318393]

---

## [0.9.0] - 2026-10-16 · Reminders, Quiz health and the finalize review

### Features
- Reminders outside the app: phone notifications the day before a table, hourly clock for retention [6316a7e] [e45f0e0] [df0efa7]
- Offline next table: "What you need on the day" stays readable with no signal [8a47e1a]
- See them again, and a Small tables filter on Discover [393f432]
- 30 hand-written icebreakers for a Bangkok table, Thai first [9935979]
- เกี่ยวก้อย · Pinky: with 💘 on, hook pinkies with someone you met at a table to try a date [14640d7]
- "Still new to Bangkok?" asked once after six months; the friendship milestone celebrates [534094f] [b81c2d3]
- Bangkok Buddy friends only, with a calmer deck and passport [a37bdcf]
- One Sheet for more actions: a bottom sheet on phones and a popover on laptops, works without JS [2365938] [8a2f039] [755ec2a]

### Quiz
- "Does this feel like you?" on the result [c893104]
- Quiz health for staff (/admin/quiz-health), totals only with k = 10 [294f3ac]
- Retakes keep only the last type and date [d6cadb2]

### UX/UI
- Every tap target on member pages is at least 44px [cf193e3]
- Events come first: one sticky Discover bar that shrinks as you scroll [cbc8304]
- Phase 1–3 review: one bottom layer per screen, Me leads with your next table, friends lead the welcome [58c1a8a] [7c00f35] [64aae03] [9c03747] [534f85d] [23eec72]
- Calmer motion: no overshoot or bounce; decorative shapes sit still [51d3e8a] [f5cb935]
- Discover tickets read as one piece, with one calm tint per category [fc2e89f] [1ff95d6]
- One unread style everywhere [082f48a]
- Finalize review: one button family, one fact tile, plain Me cards [a35a57c] [e7924b6] [1331d7b]
- One progress bar through the first-time journey [35eb328]
- Calmer map chrome on Discover [78c6e0f]
- Laptop intro in two columns [d88bedb]
- Profile facts as two-column tiles [e4e5dab] [0fd9bfe]
- Less text on Me, My profile and the event page [18ab616]

### QOL
- Hangout chats show their date in the title [94ab725]
- Me hides "0 events, 0 people" for brand-new members [a0103d2] [944dea5]

### Website
- PRODUCT.md: users, purpose, positioning and principles [1a7a108]

### Fixes
- Notifications: iPhone Safari shows the permission prompt; opting out of reminders is always honoured [e93d2f0] [48bf14d]
- Filming fixes, copy drift, the profile header on phones, email fields styled, laptop Discover layout [a974fbb] [2cebe2d] [a565763] [0a602ac] [b7c4997] [ba901ae]

### Platform
- Feature freeze lifted (new features via decision cards) [c91a192]
- Migrations 0019, 0020 and 0021 shipped ahead of the code that uses them [6316a7e] [9a49354] [53afd3e] [336242e]

---

## [0.10.0] - 2026-10-16 · Email sign-in, social links and the PDPA review (current)

### Features
- Sign in with an email code [a63f070]
- Day-of status and finding the table: the host posts on time, running late and so on; running late tells the host [566af1f] [3e07601] [5d80247]
- Social links on profiles (Instagram, Facebook, LinkedIn, TikTok, X, Threads, website), seen by mutual connections only [df4003a] [c098017] [9cb19d3] [ccb1b41]
- Meeting people the way friendships form: explore, then regulars; a weekly pick for new faces; reliable members get freed seats first [bc3a86f]

### UX/UI
- Lists are one grouped list; open sections instead of a card per section [4581db1] [2a7e825]
- No boxes inside boxes, and flat surfaces [c7d2f7a] [129aabe]
- Me and My profile on laptops back to one centred column [a374bc8]
- Me: "Your next table" reads as a link; no number tiles until you have been out [313f799] [65696e1]

### Quiz
- First-answer order balanced across letters; follow-ups too [beceee9] [314fbe3]
- Quiz health shows 95% ranges and Cohen's kappa for retakes [a9742c1]
- Thai vs English on Quiz health, and a bias benchmark [314fbe3]

### Branding
- Logo: a natural thumb on the waving hand, the palm shows in the header, and the hand waves when you press it [e570540] [228e94c] [0fa7799]

### Legal & privacy
- PDPA risk assessment: data inventory, safeguards, 16 scored risks [f058b00]
- Dating intents only with romance consent, and deleted when romance goes off [eb46773]
- Every consent offered is honoured [5562b06]
- Account deletion reaches every table; retention periods for reports, strikes, audit log and notifications [3ba2285]
- A hidden Bangkok Type stays hidden on the buddy deck; the audit log never names the other person [8225006]
- IPs and sign-in usernames stored only as keyed hashes [b7da10b]
- Fuller data export [640e0be]
- Privacy notice rewritten line by line to match the code, Thai first [75290c8] [188f692] [43b692a] [5416442]
- Privacy contact is the Jurrgun team (placeholder address for now) [add6bb0]
- Legal review fixes: a Terms box at sign-up, research coded, service and safety not shown as consents [bc90da3] [a038582]
- Tests for every privacy promise [aead1ca]

### Fixes
- ⋯ menu stays on screen on laptops; buddy buttons side by side; slider markers and card headings in place [9375562] [a081885] [0beef70] [d90d6e7]
- Station names checked against the official lists [d3a1435]

### Platform
- Migration 0022 for profile links [df4003a]
- CI: typecheck and the full suite run on GitHub for `ci/*` branches [b144cbe]

---

[0.0.1]: https://github.com/thesandoman/jurrgun/compare/29cf49a...85e6dc7
[0.1.0]: https://github.com/thesandoman/jurrgun/compare/85e6dc7...1ccb922
[0.2.0]: https://github.com/thesandoman/jurrgun/compare/1ccb922...673bc4e
[0.3.0]: https://github.com/thesandoman/jurrgun/compare/673bc4e...ae4da38
[0.4.0]: https://github.com/thesandoman/jurrgun/compare/ae4da38...e206a8a
[0.5.0]: https://github.com/thesandoman/jurrgun/compare/e206a8a...46babd6
[0.6.0]: https://github.com/thesandoman/jurrgun/compare/46babd6...703ea66
[0.7.0]: https://github.com/thesandoman/jurrgun/compare/703ea66...88287bd
[0.8.0]: https://github.com/thesandoman/jurrgun/compare/88287bd...b6caf06
[0.9.0]: https://github.com/thesandoman/jurrgun/compare/b6caf06...0fd9bfe
[0.10.0]: https://github.com/thesandoman/jurrgun/compare/0fd9bfe...bc3a86f

<!-- commit links -->
[29cf49a]: https://github.com/thesandoman/jurrgun/commit/29cf49a
[85e6dc7]: https://github.com/thesandoman/jurrgun/commit/85e6dc7
[775958f]: https://github.com/thesandoman/jurrgun/commit/775958f
[21e9783]: https://github.com/thesandoman/jurrgun/commit/21e9783
[f47f4e3]: https://github.com/thesandoman/jurrgun/commit/f47f4e3
[1ccb922]: https://github.com/thesandoman/jurrgun/commit/1ccb922
[19d2bbe]: https://github.com/thesandoman/jurrgun/commit/19d2bbe
[b6f233e]: https://github.com/thesandoman/jurrgun/commit/b6f233e
[1222403]: https://github.com/thesandoman/jurrgun/commit/1222403
[54e2f0b]: https://github.com/thesandoman/jurrgun/commit/54e2f0b
[87e76cd]: https://github.com/thesandoman/jurrgun/commit/87e76cd
[0ca2e30]: https://github.com/thesandoman/jurrgun/commit/0ca2e30
[481f1c4]: https://github.com/thesandoman/jurrgun/commit/481f1c4
[1362962]: https://github.com/thesandoman/jurrgun/commit/1362962
[3368299]: https://github.com/thesandoman/jurrgun/commit/3368299
[5691cf9]: https://github.com/thesandoman/jurrgun/commit/5691cf9
[39f9e67]: https://github.com/thesandoman/jurrgun/commit/39f9e67
[673bc4e]: https://github.com/thesandoman/jurrgun/commit/673bc4e
[75605f3]: https://github.com/thesandoman/jurrgun/commit/75605f3
[f9d4809]: https://github.com/thesandoman/jurrgun/commit/f9d4809
[3c3e35c]: https://github.com/thesandoman/jurrgun/commit/3c3e35c
[47471c1]: https://github.com/thesandoman/jurrgun/commit/47471c1
[4134ee3]: https://github.com/thesandoman/jurrgun/commit/4134ee3
[a9b272e]: https://github.com/thesandoman/jurrgun/commit/a9b272e
[6eb1a7c]: https://github.com/thesandoman/jurrgun/commit/6eb1a7c
[efc025f]: https://github.com/thesandoman/jurrgun/commit/efc025f
[fa054ae]: https://github.com/thesandoman/jurrgun/commit/fa054ae
[8a7d8dd]: https://github.com/thesandoman/jurrgun/commit/8a7d8dd
[5128cca]: https://github.com/thesandoman/jurrgun/commit/5128cca
[9bd1ec8]: https://github.com/thesandoman/jurrgun/commit/9bd1ec8
[b29ee4c]: https://github.com/thesandoman/jurrgun/commit/b29ee4c
[0464183]: https://github.com/thesandoman/jurrgun/commit/0464183
[582b4b2]: https://github.com/thesandoman/jurrgun/commit/582b4b2
[65ce634]: https://github.com/thesandoman/jurrgun/commit/65ce634
[0851d7c]: https://github.com/thesandoman/jurrgun/commit/0851d7c
[d2c2d82]: https://github.com/thesandoman/jurrgun/commit/d2c2d82
[7370124]: https://github.com/thesandoman/jurrgun/commit/7370124
[27e4e81]: https://github.com/thesandoman/jurrgun/commit/27e4e81
[75726f0]: https://github.com/thesandoman/jurrgun/commit/75726f0
[b67317a]: https://github.com/thesandoman/jurrgun/commit/b67317a
[2f08d9d]: https://github.com/thesandoman/jurrgun/commit/2f08d9d
[df215fd]: https://github.com/thesandoman/jurrgun/commit/df215fd
[c75769f]: https://github.com/thesandoman/jurrgun/commit/c75769f
[c58fecb]: https://github.com/thesandoman/jurrgun/commit/c58fecb
[ae4da38]: https://github.com/thesandoman/jurrgun/commit/ae4da38
[28a8ea1]: https://github.com/thesandoman/jurrgun/commit/28a8ea1
[76cfd01]: https://github.com/thesandoman/jurrgun/commit/76cfd01
[28e31d1]: https://github.com/thesandoman/jurrgun/commit/28e31d1
[e95d0db]: https://github.com/thesandoman/jurrgun/commit/e95d0db
[e206a8a]: https://github.com/thesandoman/jurrgun/commit/e206a8a
[e90b88d]: https://github.com/thesandoman/jurrgun/commit/e90b88d
[61da1a5]: https://github.com/thesandoman/jurrgun/commit/61da1a5
[20f1441]: https://github.com/thesandoman/jurrgun/commit/20f1441
[46babd6]: https://github.com/thesandoman/jurrgun/commit/46babd6
[0d95a97]: https://github.com/thesandoman/jurrgun/commit/0d95a97
[2cfbc51]: https://github.com/thesandoman/jurrgun/commit/2cfbc51
[ee9180d]: https://github.com/thesandoman/jurrgun/commit/ee9180d
[16865f8]: https://github.com/thesandoman/jurrgun/commit/16865f8
[70f9417]: https://github.com/thesandoman/jurrgun/commit/70f9417
[e5add9d]: https://github.com/thesandoman/jurrgun/commit/e5add9d
[0824e90]: https://github.com/thesandoman/jurrgun/commit/0824e90
[43e59a4]: https://github.com/thesandoman/jurrgun/commit/43e59a4
[2f5722c]: https://github.com/thesandoman/jurrgun/commit/2f5722c
[4a721ec]: https://github.com/thesandoman/jurrgun/commit/4a721ec
[b984b4a]: https://github.com/thesandoman/jurrgun/commit/b984b4a
[03a8f95]: https://github.com/thesandoman/jurrgun/commit/03a8f95
[9433ae5]: https://github.com/thesandoman/jurrgun/commit/9433ae5
[6753784]: https://github.com/thesandoman/jurrgun/commit/6753784
[e64bf52]: https://github.com/thesandoman/jurrgun/commit/e64bf52
[427dc1c]: https://github.com/thesandoman/jurrgun/commit/427dc1c
[60bcc35]: https://github.com/thesandoman/jurrgun/commit/60bcc35
[b7bdde2]: https://github.com/thesandoman/jurrgun/commit/b7bdde2
[32e8291]: https://github.com/thesandoman/jurrgun/commit/32e8291
[43b132e]: https://github.com/thesandoman/jurrgun/commit/43b132e
[32d3451]: https://github.com/thesandoman/jurrgun/commit/32d3451
[926c94a]: https://github.com/thesandoman/jurrgun/commit/926c94a
[4039bb5]: https://github.com/thesandoman/jurrgun/commit/4039bb5
[c1ab4fe]: https://github.com/thesandoman/jurrgun/commit/c1ab4fe
[703ea66]: https://github.com/thesandoman/jurrgun/commit/703ea66
[cb89ea1]: https://github.com/thesandoman/jurrgun/commit/cb89ea1
[29e578c]: https://github.com/thesandoman/jurrgun/commit/29e578c
[100c263]: https://github.com/thesandoman/jurrgun/commit/100c263
[2bf29a8]: https://github.com/thesandoman/jurrgun/commit/2bf29a8
[f3a6c35]: https://github.com/thesandoman/jurrgun/commit/f3a6c35
[ae24ac6]: https://github.com/thesandoman/jurrgun/commit/ae24ac6
[d937596]: https://github.com/thesandoman/jurrgun/commit/d937596
[b1e94d1]: https://github.com/thesandoman/jurrgun/commit/b1e94d1
[3fbce66]: https://github.com/thesandoman/jurrgun/commit/3fbce66
[964d594]: https://github.com/thesandoman/jurrgun/commit/964d594
[b2f7e3c]: https://github.com/thesandoman/jurrgun/commit/b2f7e3c
[5f712a5]: https://github.com/thesandoman/jurrgun/commit/5f712a5
[f6808a1]: https://github.com/thesandoman/jurrgun/commit/f6808a1
[5feb8fe]: https://github.com/thesandoman/jurrgun/commit/5feb8fe
[31ecc25]: https://github.com/thesandoman/jurrgun/commit/31ecc25
[568fd2e]: https://github.com/thesandoman/jurrgun/commit/568fd2e
[5175ff5]: https://github.com/thesandoman/jurrgun/commit/5175ff5
[30ca8a0]: https://github.com/thesandoman/jurrgun/commit/30ca8a0
[9a9e593]: https://github.com/thesandoman/jurrgun/commit/9a9e593
[badf6cf]: https://github.com/thesandoman/jurrgun/commit/badf6cf
[9272405]: https://github.com/thesandoman/jurrgun/commit/9272405
[4a9eb34]: https://github.com/thesandoman/jurrgun/commit/4a9eb34
[97d924a]: https://github.com/thesandoman/jurrgun/commit/97d924a
[27c060c]: https://github.com/thesandoman/jurrgun/commit/27c060c
[16488ac]: https://github.com/thesandoman/jurrgun/commit/16488ac
[8a16b44]: https://github.com/thesandoman/jurrgun/commit/8a16b44
[837e9ba]: https://github.com/thesandoman/jurrgun/commit/837e9ba
[23e9f80]: https://github.com/thesandoman/jurrgun/commit/23e9f80
[c9ef81c]: https://github.com/thesandoman/jurrgun/commit/c9ef81c
[8dfe196]: https://github.com/thesandoman/jurrgun/commit/8dfe196
[b224341]: https://github.com/thesandoman/jurrgun/commit/b224341
[c5cefd3]: https://github.com/thesandoman/jurrgun/commit/c5cefd3
[bd2abde]: https://github.com/thesandoman/jurrgun/commit/bd2abde
[f6ecd12]: https://github.com/thesandoman/jurrgun/commit/f6ecd12
[fd38ebb]: https://github.com/thesandoman/jurrgun/commit/fd38ebb
[461a8d7]: https://github.com/thesandoman/jurrgun/commit/461a8d7
[b1df64f]: https://github.com/thesandoman/jurrgun/commit/b1df64f
[f174a9b]: https://github.com/thesandoman/jurrgun/commit/f174a9b
[a15800a]: https://github.com/thesandoman/jurrgun/commit/a15800a
[81e0ab2]: https://github.com/thesandoman/jurrgun/commit/81e0ab2
[2c3dc66]: https://github.com/thesandoman/jurrgun/commit/2c3dc66
[83446bb]: https://github.com/thesandoman/jurrgun/commit/83446bb
[97bf28b]: https://github.com/thesandoman/jurrgun/commit/97bf28b
[f122f03]: https://github.com/thesandoman/jurrgun/commit/f122f03
[92dae53]: https://github.com/thesandoman/jurrgun/commit/92dae53
[ffe3e8a]: https://github.com/thesandoman/jurrgun/commit/ffe3e8a
[f50e35a]: https://github.com/thesandoman/jurrgun/commit/f50e35a
[637eb30]: https://github.com/thesandoman/jurrgun/commit/637eb30
[d640627]: https://github.com/thesandoman/jurrgun/commit/d640627
[984997f]: https://github.com/thesandoman/jurrgun/commit/984997f
[039780e]: https://github.com/thesandoman/jurrgun/commit/039780e
[f62eca6]: https://github.com/thesandoman/jurrgun/commit/f62eca6
[c23a41f]: https://github.com/thesandoman/jurrgun/commit/c23a41f
[1e2f3bd]: https://github.com/thesandoman/jurrgun/commit/1e2f3bd
[54b318b]: https://github.com/thesandoman/jurrgun/commit/54b318b
[d17a128]: https://github.com/thesandoman/jurrgun/commit/d17a128
[5ba7019]: https://github.com/thesandoman/jurrgun/commit/5ba7019
[d03b572]: https://github.com/thesandoman/jurrgun/commit/d03b572
[5d0de59]: https://github.com/thesandoman/jurrgun/commit/5d0de59
[ca650c1]: https://github.com/thesandoman/jurrgun/commit/ca650c1
[3981526]: https://github.com/thesandoman/jurrgun/commit/3981526
[c01becb]: https://github.com/thesandoman/jurrgun/commit/c01becb
[7040d01]: https://github.com/thesandoman/jurrgun/commit/7040d01
[72a4f27]: https://github.com/thesandoman/jurrgun/commit/72a4f27
[42adb3d]: https://github.com/thesandoman/jurrgun/commit/42adb3d
[247f00e]: https://github.com/thesandoman/jurrgun/commit/247f00e
[fa120c5]: https://github.com/thesandoman/jurrgun/commit/fa120c5
[aa39f78]: https://github.com/thesandoman/jurrgun/commit/aa39f78
[a43148c]: https://github.com/thesandoman/jurrgun/commit/a43148c
[9b74cb1]: https://github.com/thesandoman/jurrgun/commit/9b74cb1
[8c69e5a]: https://github.com/thesandoman/jurrgun/commit/8c69e5a
[fd5fce6]: https://github.com/thesandoman/jurrgun/commit/fd5fce6
[7d3f26e]: https://github.com/thesandoman/jurrgun/commit/7d3f26e
[b8e08ac]: https://github.com/thesandoman/jurrgun/commit/b8e08ac
[0285e8a]: https://github.com/thesandoman/jurrgun/commit/0285e8a
[a9ab8b2]: https://github.com/thesandoman/jurrgun/commit/a9ab8b2
[9ff867a]: https://github.com/thesandoman/jurrgun/commit/9ff867a
[b6caf06]: https://github.com/thesandoman/jurrgun/commit/b6caf06
[fc71e9a]: https://github.com/thesandoman/jurrgun/commit/fc71e9a
[de66483]: https://github.com/thesandoman/jurrgun/commit/de66483
[15c925e]: https://github.com/thesandoman/jurrgun/commit/15c925e
[5318393]: https://github.com/thesandoman/jurrgun/commit/5318393
[6316a7e]: https://github.com/thesandoman/jurrgun/commit/6316a7e
[e45f0e0]: https://github.com/thesandoman/jurrgun/commit/e45f0e0
[df0efa7]: https://github.com/thesandoman/jurrgun/commit/df0efa7
[8a47e1a]: https://github.com/thesandoman/jurrgun/commit/8a47e1a
[393f432]: https://github.com/thesandoman/jurrgun/commit/393f432
[9935979]: https://github.com/thesandoman/jurrgun/commit/9935979
[14640d7]: https://github.com/thesandoman/jurrgun/commit/14640d7
[534094f]: https://github.com/thesandoman/jurrgun/commit/534094f
[b81c2d3]: https://github.com/thesandoman/jurrgun/commit/b81c2d3
[a37bdcf]: https://github.com/thesandoman/jurrgun/commit/a37bdcf
[2365938]: https://github.com/thesandoman/jurrgun/commit/2365938
[8a2f039]: https://github.com/thesandoman/jurrgun/commit/8a2f039
[755ec2a]: https://github.com/thesandoman/jurrgun/commit/755ec2a
[c893104]: https://github.com/thesandoman/jurrgun/commit/c893104
[294f3ac]: https://github.com/thesandoman/jurrgun/commit/294f3ac
[d6cadb2]: https://github.com/thesandoman/jurrgun/commit/d6cadb2
[cf193e3]: https://github.com/thesandoman/jurrgun/commit/cf193e3
[cbc8304]: https://github.com/thesandoman/jurrgun/commit/cbc8304
[58c1a8a]: https://github.com/thesandoman/jurrgun/commit/58c1a8a
[7c00f35]: https://github.com/thesandoman/jurrgun/commit/7c00f35
[64aae03]: https://github.com/thesandoman/jurrgun/commit/64aae03
[9c03747]: https://github.com/thesandoman/jurrgun/commit/9c03747
[534f85d]: https://github.com/thesandoman/jurrgun/commit/534f85d
[23eec72]: https://github.com/thesandoman/jurrgun/commit/23eec72
[51d3e8a]: https://github.com/thesandoman/jurrgun/commit/51d3e8a
[f5cb935]: https://github.com/thesandoman/jurrgun/commit/f5cb935
[fc2e89f]: https://github.com/thesandoman/jurrgun/commit/fc2e89f
[1ff95d6]: https://github.com/thesandoman/jurrgun/commit/1ff95d6
[082f48a]: https://github.com/thesandoman/jurrgun/commit/082f48a
[a35a57c]: https://github.com/thesandoman/jurrgun/commit/a35a57c
[e7924b6]: https://github.com/thesandoman/jurrgun/commit/e7924b6
[1331d7b]: https://github.com/thesandoman/jurrgun/commit/1331d7b
[35eb328]: https://github.com/thesandoman/jurrgun/commit/35eb328
[78c6e0f]: https://github.com/thesandoman/jurrgun/commit/78c6e0f
[d88bedb]: https://github.com/thesandoman/jurrgun/commit/d88bedb
[e4e5dab]: https://github.com/thesandoman/jurrgun/commit/e4e5dab
[0fd9bfe]: https://github.com/thesandoman/jurrgun/commit/0fd9bfe
[18ab616]: https://github.com/thesandoman/jurrgun/commit/18ab616
[94ab725]: https://github.com/thesandoman/jurrgun/commit/94ab725
[a0103d2]: https://github.com/thesandoman/jurrgun/commit/a0103d2
[944dea5]: https://github.com/thesandoman/jurrgun/commit/944dea5
[1a7a108]: https://github.com/thesandoman/jurrgun/commit/1a7a108
[e93d2f0]: https://github.com/thesandoman/jurrgun/commit/e93d2f0
[48bf14d]: https://github.com/thesandoman/jurrgun/commit/48bf14d
[a974fbb]: https://github.com/thesandoman/jurrgun/commit/a974fbb
[2cebe2d]: https://github.com/thesandoman/jurrgun/commit/2cebe2d
[a565763]: https://github.com/thesandoman/jurrgun/commit/a565763
[0a602ac]: https://github.com/thesandoman/jurrgun/commit/0a602ac
[b7c4997]: https://github.com/thesandoman/jurrgun/commit/b7c4997
[ba901ae]: https://github.com/thesandoman/jurrgun/commit/ba901ae
[c91a192]: https://github.com/thesandoman/jurrgun/commit/c91a192
[9a49354]: https://github.com/thesandoman/jurrgun/commit/9a49354
[53afd3e]: https://github.com/thesandoman/jurrgun/commit/53afd3e
[336242e]: https://github.com/thesandoman/jurrgun/commit/336242e
[a63f070]: https://github.com/thesandoman/jurrgun/commit/a63f070
[566af1f]: https://github.com/thesandoman/jurrgun/commit/566af1f
[3e07601]: https://github.com/thesandoman/jurrgun/commit/3e07601
[5d80247]: https://github.com/thesandoman/jurrgun/commit/5d80247
[df4003a]: https://github.com/thesandoman/jurrgun/commit/df4003a
[c098017]: https://github.com/thesandoman/jurrgun/commit/c098017
[9cb19d3]: https://github.com/thesandoman/jurrgun/commit/9cb19d3
[ccb1b41]: https://github.com/thesandoman/jurrgun/commit/ccb1b41
[bc3a86f]: https://github.com/thesandoman/jurrgun/commit/bc3a86f
[4581db1]: https://github.com/thesandoman/jurrgun/commit/4581db1
[2a7e825]: https://github.com/thesandoman/jurrgun/commit/2a7e825
[c7d2f7a]: https://github.com/thesandoman/jurrgun/commit/c7d2f7a
[129aabe]: https://github.com/thesandoman/jurrgun/commit/129aabe
[a374bc8]: https://github.com/thesandoman/jurrgun/commit/a374bc8
[313f799]: https://github.com/thesandoman/jurrgun/commit/313f799
[65696e1]: https://github.com/thesandoman/jurrgun/commit/65696e1
[beceee9]: https://github.com/thesandoman/jurrgun/commit/beceee9
[314fbe3]: https://github.com/thesandoman/jurrgun/commit/314fbe3
[a9742c1]: https://github.com/thesandoman/jurrgun/commit/a9742c1
[e570540]: https://github.com/thesandoman/jurrgun/commit/e570540
[228e94c]: https://github.com/thesandoman/jurrgun/commit/228e94c
[0fa7799]: https://github.com/thesandoman/jurrgun/commit/0fa7799
[f058b00]: https://github.com/thesandoman/jurrgun/commit/f058b00
[eb46773]: https://github.com/thesandoman/jurrgun/commit/eb46773
[5562b06]: https://github.com/thesandoman/jurrgun/commit/5562b06
[3ba2285]: https://github.com/thesandoman/jurrgun/commit/3ba2285
[8225006]: https://github.com/thesandoman/jurrgun/commit/8225006
[b7da10b]: https://github.com/thesandoman/jurrgun/commit/b7da10b
[640e0be]: https://github.com/thesandoman/jurrgun/commit/640e0be
[75290c8]: https://github.com/thesandoman/jurrgun/commit/75290c8
[188f692]: https://github.com/thesandoman/jurrgun/commit/188f692
[43b692a]: https://github.com/thesandoman/jurrgun/commit/43b692a
[5416442]: https://github.com/thesandoman/jurrgun/commit/5416442
[add6bb0]: https://github.com/thesandoman/jurrgun/commit/add6bb0
[bc90da3]: https://github.com/thesandoman/jurrgun/commit/bc90da3
[a038582]: https://github.com/thesandoman/jurrgun/commit/a038582
[aead1ca]: https://github.com/thesandoman/jurrgun/commit/aead1ca
[9375562]: https://github.com/thesandoman/jurrgun/commit/9375562
[a081885]: https://github.com/thesandoman/jurrgun/commit/a081885
[0beef70]: https://github.com/thesandoman/jurrgun/commit/0beef70
[d90d6e7]: https://github.com/thesandoman/jurrgun/commit/d90d6e7
[d3a1435]: https://github.com/thesandoman/jurrgun/commit/d3a1435
[b144cbe]: https://github.com/thesandoman/jurrgun/commit/b144cbe
