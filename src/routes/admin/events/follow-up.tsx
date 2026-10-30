/**
 * Staff events, follow-up part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, asc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { batch, getDb } from "../../../db";
import { strikeExpiry } from "../../../domain/rules";
import { newId } from "../../../lib/crypto";
import { batchAll, chunks, keysetAll } from "../../../lib/bulk";
import { audit, notify, notifyMany } from "../../../lib/records";
import { accounts, events, profiles, registrations, reports, strikes } from "../../../schema";
import { noteNamesSomeone, WAIVE_NOTE_MAX, WAIVE_NOTE_REFUSED } from "../../../domain/waive-note";
import { refreshWaitlist, runBuddyRound } from "../../../services/events";
import { blockedAmong } from "../../../services/regular-tables";
import { announceOpen, postAnnouncement, type AnnounceInput } from "../../../services/announcements";
import { ANNOUNCE_MAX, ANNOUNCE_PER_DAY, canAnnounce, cleanBody, isAnnouncementKind } from "../../../domain/announcements";
import { fromBangkok } from "../../../domain/hosting";
import { DAY_OF_LEAD_HOURS, cleanNote, dayOfOpen, isDayStatus, DAY_STATUS_TEXT } from "../../../domain/day-of";
import { rosterAccess } from "../../../domain/roster";
import { isStaffTarget, reportLimit, limitText, staffAlert } from "../../../services/report-intake";
import { Notice, page, str, view } from "../../../ui/kit";
import { adminEvents } from "./app";
import { PROMPTS } from "./edit";
import { BASE, forbidden, me, notFound, refuse, withEvent } from "./shared";

// ---------------------------------------------------- prompts & notices --

adminEvents.post(
  "/:id/prompt",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const body = await c.req.parseBody();
    let prompt: string | null;
    if (str(body.clear) === "1") prompt = null;
    else {
      const preset = PROMPTS.find((p) => p.key === str(body.preset));
      const custom = str(body.custom);
      if (custom.length > 200) return refuse(c, e, t("คำถามไม่เกิน 200 ตัวอักษร", "A prompt is at most 200 characters"));
      prompt = custom || (preset ? `${preset.th} / ${preset.en}` : "");
      if (!prompt) return refuse(c, e, t("เลือกหรือพิมพ์คำถาม", "Choose or write a prompt"));
    }
    await batch(c.env, [
      db.update(events).set({ activePrompt: prompt }).where(eq(events.id, e.id)),
      audit(db, me(c).id, prompt ? "event.prompt_set" : "event.prompt_clear", { type: "event", id: e.id }, { prompt }),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=saved`);
  }),
);

/**
 * Day-of status: the host (or the organiser) says how the table is doing on
 * the day. Only inside the day-of window. Confirmed attendees hear about a
 * change that matters to them (late, moved, called off); "on time" is quiet.
 */
adminEvents.post(
  "/:id/day-status",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const now = new Date();
    if (e.status !== "published" || !dayOfOpen(e, now)) {
      return refuse(c, e, t(`ตั้งสถานะวันงานได้เฉพาะวันงาน ตั้งแต่ ${DAY_OF_LEAD_HOURS} ชั่วโมงก่อนเริ่มจนจบงาน`, `A day-of status can only be set on the day, from ${DAY_OF_LEAD_HOURS} hours before the start until the end.`), 409);
    }
    const body = await c.req.parseBody();
    if (str(body.clear) === "1") {
      await batch(c.env, [
        db.update(events).set({ dayStatus: null, dayStatusNote: null, dayStatusAt: null }).where(eq(events.id, e.id)),
        audit(db, me(c).id, "event.day_status_clear", { type: "event", id: e.id }),
      ]);
      return c.redirect(`${BASE}/${e.id}?notice=saved#day-of`);
    }
    const status = str(body.status);
    const note = cleanNote(str(body.note));
    if (!isDayStatus(status)) return refuse(c, e, t("เลือกสถานะ", "Choose a status"));
    if (status === "moved" && !note) return refuse(c, e, t("บอกด้วยว่าย้ายไปที่ไหน", "Say where it moved to"));
    const text = DAY_STATUS_TEXT[status];
    const writes = [
      db.update(events).set({ dayStatus: status, dayStatusNote: note, dayStatusAt: now }).where(eq(events.id, e.id)),
      audit(db, me(c).id, "event.day_status", { type: "event", id: e.id }, { status }),
    ];
    if (status !== "on_time") {
      const regs = await keysetAll(registrations.id, (after, n) =>
        db
          .select({ id: registrations.id, accountId: registrations.accountId })
          .from(registrations)
          .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed"), after))
          .orderBy(asc(registrations.id))
          .limit(n),
      );
      const th = `โฮสต์อัปเดต: ${text.th}${note ? ` ${note}` : ""}`;
      const en = `Host update: ${text.en}${note ? `. ${note}` : ""}`;
      await batchAll(c.env, [...writes, ...notifyMany(db, regs.map((r) => ({ accountId: r.accountId, th, en })), "event_notice", `/events/${e.id}`)]);
    } else await batch(c.env, writes);
    return c.redirect(`${BASE}/${e.id}?notice=saved#day-of`);
  }),
);

