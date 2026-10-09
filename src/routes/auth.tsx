/**
 * Prototype sign-up / sign-in with username + password (owner's choice for
 * the prototype; the PRD's phone/email OTP slots in here later).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { normalizeUsername, passwordProblem, USERNAME_RE } from "../domain/rules";
import { hashPassword, newId, sha256, verifyPassword } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDay } from "../lib/i18n";
import { audit } from "../lib/records";
import { accountUsable, endSession, startSession } from "../lib/session";
import { accounts, loginAttempts } from "../schema";
import { Button, Card, Field, Notice, page, safeNext, str, view } from "../ui/kit";

export const authRoutes = new Hono<AppEnv>();

// ------------------------------------------------------------ throttling --
// PRD §11: rate limiting. Failed sign-ins and sign-ups are rows in
// identity_login_attempts (the IP is stored only as a SHA-256). Retention
// (src/services/retention.ts) deletes rows older than 24 hours.

const MINUTE = 60_000;
export const LOGIN_WINDOW_MS = 15 * MINUTE;
export const LOGIN_MAX_PER_USER = 5;
export const LOGIN_MAX_PER_IP = 20;
export const SIGNUP_WINDOW_MS = 60 * MINUTE;
export const SIGNUP_MAX_PER_IP = 10;
const SIGNUP_PREFIX = "signup:";
const UNKNOWN_IP = "unknown";

/** The client IP as Cloudflare reports it, or "unknown" (local dev, tests). */
function clientIp(c: Context<AppEnv>): string {
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || UNKNOWN_IP;
}

async function ipKey(c: Context<AppEnv>): Promise<{ ipHash: string; known: boolean }> {
  const ip = clientIp(c);
  return { ipHash: await sha256(ip), known: ip !== UNKNOWN_IP };
}

/**
 * True when this sign-in must be refused before the password is checked.
 * One query for both counts. Signup rows (username "signup:…") never count
 * against a username, and only count against an IP for the signup limit.
 * Requests with no client IP at all (local dev, tests) skip the IP limit:
 * deployed on Cloudflare every request carries cf-connecting-ip.
 */
async function loginThrottled(c: Context<AppEnv>, username: string, ip: { ipHash: string; known: boolean }, now: Date): Promise<boolean> {
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

async function signupThrottled(c: Context<AppEnv>, ip: { ipHash: string; known: boolean }, now: Date): Promise<boolean> {
  if (!ip.known) return false;
  const since = new Date(now.getTime() - SIGNUP_WINDOW_MS);
  const [row] = await getDb(c.env)
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipHash, ip.ipHash), gte(loginAttempts.createdAt, since), sql`${loginAttempts.username} like ${SIGNUP_PREFIX + "%"}`));
  return Number(row?.n ?? 0) >= SIGNUP_MAX_PER_IP;
}

async function tooMany(c: Context<AppEnv>, mode: "signup" | "login"): Promise<Response> {
  const { t } = view(c);
  // page() only takes the statuses kit.tsx lists, so re-wrap its response as a 429.
  const res = await page(
    c,
    { title: mode === "login" ? t("เข้าสู่ระบบ", "Sign in") : t("สมัครสมาชิก", "Sign up") },
    <>
      <h1>{t("ลองหลายครั้งเกินไป", "Too many attempts")}</h1>
      <Notice kind="error">
        {mode === "login"
          ? t("ลองหลายครั้งเกินไป โปรดลองใหม่ในอีก 15 นาที", "Too many attempts, try again in 15 minutes.")
          : t("มีการสมัครจากเครือข่ายนี้มากเกินไป โปรดลองใหม่ในอีก 1 ชั่วโมง", "Too many sign-ups from this network, try again in an hour.")}
      </Notice>
      <p class="muted">
        {t("หากต้องการความช่วยเหลือเร่งด่วน โทร ", "If you need urgent help, call ")}
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
  username?: string;
  next?: string;
}) {
  const { t, mode } = props;
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
          hint={mode === "signup" ? t("a–z, 0–9, _ หรือ . (3–30 ตัว) — ไม่แสดงต่อผู้อื่น", "a–z, 0–9, _ or . (3–30) — never shown to other people") : undefined}
        />
        <Field
          label={t("รหัสผ่าน", "Password")}
          name="password"
          type="password"
          required
          autocomplete={mode === "signup" ? "new-password" : "current-password"}
          hint={mode === "signup" ? t("อย่างน้อย 8 ตัวอักษร", "At least 8 characters") : undefined}
        />
        {mode === "signup" ? (
          <Field label={t("ยืนยันรหัสผ่าน", "Confirm password")} name="confirm" type="password" required autocomplete="new-password" />
        ) : null}
        <Button>{mode === "signup" ? t("สร้างบัญชี", "Create account") : t("เข้าสู่ระบบ", "Sign in")}</Button>
      </form>
    </Card>
  );
}

