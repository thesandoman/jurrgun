/**
 * Partners & roles (/admin/partners) — BMA admins only (PRD §13.0).
 *
 * Lists partner organisations and every staff account, creates partner
 * organisations and sets a username's role. Every write is audited.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { asc, eq, ne } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { newId } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { audit } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { normalizeUsername } from "../../domain/rules";
import { accounts, partnerOrgs, profiles, ROLES, type Role } from "../../schema";
import { Button, Card, Empty, Field, Notice, page, str, Tag, view, type View } from "../../ui/kit";

export const adminPartners = new Hono<AppEnv>();
adminPartners.use("*", requireRole("bma_admin"));

export const ROLE_LABELS: Record<Role, [string, string]> = {
  user: ["ผู้ใช้ทั่วไป", "Member"],
  host: ["ผู้จัดกิจกรรม", "Event host"],
  partner_admin: ["แอดมินองค์กรพาร์ตเนอร์", "Partner org admin"],
  moderator: ["ผู้ดูแลความปลอดภัย", "Moderator"],
  insight_viewer: ["ผู้ดูข้อมูลเชิงลึก", "City Insight viewer"],
  bma_admin: ["แอดมิน กทม.", "BMA admin"],
};

async function render(c: Context<AppEnv>, error?: string, status: 200 | 400 = 200) {
  const v: View = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const [orgs, staff] = await Promise.all([
    db.select().from(partnerOrgs).orderBy(asc(partnerOrgs.name)).limit(200),
    db
      .select({
        id: accounts.id,
        username: accounts.username,
        role: accounts.role,
        status: accounts.status,
        partnerOrgId: accounts.partnerOrgId,
        nickname: profiles.nickname,
      })
      .from(accounts)
      .leftJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(ne(accounts.role, "user"))
      .orderBy(asc(accounts.role), asc(accounts.username))
      .limit(200),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const roleLabel = (r: Role) => (lang === "en" ? ROLE_LABELS[r]?.[1] : ROLE_LABELS[r]?.[0]) ?? r;

  return page(
    c,
    { title: t("พาร์ตเนอร์และสิทธิ์", "Partners & roles"), admin: true, status },
    <>
      <h1>{t("พาร์ตเนอร์และสิทธิ์", "Partners & roles")}</h1>
      {error ? <Notice kind="error">{error}</Notice> : null}

      <div class="grid2">
        <Card>
          <h2 style="margin-top:0">{t("กำหนดสิทธิ์ทีมงาน", "Set a staff role")}</h2>
          <form method="post" action="/admin/partners/roles">
            <Field label={t("ชื่อผู้ใช้", "Username")} name="username" required maxlength={30} />
            <div class="field">
              <label for="f-role">{t("บทบาท", "Role")}</label>
              <select id="f-role" name="role" required>
                {ROLES.map((r) => (
                  <option value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label for="f-org">{t("องค์กรพาร์ตเนอร์", "Partner organisation")}</label>
              <select id="f-org" name="partnerOrgId">
                <option value="">{t("— ไม่มี —", "— none —")}</option>
                {orgs.map((o) => (
                  <option value={o.id}>{o.name}</option>
                ))}
              </select>
              <small>{t("จำเป็นสำหรับแอดมินองค์กรพาร์ตเนอร์", "Required for partner org admins")}</small>
            </div>
            <Button>{t("บันทึกสิทธิ์", "Save role")}</Button>
          </form>
        </Card>
        <Card>
          <h2 style="margin-top:0">{t("เพิ่มองค์กรพาร์ตเนอร์", "Add a partner organisation")}</h2>
          <form method="post" action="/admin/partners/orgs">
            <Field label={t("ชื่อองค์กร", "Organisation name")} name="name" required maxlength={100} />
            <Button>{t("เพิ่ม", "Add")}</Button>
          </form>
        </Card>
      </div>

      <h2>{t("องค์กรพาร์ตเนอร์", "Partner organisations")}</h2>
      {orgs.length === 0 ? (
        <Empty>{t("ยังไม่มีองค์กรพาร์ตเนอร์", "No partner organisations yet")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("ชื่อ", "Name")}</th>
                <th>{t("รหัส", "Id")}</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr>
                  <td>{o.name}</td>
                  <td>
                    <small>{o.id}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("บัญชีทีมงาน", "Staff accounts")}</h2>
      {staff.length === 0 ? (
        <Empty>{t("ไม่มีบัญชีทีมงาน", "No staff accounts")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("ชื่อผู้ใช้", "Username")}</th>
                <th>{t("ชื่อเล่น", "Nickname")}</th>
                <th>{t("บทบาท", "Role")}</th>
                <th>{t("องค์กร", "Organisation")}</th>
                <th>{t("สถานะ", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr>
                  <td>@{s.username}</td>
                  <td>{s.nickname ?? "—"}</td>
                  <td>
                    <Tag tone="accent">{roleLabel(s.role)}</Tag>
                  </td>
                  <td>{s.partnerOrgId ? orgName.get(s.partnerOrgId) ?? s.partnerOrgId : "—"}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
}

adminPartners.get("/", (c) => render(c));

adminPartners.post("/orgs", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
  const name = str(body.name);
  if (!name || name.length > 100) {
    return render(c, t("ชื่อองค์กรต้องมี 1–100 ตัวอักษร", "Organisation name must be 1–100 characters"), 400);
  }
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  const id = newId();
  await batch(c.env, [
    db.insert(partnerOrgs).values({ id, name }),
    audit(db, me, "partners.create_org", { type: "partner_org", id }, { name }),
  ]);
  return c.redirect("/admin/partners?notice=saved");
});

adminPartners.post("/roles", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
  const username = normalizeUsername(str(body.username));
  const role = str(body.role) as Role;
  const orgId = str(body.partnerOrgId) || null;
  const me = c.var.user!.account;

  if (!username || !(ROLES as readonly string[]).includes(role)) {
    return render(c, t("กรุณากรอกชื่อผู้ใช้และเลือกบทบาท", "Enter a username and choose a role"), 400);
  }
  if (role === "partner_admin" && !orgId) {
    return render(c, t("แอดมินองค์กรพาร์ตเนอร์ต้องมีองค์กร", "A partner org admin needs an organisation"), 400);
  }
  const db = getDb(c.env);
  const [target] = await db
    .select({ id: accounts.id, role: accounts.role, partnerOrgId: accounts.partnerOrgId })
    .from(accounts)
    .where(eq(accounts.username, username))
    .limit(1);
  if (!target) return render(c, t("ไม่พบชื่อผู้ใช้นี้", "No account with that username"), 400);
  if (target.id === me.id && role !== "bma_admin") {
    return render(c, t("คุณไม่สามารถลดสิทธิ์ของตัวเองได้", "You can't demote yourself"), 400);
  }
  if (orgId) {
    const [org] = await db.select({ id: partnerOrgs.id }).from(partnerOrgs).where(eq(partnerOrgs.id, orgId)).limit(1);
    if (!org) return render(c, t("ไม่พบองค์กรนี้", "Unknown organisation"), 400);
  }
  await batch(c.env, [
    db.update(accounts).set({ role, partnerOrgId: orgId }).where(eq(accounts.id, target.id)),
    audit(db, me.id, "partners.set_role", { type: "account", id: target.id }, {
      username,
      from: target.role,
      to: role,
      fromOrg: target.partnerOrgId,
      toOrg: orgId,
    }),
  ]);
  return c.redirect("/admin/partners?notice=saved");
});
