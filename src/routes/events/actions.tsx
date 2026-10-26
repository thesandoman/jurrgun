/**
 * Events, actions part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { isLateCancel, strikeExpiry } from "../../domain/rules";
import { hmacSha256, newId, randomToken } from "../../lib/crypto";
import { audit, notify } from "../../lib/records";
import { requireMember } from "../../lib/session";
import { invites, talkQuestions, registrations, strikes } from "../../schema";
import { refreshWaitlist } from "../../services/events";
import { getObject, getObjectUrl } from "../../storage";
import { str, view } from "../../ui/kit";
import { TALK_QUESTION_MAX, TALK_QUESTIONS_PER_MEMBER } from "../../domain/event-rules";
import { eventRoutes } from "./app";
import { canInvite, myRegistration, notFound, renderDetail, visibleEvent } from "./detail";
import { ACTIVE, me } from "./shared";

// ------------------------------------------------- private talk (D52) --

/** An anonymous question at a private talk. Only a keyed hash of event and member is kept, to cap it at 3 each. */
eventRoutes.post("/events/:id/questions", requireMember, async (c) => {
  const { t } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const event = await visibleEvent(c, id);
  if (!event || !event.talkMode) return notFound(c);
  const reg = await myRegistration(db, id, user.account.id);
  if (reg?.status !== "confirmed" || event.endsAt.getTime() <= Date.now()) return c.redirect(`/events/${id}`);
  const question = str((await c.req.parseBody()).question).replace(/\s+/g, " ").trim();
  if (question.length < 3 || question.length > TALK_QUESTION_MAX) {
    return renderDetail(c, event, { error: t(`คำถามยาว 3 ถึง ${TALK_QUESTION_MAX} ตัวอักษร`, `A question is 3 to ${TALK_QUESTION_MAX} characters.`), status: 400 });
  }
  const askerHash = await hmacSha256(c.env.IP_HASH_SECRET ?? "", `talk:${id}:${user.account.id}`);
  const [{ n }] = await db.select({ n: count() }).from(talkQuestions).where(and(eq(talkQuestions.eventId, id), eq(talkQuestions.askerHash, askerHash)));
  if (Number(n) >= TALK_QUESTIONS_PER_MEMBER) {
    return renderDetail(c, event, { error: t(`ถามได้ไม่เกิน ${TALK_QUESTIONS_PER_MEMBER} ข้อต่อวง`, `Up to ${TALK_QUESTIONS_PER_MEMBER} questions per talk.`), status: 409 });
  }
  // No audit row: an audit line would tie the question to the member.
  await db.insert(talkQuestions).values({ id: newId(), eventId: id, body: question, askerHash });
  return c.redirect(`/events/${id}?notice=question_sent`);
});

// -------------------------------------------------------------- invite --

/** Create (or reuse my unused) invite link for a +1 event (PRD §8.2). */
eventRoutes.post("/events/:id/invite", requireMember, async (c) => {
  const { t } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const event = await visibleEvent(c, id);
  if (!event) return notFound(c);
  const reg = await myRegistration(db, id, user.account.id);
  if (!canInvite(event, reg)) {
    return renderDetail(c, event, {
      error: t("ชวนเพื่อนได้เมื่อคุณยืนยันที่นั่งในกิจกรรมที่รับ +1 และยังไม่มีเพื่อนมาด้วย", "You can invite a friend once you're confirmed for a +1 event and haven't brought someone yet."),
      status: 403,
    });
  }
  const [open] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.eventId, id), eq(invites.inviter, user.account.id), isNull(invites.usedBy)))
    .limit(1);
  if (!open) {
    const token = randomToken(18);
    await batch(c.env, [
      db.insert(invites).values({ id: token, eventId: id, inviter: user.account.id }),
      audit(db, user.account.id, "event.invite_create", { type: "event", id }),
    ]);
  }
  return c.redirect(`/events/${id}#invite`);
});

// --------------------------------------------------------------- cover --

/** The cover image. Deployed: redirect to a signed URL. Locally: serve the bytes (dev only). */
eventRoutes.get("/events/:id/cover", requireMember, async (c) => {
  const event = await visibleEvent(c, c.req.param("id"));
  if (!event?.coverKey) return c.notFound();
  if (c.env.FILES) {
    return new Response(null, { status: 302, headers: { location: await getObjectUrl(c.env, event.coverKey), "cache-control": "private, max-age=60" } });
  }
  if (!c.env.BUCKET) return c.notFound();
  const obj = await getObject(c.env, event.coverKey).catch(() => null);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "content-type": obj.metadata.contentType ?? "application/octet-stream", "cache-control": "private, max-age=60" } });
});

