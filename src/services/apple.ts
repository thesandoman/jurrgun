/**
 * Sign in with Apple (owner card S1, Nov 2026), alongside Google and LINE in
 * src/routes/oauth.tsx. Apple differs from them in three ways, all handled here:
 *
 * - Its client secret is not a fixed string but a short-lived JWT we sign
 *   (ES256) with the key the owner creates in his Apple Developer account.
 * - We ask for no scope at all, so Apple shares neither name nor email; we
 *   keep only its stable user id (`sub`), as for Google and LINE, and only to
 *   sign that person in. It is never used to spot someone who left and
 *   rejoins: the link is deleted with the account (F4 is held).
 * - Apple asks apps to revoke the person's token when they delete their
 *   account, so the refresh token from each sign-in is kept, sealed with
 *   AES-GCM under a key derived from APPLE_PRIVATE_KEY, and spent on
 *   https://appleid.apple.com/auth/revoke at deletion.
 *
 * Off, with no button, until all four settings are set: APPLE_SERVICES_ID,
 * APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8 file's text).
 */
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import { b64url, fromB64url, newId } from "../lib/crypto";
import type { Bindings } from "../lib/env";
import { createLogger } from "../logger";
import { appleTokens } from "../schema";

type Db = ReturnType<typeof getDb>;

export const APPLE_ISSUER = "https://appleid.apple.com";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const enc = new TextEncoder();

export function appleConfigured(env: Bindings): boolean {
  return !!(env.APPLE_SERVICES_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

/** The .p8 key's DER bytes. Settings may hold it with real or escaped newlines. */
function pemBytes(pem: string): Uint8Array {
  const b64 = pem.replace(/\\n/g, "\n").replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

/** The client secret Apple's token and revoke endpoints want: an ES256 JWT, good for 5 minutes. */
export async function appleClientSecret(env: Bindings, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(env.APPLE_PRIVATE_KEY!), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const part = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));
  const iat = Math.floor(now / 1000);
  const head = `${part({ alg: "ES256", kid: env.APPLE_KEY_ID })}.${part({ iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: APPLE_ISSUER, sub: env.APPLE_SERVICES_ID })}`;
  // WebCrypto's ECDSA signature is already r||s, the form JWS uses.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head)));
  return `${head}.${b64url(sig)}`;
}

async function sealKey(env: Bindings): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`apple-refresh-token|${env.APPLE_PRIVATE_KEY}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealToken(env: Bindings, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealKey(env), enc.encode(token)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function openToken(env: Bindings, sealed: string): Promise<string> {
  const bytes = fromB64url(sealed);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await sealKey(env), bytes.slice(12));
  return new TextDecoder().decode(pt);
}

/** Keeps (or replaces) the refresh token from this sign-in, for revoking at deletion. */
export async function keepAppleToken(env: Bindings, db: Db, accountId: string, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const sealed = await sealToken(env, refreshToken);
  await db.delete(appleTokens).where(eq(appleTokens.accountId, accountId));
  await db.insert(appleTokens).values({ id: newId(), accountId, token: sealed });
}

/**
 * Revokes these accounts' Apple tokens with Apple and deletes our copies. Best effort:
 * a failure is logged, and the rows still go, so deletion never stalls on Apple.
 */
export async function revokeAppleTokens(env: Bindings, db: Db, accountIds: string[]): Promise<number> {
  if (!accountIds.length) return 0;
  const rows = await db.select().from(appleTokens).where(inArray(appleTokens.accountId, accountIds)).limit(accountIds.length * 2);
  if (!rows.length) return 0;
  let revoked = 0;
  if (appleConfigured(env) && !env.NO_EXTERNAL) {
    const secret = await appleClientSecret(env);
    for (const r of rows) {
      try {
        const res = await fetch(REVOKE_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: env.APPLE_SERVICES_ID!, client_secret: secret, token: await openToken(env, r.token), token_type_hint: "refresh_token" }),
        });
        if (res.ok) revoked++;
        else createLogger(env).warn("apple.revoke_refused", { status: res.status });
      } catch (err) {
        createLogger(env).warn("apple.revoke_failed", { error: String(err) });
      }
    }
  }
  await db.delete(appleTokens).where(inArray(appleTokens.id, rows.map((r) => r.id)));
  return revoked;
}
