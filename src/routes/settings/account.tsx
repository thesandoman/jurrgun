/**
 * Settings, account part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { EXIT_REASONS } from "../../content/dating";
import { deleteCookie, getCookie } from "hono/cookie";
import type { Context } from "hono";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { AppEnv } from "../../lib/env";
import { fmtDay } from "../../lib/i18n";
import { batch, getDb } from "../../db";
import { isPasswordless, passwordProblem } from "../../domain/rules";
import { cleanBio } from "../../content/profile";
import { hashPassword, newId, sha256, verifyPassword } from "../../lib/crypto";
import { audit } from "../../lib/records";
import { SESSION_COOKIE } from "../../lib/session";
import { accounts, exitReasons, pushSubscriptions, oauthLinks, emailLinks, profileLinks, profiles, sessions } from "../../schema";
import { attemptUser, ipKey, loginThrottled, recordFailure } from "../auth";
import { deleteObject } from "../../storage";
import { Button, Field, list, Notice, page, str, view, type View } from "../../ui/kit";
import { researchWithdrawn } from "../../services/consent";
import { releaseUpcomingSeats } from "../../services/events";
import { endPinkies } from "../../services/pinky";
import { settingsRoutes } from "./app";
import { PrivacyCenter } from "./privacy";
import { currentConsents, me } from "./shared";

// ----------------------------------------------------------- deactivate --

settingsRoutes.post("/settings/deactivate", async (c) => {
  const v = view(c);
  const user = me(c);
  const body = await c.req.parseBody({ all: true });
  if (str(body.confirm) !== "1") {
    const current = await currentConsents(c, user.account.id);
    return page(
      c,
      { title: v.t("ศูนย์ความเป็นส่วนตัว", "Privacy centre"), tab: "me", status: 400 },
      <>
        <Notice kind="error">{v.t("ติ๊กยืนยันก่อนปิดบัญชี", "Please tick the box to confirm deactivation.")}</Notice>
        <PrivacyCenter v={v} current={current} />
      </>,
    );
  }
  const db = getDb(c.env);
  const id = user.account.id;
  // Why they left: anonymous (no account id), only if they said something.
  const reasons = [...new Set(list(body.reasons))].filter((r) => EXIT_REASONS.some((o) => o.value === r));
  const exitNote = str(body.exitNote).slice(0, 500);
  if (reasons.length || exitNote) await db.insert(exitReasons).values({ id: newId(), reasons, note: exitNote });
  const photoKey = user.profile?.photoKey ?? null;
  const promptPhotos = Object.values(cleanBio(user.profile?.bio).answers ?? {})
    .map((a) => a.photoKey)
    .filter((k): k is string => !!k);
  await batch(c.env, [
    db.update(accounts).set({ status: "deactivated", deactivatedAt: new Date() }).where(eq(accounts.id, id)),
    // City Pulse and wellbeing answers go now, as on research withdrawal, and the research_id is
    // cut. Deleting them later isn't possible: once the code is cut nothing links them to the account.
    ...researchWithdrawn(db, id, user.account.researchId),
    db.update(profiles).set({ photoKey: null, bio: {}, updatedAt: new Date() }).where(eq(profiles.accountId, id)),
    db.delete(sessions).where(eq(sessions.accountId, id)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.accountId, id)),
    // Unlink Google / LINE now: signing in with them again starts a fresh account.
    db.delete(oauthLinks).where(eq(oauthLinks.accountId, id)),
    db.delete(emailLinks).where(eq(emailLinks.accountId, id)),
    // Social links go at once; the switch's history stays with the other consents until deletion.
    db.delete(profileLinks).where(eq(profileLinks.accountId, id)),
    // Pinky ends at once, not at final deletion: Pinky taps withdrawn, any Pinky goes back to friends,
    // and its plan and Pinky-period chat are deleted (held while a report between them is open).
    ...endPinkies(db, id),
    audit(db, id, "account.deactivated", { type: "account", id }),
  ]);
  await releaseUpcomingSeats(c.env, id);
  for (const k of [...(photoKey ? [photoKey] : []), ...promptPhotos]) await deleteObject(c.env, k).catch(() => {});
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/?notice=deactivated");
});

// ------------------------------------------------------------- password --

function PasswordForm(props: { v: View; error?: string }) {
  const { t } = props.v;
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("เปลี่ยนรหัสผ่าน", "Change password")}</h1>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        <Field label={t("รหัสผ่านปัจจุบัน", "Current password")} name="current" type="password" required autocomplete="current-password"  reveal={{ show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") }} />
        <Field label={t("รหัสผ่านใหม่", "New password")} name="password" type="password" required autocomplete="new-password" hint={t("อย่างน้อย 8 ตัวอักษร", "At least 8 characters")}  reveal={{ show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") }} />
        <Field label={t("ยืนยันรหัสผ่านใหม่", "Confirm new password")} name="confirm" type="password" required autocomplete="new-password"  reveal={{ show: t("แสดง", "Show"), hide: t("ซ่อน", "Hide"), caps: t("Caps Lock เปิดอยู่", "Caps Lock is on") }} />
        <Button>{t("เปลี่ยนรหัสผ่าน", "Change password")}</Button>
      </form>
    </>
  );
}

settingsRoutes.use("/settings/password", async (c, next) => {
  if (isPasswordless(me(c).account.username)) return c.redirect("/settings");
  await next();
});

settingsRoutes.get("/settings/password", (c) => page(c, { title: view(c).t("เปลี่ยนรหัสผ่าน", "Change password"), tab: "me" }, <PasswordForm v={view(c)} />));

settingsRoutes.post("/settings/password", async (c) => {
  const v = view(c);
  const { t } = v;
  const user = me(c);
  const body = await c.req.parseBody();
  const current = typeof body.current === "string" ? body.current : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const fail = (error: string) => page(c, { title: t("เปลี่ยนรหัสผ่าน", "Change password"), tab: "me", status: 400 }, <PasswordForm v={v} error={error} />);
  // The current-password check uses the sign-in throttle (same counter, same 15 minutes),
  // so a stolen session can't be used to guess the password.
  const now = new Date();
  const ip = await ipKey(c);
  const attempt = await attemptUser(c, user.account.username);
  if (await loginThrottled(c, attempt, ip, now)) {
    return fail(t("ลองหลายครั้งเกินไปแล้ว รอ 15 นาทีแล้วลองใหม่", "Too many attempts. Try again in 15 minutes."));
  }
  if (!(await verifyPassword(current, user.account.passwordHash, user.account.passwordSalt))) {
    await recordFailure(c, attempt, ip, now);
    return fail(t("รหัสผ่านปัจจุบันไม่ถูกต้อง", "Your current password is incorrect."));
  }
  if (passwordProblem(password)) return fail(t("รหัสผ่านต้องยาว 8 ถึง 200 ตัวอักษร", "Password must be 8 to 200 characters."));
  if (password !== confirm) return fail(t("รหัสผ่านไม่ตรงกัน", "Passwords don't match."));
  const { hash, salt } = await hashPassword(password);
  const db = getDb(c.env);
  const thisSession = await currentSessionId(c);
  await batch(c.env, [
    db.update(accounts).set({ passwordHash: hash, passwordSalt: salt }).where(eq(accounts.id, user.account.id)),
    signOutOthers(db, user.account.id, thisSession),
    audit(db, user.account.id, "account.password_changed", { type: "account", id: user.account.id }),
  ]);
  return c.redirect("/settings?notice=password_changed");
});

/** This browser's session id (the hash of its cookie). */
async function currentSessionId(c: Context<AppEnv>): Promise<string> {
  return sha256(getCookie(c, SESSION_COOKIE) ?? "");
}

