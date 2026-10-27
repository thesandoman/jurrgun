/**
 * Events, my-events part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { SaveNext } from "../../ui/offline-next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { strikeStanding, peopleWindow } from "../../domain/rules";
import { fmtDate, fmtMonth, fmtParts } from "../../lib/i18n";
import { SubLabel } from "../../ui/section-head";
import { requireMember } from "../../lib/session";
import { events, feedback, registrations, type Event, type Registration } from "../../schema";
import { Card, Empty, LinkButton, Notice, page, Tag, view, type View } from "../../ui/kit";
import { PAUSED_LINE } from "../../domain/hosting";
import { eventRoutes } from "./app";
import { ACTIVE, DateBlock, EventCard, byMonth, me, myStrikes, nextEvents, statusLabel, title } from "./shared";

// ----------------------------------------------------------- my events --

eventRoutes.get("/me/events", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const db = getDb(c.env);
  const now = new Date();

  const [rows, strikeRows] = await Promise.all([
    db
      .select({ event: events, reg: registrations })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.accountId, user.account.id), inArray(registrations.status, [...ACTIVE])))
      .orderBy(asc(events.startsAt))
      .limit(200),
    myStrikes(db, user.account.id),
  ]);
  const upcoming = rows.filter((r) => r.event.endsAt.getTime() > now.getTime() && r.event.status !== "draft");
  // Nothing booked: the next few public events, so My events offers something to join (owner card F).
  const suggest = upcoming.length === 0 ? await nextEvents(c.env, db, user.profile, now, 3) : null;
  const past = rows.filter((r) => r.event.endsAt.getTime() <= now.getTime() && r.reg.status === "confirmed").reverse();
  const pastIds = past.map((r) => r.event.id);
  const given = pastIds.length
    ? await db
        .select({ eventId: feedback.eventId })
        .from(feedback)
        .where(and(eq(feedback.accountId, user.account.id), inArray(feedback.eventId, pastIds)))
        .limit(200)
    : [];
  const gaveFeedback = new Set(given.map((g) => g.eventId));
  const cutoff = pastCutoff(now).getTime();
  const recent = past.filter((r) => r.event.startsAt.getTime() >= cutoff);
  const older = past.filter((r) => r.event.startsAt.getTime() < cutoff);
  const pastMonths = (rows: typeof past) => (rows.length ? <PastMonths rows={rows} v={v} now={now} gaveFeedback={gaveFeedback} /> : null);
  const standing = strikeStanding(strikeRows, now);
  const activeStrikes = strikeRows.filter((s) => !s.waivedBy && s.expiresAt.getTime() > now.getTime());

  return page(
    c,
    { title: t("นัดของฉัน", "My events"), tab: "mine" },
    <>
      <h1>{t("นัดของฉัน", "My events")}</h1>
      {standing.active > 0 ? (
        <Card class="strikes">
          <h2>{t("ใบเตือนของคุณ (เห็นเฉพาะคุณ)", "Your strikes (only you can see this)")}</h2>
          <p>
            {t(`ใบเตือนที่ยังมีผล: ${standing.active}`, `Active strikes: ${standing.active}`)}
          </p>
          <ul>
            {activeStrikes.map((s) => (
              <li>
                {s.reason === "late_cancel" ? t("ยกเลิกกระชั้นชิด", "Late cancel") : t("ไม่มาตามนัด", "No-show")} ·{" "}
                {t(`หมดอายุ ${fmtDate(s.expiresAt, "th")}`, `expires ${fmtDate(s.expiresAt, "en")}`)}
              </li>
            ))}
          </ul>
          {standing.blockedUntil ? (
            <Notice kind="warn">
              {t(`ลงทะเบียนกิจกรรมใหม่ได้หลัง ${fmtDate(standing.blockedUntil, "th")}`, `You can RSVP again after ${fmtDate(standing.blockedUntil, "en")}`)}
            </Notice>
          ) : standing.maxUpcoming !== null ? (
            <Notice kind="warn">
              {t("ตอนนี้จองล่วงหน้าได้ครั้งละ 1 กิจกรรม และไม่ได้ลำดับก่อนในคิวสำรอง", "For now you can hold 1 upcoming RSVP at a time, and you lose waitlist priority.")}
            </Notice>
          ) : (
            <p class="muted">{t("ถ้ามีใบเตือน 2 ใบ จะจองได้ครั้งละ 1 กิจกรรม ถ้ามี 3 ใบ จะลงทะเบียนไม่ได้ 30 วัน", "At 2 strikes you can hold 1 RSVP at a time; at 3 you can't RSVP for 30 days.")}</p>
          )}
          <p class="muted">{t("ยกเลิกก่อนงาน 24 ชม. ขึ้นไปไม่นับเป็นใบเตือน · ใบเตือนหมดอายุใน 90 วัน", "Cancelling 24h+ ahead is free · strikes expire after 90 days")}</p>
        </Card>
      ) : null}

      {/* The next booked tables stay readable offline; anything else saved on this phone is dropped. */}
      <SaveNext replace paths={upcoming.filter((r) => r.reg.status === "confirmed" && r.event.status === "published").map((r) => `/me/events/${r.event.id}/pass`)} />
      <h2 id="upcoming">{t("กำลังจะมาถึง", "Upcoming")}</h2>
      {upcoming.length === 0 ? (
        <>
          <p class="muted">{t("ยังไม่ได้จองกิจกรรมไหน ลองดูกิจกรรมที่ใกล้ที่สุดนี้", "Nothing booked yet. Here's what's coming up next.")}</p>
          {suggest?.list.length ? (
            <div class="discover-list next-up">
              {suggest.list.map((e) => (
                <div class="ev-item">
                  <EventCard e={e} taken={suggest.taken.get(e.id) ?? 0} v={v} cover={suggest.covers.get(e.id)} />
                </div>
              ))}
            </div>
          ) : null}
          <p class="me-all">
            <a href="/?view=list">{t("ดูกิจกรรมทั้งหมด", "See all events")} →</a>
          </p>
        </>
      ) : (
        <ul class="glist up-rows">
        {upcoming.map(({ event, reg }) => (
          <li class="up-row">
            <div class="dated">
              <DateBlock d={event.startsAt} lang={lang} />
              <div>
                <div class="spread">
                  <h3>
                    <a href={`/events/${event.id}`}>{title(event, lang)}</a>
                  </h3>
                  <Tag tone={reg.status === "confirmed" ? "ok" : reg.status === "offered" ? "accent" : "warn"}>{statusLabel(reg.status, t)}</Tag>
                </div>
                <p class="ev-line">
                  {fmtParts(event.startsAt, lang).time} · {event.venueName}
                </p>
                {event.status === "cancelled" ? <Notice kind="warn">{t("กิจกรรมนี้ถูกยกเลิก", "This event was cancelled")}</Notice> : null}
                {event.status === "paused" ? <Notice kind="warn">{t(PAUSED_LINE[0], PAUSED_LINE[1])}</Notice> : null}
                <div class="row">
                  {reg.status === "confirmed" && event.status === "published" ? (
                    <LinkButton href={`/me/events/${event.id}/pass`}>{t("🎟️ บัตรเข้างาน", "🎟️ Pass")}</LinkButton>
                  ) : null}
                  {reg.checkedInAt ? <LinkButton href={`/events/${event.id}/live`} kind="ghost">{t("หน้าในงาน", "Live page")}</LinkButton> : null}
                  {reg.status === "offered" ? <LinkButton href={`/events/${event.id}`}>{t("ยืนยันที่นั่ง", "Confirm your spot")}</LinkButton> : null}
                </div>
              </div>
            </div>
          </li>
        ))}
        </ul>
      )}

      <h2 id="past">{t("ที่ผ่านมา", "Past")}</h2>
      {past.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมที่ผ่านมา", "No past events yet.")}</Empty>
      ) : (
        <>
          {pastMonths(recent)}
          {/* Older months open in place, no script needed (owner card, 2026-10-17). */}
          {older.length ? (
            <details class="how past-older">
              <summary>{t(`ดูกิจกรรมที่ผ่านมาทั้งหมด (${older.length})`, `Show all past events (${older.length})`)}</summary>
              {pastMonths(older)}
            </details>
          ) : null}
        </>
      )}
      <p class="me-cal-link">
        <a href="/settings/calendar">
          <span aria-hidden="true">📅</span> {t("เพิ่มนัดที่จองไว้ในปฏิทินของฉัน", "Add my bookings to my calendar")}
        </a>
      </p>
    </>,
  );
});