/**
 * Host announcements (owner, 2026-10-17): Update, Time changed, Venue moved,
 * Cancelled. Its own access check, not withEvent: the host is hostAccountId,
 * or createdBy when there is no host, plus the organiser and bma_admin
 * (src/domain/announcements.ts canAnnounce). Posted from this page and from
 * /host; `back` returns to whichever it came from.
 */
adminEvents.post("/:id/announce", async (c) => {
  const { t } = view(c);
  const id = c.req.param("id") ?? "";
  const db = getDb(c.env);
  const a = me(c);
  const [e] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!e || !canAnnounce(e, a)) return notFound(c);
  const body = await c.req.parseBody();
  const back = str(body.back) === "/host" ? "/host" : `${BASE}/${e.id}`;
  const fail = (msg: string, status: 400 | 409 = 400) =>
    page(c, { title: t("ส่งประกาศไม่ได้", "Couldn't send that"), admin: back !== "/host", status }, (
      <>
        <Notice kind="error">{msg}</Notice>
        <p>
          <a href={`${back}#announce`}>{t("← กลับไปแก้", "← Go back and change it")}</a>
        </p>
      </>
    ));
  const kind = str(body.kind);
  if (!isAnnouncementKind(kind)) return fail(t("เลือกว่าประกาศเรื่องอะไร", "Choose what the announcement is about"));
  const raw = str(body.body);
  if (raw.length > ANNOUNCE_MAX) return fail(t(`ข้อความไม่เกิน ${ANNOUNCE_MAX} ตัวอักษร`, `A message is at most ${ANNOUNCE_MAX} characters`));
  const text = cleanBody(raw);
  const now = new Date();
  if (!announceOpen(e, now)) return fail(t("ประกาศได้เฉพาะกิจกรรมที่เผยแพร่และยังไม่จบ", "Announcements are for live events that haven't ended"), 409);
  const input: AnnounceInput = { kind, body: text };
  if (kind === "update" && !text) return fail(t("พิมพ์ข้อความที่จะบอกทุกคน", "Write the message for everyone"));
  if (kind === "time") {
    const s = fromBangkok(str(body.startsAt));
    const en = fromBangkok(str(body.endsAt));
    if (!s || !en) return fail(t("ใส่เวลาเริ่มและเวลาจบใหม่", "Give the new start and end"));
    if (s.getTime() <= now.getTime()) return fail(t("เวลาเริ่มใหม่ต้องยังไม่ถึง", "The new start must be in the future"));
    if (en.getTime() <= s.getTime()) return fail(t("เวลาจบต้องหลังเวลาเริ่ม", "The end must be after the start"));
    if (en.getTime() - s.getTime() > 24 * 3_600_000) return fail(t("กิจกรรมยาวได้ไม่เกิน 24 ชั่วโมง", "An event can be at most 24 hours long"));
    if (s.getTime() === e.startsAt.getTime() && en.getTime() === e.endsAt.getTime()) return fail(t("เวลายังเหมือนเดิม", "That's the same time as now"));
    input.startsAt = s;
    input.endsAt = en;
  }
  if (kind === "venue") {
    const name = str(body.venueName).trim().slice(0, 200);
    const addr = str(body.venueAddress).trim().slice(0, 400);
    const map = str(body.mapUrl).trim();
    if (!name) return fail(t("ใส่ชื่อสถานที่ใหม่", "Give the new venue"));
    if (map && (map.length > 500 || !/^https:\/\/\S+$/.test(map))) return fail(t("ลิงก์แผนที่ต้องขึ้นต้นด้วย https://", "The map link must start with https://"));
    if (name === e.venueName && addr === e.venueAddress && (map || null) === e.mapUrl) return fail(t("สถานที่ยังเหมือนเดิม", "That's the same place as now"));
    input.venueName = name;
    input.venueAddress = addr;
    input.mapUrl = map || null;
  }
  if (kind === "cancelled" && str(body.confirm) !== "1") return fail(t("ติ๊กยืนยันก่อนยกเลิกกิจกรรม", "Tick the box to confirm the cancellation"));
  let defer: ((p: Promise<unknown>) => void) | undefined;
  try {
    const ctx = c.executionCtx;
    defer = (p) => ctx.waitUntil(p);
  } catch {
    defer = undefined; // tests and some local runs have no execution context
  }
  const r = await postAnnouncement(c.env, db, e, a.id, input, now, defer);
  if (!r.ok) {
    if (r.reason === "too_many") return fail(t(`ประกาศได้ไม่เกิน ${ANNOUNCE_PER_DAY} ครั้งใน 24 ชั่วโมง`, `At most ${ANNOUNCE_PER_DAY} announcements in 24 hours`), 409);
    if (r.reason === "duplicate") return fail(t(`ส่งข้อความนี้ไปแล้วเมื่อไม่กี่นาทีก่อน`, `You sent this same message a few minutes ago`), 409);
    return fail(t("ประกาศได้เฉพาะกิจกรรมที่เผยแพร่และยังไม่จบ", "Announcements are for live events that haven't ended"), 409);
  }
  return c.redirect(`${back}?notice=announced#announce`);
});

