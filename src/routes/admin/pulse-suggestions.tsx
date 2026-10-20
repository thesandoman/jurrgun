/**
 * Sorting members' suggested City Pulse questions (owner D66).
 *
 *   GET  /admin/pulse-suggestions          the waiting suggestions (oldest month first)
 *   POST /admin/pulse-suggestions/:id      sort into a topic, or drop
 *
 * Moderators only, on purpose: the words never reach the BMA, so bma_admin is
 * refused here even though it passes most staff checks. Sorting wipes the
 * words; only the topic stays, and the BMA sees topic totals of 10 or more on
 * /admin/pulse/topics. Rows hold no person: no account, no research code,
 * only the month.
 */
import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { batch, getDb } from "../../db";
import type { AppEnv } from "../../lib/env";
import { audit } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { pulseSuggestions } from "../../schema";
import { SUGGEST_TOPICS } from "../../content/pulse";
import { Button, Empty, page, Select, str, view } from "../../ui/kit";

export const adminPulseSuggestions = new Hono<AppEnv>();
adminPulseSuggestions.use("*", requireRole("moderator"));
adminPulseSuggestions.use("*", async (c, next) => {
  if (c.var.user!.account.role !== "moderator") return c.text("Forbidden", 403);
  await next();
});

adminPulseSuggestions.get("/", async (c) => {
  const { t, lang } = view(c);
  const rows = await getDb(c.env)
    .select()
    .from(pulseSuggestions)
    .where(eq(pulseSuggestions.status, "new"))
    .orderBy(asc(pulseSuggestions.month), asc(pulseSuggestions.id))
    .limit(50);
  return page(
    c,
    { title: t("คำถามที่สมาชิกเสนอ", "Suggested questions"), admin: true },
    <>
      <h1>{t("คำถามที่สมาชิกเสนอ", "Suggested questions")}</h1>
      <p class="muted">
        {t(
          "จัดแต่ละข้อเป็นหัวข้อ เมื่อจัดแล้วข้อความจะถูกลบ เหลือแค่หัวข้อ กทม. เห็นเฉพาะจำนวนต่อหัวข้อที่มีอย่างน้อย 10 ข้อความที่มีข้อมูลส่วนตัวหรือไม่เกี่ยวข้อง ให้กดทิ้ง",
          "Sort each one into a topic. Sorting deletes the words and keeps only the topic; the BMA sees counts per topic of 10 or more. Drop anything with personal details or that's off topic.",
        )}
      </p>
      {rows.length === 0 ? (
        <Empty>{t("ไม่มีคำถามรออยู่", "Nothing waiting")}</Empty>
      ) : (
        <ul class="plain" style="list-style:none;padding:0;display:grid;gap:16px">
          {rows.map((r) => (
            <li class="card">
              <p style="margin-top:0">{r.body}</p>
              <form method="post" action={`/admin/pulse-suggestions/${encodeURIComponent(r.id)}`} class="row" style="align-items:end;flex-wrap:wrap">
                <Select label={t("หัวข้อ", "Topic")} name="topic" options={SUGGEST_TOPICS} lang={lang} blank={t("เลือกหัวข้อ", "Choose a topic")} />
                <Button name="do" value="sort">{t("จัดหัวข้อแล้วลบข้อความ", "Sort and delete the words")}</Button>
                <Button name="do" value="drop" kind="ghost">{t("ทิ้ง", "Drop")}</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>,
  );
});

adminPulseSuggestions.post("/:id", async (c) => {
  const body = await c.req.parseBody();
  const action = str(body.do);
  const topic = str(body.topic);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const me = c.var.user!.account.id;
  if (action === "sort") {
    if (!SUGGEST_TOPICS.some((o) => o.value === topic)) return c.text("Choose a topic first", 400);
    await batch(c.env, [
      db.update(pulseSuggestions).set({ topic, status: "sorted", body: "" }).where(and(eq(pulseSuggestions.id, id), eq(pulseSuggestions.status, "new"))),
      audit(db, me, "pulse.suggestion_sort", { type: "pulse_suggestion", id }, { topic }),
    ]);
  } else if (action === "drop") {
    await batch(c.env, [
      db.update(pulseSuggestions).set({ status: "dropped", body: "" }).where(and(eq(pulseSuggestions.id, id), eq(pulseSuggestions.status, "new"))),
      audit(db, me, "pulse.suggestion_drop", { type: "pulse_suggestion", id }, {}),
    ]);
  } else return c.text("Bad request", 400);
  return c.redirect("/admin/pulse-suggestions?notice=saved");
});
