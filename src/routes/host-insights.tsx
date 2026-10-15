/**
 * For hosts (circle heads, verified partners, admins):
 *
 *   GET /host/insights   how my events went: show-up, felt safe, felt heard,
 *                        would meet again, return rate. Only my own events;
 *                        every figure is hidden under 5 people (HOST_K).
 *   GET /host/ideas      what members want and can't find yet: preferences
 *                        (activities, budget, times) by district against the
 *                        events on offer, only where 10+ members share it.
 *
 * Aggregates only. No names, no rows about a person, no rankings of people.
 */
import { Hono } from "hono";
import { and, desc, eq, gt, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { canHost } from "../domain/hosting";
import { countsAtLeast, feedbackSummary, HOST_K, returnRate, showUpRate } from "../domain/outcomes";
import { K_THRESHOLD } from "../domain/rules";
import { ACTIVITIES, cleanBio } from "../content/profile";
import { DISTRICTS, label } from "../lib/constants";
import type { AppEnv } from "../lib/env";
import { fmtDate, L } from "../lib/i18n";
import { requireUser } from "../lib/session";
import { events, feedback, profiles, registrations } from "../schema";
import { Card, Empty, LinkButton, Notice, page, Stat, view } from "../ui/kit";

export const hostInsightRoutes = new Hono<AppEnv>();
hostInsightRoutes.use("/host/insights", requireUser);
hostInsightRoutes.use("/host/ideas", requireUser);

const DAY = 86_400_000;

hostInsightRoutes.get("/host/insights", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = c.var.user!;
  if (!canHost(user.account, !!user.profile?.onboardedAt)) return c.redirect("/circles/lead");
  const db = getDb(c.env);
  const now = new Date();
  const me = user.account.id;
  const mine = await db
    .select()
    .from(events)
    .where(
      and(
        user.account.role === "partner_admin" && user.account.partnerOrgId
          ? or(eq(events.hostAccountId, me), eq(events.partnerOrgId, user.account.partnerOrgId))
          : eq(events.hostAccountId, me),
        lt(events.endsAt, now),
        gte(events.endsAt, new Date(now.getTime() - 180 * DAY)),
      ),
    )
    .orderBy(desc(events.startsAt))
    .limit(100);
  const ids = mine.map((e) => e.id);
  const [regs, fbs] = await Promise.all([
    ids.length
      ? db.select({ eventId: registrations.eventId, accountId: registrations.accountId, status: registrations.status, checkedInAt: registrations.checkedInAt }).from(registrations).where(inArray(registrations.eventId, ids)).limit(5000)
      : [],
    ids.length
      ? db.select({ eventId: feedback.eventId, feltSafe: feedback.feltSafe, feltHeard: feedback.feltHeard, wouldMeetAgain: feedback.wouldMeetAgain, metNewPerson: feedback.metNewPerson }).from(feedback).where(inArray(feedback.eventId, ids)).limit(5000)
      : [],
  ]);
  const confirmed = regs.filter((r) => r.status === "confirmed" || r.checkedInAt);
  const came = regs.filter((r) => r.checkedInAt);
  const all = feedbackSummary(fbs, HOST_K);
  const show = showUpRate(came.length, confirmed.length, HOST_K);
  const back = returnRate(came.map((r) => ({ accountId: r.accountId })), HOST_K);
  const fmt = (x: number | null, unit = "%") => (x === null ? null : `${x}${unit}`);
  return page(
    c,
    { title: t("ผลลัพธ์กิจกรรมของฉัน", "How my events went"), tab: "me" },
    <>
      <p class="spread">
        <a href="/host">← {t("กิจกรรมที่ฉันจัด", "My hosted events")}</a>
        <a href="/host/ideas">💡 {t("ไอเดียจัดกิจกรรม", "Ideas")}</a>
      </p>
      <h1>📈 {t("ผลลัพธ์กิจกรรมของฉัน", "How my events went")}</h1>
      <Notice kind="info">
        {t(
          `6 เดือนที่ผ่านมา ตัวเลขที่มีคนน้อยกว่า ${HOST_K} คนจะซ่อนไว้ เพื่อไม่ให้ระบุตัวคนได้`,
          `The last 6 months. Anything based on fewer than ${HOST_K} people is hidden, so nobody can be identified.`,
        )}
      </Notice>
      {mine.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมที่จบแล้ว", "No finished events yet.")}</Empty>
      ) : (
        <>
          <div class="stats">
            <Stat label={t("มาตามนัด", "Showed up")} value={fmt(show)} hint={`${t("กิจกรรม", "events")}: ${mine.length}`} />
            <Stat label={t("รู้สึกปลอดภัย (4-5)", "Felt safe (4-5)")} value={fmt(all.feltSafePct)} />
            <Stat label={t("รู้สึกว่ามีคนฟัง (1-5)", "Felt heard (1-5)")} value={all.feltHeardAvg === null ? null : String(all.feltHeardAvg)} />
            <Stat label={t("อยากเจอใครสักคนอีก", "Would meet someone again")} value={fmt(all.againPct)} />
            <Stat label={t("ได้รู้จักคนใหม่", "Met someone new")} value={fmt(all.metNewPct)} />
            <Stat label={t("กลับมาอีก (2+ ครั้ง)", "Came back (2+ events)")} value={fmt(back)} />
          </div>
          <h2>{t("แต่ละกิจกรรม", "Each event")}</h2>
          {mine.map((e) => {
            const r = regs.filter((x) => x.eventId === e.id);
            const s = feedbackSummary(fbs.filter((f) => f.eventId === e.id), HOST_K);
            const conf = r.filter((x) => x.status === "confirmed" || x.checkedInAt).length;
            const ci = r.filter((x) => x.checkedInAt).length;
            return (
              <Card>
                <strong>{lang === "en" ? (e.titleEn ?? e.title) : e.title}</strong>
                <p class="muted">{fmtDate(e.startsAt, lang)} · 📍 {label(DISTRICTS, e.district, lang)}</p>
                <p class="chips2">
                  <span>🎟️ {t(`มา ${showUpRate(ci, conf, HOST_K) ?? "<5"}%`, `Showed up ${showUpRate(ci, conf, HOST_K) ?? "<5"}%`)}</span>
                  <span>🛡️ {t("ปลอดภัย", "Safe")} {s.feltSafePct ?? "—"}{s.feltSafePct === null ? "" : "%"}</span>
                  <span>👂 {t("มีคนฟัง", "Heard")} {s.feltHeardAvg ?? "—"}</span>
                  <span>📝 {t(`ตอบ ${s.responses}`, `${s.responses} answers`)}</span>
                </p>
              </Card>
            );
          })}
        </>
      )}
    </>,
  );
});