// ------------------------------------------------- waitlist, buddies, +1 --

adminEvents.post(
  "/:id/waitlist/offer",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    if (e.status !== "published" || e.startsAt.getTime() <= Date.now()) {
      return refuse(c, e, t("เสนอที่นั่งได้เฉพาะกิจกรรมที่เผยแพร่และยังไม่เริ่ม", "Spots can only be offered for published events that haven't started"), 409);
    }
    const offers = await refreshWaitlist(c.env, e.id);
    await audit(db, me(c).id, "event.waitlist_offer", { type: "event", id: e.id }, { offers });
    if (offers === 0) return refuse(c, e, t("ไม่มีที่ว่างหรือไม่มีคิวรอ", "No free seat or nobody waiting"), 409);
    return c.redirect(`${BASE}/${e.id}?notice=offered`);
  }),
);

adminEvents.post(
  "/:id/buddies",
  withEvent(async (c, e) => {
    const { t } = view(c);
    if (!e.buddyEnabled) return refuse(c, e, t("กิจกรรมนี้ไม่ได้เปิด Event Buddy", "Event Buddy isn't enabled for this event"), 409);
    if (e.status !== "published") return refuse(c, e, t("กิจกรรมยังไม่เผยแพร่", "The event isn't published"), 409);
    if (e.buddyRoundAt) return refuse(c, e, t("จับคู่บัดดี้ไปแล้ว", "The buddy round already ran"), 409);
    const r = await runBuddyRound(c.env, e, { force: true, actor: me(c).id });
    if (!r.ran) return refuse(c, e, t("จับคู่บัดดี้ไปแล้ว", "The buddy round already ran"), 409);
    return c.redirect(`${BASE}/${e.id}?notice=buddy_round`);
  }),
);

