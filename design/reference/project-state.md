# Jurrgun project state: one source of truth for every chat

*Kept by the Branding chat. Last reconciled 2026-10-15 18:40 (Bangkok). Every chat working in this repo reads this file first. Decisions that need the owner's approval go to the Branding chat, which collects them here, so no chat acts on an older or conflicting direction.*

## How chats coordinate

- **Before starting:** pull `main`, read this file, `.agents/brand-context.md`, `design/reference/brand-positioning.md` and `design/reference/thai-voice.md`.
- **Pushing:** push to `main` after typecheck and tests pass (the owner said "always push"). Pushing deploys. Before pushing schema changes, say so here and get the migration approved: code that needs new database fields must not go live before the fields exist.
- **Conflicts:** if two chats touch the same thing (films, the same files, production), stop and raise it in Branding.
- **Owner decisions:** recorded below with the date and the chat they were given in. The newest decision wins. Where two conflict, the conflict is listed under Open and waits for the owner.

## Machine load: one heavy job at a time (owner, 10-15)

All chats share one Mac. Running renders and test suites at the same time pushed load past 100, which made tests time out and skip.
- **Heavy jobs:** film renders (ffmpeg, headless Chrome), full `npm test`, and share-card renders. **Only one runs at a time**, in this order:
  1. the film re-render (running now);
  2. then the quiz chats in D14 order, one at a time;
  3. then Branding's agents one at a time: Regular Tables, then admin partners and measurement.
- **Full suite on your turn:** `npx vitest run --maxWorkers=1` (all 475 pass that way).
- **Tests while waiting:** run only the files you changed, `npx vitest run <files> --poolOptions.threads.maxThreads=2 --testTimeout=30000`. Run the full suite only when it's your turn to push.
- **Light work is fine anytime:** reading, writing and editing.
- **When a chat finishes its heavy step,** it tells Branding, and Branding starts the next one.

## Decisions in force

