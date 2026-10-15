/**
 * Asking to lead a circle. Only circle heads (approved by an admin or
 * moderator in /admin/review), verified partners and admins can host
 * (domain/hosting.ts canHost); every other member starts here.
 *
 *   GET  /circles/lead   status, or the request form
 *   POST /circles/lead   send a request (one waiting at a time)
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { canHost } from "../domain/hosting";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { audit } from "../lib/records";
import { requireMember } from "../lib/session";
import { circleHeadRequests } from "../schema";
import { Button, Card, Field, LinkButton, Notice, page, str, TextArea, view } from "../ui/kit";

export const circleLeadRoutes = new Hono<AppEnv>();
const MAX_NAME = 60;
const MAX_PLAN = 600;

circleLeadRoutes.get("/circles/lead", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const user = c.var.user!;
  const [last] = await getDb(c.env)
    .select()
    .from(circleHeadRequests)
    .where(eq(circleHeadRequests.accountId, user.account.id))
    .orderBy(desc(circleHeadRequests.createdAt))
    .limit(1);
  const host = canHost(user.account, true);
  return page(
    c,
    { title: t("เป็นหัวหน้าวง", "Lead a circle"), tab: "connections" },
    <>
      <h1>👥 {t("ตั้งวงของคุณเอง", "Lead your own circle")}</h1>
      <p class="muted">
        {t(
          "หัวหน้าวงจัดแฮงเอาต์ให้คนในวงได้ ทีมงานจะตรวจคำขอก่อน เพื่อให้ทุกวงปลอดภัยและน่าไป",
          "Circle heads host hangouts for their circle. Our team reviews each request first, so every circle stays safe and worth joining.",
        )}
      </p>
      {host ? (
        <Card>
          <h2 style="margin-top:0">✅ {t("คุณจัดกิจกรรมได้แล้ว", "You can host")}</h2>
          <LinkButton href="/host/new?visibility=private">{t("จัดแฮงเอาต์ให้วง", "Host a circle hangout")}</LinkButton>
        </Card>
      ) : last?.status === "pending" ? (
        <Notice kind="info">
          {t(`ส่งคำขอเป็นหัวหน้าวง "${last.circleName}" แล้ว ตอนนี้รอทีมงานตรวจ`, `Your request to lead "${last.circleName}" is with our team.`)}
        </Notice>
      ) : (
        <>
          {last?.status === "declined" ? (
            <Notice kind="warn">
              {t("คำขอล่าสุดยังไม่ผ่าน", "Your last request wasn't approved")}
              {last.reviewNote ? `: ${last.reviewNote}` : "."}
            </Notice>
          ) : null}
          <Card>
            <form method="post" action="/circles/lead">
              <Field label={t("ชื่อวง", "Circle name")} name="circleName" maxlength={MAX_NAME} required hint={t("เช่น วิ่งเช้าลุมพินี", "e.g. Lumphini morning runners")} />
              <TextArea
                label={t("อยากจัดอะไรให้วง", "What would you host?")}
                name="plan"
                rows={3}
                maxlength={MAX_PLAN}
                hint={t("ประเภทกิจกรรม บ่อยแค่ไหน และย่านไหน", "The kind of hangouts, how often, and where.")}
              />
              <label class="check guide-promise">
                <input type="checkbox" name="agree" value="1" required />
                <span>
                  {t(
                    "ฉันจะนัดในที่สาธารณะ ดูแลทุกคนในวง และทำตามหลักปฏิบัติของชุมชน",
                    "I'll meet in public places, look after everyone in my circle, and follow the code of conduct.",
                  )}
                </span>
              </label>
              <Button>{t("ส่งคำขอ", "Send request")}</Button>
            </form>
          </Card>
        </>
      )}
    </>,
  );
});

circleLeadRoutes.post("/circles/lead", requireMember, async (c) => {
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const circleName = str(body.circleName).slice(0, MAX_NAME);
  const plan = str(body.plan).slice(0, MAX_PLAN);
  if (!circleName || body.agree !== "1" || canHost(user.account, true)) return c.redirect("/circles/lead");
  const db = getDb(c.env);
  const [waiting] = await db
    .select({ id: circleHeadRequests.id })
    .from(circleHeadRequests)
    .where(and(eq(circleHeadRequests.accountId, user.account.id), eq(circleHeadRequests.status, "pending")))
    .limit(1);
  if (!waiting) {
    const id = newId();
    await db.insert(circleHeadRequests).values({ id, accountId: user.account.id, circleName, plan });
    await audit(db, user.account.id, "circle_head.request", { type: "circle_head_request", id });
  }
  return c.redirect("/circles/lead");
});
