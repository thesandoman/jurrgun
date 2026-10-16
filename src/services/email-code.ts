/**
 * Sign in with a code sent by email (owner, 2026-10-16).
 *
 * A member links an address in Settings by typing back a 6-digit code; after
 * that, "sign in with a code" on the sign-in page sends a new code to it.
 *
 * Privacy: the address is stored only as a keyed SHA-256 (HMAC, key
 * EMAIL_HASH_SALT) of the lower-cased, trimmed address, never as text, so
 * staff (and the member) can't read it back. A code is stored only as an
 * HMAC, and its rows are deleted 24 hours later (src/services/retention.ts).
 *
 * Safety: codes last 10 minutes and allow 5 tries. Requests are limited per
 * address and per network, wrong codes count in identity_login_attempts like
 * wrong passwords, and the answer to "send me a code" is the same whether or
 * not the address belongs to an account (no account enumeration).
 *
 * Sending stays off, and every surface for it hidden, until EMAIL_PROVIDER,
 * EMAIL_API_KEY, EMAIL_FROM and EMAIL_HASH_SALT are all set. With NO_EXTERNAL
 * (tests) nothing leaves the app: "code sent" is logged without the code.
 */
import { and, desc, eq, gt, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { b64url, newId, safeEqual } from "../lib/crypto";
import type { Bindings } from "../lib/env";
import type { Lang } from "../lib/i18n";
import { createLogger } from "../logger";
import { emailLinks, loginCodes } from "../schema";

const MINUTE = 60_000;
export const CODE_TTL_MS = 10 * MINUTE;
export const CODE_MAX_ATTEMPTS = 5;
/** Code requests are counted over this window, per address and per network. */
export const CODE_WINDOW_MS = 15 * MINUTE;
export const CODE_MAX_PER_EMAIL = 3;
export const CODE_MAX_PER_IP = 10;
/** Codes are deleted this long after they were made (they expire long before). */
export const CODE_RETENTION_HOURS = 24;

const PROVIDERS = ["resend", "postmark"] as const;
type ProviderName = (typeof PROVIDERS)[number];

/** True only when every email setting is present and the provider is one we can send through. */
export function emailEnabled(env: Bindings): boolean {
  return !!(env.EMAIL_API_KEY && env.EMAIL_FROM && env.EMAIL_HASH_SALT && PROVIDERS.includes(env.EMAIL_PROVIDER as ProviderName));
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,251}\.[^\s@]{2,}$/;

/** The lower-cased, trimmed address, or null when it doesn't look like one. */
export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

const enc = new TextEncoder();
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))));
}

/** SHA-256 of the normalized address, keyed with the secret salt. */
export function emailHash(env: Bindings, email: string): Promise<string> {
  return hmac(`email:${env.EMAIL_HASH_SALT ?? ""}`, email);
}

function codeHash(env: Bindings, codeId: string, code: string): Promise<string> {
  return hmac(`code:${env.EMAIL_HASH_SALT ?? ""}`, `${codeId}:${code}`);
}

/** A uniformly random 6-digit code (rejection sampling, so no digit is more likely). */
export function newCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % 1_000_000).padStart(6, "0");
  }
}

// ----------------------------------------------------------- test hook --

type Outbox = (to: string, code: string) => void;
let testOutbox: Outbox | null = null;
/** Tests only: receive codes that would have been emailed. Used only when NO_EXTERNAL is set. */
export function setTestOutbox(fn: Outbox | null): void {
  testOutbox = fn;
}

// ------------------------------------------------------------- sending --

function message(code: string, lang: Lang) {
  const th = {
    subject: `รหัส Jurrgun ของคุณ: ${code}`,
    text: `รหัสของคุณคือ ${code}\n\nใช้ได้ 10 นาที อย่าบอกรหัสนี้กับใคร ทีมงาน Jurrgun จะไม่ถามรหัสนี้\nถ้าไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร\n\nYour Jurrgun code is ${code}. It works for 10 minutes. Never share it.`,
  };
  const en = {
    subject: `Your Jurrgun code: ${code}`,
    text: `Your code is ${code}\n\nIt works for 10 minutes. Never share it: the Jurrgun team will never ask for it.\nIf you didn't ask for this code, you can ignore this email.\n\nรหัส Jurrgun ของคุณคือ ${code} ใช้ได้ 10 นาที อย่าบอกรหัสนี้กับใคร`,
  };
  return lang === "en" ? en : th;
}

