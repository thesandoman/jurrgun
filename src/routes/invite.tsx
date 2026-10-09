/**
 * Bring-a-friend invite links (PRD §8.2: "the invited friend registers
 * through a referral link or event pass").
 *
 *   GET  /invite/:token          PUBLIC. Event summary + inviter's nickname.
 *                                Visitors who aren't members yet get a
 *                                `bkk_invite` cookie so /events sends them
 *                                back here once onboarding is done.
 *   POST /invite/:token/accept   Member. Same RSVP rules as /events/:id/rsvp
 *                                (age, strikes, seats, resident quota), then
 *                                links both registrations as each other's +1.
 *
 * The link is created on /events/:id (POST /events/:id/invite). One use per
 * token. Only the inviter's nickname is ever shown.
 */
import { Hono, type Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { DISTRICTS, label } from "../lib/constants";
import type { AppEnv, CurrentUser } from "../lib/env";
import { fmtDate } from "../lib/i18n";
import { audit, notify } from "../lib/records";
import { accountUsable, requireMember } from "../lib/session";
import { accounts, blocks, events, invites, profiles, registrations, type Event } from "../schema";
import { refreshWaitlist } from "../services/events";
import { Button, Card, LinkButton, Notice, page, Tag, view } from "../ui/kit";
import { ageText, commitRsvp, costText, INVITE_COOKIE, INVITE_TOKEN_RE, rsvpGate } from "./events";

export const inviteRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;
type Member = CurrentUser & { profile: NonNullable<CurrentUser["profile"]> };

const COOKIE_DAYS = 7;

/** A friendly dead end: 404 (no such link) or 410 (used, expired, withdrawn). */
async function gone(c: Ctx, status: 404 | 410, th: string, en: string) {
  const { t, user } = view(c);
  const res = await page(
    c,
    { title: t("ลิงก์ชวนเพื่อน", "Invite link"), tab: "events", status: 404 },
    <>
      <h1>{status === 404 ? t("ไม่พบลิงก์ชวนนี้", "We couldn't find that invite") : t("ลิงก์ชวนนี้ใช้ไม่ได้แล้ว", "This invite can't be used any more")}</h1>
      <Notice kind="info">{t(th, en)}</Notice>
      <LinkButton href={user?.profile?.onboardedAt ? "/events" : "/"} kind="ghost">
        {user?.profile?.onboardedAt ? t("ดูกิจกรรมอื่น", "See other events") : t("ไปหน้าแรก", "Go to the home page")}
      </LinkButton>
    </>,
  );
  return new Response(res.body, { status, headers: res.headers });
}

type Loaded =
  | { ok: false; status: 404 | 410; th: string; en: string }
  | {
      ok: true;
      token: string;
      event: Event;
      inviter: { id: string; username: string; nickname: string; regId: string };
    };

/**
 * The invite and everything it depends on: unused, the event still published
 * and not started, still a +1 event, and the inviter still confirmed without
 * a +1 and in good standing.
 */
async function loadInvite(c: Ctx, token: string, now = new Date()): Promise<Loaded> {
  const notFound = { ok: false as const, status: 404 as const, th: "ลิงก์นี้อาจพิมพ์ผิด หรือไม่มีอยู่จริง", en: "The link may be mistyped, or it doesn't exist." };
  if (!INVITE_TOKEN_RE.test(token)) return notFound;
  const db = getDb(c.env);
  const [inv] = await db.select().from(invites).where(eq(invites.id, token)).limit(1);
  if (!inv) return notFound;
  if (inv.usedBy) return { ok: false, status: 410, th: "ลิงก์นี้มีคนใช้ไปแล้ว ลิงก์ชวนแต่ละอันใช้ได้ครั้งเดียว", en: "Someone has already used this link. Each invite works once." };

  const [[event], [host]] = await Promise.all([
    db.select().from(events).where(eq(events.id, inv.eventId)).limit(1),
    db
      .select({
        regId: registrations.id,
        status: registrations.status,
        plusOneWith: registrations.plusOneWith,
        username: accounts.username,
        accountStatus: accounts.status,
        suspendedUntil: accounts.suspendedUntil,
        nickname: profiles.nickname,
      })
      .from(registrations)
      .innerJoin(accounts, eq(accounts.id, registrations.accountId))
      .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
      .where(and(eq(registrations.eventId, inv.eventId), eq(registrations.accountId, inv.inviter)))
      .limit(1),
  ]);
  if (!event || event.status === "draft") return notFound;
  if (event.status !== "published") return { ok: false, status: 410, th: "กิจกรรมนี้ถูกยกเลิกแล้ว", en: "This event has been cancelled." };
  if (event.startsAt.getTime() <= now.getTime()) return { ok: false, status: 410, th: "กิจกรรมนี้เริ่มไปแล้ว", en: "This event has already started." };
  if (!event.plusOneAllowed) return { ok: false, status: 410, th: "กิจกรรมนี้ไม่รับ +1 แล้ว", en: "This event no longer takes +1s." };
  if (
    !host ||
    host.status !== "confirmed" ||
    host.plusOneWith ||
    !accountUsable({ status: host.accountStatus, suspendedUntil: host.suspendedUntil }, now)
  ) {
    return { ok: false, status: 410, th: "คำชวนนี้ใช้ไม่ได้แล้ว", en: "This invite is no longer valid." };
  }
  return { ok: true, token, event, inviter: { id: inv.inviter, username: host.username, nickname: host.nickname, regId: host.regId } };
}

function eventTitle(e: Event, lang: "th" | "en"): string {
  return lang === "en" && e.titleEn ? e.titleEn : e.title;
}

inviteRoutes.get("/invite/:token", async (c) => {
  const v = view(c);
  const { t, lang, user } = v;
  const token = c.req.param("token");
  const inv = await loadInvite(c, token);
  if (!inv.ok) return gone(c, inv.status, inv.th, inv.en);
  const { event, inviter } = inv;
  const member = !!user?.profile?.onboardedAt;
  const mine = user?.account.id === inviter.id;
  if (member) {
    deleteCookie(c, INVITE_COOKIE, { path: "/" });
  } else {
    // Bring them back here after signup/onboarding (GET /events reads it once).
    setCookie(c, INVITE_COOKIE, token, {
      path: "/",
      maxAge: COOKIE_DAYS * 86_400,
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
    });
  }
  const back = `/invite/${token}`;
  return page(
    c,
    { title: t("คำชวนจากเพื่อน", "An invite from a friend"), tab: "events" },
    <>
      <h1>{t(`${inviter.nickname} ชวนคุณมาด้วย`, `${inviter.nickname} invited you along`)}</h1>
      <Card>
        <div class="event-cover" aria-hidden="true">🤝</div>
        <h2>{eventTitle(event, lang)}</h2>
        <div class="meta">
          <span>🗓️ {fmtDate(event.startsAt, lang)}</span>
          <span>
            📍 {event.venueName} · {label(DISTRICTS, event.district, lang)}
          </span>
        </div>
        <div class="meta">
          <span>👥 {ageText(event, t)}</span>
          <span>💸 {costText(event, t)}</span>
        </div>
        <p class="tags">
          <Tag tone="accent">{t("มาเป็น +1 ของเพื่อน", "Come as their +1")}</Tag>
        </p>
        <p class="muted">
          {t(
            "ลิงก์นี้ใช้ได้ครั้งเดียว คุณต้องผ่านเงื่อนไขของกิจกรรมเหมือนทุกคน (อายุ ที่นั่ง) ถ้าที่เต็ม คุณจะอยู่ในรายชื่อสำรอง",
            "This link works once. The event's usual rules still apply (age, seats). If it's full, you'll join the waitlist.",
          )}
        </p>
      </Card>
      {mine ? (
        <Notice kind="info">{t("นี่คือลิงก์ชวนของคุณเอง ส่งให้เพื่อน 1 คนได้เลย", "This is your own invite link. Send it to one friend.")}</Notice>
      ) : member ? (
        <form method="post" action={`/invite/${token}/accept`}>
          <Button>{t(`ไปเป็น +1 ของ ${inviter.nickname}`, `Join as ${inviter.nickname}'s +1`)}</Button>
        </form>
      ) : user ? (
        <Card>
          <p>{t("ทำโปรไฟล์ให้เสร็จก่อน แล้วเราจะพาคุณกลับมาที่คำชวนนี้", "Finish setting up your profile and we'll bring you back to this invite.")}</p>
          <LinkButton href="/onboarding">{t("ทำโปรไฟล์ต่อ", "Continue setting up")}</LinkButton>
        </Card>
      ) : (
        <Card>
          <p>{t("สมัครฟรีหรือเข้าสู่ระบบเพื่อตอบรับคำชวน แล้วเราจะพาคุณกลับมาที่นี่", "Sign up for free or sign in to accept. We'll bring you back here.")}</p>
          <div class="row">
            <LinkButton href="/signup">{t("สมัครสมาชิก", "Sign up")}</LinkButton>
            <LinkButton href={`/login?next=${encodeURIComponent(back)}`} kind="ghost">
              {t("เข้าสู่ระบบ", "Sign in")}
            </LinkButton>
          </div>
        </Card>
      )}
    </>,
  );
});

inviteRoutes.post("/invite/:token/accept", requireMember, async (c) => {
  const { t } = view(c);
  const user = c.var.user! as Member;
  const token = c.req.param("token");
  const db = getDb(c.env);
  const now = new Date();
  const refuse = (th: string, en: string, status: 400 | 403 | 409) =>
    page(
      c,
      { title: t("คำชวนจากเพื่อน", "An invite from a friend"), tab: "events", status },
      <>
        <Notice kind="error">{t(th, en)}</Notice>
        <LinkButton href={`/invite/${token}`} kind="ghost">
          {t("← กลับไปที่คำชวน", "← Back to the invite")}
        </LinkButton>
      </>,
    );

  const first = await loadInvite(c, token, now);
  if (!first.ok) return gone(c, first.status, first.th, first.en);
  if (first.inviter.id === user.account.id) {
    return refuse("ตอบรับคำชวนของตัวเองไม่ได้ ส่งลิงก์นี้ให้เพื่อนแทน", "You can't accept your own invite. Send the link to a friend instead.", 403);
  }
  // Blocks hide people in both directions: the invite simply isn't usable.
  const [blocked] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blocker, user.account.id), eq(blocks.blocked, first.inviter.id)),
        and(eq(blocks.blocker, first.inviter.id), eq(blocks.blocked, user.account.id)),
      ),
    )
    .limit(1);
  if (blocked) return gone(c, 410, "คำชวนนี้ใช้ไม่ได้แล้ว", "This invite is no longer valid.");

  // Same order as /events/:id/rsvp: hand freed seats to the waitlist first.
  await refreshWaitlist(c.env, first.event.id, now);
  const inv = await loadInvite(c, token, now);
  if (!inv.ok) return gone(c, inv.status, inv.th, inv.en);
  const { event, inviter } = inv;

  const gate = await rsvpGate(db, event, user, now);
  if (gate.refusal) return refuse(gate.refusal.th, gate.refusal.en, gate.refusal.status);
  if (gate.active) {
    return refuse(
      "คุณลงทะเบียนกิจกรรมนี้อยู่แล้ว ลิงก์นี้ยังใช้ได้สำหรับเพื่อนคนอื่น",
      "You're already registered for this event. The link stays open for someone else.",
      409,
    );
  }

  // Claim the token first: one use, even if two people accept at once.
  const claimed = await db
    .update(invites)
    .set({ usedBy: user.account.id, usedAt: now })
    .where(and(eq(invites.id, token), isNull(invites.usedBy)))
    .returning({ id: invites.id });
  if (claimed.length === 0) return gone(c, 410, "ลิงก์นี้มีคนใช้ไปแล้ว ลิงก์ชวนแต่ละอันใช้ได้ครั้งเดียว", "Someone has already used this link. Each invite works once.");

  let status: "confirmed" | "waitlisted";
  try {
    status = await commitRsvp(c, event, user, gate.existing, {
      wantsBuddy: false,
      plusOneUsername: inviter.username,
      plusOneWith: inviter.id,
      auditDetail: { plusOne: true, invite: true },
      extra: () => [
        db
          .update(registrations)
          .set({ plusOneWith: user.account.id, plusOneUsername: user.account.username })
          .where(eq(registrations.id, inviter.regId)),
        audit(db, user.account.id, "event.invite_accept", { type: "event", id: event.id }, { inviter: inviter.id }),
        notify(
          db,
          inviter.id,
          "invite_accepted",
          `${user.profile.nickname} ตอบรับคำชวนของคุณแล้ว: ${event.title}`,
          `${user.profile.nickname} accepted your invite: ${event.titleEn ?? event.title}`,
          `/events/${event.id}`,
        ),
      ],
    });
  } catch (err) {
    // Release the claim so the link still works.
    await db.update(invites).set({ usedBy: null, usedAt: null }).where(eq(invites.id, token)).catch(() => {});
    throw err;
  }
  deleteCookie(c, INVITE_COOKIE, { path: "/" });
  return c.redirect(`/events/${event.id}?notice=${status === "confirmed" ? "rsvp_confirmed" : "rsvp_waitlisted"}`);
});
