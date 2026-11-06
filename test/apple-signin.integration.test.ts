/**
 * Sign in with Apple (owner card S1): no scope (Apple shares no name or email), a signed
 * ES256 client secret, the refresh token kept sealed, and revoked with Apple at deletion.
 * Apple's endpoints are faked; the key pair is made here.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db } from "./helpers";
import app from "../src/index";
import { b64url, fromB64url, newId } from "../src/lib/crypto";
import { appleClientSecret, openToken } from "../src/services/apple";
import { appleTokens, oauthLinks } from "../src/schema";

const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const jwt = (claims: Record<string, unknown>) => `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
const { NO_EXTERNAL: _off, ...BASE } = ENV;
let APPLE_ENV: typeof BASE & Record<string, string>;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  publicKey = pair.publicKey;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\\n${btoa(String.fromCharCode(...der))}\\n-----END PRIVATE KEY-----`;
  APPLE_ENV = { ...BASE, APPLE_SERVICES_ID: "org.jurrgun.web", APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567", APPLE_PRIVATE_KEY: pem };
});
afterEach(() => vi.unstubAllGlobals());

const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} }, APPLE_ENV);
const claimsOf = (t: string) => JSON.parse(new TextDecoder().decode(fromB64url(t.split(".")[1]))) as Record<string, unknown>;

describe("Apple's client secret", () => {
  it("is an ES256 JWT from the team, for the Services ID, that the key's public half verifies", async () => {
    const s = await appleClientSecret(APPLE_ENV, 1_800_000_000_000);
    const [h, p, sig] = s.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(claimsOf(s)).toEqual({ iss: "TEAM123456", iat: 1_800_000_000, exp: 1_800_000_300, aud: "https://appleid.apple.com", sub: "org.jurrgun.web" });
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
  });
});

describe.skipIf(!HAS_DB)("Sign in with Apple", () => {
  it("shows the button only once Apple is set up", async () => {
    expect(await (await get("/login?lang=en")).text()).toContain('href="/auth/apple"');
    expect(await (await app.request("/login?lang=en", {}, ENV)).text()).not.toContain("/auth/apple");
  });

  it("asks Apple for nothing but the sign-in, keeps the token sealed, and revokes it on deletion", async () => {
    // A member adds Apple from Settings (the same callback as a first sign-in, with a session).
    const m = await createMember();
    const r = await get("/auth/apple", m.cookie);
    const to = new URL(r.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(to.searchParams.get("scope")).toBeNull(); // no name, no email
    expect(to.searchParams.get("response_mode")).toBe("query");
    const tx = r.headers.get("set-cookie")!.split(";")[0];

    const sub = `a-${newId()}`;
    const calls: { url: string; body: URLSearchParams }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
        if (String(url).endsWith("/auth/token")) {
          return new Response(JSON.stringify({ id_token: jwt({ iss: "https://appleid.apple.com", aud: "org.jurrgun.web", exp: Date.now() / 1000 + 600, nonce: to.searchParams.get("nonce"), sub }), refresh_token: "r.apple-refresh" }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
    const back = await get(`/auth/apple/callback?code=c&state=${to.searchParams.get("state")}`, `${tx}; ${m.cookie}`);
    expect(back.headers.get("location")).toBe("/settings?notice=saved");
    const tokenCall = calls.find((x) => x.url.endsWith("/auth/token"))!;
    expect(claimsOf(tokenCall.body.get("client_secret")!).sub).toBe("org.jurrgun.web");

    const [link] = await db().select().from(oauthLinks).where(eq(oauthLinks.subject, sub));
    expect(link.accountId).toBe(m.id);
    const [kept] = await db().select().from(appleTokens).where(eq(appleTokens.accountId, link.accountId));
    expect(kept.token).not.toContain("apple-refresh");
    expect(await openToken(APPLE_ENV, kept.token)).toBe("r.apple-refresh");

    const gone = await app.request("/settings/deactivate", { method: "POST", headers: { cookie: m.cookie, "content-type": "application/x-www-form-urlencoded" }, body: "confirm=1" }, APPLE_ENV);
    expect(gone.status).toBe(302);
    const revoke = calls.find((x) => x.url === "https://appleid.apple.com/auth/revoke")!;
    expect(revoke.body.get("token")).toBe("r.apple-refresh");
    expect(revoke.body.get("token_type_hint")).toBe("refresh_token");
    expect(await db().select().from(appleTokens).where(eq(appleTokens.accountId, link.accountId))).toEqual([]);
    // Signing in with Apple again starts a fresh account: the old link is gone (no rejoin matching).
    expect(await db().select().from(oauthLinks).where(eq(oauthLinks.subject, sub))).toEqual([]);
  });
});