authRoutes.get("/signup", (c) => {
  const { t, user } = view(c);
  if (user) return c.redirect(user.profile?.onboardedAt ? "/events" : "/onboarding");
  return page(
    c,
    { title: t("สมัครสมาชิก", "Sign up") },
    <>
      <h1>{t("มาเริ่มกันเลย 👋", "Let's get you started 👋")}</h1>
      <p class="muted">{t("ใช้เวลาไม่ถึง 3 นาที", "Takes under 3 minutes.")}</p>
      <AuthForm mode="signup" t={t} />
      <p>
        {t("มีบัญชีแล้ว?", "Already have an account?")} <a href="/login">{t("เข้าสู่ระบบ", "Sign in")}</a>
      </p>
    </>,
  );
});

authRoutes.post("/signup", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
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
        <AuthForm mode="signup" t={t} username={username} />
      </>,
    );
  if (!USERNAME_RE.test(username)) return fail(t("ชื่อผู้ใช้ไม่ถูกต้อง", "That username isn't valid."));
  const pwIssue = passwordProblem(password);
  if (pwIssue) return fail(t("รหัสผ่านต้องยาว 8–200 ตัวอักษร", "Password must be 8–200 characters."));
  if (password !== confirm) return fail(t("รหัสผ่านไม่ตรงกัน", "Passwords don't match."));

  const now = new Date();
  const ip = await ipKey(c);
  if (await signupThrottled(c, ip, now)) return tooMany(c, "signup");

  const db = getDb(c.env);
  const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).limit(1);
  if (taken) return fail(t("ชื่อผู้ใช้นี้ถูกใช้แล้ว", "That username is taken."));

  const { hash, salt } = await hashPassword(password);
  const id = newId();
  try {
    await db.insert(accounts).values({ id, username, passwordHash: hash, passwordSalt: salt, researchId: newId() });
  } catch {
    // Unique index race: someone took it between the check and the insert.
    return fail(t("ชื่อผู้ใช้นี้ถูกใช้แล้ว", "That username is taken."));
  }
  // Counts toward the per-IP signup limit ("signup:" can never be a real username).
  await db.insert(loginAttempts).values({ id: newId(), username: `${SIGNUP_PREFIX}${id}`, ipHash: ip.ipHash, createdAt: now });
  await startSession(c, id);
  return c.redirect("/onboarding");
});

authRoutes.get("/login", (c) => {
  const { t, user } = view(c);
  const next = safeNext(c.req.query("next"), "");
  if (user) return c.redirect(next || (user.profile?.onboardedAt ? "/events" : "/onboarding"));
  return page(
    c,
    { title: t("เข้าสู่ระบบ", "Sign in") },
    <>
      <h1>{t("ยินดีต้อนรับกลับมา", "Welcome back")}</h1>
      <AuthForm mode="login" t={t} next={next} />
      <p>
        {t("ยังไม่มีบัญชี?", "New here?")} <a href="/signup">{t("สมัครสมาชิก", "Create an account")}</a>
      </p>
    </>,
  );
});

authRoutes.post("/login", async (c) => {
  const { t, lang } = view(c);
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
  if (await loginThrottled(c, username, ip, now)) return tooMany(c, "login");

  const [acct] = await db.select().from(accounts).where(eq(accounts.username, username)).limit(1);
  // Same message whether the username or the password was wrong.
  if (!acct || !(await verifyPassword(password, acct.passwordHash, acct.passwordSalt))) {
    await db.insert(loginAttempts).values({ id: newId(), username, ipHash: ip.ipHash, createdAt: now });
    return fail(t("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "Wrong username or password."));
  }
  // Correct password: forget this username's failures.
  await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
  if (!accountUsable(acct)) {
    if (acct.status === "suspended" && acct.suspendedUntil) {
      return fail(t(`บัญชีถูกระงับถึง ${fmtDay(acct.suspendedUntil, lang)}`, `This account is suspended until ${fmtDay(acct.suspendedUntil, lang)}.`), 403);
    }
    if (acct.status === "deactivated") return fail(t("บัญชีนี้ถูกปิดแล้ว", "This account was deactivated."), 403);
    return fail(t("บัญชีนี้ถูกระงับการใช้งาน", "This account has been banned."), 403);
  }
  if (acct.status === "suspended") {
    // Suspension has expired: lift it on the way in.
    await db.update(accounts).set({ status: "active", suspendedUntil: null }).where(eq(accounts.id, acct.id));
    await audit(db, acct.id, "account.suspension_expired", { type: "account", id: acct.id });
  }
  await startSession(c, acct.id);
  return c.redirect(next || "/events");
});

authRoutes.post("/logout", async (c) => {
  await endSession(c);
  return c.redirect("/");
});
