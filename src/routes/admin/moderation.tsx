/**
 * Moderation queue (/admin/moderation) — moderators and BMA admins
 * (PRD §11, §13.2).
 *
 *   GET  /            queue, ?status=open|in_review|actioned|dismissed
 *   GET  /:id         case detail (audited); ?history=1 adds the target's event
 *                     participation history, audited separately
 *   POST /:id/action  note | warning | suspend | ban | lift | dismiss
 *
 * Staff never see relationship status, romance settings, gender identity,
 * age preferences or connection choices here — only account basics.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { aliasedTable, and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { label, REPORT_REASON_LABELS } from "../../lib/constants";
import { newId } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { fmtDate, fmtDay } from "../../lib/i18n";
import { audit, notify } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { accounts, events, moderationActions, profiles, registrations, reports, sessions } from "../../schema";
import { Button, Card, Empty, Field, int, Notice, page, str, Tag, TextArea, view } from "../../ui/kit";
import { statusTag } from "./users";
import { releaseUpcomingSeats } from "../../services/events";

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

adminModeration.get("/", async (c) => {
  const { t, lang } = view(c);
  const raw = c.req.query("status") ?? "open";
  const status = (STATUSES as readonly string[]).includes(raw) ? raw : "open";
  const db = getDb(c.env);
  const [rows, counts] = await Promise.all([
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
      .where(eq(reports.status, status))
      .orderBy(sql`case when ${reports.severity} = 'critical' then 0 else 1 end`, asc(reports.createdAt))
      .limit(100),
    db
      .select({ status: reports.status, n: sql<number>`count(*)`.mapWith(Number) })
      .from(reports)
      .groupBy(reports.status)
      .limit(10),
  ]);
  const countOf = new Map(counts.map((r) => [r.status, r.n]));

  return page(
    c,
    { title: t("คิวรายงาน", "Moderation queue"), admin: true },
    <>
      <h1>{t("คิวรายงาน", "Moderation queue")}</h1>
      <p class="muted">
        {t(
          "รายงานด่วน (critical) แสดงก่อน แล้วเรียงจากเก่าสุด เป้าหมายการตอบสนอง: ด่วน 1 ชม. ทั่วไป 24 ชม.",
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
      {rows.length === 0 ? (
        <Empty>{t("ไม่มีรายงานในสถานะนี้", "No reports with this status")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
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
                  <td>{age(r.createdAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <h3>{t("รายละเอียดจากผู้รายงาน", "Reporter's details")}</h3>
        <p style="white-space:pre-wrap">{r.details || t("(ไม่มีรายละเอียด)", "(no details)")}</p>
      </Card>

      {target ? (
        <Card>
          <h2 style="margin-top:0">{t("บัญชีที่ถูกรายงาน", "Reported account")}</h2>
          <p>
            <strong>{target.nickname ?? "—"}</strong> <small>@{target.username}</small> {statusTag(target.status, lang)}
            {target.status === "suspended" && target.suspendedUntil ? <small> {t("ถึง", "until")} {fmtDate(target.suspendedUntil, lang)}</small> : null}
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
          <Notice kind="warn">{t("ผู้ดูแลไม่สามารถดำเนินการกับบัญชีแอดมิน กทม. ได้", "Moderators can't act on a BMA admin account.")}</Notice>
        ) : null}
        <form method="post" action={`/admin/moderation/${encodeURIComponent(r.id)}/action`}>
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
          {target ? <Field label={t("จำนวนวันที่ระงับ (1–90)", "Suspension days (1–90)")} name="days" type="number" min={1} max={90} value={7} /> : null}
          <TextArea
            label={t("บันทึกของผู้ดูแล", "Moderator note")}
            name="note"
            maxlength={2000}
            hint={t("จำเป็นสำหรับการตักเตือน ระงับ และแบน ผู้ถูกรายงานจะไม่เห็นบันทึกนี้", "Required for warning, suspension and ban. The member never sees it.")}
          />
          <Button kind="danger">{t("ยืนยันการดำเนินการ", "Confirm action")}</Button>
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
  const note = str(body.note).slice(0, 2000);
  const bad = (msg: string) => renderDetail(c, id, { error: msg, status: 400 });

  if (!(ACTIONS as readonly string[]).includes(action)) return bad(t("การดำเนินการไม่ถูกต้อง", "Unknown action"));
  if ((action === "warning" || action === "suspend" || action === "ban") && !note) {
    return bad(t("กรุณาใส่บันทึกสำหรับการดำเนินการนี้", "A note is required for this action"));
  }

  const targetId = r.targetAccount;
  const needsTarget = action === "warning" || action === "suspend" || action === "ban" || action === "lift";
  if (needsTarget && !targetId) return bad(t("รายงานนี้ไม่มีบัญชีเป้าหมาย", "This report has no target account"));

  let target: { id: string; role: string } | null = null;
  if (targetId) {
    const [x] = await db.select({ id: accounts.id, role: accounts.role }).from(accounts).where(eq(accounts.id, targetId)).limit(1);
    target = x ?? null;
    if (needsTarget && !target) return bad(t("ไม่พบบัญชีเป้าหมาย", "Target account not found"));
  }
  if (target && action !== "dismiss" && action !== "note") {
    if (target.role === "bma_admin" && me.role !== "bma_admin") return c.text("Forbidden", 403);
    if (target.id === me.id) return bad(t("ไม่สามารถดำเนินการกับบัญชีของตัวเองได้", "You can't act on your own account"));
  }

  let until: Date | null = null;
  if (action === "suspend") {
    const days = int(body.days, 0);
    if (days < 1 || days > 90) return bad(t("จำนวนวันต้องอยู่ระหว่าง 1–90", "Days must be between 1 and 90"));
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
    } else if (action === "warning") {
      ops.push(
        notify(
          db,
          target.id,
          "moderation",
          "คุณได้รับคำเตือนจากทีมงาน กรุณาทบทวนหลักปฏิบัติของชุมชน",
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
    }),
  );
  await batch(c.env, ops);
  // A banned member's seats go to the waitlist.
  if (target && action === "ban") await releaseUpcomingSeats(c.env, target.id);
  return c.redirect(`/admin/moderation/${encodeURIComponent(r.id)}?notice=saved`);
});
