/**
 * Staff overview (/admin) — any staff role, content depends on the role.
 *
 *   bma_admin       pilot health at a glance
 *   host / partner  their next events
 *   moderator       open reports
 *   insight_viewer  a way into City Insight
 *
 * bma_admin and insight_viewer also see the north star trend: Weekly
 * Reconnected Members for each of the last 8 weeks (weeklyReconnectedTrend).
 * For insight viewers a week under k = 10 shows as "<10", as in City Insight.
 *
 * Operational counts only (events, registrations, reports); the k ≥ 10
 * research threshold applies on the Insights and City Pulse pages.
 *
 * bma_admin also sees data retention (PRD §12.4): a manual "Run retention
 * cleanup" button (POST /admin/retention), and a lazy run at most once per
 * 24 hours when they open this page (no cron on this platform).
 */
import { Hono } from "hono";
import { and, asc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import type { AppEnv } from "../../lib/env";
import { fmtDate } from "../../lib/i18n";
import { requireRole } from "../../lib/session";
import { K_THRESHOLD, safeCount } from "../../domain/rules";
import { retentionIfDue, runRetention, type RetentionRun } from "../../services/retention";
import { clockNext, startClock, stopClock } from "../../services/clock";
import { vapidKeys } from "../../services/push";
import { alias } from "drizzle-orm/pg-core";
import { connections, events, registrations, reports } from "../../schema";
import { Button, Card, Empty, LinkButton, page, Stat, Tag, view } from "../../ui/kit";
import type { Lang } from "../../lib/i18n";

export const adminDashboard = new Hono<AppEnv>();

const DAY = 86_400_000;

adminDashboard.post("/retention", requireRole("bma_admin"), async (c) => {
  await runRetention(c.env, new Date(), c.var.user!.account.id);
  return c.redirect("/admin?notice=done#retention");
});

/** The hourly clock (src/services/clock.ts): start once, stop any time. */
adminDashboard.post("/clock", requireRole("bma_admin"), async (c) => {
  const on = (await c.req.formData()).get("on") === "1";
  // Without the signing secret every webhook is refused and the chain would stop after one hour.
  if (on && !c.env.TASK_WEBHOOK_SECRET) return c.redirect("/admin?notice=clock_no_secret#clock");
  try {
    if (on) await startClock(c.env);
    else await stopClock(c.env);
  } catch {
    // Locally there are no stateful objects; the clock only runs deployed.
    return c.redirect("/admin?notice=clock_unavailable#clock");
  }
  return c.redirect("/admin?notice=done#clock");
});

function ClockCard(props: { next: number | null; push: boolean; t: (th: string, en: string) => string; lang: "th" | "en" }) {
  const { t } = props;
  return (
    <section id="clock">
      <h2>{t("นาฬิการายชั่วโมง", "Hourly clock")}</h2>
      <Card>
        <p class="muted">
          {t(
            "รันทุกชั่วโมง: ล้างข้อมูลตามระยะเวลาเก็บรักษาวันละครั้ง เตือนก่อนวันงาน และแจ้งเมื่อเลือกคนที่อยากเจออีกได้ ไม่ส่งข้อความช่วง 21:00 ถึง 08:00",
            "Runs every hour: retention once a day, the day-before reminder, and the note that People I Met is open. No messages from 21:00 to 08:00.",
          )}
        </p>
        <p>
          {props.next ? (
            <>
              <Tag tone="ok">{t("กำลังทำงาน", "Running")}</Tag> {t("รอบถัดไป ", "Next run ")}
              <strong>{new Intl.DateTimeFormat(props.lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(props.next))}</strong>
            </>
          ) : (
            <Tag tone="muted">{t("หยุดอยู่", "Stopped")}</Tag>
          )}
        </p>
        <p class="muted">
          {props.push
            ? t("การแจ้งเตือนบนมือถือ: เปิดแล้ว", "Phone notifications: on")
            : t("การแจ้งเตือนบนมือถือ: ยังไม่ได้ตั้งคีย์ VAPID ข้อความจะอยู่ในแอปเท่านั้น", "Phone notifications: VAPID keys not set, so messages stay in the app")}
        </p>
        <form method="post" action="/admin/clock">
          <input type="hidden" name="on" value={props.next ? "0" : "1"} />
          <Button kind={props.next ? "ghost" : "primary"}>{props.next ? t("หยุดนาฬิกา", "Stop the clock") : t("เริ่มนาฬิกา", "Start the clock")}</Button>
        </form>
      </Card>
    </section>
  );
}

function RetentionCard(props: { run: RetentionRun | null; t: (th: string, en: string) => string; lang: "th" | "en" }) {
  const { run, t, lang } = props;
  const n = (k: keyof RetentionRun["counts"]) => Number(run?.counts[k] ?? 0);
  return (
    <section id="retention">
      <h2>{t("การเก็บรักษาข้อมูล", "Data retention")}</h2>
      <Card>
        <p class="muted">
          {t(
            "ลบข้อมูลตามระยะเวลาเก็บรักษา ได้แก่ สัญญาณทางสังคมที่เกิน 7 วัน ตัวเลือกที่ไม่ตรงกันเมื่อครบ 72 ชม. เซสชันที่หมดอายุ บันทึกการเข้าสู่ระบบที่เกิน 24 ชม. และบัญชีที่ปิดเกิน 30 วัน ระบบรันให้เองวันละไม่เกิน 1 ครั้งเมื่อผู้ดูแลเปิดหน้านี้",
            "Deletes data on the retention schedule: social signals after 7 days, pending choices when the 72h window closes, expired sessions, sign-in attempts after 24h and accounts deactivated over 30 days ago. It also runs by itself at most once a day when an admin opens this page.",
          )}
        </p>
        {run ? (
          <>
            <p>
              {t("รันล่าสุด: ", "Last run: ")}
              <strong>{fmtDate(run.at, lang)}</strong>
            </p>
            <div class="stats">
              <Stat label={t("สัญญาณที่ล้าง", "Signals cleared")} value={n("signalsCleared")} />
              <Stat label={t("ตัวเลือกที่ลบ", "Pending choices deleted")} value={n("choicesDeleted")} />
              <Stat label={t("เซสชันที่ลบ", "Sessions deleted")} value={n("sessionsDeleted")} />
              <Stat label={t("บันทึกเข้าสู่ระบบที่ลบ", "Sign-in attempts deleted")} value={n("loginAttemptsDeleted")} />
              <Stat label={t("เช็กอินที่สรุปเป็นภาพรวม", "Check-ins aggregated")} value={n("checkInsAggregated")} />
              <Stat label={t("คำตอบวิจัยที่ลบ", "Research answers deleted")} value={n("researchAnswersDeleted")} />
              <Stat
                label={t("บัญชีที่ลบถาวร", "Accounts deleted")}
                value={n("accountsDeleted")}
                hint={run.counts.accountsRemaining ? t("ยังเหลืออีก กดรันอีกครั้ง", "More waiting, run again") : undefined}
              />
            </div>
          </>
        ) : (
          <p>{t("ยังไม่เคยรัน", "Not run yet")}</p>
        )}
        <form method="post" action="/admin/retention" style="margin-top:12px">
          <Button kind="ghost">{t("รันการล้างข้อมูลตามระยะเวลาเก็บรักษา", "Run retention cleanup")}</Button>
        </form>
      </Card>
    </section>
  );
}

const shortDay = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(d);

/** The north star over 8 weeks as a table with bars (screen readers read the table). */
function TrendCard(props: { weeks: WeekCount[]; suppress: boolean; t: (th: string, en: string) => string; lang: Lang }) {
  const { weeks, suppress, t, lang } = props;
  const shown = weeks.map((w) => ({ ...w, value: suppress ? safeCount(w.n) : w.n }));
  const max = Math.max(1, ...shown.map((w) => w.value ?? 0));
  // Oldest first, so the chart reads left to right in time.
  const rows = [...shown].reverse();
  return (
    <section id="north-star-trend">
      <h2>{t("⭐ สมาชิกที่ได้เจอคนรู้จักอีกครั้ง 8 สัปดาห์ล่าสุด", "⭐ Weekly Reconnected Members, last 8 weeks")}</h2>
      <Card>
        <div class="table-wrap">
          <table>
            <caption class="muted" style="text-align:left;caption-side:bottom;padding-top:8px">
              {t(
                "แต่ละแถวคือ 7 วัน นับสมาชิกที่เช็กอินและได้นั่งกับคนที่เคยเจอกันที่ Jurrgun มาก่อน",
                "Each row is 7 days: members who checked in and sat with someone they had met at Jurrgun before.",
              )}
              {suppress ? t(` สัปดาห์ที่น้อยกว่า ${K_THRESHOLD} คนแสดงเป็น "<10"`, ` Weeks under ${K_THRESHOLD} people show as "<10".`) : null}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("สัปดาห์", "Week")}</th>
                <th scope="col">{t("สมาชิก", "Members")}</th>
                <th scope="col" aria-hidden="true" style="width:50%"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr data-week-start={w.start.toISOString()}>
                  <th scope="row" style="font-weight:normal">
                    {shortDay(w.start, lang)} {t("ถึง", "to")} {shortDay(new Date(w.end.getTime() - 1), lang)}
                  </th>
                  <td>{w.value === null ? "<10" : w.value}</td>
                  <td aria-hidden="true">
                    <div class="bar">
                      <i style={`width:${Math.round(((w.value ?? 0) / max) * 100)}%`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

adminDashboard.get("/", async (c) => {
  const { t, lang, user } = view(c);
  const acct = user!.account;
  const role = acct.role;
  const isAdmin = role === "bma_admin";
  const db = getDb(c.env);
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);

  const showHost = role === "host" || role === "partner_admin" || role === "circle_head";
  const showMod = isAdmin || role === "moderator";

  let hostWhere: SQL | undefined;
  if (role === "host" || role === "circle_head") hostWhere = eq(events.hostAccountId, acct.id);
  else if (role === "partner_admin") {
    hostWhere = acct.partnerOrgId ? or(eq(events.partnerOrgId, acct.partnerOrgId), eq(events.hostAccountId, acct.id)) : eq(events.hostAccountId, acct.id);
  }

  // Lazy timer: at most one retention run per 24 hours, triggered by an admin visit.
  const retention = isAdmin ? await retentionIfDue(c.env, acct.id, now) : null;
  const clock = isAdmin ? await clockNext(c.env) : null;

  const showTrend = isAdmin || role === "insight_viewer";

  const [adminStats, reportStats, mine, trend] = await Promise.all([
    isAdmin
      ? Promise.all([
          db
            .select({ n: sql<number>`count(*)`.mapWith(Number) })
            .from(events)
            .where(and(eq(events.status, "published"), gt(events.startsAt, now))),
          db
            .select({
              recent: sql<number>`sum(case when ${registrations.createdAt} >= ${iso(d7)}::timestamptz then 1 else 0 end)`.mapWith(Number),
              active: sql<number>`count(distinct ${registrations.accountId})`.mapWith(Number),
            })
            .from(registrations)
            .where(sql`${registrations.createdAt} >= ${iso(d30)}::timestamptz`),
          db
            .select({
              expected: sql<number>`count(*)`.mapWith(Number),
              checkedIn: sql<number>`sum(case when ${registrations.checkedInAt} is not null then 1 else 0 end)`.mapWith(Number),
            })
            .from(registrations)
            .innerJoin(events, eq(events.id, registrations.eventId))
            .where(
              and(
                sql`${events.endsAt} >= ${iso(d30)}::timestamptz`,
                sql`${events.endsAt} < ${iso(now)}::timestamptz`,
                eq(events.status, "published"),
                or(eq(registrations.status, "confirmed"), sql`${registrations.checkedInAt} is not null`),
              ),
            ),
          weeklyReconnected(db, d7),
        ])
      : Promise.resolve(null),
    showMod
      ? db
          .select({
            open: sql<number>`count(*)`.mapWith(Number),
            critical: sql<number>`sum(case when ${reports.severity} = 'critical' then 1 else 0 end)`.mapWith(Number),
          })
          .from(reports)
          .where(inArray(reports.status, ["open", "in_review"]))
      : Promise.resolve(null),
    showHost && hostWhere
      ? db
          .select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt, status: events.status, capacity: events.capacity })
          .from(events)
          .where(and(hostWhere, gt(events.endsAt, now)))
          .orderBy(asc(events.startsAt))
          .limit(10)
      : Promise.resolve([]),
    showTrend ? weeklyReconnectedTrend(db, now) : Promise.resolve(null),
  ]);

  const upcoming = adminStats?.[0][0]?.n ?? 0;
  const reconnected = adminStats?.[3] ?? 0;
  const regs = adminStats?.[1][0];
  const att = adminStats?.[2][0];
  const rate = att && att.expected > 0 ? `${Math.round(((att.checkedIn ?? 0) / att.expected) * 100)}%` : "-";
  const openReports = reportStats?.[0]?.open ?? 0;
  const critical = reportStats?.[0]?.critical ?? 0;

  return page(
    c,
    { title: t("ภาพรวมทีมงาน", "Staff overview"), admin: true },
    <>
      <h1>{t("ภาพรวมทีมงาน", "Staff overview")}</h1>

      {isAdmin ? (
        <>
          <div class="stats">
            <Stat
              label={t("⭐ สมาชิกที่ได้เจอคนรู้จักอีกครั้ง 7 วัน", "⭐ Weekly Reconnected Members")}
              value={reconnected}
              hint={t("ตัวชี้วัดหลัก: นั่งโต๊ะเดียวกับคนที่เคยเจอกันที่ Jurrgun", "North star: sat at a table with someone they'd met here before")}
            />
            <Stat label={t("กิจกรรมที่จะมาถึง (เผยแพร่แล้ว)", "Upcoming published events")} value={upcoming} />
            <Stat label={t("การลงทะเบียน 7 วันล่าสุด", "Registrations, last 7 days")} value={regs?.recent ?? 0} />
            <Stat label={t("รายงานที่ค้างอยู่", "Open reports")} value={openReports} hint={critical ? t(`ด่วน ${critical}`, `${critical} critical`) : undefined} />
            <Stat label={t("อัตราเช็กอิน 30 วัน", "Check-in rate, 30 days")} value={rate} />
            <Stat label={t("สมาชิกที่ใช้งาน 30 วัน", "Active members, 30 days")} value={regs?.active ?? 0} hint={t("ลงทะเบียนกิจกรรมอย่างน้อย 1 ครั้ง", "registered for 1+ events")} />
          </div>
          <div class="row" style="margin-top:12px">
            <LinkButton href="/admin/events">{t("จัดการกิจกรรม", "Manage events")}</LinkButton>
            <LinkButton href="/admin/moderation" kind="ghost">{t("คิวรายงาน", "Moderation queue")}</LinkButton>
            <LinkButton href="/admin/insights" kind="ghost">{t("ข้อมูลเชิงลึก", "City Insight")}</LinkButton>
            <LinkButton href="/admin/pulse" kind="ghost">City Pulse</LinkButton>
            <LinkButton href="/admin/quiz-health" kind="ghost">{t("สุขภาพแบบทดสอบ", "Quiz health")}</LinkButton>
          </div>
          {trend ? <TrendCard weeks={trend} suppress={false} t={t} lang={lang} /> : null}
          <ClockCard next={clock} push={!!vapidKeys(c.env)} t={t} lang={lang} />
          <RetentionCard run={retention} t={t} lang={lang} />
        </>
      ) : null}

      {role === "moderator" ? (
        <Card href="/admin/moderation">
          <div class="spread">
            <div>
              <h2 style="margin:0">{t("รายงานที่รอตรวจสอบ", "Reports waiting")}</h2>
              <p class="muted">{t("รายงานด่วนตอบภายใน 1 ชม. ทั่วไปภายใน 24 ชม.", "Critical within 1h, standard within 24h")}</p>
            </div>
            <div class="stat-v">{openReports}</div>
          </div>
          {critical ? <Tag tone="warn">{t(`ด่วน ${critical}`, `${critical} critical`)}</Tag> : null}
        </Card>
      ) : null}

      {showHost ? (
        <>
          <h2>{t("กิจกรรมถัดไปของคุณ", "Your next events")}</h2>
          {mine.length === 0 ? (
            <Empty>{t("ยังไม่มีกิจกรรมที่ได้รับมอบหมาย", "No events assigned to you yet")}</Empty>
          ) : (
            mine.map((e) => (
              <Card href={`/admin/events/${encodeURIComponent(e.id)}`}>
                <h3>{lang === "en" && e.titleEn ? e.titleEn : e.title}</h3>
                <p class="meta">
                  <span>{fmtDate(e.startsAt, lang)}</span>
                  <span>{t(`รับ ${e.capacity} คน`, `${e.capacity} seats`)}</span>
                  {e.status !== "published" ? <Tag tone="muted">{e.status}</Tag> : null}
                </p>
              </Card>
            ))
          )}
        </>
      ) : null}

      {role === "insight_viewer" ? (
        <Card href="/admin/insights">
          <h2 style="margin-top:0">{t("City Insight", "City Insight")}</h2>
          <p>{t("ดูตัวชี้วัดโครงการนำร่องและผลสำรวจ City Pulse แบบรวม (แสดงเฉพาะกลุ่มที่มีอย่างน้อย 10 คน)", "Pilot KPIs and aggregated City Pulse results (groups of 10 or more only).")}</p>
        </Card>
      ) : null}
      {role === "insight_viewer" && trend ? <TrendCard weeks={trend} suppress t={t} lang={lang} /> : null}
    </>,
  );
});

