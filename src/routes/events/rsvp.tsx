/**
 * Events, rsvp part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { DEFAULT_RHYTHM, isPaused, MAX_UPCOMING, romanceEventOk, womenOnlyEventOk } from "../../domain/rules";
import { weekKey } from "../../domain/buddy";
import { cleanBio, withAskDismissed } from "../../content/profile";
import { GENDER_IDENTITIES } from "../../lib/constants";
import { privateFieldConsents } from "../../services/consent";
import { and, eq, gt, inArray, ne, notInArray } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { ageOn, seatAvailable, seatsOverbooked, strikeStanding, USERNAME_RE, normalizeUsername, withinRange } from "../../domain/rules";
import { newId, randomToken } from "../../lib/crypto";
import type { CurrentUser } from "../../lib/env";
import { fmtDate } from "../../lib/i18n";
import { audit, notify } from "../../lib/records";
import { requireMember } from "../../lib/session";
import { accounts, events, profiles, registrations, type Event, type Registration } from "../../schema";
import { refreshWaitlist, seatState } from "../../services/events";
import { Button, LinkButton, page, str, view } from "../../ui/kit";
import { joinCodeMatches, needsDisclaimer } from "../../domain/event-rules";
import { eventRoutes } from "./app";
import { myRegistration, notFound, renderDetail, visibleEvent } from "./detail";
import { ACTIVE, me, myStrikes } from "./shared";
import type { Ctx, Db } from "./shared";

// ---------------------------------------------------------------- RSVP --

/** Why an RSVP was refused, bilingual, with the HTTP status to answer. */
export type RsvpRefusal = { th: string; en: string; status: 400 | 403 | 409 };
type Member = CurrentUser & { profile: NonNullable<CurrentUser["profile"]> };
type Query = Parameters<typeof batch>[1][number];

/**
 * The RSVP rules shared by /events/:id/rsvp and invite acceptance
 * (/invite/:token/accept): open for registration, age, strikes (blocked or
 * the 1-upcoming cap). Returns my existing registration (if any) or a refusal.
 * `active` means I already hold or wait for a place: the caller decides what
 * that means.
 */
export async function rsvpGate(
  db: Db,
  event: Event,
  user: Member,
  now = new Date(),
): Promise<{ refusal: RsvpRefusal } | { refusal: null; existing: Registration | null; active: boolean }> {
  const no = (th: string, en: string, status: 400 | 403 | 409 = 400) => ({ refusal: { th, en, status } });
  if (event.status !== "published") return no("กิจกรรมนี้ไม่เปิดรับลงทะเบียน", "This event isn't open for registration.");
  if (event.startsAt.getTime() <= now.getTime()) return no("กิจกรรมเริ่มแล้ว", "This event has already started.");

  const age = ageOn(user.profile.birthDate, now);
  if (!withinRange(age, event.ageMin, event.ageMax)) {
    return no(`กิจกรรมนี้สำหรับอายุ ${event.ageMin} ถึง ${event.ageMax} ปี`, `This event is for ages ${event.ageMin}-${event.ageMax}.`, 403);
  }
  if (!romanceEventOk(event.tags, user.profile)) return no("ไม่พบกิจกรรมนี้", "We can't find this event.", 403);
  if (!womenOnlyEventOk(event.tags, user.profile)) {
    return no(
      "กิจกรรมนี้สำหรับผู้หญิงและคนนอนไบนารี ถ้าตรงกับคุณ ตั้งเพศได้ที่ ฉัน > ตั้งค่าการรู้จักกันหลังกิจกรรม (เป็นความลับ)",
      "This event is for women and non-binary people. If that's you, set your gender in Me > Connection preferences (it stays private).",
      403,
    );
  }

  const existing = await myRegistration(db, event.id, user.account.id);
  // A request waiting for the organiser (D57) holds the member's place in line like an active RSVP.
  if (existing && ((ACTIVE as readonly string[]).includes(existing.status) || existing.status === "requested")) return { refusal: null, existing, active: true };

  const standing = strikeStanding(await myStrikes(db, user.account.id), now);
  if (standing.blockedUntil) {
    return no(
      `คุณมีใบเตือน ${standing.active} ใบ จึงลงทะเบียนได้อีกครั้งหลัง ${fmtDate(standing.blockedUntil, "th")}`,
      `You have ${standing.active} strikes, so you can RSVP again after ${fmtDate(standing.blockedUntil, "en")}.`,
      403,
    );
  }
  if (standing.maxUpcoming !== null) {
    const held = await db
      .select({ id: registrations.id })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(
        and(
          eq(registrations.accountId, user.account.id),
          inArray(registrations.status, [...ACTIVE]),
          ne(registrations.eventId, event.id),
          // A cancelled event doesn't hold a place.
          ne(events.status, "cancelled"),
          gt(events.endsAt, now),
        ),
      )
      .limit(standing.maxUpcoming);
    if (held.length >= standing.maxUpcoming) {
      return no(
        "คุณมีใบเตือน 2 ใบ จึงจองล่วงหน้าได้ครั้งละ 1 กิจกรรม ยกเลิกอันเดิมหรือรอให้จบก่อน",
        "With 2 strikes you can hold only 1 upcoming RSVP at a time. Cancel it or wait until it's over.",
        403,
      );
    }
  }
  // Nobody holds more than MAX_UPCOMING seats at once.
  const upcoming = await db
    .select({ id: registrations.id })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, user.account.id), inArray(registrations.status, [...ACTIVE]), ne(registrations.eventId, event.id), ne(events.status, "cancelled"), gt(events.endsAt, now)))
    .limit(MAX_UPCOMING);
  if (upcoming.length >= MAX_UPCOMING) {
    return no(
      `จองล่วงหน้าได้ครั้งละไม่เกิน ${MAX_UPCOMING} กิจกรรม เพื่อให้คนอื่นได้ที่นั่งด้วย`,
      `You can hold up to ${MAX_UPCOMING} upcoming RSVPs at once, so seats reach others too.`,
      409,
    );
  }
  return { refusal: null, existing, active: false };
}

