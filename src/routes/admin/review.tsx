/**
 * Review queue for members' event proposals (bma_admin, moderator).
 *
 *   GET  /admin/review                 proposals waiting, oldest first
 *   POST /admin/review/:id/approve     publish (optionally trust the host from now on)
 *   POST /admin/review/:id/reject      send back with a note the host sees
 *
 * Approving gives a plain member the "host" role, so they can run check-in and
 * groups for their own events in /admin/events. Trusting a host means their
 * future events skip this queue.
 */
import { Hono, type Context } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, label } from "../../lib/constants";
import type { AppEnv } from "../../lib/env";
import { fmtDate } from "../../lib/i18n";
import { audit, notify } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { accounts, events, profiles } from "../../schema";
import { Button, Card, Empty, Notice, page, str, Tag, TextArea, Toggle, view } from "../../ui/kit";

export const adminReview = new Hono<AppEnv>();
adminReview.use("*", requireRole("moderator"));

type C = Context<AppEnv>;
const MAX_NOTE = 500;

adminReview.get("/", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const db = getDb(c.env);
  const queue = await db
    .select({ e: events, nickname: profiles.nickname, hostRole: accounts.role, trusted: accounts.trustedHost })
    .from(events)
    .leftJoin(accounts, eq(accounts.id, events.createdBy))
    .leftJoin(profiles, eq(profiles.accountId, events.createdBy))
    .where(eq(events.status, "pending"))
    .orderBy(asc(events.submittedAt))
    .limit(100);
  const notice = c.req.query("notice");
  return page(
    c,
    { title: t("ตรวจกิจกรรม", "Event review"), admin: true },
    <>
      <h1>{t("กิจกรรมที่สมาชิกเสนอ", "Events proposed by members")}</h1>
      <p class="muted">{t("ตรวจความปลอดภัย ความถูกต้อง และหลักปฏิบัติ ก่อนเผยแพร่", "Check safety, accuracy and the code of conduct before anything goes live.")}</p>
      {notice === "approved" ? <Notice kind="ok">{t("เผยแพร่แล้ว และแจ้งผู้จัดแล้ว", "Published, and the host has been told.")}</Notice> : null}
      {notice === "rejected" ? <Notice kind="ok">{t("ส่งกลับให้ผู้จัดแก้ไขแล้ว", "Sent back to the host with your note.")}</Notice> : null}
      {notice === "own" ? <Notice kind="warn">{t("อนุมัติกิจกรรมของตัวเองไม่ได้ ให้ทีมงานคนอื่นตรวจ", "You can't approve your own event. Ask another reviewer.")}</Notice> : null}
      {notice === "gone" ? <Notice kind="warn">{t("รายการนี้ถูกตรวจหรือถอนไปแล้ว", "That one was already reviewed or withdrawn.")}</Notice> : null}
      {notice === "need_note" ? <Notice kind="error">{t("ใส่เหตุผลให้ผู้จัด (ไม่เกิน 500 ตัวอักษร)", "Add a note for the host (up to 500 characters).")}</Notice> : null}
      {queue.length === 0 ? (
        <Empty>{t("ไม่มีกิจกรรมรอตรวจ", "Nothing waiting for review.")}</Empty>
      ) : (
        queue.map(({ e, nickname }) => (
          <Card>
            <div class="spread">
              <h2 style="margin:0">{e.title}</h2>
              {e.visibility === "private" ? <Tag tone="muted">🔒 {t("ส่วนตัว", "Private")}</Tag> : <Tag>{t("สาธารณะ", "Public")}</Tag>}
            </div>
            {e.titleEn ? <p class="muted">{e.titleEn}</p> : null}
            <dl class="facts">
              <dt>{t("ผู้จัด", "Host")}</dt>
              <dd>{nickname ?? t("(ไม่มีโปรไฟล์)", "(no profile)")}</dd>
              <dt>{t("เมื่อไหร่", "When")}</dt>
              <dd>
                {fmtDate(e.startsAt, lang)} – {fmtDate(e.endsAt, lang)}
              </dd>
              <dt>{t("ที่ไหน", "Where")}</dt>
              <dd>
                {e.venueName}, {label(DISTRICTS, e.district, lang)}
                {e.venueAddress ? ` · ${e.venueAddress}` : ""}
                {e.mapUrl ? (
                  <>
                    {" · "}
                    <a href={e.mapUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {t("แผนที่", "map")} ↗
                    </a>
                  </>
                ) : null}
              </dd>
              <dt>{t("ใครมาได้", "Who")}</dt>
              <dd>
                {t(`${e.capacity} คน · อายุ ${e.ageMin}–${e.ageMax} · ${label(INTENSITY, e.intensity, lang)}`, `${e.capacity} people · ages ${e.ageMin}–${e.ageMax} · ${label(INTENSITY, e.intensity, lang)}`)} ·{" "}
                {e.languages.map((l) => label(LANGUAGES, l, lang)).join(", ")}
              </dd>
              <dt>{t("ค่าใช้จ่าย", "Cost")}</dt>
              <dd>
                {e.costThb > 0 ? `฿${e.costThb}` : t("ฟรี", "Free")}
                {e.paymentNote ? ` · ${e.paymentNote}` : ""}
                {e.paymentUrl ? (
                  <>
                    {" · "}
                    <a href={e.paymentUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {t("ลิงก์ชำระเงิน", "payment link")} ↗
                    </a>
                  </>
                ) : null}
              </dd>
              {e.tags.length ? (
                <>
                  <dt>{t("หมวด", "Categories")}</dt>
                  <dd>{e.tags.map((x) => label(EVENT_TAGS, x, lang)).join(", ")}</dd>
                </>
              ) : null}
              {e.safetyInfo ? (
                <>
                  <dt>{t("ความปลอดภัย", "Safety")}</dt>
                  <dd>{e.safetyInfo}</dd>
                </>
              ) : null}
            </dl>
            <p style="white-space:pre-line">{e.description}</p>
            <p>
              <a href={`/events/${e.id}`}>{t("ดูหน้ากิจกรรมแบบที่สมาชิกจะเห็น →", "Preview the event page →")}</a>
            </p>
            <div class="grid2">
              <form method="post" action={`/admin/review/${e.id}/approve`}>
                <Toggle name="trust" label={t("ไว้ใจผู้จัดนี้ (ครั้งต่อไปไม่ต้องตรวจ)", "Trust this host (their next events skip review)")} />
                <Button>✓ {t("อนุมัติและเผยแพร่", "Approve and publish")}</Button>
              </form>
              <form method="post" action={`/admin/review/${e.id}/reject`}>
                <TextArea label={t("ส่งกลับพร้อมเหตุผล", "Send back with a note")} name="note" rows={2} maxlength={MAX_NOTE} hint={t("ผู้จัดจะเห็นข้อความนี้", "The host sees this")} />
                <Button kind="ghost">{t("ส่งกลับให้แก้", "Send back")}</Button>
              </form>
            </div>
          </Card>
        ))
      )}
    </>,
  );
});

async function pending(c: C) {
  const [e] = await getDb(c.env)
    .select()
    .from(events)
    .where(and(eq(events.id, c.req.param("id") ?? ""), eq(events.status, "pending")))
    .limit(1);
  return e ?? null;
}

adminReview.post("/:id/approve", async (c) => {
  const e = await pending(c);
  if (!e) return c.redirect("/admin/review?notice=gone");
  const me = c.var.user!.account;
  // Nobody approves their own proposal.
  if (e.createdBy === me.id) return c.redirect("/admin/review?notice=own");
  const trust = str((await c.req.parseBody()).trust) === "1";
  const db = getDb(c.env);
  const ops = [
    db.update(events).set({ status: "published", reviewNote: null }).where(and(eq(events.id, e.id), eq(events.status, "pending"))),
    // A plain member becomes a host, so they can run check-in and groups for their event.
    db.update(accounts).set({ role: "host" }).where(and(eq(accounts.id, e.createdBy), eq(accounts.role, "user"))),
    notify(db, e.createdBy, "host_approved", `เผยแพร่แล้ว: ${e.title}`, `Your event is live: ${e.titleEn ?? e.title}`, `/events/${e.id}`),
    audit(db, me.id, "event.review_approve", { type: "event", id: e.id }, { trust }),
  ];
  if (trust) ops.push(db.update(accounts).set({ trustedHost: true }).where(inArray(accounts.id, [e.createdBy])));
  await batch(c.env, ops);
  return c.redirect("/admin/review?notice=approved");
});

adminReview.post("/:id/reject", async (c) => {
  const e = await pending(c);
  if (!e) return c.redirect("/admin/review?notice=gone");
  const note = str((await c.req.parseBody()).note);
  if (!note || note.length > MAX_NOTE) return c.redirect("/admin/review?notice=need_note");
  const me = c.var.user!.account;
  const db = getDb(c.env);
  await batch(c.env, [
    db.update(events).set({ status: "rejected", reviewNote: note }).where(and(eq(events.id, e.id), eq(events.status, "pending"))),
    notify(db, e.createdBy, "host_rejected", `ขอให้แก้ไข: ${e.title}`, `Changes needed: ${e.titleEn ?? e.title}`, "/host"),
    audit(db, me.id, "event.review_reject", { type: "event", id: e.id }),
  ]);
  return c.redirect("/admin/review?notice=rejected");
});
