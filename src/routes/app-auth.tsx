/**
 * Sign-in for the phone app (Mobile App, Nov 2026). Google refuses sign-in
 * inside an embedded web view (disallowed_useragent) and LINE misbehaves there,
 * so the app runs the normal Google / LINE flow — the same routes, PKCE, the
 * openid scope and nothing more — in the phone's own browser (expo-web-browser
 * / AuthSession), and gets back a one-time code, never a session, by redirect.
 * This is the native-app pattern of RFC 8252:
 *
 *   0. web view: a same-origin fetch from one of our pages, injected by the app:
 *                fetch("/auth/app/begin", { method: "POST", headers: { "x-jurrgun-app": "begin" }, body: new URLSearchParams({ code_challenge }) })
 *                → a 10-minute HttpOnly cookie holding the challenge, which finish requires
 *   1. app:      opens /auth/<provider>?app=1&redirect_uri=<listed URI>&code_challenge=<S256>[&app_state=...]
 *   2. browser:  the usual consent screen and /auth/<provider>/callback (src/routes/oauth.tsx)
 *   3. browser:  redirected to <redirect_uri>?code=<one-time code>[&state=...], or ?error=cancelled|failed|busy
 *   4. web view: a same-origin fetch from a page of this site, injected by the app:
 *                fetch("/auth/app/finish", { method: "POST", headers: { "x-jurrgun-app": "finish" }, body: new URLSearchParams({ code, code_verifier }) })
 *                → the normal bkk_sid cookie in the web view, and {"next": "/onboarding"}
 *
 * The code is single-use, lives two minutes, and only works with the verifier
 * whose SHA-256 the app sent in step 1, so another app that grabs the redirect
 * can't use it. The session is only ever the web view's own HttpOnly cookie:
 * the app never holds a session token (Privacy & Security, Nov 2026). It shows
 * in Settings, signed-in devices, as a phone.
 *
 * Step 4 must carry this site's Origin, which only a page of this site can
 * send: a post from another site, with `Origin: null` from a sandboxed frame,
 * or with no Origin at all, is refused. It must also carry the header
 * `X-Jurrgun-App: finish` (Privacy & Security): a form can't set one, and a
 * cross-site fetch that does needs a CORS preflight this site never allows.
 * And it must come from the web view that ran step 0 (owner, Nov 2026): the
 * challenge cookie set there has to match the verifier, so a code minted on
 * someone's own phone can't be finished in anyone else's browser. Without that, anyone could start step 1 on
 * their own phone and post their fresh code from a web page, signing a
 * victim's browser into the poster's account, where everything the victim then
 * typed would be the poster's to read (login CSRF; QA & Release, Nov 2026).
 */
import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { b64url, randomToken, safeEqual, sha256 } from "../lib/crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { secureCookie } from "../lib/deployed";
import type { AppEnv, Bindings } from "../lib/env";
import { accountUsable, endSession, startSession } from "../lib/session";
import { accounts, appHandoffs } from "../schema";

/** The app's redirect URIs, exactly (Mobile App, Nov 2026: the Expo shell's jurrgun:// scheme). */
export const APP_REDIRECTS: readonly string[] = ["jurrgun://auth"];

const HANDOFF_MS = 2 * 60_000;

/** What the app sent in step 1, carried through the provider in the sign-in cookie. */
export type AppLeg = { redirect: string; challenge: string; state?: string };

export function appRedirectAllowed(uri: string, env: Bindings): boolean {
  const extra = (env.APP_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...APP_REDIRECTS, ...extra].includes(uri);
}

/** Step 1's app parameters, or an error to show. Null when this isn't the app. */
export function readAppLeg(c: Context<AppEnv>): { leg: AppLeg } | { error: string } | null {
  if (!c.req.query("app")) return null;
  const redirect = c.req.query("redirect_uri") ?? "";
  const challenge = c.req.query("code_challenge") ?? "";
  const state = c.req.query("app_state");
  if (!appRedirectAllowed(redirect, c.env)) return { error: "redirect_uri is not on the list" };
  if ((c.req.query("code_challenge_method") ?? "S256") !== "S256" || !/^[\w-]{43}$/.test(challenge)) return { error: "code_challenge must be S256" };
  if (state !== undefined && !/^[\w.~-]{1,128}$/.test(state)) return { error: "app_state is too long or has odd characters" };
  return { leg: { redirect, challenge, ...(state ? { state } : {}) } };
}

