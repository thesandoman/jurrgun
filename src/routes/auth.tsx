/**
 * Prototype sign-up / sign-in with username + password (owner's choice for
 * the prototype; the PRD's phone/email OTP slots in here later).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { isPasswordless, normalizeUsername, passwordProblem, USERNAME_RE } from "../domain/rules";
import { hashPassword, hmacSha256, newId, verifyPassword } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDay } from "../lib/i18n";
import { audit } from "../lib/records";
import { accountUsable, endSession, startSession } from "../lib/session";
import { accounts, loginAttempts, type Account } from "../schema";
import { emailEnabled } from "../services/email-code";
import { signupSource } from "../lib/source";
import { enabledProviders, SocialSignIn } from "./oauth";
import { Button, Card, Field, Notice, page, safeNext, str, TextArea, view, type View } from "../ui/kit";
import { banCopy, fileLookAgain, latestBanRule, LOOK_AGAIN_MAX, lookAgainToken } from "../services/outcomes";
import { termsRow } from "../services/consent";
import { TermsAgree } from "./policies";

export const authRoutes = new Hono<AppEnv>();

// ------------------------------------------------------------ throttling --
// PRD §11: rate limiting. Failed sign-ins and sign-ups are rows in
// identity_login_attempts. The IP and the username are stored only as keyed
// HMACs (ipKey and attemptUser below, keyed with IP_HASH_SECRET, or with
// EMAIL_HASH_SALT when that is unset), never in the clear. Retention
// (src/services/retention.ts) deletes rows older than 24 hours.

const MINUTE = 60_000;
export const LOGIN_WINDOW_MS = 15 * MINUTE;
export const LOGIN_MAX_PER_USER = 5;
export const LOGIN_MAX_PER_IP = 20;
export const SIGNUP_WINDOW_MS = 60 * MINUTE;
export const SIGNUP_MAX_PER_IP = 10;
export const SIGNUP_PREFIX = "signup:";
const UNKNOWN_IP = "unknown";

/** The client IP as Cloudflare reports it, or "unknown" (local dev, tests). */
function clientIp(c: Context<AppEnv>): string {
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || UNKNOWN_IP;
}

/** The secret the IP and username hashes are keyed with (R10, R11). */
const hashSecret = (c: Context<AppEnv>) => c.env.IP_HASH_SECRET || c.env.EMAIL_HASH_SALT || "";

/** The client IP as a keyed HMAC, never the address itself (privacy R10: a plain SHA-256 of an IP can be reversed). */
export async function ipKey(c: Context<AppEnv>): Promise<{ ipHash: string; known: boolean }> {
  const ip = clientIp(c);
  return { ipHash: await hmacSha256(`ip:${hashSecret(c)}`, ip), known: ip !== UNKNOWN_IP };
}

/**
 * The key a password sign-in's failures are counted under: a keyed HMAC of the
 * username, never the username itself (privacy R11). Rows from before this
 * (the raw username) are no longer matched and go within 24 hours (retention).
 */
export async function attemptUser(c: Context<AppEnv>, username: string): Promise<string> {
  return `user:${await hmacSha256(`user:${hashSecret(c)}`, username)}`;
}

/**
 * True when this sign-in must be refused before the password is checked.
 * One query for both counts. Signup rows (username "signup:…") never count
 * against a username, and only count against an IP for the signup limit.
 * Requests with no client IP at all (local dev, tests) skip the IP limit:
 * deployed on Cloudflare every request carries cf-connecting-ip.
 */
export async function loginThrottled(c: Context<AppEnv>, username: string, ip: { ipHash: string; known: boolean }, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const [row] = await getDb(c.env)
    .select({
      byUser: sql<number>`count(*) filter (where ${loginAttempts.username} = ${username})`.mapWith(Number),
      byIp: sql<number>`count(*) filter (where ${loginAttempts.ipHash} = ${ip.ipHash} and ${loginAttempts.username} not like ${SIGNUP_PREFIX + "%"})`.mapWith(Number),
    })
    .from(loginAttempts)
    .where(and(gte(loginAttempts.createdAt, since), sql`(${loginAttempts.username} = ${username} or ${loginAttempts.ipHash} = ${ip.ipHash})`));
  const byUser = Number(row?.byUser ?? 0);
  const byIp = Number(row?.byIp ?? 0);
  return byUser >= LOGIN_MAX_PER_USER || (ip.known && byIp >= LOGIN_MAX_PER_IP);
}

