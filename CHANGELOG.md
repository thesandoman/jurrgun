# Changelog

Everything that has shipped in Jurrgun (เจอกัน), from the first commit to now,
oldest version first. Every line links to its commit on GitHub, and each
version links to the full diff.

These versions were assigned afterwards, one per milestone. Each one has a
git tag (`v0.1.0` and so on) and a
[GitHub Release](https://github.com/thesandoman/jurrgun/releases) with the same notes. Internal "Project state" notes, merge commits and reverted
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

## [0.10.0] - 2026-10-16 · Email sign-in, social links and the PDPA review

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

## [0.11.0] - 2026-10-16 → 10-17 · Say hi first, host announcements and one palette

### Features
- **Say hi first** and **Who finishes**: from 36 hours before a meetup, people going can answer one light prompt for their table [9b72042] [e96aacb]
- **Host announcements**: hosts, organisers and BMA admins send an Update, Time changed, Venue moved or Cancelled to everyone going [cf92b52] [52544bc] [4148e81]
- Evening summary: non-urgent notifications (thank-yous, new connections, plan ideas, plain host updates) come together once in the evening [18a0a85] [4148e81]
- Buddy deck without swiping: each person is a card you read, leading with their own words and what you share [7bbfab7]
- Discover list leads with Popular picks and Top 10 this week [33a1b54]

### UX/UI
- Event page: a status strip under the title says where you stand and the one next action [2242b11]
- Laptop event page: details on the left, a sticky rail with the next action and My registration on the right [4290a63]
- My people: a New messages group at the top when chats are unread [334c408]
- Chats list shows a photo or initial for people, and the category emoji for hangouts and Regular Tables [3b50591]
- My events: older past events fold into one Show all row [add117a]
- Unread on the bell and the My people tab is a small dot (screen readers still hear the count) [ac084c8]
- 💘 row in settings: no pink box; a love-red switch and a small "💘 On" tag [d50c9c4]

### Branding
- One colour palette for the whole app, lighter and friendlier: no yellow or cream tints, teal for food and nights, light mint for the city [fd8291a] [b787aa2] [22e835c] [5347d4b]
- Thai type: no letter-spacing on Thai text and taller line-height so tone marks fit [f807e56]
- Copy: My events is นัดของฉัน everywhere; English booking and pass wording fixed [11f3fd8] [f05e8f1]

### Legal & privacy
- Compliance documents, including a one-page personal data breach plan (PDPA s37(4)) [728e003]
- Privacy notice and code agree: contact shares deleted on removal and block, research answers deleted at deactivation, fuller export [5750b53] [831fa15]
- Consent centre names what personalization actually uses [c14edc6]
- Sign-in throttling comment corrected: keyed HMACs, not plain SHA-256 [0ff0ca8]

### Fixes
- Colour contrast on muted tags, stickers, avatar initials and passport stamps [74a81a1]
- My profile on phones: Answer prompts no longer covers the district line; birthday label lines up [d05f7d4] [70cb47e]
- Buddy card keeps a readable width on laptops [4b36048]

### Platform
- Migrations 0023 (hello line) and 0024 (event announcements) [9b72042] [cf92b52]
- Mastermind skill: one entry point for UI and UX work [8ca449b]
- Tests: retention and clock files run on their own; steadier day-of and consent fixtures [c31fc18] [79c7d3d] [dde473a]
- Design checker exception for the demo page [39f6beb]

---

## [0.12.0] - 2026-10-17 → 10-18 · Editing your profile

### Features
- **Edit in place** on my profile: each section has a ✏️ that opens a sheet with only that section's fields [6158523]
- "Edit | How others see it" switch: preview your card from what you've typed, saved or not [31493aa]
- Edit profile saves one section at a time, each with its own Save [9bdec6d]
- Old "Send a notice" form removed; hosts use announcements instead [f2dd8ba]

### UX/UI
- Profile view: one glance strip of up to 6 emoji facts, the top 2 prompt answers, the rest in dropdowns [9ece912] [64634ed]
- Edit profile: basics first, optional sections behind More [695bd28]

### QOL
- Edit profile ergonomics: errors next to their field, nothing typed is lost, photo preview with undo [9847942] [b0ec7a5]

### Fixes
- Regular tables dropdown reads "Regular at 1 table" / "ขาประจำ 1 โต๊ะ" [73fe187]

---

## [0.13.0] - 2026-10-20 · Outside events, partners and City Pulse

### Features
- **Go-together tables for outside events**: Discover cards say where the ticket comes from and where the table meets; the event page shows the meeting time, the show's own time and place, and a Ticket on <source> button. Everyone buys their own ticket there [a611abf]
- **Outside events in**: hosts paste an event link and the form fills itself from the page's own event description (robots.txt honoured, never for platforms whose terms we couldn't confirm); admins add calendar feeds read once a day into a host inbox [c7a1280]
- **Verified partners**: organisations apply, a moderator verifies them, and they get a partner area with Jurrgun-issued keys (hashed, revocable), booking counts only and an API for go-together events with a named host [c7a1280]
- **Calendar feeds out**: a private, resettable calendar link per member, and a public iCal and JSON-LD feed of public events (never 💘 ones) [c7a1280]
- **Health and public-sector partners**: set up by an admin only. Health events are free with no ticket link. Private talks have no attendee list and take anonymous questions; partners see numbers only from 10 people up [573cd91]
- **Collab events**: a partner can invite up to 2 co-hosts; the event shows once each has answered and names every partner [573cd91]
- **Entry rules**: alcohol served (then 20+) and smoke-free labels with filters, Open entry with Join a group, organiser approval (Requested until the host answers), join-code groups, things to bring, and a short disclaimer ticked before booking [573cd91]
- **City Pulse home**: a City Pulse button in the top bar opens its own home: this week's questions one at a time (at most 3 a week, no counts or streaks), what the city heard (shares from 10 answers up), a staff note on what changed, Bangkok now (heat, rain, PM2.5), your own answers with Take back, and What should the city ask? [aa71ae2]
- After an event, members with research consent get 2 optional place questions [aa71ae2]

