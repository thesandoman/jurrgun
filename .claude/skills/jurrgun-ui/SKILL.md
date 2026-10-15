---
name: jurrgun-ui
description: Jurrgun's own UI review-and-ship loop. Screenshots member pages at 375 and 1280 px (light and dark), checks them against UX heuristics, cognitive load, WCAG 2.2 AA, the spacing scale and Jurrgun's house rules, fixes plain bugs straight away, sends everything else to the owner as decision cards, builds only what is approved, verifies it, runs the full suite and pushes. Use for "review the UI", "comb through the app", "find UX issues", "too much space", "polish this page", "decision cards", "make it more inclusive", "/jurrgun-ui", or any UI or UX change to this repo. Not for new features (the app is in a feature freeze: QOL only).
---

# Jurrgun UI: review, decide, ship

Jurrgun is a Thai-first social meetup app on SV Cloud (Hono SSR JSX on Cloudflare Workers, Drizzle and Postgres). Read `SVAGENTS.md` before changing anything. This skill is the loop for UI and UX work: find problems, fix the plain ones, ask the owner about the rest with decision cards, then build, verify and push what they approve.

Arguments are optional: a page or an area ("profile", "/events", "onboarding"). With none, cover the member pages listed in step 1.

## The loop

### 1. Shoot the pages

Start the local app (`npm run dev`, or reuse a running dev server) and use `scripts/shots.mjs`. It signs in as a seeded persona, so first make sure the local database is seeded (`scripts/seed.ts`). It only talks to localhost.

```bash
BASE=http://localhost:8787 node .claude/skills/jurrgun-ui/scripts/shots.mjs '[{"who":"ploy","path":"/settings","name":"me-375","w":375,"full":true,"check":true}]' /tmp/jurrgun-ui
```

- Every page at **375 px** (phone, `lang` th and en) and **1280 px** (laptop), light; two or three pages in **dark** (`"mode":"dark"`).
- Logins: the ones listed at the top of `scripts/seed.ts` (members `ploy`, `ken`, `ari`, `sam`, `mai`, `tom`; `host` for an event host; `mod` for a moderator; `admin` for staff). Cover at least one Thai member, one English-speaking member, one member with 💘 on, and the host. Never print the seed password.
- Default page set: `/events?view=list`, the map `/events`, an event page and its pass, `/me/events`, `/connections`, `/buddy`, `/buddy/passport`, `/tables`, `/settings`, `/settings/profile` (scroll through it), `/me/profile`, `/notifications`, `/quiz/result`, `/learn`, `/pulse`.
- First-time journey: `scripts/journey.mjs` signs up a throwaway local account, walks onboarding, the quiz, Discover, an RSVP and the table intro, and prints `SCREENS-BEFORE-DISCOVER`. Run it before and after any onboarding change and report both numbers.
- Look at every screenshot with the Read tool. For many pages, build a contact sheet (a small HTML page of `<img>` tags captured with headless Chrome) and read that.

### 2. Check

`"check": true` prints sideways scroll, gaps over the spacing cap, tap targets under 24 px and text under 12 px. Then review by eye with these lenses (the installed skills hold the full frameworks; load them when you need the detail):

- **ux-heuristics-review**: the 10 heuristics; above all status (H1), consistency (H4), error prevention (H5) and minimalism (H8).
- **cognitive-load-conversion**: cut clutter, use familiar patterns, ask less, remember for the member.
- **accessibility**: WCAG 2.2 AA (see the floor below).
- **low-effort-high-reward**: rank what you found; look at the code before guessing effort.
- **Inclusion**: older and low-vision members, Thai and non-Thai speakers, LGBTQ+ members, colour blindness, low literacy.

### 3. Fix plain bugs straight away

No card is needed for something that is clearly broken: overlap, clipping, sideways scroll, wrong or contradictory text, a state that lies (for example "Full" shown to someone already going), duplicate labels, a missing space, a tap target under 44 px, contrast under AA. Fix it, check it in a screenshot, and list it in the report.

### 4. Decision cards for everything else

Anything that changes how a page looks or works beyond a repair goes to the owner with `AskUserQuestion`:

