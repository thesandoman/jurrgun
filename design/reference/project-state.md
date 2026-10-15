# Jurrgun project state: one source of truth for every chat

*Kept by the Branding chat. Last reconciled 2026-10-15 18:40 (Bangkok). Every chat working in this repo reads this file first. Decisions that need the owner's approval go to the Branding chat, which collects them here, so no chat acts on an older or conflicting direction.*

## How chats coordinate

- **Before starting:** pull `main`, read this file, `.agents/brand-context.md`, `design/reference/brand-positioning.md` and `design/reference/thai-voice.md`.
- **Pushing:** push to `main` after typecheck and tests pass (the owner said "always push"). Pushing deploys. Before pushing schema changes, say so here and get the migration approved: code that needs new database fields must not go live before the fields exist.
- **Conflicts:** if two chats touch the same thing (films, the same files, production), stop and raise it in Branding.
- **Owner decisions:** recorded below with the date and the chat they were given in. The newest decision wins. Where two conflict, the conflict is listed under Open and waits for the owner.

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
| D12 | Detecting Thai or English and tailoring the question bank for everyone is **Task 10**. The owner will send skills and subtasks; don't start it | Branding | 10-15 |
| D13 | Task 6 (brand kit in Blender) is **postponed until the owner says go** | Branding | 10-15 |
| D14 | **Quiz chats merge in this order** (owner, 18:50, in Branding): (1) "Audit the quiz bank and write its blueprint" lands first; (2) Q5 "Make the quiz fit each member's profile and mode" rebases on it and lands; (3) "Write 100 new Bangkok scenarios" and "Add funny and personality scenarios" rebase and fill the new structure. "Add interactive question formats" can land any time if it stays out of `src/vibe/bank` and `generator.ts`, otherwise after (2). Q5 is then folded into Task 10 and deployed. Each chat rebases on `main` before pushing, and only one quiz chat pushes at a time | Branding | 10-15 18:50 |

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
| **UI/UX** | Accessibility and UX audit (light, dark, 320 px, large text) in worktree `.claude/worktrees/a11y` (branch `a11y-pass`) | running | branched at `ae24ac6`, so it must rebase on `31ecc25` (new names, segments, women-only, /international) before fixing |
| **2.0** | Admins (sandosit, pjj, aey) | idle | |
| Quiz: audit and blueprint | Bank audit and blueprint (worktree gifted-visvesvaraya) | running | merges 1st (D14) |
| Quiz: Q5 profile and mode | Profile-aware question sets (worktree dreamy-leavitt) | running | merges 2nd, after the blueprint (D14) |
| Quiz: 100 Bangkok scenarios | Content (worktree amazing-bhabha) | running | merges after Q5 (D14) |
| Quiz: funny scenarios | Content (worktree funny-lamarr) | running | merges after Q5 (D14) |
| Quiz: interactive formats | UI formats (worktree amazing-ardinghelli) | running | any time if outside the bank and generator, else after Q5 (D14) |
| worktree `jurgun-map` (`discover-map`) | merged into main 6 days ago | stale | safe to remove |

## Proposed next tasks (waiting for approval)

See the Branding chat for the list with recommendations.
