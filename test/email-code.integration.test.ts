/**
 * Sign in with an email code (src/services/email-code.ts, src/routes/email-code.tsx):
 * hidden until configured, the same answer for known and unknown addresses,
 * codes that expire and run out of tries, per-address and per-network limits,
 * only hashes in the database, and clean-up by retention.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../src/index";
import { ENV, HAS_DB, createMember, db } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { accounts, emailLinks, loginAttempts, loginCodes } from "../src/schema";
import { CODE_MAX_ATTEMPTS, CODE_MAX_PER_EMAIL, CODE_MAX_PER_IP, checkCode, emailHash, newCode, normalizeEmail, requestCode, setTestOutbox } from "../src/services/email-code";
import { runRetention } from "../src/services/retention";

/** Every response carries its own CSP nonce; the pages must match apart from that. */
const noNonce = (html: string) => html.replace(/ nonce="[^"]*"/g, "");

// Test-only values: nothing is sent anywhere (NO_EXTERNAL is set in ENV).
const EMAIL_ENV = { ...ENV, EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "test-only", EMAIL_FROM: "Jurrgun <codes@example.test>", EMAIL_HASH_SALT: "test-only-salt" };
const HOUR = 3_600_000;

let outbox: { to: string; code: string }[] = [];
beforeEach(() => {
  outbox = [];
  setTestOutbox((to, code) => outbox.push({ to, code }));
});
afterEach(() => setTestOutbox(null));

const uniq = () => `m${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}@example.test`;