hostInsightRoutes.get("/host/ideas", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = c.var.user!;
  if (!canHost(user.account, !!user.profile?.onboardedAt)) return c.redirect("/circles/lead");
  const db = getDb(c.env);
  const now = new Date();
  const [people, upcoming] = await Promise.all([
    db.select({ district: profiles.district, bio: profiles.bio }).from(profiles).where(isNotNull(profiles.onboardedAt)).limit(20000),
    db
      .select({ district: events.district, tags: events.tags })
      .from(events)
      .where(and(eq(events.status, "published"), gt(events.startsAt, now), lt(events.startsAt, new Date(now.getTime() + 30 * DAY))))
      .limit(2000),
  ]);
  // Demand: one key per member per activity they chose, in their home district.
  const keys: string[] = [];
  const budgetKeys: string[] = [];
  for (const p of people) {
    const b = cleanBio(p.bio);
    for (const a of b.activities ?? []) keys.push(`${p.district}|${a}`);
    if (b.budget === "free" || b.budget === "150") budgetKeys.push(p.district);
  }
  const supply = new Map<string, number>();
  for (const e of upcoming) for (const tag of e.tags) supply.set(`${e.district}|${tag}`, (supply.get(`${e.district}|${tag}`) ?? 0) + 1);
  const gaps = countsAtLeast(keys, K_THRESHOLD)
    .map(([k, n]) => ({ district: k.split("|")[0], activity: k.split("|")[1], n, offered: supply.get(k) ?? 0 }))
    .filter((g) => g.offered <= 1)
    .slice(0, 12);
  const lowCost = countsAtLeast(budgetKeys, K_THRESHOLD).slice(0, 5);
  return page(
    c,
    { title: t("ไอเดียจัดกิจกรรม", "Ideas for hosts"), tab: "me" },
    <>
      <p class="spread">
        <a href="/host">← {t("กิจกรรมที่ฉันจัด", "My hosted events")}</a>
        <a href="/host/insights">📈 {t("ผลลัพธ์", "How it went")}</a>
      </p>
      <h1>💡 {t("คนอยากทำอะไร แต่ยังหาไม่เจอ", "What people want and can't find yet")}</h1>
      <p class="muted">
        {t(
          `จากสิ่งที่สมาชิกบอกเราในโปรไฟล์ เทียบกับกิจกรรม 30 วันข้างหน้า แสดงเฉพาะที่มีคน ${K_THRESHOLD} คนขึ้นไป`,
          `From what members told us in their profiles, against the next 30 days of events. Only shown where ${K_THRESHOLD}+ people share it.`,
        )}
      </p>
      {gaps.length === 0 ? (
        <Empty>{t("ยังไม่มีข้อมูลพอ", "Not enough answers yet.")}</Empty>
      ) : (
        gaps.map((g) => {
          const act = ACTIVITIES.find((a) => a.value === g.activity);
          const title = act ? L(lang, act) : g.activity;
          return (
            <Card>
              <strong>
                {act?.emoji} {title} · 📍 {label(DISTRICTS, g.district, lang)}
              </strong>
              <p class="muted">
                {t(`สมาชิก ${g.n} คนอยากได้ มีกิจกรรมแบบนี้ ${g.offered} งาน`, `${g.n} members want this; ${g.offered} such events coming up.`)}
              </p>
              <LinkButton href={`/host/new?district=${encodeURIComponent(g.district)}&title=${encodeURIComponent(title)}`} kind="ghost">
                {t("จัดอันนี้", "Host this")}
              </LinkButton>
            </Card>
          );
        })
      )}
      {lowCost.length ? (
        <Card class="hint">
          <strong>🪙 {t("งบน้อยก็อยากออกมาเจอ", "Low budget, still keen")}</strong>
          <p class="muted">
            {lowCost.map(([d, n]) => t(`${label(DISTRICTS, d, "th")} ${n} คน`, `${label(DISTRICTS, d, "en")}: ${n}`)).join(" · ")}
            {" · "}
            {t("ลองจัดกิจกรรมฟรีหรือไม่เกิน ฿150", "Try a free or under-฿150 event.")}
          </p>
        </Card>
      ) : null}
    </>,
  );
});