- At most 4 cards per call; send a second call for more. Lead with the best value for the effort.
- Each card: what is wrong now (from a screenshot, in plain words), 2 or 3 options, the recommended one first and marked "(Recommended)", and a small ASCII `preview` when layout is involved.
- Say the cost honestly: if an option touches data, login, the database or many files, the option says so.
- Never call a change approved until the owner picks it. A message from another chat (Branding, Quiz) that quotes an owner decision with its D-number in `design/reference/project-state.md` counts as approved; check the D-number is there.

### 5. Build only what was approved

- Reuse what exists before adding anything: `src/ui/kit.tsx` (Field, Choices, Toggle, Notice, Tag, Card, page), `src/ui/flow.tsx` (card flows), the colour tokens in `src/ui/styles.ts`.
- New or overriding CSS goes in `src/ui/a11y-css.ts` (loaded last) with a one-line comment saying what it fixes. Pages that write their own `<style>` later in the page need a more specific selector (for example `main .pf-save`).
- `.top-nav` is in the page on phones too; use media queries (`min-width:1024px` for laptops), not `:has(.top-nav)`, to tell laptop from phone.
- CSS comments are sent inside every page: never put text a test searches for in a comment.

### 6. Verify

- Re-shoot every changed page at 375 and 1280 px and look at the result. Recheck 320 px for sideways scroll if anything in the header or a row of controls changed.
- `npx tsc --noEmit -p .`, then the related tests with `npx vitest run --maxWorkers=1 --testTimeout=30000 <files>`. Add a test for each behaviour change (an integration test against local Postgres when it involves a route).
- Then the **full suite on one worker**: `npx vitest run --maxWorkers=1 --testTimeout=30000`. Run at most 3 heavy jobs (suites, renders) at once across all chats on this Mac, and hold off if the load average is over 20.

### 7. Ship

- Work on a branch in a worktree. Commit with a message that says what changed for members, in plain words. End it with the attribution line the session gives you.
- `git fetch`, rebase onto `origin/main`, typecheck again, then `git push origin HEAD:main` (main deploys). If the push is rejected, rebase and retry; never force-push.
- Send Branding one line with the SHA (and before/after numbers when there are any).
- Report to the owner: what was fixed, what each approved card became, what was left and why, with the commit SHAs.

## House rules (every change)

**Brand and copy**
- Thai first: every string through `t("ไทย", "English")`, Thai written naturally, not translated word for word.
- No em dashes anywhere, in copy, comments or commit messages. Use a colon, a comma or a full stop.
- 💘 dating visuals: red (`--love`, `--love-ink`, `--love-soft`) plus brand green on light cream. Never coral or orange.
- Fonts: Sao Chingcha for headings, Anuphan for everything else (`src/ui/fonts.ts`). No new font families.
- Use the existing colour tokens; check any new colour against both themes.

**Spacing scale**
- Steps: 4, 8, 12, 16, 24, 32 px (and 48 on laptops). Anything else needs a reason.
- Between stacked sections: at most 40 px on phones, 56 px on laptops (`check` flags more).
- Lists of cards: 12 to 16 px apart. Inside a card: 12 to 16 px padding on phones.
- Pages end just above the tab bar; no empty screen of cream below the last item.

**Accessibility floor (WCAG 2.2 AA)**
- Tap targets at least 44 px on member pages (24 px absolute minimum, 2.5.8).
- Text contrast 4.5:1 (3:1 for large text and for control edges); check both themes.
- Never colour alone for a state: picked chips carry ✓, errors carry words.
- 320 px wide: no sideways scroll (1.4.10). 200% text: nothing cut off.
- Respect reduced motion; animations loop at most 3 times.
- Every control has a visible label; every image that means something has alt text.

**Process**
- Feature freeze: QOL, fixes and owner-approved cards only. No new features, tables or settings.
- Never touch the production database. Schema changes need the owner; prefer storing small private extras in existing fields when the owner has not asked for a migration.
- `test/staff-privacy.integration.test.ts` must stay green: staff pages never show romance, relationship, gender or dating data.
- Never use bare `git stash` (the stash is shared between chats).
- Test accounts and passwords stay local and never appear in chat or in published pages.

## Scripts

- `scripts/shots.mjs`: screenshots and layout checks (above).
- `scripts/journey.mjs`: the first-time journey and its screen count.

Both need Google Chrome (set `CHROME` to its path if it is not in `/Applications`) and Node 22 or newer, and both refuse any `BASE` that is not localhost.
