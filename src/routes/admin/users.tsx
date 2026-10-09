/**
 * User lookup (/admin/users) — moderators and BMA admins (PRD §13.2).
 *
 * Search is by exact username or internal id only — no browsing, no fuzzy
 * search — and every search and every profile view is written to the audit
 * log. The page shows account basics only: never relationship status,
 * romance settings, gender identity, age preferences or connection choices.
 *
 * Verification and Bangkok-registration toggles are manual stand-ins until
 * the ThaiD / BMA registry integrations exist; BMA admins only.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { desc, eq, or, sql } from "drizzle-orm";
import { batch, getDb } from "../../db";
import type { AppEnv } from "../../lib/env";
import { label, DISTRICTS } from "../../lib/constants";
import { fmtDate, fmtDay } from "../../lib/i18n";
import { audit } from "../../lib/records";
import { hasRole, requireRole } from "../../lib/session";
import { accounts, moderationActions, profiles, reports } from "../../schema";
import { Button, Card, Empty, page, str, Tag, view } from "../../ui/kit";

export const adminUsers = new Hono<AppEnv>();
adminUsers.use("*", requireRole("moderator"));

const VERIFICATION = ["none", "verified"] as const;
const BKK = ["not_checked", "verified", "not_verified"] as const;

/** Only the columns staff may see. Deliberately not `select()` on profiles. */
const basics = {
  id: accounts.id,
  username: accounts.username,
  role: accounts.role,
  status: accounts.status,
  suspendedUntil: accounts.suspendedUntil,
  verification: accounts.verification,
  bkkRegistered: accounts.bkkRegistered,
  createdAt: accounts.createdAt,
  nickname: profiles.nickname,
  district: profiles.district,
};

