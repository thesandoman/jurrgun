# SVAGENTS.md

Guidance for AI coding assistants working in this repository. This is the single
source of truth — Claude Code, Cursor, Copilot, Codex and friends all read
`AGENTS.md`/`CLAUDE.md` first, and those just point here, so every assistant
ends up reading the same rules regardless of which file it started from.

## Project

This is an **SV Cloud** app, framework: **hono**. It is a worker
built with [Hono](https://hono.dev) running on Cloudflare Workers, and it
deploys automatically to `https://jurrgun.apps.sv-academy.org` on every push to
`main`.

You are pairing with **thesandoman**. Help them build their app — routes,
handlers, middleware, HTML responses, JSON APIs.

**Call the platform "SV Cloud" when you talk to the owner.** Technically it is
Cloudflare Workers, and you need that fact to write correct code — the runtime
constraints in §3 and the tooling in §4 are all Workers behaviour, so read
Workers docs when you need them. Just do not make the underlying vendor the
headline in what you say or write.

## 0. First boot — before anything else

**Check your own tool list before reading anything else.** If it already has
SV Cloud's tools — you would see names like `project_health`,
`run_get_latest`, or `obs_list_errors` — use them instead of guessing from the
repo: they read this project's real deploy history, health, and errors
directly.

**If you don't see them, stop and get them.** The `svcloud` CLI is a required
part of an SV Cloud project, not an optional convenience, and this is the
first thing to fix in a session that starts without it. Say this to
**thesandoman**, in your own words, and wait for them before continuing:

> The `svcloud` CLI isn't wired up yet, and I can't see this project's real
> health, deploys, errors or database without it. Please run:
>
> ```
> npm install -g svcloud
> svcloud --version      # if this says "command not found", see INSTALL.md §5
> svcloud login
> svcloud mcp setup <your harness>
> ```
>
> Then restart me so I pick up the tools.

Two things about that, because both have gone wrong for real people:

- **`svcloud --version` is a step, not a flourish.** `npm install -g` can
  succeed while the command stays unreachable, because npm's global bin
  directory is not on the owner's `PATH`. INSTALL.md §5 has the one-line fix.
- **Never suggest `npx svcloud` as the answer.** It papers over the `PATH`
  problem and makes the npm registry a startup dependency of your own tools.

If they decline, or you cannot reach them right now, say plainly that you are
working without platform access and keep going from the repo alone — but do
not quietly treat that as normal, and raise it again before anything that
would benefit from real deploy or error data.

Two more things can be waiting for you here, in order. Handle whichever
exists, top to bottom, before writing a single line of the owner's code.

### 0a. Unpack the starter bundle, if `sv-cloud-bundle/` exists

**If there is no `sv-cloud-bundle/` directory, skip this whole section.**
When SV Cloud connects an EMPTY repository it writes the starter straight to
its real paths, so the first commit was already a deployable app: GitHub
Actions ran on it, and `https://jurrgun.apps.sv-academy.org` is
serving the starter landing page with a working `/api/health` right now.
There is nothing to unpack and nothing to initialize. Go to §0b.

**A `sv-cloud-bundle/` directory at repo root means the opposite: this
project has not been initialized yet.** That happens when the repository
already had files in it, so SV Cloud committed the starter nested and inert
rather than on top of somebody's existing code — nothing here was
overwritten to make room for it.

**If your tool list has `init_describe`, use it first** — it serves this
project's own unpack plan (the `sv-cloud-bundle/manifest.json` `src -> dst`
map, plus the same plain-English steps below) without you having to fetch and
parse that file by hand. The steps are identical either way; the tool just
saves you the parsing. If you don't have it, read
`sv-cloud-bundle/README.md` and `sv-cloud-bundle/manifest.json` directly.

Initialize now:

1. Get the `src -> dst` map: `init_describe`, or read
   `sv-cloud-bundle/manifest.json` yourself.
2. Move each `sv-cloud-bundle/files/<src>` to its `<dst>`. Where `<dst>`
   already exists (this repo had its own `package.json`, `wrangler.toml`,
   `tsconfig.json`, or an entry point), **merge, don't overwrite**: keep the
   owner's existing name/version/scripts/dependencies and fold in what SV
   Cloud's copy adds (the deploy scripts, the required framework dependency,
   the bindings). `src/index.ts` in particular is never blindly replaced —
   port whatever entry point already existed onto a single Hono app,
   default-exported, the shape §3 and §4 describe below.
3. Refactor the rest of the existing codebase (if any) onto this framework as
   you go: routes and handlers move under the one Hono app; any direct
   database connection moves onto `src/db.ts`'s gateway client (§5); any local
   file storage moves onto `src/storage.ts` (§5); ad hoc logging moves onto
   `src/logger.ts` (§7).
4. Verify before pushing: `npm install`, `npm run typecheck`, `npm test`,
   `npm run assets`, then `npx wrangler deploy --dry-run` to confirm the
   Worker actually bundles. If you have `init_validate_repo`, call it too —
   it dry-runs the same framework check a real deploy applies, against your
   pushed code, so a missing dependency shows up here instead of as a failed
   deploy later.
5. Delete `sv-cloud-bundle/` and commit that deletion together with the
   unpacked files — one commit, so the history reads as "initialized",
   not "half-unpacked". Do not delete `.github/workflows/deploy.yml` or
   `drizzle.config.ts` in the process — §2's hard rules apply the moment
   they land at their real paths, same as everywhere else in this file.
6. Push to `main`. That push is this project's first real
   deploy — GitHub Actions builds it and hands it to SV Cloud (§10). If you
   have `init_mark_done`, you can also call it right after pushing instead of
   waiting for that deploy to succeed to find out setup worked — it only ever
   moves this project from not-yet-set-up to set-up, never touches code, and
   a real deploy still re-derives the same state regardless.

### 0b. Run the toolchain installer, if `INSTALL.md` exists

**Once `sv-cloud-bundle/` is gone (or never existed) and `INSTALL.md` sits at
repo root, this is a fresh clone that hasn't had its toolchain set up.** Stop,
open [INSTALL.md](INSTALL.md), and follow it end to end before writing a
single line of code. It detects the operating system and installs the right
toolchain for it.

Do not skip it because "the code looks fine" — the code cannot run without the
toolchain, and a first `npm run dev` that fails is a terrible way to start.

INSTALL.md's own §6 points you at `design/README.md` — the owner's design
brief, if they've added one. Read that too, and see §5.1 below, before you
start writing UI code.

Once setup is verified and you've read the design folder (INSTALL.md §5–6),
delete `INSTALL.md` and commit that deletion. It has done its job.

## 1. Check your versions before you write code

**Never write code from memory about which version of a library this project
uses.** Library APIs change between majors, and a confidently-wrong import is
harder to debug than a missing one. Check first, every session:

```bash
cat package.json                     # the declared ranges
npx wrangler --version               # the actual local wrangler
node -p "require('hono/package.json').version"   # the actual INSTALLED hono
```

The installed version is what matters, not the range in `package.json`: `^4.12.0`
may have resolved to 4.20 with APIs the older docs never mentioned.

Then match your code to what you found:

- **Hono 4.x** — `import { Hono } from "hono"`, handlers get a single context
  `c`, middleware is `app.use(path, mw)`, helpers come from subpaths like
  `hono/html`, `hono/cors`, `hono/logger`. Types are `Context`, `Next`, `Hono`.