/** RSVPs already in the Bangkok week of `event`, for the weekly rhythm check. */
async function plansThatWeek(db: Db, accountId: string, event: Event): Promise<number> {
  const wk = weekKey(event.startsAt);
  const rows = await db
    .select({ startsAt: events.startsAt })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, accountId), inArray(registrations.status, [...ACTIVE]), ne(registrations.eventId, event.id), ne(events.status, "cancelled")))
    .limit(50);
  return rows.filter((r) => weekKey(r.startsAt) === wk).length;
}

/**
 * Take a seat (or a waitlist place) after `rsvpGate` passed: seats and the
 * resident quota decide confirmed vs waitlisted. `extra(status)` adds the
 * caller's own writes to the same batch.
 *
 * There are no transactions here, so the seat is taken first and checked
 * after: if a simultaneous RSVP pushed the event over capacity, this one
 * steps back to the waitlist and any seat that frees up goes to the waitlist
 * as usual. A double-submit (same member, same moment) writes nothing twice:
 * the second request sees the row the first one wrote and stops.
 */
export async function commitRsvp(
  c: Ctx,
  event: Event,
  user: Member,
  existing: Registration | null,
  opts: {
    wantsBuddy: boolean;
    plusOneUsername: string | null;
    plusOneWith: string | null;
    auditDetail: Record<string, unknown>;
    extra?: (status: "confirmed" | "waitlisted") => Query[];
  },
): Promise<"confirmed" | "waitlisted"> {
  const db = getDb(c.env);
  const id = event.id;
  const resident = user.account.bkkRegistered === "verified";
  const state = await seatState(db, event);
  let status: "confirmed" | "waitlisted" = seatAvailable(state, resident) ? "confirmed" : "waitlisted";
  const row = {
    status,
    offeredUntil: null,
    plusOneUsername: opts.plusOneUsername,
    plusOneWith: opts.plusOneWith,
    wantsBuddy: opts.wantsBuddy,
    passToken: randomToken(18),
    checkedInAt: null,
    checkedInBy: null,
    checkInMethod: null,
    groupNo: null,
    socialSignal: null,
    signalTopics: null,
    cancelledAt: null,
  };
  // 1. Write the row, unless a parallel request from this member already did.
  const regId = existing?.id ?? newId();
  const written = existing
    ? await db
        .update(registrations)
        .set(row)
        .where(and(eq(registrations.id, existing.id), notInArray(registrations.status, [...ACTIVE])))
        .returning({ id: registrations.id })
    : await db
        .insert(registrations)
        .values({ id: regId, eventId: id, accountId: user.account.id, ...row })
        .onConflictDoNothing()
        .returning({ id: registrations.id });
  if (written.length === 0) {
    const current = await myRegistration(db, id, user.account.id);
    return current?.status === "waitlisted" ? "waitlisted" : "confirmed";
  }

  // 2. Re-count now that our seat is in; step back if we overbooked.
  let freed = false;
  if (status === "confirmed" && seatsOverbooked(await seatState(db, event), resident)) {
    await db.update(registrations).set({ status: "waitlisted" }).where(and(eq(registrations.id, regId), eq(registrations.status, "confirmed")));
    status = "waitlisted";
    freed = true;
  }

  // 3. Tell them, once, with the status they actually got.
  const queries: Query[] = [
    audit(db, user.account.id, `event.rsvp_${status}`, { type: "event", id }, opts.auditDetail),
    status === "confirmed"
      ? notify(db, user.account.id, "rsvp", `ยืนยันแล้ว: ${event.title}`, `You're in: ${event.titleEn ?? event.title}`, `/me/events/${id}/pass`)
      : notify(db, user.account.id, "waitlist", `อยู่ในคิวสำรอง: ${event.title}`, `Waitlisted: ${event.titleEn ?? event.title}`, `/events/${id}`),
    ...(opts.extra ? opts.extra(status) : []),
  ];
  await batch(c.env, queries);
  // If two of us stepped back at once, a seat may now be free: offer it on.
  if (freed) await refreshWaitlist(c.env, id);
  return status;
}

