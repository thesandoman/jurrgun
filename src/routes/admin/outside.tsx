/**
 * Outside events, staff side (D46, D47).
 *
 * /admin/feeds (BMA admins): calendar feeds read once a day into the host
 * inbox. A feed is added only with a note on what the source's terms allow.
 *
 *   GET  /admin/feeds                 feeds, last read and result
 *   POST /admin/feeds                 add (url, source name, credit, terms note)
 *   POST /admin/feeds/:id/read        read it now
 *   POST /admin/feeds/:id/pause|resume
 *
 * /admin/partner-review (moderators and BMA admins):
 *
 *   GET  /admin/partner-review                    applications waiting, partners, partner events
 *   POST /admin/partner-review/:id/approve        verify: a partner organisation, the applicant its admin
 *   POST /admin/partner-review/:id/decline        with a note the applicant sees
 *   POST /admin/partner-review/org/:id/review     back to review (after reports): new events wait
 *   POST /admin/partner-review/org/:id/verify     verified again
 *   POST /admin/partner-review/event/:id/pull     off Discover, into the review queue with a note
 */
import { Hono, type Context } from "hono";
import { and, asc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { newId } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { fmtDate } from "../../lib/i18n";
import { audit, notify } from "../../lib/records";
import { requireRole } from "../../lib/session";
import { accounts, eventFeeds, events, partnerApplications, partnerOrgs } from "../../schema";
import { checkOutsideUrl } from "../../services/outside-fetch";
import { readFeed } from "../../services/outside-events";
import { KIND_TEXT } from "../partners";
import { Button, Card, Empty, Field, Notice, page, str, Tag, TextArea, view } from "../../ui/kit";

type C = Context<AppEnv>;

// ------------------------------------------------------------- feeds --

export const adminFeeds = new Hono<AppEnv>();
adminFeeds.use("*", requireRole("bma_admin"));

async function feedsPage(c: C, error?: string, status?: 400) {
  const { t, lang } = view(c);
  const feeds = await getDb(c.env).select().from(eventFeeds).orderBy(asc(eventFeeds.sourceName)).limit(200);
  return page(
    c,
    { title: t("ปฏิทินจากข้างนอก", "Outside calendars"), admin: true, status },
    <>
      <h1>{t("ปฏิทินจากข้างนอก", "Outside calendars")}</h1>
      <p class="muted">
        {t(
          "อ่านวันละครั้งเข้ากล่องรอโต๊ะ ไม่มีงานไหนขึ้นหน้าค้นหาจนกว่าเจ้าภาพจะเพิ่มจุดนัดพบกับโต๊ะ ตรวจข้อตกลงของแหล่งที่มาก่อนเพิ่มเสมอ",
          "Read once a day into the waiting list. Nothing reaches Discover until a host adds a meeting point and a table. Always check the source's terms before adding one.",
        )}
      </p>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <form method="post" action="/admin/feeds">
        <Card>
          <h2 style="margin-top:0">{t("เพิ่มปฏิทิน", "Add a feed")}</h2>
          <Field label={t("ลิงก์ iCal (https)", "iCal link (https)")} name="url" type="url" required maxlength={1000} inputmode="url" autocapitalize="none" />
          <Field label={t("ชื่อแหล่งที่มา (แสดงเป็น ผ่าน …)", "Source name (shown as Via …)")} name="sourceName" required maxlength={60} placeholder="Luma, Meetup, BMA" />
          <Field label={t("เครดิต (ไม่บังคับ)", "Credit line (optional)")} name="credit" maxlength={120} />
          <TextArea
            label={t("ข้อตกลงของแหล่งที่มา", "What the source's terms allow")}
            name="termsNote"
            rows={2}
            required
            maxlength={500}
            hint={t("เช่น Luma เปิดให้สมัครรับ iCal ของปฏิทินสาธารณะ ตรวจเมื่อ 2026-10-20", "e.g. Luma publishes iCal for public calendars; checked 2026-10-20")}
          />
          <Button>{t("เพิ่ม", "Add")}</Button>
        </Card>
      </form>
      {feeds.length === 0 ? (
        <Empty>{t("ยังไม่มีปฏิทิน", "No feeds yet.")}</Empty>
      ) : (
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{t("ปฏิทิน", "Feeds")}</caption>
            <thead>
              <tr>
                <th>{t("แหล่งที่มา", "Source")}</th>
                <th>{t("ข้อตกลง", "Terms")}</th>
                <th>{t("อ่านล่าสุด", "Last read")}</th>
                <th>{t("ทำอะไร", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((f) => (
                <tr>
                  <td>
                    <strong>{f.sourceName}</strong> {f.partnerOrgId ? <Tag tone="muted">{t("พาร์ตเนอร์", "Partner")}</Tag> : null}
                    <br />
                    <small>{f.url}</small>
                  </td>
                  <td>
                    <small>{f.termsNote}</small>
                  </td>
                  <td>{f.lastReadAt ? `${fmtDate(f.lastReadAt, lang)}: ${f.lastResult} (${f.lastCount ?? 0})` : "-"}</td>
                  <td>
                    <div class="row">
                      <form method="post" action={`/admin/feeds/${f.id}/read`}>
                        <Button kind="ghost">{t("อ่านเดี๋ยวนี้", "Read now")}</Button>
                      </form>
                      <form method="post" action={`/admin/feeds/${f.id}/${f.status === "paused" ? "resume" : "pause"}`}>
                        <Button kind="ghost">{f.status === "paused" ? t("อ่านต่อ", "Resume") : t("หยุด", "Pause")}</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
}

adminFeeds.get("/", (c) => feedsPage(c));

adminFeeds.post("/", async (c) => {
  const { t } = view(c);
  const body = await c.req.parseBody();
  const url = checkOutsideUrl(str(body.url));
  const sourceName = str(body.sourceName);
  const credit = str(body.credit);
  const termsNote = str(body.termsNote);
  if (!url) return feedsPage(c, t("ลิงก์ต้องเป็น https ของเว็บสาธารณะ", "The link must be a public https link."), 400);
  if (sourceName.length < 2 || sourceName.length > 60) return feedsPage(c, t("ใส่ชื่อแหล่งที่มา", "Add the source name."), 400);
  if (termsNote.length < 5 || termsNote.length > 500) return feedsPage(c, t("บอกว่าข้อตกลงของแหล่งที่มาอนุญาตอย่างไร", "Say what the source's terms allow."), 400);
  const db = getDb(c.env);
  const id = newId();
  const added = await db
    .insert(eventFeeds)
    .values({ id, url: url.toString(), sourceName, credit: credit.slice(0, 120) || null, termsNote, addedBy: c.var.user!.account.id })
    .onConflictDoNothing({ target: eventFeeds.url })
    .returning({ id: eventFeeds.id });
  if (!added.length) return feedsPage(c, t("มีปฏิทินนี้อยู่แล้ว", "That feed is already added."), 400);
  await audit(db, c.var.user!.account.id, "feed.add", { type: "feed", id }, { sourceName });
  return c.redirect("/admin/feeds?notice=saved");
});

adminFeeds.post("/:id/read", async (c) => {
  const [feed] = await getDb(c.env).select().from(eventFeeds).where(eq(eventFeeds.id, c.req.param("id"))).limit(1);
  if (feed) await readFeed(c.env, feed);
  return c.redirect("/admin/feeds?notice=done");
});

for (const [action, status] of [
  ["pause", "paused"],
  ["resume", "active"],
] as const) {
  adminFeeds.post(`/:id/${action}`, async (c) => {
    const db = getDb(c.env);
    await batch(c.env, [
      db.update(eventFeeds).set({ status }).where(eq(eventFeeds.id, c.req.param("id"))),
      audit(db, c.var.user!.account.id, `feed.${action}`, { type: "feed", id: c.req.param("id") }),
    ]);
    return c.redirect("/admin/feeds?notice=saved");
  });
}

// ---------------------------------------------------- partner review --

export const adminPartnerReview = new Hono<AppEnv>();
adminPartnerReview.use("*", requireRole("moderator"));

const NOTE_MAX = 500;

adminPartnerReview.get("/", async (c) => {
  const { t, lang } = view(c);
  const db = getDb(c.env);
  const now = new Date();
  const [apps, orgs, evs] = await Promise.all([
    db.select().from(partnerApplications).where(eq(partnerApplications.status, "pending")).orderBy(asc(partnerApplications.createdAt)).limit(100),
    db.select().from(partnerOrgs).orderBy(asc(partnerOrgs.name)).limit(200),
    db
      .select({ id: events.id, title: events.title, startsAt: events.startsAt, partnerOrgId: events.partnerOrgId, sourceName: events.sourceName })
      .from(events)
      .where(and(eq(events.status, "published"), gte(events.startsAt, now), or(isNotNull(events.partnerOrgId), isNotNull(events.sourceName))))
      .orderBy(asc(events.startsAt))
      .limit(100),
  ]);
  const applicants = apps.length
    ? await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(inArray(accounts.id, apps.map((a) => a.accountId))).limit(apps.length)
    : [];
  const who = new Map(applicants.map((a) => [a.id, a.username]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const kind = (k: keyof typeof KIND_TEXT) => (lang === "en" ? KIND_TEXT[k][1] : KIND_TEXT[k][0]);
  return page(
    c,
    { title: t("ตรวจพาร์ตเนอร์", "Partner review"), admin: true },
    <>
      <h1>{t("ตรวจพาร์ตเนอร์", "Partner review")}</h1>
      <h2>{t("ใบสมัครที่รอ", "Applications waiting")}</h2>
      {apps.length === 0 ? (
        <Empty>{t("ไม่มีใบสมัครรอ", "No applications waiting.")}</Empty>
      ) : (
        apps.map((a) => (
          <Card>
            <strong>{a.orgName}</strong> <Tag tone={a.kind === "dating" ? "love" : "muted"}>{kind(a.kind)}</Tag>
            <p class="muted" style="margin:4px 0">
              @{who.get(a.accountId) ?? "?"} · {a.contact}
              {a.website ? (
                <>
                  {" · "}
                  <a href={a.website} rel="noopener noreferrer nofollow" target="_blank">
                    {a.website} ↗
                  </a>
                </>
              ) : null}{" "}
              · {fmtDate(a.createdAt, lang)}
            </p>
            {a.about ? <p style="white-space:pre-wrap">{a.about}</p> : null}
            <div class="row">
              <form method="post" action={`/admin/partner-review/${a.id}/approve`}>
                <Button>{t("ยืนยันพาร์ตเนอร์", "Verify partner")}</Button>
              </form>
              <form method="post" action={`/admin/partner-review/${a.id}/decline`}>
                <TextArea label={t("เหตุผล (ผู้สมัครเห็น)", "Why (the applicant sees this)")} name="note" rows={2} required maxlength={NOTE_MAX} />
                <Button kind="ghost">{t("ปฏิเสธ", "Decline")}</Button>
              </form>
            </div>
          </Card>
        ))
      )}

      <h2>{t("พาร์ตเนอร์", "Partners")}</h2>
      <div class="table-wrap">
        <table>
          <caption class="sr-only">{t("พาร์ตเนอร์", "Partners")}</caption>
          <thead>
            <tr>
              <th>{t("ชื่อ", "Name")}</th>
              <th>{t("สถานะ", "Status")}</th>
              <th>{t("ทำอะไร", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr>
                <td>{o.name}</td>
                <td>{o.status === "review" ? <Tag tone="warn">{t("กำลังตรวจ", "Under review")}</Tag> : <Tag tone="ok">{t("ยืนยันแล้ว", "Verified")}</Tag>}</td>
                <td>
                  <form method="post" action={`/admin/partner-review/org/${o.id}/${o.status === "review" ? "verify" : "review"}`}>
                    <Button kind="ghost">{o.status === "review" ? t("ยืนยันอีกครั้ง", "Verify again") : t("ส่งกลับไปตรวจ", "Back to review")}</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t("กิจกรรมพาร์ตเนอร์และไปด้วยกันที่กำลังจะมา", "Upcoming partner and go-together events")}</h2>
      {evs.length === 0 ? (
        <Empty>{t("ไม่มี", "None.")}</Empty>
      ) : (
        evs.map((e) => (
          <Card>
            <a href={`/events/${e.id}`}>{e.title}</a>
            <p class="muted" style="margin:4px 0">
              {fmtDate(e.startsAt, lang)}
              {e.partnerOrgId ? ` · ${orgName.get(e.partnerOrgId) ?? ""}` : ""}
              {e.sourceName ? ` · ${t("ผ่าน", "Via")} ${e.sourceName}` : ""}
            </p>
            <form method="post" action={`/admin/partner-review/event/${e.id}/pull`}>
              <TextArea label={t("เหตุผลที่ดึงออก (เจ้าภาพเห็น)", "Why it's pulled (the host sees this)")} name="note" rows={2} required maxlength={NOTE_MAX} />
              <Button kind="ghost">{t("ดึงออกจากหน้าค้นหา", "Pull from Discover")}</Button>
            </form>
          </Card>
        ))
      )}
    </>,
  );
});

adminPartnerReview.post("/:id/approve", async (c) => {
  const db = getDb(c.env);
  const me = c.var.user!.account;
  const [a] = await db
    .select()
    .from(partnerApplications)
    .where(and(eq(partnerApplications.id, c.req.param("id")), eq(partnerApplications.status, "pending")))
    .limit(1);
  if (!a) return c.redirect("/admin/partner-review");
  if (a.accountId === me.id) return c.redirect("/admin/partner-review?error=own");
  const [applicant] = await db.select({ role: accounts.role, status: accounts.status }).from(accounts).where(eq(accounts.id, a.accountId)).limit(1);
  const orgId = newId();
  const now = new Date();
  // Staff keep their own role; a member becomes the new organisation's partner admin.
  const promote = applicant && applicant.status === "active" && (applicant.role === "user" || applicant.role === "host" || applicant.role === "circle_head");
  await batch(c.env, [
    db.insert(partnerOrgs).values({ id: orgId, name: a.orgName, kind: a.kind, website: a.website, status: "verified" }),
    db.update(partnerApplications).set({ status: "approved", reviewedBy: me.id, reviewedAt: now, partnerOrgId: orgId }).where(eq(partnerApplications.id, a.id)),
    ...(promote ? [db.update(accounts).set({ role: "partner_admin", partnerOrgId: orgId }).where(eq(accounts.id, a.accountId))] : []),
    notify(db, a.accountId, "partner_verified", `ยืนยันแล้ว: ${a.orgName} เป็นพาร์ตเนอร์ของ Jurrgun`, `Verified: ${a.orgName} is a Jurrgun partner`, "/partner"),
    audit(db, me.id, "partner.verify", { type: "partner_application", id: a.id }, { orgId, promoted: !!promote }),
  ]);
  return c.redirect("/admin/partner-review?notice=saved");
});

adminPartnerReview.post("/:id/decline", async (c) => {
  const note = str((await c.req.parseBody()).note);
  if (!note || note.length > NOTE_MAX) return c.redirect("/admin/partner-review");
  const db = getDb(c.env);
  const me = c.var.user!.account;
  const [a] = await db
    .select()
    .from(partnerApplications)
    .where(and(eq(partnerApplications.id, c.req.param("id")), eq(partnerApplications.status, "pending")))
    .limit(1);
  if (!a) return c.redirect("/admin/partner-review");
  await batch(c.env, [
    db.update(partnerApplications).set({ status: "declined", reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note }).where(eq(partnerApplications.id, a.id)),
    notify(db, a.accountId, "partner_declined", `ใบสมัครพาร์ตเนอร์: ${a.orgName}`, `Partner application: ${a.orgName}`, "/partner/apply"),
    audit(db, me.id, "partner.decline", { type: "partner_application", id: a.id }),
  ]);
  return c.redirect("/admin/partner-review?notice=saved");
});

for (const [action, status] of [
  ["review", "review"],
  ["verify", "verified"],
] as const) {
  adminPartnerReview.post(`/org/:id/${action}`, async (c) => {
    const db = getDb(c.env);
    await batch(c.env, [
      db.update(partnerOrgs).set({ status }).where(eq(partnerOrgs.id, c.req.param("id"))),
      audit(db, c.var.user!.account.id, `partner.${action}`, { type: "partner_org", id: c.req.param("id") }),
    ]);
    return c.redirect("/admin/partner-review?notice=saved");
  });
}

adminPartnerReview.post("/event/:id/pull", async (c) => {
  const note = str((await c.req.parseBody()).note);
  if (!note || note.length > NOTE_MAX) return c.redirect("/admin/partner-review");
  const db = getDb(c.env);
  const me = c.var.user!.account;
  const [e] = await db.select().from(events).where(and(eq(events.id, c.req.param("id")), eq(events.status, "published"))).limit(1);
  if (!e) return c.redirect("/admin/partner-review");
  // Pending, not cancelled: off Discover and back in the review queue, where it can be approved again.
  await batch(c.env, [
    db.update(events).set({ status: "pending", reviewNote: note }).where(and(eq(events.id, e.id), eq(events.status, "published"))),
    notify(db, e.hostAccountId ?? e.createdBy, "host_pulled", `ทีมงานดึงกิจกรรมออกก่อน: ${e.title}`, `The team took your event off Discover for now: ${e.titleEn ?? e.title}`, "/host"),
    audit(db, me.id, "event.pull", { type: "event", id: e.id }),
  ]);
  return c.redirect("/admin/partner-review?notice=saved");
});