### Legal & privacy
- Owner decisions D45 to D66 recorded: outside sources and their terms, partner verification, the 20+ alcohol rule, no vaping, cannabis or other drugs in the code of conduct, women and non-binary only events need a woman or non-binary host [f715693] [4046f9d] [7ecfd3e] [573cd91]
- City Pulse research tables hold no person and follow the 24-month research retention; the privacy notice lists them [aa71ae2]

### Platform
- Migrations 0025 (outside events), 0026 (partners, collab and entry rules) and 0027 (City Pulse home), each shipped alone before its code [959a964] [ef2ad5e] [93f9ba9]
- Mastermind becomes a user-level local plugin; jurrgun-ui stays a project skill [188a456] [1f40967]

---

## [0.14.0] - 2026-10-26 · Moderation, 💘 privacy, City Pulse for the BMA and a lighter app

### Features
- **City Pulse for the BMA**: counts rounded to 5, open questions show a daily snapshot, unsorted suggestions wiped 60 days after their month, and a monthly round-up with an audited CSV [9bd7a66] [50e5551] [d27d92b] [e34baca]
- **Who sees who at an event**: one shared rule decides names, seat codes or counts for staff, hosts and partners. On 💘 events, staff and partners see counts rounded to 5 and hosts see seat codes only [17f5349] [79fbb42]
- **Pinky**: looks the same on everyone; 💘 off withdraws picks; no re-tap after Back to friends; a first-date safety line and the 💘 consent explainer [4ec6bcd] [741d3b8] [6908f78] [3a4fe05]
- A 💘 event is never limited to a group, and dating co-hosts can't join a group's event [62b72db]
- Paused events: a pulled event keeps booked members on a read-only page, with no pass or check-in [95f5870]
- Discover map: landscape side panel, the Key moves into Filters, chips fade with +N, a live search count, laptops open the list, a Show all pill and a real empty state [e4b685a] [5db6d48] [73405d9] [424dd38] [f2514ba] [5927021] [6585a06] [d303951] [1e078ae] [613ec16] [c7317c9]
- University search reads from the database [e902c27]

