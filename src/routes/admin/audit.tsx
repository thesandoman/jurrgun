/**
 * Audit log viewer (/admin/audit) — BMA admins only (PRD §13.2: "all
 * sensitive admin access should be role-based and logged").
 *
 * Read-only: the latest 200 rows, filterable by action prefix and actor id.
 */
import { Hono } from "hono";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import type { AppEnv } from "../../lib/env";
import { requireRole } from "../../lib/session";
import { accounts, auditLog, profiles } from "../../schema";
import { Button, Empty, page, view } from "../../ui/kit";

export const adminAudit = new Hono<AppEnv>();
adminAudit.use("*", requireRole("bma_admin"));

const BKK_TIME = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

/** "2026-10-09 14:05:33" in Bangkok time. */
export function bkkTime(d: Date): string {
  const p = Object.fromEntries(BKK_TIME.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Escape LIKE wildcards so a filter is a literal prefix. */
function likePrefix(raw: string): string {
  return raw.replace(/[\\%_]/g, (m) => `\\${m}`) + "%";
}

adminAudit.get("/", async (c) => {
  const { t } = view(c);
  const action = (c.req.query("action") ?? "").trim().slice(0, 80);
  const actor = (c.req.query("actor") ?? "").trim().slice(0, 80);
  const db = getDb(c.env);

  const where: SQL[] = [];
  if (action) where.push(like(auditLog.action, likePrefix(action)));
  if (actor) where.push(eq(auditLog.actor, actor));

  const rows = await db
    .select({
      id: auditLog.id,
      actor: auditLog.actor,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
      username: accounts.username,
      nickname: profiles.nickname,
    })
    .from(auditLog)
    .leftJoin(accounts, eq(accounts.id, auditLog.actor))
    .leftJoin(profiles, eq(profiles.accountId, auditLog.actor))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return page(
    c,
    { title: t("บันทึกการตรวจสอบ", "Audit log"), admin: true },
    <>
      <h1>{t("บันทึกการตรวจสอบ", "Audit log")}</h1>
      <p class="muted">
        {t(
          "ทุกการแก้ไขของทีมงานและการเปิดดูข้อมูลที่อ่อนไหวจะถูกบันทึกไว้ (แสดง 200 รายการล่าสุด เวลากรุงเทพฯ)",
          "Every staff change and sensitive read is recorded here (latest 200, Bangkok time).",
        )}
      </p>
      <form method="get" class="row">
        <input type="search" name="action" value={action} placeholder={t("การกระทำขึ้นต้นด้วย เช่น moderation.", "Action prefix, e.g. moderation.")} aria-label={t("การกระทำ", "Action")} style="max-width:260px" />
        <input type="search" name="actor" value={actor} placeholder={t("รหัสผู้กระทำ", "Actor id")} aria-label={t("รหัสผู้กระทำ", "Actor id")} style="max-width:260px" />
        <Button kind="ghost">{t("กรอง", "Filter")}</Button>
        {action || actor ? <a href="/admin/audit">{t("ล้างตัวกรอง", "Clear")}</a> : null}
      </form>
      {rows.length === 0 ? (
        <Empty>{t("ไม่มีรายการ", "No entries")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("เวลา", "Time")}</th>
                <th>{t("ผู้กระทำ", "Actor")}</th>
                <th>{t("การกระทำ", "Action")}</th>
                <th>{t("เป้าหมาย", "Target")}</th>
                <th>{t("รายละเอียด", "Detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td style="white-space:nowrap">{bkkTime(r.createdAt)}</td>
                  <td>
                    <a href={`/admin/audit?actor=${encodeURIComponent(r.actor)}`}>{r.nickname ?? r.username ?? r.actor}</a>
                    {r.username ? <small> @{r.username}</small> : null}
                  </td>
                  <td>
                    <code>{r.action}</code>
                  </td>
                  <td>{r.targetType ? <small>{`${r.targetType}:${r.targetId ?? ""}`}</small> : null}</td>
                  <td>
                    <small>
                      <code style="word-break:break-all">{JSON.stringify(r.detail ?? {})}</code>
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});
