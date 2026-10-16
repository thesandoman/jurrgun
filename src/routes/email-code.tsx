/**
 * Sign in with a code sent by email, and the Settings page that links the
 * address (src/services/email-code.ts has the rules).
 *
 *   GET  /login/code               ask for a code
 *   POST /login/code               send it (same answer for any address)
 *   POST /login/code/verify        type it back: signed in
 *   GET  /settings/email           link, change or remove my sign-in email
 *   POST /settings/email           send a code to the new address
 *   POST /settings/email/verify    type it back: linked
 *   POST /settings/email/remove
 *
 * Every route answers 404 until the four EMAIL_* settings are set.
 */
import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { batch, getDb } from "../db";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { fmtDay } from "../lib/i18n";
import { audit } from "../lib/records";
import { requireMember } from "../lib/session";
import { accounts, emailLinks, loginAttempts } from "../schema";
import { checkCode, emailEnabled, emailHash, normalizeEmail, requestCode, type CodeCheck } from "../services/email-code";
import { Button, Card, Field, Notice, page, safeNext, str, view, type View } from "../ui/kit";
import { ipKey, loginThrottled, signIn, tooMany } from "./auth";

export const emailCodeRoutes = new Hono<AppEnv>();

type C = Context<AppEnv>;

/** Failed codes count against this key in identity_login_attempts, next to wrong passwords. */
const attemptKey = (hash: string) => `email:${hash}`;

emailCodeRoutes.use("/login/code", off404);
emailCodeRoutes.use("/login/code/*", off404);
emailCodeRoutes.use("/settings/email", off404, requireMember);
emailCodeRoutes.use("/settings/email/*", off404, requireMember);

async function off404(c: C, next: () => Promise<void>) {
  if (!emailEnabled(c.env)) return c.notFound();
  await next();
}

/** Lets the email go out after the response, so a known address takes no longer to answer than an unknown one. */
function deferOf(c: C): ((p: Promise<unknown>) => void) | undefined {
  try {
    const ctx = c.executionCtx;
    return (p) => ctx.waitUntil(p);
  } catch {
    return undefined; // tests and some local runs have no execution context
  }
}

function codeError(t: View["t"], reason: Exclude<CodeCheck, { ok: true }>["reason"]): string {
  if (reason === "expired") return t("รหัสนี้หมดอายุแล้ว ขอรหัสใหม่ได้เลย", "That code has expired. Ask for a new one.");
  if (reason === "used_up") return t("ลองรหัสนี้ครบ 5 ครั้งแล้ว ขอรหัสใหม่ได้เลย", "That code has had its 5 tries. Ask for a new one.");
  return t("รหัสไม่ถูกต้อง ลองดูอีกครั้ง", "That code isn't right. Check it and try again.");
}

function EmailForm(props: { t: View["t"]; action: string; next?: string; value?: string; error?: string; label?: string; button: string }) {
  const { t } = props;
  return (
    <Card>
      <form method="post" action={props.action}>
        {props.next !== undefined ? <input type="hidden" name="next" value={props.next} /> : null}
        <Field label={props.label ?? t("อีเมล", "Email")} name="email" type="email" inputmode="email" autocomplete="email" required maxlength={254} value={props.value} error={props.error} />
        <Button>{props.button}</Button>
      </form>
    </Card>
  );
}

function CodeForm(props: { t: View["t"]; action: string; resend: string; email: string; next?: string; error?: string; button: string }) {
  const { t } = props;
  return (
    <>
      <Card>
        <form method="post" action={props.action}>
          <input type="hidden" name="email" value={props.email} />
          {props.next !== undefined ? <input type="hidden" name="next" value={props.next} /> : null}
          <Field
            label={t("รหัส 6 หลัก", "6-digit code")}
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength={6}
            required
            error={props.error}
            hint={t("ใช้ได้ 10 นาที ลองได้ 5 ครั้ง", "Works for 10 minutes, 5 tries.")}
          />
          <Button>{props.button}</Button>
        </form>
      </Card>
      <form method="post" action={props.resend} class="code-resend">
        <input type="hidden" name="email" value={props.email} />
        {props.next !== undefined ? <input type="hidden" name="next" value={props.next} /> : null}
        <p class="muted">{t("ไม่ได้รับรหัส? ดูในโฟลเดอร์สแปมก่อน หรือ", "No code? Check your spam folder first, or")}</p>
        <Button kind="ghost">{t("ส่งรหัสใหม่", "Send a new code")}</Button>
      </form>
    </>
  );
}

