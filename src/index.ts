import { Hono } from "hono";
import { createLogger, type LoggerEnv } from "./logger";
import { type StateEnv, verifyTaskWebhook } from "./state";
import { getObject, getObjectUrl, type StorageEnv } from "./storage";
import { generateSession, scoreSession, toPublic, type Answers } from "./vibe/generator";

type Bindings = LoggerEnv & StorageEnv & StateEnv;

const app = new Hono<{ Bindings: Bindings }>();

const SUBDOMAIN = "jurrgun";
const OWNER = "thesandoman";

/**
 * The landing page. Self-contained on purpose — no build step, no CSS file to
 * keep in sync.
 */
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${SUBDOMAIN} · SV Cloud</title>
<meta name="description" content="An app by ${OWNER}, running on SV Cloud." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink-950: #070C09;
    --ink-900: #0C1410;
    --ink-700: #18241E;
    --ink-500: #324439;
    --text-hi: #F1F6F2;
    --text-mid: #A9BAAE;
    --text-low: #859789;
    --green-600: #16A34A;
    --green-500: #22C55E;
    --green-400: #4ADE80;
    --line: rgba(173, 199, 183, 0.13);
    --green-soft: rgba(34, 197, 94, 0.12);
    --green-glow: rgba(34, 197, 94, 0.16);
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--ink-950);
    background-image:
      radial-gradient(900px 500px at 50% -10%, var(--green-glow), transparent 70%),
      linear-gradient(var(--ink-950), var(--ink-900));
    color: var(--text-hi);
    font-family: 'Outfit', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.7;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: min(680px, 100%);
    background: var(--ink-700);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: clamp(28px, 5vw, 48px);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
  }
  .status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--green-400);
    background: var(--green-soft);
    border: 1px solid rgba(34, 197, 94, 0.34);
    border-radius: 999px;
    padding: 5px 12px;
  }
  .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--green-400);
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
    animation: pulse 2.4s ease-out infinite;
  }
  @keyframes pulse {
    70%  { box-shadow: 0 0 0 9px rgba(74, 222, 128, 0); }
    100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  }
  h1 {
    margin: 22px 0 0;
    font-size: clamp(1.6rem, 4.4vw, 2.3rem);
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  h1 .prompt { color: var(--green-500); font-family: var(--mono); margin-right: 10px; }
  p.lead { margin: 14px 0 0; color: var(--text-mid); font-size: 1.05rem; }
  .url {
    margin-top: 24px; padding: 12px 16px;
    background: rgba(7, 12, 9, 0.6);
    border: 1px solid var(--line);
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 0.9rem;
    color: var(--green-400);
    word-break: break-all;
  }
  .endpoints {
    margin-top: 24px;
    background: rgba(7, 12, 9, 0.4);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 16px 20px;
  }
  .endpoints-title {
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-low);
    margin-bottom: 8px;
  }
  .endpoint-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    font-family: var(--mono);
    font-size: 0.82rem;
  }
  .endpoint-item a {
    color: var(--green-400);
    text-decoration: none;
  }
  .endpoint-item a:hover {
    text-decoration: underline;
  }
  .endpoint-desc {
    color: var(--text-mid);
    font-family: 'Outfit', sans-serif;
    font-size: 0.85rem;
  }
  .next { margin-top: 24px; }
  .next-label {
    font-family: var(--mono); font-size: 0.7rem; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-low);
  }
  ol { margin: 10px 0 0; padding-left: 20px; color: var(--text-mid); }
  li { margin: 5px 0; }
  code {
    font-family: var(--mono); font-size: 0.86em;
    background: rgba(7, 12, 9, 0.6);
    border: 1px solid var(--line);
    border-radius: 5px; padding: 2px 6px;
    color: var(--text-hi);
  }
  footer {
    margin-top: 30px; padding-top: 18px;
    border-top: 1px solid var(--line);
    display: flex; flex-wrap: wrap; gap: 8px;
    justify-content: space-between;
    font-size: 0.82rem; color: var(--text-low);
  }
  footer a { color: var(--green-500); text-decoration: none; }
  footer a:hover { color: var(--green-400); text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
</head>
<body>
  <main class="card">
    <div class="status-row">
      <span class="status"><span class="dot"></span> Deployed</span>
      <span class="status" style="border-color: rgba(74, 222, 128, 0.2);">Fast Edge Runtime</span>
    </div>
    <h1><span class="prompt">&gt;_</span>Your app is live</h1>
    <p class="lead">This landing page is served directly by your app on SV Cloud with Postgres and R2 storage integration.</p>

    <div class="url">https://${SUBDOMAIN}.apps.sv-academy.org</div>

    <div class="endpoints">
      <div class="endpoints-title">Built-in API Endpoints</div>
      <div class="endpoint-item">
        <a href="/api/health">GET /api/health</a>
        <span class="endpoint-desc">Liveness healthcheck probe</span>
      </div>
      <div class="endpoint-item">
        <a href="/api/hello?name=${encodeURIComponent(OWNER)}">GET /api/hello</a>
        <span class="endpoint-desc">Example JSON API route</span>
      </div>
    </div>

    <div class="next">
      <div class="next-label">Next steps</div>
      <ol>
        <li>Open <code>design/README.md</code> and drop your design specs in.</li>
        <li>Edit <code>src/index.ts</code> to build your application routes and features.</li>
        <li>Run <code>npm run dev</code> to preview changes locally on <code>http://localhost:8787</code>.</li>
        <li>Run <code>npm test</code>, then commit and push to <code>main</code> to deploy.</li>
      </ol>
    </div>

    <footer>
      <span>Built by ${OWNER}</span>
      <span><a href="/api/health">/api/health</a> · SV Cloud</span>
    </footer>
  </main>
</body>
</html>`;

app.get("/", (c) => {
  createLogger(c.env).debug("served landing page");
  return c.html(page);
});

/** Liveness probe. Kept trivial and dependency-free so it always answers. */
app.get("/api/health", (c) => c.json({ status: "ok" }));

app.get("/api/hello", (c) => {
  const name = c.req.query("name")?.trim();
  if (name && name.length > 64) {
    return c.json({ error: "name must be 64 characters or fewer" }, 400);
  }
  return c.json({ message: `Hello, ${name || "world"}!` });
});

/**
 * Bangkok Vibe quiz (prototype). Stateless: the session is rebuilt from its
 * seed to score it, so nothing is stored. See design/reference/vibe-quiz-v3.md.
 */
const SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;

function parsePer(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return 3;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2 && n <= 6 ? n : null;
}

app.get("/api/vibe/quiz", (c) => {
  const seed = c.req.query("seed") ?? crypto.randomUUID().replaceAll("-", "");
  const per = parsePer(c.req.query("per"));
  const lang = c.req.query("lang");
  if (!SEED_RE.test(seed)) return c.json({ error: "seed must be 1-64 letters, digits, - or _" }, 400);
  if (per === null) return c.json({ error: "per must be an integer from 2 to 6" }, 400);
  if (lang !== undefined && lang !== "th" && lang !== "en") {
    return c.json({ error: "lang must be th or en" }, 400);
  }
  const questions = generateSession({ seed, perCategory: per }).map(toPublic);
  if (!lang) return c.json({ seed, per, questions });
  // Single-language view: flatten every { th, en } to one string.
  const flat = JSON.parse(JSON.stringify(questions), (_k, v) =>
    v && typeof v === "object" && "th" in v && "en" in v && Object.keys(v).length === 2 ? v[lang] : v,
  );
  return c.json({ seed, per, lang, questions: flat });
});

app.post("/api/vibe/score", async (c) => {
  const body = await c.req.json<{ seed?: unknown; per?: unknown; answers?: unknown }>().catch(() => null);
  if (!body || typeof body.seed !== "string" || !SEED_RE.test(body.seed)) {
    return c.json({ error: "seed is required (1-64 letters, digits, - or _)" }, 400);
  }
  const per = parsePer(body.per);
  if (per === null) return c.json({ error: "per must be an integer from 2 to 6" }, 400);
  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return c.json({ error: "answers must be an object of { questionId: number }" }, 400);
  }
  const answers: Answers = {};
  for (const [id, v] of Object.entries(body.answers as Record<string, unknown>)) {
    if (typeof v === "number") answers[id] = v;
  }
  const result = scoreSession(generateSession({ seed: body.seed, perCategory: per }), answers);
  return c.json(result);
});

/**
 * ScheduledTask webhook receiver. When an alarm fires in a StatefulObject,
 * it automatically dispatches an HTTP POST here, signed with HMAC-SHA256,
 * so your app can execute arbitrary background logic without needing a visitor.
 */
/**
 * Where a scheduled task lands when it fires. See `src/state.ts`.
 *
 * TO MAKE SOMETHING REPEAT, schedule the next occurrence from in here, as the
 * FIRST thing this handler does - there is no cron and no repeating-task
 * feature to reach for. A failed webhook is never retried, so a reschedule
 * placed after the work ends the chain permanently the first time the work
 * throws. Base the next time on `task.firedAt` rather than `Date.now()` or it
 * drifts, and stop a chain with `cancelTasks(name)`.
 */
app.post("/api/tasks/webhook", async (c) => {
  const isValid = await verifyTaskWebhook(c.req.raw, c.env.TASK_WEBHOOK_SECRET);
  if (!isValid) {
    return c.json({ error: "Invalid or missing task signature" }, 401);
  }

  const task = await c.req.json<{
    id: number;
    name: string;
    payload: unknown;
    firedAt: number;
  }>();

  createLogger(c.env).info("scheduled task executed", {
    id: task.id,
    name: task.name,
    firedAt: task.firedAt,
  });

  return c.json({ ok: true });
});

/**
 * Serves files from `design/assets/` (see `src/assets.ts`, generated by
 * `npm run assets`). Use `asset("name")` to build the URL rather than typing
 * "/assets/..." by hand.
 *
 * NOTE THE REDIRECT, AND COPY THIS PATTERN. This route does not send the file's
 * bytes itself - it points the browser at storage and gets out of the way.
 * Two reasons, and the second is the one people forget:
 *
 *   speed  bytes read through this Worker move at roughly 40 KB/s, so a 7 MB
 *          image takes about three minutes and the browser gives up first.
 *   cost   you are billed for the time your app spends running. Streaming a
 *          file through it bills you for the whole download; a redirect bills
 *          you for a few milliseconds, no matter how large the file is.
 *
 * Locally there is no storage service to sign a URL with, so the bytes are
 * served directly - which is fine, because it is your own machine.
 */
app.get("/assets/*", async (c) => {
  const key = `assets/${c.req.path.slice("/assets/".length)}`;

  if (c.env.FILES) {
    const url = await getObjectUrl(c.env, key);
    // Built by hand rather than with c.redirect() so the cache header can be
    // set. Short cache on the REDIRECT, not on the file: the URL it points at
    // expires, so a browser that cached this for a day would follow a dead
    // link. The file itself is cached by the storage response.
    return new Response(null, {
      status: 302,
      headers: { location: url, "cache-control": "private, max-age=60" },
    });
  }

  const result = await getObject(c.env, key);
  if (!result) return c.notFound();
  return new Response(result.body, {
    headers: {
      "content-type": result.metadata.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
      etag: result.metadata.httpEtag,
    },
  });
});

app.notFound((c) => {
  createLogger(c.env).debug("route not found", { path: c.req.path });
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  createLogger(c.env).error("unhandled error", { path: c.req.path, err });
  return c.json({ error: "Internal server error" }, 500);
});

// The default export IS the Worker. Keep it.
export default app;
