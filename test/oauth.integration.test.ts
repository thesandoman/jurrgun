/**
 * Sign in with Google / LINE: claim checks (pure) and the full redirect,
 * callback and account-creation flow with the provider's token endpoint faked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db } from "./helpers";
import app from "../src/index";
import { checkIdToken } from "../src/routes/oauth";
import { b64url } from "../src/lib/crypto";
import { accounts, oauthLinks } from "../src/schema";
import { newId } from "../src/lib/crypto";

const OAUTH_ENV = { ...ENV, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", LINE_CHANNEL_ID: "lid", LINE_CHANNEL_SECRET: "lsecret" };
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const jwt = (claims: Record<string, unknown>) => `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;

describe("checkIdToken", () => {
  const expect_ = { issuers: ["https://accounts.google.com"], audience: "gid", nonce: "n1", now: 1_000_000 };
  const good = { iss: "https://accounts.google.com", aud: "gid", exp: 2_000, nonce: "n1", sub: "u1" };
  it("returns the subject only when issuer, audience, expiry and nonce all match", () => {
    expect(checkIdToken(good, expect_)).toBe("u1");
    expect(checkIdToken({ ...good, aud: ["x", "gid"] }, expect_)).toBe("u1");
    expect(checkIdToken({ ...good, iss: "https://evil.example" }, expect_)).toBeNull();
    expect(checkIdToken({ ...good, aud: "other" }, expect_)).toBeNull();
    expect(checkIdToken({ ...good, exp: 999 }, expect_)).toBeNull();
    expect(checkIdToken({ ...good, nonce: "n2" }, expect_)).toBeNull();
    expect(checkIdToken({ ...good, sub: "" }, expect_)).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("oauth sign-in", () => {
  afterEach(() => vi.unstubAllGlobals());

  const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} }, OAUTH_ENV);

  /** Start the flow; returns the transaction cookie and the state/nonce sent to the provider. */
  async function start(p: "google" | "line") {
    const r = await get(`/auth/${p}?next=/events`);
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get("location")!);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    return { to, cookie, state: to.searchParams.get("state")!, nonce: to.searchParams.get("nonce")! };
  }

  function fakeToken(claims: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: jwt(claims) }), { status: 200 })));
  }

  it("hides the buttons and the routes when no provider is configured", async () => {
    expect((await app.request("/auth/google", {}, ENV)).status).toBe(404);
    const login = await (await app.request("/login", {}, ENV)).text();
    expect(login).not.toContain("/auth/google");
    const withKeys = await (await app.request("/login", {}, OAUTH_ENV)).text();
    expect(withKeys).toContain("/auth/google");
    expect(withKeys).toContain("/auth/line");
  });

  it("sends the user to the provider with PKCE and only the openid scope", async () => {
    const { to } = await start("line");
    expect(to.origin).toBe("https://access.line.me");
    expect(to.searchParams.get("scope")).toBe("openid");
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
    expect(to.searchParams.get("client_id")).toBe("lid");
  });

  it("refuses a callback whose state doesn't match", async () => {
    const { cookie } = await start("google");
    const r = await get(`/auth/google/callback?code=c&state=wrong`, cookie);
    expect(r.status).toBe(400);
  });

  it("creates an account on first sign-in and signs the same person back in later", async () => {
    const sub = `g-${newId()}`;
    let s = await start("google");
    fakeToken({ iss: "https://accounts.google.com", aud: "gid", exp: Date.now() / 1000 + 600, nonce: s.nonce, sub });
    let r = await get(`/auth/google/callback?code=c&state=${s.state}`, s.cookie);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/onboarding");
    expect(r.headers.get("set-cookie")).toContain("bkk_sid=");
    const [link] = await db().select().from(oauthLinks).where(and(eq(oauthLinks.provider, "google"), eq(oauthLinks.subject, sub)));
    expect(link).toBeTruthy();
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, link.accountId));
    expect(acct.username).toMatch(/^google_[a-z0-9]+$/);

    s = await start("google");
    fakeToken({ iss: "https://accounts.google.com", aud: "gid", exp: Date.now() / 1000 + 600, nonce: s.nonce, sub });
    r = await get(`/auth/google/callback?code=c&state=${s.state}`, s.cookie);
    expect(r.headers.get("location")).toBe("/events");
    const links = await db().select().from(oauthLinks).where(eq(oauthLinks.subject, sub));
    expect(links).toHaveLength(1);
  });

  it("links a provider to the account that is already signed in", async () => {
    const m = await createMember();
    const sub = `l-${newId()}`;
    const s = await start("line");
    fakeToken({ iss: "https://access.line.me", aud: "lid", exp: Date.now() / 1000 + 600, nonce: s.nonce, sub });
    const r = await get(`/auth/line/callback?code=c&state=${s.state}`, `${s.cookie}; ${m.cookie}`);
    expect(r.headers.get("location")).toBe("/settings?notice=saved");
    const [link] = await db().select().from(oauthLinks).where(eq(oauthLinks.subject, sub));
    expect(link.accountId).toBe(m.id);
  });

  it("rejects a token meant for someone else", async () => {
    const s = await start("google");
    fakeToken({ iss: "https://accounts.google.com", aud: "another-app", exp: Date.now() / 1000 + 600, nonce: s.nonce, sub: "x" });
    const r = await get(`/auth/google/callback?code=c&state=${s.state}`, s.cookie);
    expect(r.status).toBe(400);
  });
});
