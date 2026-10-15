# Jurrgun project state: one source of truth for every chat

*Kept by the Branding chat. Last reconciled 2026-10-15 18:30 (Bangkok), at main `31ecc25`. Every chat working in this repo reads this file first. Decisions that need the owner's approval go to the Branding chat, which collects them here, so no chat acts on an older or conflicting direction.*

## How chats coordinate

- **Before starting:** pull `main`, read this file, `.agents/brand-context.md`, `design/reference/brand-positioning.md` and `design/reference/thai-voice.md`.
- **Pushing:** push to `main` after typecheck and tests pass (the owner said "always push"). Pushing deploys. Before pushing schema changes, say so here and get the migration approved: code that needs new database fields must not go live before the fields exist.
- **Conflicts:** if two chats touch the same thing (films, the same files, production), stop and raise it in Branding.
- **Owner decisions:** recorded below with the date and the chat they were given in. The newest decision wins. Where two conflict, the conflict is listed under Open and waits for the owner.

## Decisions in force

| # | Decision | Given in | Date |
|---|---|---|---|
| D1 | Name: **Jurrgun** (เจอกัน, "jer-gun"). Live URL `jurrgun.apps.sv-academy.org`. `jurrgun.ktm` is planned but not bought, so don't print it yet | Branding, film-review | 10-15 |
| D2 | Tagline: **กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ / Small groups. Real Bangkok places. See you there.** "More fun, one fan" is retired | Branding, film-review | 10-15 |
| D3 | One green `#137f45`, cream `#fff9f0`, mango `#ffb443`, coral `#ff7a5c`. Fonts: **Sao Chingcha** (headings), **Anuphan** (everything else). No Inter, IBM Plex or TH Sarabun New | Branding | 10-15 |
| D4 | Friends-first. Dating is an important opt-in called **💘 เปิดใจมากกว่าเพื่อน / Open to something more**, one tap on Me or chosen in onboarding, with dating prompts. "Dating mode" is retired | Branding, film-review, quiz-fork | 10-15 |
| D5 | Names: one-off group **โต๊ะ / Table**; recurring group **โต๊ะประจำ / Regular Table**; leader **เจ้าภาพโต๊ะ / Table Host**; connections tab **คนรู้จัก / My people**. "Circle" is retired in all copy (role keys and URLs stay) | Branding | 10-15 |
| D6 | Launch audience: **the Rebuilder**, aged 23 to 32 and new to Bangkok within two years, Thai or foreign. North star: **Weekly Reconnected Members** | Branding | 10-15 |
| D7 | Personalised by the member's own Bangkok story: local, newcomer or international (`src/domain/segment.ts`). Front doors `/new` and `/international`. Women-only options and events only for women and non-binary members | Branding | 10-15 |
| D8 | Thai copy follows `design/reference/thai-voice.md`: spellings เดต, แชต, เช็กอิน; no dashes; no polite particles | Branding | 10-15 |
| D9 | Film 02 is re-cut as the feature film for Open to something more: a green-coral romantic palette, a Thai/English chat, real app profiles, graduating to another app. It goes **on BMA channels** | quiz-fork | 10-15 10:56 |
| D10 | Romance appears in the public films, but within the brand rules: never the lead | quiz-fork | 10-15 10:56 |
| D11 | Show a person in the films (a single lead) even before real users exist | film-review | 10-15 |
| D12 | Detecting Thai or English and tailoring the question bank for everyone is **Task 10**. The owner will send skills and subtasks; don't start it | Branding | 10-15 |
| D13 | Task 6 (brand kit in Blender) is **postponed until the owner says go** | Branding | 10-15 |

## Open: needs the owner (ask in Branding)

| # | Conflict | Option A | Option B |
|---|---|---|---|
| O1 | **The BMA's role.** The live site and brand docs say "Made with the BMA" (endorsed brand, Branding chat). Later, in quiz-fork, the owner said "no endorsement. Assume the app is independent, and BMA is the host" | Keep "Made with the BMA" on the site, drop it from films | Remove the endorsement everywhere. Jurrgun is independent; describe the BMA as host (venues, city), e.g. "จัดที่สถานที่ของกรุงเทพมหานคร / Hosted at BMA places" |
| O2 | **People in films.** film-review: a fictional illustrated cast (Fern). quiz-fork: "real users please", meaning real app screens of demo profiles | Illustrated cast labelled fictional | Real app screens with demo profiles (and later real members with consent) |
| O3 | **Which chat finishes the films.** "Re-render the five Jurrgun films" is mid-way; quiz-fork paused to avoid overwriting | The re-render chat finishes, using O1 and O2 once decided (quiz-fork recommends this) | quiz-fork finishes; stop the re-render chat |
| O4 | **Production database.** The live app has the chat photos, polls and host badge code, but not the database fields it needs. Circle chat errors the first time anyone opens it (no one has yet). Needs approval for an additive migration: 3 fields on `social_chat_messages` plus a votes table | Approve; the Quiz chat runs it | You add the fields on the SV Cloud dashboard |

## Who is doing what

| Chat | Doing | State | Notes |
|---|---|---|---|
| **Branding** (this) | Brand, copy, positioning, personalisation, coordination | active | collects approvals |
| **Quiz** | Quiz, circle and chat features | idle, waiting for O4 | its schema change went live without the migration |
| **quiz-fork** | Film edits | paused | handing over to the re-render chat; captured 27 Thai screens in `~/jurgun-films/screens2/` |
| **Re-render the five films** | Films G1 to G12 per `design/reference/film-revisions.md` | running | told about D5. Must also get O1 and O2 once decided, and the new screens in `screens2/` |
| **film-review** | Film review and brief | done | |
| **UI/UX** | Accessibility and UX audit (light, dark, 320 px, large text) in worktree `.claude/worktrees/a11y` (branch `a11y-pass`) | running | branched at `ae24ac6`, so it must rebase on `31ecc25` (new names, segments, women-only, /international) before fixing |
| **2.0** | Admins (sandosit, pjj, aey) | idle | |
| worktree `jurgun-map` (`discover-map`) | merged into main 6 days ago | stale | safe to remove |

## Proposed next tasks (waiting for approval)

See the Branding chat for the list with recommendations.