/** Every OTHER session of this account; this device stays signed in. Shared by password change and the devices page. */
function signOutOthers(db: ReturnType<typeof getDb>, accountId: string, thisSession: string) {
  return db.delete(sessions).where(and(eq(sessions.accountId, accountId), ne(sessions.id, thisSession)));
}

// -------------------------------------------------------- signed-in devices (card S4) --

const DEVICE_LABEL: Record<string, [string, string, string]> = {
  phone: ["📱", "มือถือ", "Phone"],
  tablet: ["📲", "แท็บเล็ต", "Tablet"],
  computer: ["💻", "คอมพิวเตอร์", "Computer"],
};

settingsRoutes.get("/settings/devices", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const thisSession = await currentSessionId(c);
  const rows = await getDb(c.env)
    .select({ id: sessions.id, device: sessions.device, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.accountId, user.account.id), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt))
    .limit(50);
  const others = rows.filter((r) => r.id !== thisSession).length;
  return page(
    c,
    { title: t("อุปกรณ์ที่เข้าสู่ระบบ", "Signed-in devices"), tab: "me" },
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("อุปกรณ์ที่เข้าสู่ระบบ", "Signed-in devices")}</h1>
      <p class="muted">
        {t(
          "เราเก็บแค่ประเภทอุปกรณ์และวันที่ ไม่เก็บ IP หรือตำแหน่ง ถ้าไม่ได้ใช้ 14 วัน จะออกจากระบบให้เอง",
          "We keep only the kind of device and the dates, never an IP address or location. A device unused for 14 days is signed out by itself.",
        )}
      </p>
      <ul class="list" id="devices">
        {rows.map((r) => {
          const [emoji, th, en] = DEVICE_LABEL[r.device ?? ""] ?? ["🔐", "อุปกรณ์", "Device"];
          return (
            <li data-device={r.device ?? "unknown"}>
              <b>
                <span aria-hidden="true">{emoji}</span> {t(th, en)}
              </b>
              {r.id === thisSession ? <> · {t("เครื่องนี้", "This device")}</> : null}
              <br />
              <small class="muted">
                {t("เข้าสู่ระบบ", "Signed in")} {fmtDay(r.createdAt, lang)}
                {r.lastSeenAt ? ` · ${t("ใช้ล่าสุด", "Last used")} ${fmtDay(r.lastSeenAt, lang)}` : ""}
              </small>
            </li>
          );
        })}
      </ul>
      {others > 0 ? (
        <form method="post" action="/settings/devices/sign-out-others">
          <Button kind="ghost">{t(`ออกจากระบบในอุปกรณ์อื่นทั้งหมด (${others})`, `Sign out on all other devices (${others})`)}</Button>
        </form>
      ) : (
        <p class="muted">{t("ไม่มีอุปกรณ์อื่นที่เข้าสู่ระบบอยู่", "No other devices are signed in.")}</p>
      )}
    </>,
  );
});

settingsRoutes.post("/settings/devices/sign-out-others", async (c) => {
  const user = me(c);
  const db = getDb(c.env);
  await batch(c.env, [
    signOutOthers(db, user.account.id, await currentSessionId(c)),
    audit(db, user.account.id, "account.signed_out_others", { type: "account", id: user.account.id }),
  ]);
  return c.redirect("/settings/devices?notice=signed_out_others");
});

