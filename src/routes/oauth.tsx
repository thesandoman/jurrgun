/**
 * Sign in with Google or LINE (OpenID Connect, authorization code + PKCE).
 *
 *   GET /auth/:provider            → the provider's consent screen
 *   GET /auth/:provider/callback   ← back from it: sign in, or create an account
 *
 * Only the `openid` scope is asked for, so all we learn is the provider's
 * stable user id (`sub`). No email, name or photo is requested or stored.
 *
 * A provider shows up only when both of its secrets are set:
 *   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, LINE_CHANNEL_ID + LINE_CHANNEL_SECRET.
 *
 * The ID token comes straight from the provider's token endpoint over TLS,
 * authenticated with our client secret, so its claims are checked (issuer,
 * audience, expiry, nonce) without fetching signing keys (OIDC Core 3.1.3.7).
 */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { b64url, fromB64url, hashPassword, newId, randomToken } from "../lib/crypto";
import type { AppEnv, Bindings } from "../lib/env";
import { createLogger } from "../logger";
import { accountUsable, startSession } from "../lib/session";
import { accounts, loginAttempts, oauthLinks } from "../schema";
import { Notice, page, safeNext, view } from "../ui/kit";
import { ipKey, SIGNUP_PREFIX, signupThrottled, tooMany } from "./auth";

export type Provider = "google" | "line";

type ProviderConfig = {
  name: string;
  authorize: string;
  token: string;
  issuers: string[];
  creds: (env: Bindings) => { id: string; secret: string } | null;
};

const PROVIDERS: Record<Provider, ProviderConfig> = {
  google: {
    name: "Google",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    creds: (env) => (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } : null),
  },
  line: {
    name: "LINE",
    authorize: "https://access.line.me/oauth2/v2.1/authorize",
    token: "https://api.line.me/oauth2/v2.1/token",
    issuers: ["https://access.line.me"],
    creds: (env) => (env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET ? { id: env.LINE_CHANNEL_ID, secret: env.LINE_CHANNEL_SECRET } : null),
  },
};

const isProvider = (p: string): p is Provider => p === "google" || p === "line";

/** Providers whose secrets are set, in display order. */
export function enabledProviders(env: Bindings): Provider[] {
  return (["line", "google"] as const).filter((p) => PROVIDERS[p].creds(env));
}

/** Pure: does this ID token payload belong to this sign-in? */
export function checkIdToken(
  claims: Record<string, unknown>,
  expect: { issuers: string[]; audience: string; nonce: string; now: number },
): string | null {
  const aud = claims.aud;
  const audOk = aud === expect.audience || (Array.isArray(aud) && aud.includes(expect.audience));
  if (typeof claims.iss !== "string" || !expect.issuers.includes(claims.iss)) return null;
  if (!audOk) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 < expect.now) return null;
  if (claims.nonce !== expect.nonce) return null;
  return typeof claims.sub === "string" && claims.sub ? claims.sub : null;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(part))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const TX_COOKIE = "bkk_oauth";
type Tx = { p: Provider; state: string; verifier: string; nonce: string; next: string };

const redirectUri = (c: Context<AppEnv>, p: Provider) => `${new URL(c.req.url).origin}/auth/${p}/callback`;

export const oauthRoutes = new Hono<AppEnv>();

oauthRoutes.get("/auth/:provider", async (c) => {
  const p = c.req.param("provider");
  if (!isProvider(p)) return c.notFound();
  const creds = PROVIDERS[p].creds(c.env);
  if (!creds) return c.notFound();
  const tx: Tx = { p, state: randomToken(16), verifier: randomToken(32), nonce: randomToken(16), next: safeNext(c.req.query("next"), "") };
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tx.verifier))));
  setCookie(c, TX_COOKIE, b64url(new TextEncoder().encode(JSON.stringify(tx))), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/auth",
    maxAge: 600,
  });
  const url = new URL(PROVIDERS[p].authorize);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: creds.id,
    redirect_uri: redirectUri(c, p),
    scope: "openid",
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(p === "google" ? { prompt: "select_account" } : {}),
  }).toString();
  return c.redirect(url.toString());
});