### UX/UI
- Phones: no page scrolls sideways any more, safe areas around the notch and home indicator, focus never hidden behind the bars, 44px targets, 8px gaps and a number keypad for number fields [6d556c2] [60e33a2] [138e540] [5c441cd] [d8033de] [b0b49a0] [4bb86f9]
- Chat keeps a refused message; caption and poll fields have labels; buttons say what they send [96c85ac] [4442569] [6313ae1]
- Dark-mode 💘 love-ink reads red, not pink [44b5bcc]

### Trust & safety
- Staff powers: only admins grant partner admin or trusted host; reports about staff go to admins; report limits, with alerts for critical reports only [1f864df]
- Moderators can't dismiss or note reports about themselves or an admin; table moves and +1 links refuse blocked pairs [6c4a63d]
- Evidence hold: a reported chat photo is kept until the report closes [c678bc9]
- Outcome notices name the rule; a banned member can ask once for another look; reporters hear the outcome [219822e]
- A suspension gives back its seats to the waitlist [485e6e3]

### Legal & privacy
- Privacy notice dated 26 October 2026: members agree to the updated Terms once, on one card that says what changed [6843f07] [32eaa72]
- A reported member's participation history shows 💘 events as "A private event" to every staff role [b90a693] [c3c8d7d]
- Audit log kept 2 years; research withdrawal says what it can't reach [c678bc9] [d27d92b]

### Website
- SEO and AEO basics: robots.txt, sitemap.xml, llms.txt, canonical and th/en hreflang, noindex off the public pages, FAQ and Organization JSON-LD [6603b19] [e730fa4] [c486318] [71aae68]
- First-touch ?src= capture on /quiz and event pages [459c806]

### Platform
- Migrations 0028 (empty-district alert) and 0029 (universities), applied in production; a test fails any migration that drops or truncates [c5669db] [e6bbed0] [5a7caf5]
- University list moves from the Worker bundle to the database: -443 KB raw, 10,270 rows loaded [33adbba] [e902c27] [bb8490e]
- settings, events and admin/events routes split into folders of smaller modules (pure moves) [028a02e] [b78e3ae] [d67e0f0]
- The public Bangkok Vibe prototype API is retired [03846b5]
- Tests: the landing check expects a real 200 from /login [a2b3db6]; a local persona seeder for demos [6ad070a]

---

## [0.15.0] - 2026-10-26 → 10-30 · Pinky Plans, privacy and security hardening, the landing page and Discover at / (current)

