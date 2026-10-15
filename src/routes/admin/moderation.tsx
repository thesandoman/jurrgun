/**
 * Moderation queue (/admin/moderation) — moderators and BMA admins
 * (PRD §11, §13.2).
 *
 *   GET  /            queue, ?status=open|in_review|actioned|dismissed, ?q= (server
 *                     search over every report in that status), ?page= (50 a page)
 *   GET  /:id         case detail (audited); ?history=1 adds the target's event
 *                     participation history, audited separately
 *   POST /:id/action  note | warning | suspend | ban | lift | dismiss
 *
 * Fair process (domain/rules.ts removalAllowed): suspending or banning needs
 * the Terms / code of conduct rule that was broken, unless the member already
 * has 3 flags. A flag is an upheld warning; the third one suspends the
 * account automatically for FLAG_SUSPEND_DAYS.
 *
 * Staff never see relationship status, romance settings, gender identity,
 * age preferences or connection choices here — only account basics.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { aliasedTable, and, asc, count, desc, eq, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { label, REPORT_REASON_LABELS } from "../../lib/constants";
import { newId } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { fmtDate, fmtDay } from "../../lib/i18n";
import { audit, notify } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { accounts, events, moderationActions, profiles, registrations, reports, sessions } from "../../schema";
import { Card, Empty, Field, int, Notice, page, pageOf, Pager, str, Tag, TextArea, view } from "../../ui/kit";
import { statusTag } from "./users";
import { releaseUpcomingSeats } from "../../services/events";
import { FLAG_SUSPEND_DAYS, FLAG_WINDOW_DAYS, FLAGS_TO_REMOVE, flagLimitReached, removalAllowed } from "../../domain/rules";

/** Rules a moderator can name as broken: the report reasons, minus "other". */
const RULES = REPORT_REASON_LABELS.filter((r) => r.value !== "other");

/** Upheld warnings in the last year. */
async function flagCount(db: ReturnType<typeof getDb>, accountId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(moderationActions)
    .where(and(eq(moderationActions.accountId, accountId), eq(moderationActions.action, "warning"), gte(moderationActions.createdAt, new Date(now.getTime() - FLAG_WINDOW_DAYS * 86_400_000))));
  return Number(row?.n ?? 0);
}

export const adminModeration = new Hono<AppEnv>();
adminModeration.use("*", requireRole("moderator"));

const STATUSES = ["open", "in_review", "actioned", "dismissed"] as const;
const ACTIONS = ["note", "warning", "suspend", "ban", "lift", "dismiss"] as const;
type Action = (typeof ACTIONS)[number];

const STATUS_LABELS: Record<string, [string, string]> = {
  open: ["เปิดอยู่", "Open"],
  in_review: ["กำลังตรวจสอบ", "In review"],
  actioned: ["ดำเนินการแล้ว", "Actioned"],
  dismissed: ["ยกเลิกแล้ว", "Dismissed"],
};

const reporterProfile = aliasedTable(profiles, "reporter_profile");
const targetProfile = aliasedTable(profiles, "target_profile");

function age(from: Date, lang: "th" | "en"): string {
  const h = Math.max(0, Math.floor((Date.now() - from.getTime()) / 3_600_000));
  if (h < 1) return lang === "en" ? "<1h" : "<1 ชม.";
  if (h < 48) return lang === "en" ? `${h}h` : `${h} ชม.`;
  const d = Math.floor(h / 24);
  return lang === "en" ? `${d}d` : `${d} วัน`;
}

// ------------------------------------------------------------------ queue --

/** Reports per page of the queue. */
const QUEUE_PAGE = 50;