oauthRoutes.get("/auth/:provider/callback", async (c) => {
  const { t, lang } = view(c);
  const p = c.req.param("provider");
  if (!isProvider(p)) return c.notFound();
  const creds = PROVIDERS[p].creds(c.env);
  if (!creds) return c.notFound();
  const name = PROVIDERS[p].name;
  const fail = (msg: string) =>
    page(
      c,
      { title: t("เข้าสู่ระบบ", "Sign in"), status: 400 },
      <>
        <h1>{t(`เข้าสู่ระบบด้วย ${name} ไม่สำเร็จ`, `Couldn't sign in with ${name}`)}</h1>
        <Notice kind="error">{msg}</Notice>
        <p>
          <a href="/login">{t("ลองอีกครั้ง", "Try again")}</a>
        </p>
      </>,
    );

  let tx: Tx | null = null;
  try {
    tx = JSON.parse(new TextDecoder().decode(fromB64url(getCookie(c, TX_COOKIE) ?? ""))) as Tx;
  } catch {
    tx = null;
  }
  deleteCookie(c, TX_COOKIE, { path: "/auth" });
  // Cancelled on the provider's screen.
  if (c.req.query("error")) return c.redirect("/login");
  const code = c.req.query("code");
  if (!tx || tx.p !== p || !code || c.req.query("state") !== tx.state) {
    return fail(t("หมดเวลาหรือมีบางอย่างไม่ตรงกัน ลองใหม่อีกครั้ง", "That took too long or didn't match. Please try again."));
  }

  let sub: string | null = null;
  try {
    const res = await fetch(PROVIDERS[p].token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(c, p),
        client_id: creds.id,
        client_secret: creds.secret,
        code_verifier: tx.verifier,
      }),
    });
    const body = (await res.json()) as { id_token?: string };
    const claims = res.ok && body.id_token ? decodeJwtPayload(body.id_token) : null;
    sub = claims ? checkIdToken(claims, { issuers: PROVIDERS[p].issuers, audience: creds.id, nonce: tx.nonce, now: Date.now() }) : null;
    if (!sub) createLogger(c.env).warn("oauth.token_rejected", { provider: p, status: res.status });
  } catch (e) {
    createLogger(c.env).error("oauth.token_failed", { provider: p, error: String(e) });
  }
  if (!sub) return fail(t(`${name} ไม่ยืนยันการเข้าสู่ระบบ ลองใหม่อีกครั้ง`, `${name} didn't confirm the sign-in. Please try again.`));

  const db = getDb(c.env);
  const [link] = await db
    .select({ accountId: oauthLinks.accountId })
    .from(oauthLinks)
    .where(and(eq(oauthLinks.provider, p), eq(oauthLinks.subject, sub)))
    .limit(1);
  const current = c.var.user;

  if (link) {
    if (current && current.account.id !== link.accountId) {
      return fail(t(`บัญชี ${name} นี้เชื่อมกับบัญชี Jurrgun อื่นอยู่แล้ว`, `This ${name} account is already linked to a different Jurrgun account.`));
    }
    const [acct] = await db.select().from(accounts).where(eq(accounts.id, link.accountId)).limit(1);
    if (!acct || !accountUsable(acct)) return fail(t("บัญชีนี้ใช้งานไม่ได้ในขณะนี้", "This account can't be used right now."));
    if (!current) await startSession(c, acct.id);
    return c.redirect(tx.next || "/onboarding");
  }

  // Signed in already: link this provider to the current account.
  if (current) {
    await db.insert(oauthLinks).values({ id: newId(), provider: p, subject: sub, accountId: current.account.id });
    return c.redirect("/settings?notice=saved");
  }

  // New here: a normal account with a generated username and an unusable password.
  const now = new Date();
  const ip = await ipKey(c);
  if (await signupThrottled(c, ip, now)) return tooMany(c, "signup");
  const id = newId();
  const { hash, salt } = await hashPassword(randomToken(32));
  const username = `${p}_${randomToken(9).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || id.slice(0, 10)}`;
  await db.insert(accounts).values({ id, username, passwordHash: hash, passwordSalt: salt, researchId: newId() });
  await db.insert(oauthLinks).values({ id: newId(), provider: p, subject: sub, accountId: id });
  await db.insert(loginAttempts).values({ id: newId(), username: `${SIGNUP_PREFIX}${id}`, ipHash: ip.ipHash, createdAt: now });
  createLogger(c.env).info("oauth.account_created", { provider: p, lang });
  await startSession(c, id);
  return c.redirect("/onboarding");
});

/** "Continue with LINE / Google" buttons, or nothing when neither is set up. */
export function SocialSignIn(props: { t: (th: string, en: string) => string; providers: Provider[]; next?: string }) {
  if (!props.providers.length) return null;
  const q = props.next ? `?next=${encodeURIComponent(props.next)}` : "";
  return (
    <div class="social">
      {props.providers.map((p) => (
        <a href={`/auth/${p}${q}`} class={`btn social-btn social-${p}`}>
          <span class="social-mark" aria-hidden="true">
            {p === "line" ? "LINE" : "G"}
          </span>
          {props.t(`ดำเนินการต่อด้วย ${PROVIDERS[p].name}`, `Continue with ${PROVIDERS[p].name}`)}
        </a>
      ))}
      <p class="social-or">
        <span>{props.t("หรือใช้ชื่อผู้ใช้", "or use a username")}</span>
      </p>
    </div>
  );
}