### Features
- **Pinky Plans**: a mutual Pinky opens a private space for the two of you, with a shared plan both confirm, one shared note, curated real-place date ideas, Pause and End kindly; the safety page prefills where and when [d83c658] [b0da6ea] [8b61bb4] [c818e01] [1342c7b] [e1d6748]
- Buddy-to-partner Pinky on a Bangkok Buddy pairing, and a "last buddy" card for 7 days after it ends [c032428]
- **Discover lives at /** for signed-in members; old /events links redirect [5b21b00]
- **Empty-district alert**: opt in to a weekly note when a table opens in your district, with one-tap off and a Settings switch [88bc3f8] [30da949] [493d343] [088088e] [5a35e8a] [7b21a73] [e194d5f]
- **Signed-in devices**: see your devices (kind and dates only), sign out everywhere else; unused devices sign out after 14 days [cfa290c] [504833b]
- Bangkok now (weather, Sanroo headline) comes from the hourly clock, shown with "as of" [0b1b38d] [a2c1aa1]
- City Insight: landings per campaign code by week, and table fill [d294102] [70202f5] [104b37a]

### UX/UI
- **New landing page and intro** (owner cards 1 to 7): one "Find my first table" start, a bigger headline, an honest three-step bento, flat tiles, three doors including a new /local page, one quiet BMA line, and /intro as three optional slides [bdbcde5] [b4e0940] [67b7133] [32d8566] [4191bb7] [d130bee] [ef49e57] [b6f67ec] [cf5e176] [069c2b0] [1d4b82d]
- Phones: one RSVP bar, a host Send bar in reach, a top bar that fits from 360px, 48px primary actions, dots instead of counts, Me opens with one line [0698402] [ac06ce3] [cdeb964] [f90795a] [8385422] [45d374f] [28db45d] [68341cc] [b95131a]
- Laptops and tablets: one RSVP on laptops, the bottom RSVP bar on tablets, folded host form sections [81b9897] [21c51e4] [5048236] [2a9a65e] [00815ac]
- Large text: ticket cards reflow, the tab bar shows icons with the current label, heading gaps capped, the wordmark folds away [f39611b] [62a2244] [daf7974] [06b3276] [c1affa7]
- Discover: an honest empty city; a picked event in the Top 10 keeps its ⭐ tag; 44px map chips and legend toggle [1239b41] [f8fceea] [c8c1532] [8381700]

### Trust & safety
- Waive notes use a fixed reason and never name anyone else [f07b40b]
- Sign-in lockout can no longer be used to lock someone else out; current-password guesses are limited; sign-in timing reveals nothing [0d4fa32] [1d6311f]
- Demo and test accounts stay out of staff figures, member views, buddy rounds and Pinky [70779bb] [94abad4] [44e6d28] [eca17fc]

### Legal & privacy
- **Privacy notice dated 30 October 2026**: members accept it once; it covers Pinky, photo metadata, self-hosted fonts, signed-in devices and campaign link counts [fcdbd17] [e2f53b4] [c1f2845] [61eabdf] [b1b76b9] [3989929]
- Photos lose their location and camera details on upload, including those already stored [3c287d5]
- Security headers on every response and a content security policy (report-only) with per-response nonces; no inline handlers left [8e61928] [5e8f7a5]
- Atkinson Hyperlegible is self-hosted: Google Fonts is gone [11c14d0]
- BMA figures are rounded and can't be worked out by subtraction, City Pulse included [ee1a2cd] [7d5cece]
- The data export includes moderation actions, still-in-touch answers and waive reasons; consent history fold-out [d6c6e83] [903e01d] [e34b165]
- Deactivating ends a Pinky at once; the friend share keeps where and when out of the URL query [e8d5826]

### Website
- Search Console verification; signed-out / and /local indexable and in the sitemap and llms.txt [e8b3c62] [471a8d1] [35c944c] [9f596a2]

### Platform
- The hourly clock heals itself, is on by default, and /admin and /api/health say when it last ran [b1e2314] [ccd770e] [7a73d66]
- Migrations are all-or-nothing transactions; 0028 to 0034 applied [31ea997]
- sv-map vendored into the repo [808c5d9]
- Tests: order-dependent Discover tests search for their own events; buddy rounds run sequentially [fc3df9c] [9d3e62d] [2b3a11d]

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
[0.11.0]: https://github.com/thesandoman/jurrgun/compare/bc3a86f...c31fc18
[0.12.0]: https://github.com/thesandoman/jurrgun/compare/c31fc18...31493aa
[0.13.0]: https://github.com/thesandoman/jurrgun/compare/6fdf581...573cd91
[0.14.0]: https://github.com/thesandoman/jurrgun/compare/573cd91...d67e0f0
[0.15.0]: https://github.com/thesandoman/jurrgun/compare/d67e0f0...40cd973

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
[9b72042]: https://github.com/thesandoman/jurrgun/commit/9b72042
[e96aacb]: https://github.com/thesandoman/jurrgun/commit/e96aacb
[cf92b52]: https://github.com/thesandoman/jurrgun/commit/cf92b52
[52544bc]: https://github.com/thesandoman/jurrgun/commit/52544bc
[4148e81]: https://github.com/thesandoman/jurrgun/commit/4148e81
[18a0a85]: https://github.com/thesandoman/jurrgun/commit/18a0a85
[7bbfab7]: https://github.com/thesandoman/jurrgun/commit/7bbfab7
[33a1b54]: https://github.com/thesandoman/jurrgun/commit/33a1b54
[2242b11]: https://github.com/thesandoman/jurrgun/commit/2242b11
[4290a63]: https://github.com/thesandoman/jurrgun/commit/4290a63
[334c408]: https://github.com/thesandoman/jurrgun/commit/334c408
[3b50591]: https://github.com/thesandoman/jurrgun/commit/3b50591
[add117a]: https://github.com/thesandoman/jurrgun/commit/add117a
[ac084c8]: https://github.com/thesandoman/jurrgun/commit/ac084c8
[d50c9c4]: https://github.com/thesandoman/jurrgun/commit/d50c9c4
[fd8291a]: https://github.com/thesandoman/jurrgun/commit/fd8291a
[b787aa2]: https://github.com/thesandoman/jurrgun/commit/b787aa2
[22e835c]: https://github.com/thesandoman/jurrgun/commit/22e835c
[5347d4b]: https://github.com/thesandoman/jurrgun/commit/5347d4b
[f807e56]: https://github.com/thesandoman/jurrgun/commit/f807e56
[11f3fd8]: https://github.com/thesandoman/jurrgun/commit/11f3fd8
[f05e8f1]: https://github.com/thesandoman/jurrgun/commit/f05e8f1
[728e003]: https://github.com/thesandoman/jurrgun/commit/728e003
[5750b53]: https://github.com/thesandoman/jurrgun/commit/5750b53
[831fa15]: https://github.com/thesandoman/jurrgun/commit/831fa15
[c14edc6]: https://github.com/thesandoman/jurrgun/commit/c14edc6
[0ff0ca8]: https://github.com/thesandoman/jurrgun/commit/0ff0ca8
[74a81a1]: https://github.com/thesandoman/jurrgun/commit/74a81a1
[d05f7d4]: https://github.com/thesandoman/jurrgun/commit/d05f7d4
[70cb47e]: https://github.com/thesandoman/jurrgun/commit/70cb47e
[4b36048]: https://github.com/thesandoman/jurrgun/commit/4b36048
[8ca449b]: https://github.com/thesandoman/jurrgun/commit/8ca449b
[c31fc18]: https://github.com/thesandoman/jurrgun/commit/c31fc18
[79c7d3d]: https://github.com/thesandoman/jurrgun/commit/79c7d3d
[dde473a]: https://github.com/thesandoman/jurrgun/commit/dde473a
[39f6beb]: https://github.com/thesandoman/jurrgun/commit/39f6beb
[6158523]: https://github.com/thesandoman/jurrgun/commit/6158523
[31493aa]: https://github.com/thesandoman/jurrgun/commit/31493aa
[9bdec6d]: https://github.com/thesandoman/jurrgun/commit/9bdec6d
[f2dd8ba]: https://github.com/thesandoman/jurrgun/commit/f2dd8ba
[9ece912]: https://github.com/thesandoman/jurrgun/commit/9ece912
[64634ed]: https://github.com/thesandoman/jurrgun/commit/64634ed
[695bd28]: https://github.com/thesandoman/jurrgun/commit/695bd28
[9847942]: https://github.com/thesandoman/jurrgun/commit/9847942
[b0ec7a5]: https://github.com/thesandoman/jurrgun/commit/b0ec7a5
[73fe187]: https://github.com/thesandoman/jurrgun/commit/73fe187
[a611abf]: https://github.com/thesandoman/jurrgun/commit/a611abf
[c7a1280]: https://github.com/thesandoman/jurrgun/commit/c7a1280
[573cd91]: https://github.com/thesandoman/jurrgun/commit/573cd91
[aa71ae2]: https://github.com/thesandoman/jurrgun/commit/aa71ae2
[f715693]: https://github.com/thesandoman/jurrgun/commit/f715693
[4046f9d]: https://github.com/thesandoman/jurrgun/commit/4046f9d
[7ecfd3e]: https://github.com/thesandoman/jurrgun/commit/7ecfd3e
[959a964]: https://github.com/thesandoman/jurrgun/commit/959a964
[ef2ad5e]: https://github.com/thesandoman/jurrgun/commit/ef2ad5e
[93f9ba9]: https://github.com/thesandoman/jurrgun/commit/93f9ba9
[188a456]: https://github.com/thesandoman/jurrgun/commit/188a456
[1f40967]: https://github.com/thesandoman/jurrgun/commit/1f40967
[028a02e]: https://github.com/thesandoman/jurrgun/commit/028a02e
[03846b5]: https://github.com/thesandoman/jurrgun/commit/03846b5
[138e540]: https://github.com/thesandoman/jurrgun/commit/138e540
[17f5349]: https://github.com/thesandoman/jurrgun/commit/17f5349
[1e078ae]: https://github.com/thesandoman/jurrgun/commit/1e078ae
[1f864df]: https://github.com/thesandoman/jurrgun/commit/1f864df
[219822e]: https://github.com/thesandoman/jurrgun/commit/219822e
[32eaa72]: https://github.com/thesandoman/jurrgun/commit/32eaa72
[33adbba]: https://github.com/thesandoman/jurrgun/commit/33adbba
[3a4fe05]: https://github.com/thesandoman/jurrgun/commit/3a4fe05
[424dd38]: https://github.com/thesandoman/jurrgun/commit/424dd38
[4442569]: https://github.com/thesandoman/jurrgun/commit/4442569
[44b5bcc]: https://github.com/thesandoman/jurrgun/commit/44b5bcc
[459c806]: https://github.com/thesandoman/jurrgun/commit/459c806
[485e6e3]: https://github.com/thesandoman/jurrgun/commit/485e6e3
[4bb86f9]: https://github.com/thesandoman/jurrgun/commit/4bb86f9
[4ec6bcd]: https://github.com/thesandoman/jurrgun/commit/4ec6bcd
[50e5551]: https://github.com/thesandoman/jurrgun/commit/50e5551
[5927021]: https://github.com/thesandoman/jurrgun/commit/5927021
[5a7caf5]: https://github.com/thesandoman/jurrgun/commit/5a7caf5
[5c441cd]: https://github.com/thesandoman/jurrgun/commit/5c441cd
[5db6d48]: https://github.com/thesandoman/jurrgun/commit/5db6d48
[60e33a2]: https://github.com/thesandoman/jurrgun/commit/60e33a2
[613ec16]: https://github.com/thesandoman/jurrgun/commit/613ec16
[62b72db]: https://github.com/thesandoman/jurrgun/commit/62b72db
[6313ae1]: https://github.com/thesandoman/jurrgun/commit/6313ae1
[6585a06]: https://github.com/thesandoman/jurrgun/commit/6585a06
[6603b19]: https://github.com/thesandoman/jurrgun/commit/6603b19
[6843f07]: https://github.com/thesandoman/jurrgun/commit/6843f07
[6908f78]: https://github.com/thesandoman/jurrgun/commit/6908f78
[6ad070a]: https://github.com/thesandoman/jurrgun/commit/6ad070a
[6c4a63d]: https://github.com/thesandoman/jurrgun/commit/6c4a63d
[6d556c2]: https://github.com/thesandoman/jurrgun/commit/6d556c2
[71aae68]: https://github.com/thesandoman/jurrgun/commit/71aae68
[73405d9]: https://github.com/thesandoman/jurrgun/commit/73405d9
[741d3b8]: https://github.com/thesandoman/jurrgun/commit/741d3b8
[79fbb42]: https://github.com/thesandoman/jurrgun/commit/79fbb42
[95f5870]: https://github.com/thesandoman/jurrgun/commit/95f5870
[96c85ac]: https://github.com/thesandoman/jurrgun/commit/96c85ac
[9bd7a66]: https://github.com/thesandoman/jurrgun/commit/9bd7a66
[a2b3db6]: https://github.com/thesandoman/jurrgun/commit/a2b3db6
[b0b49a0]: https://github.com/thesandoman/jurrgun/commit/b0b49a0
[b78e3ae]: https://github.com/thesandoman/jurrgun/commit/b78e3ae
[b90a693]: https://github.com/thesandoman/jurrgun/commit/b90a693
[bb8490e]: https://github.com/thesandoman/jurrgun/commit/bb8490e
[c3c8d7d]: https://github.com/thesandoman/jurrgun/commit/c3c8d7d
[c486318]: https://github.com/thesandoman/jurrgun/commit/c486318
[c5669db]: https://github.com/thesandoman/jurrgun/commit/c5669db
[c678bc9]: https://github.com/thesandoman/jurrgun/commit/c678bc9
[c7317c9]: https://github.com/thesandoman/jurrgun/commit/c7317c9
[d27d92b]: https://github.com/thesandoman/jurrgun/commit/d27d92b
[d303951]: https://github.com/thesandoman/jurrgun/commit/d303951
[d67e0f0]: https://github.com/thesandoman/jurrgun/commit/d67e0f0
[d8033de]: https://github.com/thesandoman/jurrgun/commit/d8033de
[e34baca]: https://github.com/thesandoman/jurrgun/commit/e34baca
[e4b685a]: https://github.com/thesandoman/jurrgun/commit/e4b685a
[e6bbed0]: https://github.com/thesandoman/jurrgun/commit/e6bbed0
[e730fa4]: https://github.com/thesandoman/jurrgun/commit/e730fa4
[e902c27]: https://github.com/thesandoman/jurrgun/commit/e902c27
[f2514ba]: https://github.com/thesandoman/jurrgun/commit/f2514ba
[00815ac]: https://github.com/thesandoman/jurrgun/commit/00815ac
[0698402]: https://github.com/thesandoman/jurrgun/commit/0698402
[069c2b0]: https://github.com/thesandoman/jurrgun/commit/069c2b0
[06b3276]: https://github.com/thesandoman/jurrgun/commit/06b3276
[088088e]: https://github.com/thesandoman/jurrgun/commit/088088e
[0b1b38d]: https://github.com/thesandoman/jurrgun/commit/0b1b38d
[0d4fa32]: https://github.com/thesandoman/jurrgun/commit/0d4fa32
[104b37a]: https://github.com/thesandoman/jurrgun/commit/104b37a
[11c14d0]: https://github.com/thesandoman/jurrgun/commit/11c14d0
[1239b41]: https://github.com/thesandoman/jurrgun/commit/1239b41
[1342c7b]: https://github.com/thesandoman/jurrgun/commit/1342c7b
[1d4b82d]: https://github.com/thesandoman/jurrgun/commit/1d4b82d
[1d6311f]: https://github.com/thesandoman/jurrgun/commit/1d6311f
[21c51e4]: https://github.com/thesandoman/jurrgun/commit/21c51e4
[28db45d]: https://github.com/thesandoman/jurrgun/commit/28db45d
[2a9a65e]: https://github.com/thesandoman/jurrgun/commit/2a9a65e
[2b3a11d]: https://github.com/thesandoman/jurrgun/commit/2b3a11d
[30da949]: https://github.com/thesandoman/jurrgun/commit/30da949
[31ea997]: https://github.com/thesandoman/jurrgun/commit/31ea997
[32d8566]: https://github.com/thesandoman/jurrgun/commit/32d8566
[35c944c]: https://github.com/thesandoman/jurrgun/commit/35c944c
[3989929]: https://github.com/thesandoman/jurrgun/commit/3989929
[3c287d5]: https://github.com/thesandoman/jurrgun/commit/3c287d5
[4191bb7]: https://github.com/thesandoman/jurrgun/commit/4191bb7
[44e6d28]: https://github.com/thesandoman/jurrgun/commit/44e6d28
[45d374f]: https://github.com/thesandoman/jurrgun/commit/45d374f
[471a8d1]: https://github.com/thesandoman/jurrgun/commit/471a8d1
[493d343]: https://github.com/thesandoman/jurrgun/commit/493d343
[5048236]: https://github.com/thesandoman/jurrgun/commit/5048236
[504833b]: https://github.com/thesandoman/jurrgun/commit/504833b
[5a35e8a]: https://github.com/thesandoman/jurrgun/commit/5a35e8a
[5b21b00]: https://github.com/thesandoman/jurrgun/commit/5b21b00
[5e8f7a5]: https://github.com/thesandoman/jurrgun/commit/5e8f7a5
[61eabdf]: https://github.com/thesandoman/jurrgun/commit/61eabdf
[62a2244]: https://github.com/thesandoman/jurrgun/commit/62a2244
[67b7133]: https://github.com/thesandoman/jurrgun/commit/67b7133
[68341cc]: https://github.com/thesandoman/jurrgun/commit/68341cc
[70202f5]: https://github.com/thesandoman/jurrgun/commit/70202f5
[70779bb]: https://github.com/thesandoman/jurrgun/commit/70779bb
[7a73d66]: https://github.com/thesandoman/jurrgun/commit/7a73d66
[7b21a73]: https://github.com/thesandoman/jurrgun/commit/7b21a73
[7d5cece]: https://github.com/thesandoman/jurrgun/commit/7d5cece
[808c5d9]: https://github.com/thesandoman/jurrgun/commit/808c5d9
[81b9897]: https://github.com/thesandoman/jurrgun/commit/81b9897
[8381700]: https://github.com/thesandoman/jurrgun/commit/8381700
[8385422]: https://github.com/thesandoman/jurrgun/commit/8385422
[88bc3f8]: https://github.com/thesandoman/jurrgun/commit/88bc3f8
[8b61bb4]: https://github.com/thesandoman/jurrgun/commit/8b61bb4
[8e61928]: https://github.com/thesandoman/jurrgun/commit/8e61928
[903e01d]: https://github.com/thesandoman/jurrgun/commit/903e01d
[94abad4]: https://github.com/thesandoman/jurrgun/commit/94abad4
[9d3e62d]: https://github.com/thesandoman/jurrgun/commit/9d3e62d
[9f596a2]: https://github.com/thesandoman/jurrgun/commit/9f596a2
[a2c1aa1]: https://github.com/thesandoman/jurrgun/commit/a2c1aa1
[ac06ce3]: https://github.com/thesandoman/jurrgun/commit/ac06ce3
[b0da6ea]: https://github.com/thesandoman/jurrgun/commit/b0da6ea
[b1b76b9]: https://github.com/thesandoman/jurrgun/commit/b1b76b9
[b1e2314]: https://github.com/thesandoman/jurrgun/commit/b1e2314
[b4e0940]: https://github.com/thesandoman/jurrgun/commit/b4e0940
[b6f67ec]: https://github.com/thesandoman/jurrgun/commit/b6f67ec
[b95131a]: https://github.com/thesandoman/jurrgun/commit/b95131a
[bdbcde5]: https://github.com/thesandoman/jurrgun/commit/bdbcde5
[c032428]: https://github.com/thesandoman/jurrgun/commit/c032428
[c1affa7]: https://github.com/thesandoman/jurrgun/commit/c1affa7
[c1f2845]: https://github.com/thesandoman/jurrgun/commit/c1f2845
[c818e01]: https://github.com/thesandoman/jurrgun/commit/c818e01
[c8c1532]: https://github.com/thesandoman/jurrgun/commit/c8c1532
[ccd770e]: https://github.com/thesandoman/jurrgun/commit/ccd770e
[cdeb964]: https://github.com/thesandoman/jurrgun/commit/cdeb964
[cf5e176]: https://github.com/thesandoman/jurrgun/commit/cf5e176
[cfa290c]: https://github.com/thesandoman/jurrgun/commit/cfa290c
[d130bee]: https://github.com/thesandoman/jurrgun/commit/d130bee
[d294102]: https://github.com/thesandoman/jurrgun/commit/d294102
[d6c6e83]: https://github.com/thesandoman/jurrgun/commit/d6c6e83
[d83c658]: https://github.com/thesandoman/jurrgun/commit/d83c658
[daf7974]: https://github.com/thesandoman/jurrgun/commit/daf7974
[e194d5f]: https://github.com/thesandoman/jurrgun/commit/e194d5f
[e1d6748]: https://github.com/thesandoman/jurrgun/commit/e1d6748
[e2f53b4]: https://github.com/thesandoman/jurrgun/commit/e2f53b4
[e34b165]: https://github.com/thesandoman/jurrgun/commit/e34b165
[e8b3c62]: https://github.com/thesandoman/jurrgun/commit/e8b3c62
[e8d5826]: https://github.com/thesandoman/jurrgun/commit/e8d5826
[eca17fc]: https://github.com/thesandoman/jurrgun/commit/eca17fc
[ee1a2cd]: https://github.com/thesandoman/jurrgun/commit/ee1a2cd
[ef49e57]: https://github.com/thesandoman/jurrgun/commit/ef49e57
[f07b40b]: https://github.com/thesandoman/jurrgun/commit/f07b40b
[f39611b]: https://github.com/thesandoman/jurrgun/commit/f39611b
[f8fceea]: https://github.com/thesandoman/jurrgun/commit/f8fceea
[f90795a]: https://github.com/thesandoman/jurrgun/commit/f90795a
[fc3df9c]: https://github.com/thesandoman/jurrgun/commit/fc3df9c
[fcdbd17]: https://github.com/thesandoman/jurrgun/commit/fcdbd17
