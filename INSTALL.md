# INSTALL.md — first-boot setup

Read this **before writing any code** in a fresh clone. It gets the toolchain and
dependencies onto whatever machine you are on. If you are an AI agent, follow it
top to bottom, then continue from [SVAGENTS.md](SVAGENTS.md).

Delete this file once setup is done and committed — its job is finished, and a
stale install guide is worse than none.

## 0. Work out where you are first

Do not guess the operating system. Detect it, then follow **only** the matching
section:

```bash
uname -s     # Darwin = macOS, Linux = Linux (incl. WSL), MINGW*/MSYS* = Git Bash on Windows
```

If `uname` does not exist, you are on Windows PowerShell or cmd — use §3.

## 1. macOS

```bash
node --version    # need v22 or newer
```

If it is missing or older than v22:

```bash
# Homebrew is the usual route. If `brew` is missing, install it from https://brew.sh first.
brew install node@22
brew link --overwrite --force node@22
```

You also need **Postgres**, the database this project uses, and **Git LFS**, for
the large files in `design/assets/`:

```bash
brew install postgresql@16 git-lfs
brew services start postgresql@16
createdb cloud_dev
git lfs install
```

Then jump to §4.

## 2. Linux (including WSL)

```bash
node --version    # need v22 or newer
```

If it is missing or older than v22, prefer a version manager over the distro
package — distro Node is usually years behind:

```bash
# nvm: works the same on every distro, no sudo needed
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install 22 && nvm use 22
```

You also need **Postgres**:

```bash
# Debian / Ubuntu / WSL
sudo apt update && sudo apt install -y postgresql
sudo service postgresql start

# Fedora / RHEL:  sudo dnf install -y postgresql-server && sudo postgresql-setup --initdb
# Arch:           sudo pacman -S postgresql

# Give the `postgres` user the password wrangler.toml expects, then create the DB
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb cloud_dev
```

And **Git LFS**, for the large files in `design/assets/`:

```bash
# Debian / Ubuntu / WSL
sudo apt install -y git-lfs

# Fedora / RHEL:  sudo dnf install -y git-lfs
# Arch:           sudo pacman -S git-lfs

git lfs install
```

Then jump to §4.

## 3. Windows

Use **PowerShell**. Two options, in order of preference:

```powershell
node --version    # need v22 or newer

# Option A — winget (built into Windows 11 / recent 10)
winget install OpenJS.NodeJS.LTS

# Option B — if winget is unavailable, download the LTS MSI from https://nodejs.org
```

You also need **Postgres**:

```powershell
winget install PostgreSQL.PostgreSQL.16
```