adminModeration.get("/", async (c) => {
  const { t, lang } = view(c);
  const raw = c.req.query("status") ?? "open";
  const status = (STATUSES as readonly string[]).includes(raw) ? raw : "open";
  const q = (c.req.query("q") ?? "").trim().slice(0, 100);
  const { page: pageNo, offset } = pageOf(c.req.query("page"), QUEUE_PAGE);
  const db = getDb(c.env);

  // Server search over every report in this status: the reason (its stored
  // value and its Thai / English labels), both nicknames and the event title.
  let where: SQL = eq(reports.status, status);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const needle = q.toLowerCase();
    const reasons = REPORT_REASON_LABELS.filter((r) => [r.value, r.th, r.en].some((x) => x.toLowerCase().includes(needle))).map((r) => r.value);
    where = and(
      where,
      or(
        ilike(reports.reason, like),
        reasons.length ? inArray(reports.reason, reasons) : undefined,
        ilike(reporterProfile.nickname, like),
        ilike(targetProfile.nickname, like),
        ilike(events.title, like),
        ilike(events.titleEn, like),
      ),
    )!;
  }
  const [rows, [{ n: total }], counts] = await Promise.all([
    db
      .select({
        id: reports.id,
        reason: reports.reason,
        severity: reports.severity,
        createdAt: reports.createdAt,
        reporterNick: reporterProfile.nickname,
        targetNick: targetProfile.nickname,
        eventTitle: events.title,
        eventTitleEn: events.titleEn,
      })
      .from(reports)
      .leftJoin(reporterProfile, eq(reporterProfile.accountId, reports.reporter))
      .leftJoin(targetProfile, eq(targetProfile.accountId, reports.targetAccount))
      .leftJoin(events, eq(events.id, reports.targetEvent))
      .where(where)
      // Critical first, then oldest first; the id keeps pages stable.
      .orderBy(sql`case when ${reports.severity} = 'critical' then 0 else 1 end`, asc(reports.createdAt), asc(reports.id))
      .limit(QUEUE_PAGE)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(reports)
      .leftJoin(reporterProfile, eq(reporterProfile.accountId, reports.reporter))
      .leftJoin(targetProfile, eq(targetProfile.accountId, reports.targetAccount))
      .leftJoin(events, eq(events.id, reports.targetEvent))
      .where(where)
      .limit(1),
    db
      .select({ status: reports.status, n: sql<number>`count(*)`.mapWith(Number) })
      .from(reports)
      .groupBy(reports.status)
      .limit(10),
  ]);
  const countOf = new Map(counts.map((r) => [r.status, r.n]));
  const href = (p: number) => `/admin/moderation?${new URLSearchParams({ status, ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  // Past the last page (the queue shrank): go to the last one.
  if (rows.length === 0 && pageNo > 1 && total > 0) return c.redirect(href(Math.ceil(total / QUEUE_PAGE)));

  return page(
    c,
    { title: t("คิวรายงาน", "Moderation queue"), admin: true },
    <>
      <h1>{t("คิวรายงาน", "Moderation queue")}</h1>
      <p class="muted">
        {t(
          "รายงานด่วนขึ้นก่อน ที่เหลือเรียงจากเก่าสุด ควรตอบรายงานด่วนภายใน 1 ชม. และรายงานทั่วไปภายใน 24 ชม.",
          "Critical reports first, then oldest first. Response targets: 1h critical, 24h standard.",
        )}
      </p>
      <nav class="row" aria-label={t("สถานะ", "Status")}>
        {STATUSES.map((s) => (
          <a href={`/admin/moderation?status=${s}`} class="chip" aria-current={s === status ? "page" : undefined} style={s === status ? "background:var(--brand);color:var(--brand-ink)" : ""}>
            {lang === "en" ? STATUS_LABELS[s][1] : STATUS_LABELS[s][0]} ({countOf.get(s) ?? 0})
          </a>
        ))}
      </nav>
      <form method="get" action="/admin/moderation" role="search" class="tfilter">
        <input type="hidden" name="status" value={status} />
        <label for="report-q">{t("ค้นหารายงาน (เหตุผล ผู้รายงาน ผู้ถูกรายงาน กิจกรรม)", "Search reports (reason, reporter, reported, event)")}</label>
        <input type="search" id="report-q" name="q" value={q} maxlength={100} autocomplete="off" />
        <button type="submit" class="btn ghost">{t("ค้นหา", "Search")}</button>
        {q ? <a href={`/admin/moderation?status=${status}`}>{t("ล้างการค้นหา", "Clear search")}</a> : null}
      </form>
      {rows.length === 0 ? (
        <Empty>{q ? t("ไม่พบรายงานที่ตรงกับคำค้นในสถานะนี้", "No reports with this status match your search") : t("ไม่มีรายงานในสถานะนี้", "No reports with this status")}</Empty>
      ) : (
        <>
        <Pager t={t} label={t("หน้าของคิวรายงาน", "Moderation queue pages")} page={pageNo} size={QUEUE_PAGE} shown={rows.length} total={total} href={href} />
        <div class="table-wrap scroll">
          <table id="admin-reports">
            <caption class="sr-only">{t("รายงาน", "Reports")}</caption>
            <thead>
              <tr>
                <th>{t("ความรุนแรง", "Severity")}</th>
                <th>{t("เหตุผล", "Reason")}</th>
                <th>{t("ผู้รายงาน", "Reporter")}</th>
                <th>{t("ผู้ถูกรายงาน", "Target")}</th>
                <th>{t("กิจกรรม", "Event")}</th>
                <th>{t("อายุรายงาน", "Age")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td>{r.severity === "critical" ? <Tag tone="warn">{t("ด่วน", "Critical")}</Tag> : <Tag>{t("ทั่วไป", "Standard")}</Tag>}</td>
                  <td>
                    <a href={`/admin/moderation/${encodeURIComponent(r.id)}`}>{label(REPORT_REASON_LABELS, r.reason, lang)}</a>
                  </td>
                  <td>{r.reporterNick ?? "—"}</td>
                  <td>{r.targetNick ?? "—"}</td>
                  <td>{r.eventTitle ? (lang === "en" && r.eventTitleEn ? r.eventTitleEn : r.eventTitle) : "—"}</td>
                  <td>
                    {age(r.createdAt, lang)}
                    {Date.now() - r.createdAt.getTime() > (r.severity === "critical" ? 1 : 24) * 3_600_000 ? (
                      <>
                        {" "}
                        <Tag tone="warn">{t("เกินเวลา", "Overdue")}</Tag>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>,
  );
});

// ----------------------------------------------------------------- detail --

async function loadReport(c: Context<AppEnv>, id: string) {
  const db = getDb(c.env);
  const [row] = await db
    .select({
      report: reports,
      reporterNick: reporterProfile.nickname,
      eventTitle: events.title,
      eventTitleEn: events.titleEn,
      eventStartsAt: events.startsAt,
      eventHost: events.hostAccountId,
    })
    .from(reports)
    .leftJoin(reporterProfile, eq(reporterProfile.accountId, reports.reporter))
    .leftJoin(events, eq(events.id, reports.targetEvent))
    .where(eq(reports.id, id))
    .limit(1);
  return row ?? null;
}

async function renderDetail(c: Context<AppEnv>, id: string, opts: { error?: string; status?: 200 | 400 } = {}) {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const me = c.var.user!.account;
  const row = await loadReport(c, id);
  if (!row) return c.text("Not found", 404);
  const r = row.report;
  const targetId = r.targetAccount;
  const showHistory = c.req.query("history") === "1" && !!targetId;

  const flags = targetId ? await flagCount(db, targetId) : 0;
  const [target, actions, otherReports, history] = await Promise.all([
    targetId
      ? db
          .select({
            id: accounts.id,
            username: accounts.username,
            role: accounts.role,
            status: accounts.status,
            suspendedUntil: accounts.suspendedUntil,
            createdAt: accounts.createdAt,
            nickname: profiles.nickname,
          })
          .from(accounts)
          .leftJoin(profiles, eq(profiles.accountId, accounts.id))
          .where(eq(accounts.id, targetId))
          .limit(1)
          .then((x) => x[0] ?? null)
      : Promise.resolve(null),
    targetId
      ? db
          .select({
            action: moderationActions.action,
            until: moderationActions.until,
            note: moderationActions.note,
            createdAt: moderationActions.createdAt,
            byUsername: accounts.username,
          })
          .from(moderationActions)
          .leftJoin(accounts, eq(accounts.id, moderationActions.by))
          .where(eq(moderationActions.accountId, targetId))
          .orderBy(desc(moderationActions.createdAt))
          .limit(50)
      : Promise.resolve([]),
    targetId
      ? db
          .select({ id: reports.id, reason: reports.reason, status: reports.status, severity: reports.severity, createdAt: reports.createdAt })
          .from(reports)
          .where(and(eq(reports.targetAccount, targetId), ne(reports.id, r.id)))
          .orderBy(desc(reports.createdAt))
          .limit(50)
      : Promise.resolve([]),
    showHistory
      ? db
          .select({
            title: events.title,
            titleEn: events.titleEn,
            startsAt: events.startsAt,
            status: registrations.status,
            checkedInAt: registrations.checkedInAt,
          })
          .from(registrations)
          .innerJoin(events, eq(events.id, registrations.eventId))
          .where(eq(registrations.accountId, targetId!))
          .orderBy(desc(events.startsAt))
          .limit(100)
      : Promise.resolve(null),
  ]);

  const auditRows = [audit(db, me.id, "moderation.view_report", { type: "report", id: r.id }, { target: targetId })];
  if (showHistory) auditRows.push(audit(db, me.id, "moderation.view_history", { type: "account", id: targetId! }, { report: r.id }));
  await batch(c.env, auditRows);

  const protectedTarget = target?.role === "bma_admin" && me.role !== "bma_admin";
  const evTitle = row.eventTitle ? (lang === "en" && row.eventTitleEn ? row.eventTitleEn : row.eventTitle) : null;

  return page(
    c,
    { title: t("รายละเอียดรายงาน", "Report"), admin: true, status: opts.status },
    <>
      <p>
        <a href={`/admin/moderation?status=${r.status}`}>← {t("คิวรายงาน", "Moderation queue")}</a>
      </p>
      {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
      <h1>
        {label(REPORT_REASON_LABELS, r.reason, lang)}{" "}
        {r.severity === "critical" ? <Tag tone="warn">{t("ด่วน", "Critical")}</Tag> : <Tag>{t("ทั่วไป", "Standard")}</Tag>}{" "}
        <Tag tone="accent">{lang === "en" ? STATUS_LABELS[r.status]?.[1] ?? r.status : STATUS_LABELS[r.status]?.[0] ?? r.status}</Tag>
      </h1>

      <Card>
        <p class="meta">
          <span>{t("ผู้รายงาน", "Reporter")}: {row.reporterNick ?? "—"}</span>
          <span>{t("รายงานเมื่อ", "Filed")}: {fmtDate(r.createdAt, lang)}</span>
          {evTitle ? (
            <span>
              {t("กิจกรรม", "Event")}: {evTitle}
              {row.eventStartsAt ? ` · ${fmtDate(row.eventStartsAt, lang)}` : ""}
            </span>
          ) : null}
        </p>
        <h2 class="h3">{t("รายละเอียดจากผู้รายงาน", "Reporter's details")}</h2>
        <p style="white-space:pre-wrap">{r.details || t("(ไม่มีรายละเอียด)", "(no details)")}</p>
      </Card>

      {target ? (
        <Card>
          <h2 style="margin-top:0">{t("บัญชีที่ถูกรายงาน", "Reported account")}</h2>
          <p>
            <strong>{target.nickname ?? "—"}</strong> <small>@{target.username}</small> {statusTag(target.status, lang)}
            {target.status === "suspended" && target.suspendedUntil ? <small> {t("ถึง", "until")} {fmtDate(target.suspendedUntil, lang)}</small> : null}
          </p>
          <p>
            <Tag>🚩 {t(`ธง ${flags}/${FLAGS_TO_REMOVE}`, `Flags ${flags}/${FLAGS_TO_REMOVE}`)}</Tag>{" "}
            <small class="muted">
              {t(
                "ระงับหรือแบนได้เฉพาะเมื่อระบุข้อที่ละเมิด หรือมีครบ 3 ธง (คำเตือนที่ยืนยันแล้วในรอบปี)",
                "Suspend or ban only for a named rule broken, or at 3 flags (upheld warnings in the last year).",
              )}
            </small>
          </p>
          <p class="muted">
            {t("สร้างบัญชีเมื่อ", "Account created")} {fmtDay(target.createdAt, lang)} · <a href={`/admin/users/${encodeURIComponent(target.id)}`}>{t("ดูบัญชี", "View account")}</a>
          </p>
        </Card>
      ) : (
        <Notice kind="info">{t("รายงานนี้เกี่ยวกับกิจกรรม ไม่ได้ระบุบุคคล", "This report is about an event, not a person.")}</Notice>
      )}

      {target ? (
        <>
          <h2>{t("ประวัติการดำเนินการกับบัญชีนี้", "Prior actions on this account")}</h2>
          {actions.length === 0 ? (
            <Empty>{t("ไม่มี", "None")}</Empty>
          ) : (
            <div class="table-wrap">
              <table>
                <caption class="sr-only">{t("ประวัติการดำเนินการกับบัญชีนี้", "Prior actions on this account")}</caption>
                <thead>
                  <tr>
                    <th>{t("เมื่อ", "When")}</th>
                    <th>{t("การดำเนินการ", "Action")}</th>
                    <th>{t("โดย", "By")}</th>
                    <th>{t("บันทึก", "Note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr>
                      <td>{fmtDate(a.createdAt, lang)}</td>
                      <td>
                        {a.action}
                        {a.until ? <small> → {fmtDay(a.until, lang)}</small> : null}
                      </td>
                      <td>{a.byUsername ? `@${a.byUsername}` : "—"}</td>
                      <td>{a.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>{t("รายงานอื่นเกี่ยวกับบัญชีนี้", "Other reports about this account")}</h2>
          {otherReports.length === 0 ? (
            <Empty>{t("ไม่มี", "None")}</Empty>
          ) : (
            <div class="table-wrap">
              <table>
                <caption class="sr-only">{t("รายงานอื่นเกี่ยวกับบัญชีนี้", "Other reports about this account")}</caption>
                <thead>
                  <tr>
                    <th>{t("เมื่อ", "When")}</th>
                    <th>{t("เหตุผล", "Reason")}</th>
                    <th>{t("สถานะ", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {otherReports.map((o) => (
                    <tr>
                      <td>{fmtDate(o.createdAt, lang)}</td>
                      <td>
                        <a href={`/admin/moderation/${encodeURIComponent(o.id)}`}>{label(REPORT_REASON_LABELS, o.reason, lang)}</a>
                        {o.severity === "critical" ? <> <Tag tone="warn">{t("ด่วน", "Critical")}</Tag></> : null}
                      </td>
                      <td>{lang === "en" ? STATUS_LABELS[o.status]?.[1] ?? o.status : STATUS_LABELS[o.status]?.[0] ?? o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>{t("ประวัติการเข้าร่วมกิจกรรม", "Event participation")}</h2>
          {history ? (
            history.length === 0 ? (
              <Empty>{t("ไม่มีประวัติ", "No participation")}</Empty>
            ) : (
              <div class="table-wrap">
                <table>
                  <caption class="sr-only">{t("ประวัติการเข้าร่วมกิจกรรม", "Event participation")}</caption>
                  <thead>
                    <tr>
                      <th>{t("กิจกรรม", "Event")}</th>
                      <th>{t("วันที่", "Date")}</th>
                      <th>{t("สถานะ", "Status")}</th>
                      <th>{t("เช็กอิน", "Checked in")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr>
                        <td>{lang === "en" && h.titleEn ? h.titleEn : h.title}</td>
                        <td>{fmtDate(h.startsAt, lang)}</td>
                        <td>{h.status}</td>
                        <td>{h.checkedInAt ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <p>
              <a class="btn ghost" href={`/admin/moderation/${encodeURIComponent(r.id)}?history=1`}>
                {t("แสดงประวัติการเข้าร่วมกิจกรรมเพื่อการสอบสวนด้านความปลอดภัย", "Show event participation for safety investigation")}
              </a>
              <br />
              <small>{t("การเปิดดูจะถูกบันทึกในบันทึกการตรวจสอบ", "Opening it is recorded in the audit log.")}</small>
            </p>
          )}
        </>
      ) : null}

      <Card>
        <h2 style="margin-top:0">{t("ดำเนินการ", "Take action")}</h2>
        {protectedTarget ? (
          <Notice kind="warn">{t("ผู้ดูแลจัดการบัญชีแอดมินไม่ได้", "Moderators can't act on an admin account.")}</Notice>
        ) : null}
        {/* Warnings, suspensions and bans ask once first (WCAG 3.3.4); notes, dismissals and lifts don't. */}
        <form
          method="post"
          action={`/admin/moderation/${encodeURIComponent(r.id)}/action`}
          data-c-warning={t("ส่งคำเตือนถึงสมาชิกคนนี้?", "Send this member a warning?")}
          data-c-suspend={t("ระงับบัญชีนี้ {d} วัน? สมาชิกจะออกจากระบบและได้รับแจ้ง", "Suspend this account for {d} days? They'll be signed out and notified.")}
          data-c-ban={t("แบนบัญชีนี้ถาวร? สมาชิกจะออกจากระบบและได้รับแจ้ง", "Ban this account permanently? They'll be signed out and notified.")}
          onsubmit="var a=this.elements.namedItem('action').value,m=this.dataset['c'+a.charAt(0).toUpperCase()+a.slice(1)];if(!m)return true;var d=this.elements.namedItem('days');return confirm(m.replace('{d}',d?d.value:''))"
        >
          <div class="field">
            <label for="f-action">{t("การดำเนินการ", "Action")}</label>
            <select id="f-action" name="action" required>
              <option value="note">{t("บันทึกโน้ต / หลักฐาน", "Add note / evidence")}</option>
              {target ? (
                <>
                  <option value="warning">{t("ตักเตือน", "Warning")}</option>
                  <option value="suspend">{t("ระงับชั่วคราว", "Temporary suspension")}</option>
                  <option value="ban">{t("แบนถาวร", "Permanent ban")}</option>
                  <option value="lift">{t("ยกเลิกการระงับ / แบน", "Lift suspension / ban")}</option>
                </>
              ) : null}
              <option value="dismiss">{t("ยกเลิกรายงาน (ไม่พบการละเมิด)", "Dismiss report")}</option>
            </select>
          </div>
          {target ? (
            <div class="field" data-for="warning suspend ban">
              <label for="f-rule">{t("ข้อที่ละเมิด (ข้อกำหนด / หลักปฏิบัติ)", "Rule broken (Terms / code of conduct)")}</label>
              <select id="f-rule" name="rule">
                <option value="">{t("ไม่ระบุ", "None named")}</option>
                {RULES.map((o) => (
                  <option value={o.value}>{label(REPORT_REASON_LABELS, o.value, lang)}</option>
                ))}
              </select>
              <small class="muted">
                {t("จำเป็นสำหรับการระงับหรือแบน เว้นแต่มีครบ 3 ธง", "Needed to suspend or ban, unless the member has 3 flags.")}
              </small>
            </div>
          ) : null}
          {target ? (
            <div data-for="suspend">
              <Field label={t("จำนวนวันที่ระงับ (1 ถึง 90)", "Suspension days (1-90)")} name="days" type="number" min={1} max={90} value={7} />
            </div>
          ) : null}
          <TextArea
            label={t("บันทึกของผู้ดูแล", "Moderator note")}
            name="note"
            maxlength={2000}
            hint={t("จำเป็นสำหรับการตักเตือน ระงับ และแบน ผู้ถูกรายงานจะไม่เห็นบันทึกนี้", "Required for warning, suspension and ban. The member never sees it.")}
          />
          <button
            type="submit"
            class="btn primary"
            id="mod-go"
            data-note={t("บันทึกโน้ต", "Save note")}
            data-warning={t("ส่งคำเตือน", "Send warning")}
            data-suspend={t("ระงับบัญชี", "Suspend account")}
            data-ban={t("แบนบัญชีถาวร", "Ban account")}
            data-lift={t("ยกเลิกการระงับ / แบน", "Lift suspension / ban")}
            data-dismiss={t("ยกเลิกรายงาน", "Dismiss report")}
          >
            {t("บันทึกโน้ต", "Save note")}
          </button>
          {/* The form shows only what the chosen action needs, and the button says what it will do. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var sel=document.getElementById("f-action"),go=document.getElementById("mod-go");if(!sel||!go)return;function upd(){var a=sel.value;document.querySelectorAll("[data-for]").forEach(function(el){el.hidden=el.dataset.for.split(" ").indexOf(a)<0});go.textContent=go.dataset[a]||go.textContent;go.classList.toggle("danger",a==="suspend"||a==="ban");go.classList.toggle("primary",!(a==="suspend"||a==="ban"))}sel.addEventListener("change",upd);upd()})()`,
            }}
          />
        </form>
      </Card>
    </>,
  );
}