function call(path: string, opts: { cookie?: string; form?: Record<string, string>; ip?: string; env?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.ip) headers["cf-connecting-ip"] = opts.ip;
  let body: string | undefined;
  if (opts.form) {
    body = new URLSearchParams(opts.form).toString();
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  return app.request(path, { method: opts.form ? "POST" : "GET", headers, body }, opts.env ?? EMAIL_ENV);
}

/** Links `email` to the member through Settings, as a member would. */
async function link(cookie: string, email: string) {
  outbox = [];
  expect((await call("/settings/email", { cookie, form: { email } })).status).toBe(200);
  const code = outbox.at(-1)!.code;
  const res = await call("/settings/email/verify", { cookie, form: { email, code } });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/settings/email?done=linked");
}

describe("email code basics", () => {
  it("normalizes addresses and makes uniform 6-digit codes", () => {
    expect(normalizeEmail("  Ploy.T+1@Example.COM ")).toBe("ploy.t+1@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });
});

describe.skipIf(!HAS_DB)("sign in with an email code", () => {
  it("stays hidden until all four email settings are set", async () => {
    expect((await call("/login/code", { env: ENV })).status).toBe(404);
    expect(await (await call("/login", { env: ENV })).text()).not.toContain("/login/code");
    const m = await createMember();
    expect((await call("/settings/email", { cookie: m.cookie, env: ENV })).status).toBe(404);
    expect(await (await call("/settings", { cookie: m.cookie, env: ENV })).text()).not.toContain("/settings/email");
    expect((await call("/login/code", { env: { ...EMAIL_ENV, EMAIL_HASH_SALT: "" } })).status).toBe(404);
    // Configured: offered on the sign-in page and on Me.
    expect(await (await call("/login")).text()).toContain('href="/login/code"');
    expect(await (await call("/settings", { cookie: m.cookie })).text()).toContain('href="/settings/email"');
  });

  it("links an email in Settings with a code, storing only hashes", async () => {
    const m = await createMember();
    const email = uniq();
    const typed = `  ${email.toUpperCase()} `;
    const sent = await call("/settings/email", { cookie: m.cookie, form: { email: typed } });
    expect(sent.status).toBe(200);
    expect(outbox.length).toBe(1);
    expect(outbox[0].to).toBe(email);
    const code = outbox[0].code;
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await call("/settings/email/verify", { cookie: m.cookie, form: { email, code: wrong } });
    expect(bad.status).toBe(400);
    await link(m.cookie, email);

    const [row] = await db().select().from(emailLinks).where(eq(emailLinks.accountId, m.id)).limit(1);
    expect(row.verifiedAt).not.toBeNull();
    expect(row.emailHash).toBe(await emailHash(EMAIL_ENV, email));
    // Nothing in either table holds the address or a code in plain text.
    const links = await db().select().from(emailLinks).limit(1000);
    const codes = await db().select().from(loginCodes).where(eq(loginCodes.emailHash, row.emailHash)).limit(1000);
    expect(codes.length).toBe(2);
    for (const text of [JSON.stringify(links), JSON.stringify(codes)]) {
      expect(text).not.toContain(email);
      expect(text).not.toContain(email.split("@")[0]);
      expect(text).not.toContain("@");
    }
    for (const c of codes) {
      expect(c.codeHash).toMatch(/^[\w-]{43}$/);
      for (const value of Object.values(c)) expect([code, outbox.at(-1)!.code]).not.toContain(String(value));
    }
    const page = await (await call("/settings/email?done=linked", { cookie: m.cookie })).text();
    expect(page).toContain("✓");
    expect(page).not.toContain(email);
    // The data export counts it, without the address.
    const exp = (await (await call("/settings/privacy/export", { cookie: m.cookie })).json()) as { signInEmails: number };
    expect(exp.signInEmails).toBe(1);
    expect(JSON.stringify(exp)).not.toContain(email);
    // Removing it unlinks it.
    expect((await call("/settings/email/remove", { cookie: m.cookie, form: {} })).status).toBe(302);
    expect(await db().select().from(emailLinks).where(eq(emailLinks.accountId, m.id)).limit(1)).toEqual([]);
  });

  it("refuses an email already linked to someone else", async () => {
    const a = await createMember();
    const b = await createMember();
    const email = uniq();
    await link(a.cookie, email);
    outbox = [];
    await call("/settings/email", { cookie: b.cookie, form: { email } });
    const res = await call("/settings/email/verify", { cookie: b.cookie, form: { email, code: outbox[0].code } });
    expect(res.status).toBe(409);
    const [owner] = await db().select().from(emailLinks).where(eq(emailLinks.emailHash, await emailHash(EMAIL_ENV, email))).limit(1);
    expect(owner.accountId).toBe(a.id);
  });

  it("signs a member in with the code from their email", async () => {
    const m = await createMember();
    const email = uniq();
    await link(m.cookie, email);
    outbox = [];
    const asked = await call("/login/code", { form: { email, next: "/me/events" } });
    expect(asked.status).toBe(200);
    expect(outbox.length).toBe(1);
    const res = await call("/login/code/verify", { form: { email, code: outbox[0].code, next: "/me/events" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/me/events");
    expect(res.headers.get("set-cookie")).toContain("bkk_sid=");
    // A code works once.
    const again = await call("/login/code/verify", { form: { email, code: outbox[0].code } });
    expect(again.status).toBe(400);
    expect(again.headers.get("set-cookie") ?? "").not.toContain("bkk_sid=");
  });

  it("answers the same for an address with no account, and sends nothing", async () => {
    const m = await createMember();
    const known = uniq();
    await link(m.cookie, known);
    const unknown = uniq();
    outbox = [];
    const a = await call("/login/code", { form: { email: known } });
    const b = await call("/login/code", { form: { email: unknown } });
    expect(a.status).toBe(b.status);
    expect(noNonce((await a.text()).replaceAll(known, "X"))).toBe(noNonce((await b.text()).replaceAll(unknown, "X")));
    expect(outbox.map((o) => o.to)).toEqual([known]);
    // A guess for the unknown address fails like any wrong code.
    const guess = await call("/login/code/verify", { form: { email: unknown, code: "123456" } });
    const wrong = await call("/login/code/verify", { form: { email: known, code: outbox[0].code === "123456" ? "654321" : "123456" } });
    expect(guess.status).toBe(400);
    expect(wrong.status).toBe(400);
    expect(noNonce((await guess.text()).replaceAll(unknown, "X"))).toBe(noNonce((await wrong.text()).replaceAll(known, "X")));
  });

  it("refuses an expired code", async () => {
    const m = await createMember();
    const email = uniq();
    await link(m.cookie, email);
    outbox = [];
    await call("/login/code", { form: { email } });
    const hash = await emailHash(EMAIL_ENV, email);
    await db().update(loginCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(loginCodes.emailHash, hash));
    const res = await call("/login/code/verify", { form: { email, code: outbox[0].code } });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("หมดอายุ");
    // And checkCode on its own: valid at 9 minutes, expired at 11.
    outbox = [];
    const now = new Date();
    await requestCode(EMAIL_ENV, { email, ipHash: "t", ipKnown: false, lang: "en", purpose: "login", now });
    expect(await checkCode(EMAIL_ENV, email, outbox[0].code, new Date(now.getTime() + 11 * 60_000))).toEqual({ ok: false, reason: "expired" });
    expect((await checkCode(EMAIL_ENV, email, outbox[0].code, new Date(now.getTime() + 9 * 60_000))).ok).toBe(true);
  });

  it("gives each code 5 tries, then refuses even the right one", async () => {
    const m = await createMember();
    const email = uniq();
    await link(m.cookie, email);
    outbox = [];
    await requestCode(EMAIL_ENV, { email, ipHash: "t", ipKnown: false, lang: "th", purpose: "login" });
    const code = outbox[0].code;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) expect((await checkCode(EMAIL_ENV, email, wrong)).ok).toBe(false);
    expect(await checkCode(EMAIL_ENV, email, code)).toEqual({ ok: false, reason: "used_up" });
    // Guesses at the same time can't get past the limit either.
    outbox = [];
    await requestCode(EMAIL_ENV, { email, ipHash: "t", ipKnown: false, lang: "th", purpose: "login" });
    const results = await Promise.all(Array.from({ length: 12 }, () => checkCode(EMAIL_ENV, email, "999999" === outbox[0].code ? "888888" : "999999")));
    expect(results.every((r) => !r.ok)).toBe(true);
    const [row] = await db().select().from(loginCodes).where(eq(loginCodes.emailHash, await emailHash(EMAIL_ENV, email))).orderBy(sql`${loginCodes.createdAt} desc`).limit(1);
    expect(row.attempts).toBe(CODE_MAX_ATTEMPTS);
  });

  it("locks an address after 5 wrong codes, counted with wrong passwords", async () => {
    const m = await createMember();
    const email = uniq();
    await link(m.cookie, email);
    outbox = [];
    await call("/login/code", { form: { email } });
    const code = outbox[0].code;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await call("/login/code/verify", { form: { email, code: wrong } })).status).toBe(400);
    const locked = await call("/login/code/verify", { form: { email, code } });
    expect(locked.status).toBe(429);
    const hash = await emailHash(EMAIL_ENV, email);
    const rows = await db().select().from(loginAttempts).where(eq(loginAttempts.username, `email:${hash}`)).limit(10);
    expect(rows.length).toBe(5);
    expect(JSON.stringify(rows)).not.toContain(email);
  });

  it("limits codes per address and per network, the same for unknown addresses", async () => {
    const m = await createMember();
    const known = uniq();
    await link(m.cookie, known);
    // Linking it used one code already, and codes for Settings count too.
    for (const [email, before] of [[known, 1], [uniq(), 0]] as const) {
      for (let i = before; i < CODE_MAX_PER_EMAIL; i++) expect((await call("/login/code", { form: { email } })).status).toBe(200);
      const res = await call("/login/code", { form: { email } });
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("900");
    }
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < CODE_MAX_PER_IP; i++) expect((await call("/login/code", { ip, form: { email: uniq() } })).status).toBe(200);
    expect((await call("/login/code", { ip, form: { email: uniq() } })).status).toBe(429);
    expect((await call("/login/code", { ip: "203.0.113.9", form: { email: uniq() } })).status).toBe(200);
  });

  it("rejects malformed addresses without sending", async () => {
    const res = await call("/login/code", { form: { email: "nope" } });
    expect(res.status).toBe(400);
    expect(outbox).toEqual([]);
  });

  it("retention deletes old codes, and a deleted account's email and codes", async () => {
    const m = await createMember();
    const email = uniq();
    await link(m.cookie, email);
    const hash = await emailHash(EMAIL_ENV, email);
    const old = newId();
    await db().insert(loginCodes).values({ id: old, emailHash: "x", codeHash: "y", expiresAt: new Date(Date.now() - 25 * HOUR), ipHash: "z", createdAt: new Date(Date.now() - 25 * HOUR) });
    await call("/login/code", { form: { email } });
    await runRetention(EMAIL_ENV);
    expect(await db().select().from(loginCodes).where(eq(loginCodes.id, old)).limit(1)).toEqual([]);
    expect((await db().select().from(loginCodes).where(eq(loginCodes.emailHash, hash)).limit(10)).length).toBeGreaterThan(0);
    // Deactivated more than 30 days ago: everything tied to the address goes.
    await db().update(accounts).set({ status: "deactivated", deactivatedAt: new Date(Date.now() - 31 * 24 * HOUR) }).where(eq(accounts.id, m.id));
    await runRetention(EMAIL_ENV);
    expect(await db().select().from(emailLinks).where(eq(emailLinks.accountId, m.id)).limit(1)).toEqual([]);
    expect(await db().select().from(loginCodes).where(inArray(loginCodes.emailHash, [hash])).limit(1)).toEqual([]);
  });

  it("deactivating unlinks the email straight away", async () => {
    const m = await createMember();
    await link(m.cookie, uniq());
    expect((await call("/settings/deactivate", { cookie: m.cookie, form: { confirm: "1" } })).status).toBe(302);
    expect(await db().select().from(emailLinks).where(eq(emailLinks.accountId, m.id)).limit(1)).toEqual([]);
  });
});