export async function signupThrottled(c: Context<AppEnv>, ip: { ipHash: string; known: boolean }, now: Date): Promise<boolean> {
  if (!ip.known) return false;
  const since = new Date(now.getTime() - SIGNUP_WINDOW_MS);
  const [row] = await getDb(c.env)
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipHash, ip.ipHash), gte(loginAttempts.createdAt, since), sql`${loginAttempts.username} like ${SIGNUP_PREFIX + "%"}`));
  return Number(row?.n ?? 0) >= SIGNUP_MAX_PER_IP;
}

export async function tooMany(c: Context<AppEnv>, mode: "signup" | "login"): Promise<Response> {
  const { t } = view(c);
  // page() only takes the statuses kit.tsx lists, so re-wrap its response as a 429.
  const res = await page(
    c,
    { title: mode === "login" ? t("เข้าสู่ระบบ", "Sign in") : t("สมัครสมาชิก", "Sign up") },
    <>
      <h1>{t("ลองหลายครั้งเกินไป", "Too many attempts")}</h1>
      <Notice kind="error">
        {mode === "login"
          ? t("ลองหลายครั้งเกินไปแล้ว รอ 15 นาทีแล้วลองใหม่", "Too many attempts. Try again in 15 minutes.")
          : t("มีการสมัครจากเครือข่ายนี้มากเกินไป รอ 1 ชั่วโมงแล้วลองใหม่", "Too many sign-ups from this network. Try again in an hour.")}
      </Notice>
      <p class="muted">
        {t("ถ้าต้องการความช่วยเหลือด่วน โทร ", "If you need urgent help, call ")}
        <a href="tel:191">191</a> / <a href="tel:1669">1669</a>
      </p>
    </>,
  );
  const headers = new Headers(res.headers);
  headers.set("retry-after", String((mode === "login" ? LOGIN_WINDOW_MS : SIGNUP_WINDOW_MS) / 1000));
  return new Response(res.body, { status: 429, headers });
}

function AuthForm(props: {
  mode: "signup" | "login";
  t: (th: string, en: string) => string;
  /** Sign-up only: the Terms box and its sheets need the page language. */
  v?: View;
  username?: string;
  next?: string;
  terms?: boolean;
}) {
  const { t, mode } = props;
  const reveal = { show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") };
  return (
    <Card>
      <form method="post" action={mode === "signup" ? "/signup" : "/login"}>
        <input type="hidden" name="next" value={props.next ?? ""} />
        <Field
          label={t("ชื่อผู้ใช้", "Username")}
          name="username"
          value={props.username}
          required
          autocomplete="username"
          maxlength={30}
          hint={mode === "signup" ? t("a-z, 0-9, _ หรือ . ยาว 3 ถึง 30 ตัว คนอื่นจะไม่เห็นชื่อนี้", "a-z, 0-9, _ or . (3 to 30). Never shown to other people.") : undefined}
        />
        <Field
          label={t("รหัสผ่าน", "Password")}
          name="password"
          type="password"
          required
          autocomplete={mode === "signup" ? "new-password" : "current-password"}
          reveal={reveal}
          hint={mode === "signup" ? t("อย่างน้อย 8 ตัวอักษร", "At least 8 characters") : undefined}
        />
        {mode === "signup" ? (
          <Field label={t("ยืนยันรหัสผ่าน", "Confirm password")} name="confirm" type="password" required autocomplete="new-password" reveal={reveal} />
        ) : null}
        {mode === "signup" && props.v ? <TermsAgree v={props.v} checked={props.terms} /> : null}
        <Button>{mode === "signup" ? t("สร้างบัญชี", "Create account") : t("เข้าสู่ระบบ", "Sign in")}</Button>
      </form>
    </Card>
  );
}

authRoutes.get("/signup", (c) => {
  const v = view(c);
  const { t, user } = v;
  if (user) return c.redirect(user.profile?.onboardedAt ? "/" : "/onboarding");
  return page(
    c,
    { title: t("สมัครสมาชิก", "Sign up") },
    <>
      <h1>{t("มาเริ่มกันเลย 👋", "Let's get you started 👋")}</h1>
      <p class="muted">{t("ใช้เวลาไม่ถึง 3 นาที", "Takes under 3 minutes.")}</p>
      <SocialSignIn t={t} providers={enabledProviders(c.env)} />
      <AuthForm mode="signup" t={t} v={v} />
      <p>
        {t("มีบัญชีแล้ว?", "Already have an account?")} <a href="/login">{t("เข้าสู่ระบบ", "Sign in")}</a>
      </p>
    </>,
  );
});

authRoutes.post("/signup", async (c) => {
  const v = view(c);
  const { t } = v;
  const body = await c.req.parseBody();
  const terms = str(body.terms) === "1";
  const username = normalizeUsername(str(body.username));
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const fail = (msg: string) =>
    page(
      c,
      { title: t("สมัครสมาชิก", "Sign up"), status: 400 },
      <>
        <h1>{t("มาเริ่มกันเลย 👋", "Let's get you started 👋")}</h1>
        <Notice kind="error">{msg}</Notice>
        <AuthForm mode="signup" t={t} v={v} username={username} terms={terms} />
      </>,
    );
  if (!USERNAME_RE.test(username)) return fail(t("ชื่อผู้ใช้ไม่ถูกต้อง", "That username isn't valid."));
  if (isPasswordless(username)) return fail(t("ชื่อผู้ใช้ห้ามขึ้นต้นด้วย google_ หรือ line_", "Usernames can't start with google_ or line_."));
  const pwIssue = passwordProblem(password);
  if (pwIssue) return fail(t("รหัสผ่านต้องยาว 8 ถึง 200 ตัวอักษร", "Password must be 8 to 200 characters."));
  if (password !== confirm) return fail(t("รหัสผ่านไม่ตรงกัน", "Passwords don't match."));
  if (!terms) return fail(t("ติ๊กยอมรับข้อกำหนดการใช้งานก่อนจึงจะสมัครได้", "Please agree to the Terms of service to sign up."));

  const now = new Date();
  const ip = await ipKey(c);
  if (await signupThrottled(c, ip, now)) return tooMany(c, "signup");

  const db = getDb(c.env);
  const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).limit(1);
  if (taken) return fail(t("ชื่อผู้ใช้นี้ถูกใช้แล้ว", "That username is taken."));

  const { hash, salt } = await hashPassword(password);
  const id = newId();
  try {
    await db.insert(accounts).values({ id, username, passwordHash: hash, passwordSalt: salt, researchId: null, signupSource: signupSource(c) });
  } catch {
    // Unique index race: someone took it between the check and the insert.
    return fail(t("ชื่อผู้ใช้นี้ถูกใช้แล้ว", "That username is taken."));
  }
  // Counts toward the per-IP signup limit ("signup:" can never be a real username).
  await db.insert(loginAttempts).values({ id: newId(), username: `${SIGNUP_PREFIX}${id}`, ipHash: ip.ipHash, createdAt: now });
  // The Terms box, with the version agreed to (the notice date).
  await termsRow(db, id);
  await startSession(c, id);
  return c.redirect("/onboarding");
});

