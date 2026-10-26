/**
 * Settings, dating part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { DEFAULT_RHYTHM, isPaused, PAUSE_WEEKS, RHYTHMS } from "../../domain/rules";
import { DatingPrefSteps, prefsFromBody } from "../onboarding";
import { Flow } from "../../ui/flow";
import { cleanPrefs } from "../../content/dating";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { cleanBio } from "../../content/profile";
import { datingIntents, profiles } from "../../schema";
import { Button, Card, Notice, page, str, view } from "../../ui/kit";
import { hasConsent, ROMANCE_CONSENT } from "../../services/consent";
import { fmtDate } from "../../lib/i18n";
import { settingsRoutes } from "./app";
import { me } from "./shared";

// ------------------------------------------------------------- dating --

settingsRoutes.get("/settings/dating", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const [row] = await getDb(c.env).select().from(datingIntents).where(eq(datingIntents.accountId, me(c).account.id)).limit(1);
  if (!row || row.mode === "friends") return c.redirect("/settings");
  return page(
    c,
    { title: t("สิ่งที่มองหาในการเดต", "Dating preferences"), bare: true },
    <Flow v={v} action="/settings/dating" submit={t("บันทึก", "Save")} close="/settings">
      <DatingPrefSteps t={t} lang={lang} prefs={cleanPrefs(row.prefs)} />
    </Flow>,
  );
});

settingsRoutes.post("/settings/dating", async (c) => {
  const prefs = prefsFromBody(await c.req.parseBody({ all: true }));
  // R1: never saved without the romance_data consent.
  if (!(await hasConsent(getDb(c.env), me(c).account.id, ROMANCE_CONSENT))) return c.redirect("/settings");
  await getDb(c.env)
    .update(datingIntents)
    .set({ prefs, updatedAt: new Date() })
    .where(eq(datingIntents.accountId, me(c).account.id));
  return c.redirect("/settings?notice=saved");
});

// ------------------------------------------------------------ habits --

settingsRoutes.get("/settings/habits", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const p = me(c).profile!;
  const rhythm = cleanBio(p.bio).rhythm ?? DEFAULT_RHYTHM;
  const paused = isPaused(p);
  return page(
    c,
    { title: t("นิสัยดี ๆ", "Healthy habits"), tab: "me" },
    <>
      <p class="spread">
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>🌿 {t("นิสัยดี ๆ และการพัก", "Healthy habits")}</h1>
      <p class="muted">{t("Jurrgun อยากให้คุณใช้แอปน้อยลง และเจอคนจริงมากขึ้น", "Jurrgun wants you on the app less, and with people more.")}</p>
      {c.req.query("notice") === "saved" ? <Notice kind="ok">{t("บันทึกแล้ว", "Saved")}</Notice> : null}
      <Card>
        <h2 style="margin-top:0" id="rhythm-h">🗓️ {t("นัดกี่ครั้งต่อสัปดาห์กำลังดี", "How many plans a week feel right?")}</h2>
        <p class="muted">{t("ถ้าเกินนี้ เราจะถามคุณก่อน 1 ครั้ง แต่ไม่ได้ห้าม", "Past this, we'll check with you once. Never a block.")}</p>
        <form method="post" action="/settings/habits">
          <div class="pills" role="radiogroup" aria-labelledby="rhythm-h">
            {RHYTHMS.map((n) => (
              <label class="pill">
                <input type="radio" name="rhythm" value={String(n)} checked={n === rhythm} />
                <span>{lang === "en" ? `${n} a week` : `สัปดาห์ละ ${n}`}</span>
              </label>
            ))}
          </div>
          <Button>{t("บันทึก", "Save")}</Button>
        </form>
      </Card>
      <Card>
        <h2 style="margin-top:0">⏸️ {t("พัก Jurrgun", "Take a break")}</h2>
        {paused ? (
          <>
            <p>{t(`พักอยู่ถึง ${fmtDate(p.pausedUntil!, lang)} ไม่มีการจับคู่บัดดี้ใหม่ระหว่างนี้ คนรู้จักและแชตยังอยู่`, `On a break until ${fmtDate(p.pausedUntil!, lang)}. No new buddy matches meanwhile; your people and chats stay.`)}</p>
            <form method="post" action="/settings/habits">
              <input type="hidden" name="pause" value="0" />
              <Button>{t("กลับมาแล้ว", "I'm back")}</Button>
            </form>
          </>
        ) : (
          <>
            <p class="muted">{t("หยุดจับคู่บัดดี้และการดูคนที่อาจเป็นบัดดี้ไว้ก่อน คนรู้จักและแชตยังอยู่ ลงทะเบียนกิจกรรมเมื่อไหร่ก็กลับมาใช้ได้ทันที", "Pauses buddy matching and possible buddies. Your people and chats stay. RSVP anytime to come back.")}</p>
            <form method="post" action="/settings/habits" class="row">
              {PAUSE_WEEKS.map((w) => (
                <button class="btn ghost" name="pause" value={String(w)}>
                  {lang === "en" ? `${w} week${w > 1 ? "s" : ""}` : `${w} สัปดาห์`}
                </button>
              ))}
            </form>
          </>
        )}
      </Card>
    </>,
  );
});

settingsRoutes.post("/settings/habits", async (c) => {
  const user = me(c);
  const body = await c.req.parseBody();
  const db = getDb(c.env);
  const rhythm = Number(str(body.rhythm));
  if ((RHYTHMS as readonly number[]).includes(rhythm)) {
    const bio = { ...cleanBio(user.profile!.bio), rhythm };
    await db.update(profiles).set({ bio, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  }
  const pause = str(body.pause);
  if (pause === "0") await db.update(profiles).set({ pausedUntil: null }).where(eq(profiles.accountId, user.account.id));
  else if ((PAUSE_WEEKS as readonly number[]).includes(Number(pause))) {
    await db.update(profiles).set({ pausedUntil: new Date(Date.now() + Number(pause) * 7 * 86_400_000) }).where(eq(profiles.accountId, user.account.id));
  }
  return c.redirect("/settings/habits?notice=saved");
});