The installer asks for a password for the `postgres` user — enter `postgres`, so
it matches the `DATABASE_URL` already in `wrangler.toml`. If you choose a
different password, update that line to match. Then create the database:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres cloud_dev
```

And **Git LFS**, for the large files in `design/assets/`:

```powershell
winget install GitHub.GitLFS
git lfs install
```

Close and reopen the terminal after installing so `PATH` picks up `node`.

> **Strong recommendation:** develop inside **WSL2** instead, and follow §2. The
> toolchain (`wrangler`, its esbuild binary, file watching) is better tested on
> Unix, and paths behave predictably. If you hit odd native-module or path errors
> on native Windows, moving to WSL is usually faster than debugging them.

## 4. Project dependencies — every OS

From the repository root:

```bash
npm install
```

That installs `hono`, `drizzle-orm`, `postgres`, `wrangler`, `typescript` and
`vitest` locally. **Do not install wrangler globally** — the pinned local copy is
the one the build uses, and a mismatched global version is a common source of
"works for me" bugs.

Then create your database tables:

```bash
npm run db:migrate
```

A fresh database has no tables. Skip this and your first query fails with
`relation "posts" does not exist` — that error means "run the migration", not
"the code is wrong".

## 5. Install the SV Cloud CLI and sign in — REQUIRED

This step is not optional and it is not "recommended". `svcloud` is how you
sign in to the platform from this machine, and it is the only way your AI
coding agent can see this project's real health, deploy status, error logs
and database. Skip it and your agent is guessing from the source files alone.

```bash
npm install -g svcloud
svcloud --version
```

**Run that `--version` line. Do not assume the install worked.** `npm install
-g` can succeed while leaving you unable to run the command, because npm's
global bin directory is not always on your shell's `PATH`. Two outcomes:

- It prints a version. Good, carry on.
- It prints `command not found: svcloud`. The package installed fine; your
  shell just cannot see it. Fix the `PATH` once:

  ```bash
  echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
  ```

  Use `~/.bashrc` instead of `~/.zshrc` on most Linux shells; on Windows,
  reopen the terminal after installing Node so `PATH` is picked up. Then run
  `svcloud --version` again before continuing.

**Do not work around this with `npx svcloud`.** It looks like it works, and
it is the wrong shape: every single invocation re-resolves the package over
the network, so the npm registry becomes a startup dependency of your coding
agent's tools, and an agent that is offline or rate-limited simply has no
tools with no explanation.

Now sign in:

```bash
svcloud login
```

Then wire your coding agent to the platform (Claude Code, Cursor,
Antigravity, OpenCode, Gemini CLI, or Codex):

```bash
svcloud mcp setup <harness>   # e.g., svcloud mcp setup claude-code
```

Let that command write the config rather than hand-writing one: it knows the
file and shape each harness actually reads, and it writes an absolute path
when a bare `svcloud` would not resolve for the harness. Check the whole
setup at any time with:

```bash
svcloud mcp check
```

It reports whether you are signed in, how many tools your session can see,
whether `svcloud` is on your `PATH`, and whether each harness's config file
exists and is the right shape.

## 6. Verify before you write any code

All five must pass. If one fails, fix it before continuing — do not start
building on a broken toolchain.

```bash
node --version           # v22.x or newer
svcloud --version        # the CLI from step 5, on your PATH
npx wrangler --version   # resolves the LOCAL wrangler from node_modules
npm run typecheck        # no TypeScript errors
npm test                 # the starter regression tests pass
```

Then start the local server and actually look at it:

```bash
npm run dev              # serves http://localhost:8787
```

Open that URL, or `curl -s http://localhost:8787/api/health`. You should get
`{"status":"ok"}`. Stop the server with Ctrl-C.

## 7. Now add your design

This is the step that makes the repo yours. Open [design/README.md](design/README.md)
— it walks through the two folders that were created for you:

- `design/reference/` — drop in mockups, a spec, screenshots, anything that
  shows what you're building. Nothing here is deployed; it's the brief.
- `design/assets/` — the images, video, audio your app actually serves. Add a
  file, run `npm run assets`, commit both, and push — it uploads automatically.

Once you've read it, delete this file (§9) and start building.

## 8. Common failures

| Symptom | Cause and fix |
| --- | --- |
| `command not found: npx` | Node did not install, or the terminal predates it. Reopen the terminal, re-check §1–3. |
| `Could not resolve "hono"` | `npm install` was never run, or was run in the wrong directory. Run it from the folder containing `package.json`. |
| `EACCES` / permission errors on install | You used `sudo npm install` at some point. Do not — fix ownership (`sudo chown -R $(whoami) ~/.npm`) and reinstall without sudo. |
| Port 8787 already in use | Another `wrangler dev` is running. Stop it, or `npx wrangler dev --port 8788`. |
| `npm ERR! peer dep` | Do not reach for `--force` or `--legacy-peer-deps`. Read which two packages disagree and align their versions. |
| `ECONNREFUSED ... 5432` | Postgres is not running. macOS: `brew services start postgresql@16`. Linux/WSL: `sudo service postgresql start`. Windows: check the PostgreSQL service is started. |
| `database "cloud_dev" does not exist` | You installed Postgres but skipped `createdb cloud_dev` in §1–3. |
| `password authentication failed for user "postgres"` | The password you set does not match `DATABASE_URL` in `wrangler.toml`. Change one to match the other. |
| `relation "posts" does not exist` | The database is empty. Run `npm run db:migrate`. |
| A file in `design/assets/` opens as a few lines of text like `version https://git-lfs.github.com/spec/v1` | Git LFS is not installed, or `git lfs install` was never run — see §1–3, then `git lfs pull`. |
| `npm run assets:check` fails with a size error | The named file (or the folder total) is over the limit. Compress it — see `design/README.md`. |

## 9. What you must NOT do

- **Do not run `npx wrangler deploy` or `wrangler login`.** This project has no
  cloud credentials and does not need them. SV Cloud deploys for you when you
  push to `main`. See [SVAGENTS.md](SVAGENTS.md).
- **Do not commit `node_modules/`** or any `.env` file with real values.
- **Do not hand-edit `src/assets.ts`.** Run `npm run assets` instead — see
  `design/README.md`.