authRoutes.get("/login", (c) => {
  const { t, user } = view(c);
  const next = safeNext(c.req.query("next"), "");
  if (user) return c.redirect(next || (user.profile?.onboardedAt ? "/" : "/onboarding"));
  return page(
    c,
    { title: t("เข้าสู่ระบบ", "Sign in") },
    <>
      <h1>{t("ยินดีต้อนรับกลับมา", "Welcome back")}</h1>
      <SocialSignIn t={t} providers={enabledProviders(c.env)} next={next} />
      <AuthForm mode="login" t={t} next={next} />
      {emailEnabled(c.env) ? (
        <p class="code-signin">
          <a class="btn ghost" href={next ? `/login/code?next=${encodeURIComponent(next)}` : "/login/code"}>
            <span aria-hidden="true">✉️</span> {t("เข้าสู่ระบบด้วยรหัสทางอีเมล", "Sign in with a code by email")}
          </a>
        </p>
      ) : null}
      <p>
        {t("ยังไม่มีบัญชี?", "New here?")} <a href="/signup">{t("สมัครสมาชิก", "Create an account")}</a>
      </p>
    </>,
  );
});

authRoutes.post("/login", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
  const username = normalizeUsername(str(body.username));
  const password = typeof body.password === "string" ? body.password : "";
  const next = safeNext(str(body.next), "");
  const fail = (msg: string, status: 400 | 403 = 400) =>
    page(
      c,
      { title: t("เข้าสู่ระบบ", "Sign in"), status },
      <>
        <h1>{t("ยินดีต้อนรับกลับมา", "Welcome back")}</h1>
        <Notice kind="error">{msg}</Notice>
        <AuthForm mode="login" t={t} username={username} next={next} />
      </>,
    );
  if (!username || !password) return fail(t("กรอกชื่อผู้ใช้และรหัสผ่าน", "Enter your username and password."));

  const db = getDb(c.env);
  const now = new Date();
  const ip = await ipKey(c);
  // Checked before the account lookup, so the answer is the same whether or
  // not the username exists, and the password is never verified once locked.
  const attempt = await attemptUser(c, username);
  if (await loginThrottled(c, attempt, ip, now)) return tooMany(c, "login");

  const [acct] = await db.select().from(accounts).where(eq(accounts.username, username)).limit(1);
  // Same message whether the username or the password was wrong.
  if (!acct || !(await verifyPassword(password, acct.passwordHash, acct.passwordSalt))) {
    await db.insert(loginAttempts).values({ id: newId(), username: attempt, ipHash: ip.ipHash, createdAt: now });
    return fail(t("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "Wrong username or password."));
  }
  // Correct password: forget this username's failures.
  await db.delete(loginAttempts).where(eq(loginAttempts.username, attempt));
  return signIn(c, acct, next, fail);
});

/**
 * The last step of every sign-in that proved who someone is (password or
 * email code): refuse suspended, deactivated and banned accounts with the
 * reason, lift a suspension that has ended, then start the session.
 */
export async function signIn(c: Context<AppEnv>, acct: Account, next: string, fail: (msg: string, status: 403) => Response | Promise<Response>): Promise<Response> {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  if (!accountUsable(acct)) {
    if (acct.status === "suspended" && acct.suspendedUntil) {
      return fail(t(`บัญชีนี้ถูกระงับถึง ${fmtDay(acct.suspendedUntil, lang)}`, `This account is suspended until ${fmtDay(acct.suspendedUntil, lang)}.`), 403);
    }
    if (acct.status === "deactivated") return fail(t("บัญชีนี้ถูกปิดแล้ว", "This account was deactivated."), 403);
    if (acct.status === "banned") return bannedScreen(c, acct.id);
    return fail(t("บัญชีนี้ถูกแบนแล้ว", "This account has been banned."), 403);
  }
  if (acct.status === "suspended") {
    // Suspension has expired: lift it on the way in.
    await db.update(accounts).set({ status: "active", suspendedUntil: null }).where(eq(accounts.id, acct.id));
    await audit(db, acct.id, "account.suspension_expired", { type: "account", id: acct.id });
  }
  await startSession(c, acct.id);
  return c.redirect(next || "/");
}

/**
 * The blocked sign-in screen for a ban (owner card C): which rule, and "ask us
 * to look again". Shown only after the member proved who they are.
 */
async function bannedScreen(c: Context<AppEnv>, accountId: string): Promise<Response> {
  const { t } = view(c);
  const db = getDb(c.env);
  const [th, en] = banCopy(await latestBanRule(db, accountId));
  const token = await lookAgainToken(db, accountId);
  return page(
    c,
    { title: t("บัญชีถูกปิด", "Account closed"), status: 403 },
    <>
      <h1>{t("บัญชีถูกปิด", "Account closed")}</h1>
      <Notice kind="warn">{t(th, en)}</Notice>
      <Card>
        <form method="post" action="/login/look-again">
          <input type="hidden" name="token" value={token} />
          <TextArea
            label={t("อยากบอกอะไรเราไหม (ไม่บังคับ)", "Anything you'd like us to know? (optional)")}
            name="words"
            rows={3}
            maxlength={LOOK_AGAIN_MAX}
            hint={t("ทีมงานคนอื่นจะดูอีกครั้ง ส่งได้ครั้งเดียว", "Someone else on the team takes a fresh look. You can ask once.")}
          />
          <Button>{t("ขอให้ทบทวน", "Ask us to look again")}</Button>
        </form>
      </Card>
    </>,
  );
}

authRoutes.post("/login/look-again", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
  const db = getDb(c.env);
  const result = await fileLookAgain(db, str(body.token), str(body.words), async (id) => {
    const [a] = await db.select({ status: accounts.status }).from(accounts).where(eq(accounts.id, id)).limit(1);
    return a?.status === "banned";
  });
  const text: Record<typeof result, [string, string]> = {
    sent: ["ส่งคำขอแล้ว ทีมงานอีกคนจะดูอีกครั้ง ถ้าเรายกเลิกการปิดบัญชี คุณจะเข้าสู่ระบบได้อีก", "Sent. Someone on the team will take another look. If we lift it, you'll be able to sign in again."],
    already: ["เราได้รับคำขอทบทวนของคุณแล้ว", "We already have your request to look again."],
    expired: ["หน้านี้หมดเวลาแล้ว ลองเข้าสู่ระบบอีกครั้ง", "This page timed out. Sign in again to ask."],
  };
  return page(
    c,
    { title: t("บัญชีถูกปิด", "Account closed"), status: result === "expired" ? 400 : 200 },
    <>
      <h1>{t("บัญชีถูกปิด", "Account closed")}</h1>
      <Notice kind={result === "expired" ? "error" : "ok"}>{t(text[result][0], text[result][1])}</Notice>
      <p>
        <a href="/login">{t("กลับไปหน้าเข้าสู่ระบบ", "Back to sign in")}</a>
      </p>
    </>,
  );
});

authRoutes.post("/logout", async (c) => {
  await endSession(c);
  return c.redirect("/");
});