adminEvents.post(
  "/:id/plusone",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const body = await c.req.parseBody();
    const ids = [str(body.a), str(body.b)];
    if (!ids[0] || ids[0] === ids[1]) return refuse(c, e, t("เลือก 2 คนที่ต่างกัน", "Choose two different people"));
    const regs = await db
      .select({ id: registrations.id, accountId: registrations.accountId, status: registrations.status })
      .from(registrations)
      .where(and(eq(registrations.eventId, e.id), inArray(registrations.id, ids)))
      .limit(2);
    if (regs.length !== 2 || regs.some((r) => r.status === "cancelled" || r.status === "late_cancelled")) {
      return refuse(c, e, t("ไม่พบผู้ลงทะเบียน", "Registration not found"), 404);
    }
    const [x, y] = regs;
    // A +1 pair is always seated together, so a blocked pair can't be one.
    if ((await blockedAmong(db, x.accountId, [y.accountId])).size) {
      return refuse(c, e, t("จับคู่ 2 คนนี้ไม่ได้", "These two can't be linked"), 409);
    }
    await batch(c.env, [
      db.update(registrations).set({ plusOneWith: y.accountId }).where(eq(registrations.id, x.id)),
      db.update(registrations).set({ plusOneWith: x.accountId }).where(eq(registrations.id, y.id)),
      audit(db, me(c).id, "event.plusone_link", { type: "event", id: e.id }, { registrations: [x.id, y.id] }),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=saved`);
  }, { roster: true }),
);

// ------------------------------------------------- no-shows & strikes --

adminEvents.post(
  "/:id/noshows",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const now = new Date();
    if (now.getTime() < e.endsAt.getTime()) return refuse(c, e, t("บันทึกคนที่ไม่มาตามนัดได้หลังกิจกรรมจบ", "No-shows can only be recorded after the event ends"), 409);
    if (e.status !== "published") return refuse(c, e, t("กิจกรรมนี้ไม่ได้จัดขึ้น", "This event didn't run"), 409);
    const missing = await keysetAll(registrations.id, (after, n) =>
      db
        .select({ id: registrations.id, accountId: registrations.accountId })
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, e.id),
            eq(registrations.status, "confirmed"),
            isNull(registrations.checkedInAt),
            eq(registrations.noShowRecorded, false),
            after,
          ),
        )
        .orderBy(asc(registrations.id))
        .limit(n),
    );
    if (missing.length) {
      const expiresAt = strikeExpiry(now);
      const th = `คุณไม่ได้เช็กอินที่ "${e.title}" เลยได้ใบเตือน 1 ใบ (หมดอายุใน 90 วัน) ถ้ามีเหตุจำเป็น ติดต่อโฮสต์ได้`;
      const en = `You didn't check in at "${e.titleEn ?? e.title}", so you got 1 strike (expires in 90 days). If something came up, contact the host.`;
      // One batch per WRITE_CHUNK people: their flag, strike and notice land
      // together, so a retry after a failure picks up exactly the rest.
      const parts = chunks(missing);
      for (const [i, part] of parts.entries()) {
        await batch(c.env, [
          db.update(registrations).set({ noShowRecorded: true }).where(inArray(registrations.id, part.map((r) => r.id))),
          db
            .insert(strikes)
            .values(part.map((r) => ({ id: newId(), accountId: r.accountId, eventId: e.id, reason: "no_show", expiresAt })))
            .onConflictDoNothing(),
          ...notifyMany(db, part.map((r) => ({ accountId: r.accountId, th, en })), "strike", "/me/events"),
          ...(i === parts.length - 1 ? [audit(db, me(c).id, "event.noshows", { type: "event", id: e.id }, { count: missing.length })] : []),
        ]);
      }
    } else {
      await audit(db, me(c).id, "event.noshows", { type: "event", id: e.id }, { count: 0 });
    }
    return c.redirect(`${BASE}/${e.id}?notice=strikes_recorded`);
  }, { roster: true }),
);


/** Nicknames and usernames of everyone else registered for this event, plus its host and creator. */
async function otherNamesAt(db: ReturnType<typeof getDb>, e: { id: string; hostAccountId: string | null; createdBy: string }, accountId: string): Promise<string[]> {
  const ids = await db
    .select({ id: registrations.accountId })
    .from(registrations)
    .where(and(eq(registrations.eventId, e.id), ne(registrations.accountId, accountId)))
    .limit(5000);
  const all = [...new Set([...ids.map((r) => r.id), e.hostAccountId, e.createdBy].filter((x): x is string => !!x && x !== accountId))];
  if (!all.length) return [];
  const rows = await db
    .select({ username: accounts.username, nickname: profiles.nickname })
    .from(accounts)
    .leftJoin(profiles, eq(profiles.accountId, accounts.id))
    .where(inArray(accounts.id, all))
    .limit(all.length);
  return rows.flatMap((r) => [r.username, r.nickname ?? ""]);
}