/** Past events from this month and the two before it (Bangkok time) show on My events; older ones fold away. */
export function pastCutoff(now: Date): Date {
  const BKK = 7 * 3_600_000;
  const b = new Date(now.getTime() + BKK);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() - 2, 1) - BKK);
}

function PastMonths(props: { rows: { event: Event; reg: Registration }[]; v: View; now: Date; gaveFeedback: Set<string> }) {
  const { rows, now, gaveFeedback } = props;
  const { t, lang } = props.v;
  return (
    <>
      {
        // Compact rows grouped by month (owner, C3). Buttons only while the 72-hour window after the event is open.
        byMonth(rows, (r) => fmtMonth(r.event.startsAt, lang)).map(([month, items]) => (
          <section class="past-month">
            <SubLabel>{month}</SubLabel>
            <ul class="glist past-rows">
              {items.map(({ event, reg }) => {
                const attended = !!reg.checkedInAt;
                const open = attended && peopleWindow(event.endsAt, now) === "open";
                const p = fmtParts(event.startsAt, lang);
                return (
                  <li class={open ? "past-row is-open" : "past-row"}>
                    <a class="past-main" href={`/events/${event.id}`}>
                      <span class="past-day" aria-hidden="true">
                        <b>{p.day}</b>
                        <small>{p.weekday}</small>
                      </span>
                      <span class="past-text">
                        <b>{title(event, lang)}</b>
                        <small class="sr-only">{fmtDate(event.startsAt, lang)}</small>
                        <small class={attended ? "past-state is-ok" : "past-state"}>{attended ? t("✓ เข้าร่วมแล้ว", "✓ Attended") : t("ไม่ได้เช็กอิน", "Not checked in")}</small>
                      </span>
                      <span class="past-chev" aria-hidden="true">›</span>
                    </a>
                    {open ? (
                      <div class="past-acts">
                        <LinkButton href={`/events/${event.id}/people`}>{t("คนที่เจอ", "People I met")}</LinkButton>
                        <LinkButton href={`/events/${event.id}/feedback`} kind="ghost">
                          {gaveFeedback.has(event.id) ? t("แก้ไขความคิดเห็น", "Edit feedback") : t("ให้ความคิดเห็น", "Give feedback")}
                        </LinkButton>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      }
    </>
  );
}