// ------------------------------------------------------------- sign in --

function SignInEmailPage(c: C, opts: { next: string; value?: string; error?: string; status?: 200 | 400 }) {
  const { t } = view(c);
  return page(
    c,
    { title: t("เข้าสู่ระบบด้วยรหัส", "Sign in with a code"), status: opts.status },
    <>
      <h1>{t("เข้าสู่ระบบด้วยรหัส", "Sign in with a code")}</h1>
      <p class="muted">{t("ใส่อีเมลที่ผูกไว้ในหน้า ฉัน แล้วเราจะส่งรหัส 6 หลักไปให้", "Enter the email you linked on your Me page, and we'll send you a 6-digit code.")}</p>
      <EmailForm t={t} action="/login/code" next={opts.next} value={opts.value} error={opts.error} button={t("ส่งรหัส", "Send me a code")} />
      <p>
        <a href={opts.next ? `/login?next=${encodeURIComponent(opts.next)}` : "/login"}>{t("เข้าสู่ระบบด้วยรหัสผ่านแทน", "Sign in with a password instead")}</a>
      </p>
    </>,
  );
}

function SignInCodePage(c: C, opts: { email: string; next: string; error?: string; status?: 200 | 400 }) {
  const { t } = view(c);
  return page(
    c,
    { title: t("เข้าสู่ระบบด้วยรหัส", "Sign in with a code"), status: opts.status },
    <>
      <h1>{t("ใส่รหัสจากอีเมล", "Enter the code from your email")}</h1>
      {/* The same words whether or not the address has an account. */}
      <Notice kind="info">{t("ถ้าอีเมลนี้ผูกกับบัญชี Jurrgun ไว้ เราส่งรหัส 6 หลักไปให้แล้ว", "If this email is linked to a Jurrgun account, we've sent it a 6-digit code.")}</Notice>
      <CodeForm t={t} action="/login/code/verify" resend="/login/code" email={opts.email} next={opts.next} error={opts.error} button={t("เข้าสู่ระบบ", "Sign in")} />
    </>,
  );
}

emailCodeRoutes.get("/login/code", (c) => {
  const { user } = view(c);
  const next = safeNext(c.req.query("next"), "");
  if (user) return c.redirect(next || "/events");
  return SignInEmailPage(c, { next });
});

emailCodeRoutes.post("/login/code", async (c) => {
  const { t, lang } = view(c);
  const body = await c.req.parseBody();
  const next = safeNext(str(body.next), "");
  const raw = str(body.email);
  const email = normalizeEmail(raw);
  if (!email) return SignInEmailPage(c, { next, value: raw.slice(0, 254), error: t("อีเมลนี้ดูไม่ถูกต้อง", "That doesn't look like an email address."), status: 400 });
  const ip = await ipKey(c);
  const sent = await requestCode(c.env, { email, ipHash: ip.ipHash, ipKnown: ip.known, lang, purpose: "login", defer: deferOf(c) });
  if (sent === "throttled") return tooMany(c, "login");
  return SignInCodePage(c, { email, next });
});