// -------------------------------------------------------------- cancel --

eventRoutes.post("/events/:id/cancel", requireMember, async (c) => {
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const now = new Date();
  const event = await visibleEvent(c, id);
  if (!event) return notFound(c);
  const reg = await myRegistration(db, id, user.account.id);
  // Withdrawing a request (D57) is never a strike and frees no seat.
  if (reg?.status === "requested") {
    await batch(c.env, [
      db.update(registrations).set({ status: "cancelled", cancelledAt: now }).where(eq(registrations.id, reg.id)),
      audit(db, user.account.id, "event.request_withdraw", { type: "event", id }),
    ]);
    return c.redirect(`/events/${id}`);
  }
  if (!reg || !(ACTIVE as readonly string[]).includes(reg.status)) return c.redirect(`/events/${id}`);
  if (event.startsAt.getTime() <= now.getTime()) {
    const { t } = view(c);
    return renderDetail(c, event, { error: t("กิจกรรมเริ่มแล้ว ยกเลิกไม่ได้", "The event has started, so it can't be cancelled now."), status: 400 });
  }

  const late = reg.status === "confirmed" && event.status === "published" && isLateCancel(event.startsAt, now);
  const queries = [
    db
      .update(registrations)
      .set({ status: late ? "late_cancelled" : "cancelled", cancelledAt: now, offeredUntil: null })
      .where(eq(registrations.id, reg.id)),
    ...(late
      ? [
          db
            .insert(strikes)
            .values({ id: newId(), accountId: user.account.id, eventId: id, reason: "late_cancel", expiresAt: strikeExpiry(now) })
            .onConflictDoNothing(),
        ]
      : []),
    ...(reg.plusOneWith
      ? [db.update(registrations).set({ plusOneWith: null }).where(and(eq(registrations.eventId, id), eq(registrations.accountId, reg.plusOneWith)))]
      : []),
    audit(db, user.account.id, late ? "event.late_cancel" : "event.cancel", { type: "event", id }, { from: reg.status }),
  ];
  await batch(c.env, queries);
  await refreshWaitlist(c.env, id, now);
  return c.redirect(`/events/${id}?notice=${late ? "late_cancel" : "cancelled"}`);
});

// -------------------------------------------------------------- offers --

eventRoutes.post("/events/:id/offer", requireMember, async (c) => {
  const { t } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const now = new Date();
  const event = await visibleEvent(c, id);
  if (!event) return notFound(c);
  const body = await c.req.parseBody();
  const action = str(body.action);
  if (action !== "accept" && action !== "decline") {
    return renderDetail(c, event, { error: t("เลือกรับหรือไม่รับที่นั่ง", "Choose accept or decline."), status: 400 });
  }
  // Staff cancelled the event: an outstanding offer can't be taken up.
  if (action === "accept" && event.status !== "published") {
    return renderDetail(c, event, { error: t("กิจกรรมนี้ถูกยกเลิกแล้ว", "This event has been cancelled."), status: 409 });
  }
  const reg = await myRegistration(db, id, user.account.id);
  if (!reg || reg.status !== "offered" || !reg.offeredUntil || reg.offeredUntil.getTime() <= now.getTime() || event.startsAt.getTime() <= now.getTime()) {
    await refreshWaitlist(c.env, id, now);
    return renderDetail(c, event, { error: t("หมดเวลายืนยันที่นั่งนี้แล้ว", "This offer has expired."), status: 409 });
  }
  if (action === "accept") {
    await batch(c.env, [
      db.update(registrations).set({ status: "confirmed", offeredUntil: null }).where(eq(registrations.id, reg.id)),
      audit(db, user.account.id, "event.offer_accept", { type: "event", id }),
      notify(db, user.account.id, "rsvp", `ยืนยันแล้ว: ${event.title}`, `You're in: ${event.titleEn ?? event.title}`, `/me/events/${id}/pass`),
    ]);
    return c.redirect(`/events/${id}?notice=offer_accepted`);
  }
  await batch(c.env, [
    db.update(registrations).set({ status: "cancelled", offeredUntil: null, cancelledAt: now }).where(eq(registrations.id, reg.id)),
    audit(db, user.account.id, "event.offer_decline", { type: "event", id }),
  ]);
  await refreshWaitlist(c.env, id, now);
  return c.redirect(`/events/${id}?notice=cancelled`);
});