| # | Decision | Given in | Date |
|---|---|---|---|
| D0 | **BMA role:** independent app; the BMA is main host, moderator and oversight admin (see O1) | Branding | 10-15 18:30 |
| D1 | Name: **Jurrgun** (เจอกัน, "jer-gun"). Live URL `jurrgun.apps.sv-academy.org`. `jurrgun.ktm` is planned but not bought, so don't print it yet | Branding, film-review | 10-15 |
| D2 | Tagline: **กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ / Small groups. Real Bangkok places. See you there.** "More fun, one fan" is retired | Branding, film-review | 10-15 |
| D3 | One green `#137f45`, cream `#fff9f0`, mango `#ffb443`, coral `#ff7a5c`. Fonts: **Sao Chingcha** (headings), **Anuphan** (everything else). No Inter, IBM Plex or TH Sarabun New | Branding | 10-15 |
| D4 | Friends-first. Dating is an important opt-in called **💘 เปิดใจมากกว่าเพื่อน / Open to something more**, one tap on Me or chosen in onboarding, with dating prompts. "Dating mode" is retired | Branding, film-review, quiz-fork | 10-15 |
| D5 | Names: one-off group **โต๊ะ / Table**; recurring group **โต๊ะประจำ / Regular Table**; leader **เจ้าภาพโต๊ะ / Table Host**; connections tab **คนรู้จัก / My people**. "Circle" is retired in all copy (role keys and URLs stay) | Branding | 10-15 |
| D6 | Launch audience: **the Rebuilder**, aged 23 to 32 and new to Bangkok within two years, Thai or foreign. North star: **Weekly Reconnected Members** | Branding | 10-15 |
| D7 | Personalised by the member's own Bangkok story: local, newcomer or international (`src/domain/segment.ts`). Front doors `/new` and `/international`. Women-only options and events only for women and non-binary members | Branding | 10-15 |
| D8 | Thai copy follows `design/reference/thai-voice.md`: spellings เดต, แชต, เช็กอิน; no dashes; no polite particles | Branding | 10-15 |
| D9 | Film 02 is re-cut as the feature film for Open to something more: **love red `#e23744`** (text `#c0222f`, tint `#fde3e5`), used only on the opt-in moments beside green on cream. Coral was dropped (owner, in the re-render chat after 18:00: "orange doesn't make sense"). Also: a Thai/English chat, real app profiles, graduating to another app. It goes **on BMA channels** | quiz-fork | 10-15 10:56 |
| D10 | Romance appears in the public films, but within the brand rules: never the lead | quiz-fork | 10-15 10:56 |
| D11 | Show a person in the films (a single lead) even before real users exist | film-review | 10-15 |
| D12 | **Task 10** (owner: no skills needed, consolidate with Q5): language detection is done in Branding (`langFromHeader`: Thai if Thai is anywhere in Accept-Language, else English; a chosen language wins). Language-tailored quiz scenarios are folded into Q5, same types and scoring, only flavour changes. **Done, landed with Q5:** members who don't list Thai, or are international, get local words explained in English (`src/vibe/bank/plain-english.ts`: GLOSSES, EXPAT_PROMPTS); Thai text never changes and language stays out of the seed | Branding | 10-15 |
| D15 | Sign-up area: **Bangkok and surrounding areas** (Nonthaburi, Samut Prakan, Pathum Thani…), as the FAQ, Terms and onboarding already say | Branding | 10-15 |
| D16 | **Regular Tables become real groups** that members join (worktree in progress in Branding) | Branding | 10-15 |
| D17 | **Dating partner programme is admin only:** partner kinds (events, dating, venue, community); a dating partner's events are auto-tagged open_to_more. Nothing in the member app names it. Measurement (north-star trend, segment split, placement source) is admin/BMA only | Branding | 10-15 |
| D18 | **Love red** `#e23744` (ink `#c0222f`, tint `#fde3e5`) for Open to something more moments in the app and film 02 only: the profile dating section, dating prompts, the one-tap switch, the 💘 event tag. Coral stays as general warmth | Branding | 10-15 |
| D19 | **Regular Tables (owner review):** up to 30 members per table; large events have no fixed cap (organiser sets it); anyone joins with the invite link or a confirmed seat at a started hangout; a block between two members is resolved by the Table Host (keep both apart, ask one to step back, or send to moderators), and the host is never told who blocked whom; women-only applies to new joins; existing Table Hosts get a table auto-created; a member can be "Regular at" many tables (shown on profile cards); each meetup is a Hangout (แฮงเอาต์) | Branding | 10-15 |
| D20 | **Quiz decisions (owner):** Q-D1, date scenarios get two wordings: a date for opted-in members, a one-to-one friend meetup for everyone else, with the same scoring (confirmed in Branding). Q-D2, districts fixed (Krung Thep Aphiwat in Chatuchak, Chokchai 4 in Lat Phrao). Q-D3, new formats: Bangkok-themed, this or that, would you rather, letter association, more categories. Q-D4, pick by season, segment and the Table Host set. New formats are **tuned before push** so own-type accuracy is back near 86% (it was 82.1%) | Quiz, Branding | 10-15 |
| D13 | Task 6 (brand kit in Blender) is **removed** (owner) | Branding | 10-15 |
| D22 | **Quiz Q7 (adaptive quiz)** on branch `quiz-adaptive` (0862cb6) lands **last**, after the five D14 quiz chats. Branding tells the Quiz chat when it's its turn | Quiz | 10-15 |
| D23 | **Shared quiz writing rule** (owner): every quiz chat follows `design/reference/quiz-review.md` so the quiz reads as one voice. Show the letter through a detail, never name it; 6 to 12 words per answer; sense check first; places that fit the moment; romance words only in 💘 wordings (friends-only members get the friend wording, D20); Thai first, in its own voice; warm copy; D5 names | Quiz | 10-15 |
| D24 | **Quiz bank check widened, not dropped** (owner): every D or F answer must still show its letter, but detail cues count (D: finally, everyone keeps posting, a friend swears by…; F: already know your name, the aunties, your seat, before you order…). New bank-wide warning: at most 3 of the 16 answers per scenario say usual, regular, never or new. The funny chat lands this bank-rules change as its own commit, **right after Q5's follow-up and before the 100-scenarios chat**, which rebases on it | Quiz | 10-15 |
| D21 | **Final (owner):** the privacy notice at /privacy is final (PDPA, controller = Jurrgun team, contact through the Privacy Center). **No BMA approval is needed** for wording, channels, venues or moderators. Don't ask for it or list it as a blocker | Branding | 10-15 |
| D14 | **Quiz chats merge in this order** (owner, 18:50, in Branding): (1) "Audit the quiz bank and write its blueprint" lands first; (2) Q5 "Make the quiz fit each member's profile and mode" rebases on it and lands; (3) "Write 100 new Bangkok scenarios" and "Add funny and personality scenarios" rebase and fill the new structure. "Add interactive question formats" can land any time if it stays out of `src/vibe/bank` and `generator.ts`, otherwise after (2). Q5 is then folded into Task 10 and deployed. Each chat rebases on `main` before pushing, and only one quiz chat pushes at a time. **(1) and (2) done:** Q5 + Task 10 landed; the content chats are next and fill `set`, `audience`, `bank/segment-prompts.ts` and `bank/plain-english.ts` | Branding | 10-15 18:50 |

