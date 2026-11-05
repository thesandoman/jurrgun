/**
 * Phone-app sign-in hand-off (src/routes/app-auth.tsx): the Google / LINE flow in
 * the phone's browser comes back to the app with a one-time code, which the app's
 * web view posts (same-origin) with its PKCE verifier for the normal session cookie. Provider
 * token endpoint faked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db } from "./helpers";
import app from "../src/index";
import { appRedirectAllowed } from "../src/routes/app-auth";
import { b64url, newId, randomToken, sha256 } from "../src/lib/crypto";
import { appHandoffs, oauthLinks, sessions } from "../src/schema";

const REDIRECT = "jurrgun://auth";
const APP_ENV = { ...ENV, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", APP_REDIRECT_URIS: `${REDIRECT}, exp://127.0.0.1:8081/--/auth` };
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const jwt = (claims: Record<string, unknown>) => `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
const s256 = async (v: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))));

const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} }, APP_ENV);
const SITE = "http://localhost";
/** Step 4, as the app's web view sends it: a same-origin fetch from one of our pages. */
const swap = (body: Record<string, string>, origin = SITE, header = true, cookie?: string) =>
  app.request(`${SITE}/auth/app/finish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}), ...(header ? { "x-jurrgun-app": "finish" } : {}), ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(body).toString(),
  }, APP_ENV);
/** Step 0 in the app's web view: returns the binding cookie. */
const begin = async (challenge: string, origin = SITE) => {
  const r = await app.request(`${SITE}/auth/app/begin`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin, "x-jurrgun-app": "begin" }, body: new URLSearchParams({ code_challenge: challenge }).toString() }, APP_ENV);
  return { r, cookie: /bkk_app_bind=[^;]+/.exec(r.headers.get("set-cookie") ?? "")?.[0] };
};
const sid = (r: Response) => /bkk_sid=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];

describe("which redirect URIs the hand-off may use", () => {
  it("only exact entries from the list", () => {
    expect(appRedirectAllowed(REDIRECT, APP_ENV)).toBe(true);
    expect(appRedirectAllowed("exp://127.0.0.1:8081/--/auth", APP_ENV)).toBe(true);
    expect(appRedirectAllowed(`${REDIRECT}/x`, APP_ENV)).toBe(false);
    expect(appRedirectAllowed("https://evil.example/auth", APP_ENV)).toBe(false);
    // The app's own scheme is listed in the code; anything else needs the setting.
    expect(appRedirectAllowed(REDIRECT, ENV)).toBe(true);
    expect(appRedirectAllowed("exp://127.0.0.1:8081/--/auth", ENV)).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("phone-app sign-in", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Steps 1–3: returns the verifier and where the browser was sent back to. */
  async function signIn(sub: string, opts: { cookie?: string; cancel?: boolean } = {}) {
    const verifier = randomToken(48);
    const { cookie: bind } = await begin(await s256(verifier));
    const r = await get(`/auth/google?app=1&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${await s256(verifier)}&code_challenge_method=S256&app_state=s1`);
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get("location")!);
    const tx = r.headers.get("set-cookie")!.split(";")[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: jwt({ iss: "https://accounts.google.com", aud: "gid", exp: Date.now() / 1000 + 600, nonce: to.searchParams.get("nonce"), sub }) }), { status: 200 })));
    const q = opts.cancel ? "error=access_denied" : `code=c&state=${to.searchParams.get("state")}`;
    const back = await get(`/auth/google/callback?${q}`, opts.cookie ? `${tx}; ${opts.cookie}` : tx);
    return { verifier, back, bind };
  }

  it("refuses an unlisted redirect URI or a missing challenge", async () => {
    expect((await get(`/auth/google?app=1&redirect_uri=${encodeURIComponent("https://evil.example/")}&code_challenge=${"a".repeat(43)}`)).status).toBe(400);
    expect((await get(`/auth/google?app=1&redirect_uri=${encodeURIComponent(REDIRECT)}`)).status).toBe(400);
  });

  it("sends the app a one-time code, never a cookie, and swaps it once for the web view's session cookie", async () => {
    const { verifier, back, bind } = await signIn(`g-${newId()}`);
    expect(back.status).toBe(302);
    expect(back.headers.get("set-cookie") ?? "").not.toContain("bkk_sid=");
    const to = new URL(back.headers.get("location")!);
    expect(`${to.protocol}//${to.host}`).toBe(REDIRECT);
    expect(to.searchParams.get("state")).toBe("s1");
    const code = to.searchParams.get("code")!;
    const [row] = await db().select().from(appHandoffs).where(eq(appHandoffs.id, await sha256(code)));
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(120_000);

    const r = await swap({ code, code_verifier: verifier }, SITE, true, bind);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ next: "/onboarding" });
    expect(r.headers.get("set-cookie")).toMatch(/bkk_sid=[^;]+;.*HttpOnly/i);
    const token = sid(r)!;
    const [s] = await db().select().from(sessions).where(eq(sessions.id, await sha256(token)));
    expect(s.device).toBe("phone");
    // A new account isn't onboarded yet: with the cookie, onboarding goes on to its first step instead of sign-in.
    const page = await get("/onboarding", `bkk_sid=${token}`);
    expect(page.headers.get("location")).toBe("/onboarding/welcome");
    // No token is ever handed to the app itself: a Bearer header signs nobody in.
    expect((await app.request("/onboarding", { headers: { authorization: `Bearer ${token}` } }, APP_ENV)).headers.get("location")).toMatch(/^\/login/);

    expect((await swap({ code, code_verifier: verifier }, SITE, true, bind)).status).toBe(400);
  });

  it("refuses a code posted from another site or a sandboxed frame (login CSRF), and keeps it unused", async () => {
    const { verifier, back, bind } = await signIn(`g-${newId()}`);
    const code = new URL(back.headers.get("location")!).searchParams.get("code")!;
    for (const origin of ["null", "https://evil.example", ""]) {
      const r = await swap({ code, code_verifier: verifier }, origin, true, bind);
      expect(r.status).toBe(403);
      expect(r.headers.get("set-cookie") ?? "").not.toContain("bkk_sid=");
    }
    // A same-site form post can't set the header either.
    expect((await swap({ code, code_verifier: verifier }, SITE, false, bind)).status).toBe(403);
    // A cross-site fetch with the header needs a preflight, which gets no CORS allowance.
    const pre = await app.request(`${SITE}/auth/app/finish`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "x-jurrgun-app" } }, APP_ENV);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    expect(pre.headers.get("access-control-allow-headers")).toBeNull();
    expect((await swap({ code, code_verifier: verifier }, SITE, true, bind)).status).toBe(200);
  });

  it("won't finish with the wrong verifier", async () => {
    const { verifier, back, bind } = await signIn(`g-${newId()}`);
    const code = new URL(back.headers.get("location")!).searchParams.get("code")!;
    expect((await swap({ code, code_verifier: randomToken(48) }, SITE, true, bind)).status).toBe(403);
    expect((await swap({ code, code_verifier: verifier }, SITE, true, bind)).status).toBe(200);
  });

  it("only finishes in the web view that began the sign-in (login CSRF from someone's own phone)", async () => {
    // The attacker runs steps 0 to 3 on their own phone, then gets the code and verifier into a victim's browser.
    const { verifier, back, bind } = await signIn(`g-${newId()}`);
    const code = new URL(back.headers.get("location")!).searchParams.get("code")!;
    // The victim's browser has no binding cookie, or one from its own, different sign-in.
    const { cookie: victims } = await begin(await s256(randomToken(48)));
    for (const cookie of [undefined, victims]) {
      const r = await swap({ code, code_verifier: verifier }, SITE, true, cookie);
      expect(r.status).toBe(403);
      expect(r.headers.get("set-cookie") ?? "").not.toContain("bkk_sid=");
    }
    // Nor can another site plant the binding cookie.
    for (const origin of ["https://evil.example", "null"]) expect((await begin(await s256(verifier), origin)).r.status).toBe(403);
    expect((await swap({ code, code_verifier: verifier }, SITE, true, bind)).status).toBe(200);
  });

  it("sets the binding cookie HttpOnly, SameSite=Strict, only for the sign-in steps, for 10 minutes", async () => {
    const { r } = await begin(await s256(randomToken(48)));
    const set = r.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(set).toMatch(/Path=\/auth\/app/);
    expect(set).toMatch(/Max-Age=600/);
  });

  it("won't swap an expired code", async () => {
    const { verifier, back, bind } = await signIn(`g-${newId()}`);
    const code = new URL(back.headers.get("location")!).searchParams.get("code")!;
    await db().update(appHandoffs).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(appHandoffs.id, await sha256(code)));
    expect((await swap({ code, code_verifier: verifier }, SITE, true, bind)).status).toBe(400);
  });

  it("signs in as the provider's account, never linking to a web session in the same browser", async () => {
    const m = await createMember();
    const sub = `g-${newId()}`;
    const { back } = await signIn(sub, { cookie: m.cookie });
    expect(new URL(back.headers.get("location")!).searchParams.get("code")).toBeTruthy();
    const [link] = await db().select().from(oauthLinks).where(eq(oauthLinks.subject, sub));
    expect(link.accountId).not.toBe(m.id);
  });

  it("tells the app when the person cancels", async () => {
    const { back } = await signIn(`g-${newId()}`, { cancel: true });
    const to = new URL(back.headers.get("location")!);
    expect(to.searchParams.get("error")).toBe("cancelled");
    expect(to.searchParams.get("state")).toBe("s1");
  });
});
