/**
 * Staff overview (/admin) — any staff role, content depends on the role.
 *
 *   bma_admin       pilot health at a glance
 *   host / partner  their next events
 *   moderator       open reports
 *   insight_viewer  a way into City Insight
 *
 * Operational counts only (events, registrations, reports); the k ≥ 10
 * research threshold applies on the Insights and City Pulse pages.
 */
import { Hono } from "hono";
import { and, asc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import type { AppEnv } from "../../lib/env";
import { fmtDate } from "../../lib/i18n";
import { events, registrations, reports } from "../../schema";
import { Card, Empty, LinkButton, page, Stat, Tag, view } from "../../ui/kit";

export const adminDashboard = new Hono<AppEnv>();

const DAY = 86_400_000;

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

  const showHost = role === "host" || role === "partner_admin";
  const showMod = isAdmin || role === "moderator";

  let hostWhere: SQL | undefined;
  if (role === "host") hostWhere = eq(events.hostAccountId, acct.id);
  else if (role === "partner_admin") {
    hostWhere = acct.partnerOrgId ? or(eq(events.partnerOrgId, acct.partnerOrgId), eq(events.hostAccountId, acct.id)) : eq(events.hostAccountId, acct.id);
  }

  const [adminStats, reportStats, mine] = await Promise.all([
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
  ]);

  const upcoming = adminStats?.[0][0]?.n ?? 0;
  const regs = adminStats?.[1][0];
  const att = adminStats?.[2][0];
  const rate = att && att.expected > 0 ? `${Math.round(((att.checkedIn ?? 0) / att.expected) * 100)}%` : "—";
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
            <Stat label={t("กิจกรรมที่จะมาถึง (เผยแพร่แล้ว)", "Upcoming published events")} value={upcoming} />
            <Stat label={t("การลงทะเบียน 7 วันล่าสุด", "Registrations, last 7 days")} value={regs?.recent ?? 0} />
            <Stat label={t("รายงานที่ค้างอยู่", "Open reports")} value={openReports} hint={critical ? t(`ด่วน ${critical}`, `${critical} critical`) : undefined} />
            <Stat label={t("อัตราเช็กอิน 30 วัน", "Check-in rate, 30 days")} value={rate} />
            <Stat label={t("สมาชิกที่ใช้งาน 30 วัน", "Active members, 30 days")} value={regs?.active ?? 0} hint={t("ลงทะเบียนกิจกรรมอย่างน้อย 1 ครั้ง", "registered for ≥1 event")} />
          </div>
          <div class="row" style="margin-top:12px">
            <LinkButton href="/admin/events">{t("จัดการกิจกรรม", "Manage events")}</LinkButton>
            <LinkButton href="/admin/moderation" kind="ghost">{t("คิวรายงาน", "Moderation queue")}</LinkButton>
            <LinkButton href="/admin/insights" kind="ghost">{t("ข้อมูลเชิงลึก", "City Insight")}</LinkButton>
            <LinkButton href="/admin/pulse" kind="ghost">City Pulse</LinkButton>
          </div>
        </>
      ) : null}

      {role === "moderator" ? (
        <Card href="/admin/moderation">
          <div class="spread">
            <div>
              <h2 style="margin:0">{t("รายงานที่รอตรวจสอบ", "Reports waiting")}</h2>
              <p class="muted">{t("ด่วนตอบภายใน 1 ชม. ทั่วไป 24 ชม.", "Critical within 1h, standard within 24h")}</p>
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
    </>,
  );
});