adminUsers.get("/", async (c) => {
  const { t, lang } = view(c);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  let rows: { id: string; username: string; role: string; status: string; nickname: string | null }[] = [];
  if (q) {
    rows = await db
      .select({ id: accounts.id, username: accounts.username, role: accounts.role, status: accounts.status, nickname: profiles.nickname })
      .from(accounts)
      .leftJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(or(eq(accounts.username, q.toLowerCase()), eq(accounts.id, q)))
      .limit(20);
    await audit(db, me, "users.search", undefined, { q, results: rows.length });
  }
  return page(
    c,
    { title: t("ค้นหาผู้ใช้", "Find a user"), admin: true },
    <>
      <h1>{t("ค้นหาผู้ใช้", "Find a user")}</h1>
      <p class="muted">
        {t(
          "ค้นหาด้วยชื่อผู้ใช้หรือรหัสภายในแบบตรงตัวเท่านั้น ทุกการค้นหาจะถูกบันทึก",
          "Search by exact username or internal id only. Every search is logged.",
        )}
      </p>
      <form method="get" class="row">
        <input type="search" name="q" value={q} required maxlength={80} placeholder={t("ชื่อผู้ใช้ หรือ รหัส", "Username or id")} aria-label={t("ชื่อผู้ใช้ หรือ รหัส", "Username or id")} style="max-width:320px" />
        <Button>{t("ค้นหา", "Search")}</Button>
      </form>
      {q ? (
        rows.length === 0 ? (
          <Empty>{t("ไม่พบผู้ใช้", "No matching account")}</Empty>
        ) : (
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("ชื่อผู้ใช้", "Username")}</th>
                  <th>{t("ชื่อเล่น", "Nickname")}</th>
                  <th>{t("บทบาท", "Role")}</th>
                  <th>{t("สถานะ", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr>
                    <td>
                      <a href={`/admin/users/${encodeURIComponent(r.id)}`}>@{r.username}</a>
                    </td>
                    <td>{r.nickname ?? "—"}</td>
                    <td>{r.role}</td>
                    <td>{statusTag(r.status, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </>,
  );
});

export function statusTag(status: string, lang: "th" | "en") {
  const names: Record<string, [string, string, "ok" | "warn" | "muted"]> = {
    active: ["ใช้งานได้", "Active", "ok"],
    suspended: ["ถูกระงับชั่วคราว", "Suspended", "warn"],
    banned: ["ถูกแบน", "Banned", "warn"],
    deactivated: ["ปิดบัญชีแล้ว", "Deactivated", "muted"],
  };
  const n = names[status];
  if (!n) return <Tag>{status}</Tag>;
  return <Tag tone={n[2]}>{lang === "en" ? n[1] : n[0]}</Tag>;
}

adminUsers.get("/:id", async (c) => {
  const { t, lang } = view(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const me = c.var.user!.account;
  const [acct] = await db.select(basics).from(accounts).leftJoin(profiles, eq(profiles.accountId, accounts.id)).where(eq(accounts.id, id)).limit(1);
  if (!acct) return c.text("Not found", 404);

  const [history, reportCounts] = await Promise.all([
    db
      .select({
        id: moderationActions.id,
        action: moderationActions.action,
        until: moderationActions.until,
        note: moderationActions.note,
        reportId: moderationActions.reportId,
        createdAt: moderationActions.createdAt,
        byUsername: accounts.username,
      })
      .from(moderationActions)
      .leftJoin(accounts, eq(accounts.id, moderationActions.by))
      .where(eq(moderationActions.accountId, id))
      .orderBy(desc(moderationActions.createdAt))
      .limit(50),
    db
      .select({
        against: sql<number>`sum(case when ${reports.targetAccount} = ${id} then 1 else 0 end)`.mapWith(Number),
        againstOpen: sql<number>`sum(case when ${reports.targetAccount} = ${id} and ${reports.status} in ('open','in_review') then 1 else 0 end)`.mapWith(Number),
        filed: sql<number>`sum(case when ${reports.reporter} = ${id} then 1 else 0 end)`.mapWith(Number),
      })
      .from(reports)
      .where(or(eq(reports.targetAccount, id), eq(reports.reporter, id))),
  ]);
  await audit(db, me.id, "users.view", { type: "account", id });

  const counts = reportCounts[0] ?? { against: 0, againstOpen: 0, filed: 0 };
  const admin = hasRole(me.role, []);
  const verLabel: Record<string, [string, string]> = { none: ["ยังไม่ยืนยัน", "Not verified"], verified: ["ยืนยันแล้ว", "Verified"] };
  const bkkLabel: Record<string, [string, string]> = {
    not_checked: ["ยังไม่ตรวจสอบ", "Not checked"],
    verified: ["ยืนยันว่ามีทะเบียนบ้านใน กทม.", "Verified Bangkok-registered"],
    not_verified: ["ไม่ผ่านการยืนยัน", "Not verified"],
  };
  const L2 = (m: Record<string, [string, string]>, k: string) => (m[k] ? (lang === "en" ? m[k][1] : m[k][0]) : k);

  return page(
    c,
    { title: `@${acct.username}`, admin: true },
    <>
      <p>
        <a href="/admin/users">← {t("ค้นหาผู้ใช้", "Find a user")}</a>
      </p>
      <h1>
        {acct.nickname ?? "—"} <small>@{acct.username}</small>
      </h1>
      <Card>
        <div class="table-wrap" style="border:none;margin:0">
          <table>
            <tbody>
              <tr><th>{t("รหัสภายใน", "Internal id")}</th><td><small>{acct.id}</small></td></tr>
              <tr><th>{t("บทบาท", "Role")}</th><td>{acct.role}</td></tr>
              <tr>
                <th>{t("สถานะ", "Status")}</th>
                <td>
                  {statusTag(acct.status, lang)}
                  {acct.status === "suspended" && acct.suspendedUntil ? <small> {t("ถึง", "until")} {fmtDate(acct.suspendedUntil, lang)}</small> : null}
                </td>
              </tr>
              <tr><th>{t("การยืนยันบัญชี", "Account verification")}</th><td>{L2(verLabel, acct.verification)}</td></tr>
              <tr><th>{t("ทะเบียนบ้าน กทม.", "Bangkok registration")}</th><td>{L2(bkkLabel, acct.bkkRegistered)}</td></tr>
              <tr><th>{t("เขต", "District")}</th><td>{acct.district ? label(DISTRICTS, acct.district, lang) : "—"}</td></tr>
              <tr><th>{t("สร้างเมื่อ", "Created")}</th><td>{fmtDay(acct.createdAt, lang)}</td></tr>
              <tr>
                <th>{t("รายงาน", "Reports")}</th>
                <td>
                  {t("ถูกรายงาน", "Reported")} {counts.against ?? 0} ({t("ค้างอยู่", "open")} {counts.againstOpen ?? 0}) ·{" "}
                  {t("รายงานผู้อื่น", "Filed")} {counts.filed ?? 0}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted">
          {t(
            "ข้อมูลสถานะความสัมพันธ์ การตั้งค่าโรแมนซ์ อัตลักษณ์ทางเพศ ช่วงอายุที่สนใจ และตัวเลือกการเชื่อมต่อ จะไม่แสดงแก่ทีมงานไม่ว่ากรณีใด",
            "Relationship status, romance settings, gender identity, age preferences and connection choices are never shown to staff.",
          )}
        </p>
      </Card>

      {admin ? (
        <Card>
          <h2 style="margin-top:0">{t("การยืนยันตัวตน (ชั่วคราว)", "Verification (manual stand-in)")}</h2>
          <p class="muted">
            {t(
              "ใช้แทนชั่วคราวจนกว่าจะเชื่อมต่อ ThaiD และระบบทะเบียนของ กทม. ทุกการเปลี่ยนแปลงจะถูกบันทึก",
              "A stand-in until ThaiD and the BMA registry are integrated. Every change is logged.",
            )}
          </p>
          <div class="grid2">
            <form method="post" action={`/admin/users/${encodeURIComponent(acct.id)}/verification`} class="row">
              <select name="value" aria-label={t("การยืนยันบัญชี", "Account verification")} style="max-width:220px">
                {VERIFICATION.map((v) => (
                  <option value={v} selected={v === acct.verification}>{L2(verLabel, v)}</option>
                ))}
              </select>
              <Button kind="ghost">{t("บันทึก", "Save")}</Button>
            </form>
            <form method="post" action={`/admin/users/${encodeURIComponent(acct.id)}/bkk`} class="row">
              <select name="value" aria-label={t("ทะเบียนบ้าน กทม.", "Bangkok registration")} style="max-width:260px">
                {BKK.map((v) => (
                  <option value={v} selected={v === acct.bkkRegistered}>{L2(bkkLabel, v)}</option>
                ))}
              </select>
              <Button kind="ghost">{t("บันทึก", "Save")}</Button>
            </form>
          </div>
        </Card>
      ) : null}

      <h2>{t("ประวัติการดำเนินการ", "Moderation history")}</h2>
      {history.length === 0 ? (
        <Empty>{t("ไม่มีประวัติ", "No moderation history")}</Empty>
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
              {history.map((h) => (
                <tr>
                  <td>{fmtDate(h.createdAt, lang)}</td>
                  <td>
                    {h.action}
                    {h.until ? <small> → {fmtDay(h.until, lang)}</small> : null}
                    {h.reportId ? (
                      <>
                        {" "}
                        <a href={`/admin/moderation/${encodeURIComponent(h.reportId)}`}>{t("รายงาน", "report")}</a>
                      </>
                    ) : null}
                  </td>
                  <td>{h.byUsername ? `@${h.byUsername}` : "—"}</td>
                  <td>{h.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});

async function setField(c: Context<AppEnv>, field: "verification" | "bkkRegistered", allowed: readonly string[]) {
  const me = c.var.user!.account;
  if (!hasRole(me.role, [])) return c.text("Forbidden", 403);
  const id = c.req.param("id") ?? "";
  const body = await c.req.parseBody();
  const value = str(body.value);
  if (!allowed.includes(value)) return c.text("Bad request", 400);
  const db = getDb(c.env);
  const [acct] = await db.select({ id: accounts.id, old: accounts[field] }).from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!acct) return c.text("Not found", 404);
  await batch(c.env, [
    db.update(accounts).set({ [field]: value }).where(eq(accounts.id, id)),
    audit(db, me.id, field === "verification" ? "users.set_verification" : "users.set_bkk_registered", { type: "account", id }, {
      from: acct.old,
      to: value,
    }),
  ]);
  return c.redirect(`/admin/users/${encodeURIComponent(id)}?notice=saved`);
}

adminUsers.post("/:id/verification", (c) => setField(c, "verification", VERIFICATION));
adminUsers.post("/:id/bkk", (c) => setField(c, "bkkRegistered", BKK));