/**
 * The north star (design/reference/customer-profile.md): members who checked in
 * this week at an event where someone else who checked in was already a
 * connection of theirs (connected before that event started, not removed).
 * `among` narrows it to some members (tests).
 */
export async function weeklyReconnected(db: ReturnType<typeof getDb>, since: Date, among?: string[]): Promise<number> {
  const r1 = alias(registrations, "r1");
  const r2 = alias(registrations, "r2");
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${r1.accountId})`.mapWith(Number) })
    .from(r1)
    .innerJoin(events, eq(events.id, r1.eventId))
    .innerJoin(r2, and(eq(r2.eventId, r1.eventId), sql`${r2.accountId} <> ${r1.accountId}`, sql`${r2.checkedInAt} is not null`))
    .innerJoin(
      connections,
      and(
        sql`${connections.removedAt} is null`,
        sql`${connections.createdAt} < ${events.startsAt}`,
        or(and(eq(connections.aAccount, r1.accountId), eq(connections.bAccount, r2.accountId)), and(eq(connections.aAccount, r2.accountId), eq(connections.bAccount, r1.accountId))),
      ),
    )
    .where(and(sql`${r1.checkedInAt} >= ${since.toISOString()}::timestamptz`, among ? inArray(r1.accountId, among) : undefined));
  return row?.n ?? 0;
}

export type WeekCount = { start: Date; end: Date; n: number };

/**
 * Weekly Reconnected Members per week for the last `weeks` weeks, newest first.
 * Week i covers [now - 7(i+1) days, now - 7i days), so week 0 matches the
 * headline tile. Same definition as weeklyReconnected, in one query. Weeks
 * with nobody come back as 0. `among` narrows it to some members (tests).
 */
export async function weeklyReconnectedTrend(db: ReturnType<typeof getDb>, now: Date, weeks = 8, among?: string[]): Promise<WeekCount[]> {
  const r1 = alias(registrations, "r1");
  const r2 = alias(registrations, "r2");
  const since = new Date(now.getTime() - weeks * 7 * DAY);
  const bucket = sql<number>`floor(extract(epoch from (${now.toISOString()}::timestamptz - ${r1.checkedInAt})) / 604800)`.mapWith(Number);
  const rows = await db
    .select({ week: bucket, n: sql<number>`count(distinct ${r1.accountId})`.mapWith(Number) })
    .from(r1)
    .innerJoin(events, eq(events.id, r1.eventId))
    .innerJoin(r2, and(eq(r2.eventId, r1.eventId), sql`${r2.accountId} <> ${r1.accountId}`, sql`${r2.checkedInAt} is not null`))
    .innerJoin(
      connections,
      and(
        sql`${connections.removedAt} is null`,
        sql`${connections.createdAt} < ${events.startsAt}`,
        or(and(eq(connections.aAccount, r1.accountId), eq(connections.bAccount, r2.accountId)), and(eq(connections.aAccount, r2.accountId), eq(connections.bAccount, r1.accountId))),
      ),
    )
    .where(
      and(
        sql`${r1.checkedInAt} >= ${since.toISOString()}::timestamptz`,
        sql`${r1.checkedInAt} < ${now.toISOString()}::timestamptz`,
        among ? inArray(r1.accountId, among) : undefined,
      ),
    )
    // By position: the bucket carries a bound parameter, so Postgres cannot match it as an expression.
    .groupBy(sql`1`)
    .limit(weeks + 1);
  const byWeek = new Map(rows.map((r) => [Number(r.week), Number(r.n)]));
  return Array.from({ length: weeks }, (_, i) => ({
    start: new Date(now.getTime() - (i + 1) * 7 * DAY),
    end: new Date(now.getTime() - i * 7 * DAY),
    n: byWeek.get(i) ?? 0,
  }));
}
