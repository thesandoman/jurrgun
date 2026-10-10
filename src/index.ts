import { Hono } from "hono";
import type { AppEnv } from "./lib/env";
import { loadUser, sameOrigin } from "./lib/session";
import { createLogger } from "./logger";
import { verifyTaskWebhook } from "./state";
import { getObject, getObjectUrl } from "./storage";
import { generateSession, scoreSession, toPublic, type Answers } from "./vibe/generator";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { oauthRoutes } from "./routes/oauth";
import { universityRoutes } from "./routes/universities";
import { eventRoutes } from "./routes/events";
import { inviteRoutes } from "./routes/invite";
import { learnRoutes } from "./routes/learn";
import { onboarding } from "./routes/onboarding";
import { peopleRoutes } from "./routes/people";
import { profileRoutes } from "./routes/profile";
import { publicRoutes } from "./routes/public";
import { pulseRoutes } from "./routes/pulse";
import { pwaRoutes } from "./routes/pwa";
import { quizRoutes } from "./routes/quiz";
import { settingsRoutes } from "./routes/settings";
import { setup } from "./routes/setup";
import { vendorRoutes } from "./routes/vendor";

const app = new Hono<AppEnv>();

// Every request: refuse cross-site form posts, then load the signed-in user
// (no database trip when there is no session cookie).
app.use("*", sameOrigin);
app.use("*", loadUser);

app.route("/api/setup", setup);
app.route("/", publicRoutes);
app.route("/", learnRoutes);
app.route("/", pwaRoutes);
app.route("/", vendorRoutes);
app.route("/", inviteRoutes);
app.route("/", quizRoutes);
app.route("/", authRoutes);
app.route("/", oauthRoutes);
app.route("/", universityRoutes);
app.route("/onboarding", onboarding);
app.route("/", eventRoutes);
app.route("/", peopleRoutes);
app.route("/", profileRoutes);
app.route("/", settingsRoutes);
app.route("/", pulseRoutes);
app.route("/admin", adminRoutes);

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