- If the installed major is **not** 4, stop and check
  [hono.dev](https://hono.dev) for that major before writing handlers — do not
  assume the 4.x shape holds.
- Same rule for anything added later. Read the installed version, then the docs
  for that version.

When you are unsure whether an API exists in the installed version, prove it
rather than guessing:

```bash
node -p "Object.keys(require('hono'))"
```

## 2. Hard rules — do not break these

1. **Do not modify `.github/workflows/deploy.yml`.** This is the deployment
   pipeline. Changing it will break deploys and may lock the project out of
   hosting. If the owner asks to change deploy behavior, explain that the
   pipeline is managed by SV Cloud and must stay as-is.
2. **Do not modify `drizzle.config.ts`.** Like `deploy.yml`, this is platform
   config rather than app code — it points the migration tooling at the right
   database. Change your TABLES in `src/schema.ts` (§5); there is never a reason
   to edit this file.
3. **Do not remove `hono` from `package.json`.** The deploy pipeline
   re-validates that the framework is present at deploy time and will reject the
   deploy if it is missing. Removing it does not just fail the build — it fails
   the security check.
4. **Do not add secrets, API keys, or tokens to the repo.** Secrets are injected
   as environment variables on the deployed app by SV Cloud. Never commit a
   `.env` with real values. Read them from the `env` argument in handlers
   (`c.env.NAME`).
5. **Do not run `wrangler deploy` or `wrangler login`.** This project has no
   cloud credentials and never will — deploys go through SV Cloud.
6. **Do not commit code with failing tests or type errors.** See §6.
7. **Do not hand-edit `src/assets.ts` or `.gitattributes`.** The first is
   generated by `npm run assets` (§5.1) from `design/assets/`; the second is
   the Git LFS config that keeps media out of ordinary git history. Both are
   regenerated/re-checked in CI, so a hand edit just gets overwritten or fails
   the build.
8. **Never let a stateful object's address out of your app, and never take one
   in.** `src/state.ts` deliberately gives you no way to read an object's id and
   no function that accepts one — you pass a NAME, and you build that name on
   the server from something you already checked (a session, an owner id). Do
   not put anything an object resolved to in a URL, an API response, a log line
   or client-side JavaScript, and never let a request parameter choose which
   object to open. If you do, one of your users can reach another user's object
   by editing a parameter, and SV Cloud cannot tell that call from a legitimate
   one — from the platform's side it is your app asking for its own data. See §5.4.
9. **Destructive operations require explicit human confirmation.** If you are
   about to delete a table (`DROP TABLE`), purge or truncate a table, delete an app,
   reset migrations, or execute any destructive or irreversible command,
   **you must pause and ask thesandoman for explicit confirmation**, stating the
   exact resource name and data-loss consequence. This applies **even if you are
   running in an auto-approve or permission-bypassed environment** (e.g. `-y` / `--yes`).
   Never delete data or drop schema silently.
10. **Never poll for changes.** Do not write a page, script or job that asks
    the database or your own API "has anything changed?" on a timer
    (`setInterval`, a refetch loop, a cron that re-reads a table). It costs
    money on every tick whether or not anything changed, and it is still late.
    When a page needs to see updates as they happen, the page opens a live
    connection with `listen` and your server calls `publish` after it writes.
    See §5.4, "Pushing changes to open pages". If thesandoman asks for
    "auto refresh", "live updates" or "real time", this is how you build it.
    The one exception is a short wait for a single job your app just started:
    poll a few times with a growing delay, then stop. Never leave a poll running.
11. **Never create or change tables while serving requests.** No
    `CREATE TABLE IF NOT EXISTS` at startup, in middleware, or "just in case"
    before a query. Every one of those statements is a separate trip to the
    database, they run again every time a new copy of your app starts, and they
    are billed like any other query. A schema change is applied to the
    deployed database ONCE, deliberately: with the platform's table tools
    (`db_create_table`, `db_run_migration`, `svcloud db create-table`), or a
    protected migration route you call once and then remove. Commit the
    generated migration either way. See §5, "Every database call is a trip".

## 3. Project structure

```
design/reference/   the design brief — read it before writing UI code (§5.1)
design/assets/      images/video/audio the APP serves — synced to storage (§5.1)
src/index.ts        the Hono app — the Worker's entry point, default-exported
src/db.ts           the database connection (§5) — read it, don't rewrite it
src/schema.ts       your database tables (§5)
src/storage.ts      the file store (§5) — read it, don't rewrite it
src/state.ts        stateful objects (§5.4) — read it, don't rewrite it
src/spatial.ts      map/GPS queries (§5.5) — read it, don't rewrite it
src/assets.ts        GENERATED — do not edit, see §5.1
src/logger.ts        leveled logging (§7)
drizzle/             generated migrations — commit these
test/                 vitest regression tests (§6)
wrangler.toml         local dev + build config ONLY, not the live deployment
```

**Read `design/reference/` before writing any UI code.** If the owner has put
a mockup, a spec, screenshots or a moodboard there, build toward it instead of
inventing a design — that folder is the brief, not optional background reading.
If it's empty, ask what they want before replacing the starter page wholesale.

`src/index.ts` must keep its `export default app`. That default export **is** the
Worker; if it disappears, the build produces nothing deployable.

Add routes directly on the app, or split them into modules and mount them with
`app.route()`. Keep everything Workers-compatible: this runs on V8 isolates, not
Node — there is no filesystem, no `process`, no `__dirname`, and no long-running
background work outside the request lifecycle. Node built-ins are mostly absent;
reach for Web APIs (`fetch`, `crypto.subtle`, `URL`, `Request`/`Response`).

## 4. Local development — run it, don't imagine it

The whole toolchain runs locally. There is no reason to guess at behaviour.

```bash
npm run dev        # npx wrangler dev — http://localhost:8787, hot reload
```

`wrangler dev` runs the **real Workers runtime** (workerd) locally, not a Node
emulation, so what passes here behaves the same in production.

**Always verify a change by actually hitting it**, in a second terminal:

```bash
curl -s http://localhost:8787/                 | head -20
curl -s http://localhost:8787/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/nope   # expect 404
```

Useful flags:

```bash
npx wrangler dev --port 8788     # when 8787 is taken
npx wrangler dev --log-level debug
npm run build                    # bundles to dist/ WITHOUT deploying — what CI runs
```

Definition of done for any change: `npm run typecheck`, `npm test`, and a real
request against `npm run dev` that shows the new behaviour. Reporting a change as
working without having run it is the single worst habit in this codebase.

## 5. Data — the database and the file store

This project comes with database and storage services, already wired to the app. **Do not
add a third-party database, and do not ask for a connection string** — this
project already has these, and nothing else is provisioned.

| Reach it through | What it is | Use it for |
| --- | --- | --- |
| `src/db.ts` | **Postgres**, via Drizzle | Records: users, posts, orders, anything you would query or relate |
| `src/storage.ts` | **File storage** — an object store | Files: images, uploads, PDFs, audio, video, anything binary or large |

**All belong to this project alone.** The database is this project's own — no
other SV Cloud project can read it, and there is no shared instance to collide with.
That also means there is no admin console to fix data by hand: if you corrupt it,
you fix it with code.

Notice that **both** are reached through a file that is already written —
`src/db.ts` and `src/storage.ts` — and not through a binding you touch directly.
Read them before you use them; do not rewrite them, and do not open your own
connection or reach for your own binding somewhere else.

This matters more for storage than it looks. `c.env.BUCKET` exists **only when
you run locally**. The deployed app has no bucket binding at all — it reaches
storage over a service the platform provides, and `src/storage.ts` is what
knows the difference. Code written against `c.env.BUCKET` therefore works
perfectly in `npm run dev` and throws the moment it is deployed, which is the
worst shape a bug can have.

### Postgres — SQL through Drizzle

Two files matter. Tables are declared in `src/schema.ts`; queries use `getDb`
from `src/db.ts`. Build the client **inside a handler**, never at module scope —
`c.env` does not exist until a request arrives.

```ts
import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import { posts } from "./schema";

app.get("/posts", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(50);
  return c.json(rows);
});

app.post("/posts", async (c) => {
  const db = getDb(c.env);
  const { title, body, author } = await c.req.json();
  const [created] = await db
    .insert(posts)
    .values({ id: crypto.randomUUID(), title, body, author })
    .returning();
  return c.json(created, 201);
});
```

Rules that matter here:

- **Never build SQL by string concatenation.** Drizzle parameterises everything
  you pass through its query builder, which is what keeps injection out. If you
  genuinely need raw SQL, use the `sql` template tag from `drizzle-orm` — it
  parameterises too. Never assemble a query with `+` or a plain template literal.
- **Change tables in `src/schema.ts`, then generate a migration.** `npm run
  db:generate` writes the SQL, `npm run db:migrate` applies it locally, and you
  commit both. Never create a table by hand in a console — a schema nobody can
  reproduce is a schema that breaks on the next machine.
- **Changing a table on the DEPLOYED database: call `unlockTables` first.**
  The database creates every table "schema locked", and a locked table refuses
  `ALTER TABLE`, `CREATE INDEX` and `DROP INDEX` with *"this schema change is
  disallowed because table … is locked"*. Your app cannot remove that lock
  itself. `unlockTables(c.env)` from `src/db.ts` asks SV Cloud to remove it
  from every table, and they stay unlocked. In a migration route, call it after
  any step that creates a table and before any step that changes one. It is
  safe to repeat. If you hit the error anyway, call it and retry that step;
  steps that already ran do not need re-running. The owner can do the same from
  outside the app with `svcloud db unlock <app>` or the `db_unlock_tables`
  tool. Never try `ALTER TABLE … SET (schema_locked = false)` yourself: the
  database refuses it from inside your app, and you do not need to relock
  anything afterwards.
- **`ALWAYS put a LIMIT on a query that could grow.** The platform refuses
  results past a size cap and tells you to paginate, so an unbounded
  `select().from(...)` on a table that grew is a runtime error, not slow success.
- **Index anything you filter or sort by.** See the example in `src/schema.ts`.
- **`count(*)` and `bigint` return string scalars deployed (`"1"` not `1`).**
  Postgres drivers return `bigint` columns as strings in JavaScript to avoid numeric
  precision loss. Use `Number(row.count)` or `parseInt` when doing strict comparisons
  (e.g. `rank === 1`) so your code behaves identically locally and deployed.
- **`db.transaction()` does not work and will throw.** Use `batch` from
  `src/db.ts` instead — same all-or-nothing guarantee:

  ```ts
  import { sql } from "drizzle-orm";
  import { batch, getDb } from "./db";

  const db = getDb(c.env);
  await batch(c.env, [
    db.insert(orders).values({ id, total }),
    db.update(stock).set({ qty: sql`qty - 1` }).where(eq(stock.sku, sku)),
  ]);
  ```

  This is not a missing feature to work around. An open transaction would hold a
  shared connection while your code thinks, and one slow request would stall
  every app on the platform. `batch` gives the same guarantee without holding
  anything open.

#### Every database call is a trip

Each `await db...` travels from your app to the database and back, which takes
tens of milliseconds no matter how small the query is. A page that makes five
calls one after another waits for five trips. Most slow pages here are slow for
that reason, not because a query is heavy. Keep the number of trips down:

- **Run independent queries at the same time.** If two queries do not need
  each other's results, start both and wait once:

  ```ts
  const [jobs, drivers] = await Promise.all([
    db.select().from(jobsTable).where(eq(jobsTable.day, day)).limit(200),
    db.select().from(driversTable).where(eq(driversTable.active, true)),
  ]);
  ```

- **Never query inside a loop.** Fetching related rows one at a time (for each
  job, look up its driver) is one trip per row. Use a join, or one
  `inArray(...)` query for all the ids, then match them up in code.
- **Fetch each value in the query, not with one subquery per field.** Do not
  store a row's fields as separate key/value rows and then read them back with a
  subquery per key; that makes the database look up every field of every row on
  its own, and a list page becomes the slowest thing in the app. Fields that
  every row has belong in columns. Settings and extras that really are
  key/value can live in one table, read with one query.
- **Keep settings that rarely change in memory for a short time.** A value read
  on every request (feature flags, app settings) does not need a trip each time.
  Keep it in a module-level variable with a timestamp and re-read it after a
  minute or so. Anything that must be exactly current (a balance, stock, a
  permission) is always read fresh.
- **No setup queries per request.** Hard rule 11: a table is created once,
  deliberately, never by `CREATE TABLE IF NOT EXISTS` that runs whenever your
  app starts.
- **Several writes that belong together go in one `batch`** (above), which is
  also one trip for the whole set rather than one per statement's wait.

### If this project's users are global, not just local

Skip this section unless the owner has said their users are spread out
geographically (not just "the app is deployed globally" — every app on this
platform already is; this is about where the PEOPLE using it are). By default
every query goes to this project's one home database region, which is correct
and fastest when its users are mostly in one place.

Two tools exist for the case where they are not, both **opt-in** — do not reach
for them unless actually needed, and never as a default:

- **`staleRead(env, query, { region, maxStaleness })`** in `src/db.ts` — lets
  ONE read be served by whichever database region is nearest the request
  instead of this project's home region, at the cost of the row being up to
  `maxStaleness` (default `10s`) out of date. **Narrower than it sounds —
  verified against this platform's own cluster:** only a single row looked up
  by an equality match on a primary or unique key (`where(eq(posts.id,
  postId))`) works. CockroachDB refuses bounded staleness for anything it
  cannot prove touches exactly one row at plan time, so a `LIMIT`-only scan,
  `WHERE id IN (...)`, or `count(*)` all fail — this is NOT the tool for a
  feed, a leaderboard, or any listing, whatever "read that's fine to be a
  little stale" makes you think of first. It's for "the one post this URL
  names," "this user's own profile by id." Also single-table only — no joins,
  no subqueries; `staleRead` throws before querying if it can't place the
  clause. **Wrong** for anything the user just wrote and expects to see
  immediately — their own new comment, their updated profile — a stale
  replica will not have that write yet. Pass `region: regionFromCf(c.req.raw.cf)`,
  also exported from `src/db.ts`. Read that function's own doc before
  changing it — the region mapping is a coarse heuristic, not precise
  geolocation.
- **`topology: "global"` at connect time** (a platform setting, not something
  in this repo — `POST /projects/connect` accepts an optional `topology`
  field) is what actually gives `staleRead` somewhere nearer to reach —
  without it every region routes to the same home database anyway and
  `staleRead`'s clause is a harmless no-op. There is no dashboard toggle for
  this yet; changing it means reconnecting the project with that field set,
  which is not something this repo's own code can do. Tell the owner it needs
  a platform-side change, not something to route around here.

Writes still always go to the home region — there is no opt-in for fast global
writes on this platform. If the owner needs that too, that is a real
conversation to have with them, not something to route around here.

### File storage — "can we add a bucket?"

**The answer is that you already have one, and there is nothing to create.**

Owners ask for "a bucket" because that is the word AWS and Cloudflare taught
them. What this project has is better for the purpose: storage that is already
provisioned, already private to this app, and already wired up. When somebody
asks for a bucket, or for S3, or where to put the AWS keys, say that it is
already there and start writing code.

**Never do any of these. Each one breaks the app or leaks somebody's data:**

- **Do not create a bucket** — not in the Cloudflare dashboard, not with
  `wrangler r2 bucket create`, not through any API. The app cannot be given a
  new one, and creating it achieves nothing except confusing the owner into
  thinking it is being used.
- **Do not add `[[r2_buckets]]` to `wrangler.toml`.** The deployed app's
  bindings are decided by the platform at upload time, not read from that file,
  so an entry you add is silently ignored — and if you then write code against
  it, that code fails only once deployed. The `BUCKET` entry already in there is
  for local development and must be left alone.
- **Do not ask the owner for AWS, S3, or Cloudflare credentials**, and do not
  accept them if offered. This app has its own storage credentials already, set
  by the platform, and they are the only ones that will work.
- **Do not try to make storage public.** There is no "public bucket" switch
  here. Serving a file to a browser has its own answer, below.
- **Do not store file bytes in Postgres.** The row is what you query; the object
  is what you serve.

#### Reading and writing files from your app

```ts
import { getObject, getObjectUrl, putObject, listObjects, deleteObject } from "./storage";

// Write. Pass the stream straight through - do not read the file into memory.
await putObject(c.env, key, file.stream(), { contentType: file.type });

// Give a BROWSER the file - an <img>, a <video>, a download link.
// This is the one you want almost every time.
const url = await getObjectUrl(c.env, key);

// Read the bytes because YOUR OWN CODE needs them - parsing a CSV, making a
// thumbnail. Never to hand them on to a browser; see the rule below.
const object = await getObject(c.env, key);
const text = await new Response(object.body).text();

await deleteObject(c.env, key);
const listing = await listObjects(c.env, { prefix: `uploads/${userId}/` });
```

Rules that matter here:

- **Never trust a user-supplied filename as a key.** Generate the key yourself
  (`uploads/${userId}/${crypto.randomUUID()}`) and keep the original name in the
  database if you need to show it. A raw filename lets one user overwrite
  another's object.
- **A key is a flat string.** `uploads/2026/june/a.jpg` is not three folders, it
  is one key with slashes in it. Nothing needs creating first, and listing by
  prefix is how you get folder-like behaviour.
- **Everything you store is private to this app.** Another SV Cloud project
  cannot read it, and neither can anybody without a URL you deliberately made.
  You do not need to prefix keys to keep other projects out; that is already
  handled. Prefix them to keep your own users apart from each other.
- **Store the metadata in Postgres, the bytes in storage.** Size, content type,
  owner, uploaded-at, original filename: all rows. The object is just the bytes.
- **The `assets/` prefix is reserved.** Design assets from `design/assets/`
  (§5.1) are synced there and served by the `/assets/*` route in `src/index.ts`.
  Keep runtime user-upload keys (`uploads/...`) out of it so the two never
  collide.
- **Roughly 100 MB is the ceiling for a file your app writes itself**, and the
  request has to finish inside the app's own time budget. Bigger than that is
  not a limit to work around with clever chunking — it is the sign that you want
  one of the next two sections instead.

#### Four ways files move, and picking the right one

Most storage mistakes are picking the wrong one of these, so read all four
before you write anything.

| The situation | Use | Why not the others |
| --- | --- | --- |
| Your app reads or writes a file itself, under ~100 MB | `putObject` / `getObject` | The default. Nothing else is simpler |
| **A signed-in user of your app uploads something big** — video, raw photos, an export | `startLargeUpload` (below) | `putObject` physically cannot: the whole request has to fit in your app's memory and time budget |
| **A browser loads the file** — every `<img>`, `<video>`, download button | `getObjectUrl` (below) | Re-serving bytes from your own route is not slow, it is unusable: measured at ~40 KB/s on the deployed platform |
| Somebody **without an account** sends you files — a photographer, a client | An upload link (§5.2) | Already built, with its own budget and expiry. Do not build an upload page for this |
| You are porting code that already speaks S3 | `src/s3.ts` | Only for existing S3 code. For anything new, `storage.ts` is shorter and needs no dependency |

**Serving a file to a browser.** This is the single most important rule in
this section, and it is not a matter of taste. Do not do this:

```ts
// WRONG - and not merely inefficient. Measured at ~40 KB/s on the deployed
// platform: a 7 MB photo takes about three minutes, the browser gives up, and
// you get a blank image with a 200 status and nothing in the logs.
const object = await getObject(c.env, key);
return new Response(object.body);
```

Hand the browser a direct URL instead:

```ts
import { getObjectUrl } from "./storage";

app.get("/api/photos", async (c) => {
  const rows = await listPhotos(c.env);
  return c.json({
    photos: await Promise.all(
      rows.map(async (row) => ({ ...row, url: await getObjectUrl(c.env, row.key) })),
    ),
  });
});
```

The browser then fetches storage directly and your app is not in the byte path
at all.

**It is also what the owner is billed for.** An app is charged for the time it
spends running. Streaming a file through it charges for the entire download —
a 200 MB video served this way bills minutes of running time for a single
viewer, and does it again for every viewer. Handing back a URL bills a few
milliseconds regardless of the file's size, and does not grow as the file or the
audience does. Speed is the reason it does not work; cost is the reason it would
still be wrong if it did.

**`getObject` remains correct when YOUR code needs the bytes** — reading a CSV
to import, generating a thumbnail, inspecting a file. The rule: bytes your app
consumes, `getObject`; bytes a browser displays, `getObjectUrl`.

The starter's own `/assets/*` route in `src/index.ts` is written this way —
redirect when deployed, serve directly only on your own machine. Copy that
shape for any route of yours that hands out files.

Two things about those URLs, because both surprise people:

- **The link works for anybody holding it** until it expires. It is a shared
  link, not a private one. Mint it as you render, not once into a database row.
- **It expires on its own**, in minutes. That is what makes handing one out
  safe, and it is why storing one is a bug rather than a shortcut.

If the file is genuinely public — a logo, a landing-page image — it belongs in
`design/assets/` (§5.1), which is served by your app at a stable `/assets/*`
URL and needs none of this.

**Uploads from your own signed-in users** go through your app with
`putObject` while they are small, because you are the one who has to check the
user is allowed. Past about 100 MB that stops being possible — see the next
section. Only reach for an upload link when the sender has no account to check.

#### Big uploads from your own users

The owner will ask for this the moment their app touches video. It is
supported, it is not hard, and there is exactly one right shape for it.

**`putObject` cannot carry a file this size and never will.** Your app is a
Worker: the whole request has to fit in its memory and its time budget, so
~100 MB is a hard edge, not a setting. Do not try to work around it by chunking
into your own routes and reassembling — you would be paying for every byte
twice and rebuilding, worse, the thing described below.

The way through is to keep the bytes away from your app entirely. You hand the
browser a list of upload URLs, the browser sends the parts straight to storage,
and your app is only told where to put the file and when it finished. The
current ceiling is **10 GB per file**.

```ts
import {
  startLargeUpload, moreUploadParts, finishLargeUpload, abortLargeUpload,
  LARGE_UPLOAD_THRESHOLD,
} from "./storage";

// 1. The browser says what it wants to send. YOU decide if it may.
app.post("/api/uploads/start", async (c) => {
  const user = await requireUser(c);              // your auth, not the platform's
  const { filename, size, contentType } = await c.req.json();

  const key = `uploads/${user.id}/${crypto.randomUUID()}`;
  const upload = await startLargeUpload(c.env, key, size, { contentType });

  await getDb(c.env).insert(uploads).values({
    id: upload.uploadId, userId: user.id, key, filename, bytes: size, status: "pending",
  });

  return c.json({ key, ...upload });
});

// 2. The browser PUTs each part to its URL, collects the ETag each returns,
//    and comes back here when it needs more URLs than the first window held.

// 3. Assemble.
app.post("/api/uploads/finish", async (c) => {
  const user = await requireUser(c);
  const { key, uploadId, parts } = await c.req.json();
  const row = await findUploadOwnedBy(c.env, uploadId, user.id);   // check again

  const metadata = await finishLargeUpload(c.env, key, uploadId, parts);
  await markLanded(c.env, row.id, metadata.size);
  return c.json({ ok: true, bytes: metadata.size });
});
```

Four things that are easy to get wrong here:

- **You are still the one who says yes.** Nothing in `storage.ts` checks whether
  this user may upload. `/api/uploads/start` is where that happens, and it is
  why this is a route of yours rather than an endpoint the platform exposes.
  Check the session, check any limit of your own, and **generate the key
  yourself** — never let the browser choose it.
- **The part size is not yours to pick.** Every part except the last must be
  exactly `UPLOAD_PART_SIZE`. The browser slices on that boundary or the
  finished file is rejected.
- **Abandoned uploads cost money silently.** Parts that were uploaded but never
  assembled are stored, and billed, and appear in no listing. Call
  `abortLargeUpload` when a user cancels, and sweep old `pending` rows on a
  schedule. This is the one piece people forget.
- **Resuming is free if you ask for it.** `uploadedParts` tells you what
  actually arrived; hand out URLs for only the rest. A dropped connection then
  costs the user the last part, not the whole file.

None of this works in `npm run dev` — there is no way to hand a browser a
direct upload URL locally, and the functions say so rather than failing
strangely. Develop against `putObject` and a small file.

### 5.1 Design assets — `design/assets/` and `design/reference/`

The owner's own design work lives in `design/`, created at bootstrap. Two
folders, two different jobs:

- **`design/reference/`** — the brief: mockups, a `spec.md`, screenshots,
  moodboards. Never deployed, never uploaded. **Read this before writing UI
  code** — it's what the owner actually wants built, not a nice-to-have.
- **`design/assets/`** — real runtime media: a logo, a hero video, icons,
  product photos. Everything here is synced to this project's storage bucket
  (under the `assets/` prefix above) by the deploy pipeline, and served by the
  `/assets/*` route already wired in `src/index.ts`. The sync only moves what a
  commit actually changed, so adding one icon costs one upload however much
  media the folder holds.

Workflow for adding one:

```bash
# put the file at design/assets/logo.svg, then:
npm run assets          # regenerates src/assets.ts from what's in the folder
git add design/assets src/assets.ts
git commit -m "Add logo"
git push                 # CI syncs it to storage; deploy.yml does the upload
```

Reference it with the generated `asset()` helper, never a bare string or an
external URL:

```ts
import { asset } from "./assets";

app.get("/", (c) => c.html(`<img src="${asset("logo.svg")}" alt="Logo" />`));
```

`asset()` is typed from the real folder contents, so a typo is a
`npm run typecheck` failure, not a broken image discovered during a demo.

To see an asset locally, seed your local bucket once per new file:

```bash
npm run assets:local     # copies design/assets/ into local storage
npm run dev
```

`npm run assets:check` runs in CI (§10) and fails the build if `src/assets.ts`
is stale, a file is over 50 MB, or the folder is over 500 MB total — regenerate
with `npm run assets` and compress oversized media rather than working around
the check.

Deleting a file from `design/assets/` removes it from `src/assets.ts` and from
your app, but the copy already in storage stays there. That is deliberate: no
deploy of yours will ever delete a file a running app might still be serving.
Remove it from the Files screen of the dashboard if you want the space back.

### 5.2 When somebody outside the project needs to send in files

The owner will eventually say some version of this:

> "My photographer has 2,000 photos and some video for the gallery — how do
> they get them to me?"

**Do not build an upload page for this, and do not ask them to commit the files
to the repository.** `design/assets/` (§5.1) is for a handful of small design
files that ship with the code; it is not a delivery mechanism, it caps out, and
it would mean giving a photographer access to the owner's GitHub. The platform
already has the thing they need.

**It is called an upload link.** The owner creates one, sends the URL to
whoever is delivering the files, and that person opens it in a browser and drags
their folder in. They need no account, no password, and no software. The files
land in this app's own file storage, in a folder you chose, and you read them
back with `listObjects` exactly like anything else in §5.

Create one for them with the `upload_link_create` tool (§11 — if the tool is not
available, the owner can do the same thing from the Files screen of their
dashboard):

```
upload_link_create
  label:   "Wedding photos — August"     <- what the photographer sees
  prefix:  "uploads/wedding"             <- where the files land in storage
```

You get back a URL. **Give it to the owner immediately and tell them it is shown
only once** — it is not stored anywhere and cannot be looked up later. If they
lose it, create another one.

#### What to tell the owner, in their words

Most people have never met any of this vocabulary. Say it like this:

- **"They don't need an account."** The link is the whole thing. No sign-up.
- **"Big files are fine."** Photos, RAWs, and multi-gigabyte video all work.
  There is no need to zip anything, and zipping actually makes it worse — a
  zip cannot resume and cannot be looked at until it is complete.
- **"If their internet drops, nothing is lost."** This is what *resumable*
  means, and it is the part worth spelling out. If their laptop closes at 60%,
  they reopen the same link, drag the same folder in again, and it picks up
  where it stopped — it skips every file that already arrived, and for a big
  video it continues from the middle of that file rather than starting it over.
  They will not believe this, so tell them explicitly to just drop the whole
  folder in a second time.
- **"The link stops working on its own."** A day by default, a week at most.
  After that it is dead and they need a new one. This is deliberate: a link
  that lived forever would be a permanent open door into the owner's storage.
- **"You can turn it off early."** `upload_link_revoke`, or the dashboard.
  Revoking stops *new* uploads. It does **not** delete anything already sent —
  those files are the delivery, and they stay.
- **"There is a size budget."** 50 GB per link by default. When it is used up
  the link refuses politely rather than failing halfway. For a bigger delivery,
  make a second link.

#### Reading the files in your app

Nothing special — they are ordinary objects under the prefix you chose:

```ts
import { listObjects, getObject } from "./storage";

const { keys } = await listObjects(c.env, { prefix: "uploads/wedding/" });
```

Each key is `uploads/wedding/<random>-<their-filename>`. The random part is
deliberate: two photographers both sending `IMG_0001.jpg` must not overwrite
each other, and nobody uploading through a link is allowed to choose where their
file lands. If you want to show the original filename, store it in Postgres
alongside the key when you first list the folder — same rule as §5's "metadata
in Postgres, bytes in R2".

#### What an upload link cannot do

Say so plainly if the owner asks for these:

- **It cannot read or list anything.** Whoever holds the link can add files and
  nothing else. They cannot see what is already there, cannot download, cannot
  delete. This is why it is safe to send to somebody outside the company.
- **It is not a shared folder.** There is no two-way sync and no client app.
  It is a one-way delivery, open for a day.
- **It does not notify anyone.** If the owner wants to know when a delivery
  lands, that is something you build: when your app learns a delivery is
  complete, `publish` to a stateful object the owner's page `listen`s on
  (§5.4). Do not poll `listObjects` on a timer (hard rule 10). The owner can
  also check the link's progress with `upload_link_list`.

#### If the owner wants to build video playback on top of this

Storing video and *streaming* it are different problems, and this section only
solves the first. An upload link will happily accept a 12 GB clip; serving that
clip to viewers means range requests, bandwidth, and — for anything at real
scale — a video product rather than an object store. **Do not quietly build a
`<video src="/assets/...">` and call it a streaming platform.** Tell the owner
it is a separate piece of work with its own running cost, and let them decide
before you start.

### Choosing between them

Files go in storage, records go in Postgres. Do not base64 a file into a database column — it bloats the table and will hit the result-size cap on your next query. Do not use storage as a database by listing and filtering keys — listing is slow and has no index.

### Locally

`npm run dev` talks to a **Postgres running on your own machine** and a real local bucket standing in for storage. Nothing is shared with the deployed app, and it is safe to wipe. This local bucket is the one and only place `c.env.BUCKET` exists — `src/storage.ts` uses it when running locally and the platform's storage service when deployed, so your code does not have to care which. [INSTALL.md](INSTALL.md) sets Postgres up; if `npm run dev` reports it cannot reach a database, that is the file to go back to.

A fresh local database has no tables, so run `npm run db:migrate` before
expecting a query to work.

The same Drizzle code runs in both places — only the transport underneath
changes, and `src/db.ts` handles that. A query that works locally works deployed.

### This app is portable

Worth knowing, and worth telling the owner if they ask what happens later:
**nothing here is locked to SV Cloud.** This is a plain Worker — a V8 isolate —
and `src/db.ts` talks to whatever `DATABASE_URL` points at whenever the
platform's data binding is absent. Host it anywhere that runs isolates, point it
at any Postgres, and it runs unchanged.

The same is true of storage: `src/storage.ts` falls back to an ordinary R2
bucket whenever the platform's storage service is absent, and `src/s3.ts` is a
standard S3 client, so code written against either moves to another host with
its endpoint changed and nothing else.

That is also why you should not scatter platform-specific calls through the
handlers: `src/db.ts` and `src/storage.ts` are the whole surface, and keeping it
that way is what keeps the exit cheap.
### 5.4 Stateful objects — live connections, scheduled tasks, exact counters

Your database (§5.2) is the right place for almost everything. A **stateful
object** is for the three things a database is bad at:

| You need | Why the database is wrong for it |
|---|---|
| Many people watching the same thing change | Polling a table is slow and expensive; nobody sees anything until they refresh |
| Work that happens later, with nobody visiting | A database does not wake up on its own |
| A number that must be exactly right under load | Two requests incrementing the same row can lose an update |

Everything runs through **`src/state.ts`**. Read that file before using any of
it — it is short, and the header explains the one decision you have to make.

```ts
import { getStatefulObject } from './state';

// A live chat room
app.get('/ws/:room', async (c) => {
  const session = await requireSession(c);            // YOUR check, first
  const room = await getStatefulObject(c.env, `room:${c.req.param('room')}`);
  return room.connect(c.req.raw);
});

// A reminder an hour from now (fires webhook signed with HMAC)
const job = await getStatefulObject(c.env, `order:${orderId}`);
await job.scheduleTask('send-reminder', Date.now() + 60 * 60 * 1000, {
  secret: c.env.TASK_WEBHOOK_SECRET,
  data: { orderId },
});

// A counter that cannot lose an update
const counter = await getStatefulObject(c.env, `views:${postId}`);
const total = ((await counter.get('total')) as number | null) ?? 0;
await counter.put('total', total + 1);
```

**You address an object by a name you choose.** The same name always reaches the
same object; a name nobody has used becomes a new empty one. There is nothing to
create and nothing to configure — do not add anything to `wrangler.toml`.

**The name is a security decision and it is yours.** Build it on the server from
something you have already verified. See hard rule 8 — this is the one mistake
in this section that leaks one user's data to another.

**What one object gives you**

- **Stored values** (`get`/`put`/`delete`/`list`) for private state (counters,
  queues, rate limits).
- **Scheduled tasks** (`scheduleTask`), each with a name, a time, and an optional payload.
  Schedule as many as you like. When a task fires, the platform automatically
  dispatches an authenticated HTTP POST webhook to your app (`/api/tasks/webhook` or custom
  payload `path`), signed with HMAC-SHA256 (`x-sv-task-signature`). Verify it with
  `verifyTaskWebhook(c.req.raw, c.env.TASK_WEBHOOK_SECRET)`. Fired tasks also wait in a queue
  until collected with `takeTasks`. Cancel with `cancelTasks`.
- **Live connections** (`connect`). Everything one connection sends is passed to
  everybody else on the same object. For a chat room or a shared document.
- **Receive-only connections** (`listen`) and **server messages** (`publish`).
  For a page that watches data change. See the next subsection.

#### Pushing changes to open pages (instead of polling)

Whenever a page would otherwise refresh on a timer, use this instead. The page
opens a receive-only connection, and your server tells it when something
changed:

```ts
import { getStatefulObject } from './state';

// 1. The page connects. The NAME decides who hears what (hard rule 8).
app.get('/live/orders', async (c) => {
  const session = await requireSession(c);
  const feed = await getStatefulObject(c.env, `orders:shop:${session.shopId}`);
  return feed.listen(c.req.raw);
});

// 2. Your server writes, THEN publishes.
app.post('/api/orders/:id/pay', async (c) => {
  const session = await requireSession(c);
  await getDb(c.env).update(orders).set({ status: 'paid' })
    .where(and(eq(orders.id, c.req.param('id')), eq(orders.shopId, session.shopId)));
  const feed = await getStatefulObject(c.env, `orders:shop:${session.shopId}`);
  await feed.publish({ type: 'orders.changed' }).catch(() => {});  // never fail the request over it
  return c.json({ ok: true });
});
```

```js
// 3. In the browser: refetch on connect and on every message.
function watchOrders(onChange) {
  const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/live/orders`);
  ws.onopen = onChange;                               // catch up on anything missed
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;                    // the keepalive's answer
    if (JSON.parse(e.data).type === 'orders.changed') onChange();
  };
  ws.onclose = () => setTimeout(() => watchOrders(onChange), 2000);   // reconnect
  const keepAlive = setInterval(() => ws.readyState === 1 && ws.send('ping'), 30000);
  ws.addEventListener('close', () => clearInterval(keepAlive));
}
```

The `ping` keeps the connection open through proxies and costs nothing: the
platform answers it without waking the object. It is the only message a
`listen` connection may send.

The rules that make it correct:

- **The object's name is the audience.** Everyone connected to an object gets
  every message. Use a shared name (`orders:shop:${shopId}`) for "everyone
  watching this", and a per-user name (`user:${session.userId}`) to push to one
  person in all their open tabs. Always build the name from the checked session.
- **On a shared object, publish a signal, not the data.** Send
  `{ type: 'orders.changed' }` and let each page refetch through its own route,
  which checks what that viewer may see. On a per-user object you may send that
  user's own data directly.
- **Publish after the write succeeds, and never let it fail the request.** The
  write is what matters. A lost message only means a page refetches a little
  later.
- **Messages are not stored or replayed.** A page that was offline misses them,
  so it refetches when it connects and reconnects, and when the tab becomes
  visible again (`document.visibilitychange`).
- **Publish once per request, not once per row.** Every publish wakes the
  object, and awake time is what is billed. An import of 500 rows publishes once
  at the end.
- **`listen` for feeds, `connect` for conversations.** A `listen` connection
  cannot send, so a visitor cannot push fake updates to everyone else. Only use
  `connect` when users genuinely talk to each other.

**Work that repeats: schedule the next one from the handler.** There is no
separate "repeating task" or cron feature, and you should not go looking for
one. A schedule that repeats is a scheduled task whose handler schedules the
next occurrence before it does anything else:

```ts
const EVERY = 60 * 60 * 1000; // hourly

app.post('/api/tasks/webhook', async (c) => {
  if (!(await verifyTaskWebhook(c.req.raw, c.env.TASK_WEBHOOK_SECRET))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const task = await c.req.json<{ id: number; name: string; payload: unknown; firedAt: number }>();

  if (task.name === 'hourly-digest') {
    // 1. Keep the chain alive FIRST. See the ordering rule below.
    const job = await getStatefulObject(c.env, 'digest');
    let next = task.firedAt + EVERY;
    while (next <= Date.now()) next += EVERY;   // skip missed slots, do not queue a backlog
    await job.scheduleTask('hourly-digest', next, {
      secret: c.env.TASK_WEBHOOK_SECRET,
      data: task.payload,
    });

    // 2. Then do the work, and never let it throw past this point.
    try {
      await sendDigest(c.env, task.payload);
    } catch (err) {
      createLogger(c.env).error('digest failed', { err: String(err) });
    }
  }

  return c.json({ ok: true });
});
```

Five things decide whether this is reliable, and all five are in that example:

- **Reschedule before you do the work, not after.** A failed webhook is not
  retried. If the work throws and the reschedule was after it, the chain stops
  for good and nothing tells anybody — an hourly job simply never runs again.
- **Compute the next time from `task.firedAt`, not from `Date.now()`.** Adding
  the interval to "now" adds the handler's own latency to every cycle, and an
  hourly job drifts into a daily one over a long enough run.
- **Skip missed slots instead of catching up.** If the app was down for a day,
  `while (next <= Date.now()) next += EVERY` starts the chain again at the next
  real slot. Queueing twenty-four late digests is almost never what was wanted.
- **Start the chain once, and use one stable name per chain.** Kick it off from
  a route you call deliberately (or a setup step), not from ordinary request
  handling — two starts means two chains firing forever, and the chains cannot
  see each other. `cancelTasks('hourly-digest')` is the only off switch.
- **Handle the same task arriving twice.** Delivery is at-least-once, so make
  the work idempotent or record `task.id` and ignore one you have already done.

**An interval longer than 30 days does not survive** — see the reaping note
below. For those, schedule the next step sooner and re-check a date in your
database, or keep the schedule in the database and drive it from a shorter
chain.

**The cost, which is the part to get right.** Stateful objects are charged by how
long they are AWAKE, at a rate far above ordinary requests, because they are far
more expensive to run. Used the way `src/state.ts` does it, a connection costs
nothing while nobody is talking — the object sleeps between messages and wakes
for each one, so a room with fifty idle people in it costs the same as an empty
one. Holding a connection open the other way, by keeping code running in a loop,
can spend a month's whole allowance in under a minute. Always use `connect`;
never write your own socket loop.

**They are emptied if abandoned.** An object nobody has used for 30 days is
emptied and its contents destroyed, because it is charged for what it holds even
when it never runs. Anything that must last belongs in the database.

**The limits worth knowing.** 10 GB per object; 2 MB per stored value;
about 1,000 requests a second to any single object. If
you are near any of these, you have chosen the wrong tool — split across more
objects, or use the database.

**Do not build one per user for ordinary data.** A user's profile, their orders,
their posts all belong in the database, where you can query across them. Reach
for a stateful object when you need one of the three things in the table above.

### 5.5 Places on a map — is this coordinate inside that area?

`src/spatial.ts`. Reach for it when the app asks a question about WHERE
something is: which planning zone an address falls in, which delivery area
covers a pin, whether a vehicle left its territory.

Your database can answer that directly, with an index. **Do not fetch shapes
into JavaScript and test them there** — that reads the whole table, and
hand-written point-in-polygon gets holes, islands and edges wrong.

```ts
import { index, pgTable, text } from "drizzle-orm/pg-core";
import { asGeoJson, containsPoint, geomFromGeoJson, geometry } from "./spatial";

// In src/schema.ts
export const zones = pgTable("zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  area: geometry("area", { kind: "multipolygon" }).notNull(),
}, (t) => [index("zones_area_idx").using("gist", t.area)]);

// In a route
const hits = await db
  .select({ id: zones.id, name: zones.name })
  .from(zones)
  .where(containsPoint(zones.area, { lng: 100.5018, lat: 13.7563 }))
  .limit(10);
```

The things that decide whether this works:

- **Longitude first.** Every function takes `{ lng, lat }` as an object because
  the pair is the mistake everybody makes once. Bangkok is about
  `{ lng: 100.5, lat: 13.75 }`; swapped it is in Somalia, and nothing errors —
  you just get no matches. `spatial.ts` refuses a latitude outside -90..90 for
  this reason, but a plausible-looking swap it cannot catch.
- **Add the `gist` index.** Without it every lookup reads every row. With it the
  database narrows to a few candidate shapes and then tests those exactly, so
  the answer is fast AND exact, not approximate.
- **Use `geometry`, not `geography`.** There is no `ST_Contains` for geography —
  the database answers `unknown signature: st_contains(geography, geography)`.
  The cost is that distances in SRID 4326 come out in degrees, so for "within
  5 km" cast to geography for that one call; containment is unaffected.
- **`multipolygon` if any area has islands or holes.** A district with an
  enclave is a multipolygon, and a `polygon` column rejects the row on insert.
- **Never `select()` a geometry column with no column list.** It comes back as
  the database's binary format in hex, which is useless in JavaScript and large.
  Ask for `asGeoJson(zones.area)`, which arrives already parsed and is what a
  map library draws — and put a `limit` on it, because outlines are big enough
  to hit the result-size cap.
- **Use `src/spatial.ts`'s `geometry`, not Drizzle's.** Drizzle ships one and it
  is points only: it writes `geometry(point)` into the migration whatever you
  configure, drops the SRID, and throws `Unsupported geometry type` reading back
  a polygon.

**Creating the table on the DEPLOYED database needs the app, not the platform
tools.** `npm run db:generate` and `npm run db:migrate` cover your local
database as usual. But the platform's own table tools (`db_create_table`,
`svcloud db create-table`) know six column types and geometry is not one of
them, so they cannot make this table. Run the generated SQL once from the app
instead — a route you call deliberately and then delete, or a guarded setup
step — using the `sql` tag from `drizzle-orm`. Call `unlockTables(c.env)`
after creating the table and before adding its `USING GIST` index (see the
rule on changing tables earlier in this section). Commit the generated migration either way; it is what
makes the schema reproducible.

## 6. Tests — every change ships with one

Tests exist to stop the app breaking in ways nobody notices until a demo. `npm
test` runs on every push **before** the deploy step, so a failing test blocks
the deploy rather than shipping a broken site.

```bash
npm test              # once
npm run test:watch    # while working
```

Hono makes this cheap — `app.request()` exercises a route with no server and no
network:

```ts
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
```

The rules:

- **Every new route gets a test** — at minimum its status code and response shape.
- **Every bug fix starts with a failing test** that reproduces it. Write the test,
  watch it fail, then fix it. A fix without a test invites the same bug back.
- **Test behaviour, not implementation.** Assert on the response a user would get,
  not on which internal function was called.
- **Cover the unhappy path**: a 404 for unknown routes, a 400 for bad input, the
  empty-list case. Bugs live there, not in the happy path.
- **Never delete or `.skip` a failing test to go green.** A red test is
  information. If it is genuinely obsolete, say so explicitly and explain why.

## 7. Logging — enough to debug, not enough to drown

Use `src/logger.ts`, not bare `console.log`. It is level-aware, so the same code
can be chatty locally and quiet in production.

```ts
import { createLogger } from "./logger";

const log = createLogger(c.env);
log.debug("cart contents", { items: cart.length });   // local only, by default
log.info("checkout completed", { orderId });          // notable, low volume
log.warn("payment retry", { attempt });                // recoverable problem
log.error("checkout failed", { err });                 // always, needs attention
```

**Choosing a level** — the deployed Worker runs at `info` unless told otherwise,
so this is what decides whether production drowns:

| Level | Use for | Volume |
| --- | --- | --- |
| `debug` | Per-request detail, payloads, branch tracing | Off in production by default |
| `info` | Meaningful state changes a human would care about | A few per user action, at most |
| `warn` | Something recovered, but someone should know | Rare |
| `error` | Failed operation, unhandled exception | Rare, always actionable |

The rules that keep production readable:

- **Anything per-request goes at `debug`.** A single `info` in a hot path becomes
  thousands of lines an hour and buries the one line that mattered.
- **Never log secrets, tokens, passwords, full request bodies, or personal data.**
  Log an id, not the object.
- **Log errors once**, where you handle them — not at every level as they bubble.
- **Include context, not prose.** `log.error("upload failed", { key, status })`
  beats `log.error("something went wrong")`.

To debug a live problem, set `LOG_LEVEL=debug` as an environment variable from the
SV Cloud dashboard, reproduce, then **set it back**. Leaving it on is how you lose
the signal — and the logs cost money.

## 8. Engineering practices

**Small, complete changes.** One concern per change: the route, its test, and its
types together. Do not leave a half-wired feature behind a comment promising to
finish it.

**Types are not decoration.** No `any`. If a type is genuinely unknown use
`unknown` and narrow it. `npm run typecheck` must be clean — it runs in CI.

**Validate every input that crosses the network boundary.** Query params, JSON
bodies and headers are attacker-controlled. Check shape and range before use, and
return a 400 with a useful message rather than throwing a 500.

**Handle errors where you can act on them.** Do not wrap everything in
`try/catch` that swallows and returns `null` — that turns a loud bug into a silent
one. If you cannot handle it, let it propagate to the app-level error handler.

**Never invent API shapes.** If you do not know what a library returns, read its
types in `node_modules`, or call it in `npm run dev` and look. Guessing produces
code that typechecks and fails at runtime.

**Keep handlers thin.** Parse and validate input, call a function that does the
work, shape the response. Business logic in a separate module is testable without
HTTP.

**Delete dead code.** No commented-out blocks "just in case" — git remembers.

**Match the surrounding code.** Naming, file layout, error style and comment
density should look like what is already there, not like a different codebase.

**Say what you actually did.** If something is untested, or you worked around a
problem rather than fixing it, state that plainly. A confident report of work that
was never run wastes more of the owner's time than an honest "I could not get
this to run."

## 9. Reporting to the owner — errors, not warnings

Everything you put in front of the owner costs them attention, so report
**outcomes**: it worked, or it broke and here is what to do about it. There is
nothing useful in between.

**Swallow warnings.** If a command exits 0, the step worked — say so and move on.
Deprecation notices, peer-dependency complaints, `npm audit` counts, "N
vulnerabilities found", punycode `DEP0040`, GitHub Actions runner-version notices:
that is chatter from other people's code, on somebody else's schedule. Do not
paste it, do not summarise it, do not start a side quest to fix it.

**Surface failures in full, every time.** A non-zero exit, a type error, a red
test, a rejected deploy — that is a real problem and it has to reach a human. Give
the actual error text, the file and line, what you think caused it, and what you
propose to do. Never soften it and never bury it at the end of a paragraph of good
news.

**Judge by the exit code, not by the scary word.** "warning", "deprecated" and
"vulnerability" in output that still succeeded are not a failure. A calm-looking
stack trace in output that returned 1 is.

Two narrow exceptions:

- If a warning is the actual cause of the failure you are debugging, use it — at
  that point it is evidence, not noise.
- If the owner asks about a warning they saw, explain it plainly: what it means,
  why it is harmless, whether anything needs doing. Answer the question, do not
  amplify the alarm.

This is about other tools' chatter, not about your own honesty. §8 still stands:
never downgrade a genuine failure into a "warning", and never report work as done
that you did not run. Filtering the noise is what makes the one line that matters
get read.

## 10. How deploys work (for your awareness)

On push to `main`, GitHub Actions installs dependencies, typechecks, runs the
tests, checks `design/assets/` against `src/assets.ts` (§5.1), bundles the
Worker, uploads the design assets that commit changed, and hands the Worker
artifact to the SV Cloud API, which deploys it. Any of those failing stops the
deploy. You do not run any deploy commands or upload anything by hand. Just
push.

The asset step is incremental: SV Cloud remembers the last commit whose assets
reached storage, and only files changed since then are fetched and uploaded. If
an object ever goes missing from storage, put `[resync-assets]` in a commit
message to force a full upload pass.

Note that `wrangler.toml` configures **local dev and the build only**. The real
deployment's name, routes and compatibility settings are managed by SV Cloud, so
editing them here changes nothing about the live app. Environment variables and
secrets for the deployed app come from the SV Cloud dashboard, not from this file.

## 11. Connecting your harness to SV Cloud's tools

§0 named the tools you get once SV Cloud is wired into your harness's MCP
config — project health and deploy status, real error and slow-request logs,
the database and file browser, keys & settings, `storage_presign_url` for
handing a browser a direct link to one file (§5), the `upload_link_*` tools that
let somebody outside the project send files in (§5.2), and (§0a) the `init_*`
tools that finish this project's setup for you. None of that reaches you until
**thesandoman** has signed in and pointed their harness at it.

If they haven't yet, tell them:

```
npm install -g svcloud
svcloud --version
svcloud login
svcloud mcp setup <harness>
```

`<harness>` is whichever they're running you in — `claude-code`, `cursor`,
`opencode`, `antigravity`, `gemini-cli`, or `codex`. That writes the one
config file their harness actually reads, in the shape it actually expects,
and is the safest way to get it right: hand-writing an MCP config file is
exactly what went wrong the last time someone tried it for OpenCode
specifically, whose config shape doesn't look like every other harness's. It
also writes an absolute path when a bare `svcloud` wouldn't resolve for the
harness, which is the failure mode that produces an MCP server with no tools
and no error message.

`svcloud --version` printing `command not found` means the install worked and
the owner's `PATH` doesn't include npm's global bin directory. The fix is one
line and it is in INSTALL.md §5. `npx svcloud` is not the fix.

If a tool call still isn't showing up after that, `svcloud mcp check` reports
sign-in state, a live count of tools the current session can see, whether
`svcloud` is on the `PATH`, and whether each known harness's config file
exists and is the right shape — better first step than guessing.

### Keeping `svcloud` updated

To update to the newest CLI release, tell **thesandoman**:

```bash
npm install -g svcloud
```

Then restart your coding harness (or MCP server). If SV Cloud adds new permissions or tool capabilities to default scopes, running `svcloud login` again refreshes the session token with the updated scopes.

This is setup, not a nice-to-have: §0 says to raise it and wait before
starting work. If the owner has declined or is not around, you can still work
from the repo the way you would have before these tools existed — just be
explicit that you are doing so, and say what you cannot check because of it.

## 12. Keeping this app current

SV Cloud's starter gets better over time: new capabilities appear, and
occasionally something the platform used to do one way it now does another. A
project that never catches up keeps working, but it stops being able to do
things this platform can now do, and it can keep a deploy step that fails for
reasons nothing in this repo explains.

Four tools handle it. `bundle_status` says whether this app is behind and is
cheap enough to call whenever you are already looking at the project.
`bundle_plan` returns the whole update, file by file. `bundle_mark_updated`
records that it landed. `bundle_latest` just names the newest release.

**Read the plan before you write anything.** Every file in it carries an
action, and the actions mean different things:

- **Replace it exactly.** The owner never edited this file, so the new version
  is strictly better. Do not merge, do not preserve anything: overwrite it.
- **Merge, keep both.** The owner edited this file and the platform also
  changed it. Apply the platform's changes on top of theirs. Discarding either
  side is the one outcome that is always wrong.
- **Merge fields only.** `package.json`. Add what is missing, raise what is
  low, remove nothing. Never replace this file wholesale, and never write
  `package-lock.json` yourself — run `npm install` and let it regenerate.
- **Find it first.** The plan expected a file somewhere and it is not there.
  Locate it before writing, or you will create a second copy of something that
  already exists under another name.
- **Report only.** Files that belong to the owner, including `src/index.ts`
  and `wrangler.toml`. Mentioned so you know the template moved on. Leave them
  alone.
- **Delete it.** The platform retired this file and the owner never built on
  it.
- **Retired, and in use.** The platform retired this file and the owner's code
  depends on it. Read the migration notes, work out how to do the same job
  with what the platform supports now, then **talk to the owner before you
  change anything**: describe what their app does today, what it would do
  after, and what they would lose. Say it in terms of the app's behaviour, not
  in terms of which files move. Most owners here are not engineers and will
  agree to whatever you propose, which is exactly why the proposal has to be
  one you would defend.

Two rules that hold for the whole update:

**Do not commit and do not push.** Stage the changes and stop. The owner reads
the diff. That is what keeps every one of these edits reversible with
ordinary `git` — there is no undo button on the platform side.

**Then tell them what changed**, in a few sentences, in terms of what their
app can now do. "Your app can now hand large video files straight to the
browser instead of streaming them through the server" is useful. A list of
sixteen filenames is not.

When the owner has committed, run `svcloud bundle done` (or call
`bundle_mark_updated`). Skipping it does no damage, but the app keeps
reporting itself as out of date and the next update starts from the wrong
place — it works out what you changed by comparing against the version this
repo says it has.