/**
 * Card D3: the women-only event's gender question (AskCard in RegistrationBox). Saving sets the private gender
 * with its consent row (gender_data), the same as Settings; "Not now" is remembered and never asked here again.
 * Either way, back to the registration card.
 */
eventRoutes.post("/events/:id/ask-gender", requireMember, async (c) => {
  const user = me(c);
  const id = c.req.param("id");
  const event = await visibleEvent(c, id);
  if (!event || !user.profile) return notFound(c);
  const db = getDb(c.env);
  const body = await c.req.parseBody();
  const back = `/events/${encodeURIComponent(id)}#reg-h`;
  if (str(body.do) === "later") {
    await db.update(profiles).set({ bio: withAskDismissed(cleanBio(user.profile.bio), "women_only_gender"), updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
    return c.redirect(back);
  }
  const gender = str(body.gender);
  if (!GENDER_IDENTITIES.some((g) => g.value === gender) || gender === "prefer_not") return c.redirect(back);
  await batch(c.env, [
    db.update(profiles).set({ gender, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id)),
    ...(await privateFieldConsents(db, user.account.id, { gender })),
  ]);
  return c.redirect(back);
});

eventRoutes.post("/events/:id/rsvp", requireMember, async (c) => {
  const { t } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const now = new Date();
  const found = await visibleEvent(c, id);
  if (!found) return notFound(c);
  // Hand out freed seats to the waitlist before taking one ourselves.
  await refreshWaitlist(c.env, id, now);
  const event = (await visibleEvent(c, id)) ?? found;
  const fail = (th: string, en: string, status: 400 | 403 | 409 = 400) => renderDetail(c, event, { error: t(th, en), status });

  const gate = await rsvpGate(db, event, user, now);
  if (gate.refusal) return fail(gate.refusal.th, gate.refusal.en, gate.refusal.status);
  if (gate.active) return c.redirect(`/events/${id}`);

  const body = await c.req.parseBody();
  // Verified group only (D57) and the disclaimer ticked before booking (D61).
  if (event.groupJoinCode && !joinCodeMatches(str(body.joinCode), event.groupJoinCode)) {
    return fail("รหัสเข้าร่วมไม่ถูกต้อง ขอรหัสได้จากกลุ่มของคุณ", "That join code isn't right. Your group can share it with you.", 403);
  }
  if (needsDisclaimer(event) && str(body.disclaimer) !== "1") {
    return fail("ติ๊กยืนยันกติกาก่อนจอง", "Tick to confirm the rules before booking.");
  }
  // Organiser approval (D57): a request, not a seat, until the host says yes.
  if (event.approvalRequired) {
    const row = { status: "requested", offeredUntil: null, cancelledAt: null, passToken: randomToken(18) };
    const queries: Query[] = [
      gate.existing
        ? db.update(registrations).set(row).where(eq(registrations.id, gate.existing.id))
        : db.insert(registrations).values({ id: newId(), eventId: id, accountId: user.account.id, ...row }).onConflictDoNothing(),
      audit(db, user.account.id, "event.rsvp_requested", { type: "event", id }),
    ];
    if (event.hostAccountId) {
      queries.push(notify(db, event.hostAccountId, "rsvp_request", `มีคนขอที่นั่ง: ${event.title}`, `A place was requested: ${event.titleEn ?? event.title}`, `/admin/events/${id}#requests`));
    }
    await batch(c.env, queries);
    return c.redirect(`/events/${id}?notice=rsvp_requested`);
  }
  // The member's own weekly rhythm: a gentle check, never a block.
  const rhythm = cleanBio(user.profile.bio).rhythm ?? DEFAULT_RHYTHM;
  if (str(body.rhythmOk) !== "1" && (await plansThatWeek(db, user.account.id, event)) >= rhythm) {
    const { lang } = view(c);
    return page(
      c,
      { title: t("เช็กจังหวะของคุณ", "Check your rhythm"), tab: "events" },
      <>
        <h1>🌿 {t("สัปดาห์นี้มีนัดครบแล้ว", "Your week is already full")}</h1>
        <p>
          {t(
            `คุณตั้งไว้ว่าสัปดาห์ละ ${rhythm} นัด และมีครบแล้ว ยังอยากไปอันนี้อยู่ไหม? เว้นเวลาพักให้ตัวเองบ้างก็ดีนะ`,
            `You set ${rhythm} plans a week and you already have ${rhythm}. Still want this one? Leaving room to rest is good too.`,
          )}
        </p>
        <form method="post" action={`/events/${id}/rsvp`} class="row">
          <input type="hidden" name="rhythmOk" value="1" />
          {str(body.wantsBuddy) ? <input type="hidden" name="wantsBuddy" value={str(body.wantsBuddy)} /> : null}
          {str(body.plusOneUsername) ? <input type="hidden" name="plusOneUsername" value={str(body.plusOneUsername)} /> : null}
          <Button>{t("ใช่ ไปด้วย", "Yes, count me in")}</Button>
          <LinkButton href={`/events/${id}`} kind="ghost">{t("ไว้คราวหน้า", "Maybe next week")}</LinkButton>
        </form>
        <p class="muted">
          <a href="/settings/habits">{lang === "en" ? "Change my weekly rhythm" : "เปลี่ยนจังหวะต่อสัปดาห์"}</a>
        </p>
      </>,
    );
  }
  // Pay-it-forward: a free seat if one is left and the member hasn't used one this month.
  let freeSeat = false;
  if (str(body.freeSeat) === "1" && event.freeSeats > 0 && event.costThb > 0) {
    const [claimed, mineRecent] = await Promise.all([
      db.select({ id: registrations.id }).from(registrations).where(and(eq(registrations.eventId, id), eq(registrations.freeSeat, true), inArray(registrations.status, [...ACTIVE]))).limit(10),
      db.select({ id: registrations.id }).from(registrations).where(and(eq(registrations.accountId, user.account.id), eq(registrations.freeSeat, true), gt(registrations.createdAt, new Date(now.getTime() - 30 * 86_400_000)))).limit(1),
    ]);
    if (claimed.length >= event.freeSeats) return fail("ที่นั่งส่งต่อน้ำใจเต็มแล้ว แต่ยังลงทะเบียนแบบปกติได้", "The pay-it-forward seats are taken. You can still RSVP.", 409);
    if (mineRecent.length) return fail("เดือนนี้คุณใช้ที่นั่งส่งต่อน้ำใจไปแล้ว", "You've used a pay-it-forward seat this month.", 409);
    freeSeat = true;
  }
  // Taking a seat ends a pause.
  if (isPaused(user.profile, now)) await db.update(profiles).set({ pausedUntil: null }).where(eq(profiles.accountId, user.account.id));
  const wantsBuddy = event.buddyEnabled && str(body.wantsBuddy) === "1";
  let plusOneUsername: string | null = null;
  let plusOnePartner: { regId: string; accountId: string } | null = null;
  if (event.plusOneAllowed && str(body.plusOneUsername)) {
    const u = normalizeUsername(str(body.plusOneUsername).replace(/^@/, ""));
    if (!USERNAME_RE.test(u)) return fail("ชื่อผู้ใช้ของเพื่อนไม่ถูกต้อง", "That friend's username doesn't look right.");
    if (u === user.account.username) return fail("ใส่ชื่อผู้ใช้ของเพื่อน ไม่ใช่ของคุณเอง", "Enter your friend's username, not your own.");
    plusOneUsername = u;
    const [partner] = await db
      .select({ regId: registrations.id, accountId: registrations.accountId, theirs: registrations.plusOneUsername, status: registrations.status })
      .from(registrations)
      .innerJoin(accounts, eq(accounts.id, registrations.accountId))
      .where(and(eq(registrations.eventId, id), eq(accounts.username, u)))
      .limit(1);
    if (partner && partner.theirs === user.account.username && (ACTIVE as readonly string[]).includes(partner.status)) {
      plusOnePartner = { regId: partner.regId, accountId: partner.accountId };
    }
  }

  const status = await commitRsvp(c, event, user, gate.existing, {
    wantsBuddy,
    plusOneUsername,
    plusOneWith: plusOnePartner?.accountId ?? null,
    auditDetail: { plusOne: !!plusOneUsername, buddy: wantsBuddy },
    extra: () =>
      plusOnePartner ? [db.update(registrations).set({ plusOneWith: user.account.id }).where(eq(registrations.id, plusOnePartner.regId))] : [],
  });
  if (freeSeat) await db.update(registrations).set({ freeSeat: true }).where(and(eq(registrations.eventId, id), eq(registrations.accountId, user.account.id)));
  return c.redirect(`/events/${id}?notice=${status === "confirmed" ? "rsvp_confirmed" : "rsvp_waitlisted"}`);
});

