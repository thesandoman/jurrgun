import { Hono } from "hono";
import { CLOCK_TASK, ensureClock, onClockTask, watchClock } from "./services/clock";
import type { AppEnv } from "./lib/env";
import { loadUser, sameOrigin } from "./lib/session";
import { CSP_REPORT_PATH, cspReportSummary, securityHeaders } from "./lib/security-headers";
import { captureSource } from "./lib/source";
import { createLogger } from "./logger";
import { verifyTaskWebhook } from "./state";
import { getObject, getObjectUrl } from "./storage";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { oauthRoutes } from "./routes/oauth";
import { emailCodeRoutes } from "./routes/email-code";
import { universityRoutes } from "./routes/universities";
import { hostRoutes } from "./routes/host";
import { eventRoutes } from "./routes/events";
import { inviteRoutes } from "./routes/invite";
import { learnRoutes } from "./routes/learn";
import { onboarding } from "./routes/onboarding";
import { peopleRoutes } from "./routes/people";
import { profileRoutes } from "./routes/profile";
import { publicRoutes } from "./routes/public";
import { policyRoutes } from "./routes/policies";
import { consentRoutes } from "./routes/consents";
import { newcomerRoutes } from "./routes/newcomers";
import { pulseRoutes } from "./routes/pulse";
import { pwaRoutes } from "./routes/pwa";
import { quizRoutes } from "./routes/quiz";
import { buddyRoutes } from "./routes/buddy";
import { pinkyRoutes } from "./routes/pinky";
import { safetyRoutes } from "./routes/safety";
import { guideRoutes } from "./routes/guide";
import { circleLeadRoutes } from "./routes/circle-lead";
import { tableRoutes } from "./routes/tables";
import { chatRoutes } from "./routes/chat";
import { planRoutes } from "./routes/plan";
import { hostInsightRoutes } from "./routes/host-insights";
import { settingsRoutes } from "./routes/settings";
import { setup } from "./routes/setup";
import { errorPage, notFoundPage, plainErrorHtml, wantsHtml } from "./routes/errors";
import { vendorRoutes } from "./routes/vendor";
import { partnerApi } from "./routes/partner-api";
import { partnerRoutes } from "./routes/partners";
import { calendarRoutes } from "./routes/calendar";

const app = new Hono<AppEnv>();

// Every response: security headers and the CSP nonce (src/lib/security-headers.ts).
app.use("*", securityHeaders);
// Browsers post CSP violation reports here. Logged as directive + blocked origin only.
app.post(CSP_REPORT_PATH, async (c) => {
  const raw = (await c.req.text()).slice(0, 8_192);
  const summary = cspReportSummary(raw);
  if (summary) createLogger(c.env).warn("csp violation", summary);
  return c.body(null, 204);
});
// Every request: refuse cross-site form posts, then load the signed-in user
// (no database trip when there is no session cookie).
app.use("*", sameOrigin);
// The hourly clock's watchdog, at most once per isolate every 10 minutes, after the response (src/services/clock.ts).
app.use("*", async (c, next) => {
  let waitUntil: ((p: Promise<unknown>) => void) | null = null;
  try {
    const ctx = c.executionCtx;
    waitUntil = (p) => ctx.waitUntil(p);
  } catch {
    // No execution context (tests, local scripts): nothing to watch from here.
  }
  watchClock(c.env, waitUntil);
  await next();
});
app.use("*", loadUser);
// Public landings: remember a ?src= / utm placement for 30 days (src/lib/source.ts).
app.use("*", captureSource);

app.route("/api/setup", setup);
app.route("/api/partner", partnerApi);
app.route("/", publicRoutes);
app.route("/", policyRoutes);
app.route("/", newcomerRoutes);
app.route("/", learnRoutes);
app.route("/", pwaRoutes);
app.route("/", vendorRoutes);
app.route("/", inviteRoutes);
app.route("/", quizRoutes);
app.route("/", buddyRoutes);
app.route("/", pinkyRoutes);
app.route("/", safetyRoutes);
app.route("/", guideRoutes);
app.route("/", circleLeadRoutes);
app.route("/", tableRoutes);
app.route("/", chatRoutes);
app.route("/", planRoutes);
app.route("/", hostInsightRoutes);
app.route("/", partnerRoutes);
app.route("/", calendarRoutes);
app.route("/", authRoutes);
app.route("/", oauthRoutes);
app.route("/", emailCodeRoutes);
app.route("/", universityRoutes);
app.route("/", hostRoutes);
app.route("/onboarding", onboarding);
app.route("/", eventRoutes);
app.route("/", peopleRoutes);
app.route("/", profileRoutes);
app.route("/", settingsRoutes);
app.route("/", consentRoutes);
app.route("/", pulseRoutes);
app.route("/admin", adminRoutes);

/** Liveness probe. Kept trivial and dependency-free so it always answers. */
// Health: also the clock's watchdog (src/services/clock.ts ensureClock). Deployed, it reports the
// hourly clock and re-arms it if a tick was missed, so an uptime check catches a dead clock.
app.get("/api/health", async (c) => {
  if (!c.env?.TASK_WEBHOOK_SECRET) return c.json({ status: "ok" });
  const clock = await ensureClock(c.env);
  return c.json({
    status: "ok",
    clock: clock.state,
    ...(clock.lastTick ? { clockLastTick: new Date(clock.lastTick).toISOString() } : {}),
  });
});

app.get("/api/hello", (c) => {
  const name = c.req.query("name")?.trim();
  if (name && name.length > 64) {
    return c.json({ error: "name must be 64 characters or fewer" }, 400);
  }
  return c.json({ message: `Hello, ${name || "world"}!` });
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

  // The hourly clock: reminders, the People I Met window, daily retention (src/services/clock.ts).
  if (task.name === CLOCK_TASK) {
    const run = await onClockTask(c.env, task.firedAt);
    if (run) createLogger(c.env).info("clock ran", run);
  }

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
  if (wantsHtml(c)) return notFoundPage(c);
  return c.json({ error: "Not found" }, 404);
});

app.onError((err, c) => {
  createLogger(c.env).error("unhandled error", { path: c.req.path, err });
  if (wantsHtml(c)) {
    try {
      return errorPage(c);
    } catch {
      return plainErrorHtml(c);
    }
  }
  return c.json({ error: "Internal server error" }, 500);
});

// The default export IS the Worker. Keep it.
export default app;