emailCodeRoutes.post("/login/code/verify", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
  const next = safeNext(str(body.next), "");
  const email = normalizeEmail(str(body.email));
  if (!email) return SignInEmailPage(c, { next, status: 400 });
  const now = new Date();
  const ip = await ipKey(c);
  const hash = await emailHash(c.env, email);
  // Checked first, so a locked address never gets its code compared.
  if (await loginThrottled(c, attemptKey(hash), ip, now)) return tooMany(c, "login");
  const db = getDb(c.env);
  const result = await checkCode(c.env, email, str(body.code), now);
  const [acct] = result.ok
    ? await db.select({ account: accounts }).from(emailLinks).innerJoin(accounts, eq(accounts.id, emailLinks.accountId)).where(eq(emailLinks.emailHash, hash)).limit(1)
    : [];
  if (!acct) {
    await db.insert(loginAttempts).values({ id: newId(), username: attemptKey(hash), ipHash: ip.ipHash, createdAt: now });
    return SignInCodePage(c, { email, next, error: codeError(t, result.ok ? "wrong" : result.reason), status: 400 });
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.username, attemptKey(hash)));
  return signIn(c, acct.account, next, (msg, status) =>
    page(
      c,
      { title: t("เข้าสู่ระบบ", "Sign in"), status },
      <>
        <h1>{t("ยินดีต้อนรับกลับมา", "Welcome back")}</h1>
        <Notice kind="error">{msg}</Notice>
      </>,
    ),
  );
});

// ------------------------------------------------------------ settings --

async function SettingsEmailPage(c: C, opts: { value?: string; error?: string; done?: "linked" | "removed"; status?: 200 | 400 | 409 }) {
  const v = view(c);
  const { t, lang } = v;
  const [link] = await getDb(c.env).select().from(emailLinks).where(eq(emailLinks.accountId, v.user!.account.id)).limit(1);
  return page(
    c,
    { title: t("อีเมลสำหรับเข้าสู่ระบบ", "Sign-in email"), tab: "me", status: opts.status },
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("อีเมลสำหรับเข้าสู่ระบบ", "Sign-in email")}</h1>
      {opts.done === "linked" ? <Notice kind="ok">{t("ผูกอีเมลแล้ว ครั้งหน้าเข้าสู่ระบบด้วยรหัสได้เลย", "Email linked. Next time you can sign in with a code.")}</Notice> : null}
      {opts.done === "removed" ? <Notice kind="ok">{t("เลิกใช้อีเมลนี้แล้ว", "Email removed.")}</Notice> : null}
      <p>{t("ผูกอีเมลไว้ แล้วเข้าสู่ระบบด้วยรหัส 6 หลักที่เราส่งไปให้ ไม่ต้องจำรหัสผ่าน", "Link an email, then sign in with a 6-digit code we send to it. No password to remember.")}</p>
      <p class="muted">
        {t(
          "เราเก็บอีเมลแบบเข้ารหัสทางเดียวเท่านั้น จึงไม่มีใครอ่านได้ ทีมงานก็ไม่เห็น และเราส่งแค่รหัสไปที่อีเมลนี้",
          "We keep only a one-way hash of it, so nobody can read it, staff included. We only ever email it codes.",
        )}
      </p>
      {link ? (
        <Card>
          <p class="email-linked">
            <strong>✓ {t("ผูกอีเมลไว้แล้ว", "Email linked")}</strong>
            {link.verifiedAt ? <small class="muted">{t(`ยืนยันเมื่อ ${fmtDay(link.verifiedAt, lang)}`, `Confirmed ${fmtDay(link.verifiedAt, lang)}`)}</small> : null}
            <small class="muted">{t("เราอ่านอีเมลไม่ได้ จึงแสดงที่นี่ไม่ได้", "We can't read it, so we can't show it here.")}</small>
          </p>
          <form method="post" action="/settings/email/remove">
            <Button kind="ghost">{t("เลิกใช้อีเมลนี้", "Remove this email")}</Button>
          </form>
        </Card>
      ) : null}
      <h2>{link ? t("เปลี่ยนอีเมล", "Change email") : t("เพิ่มอีเมล", "Add an email")}</h2>
      <EmailForm t={t} action="/settings/email" value={opts.value} error={opts.error} label={link ? t("อีเมลใหม่", "New email") : t("อีเมล", "Email")} button={t("ส่งรหัสยืนยัน", "Send a code")} />
    </>,
  );
}