async function send(env: Bindings, to: string, code: string, lang: Lang, purpose: Purpose): Promise<void> {
  const log = createLogger(env);
  if (env.NO_EXTERNAL) {
    log.info("code sent", { purpose, provider: "none" });
    testOutbox?.(to, code);
    return;
  }
  const { subject, text } = message(code, lang);
  const provider = env.EMAIL_PROVIDER as ProviderName;
  const res =
    provider === "postmark"
      ? await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", "x-postmark-server-token": env.EMAIL_API_KEY! },
          body: JSON.stringify({ From: env.EMAIL_FROM, To: to, Subject: subject, TextBody: text, MessageStream: "outbound" }),
        })
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${env.EMAIL_API_KEY}` },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
        });
  if (res.ok) log.info("code sent", { purpose, provider });
  else log.error("code email failed", { purpose, provider, status: res.status });
}

// ------------------------------------------------------------- codes --

/** "login" sends only to an address linked to an account; "link" sends to the address a member is adding. */
export type Purpose = "login" | "link";

export type CodeRequest = {
  email: string;
  ipHash: string;
  /** False when the request carried no client IP (local dev, tests): the per-network limit is skipped. */
  ipKnown: boolean;
  lang: Lang;
  purpose: Purpose;
  now?: Date;
  /** Runs the send after the response when the platform allows it, so a known address answers as fast as an unknown one. */
  defer?: (p: Promise<unknown>) => void;
};

/**
 * Records a new code and emails it when it should go out. The result is the
 * same for addresses with and without an account: "throttled" depends only on
 * how many codes this address and network asked for recently.
 */
export async function requestCode(env: Bindings, r: CodeRequest): Promise<"sent" | "throttled"> {
  const db = getDb(env);
  const now = r.now ?? new Date();
  const hash = await emailHash(env, r.email);
  const since = new Date(now.getTime() - CODE_WINDOW_MS);
  const [counts] = await db
    .select({
      byEmail: sql<number>`count(*) filter (where ${loginCodes.emailHash} = ${hash})`.mapWith(Number),
      byIp: sql<number>`count(*) filter (where ${loginCodes.ipHash} = ${r.ipHash})`.mapWith(Number),
    })
    .from(loginCodes)
    .where(and(gte(loginCodes.createdAt, since), sql`(${loginCodes.emailHash} = ${hash} or ${loginCodes.ipHash} = ${r.ipHash})`));
  if (Number(counts?.byEmail ?? 0) >= CODE_MAX_PER_EMAIL || (r.ipKnown && Number(counts?.byIp ?? 0) >= CODE_MAX_PER_IP)) return "throttled";

  const id = newId();
  const code = newCode();
  // A row for every request, known address or not, so the limits and the answer never differ.
  const [, link] = await Promise.all([
    db.insert(loginCodes).values({ id, emailHash: hash, codeHash: await codeHash(env, id, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS), ipHash: r.ipHash, createdAt: now }),
    r.purpose === "login"
      ? db.select({ id: emailLinks.id }).from(emailLinks).where(and(eq(emailLinks.emailHash, hash), isNotNull(emailLinks.verifiedAt))).limit(1)
      : Promise.resolve([{ id: "" }]),
  ]);
  if (link.length) {
    const sending = send(env, r.email, code, r.lang, r.purpose).catch((err) => createLogger(env).error("code email failed", { purpose: r.purpose, error: String(err) }));
    if (r.defer) r.defer(sending);
    else await sending;
  }
  return "sent";
}

export type CodeCheck = { ok: true; emailHash: string } | { ok: false; reason: "wrong" | "expired" | "used_up" };

/**
 * Checks a typed code against the newest unused code for this address. Each
 * check spends one of the 5 tries first (in one statement, so two guesses at
 * once can't both slip in), then compares in constant time.
 */
export async function checkCode(env: Bindings, email: string, typed: string, now: Date = new Date()): Promise<CodeCheck> {
  const db = getDb(env);
  const hash = await emailHash(env, email);
  const code = typed.replace(/\s/g, "");
  const [latest] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.emailHash, hash), isNull(loginCodes.usedAt)))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);
  if (!latest) return { ok: false, reason: "wrong" };
  if (latest.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  const [spent] = await db
    .update(loginCodes)
    .set({ attempts: sql`${loginCodes.attempts} + 1` })
    .where(and(eq(loginCodes.id, latest.id), isNull(loginCodes.usedAt), lt(loginCodes.attempts, CODE_MAX_ATTEMPTS), gt(loginCodes.expiresAt, now)))
    .returning({ attempts: loginCodes.attempts });
  if (!spent) return { ok: false, reason: "used_up" };
  const expected = latest.codeHash;
  const given = /^\d{6}$/.test(code) ? await codeHash(env, latest.id, code) : "";
  // Same-length compare even for a malformed code, so the timing says nothing.
  const match = safeEqual(given.padEnd(expected.length, "x").slice(0, expected.length), expected) && given.length === expected.length;
  if (!match) return { ok: false, reason: spent.attempts >= CODE_MAX_ATTEMPTS ? "used_up" : "wrong" };
  const [used] = await db
    .update(loginCodes)
    .set({ usedAt: now })
    .where(and(eq(loginCodes.id, latest.id), isNull(loginCodes.usedAt)))
    .returning({ id: loginCodes.id });
  return used ? { ok: true, emailHash: hash } : { ok: false, reason: "wrong" };
}
