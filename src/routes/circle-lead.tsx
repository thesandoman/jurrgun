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
    { title: t("เป็นเจ้าภาพโต๊ะประจำ", "Host a regular table"), tab: "connections" },
    <>
      <h1>👥 {t("ตั้งโต๊ะประจำของคุณเอง", "Host your own regular table")}</h1>
      <p class="muted">
        {t(
          "เจ้าภาพโต๊ะจัดแฮงเอาต์ให้คนในโต๊ะประจำได้ ทีมงานจะตรวจคำขอก่อน เพื่อให้ทุกโต๊ะประจำปลอดภัยและน่าไป",
          "Table Hosts run hangouts for their regular table. Our team reviews each request first, so every regular table stays safe and worth joining.",
        )}
      </p>
      {host ? (
        <Card>
          <h2 style="margin-top:0">✅ {t("คุณจัดกิจกรรมได้แล้ว", "You can host")}</h2>
          <p class="row">
            <LinkButton href="/host/new?table=1">{t("จัดแฮงเอาต์ให้โต๊ะประจำ", "Host a regular table hangout")}</LinkButton>
            <LinkButton href="/tables" kind="ghost">
              🪑 {t("โต๊ะประจำของฉัน", "My regular tables")}
            </LinkButton>
          </p>
        </Card>
      ) : last?.status === "pending" ? (
        <Notice kind="info">
          {t(`ส่งคำขอเป็นเจ้าภาพโต๊ะประจำ "${last.circleName}" แล้ว ตอนนี้รอทีมงานตรวจ`, `Your request to host "${last.circleName}" is with our team.`)}
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
              <Field label={t("ชื่อโต๊ะประจำ", "Regular table name")} name="circleName" maxlength={MAX_NAME} required hint={t("เช่น วิ่งเช้าลุมพินี", "e.g. Lumphini morning runners")} />
              <TextArea
                label={t("อยากจัดอะไรให้โต๊ะประจำ", "What would you host?")}
                name="plan"
                rows={3}
                maxlength={MAX_PLAN}
                hint={t("ประเภทกิจกรรม บ่อยแค่ไหน และย่านไหน", "The kind of hangouts, how often, and where.")}
              />
              <label class="check guide-promise">
                <input type="checkbox" name="agree" value="1" required />
                <span>
                  {t(
                    "ฉันจะนัดในที่สาธารณะ ดูแลทุกคนในโต๊ะ และทำตามหลักปฏิบัติของชุมชน",
                    "I'll meet in public places, look after everyone at my regular table, and follow the code of conduct.",
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