## Resolved by the owner (2026-10-15 18:30, in Branding)

| # | Decision |
|---|---|
| O1 | **The BMA's role:** Jurrgun is independent, and the BMA is the main host, moderator and oversight admin. "Made with the BMA" is removed everywhere. The line is "แอปอิสระ มีกรุงเทพมหานครเป็นเจ้าภาพและผู้กำกับดูแล / An independent app, hosted and overseen by the BMA" (`BRAND.bma`, `BRAND.bmaShort`). The privacy notice says BMA staff moderate and see only what safety needs |
| O2 | **People in films:** real app screens with demo profiles, led by one person, Fern, as a real profile in the real UI. No illustrated cast. Labelled "ข้อมูลตัวอย่าง · Demo profiles" |
| O3 | **Films:** the re-render chat finishes all five. quiz-fork stays paused; its screens are in `~/jurgun-films/screens2/` |
| O4 | **Live database:** migration `0016_wild_nekra` was applied 18:28 by Branding through the guarded setup route. The key is removed and the site is green |

## Open: needs the owner

None right now. New questions go to the Branding chat.

## Who is doing what

| Chat | Doing | State | Notes |
|---|---|---|---|
| **Branding** (this) | Brand, copy, positioning, personalisation, coordination | active | collects approvals |
| **Quiz** | Quiz, Regular Table and chat features | idle | migration 0016 now live |
| **quiz-fork** | Film edits | paused | handing over to the re-render chat; captured 27 Thai screens in `~/jurgun-films/screens2/` |
| **Re-render the five films** | Films G1 to G12 per `design/reference/film-revisions.md` | running | has D5 and O1 to O3 (sent 18:30); uses `screens2/` |
| **film-review** | Film review and brief | done | |
| **UI/UX** | Accessibility and UX pass (WCAG 2.1 AA, 56 pages, light, dark, 320 px, large text): field edges, brand green #11763f, skip link, focus ring, hint and error wiring, radio group labels, switch off state, heading order, friendly 404 and 500 pages, 12 px text floor, 24 px taps, /new hero CTA, denser Discover cards, sticky RSVP, Me tiles; then pass countdown, Add to calendar (.ics), Directions, Discover remembers map/list and When, Caps Lock note, unsaved-changes guard on Edit profile, RSVP ticket punch, pass tear-in, live pass glow with QR-to-code flip, passport stamp slam, mutual connection spark | merged | owner-approved per change (10-15); styles in `src/ui/a11y-css.ts` load last |
| **2.0** | Admins (sandosit, pjj, aey) | idle | |
| Quiz: audit and blueprint | Bank audit and blueprint | done, landed 637eb30 | places to verify: Krung Thep Aphiwat (probably Chatuchak), Chokchai 4 (probably Lat Phrao), Brown Sugar's address, whether Jodd Fairs Ratchada is open |
| Quiz: Q5 profile and mode | Profile-aware question sets + Task 10 language flavour (worktree dreamy-leavitt) | done, landed | date scenarios are the open-to-more set; generator offers by set and audience; "how you date" (20) and "how you host" (10) style sets never move the type |
| Quiz: 100 Bangkok scenarios | Content (worktree amazing-bhabha) | running | merges after Q5 (D14) |
| Quiz: funny scenarios | Content (worktree funny-lamarr) | running | merges after Q5 (D14) |
| Quiz: interactive formats | UI formats (worktree amazing-ardinghelli) | running | any time if outside the bank and generator, else after Q5 (D14) |
| worktree `jurgun-map` (`discover-map`) | merged into main 6 days ago | stale | safe to remove |

## Reference documents (not schedules)

- `design/reference/pilot-launch-plan.md`: **in limbo** (owner). Don't act on it, schedule from it or bring it up until the owner raises it.

## Proposed next tasks (waiting for approval)

See the Branding chat for the list with recommendations.