adminEvents.post(
  "/:id/strikes/:who/waive",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    // The page sends the registration id, so no account id reaches a 💘 host's
    // page. An account id still works for a host who sees names.
    const who = c.req.param("who") ?? "";
    const [reg] = await db
      .select({ accountId: registrations.accountId })
      .from(registrations)
      .where(and(eq(registrations.id, who), eq(registrations.eventId, e.id)))
      .limit(1);
    if (!reg && rosterAccess(me(c), e) !== "names") return refuse(c, e, t("ไม่พบใบเตือนนี้", "Strike not found"), 404);
    const accountId = reg?.accountId ?? who;
    const reason = str((await c.req.parseBody()).reason);
    if (!reason || reason.length > WAIVE_NOTE_MAX) return refuse(c, e, t("ระบุเหตุผล (ไม่เกิน 200 ตัวอักษร)", "Give a reason (max 200 characters)"));
    // D1: the member sees this note in their data export, so it never names anyone else at the event.
    if (noteNamesSomeone(reason, await otherNamesAt(db, e, accountId))) return refuse(c, e, t(WAIVE_NOTE_REFUSED[0], WAIVE_NOTE_REFUSED[1]));
    const [s] = await db
      .select()
      .from(strikes)
      .where(and(eq(strikes.eventId, e.id), eq(strikes.accountId, accountId)))
      .limit(1);
    if (!s) return refuse(c, e, t("ไม่พบใบเตือนนี้", "Strike not found"), 404);
    if (s.waivedBy) return refuse(c, e, t("ยกเว้นไปแล้ว", "Already waived"), 409);
    await batch(c.env, [
      db.update(strikes).set({ waivedBy: me(c).id, waivedReason: reason }).where(eq(strikes.id, s.id)),
      audit(db, me(c).id, "strike.waive", { type: "strike", id: s.id }, { eventId: e.id, accountId, reason }),
      notify(db, accountId, "strike_waived", `ยกเว้นใบเตือนจาก "${e.title}" ให้แล้ว`, `Your strike from "${e.titleEn ?? e.title}" was waived`, "/me/events"),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=done`);
  }, { roster: true }),
);

/** A 💘 host raises a safety concern about a seat (SeatConcernForm). The host never sees who it is. */
adminEvents.post(
  "/:id/seat-concern",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const a = me(c);
    if (rosterAccess(a, e) !== "codes") return forbidden(c);
    const body = await c.req.parseBody();
    const details = str(body.details);
    const critical = str(body.urgent) === "1";
    if (!details || details.length > 1000) return refuse(c, e, t("บอกสั้น ๆ ว่าเกิดอะไรขึ้น (ไม่เกิน 1000 ตัวอักษร)", "Say briefly what happened (max 1000 characters)"));
    const [reg] = await db
      .select({ accountId: registrations.accountId })
      .from(registrations)
      .where(and(eq(registrations.id, str(body.registrationId)), eq(registrations.eventId, e.id)))
      .limit(1);
    if (!reg) return refuse(c, e, t("ไม่พบที่นั่งนี้", "Seat not found"), 404);
    if (reg.accountId === a.id) return refuse(c, e, t("แจ้งเรื่องตัวเองไม่ได้", "You can't report yourself"), 400);
    const limit = await reportLimit(db, a.id, reg.accountId, critical);
    if (limit) {
      const [th, en] = limitText(limit);
      return refuse(c, e, t(th, en), 409);
    }
    // Urgent reports skip reportLimit, so the host form can't become an alert button
    // (Trust & Operations): one concern per seat a day, and at most 3 urgent ones a day.
    const since = new Date(Date.now() - 24 * 3_600_000);
    const recent = await db
      .select({ target: reports.targetAccount, severity: reports.severity })
      .from(reports)
      .where(and(eq(reports.reporter, a.id), gte(reports.createdAt, since), sql`${reports.details} like '[Host, seat concern]%'`))
      .limit(50);
    if (recent.some((r) => r.target === reg.accountId)) {
      return refuse(c, e, t("แจ้งเรื่องที่นั่งนี้ไปแล้ววันนี้ ทีมดูแลกำลังดูอยู่ ถ้ามีอันตรายตอนนี้ โทร 191", "You've already raised this seat today and moderators have it. If someone is in danger now, call 191."), 409);
    }
    if (critical && recent.filter((r) => r.severity === "critical").length >= 3) {
      return refuse(c, e, t("ส่งเรื่องด่วนครบ 3 ครั้งแล้ววันนี้ ถ้ามีอันตรายตอนนี้ โทร 191", "That's 3 urgent concerns today. If someone is in danger now, call 191."), 409);
    }
    const alert = await staffAlert(c.env, db, { critical, aboutStaff: await isStaffTarget(db, reg.accountId) });
    const id = newId();
    await batch(c.env, [
      // No event on the report: moderators see the reporter (the host) and the words, never that it was a 💘 event.
      db.insert(reports).values({ id, reporter: a.id, targetAccount: reg.accountId, reason: "unsafe", details: `[Host, seat concern] ${details}`, severity: critical ? "critical" : "standard" }),
      audit(db, a.id, "report.create", { type: "report", id }, { severity: critical ? "critical" : "standard", reason: "unsafe" }),
      ...alert.writes,
    ]);
    await alert.push();
    return c.redirect(`${BASE}/${e.id}?notice=reported#attendees`);
  }, { roster: true }),
);

