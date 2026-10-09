# BKK Social — architecture & conventions

Read this before adding a route. The product spec is `design/reference/bkk-social-prd-v3.md`
(P0 + P1 are in scope; the Vibe quiz is on hold). Platform rules are in `SVAGENTS.md`.

## Stack

- Hono 4.13 on SV Cloud (Cloudflare Workers runtime). No Node APIs. Use Web Crypto.
- Server-rendered pages with **Hono JSX** (`.tsx`). Plain HTML forms with POST → redirect.
  Use as little client JS as possible: small inline `<script>` only where it's essential
  (e.g. camera QR scanning).
- Postgres via Drizzle (`src/db.ts`). **`db.transaction()` throws — use `batch(c.env, [...])`.**
  Every query that could grow needs a `.limit()`. Never query inside a loop: use `inArray`.
  `count(*)` can come back as a string — wrap it in `Number()`.
- The schema is `src/schema.ts`. **Do not change it** without the lead's agreement. If a
  change is needed: edit the schema, run `npm run db:generate`, `npm run db:migrate`
  and `npm run migrations`, and commit all three.

## Files

| Path | What |
|---|---|
| `src/index.ts` | App wiring: middleware (`sameOrigin`, `loadUser`) and route mounting |
| `src/lib/env.ts` | `AppEnv` (bindings plus `c.var.user`, `c.var.lang`) |
| `src/lib/session.ts` | `requireUser`, `requireMember` (onboarded), `requireRole(...)`, `hasRole` |
| `src/lib/records.ts` | `audit(db, actor, action, target, detail)` and `notify(db, accountId, kind, th, en, link)`. Both return un-awaited queries; put them in a `batch` |
| `src/lib/crypto.ts` | `newId()`, `randomToken()`, `sha256()` |
| `src/lib/i18n.ts` | `tr(lang)` → `t("ไทย", "English")`, `fmtDate`, `fmtDay`, `L(lang, {th,en})` |
| `src/lib/constants.ts` | Districts, interests, tags, signals, choice labels, report reasons, VisitBangkok routes; `label(list, value, lang)` |
| `src/lib/qr.ts` | `qrSvg(data)`, `shortCode(passToken)` |
| `src/lib/places.ts` | `eventPlace(e)`: where an event sits on the Discover map (map link → route start → district office), `coordsFromMapUrl(url)` |
| `src/ui/discover-map.tsx` | The Discover map (`/events?view=map`): pins, category chips, key, sheet, near-me. See `docs/DISCOVER-MAP.md` |
| `src/domain/rules.ts` | **All PRD rules as pure functions**: mutual consent, age, romance gates, strikes, seats, waitlist order, k-threshold, window timings. Use them; don't re-implement |
| `src/domain/matching.ts` | `suggestGroups(attendees, opts)` (exchange-stable tables), `buddyRound(people)` (Irving + fallback) |
| `src/ui/kit.tsx` | `page(c, {title, tab, admin, status}, body)`, `view(c)` → `{lang, t, user, path}`, and the components `Card`, `Tag`, `Notice`, `Field`, `TextArea`, `Select`, `Choices`, `Toggle`, `Button`, `LinkButton`, `Stat`, `Empty`; form helpers `str`, `list`, `int`, `safeNext` |
| `src/routes/*.tsx` | One Hono sub-app per area, mounted in `src/index.ts` |

## Conventions

- **Every user-facing string is bilingual:** `t("ไทย", "English")`. Thai comes first.
- **Pages:** `return page(c, { title, tab: "events" }, <>...</>)`. Staff pages pass `admin: true`.
- **Forms:** `method="post"`. On success, redirect with `?notice=<key>` (keys are in `NOTICES` in
  `kit.tsx`; add new ones there). On a validation error, re-render with `status: 400`
  and a `<Notice kind="error">`.
- **Multi-value form fields:** use `await c.req.parseBody({ all: true })` and `list(body.x)`.
- **Auth:** member pages use `requireMember`. Staff pages use `requireRole("host", ...)`
  (bma_admin always passes).
- **Writes that belong together** go in one `batch`, together with their `audit(...)` /
  `notify(...)` rows.
- **Privacy (hard rules):**
  - No staff page ever shows `relationship`, `romanceOn`, `genderIdentity`,
    `romanceOpenTo`, age preferences or individual connection choices.
  - Research data (`research_*`) is keyed by `researchId` only. Dashboards show counts
    through `safeCount()` (k ≥ 10).
  - Attendees see each other's nickname only, plus pronouns if `showPronouns` is set.
- **Blocks hide people in both directions**, everywhere: People I Met, groups, buddies.
- **Ids:** `newId()`. Timestamps are `Date` objects.
- **Lazy timers instead of schedulers:** waitlist offers expire, People I Met windows
  close and buddy rounds run when someone next loads the relevant page (compare
  timestamps on read). No polling, no cron.

## Tests

- **Pure logic:** `test/rules.test.ts` style, no database.
- **Routes:** use `test/helpers.ts` (`HAS_DB`, `createMember`, `req`, `db`) and wrap the
  suite in `describe.skipIf(!HAS_DB)`. These tests run against local Postgres and skip in CI.
- **Every route** gets at least a happy path and an unhappy path (401/403/400/404).
- **Before finishing:** run `npx tsc --noEmit` and `npx vitest run`, and both must be clean.

## Local run

```bash
npm run db:migrate     # once
npm run seed           # demo users and events (prints logins)
npm run dev            # http://localhost:8787
```