adminModeration.get("/:id", (c) => renderDetail(c, c.req.param("id")));

// ----------------------------------------------------------------- action --

adminModeration.post("/:id/action", async (c) => {
  const { t } = view(c);
  const id = c.req.param("id");
  const me = c.var.user!.account;
  const db = getDb(c.env);
  const row = await loadReport(c, id);
  if (!row) return c.text("Not found", 404);
  const r = row.report;

  const body = await c.req.parseBody();
  const action = str(body.action) as Action;
  const rawNote = str(body.note).slice(0, 2000);
  const rule = RULES.some((o) => o.value === str(body.rule)) ? str(body.rule) : null;
  const bad = (msg: string) => renderDetail(c, id, { error: msg, status: 400 });

  if (!(ACTIONS as readonly string[]).includes(action)) return bad(t("การดำเนินการไม่ถูกต้อง", "Unknown action"));
  if ((action === "warning" || action === "suspend" || action === "ban") && !rawNote) {
    return bad(t("ใส่บันทึกสำหรับการดำเนินการนี้ด้วย", "A note is required for this action"));
  }

  const targetId = r.targetAccount;
  const needsTarget = action === "warning" || action === "suspend" || action === "ban" || action === "lift";
  if (needsTarget && !targetId) return bad(t("รายงานนี้ไม่มีบัญชีเป้าหมาย", "This report has no target account"));

  let target: { id: string; role: string; status: string } | null = null;
  if (targetId) {
    const [x] = await db.select({ id: accounts.id, role: accounts.role, status: accounts.status }).from(accounts).where(eq(accounts.id, targetId)).limit(1);
    target = x ?? null;
    if (needsTarget && !target) return bad(t("ไม่พบบัญชีเป้าหมาย", "Target account not found"));
  }
  // Lifting only undoes a suspension or ban. A member who deactivated (or was
  // deleted by retention) must never be switched back on by a moderator.
  if (target && action === "lift" && target.status !== "suspended" && target.status !== "banned") {
    return bad(t("ยกเลิกได้เฉพาะบัญชีที่ถูกระงับหรือแบน", "Only a suspended or banned account can be lifted"));
  }
  if (target && action !== "dismiss" && action !== "note") {
    if (target.role === "bma_admin" && me.role !== "bma_admin") return c.text("Forbidden", 403);
    if (target.id === me.id) return bad(t("ดำเนินการกับบัญชีของตัวเองไม่ได้", "You can't act on your own account"));
  }

  // Fair process: removal needs a named rule, or 3 flags already.
  const flagsBefore = target ? await flagCount(db, target.id) : 0;
  if ((action === "suspend" || action === "ban") && !removalAllowed({ rule, flags: flagsBefore })) {
    return bad(
      t(
        `ระงับหรือแบนได้เฉพาะเมื่อระบุข้อที่ละเมิด หรือมีครบ ${FLAGS_TO_REMOVE} ธง (ตอนนี้ ${flagsBefore}) ให้ตักเตือนแทน`,
        `Suspend or ban only for a named rule broken, or at ${FLAGS_TO_REMOVE} flags (now ${flagsBefore}). Give a warning instead.`,
      ),
    );
  }
  const note = rule ? `[${rule}] ${rawNote}` : rawNote;
  // The third flag suspends automatically.
  const autoSuspend = action === "warning" && !!target && target.status === "active" && flagLimitReached(flagsBefore);

  let until: Date | null = null;
  if (autoSuspend) until = new Date(Date.now() + FLAG_SUSPEND_DAYS * 86_400_000);
  if (action === "suspend") {
    const days = int(body.days, 0);
    if (days < 1 || days > 90) return bad(t("จำนวนวันต้องอยู่ระหว่าง 1 ถึง 90", "Days must be between 1 and 90"));
    until = new Date(Date.now() + days * 86_400_000);
  }

  const now = new Date();
  const reportStatus =
    action === "dismiss" ? "dismissed" : action === "note" ? (r.status === "open" ? "in_review" : r.status) : "actioned";
  const resolved = reportStatus === "actioned" || reportStatus === "dismissed";

  const ops: { toSQL(): { sql: string; params: unknown[] } }[] = [
    db
      .update(reports)
      .set({ status: reportStatus, resolvedBy: resolved ? me.id : r.resolvedBy, resolvedAt: resolved ? now : r.resolvedAt })
      .where(eq(reports.id, r.id)),
  ];
  // A note on an event-only report has no account to file it against; the audit row keeps it.
  if (action !== "dismiss" && target) {
    ops.push(
      db.insert(moderationActions).values({ id: newId(), reportId: r.id, accountId: target.id, action, until, note, by: me.id }),
    );
  }
  if (target) {
    if (action === "suspend") {
      ops.push(db.update(accounts).set({ status: "suspended", suspendedUntil: until }).where(eq(accounts.id, target.id)));
      ops.push(db.delete(sessions).where(eq(sessions.accountId, target.id)));
      ops.push(
        notify(
          db,
          target.id,
          "moderation",
          `บัญชีของคุณถูกระงับชั่วคราวถึง ${fmtDay(until!, "th")} เนื่องจากละเมิดหลักปฏิบัติของชุมชน`,
          `Your account is suspended until ${fmtDay(until!, "en")} for breaking the code of conduct`,
          "/code-of-conduct",
        ),
      );
    } else if (action === "ban") {
      ops.push(db.update(accounts).set({ status: "banned", suspendedUntil: null }).where(eq(accounts.id, target.id)));
      ops.push(db.delete(sessions).where(eq(sessions.accountId, target.id)));
    } else if (action === "lift") {
      ops.push(db.update(accounts).set({ status: "active", suspendedUntil: null }).where(eq(accounts.id, target.id)));
    } else if (action === "warning" && autoSuspend) {
      ops.push(db.update(accounts).set({ status: "suspended", suspendedUntil: until }).where(eq(accounts.id, target.id)));
      ops.push(db.delete(sessions).where(eq(sessions.accountId, target.id)));
      ops.push(
        notify(
          db,
          target.id,
          "moderation",
          `คุณได้รับคำเตือนครบ ${FLAGS_TO_REMOVE} ครั้ง บัญชีจึงถูกระงับถึง ${fmtDay(until!, "th")}`,
          `You've reached ${FLAGS_TO_REMOVE} flags, so your account is suspended until ${fmtDay(until!, "en")}`,
          "/code-of-conduct",
        ),
      );
    } else if (action === "warning") {
      ops.push(
        notify(
          db,
          target.id,
          "moderation",
          "คุณได้รับคำเตือนจากทีมงาน โปรดอ่านหลักปฏิบัติของชุมชนอีกครั้ง",
          "You've received a warning from our team. Please review the code of conduct",
          "/code-of-conduct",
        ),
      );
    }
  }
  ops.push(
    audit(db, me.id, `moderation.${action}`, { type: "report", id: r.id }, {
      target: target?.id ?? null,
      until: until ? until.toISOString() : undefined,
      reportStatus,
      rule,
      flags: action === "warning" ? flagsBefore + 1 : flagsBefore,
      autoSuspend: autoSuspend || undefined,
    }),
  );
  await batch(c.env, ops);
  // A banned member's seats go to the waitlist.
  if (target && action === "ban") await releaseUpcomingSeats(c.env, target.id);
  return c.redirect(`/admin/moderation/${encodeURIComponent(r.id)}?notice=saved`);
});