/** Back to the app with `params` on its redirect URI. */
export function backToApp(c: Context<AppEnv>, leg: AppLeg, params: Record<string, string>) {
  const url = new URL(leg.redirect);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (leg.state) url.searchParams.set("state", leg.state);
  return c.redirect(url.toString());
}

/** Step 3: a one-time code for this account, sent to the app instead of a cookie. */
export async function handOff(c: Context<AppEnv>, leg: AppLeg, accountId: string) {
  const code = randomToken(32);
  const now = Date.now();
  await getDb(c.env)
    .insert(appHandoffs)
    .values({ id: await sha256(code), accountId, challenge: leg.challenge, expiresAt: new Date(now + HANDOFF_MS) });
  return backToApp(c, leg, { code });
}

export const appAuthRoutes = new Hono<AppEnv>();

/** Ties a sign-in to the web view that started it (owner, Nov 2026): holds the S256 challenge. */
export const BIND_COOKIE = "bkk_app_bind";
const BIND_PATH = "/auth/app";

/** Only a page of this site, through the app, can call these: this site's Origin and the app's header. */
function fromOurPage(c: Context<AppEnv>, step: "begin" | "finish"): boolean {
  return c.req.header("origin") === new URL(c.req.url).origin && c.req.header("x-jurrgun-app") === step;
}

/**
 * Step 0, before the app opens the phone's browser: the web view records the
 * challenge in a 10-minute HttpOnly cookie. Finish needs it, so a code can only
 * be finished in the web view that started that sign-in, never in a stranger's browser.
 */
appAuthRoutes.post(`${BIND_PATH}/begin`, async (c) => {
  if (!fromOurPage(c, "begin")) return c.text("Cross-site request refused", 403);
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const challenge = typeof form.code_challenge === "string" ? form.code_challenge : "";
  if (!/^[\w-]{43}$/.test(challenge)) return c.json({ error: "code_challenge must be S256" }, 400);
  setCookie(c, BIND_COOKIE, challenge, { httpOnly: true, secure: secureCookie(c), sameSite: "Strict", path: BIND_PATH, maxAge: 600 });
  return c.json({ ok: true });
});

/** Step 4: swap the code and verifier for the web view's session cookie. */
appAuthRoutes.post(`${BIND_PATH}/finish`, async (c) => {
  if (!fromOurPage(c, "finish")) return c.text("Cross-site request refused", 403);
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const code = typeof form.code === "string" ? form.code : "";
  const verifier = typeof form.code_verifier === "string" ? form.code_verifier : "";
  const refused = () => c.json({ error: "That sign-in has been used or has expired. Please sign in again." }, 400);
  // RFC 7636: 43 to 128 characters.
  if (!/^[\w-]{43}$/.test(code) || !/^[\w.~-]{43,128}$/.test(verifier)) return refused();
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  // Not the web view that began this sign-in: refused before the code is touched.
  const bound = getCookie(c, BIND_COOKIE);
  if (!bound || !safeEqual(bound, challenge)) return c.json({ error: "Please start signing in again from the app." }, 403);
  deleteCookie(c, BIND_COOKIE, { path: BIND_PATH });
  const db = getDb(c.env);
  // Delete first, so a code works once even if two requests race.
  const [row] = await db
    .delete(appHandoffs)
    .where(eq(appHandoffs.id, await sha256(code)))
    .returning({ accountId: appHandoffs.accountId, challenge: appHandoffs.challenge, expiresAt: appHandoffs.expiresAt });
  if (!row || row.expiresAt.getTime() < Date.now()) return refused();
  if (challenge !== row.challenge) return refused();
  const [acct] = await db.select({ status: accounts.status, suspendedUntil: accounts.suspendedUntil }).from(accounts).where(eq(accounts.id, row.accountId)).limit(1);
  if (!acct || !accountUsable(acct)) return refused();
  // A web session already in this web view gives way to the one just signed in.
  if (c.var.user) await endSession(c);
  await startSession(c, row.accountId, "phone");
  return c.json({ next: "/onboarding" });
});