function SettingsCodePage(c: C, opts: { email: string; error?: string; status?: 200 | 400 }) {
  const { t } = view(c);
  return page(
    c,
    { title: t("อีเมลสำหรับเข้าสู่ระบบ", "Sign-in email"), tab: "me", status: opts.status },
    <>
      <p>
        <a href="/settings/email">← {t("อีเมลสำหรับเข้าสู่ระบบ", "Sign-in email")}</a>
      </p>
      <h1>{t("ยืนยันอีเมล", "Confirm your email")}</h1>
      <Notice kind="info">{t("เราส่งรหัส 6 หลักไปที่อีเมลนี้แล้ว", "We've sent a 6-digit code to this email.")}</Notice>
      <CodeForm t={t} action="/settings/email/verify" resend="/settings/email" email={opts.email} error={opts.error} button={t("ยืนยันอีเมล", "Confirm email")} />
    </>,
  );
}

emailCodeRoutes.get("/settings/email", (c) => {
  const done = c.req.query("done");
  return SettingsEmailPage(c, { done: done === "linked" || done === "removed" ? done : undefined });
});

emailCodeRoutes.post("/settings/email", async (c) => {
  const { t, lang } = view(c);
  const body = await c.req.parseBody();
  const raw = str(body.email);
  const email = normalizeEmail(raw);
  if (!email) return SettingsEmailPage(c, { value: raw.slice(0, 254), error: t("อีเมลนี้ดูไม่ถูกต้อง", "That doesn't look like an email address."), status: 400 });
  const ip = await ipKey(c);
  const sent = await requestCode(c.env, { email, ipHash: ip.ipHash, ipKnown: ip.known, lang, purpose: "link" });
  if (sent === "throttled") return tooMany(c, "login");
  return SettingsCodePage(c, { email });
});

emailCodeRoutes.post("/settings/email/verify", async (c) => {
  const { t, user } = view(c);
  const id = user!.account.id;
  const body = await c.req.parseBody();
  const email = normalizeEmail(str(body.email));
  if (!email) return c.redirect("/settings/email");
  const now = new Date();
  const ip = await ipKey(c);
  const hash = await emailHash(c.env, email);
  if (await loginThrottled(c, attemptKey(hash), ip, now)) return tooMany(c, "login");
  const db = getDb(c.env);
  const result = await checkCode(c.env, email, str(body.code), now);
  if (!result.ok) {
    await db.insert(loginAttempts).values({ id: newId(), username: attemptKey(hash), ipHash: ip.ipHash, createdAt: now });
    return SettingsCodePage(c, { email, error: codeError(t, result.reason), status: 400 });
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.username, attemptKey(hash)));
  // They proved they own the address, so saying it's taken tells them nothing new.
  const [owner] = await db.select({ accountId: emailLinks.accountId }).from(emailLinks).where(eq(emailLinks.emailHash, hash)).limit(1);
  if (owner && owner.accountId !== id) return SettingsEmailPage(c, { error: t("อีเมลนี้ผูกกับบัญชีอื่นอยู่แล้ว", "This email is already linked to another account."), status: 409 });
  try {
    // One sign-in email per member: a new one replaces the old.
    await batch(c.env, [
      db.delete(emailLinks).where(eq(emailLinks.accountId, id)),
      db.insert(emailLinks).values({ id: newId(), accountId: id, emailHash: hash, verifiedAt: now, createdAt: now }),
      audit(db, id, "email.linked", { type: "account", id }),
    ]);
  } catch {
    // Unique index race: another account linked it between the check and the insert.
    return SettingsEmailPage(c, { error: t("อีเมลนี้ผูกกับบัญชีอื่นอยู่แล้ว", "This email is already linked to another account."), status: 409 });
  }
  return c.redirect("/settings/email?done=linked");
});

emailCodeRoutes.post("/settings/email/remove", async (c) => {
  const id = view(c).user!.account.id;
  const db = getDb(c.env);
  await batch(c.env, [db.delete(emailLinks).where(eq(emailLinks.accountId, id)), audit(db, id, "email.removed", { type: "account", id })]);
  return c.redirect("/settings/email?done=removed");
});
