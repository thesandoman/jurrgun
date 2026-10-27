/**
 * Events, pass part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { cleanHello, helloOpen } from "../../domain/hello";
import { WarmupLine } from "../../ui/go-together";
import { TableIntroPrompt } from "../../ui/table-intro";
import { OfflineSavedNote } from "../../ui/offline-next";
import { icebreakersFor } from "../../content/icebreakers";
import { isRomanceEvent, seatCode } from "../../domain/roster";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { PEOPLE_WINDOW_HOURS, checkInOpen } from "../../domain/rules";
import { fmtDate, fmtParts, type T } from "../../lib/i18n";
import { qrSvg, shortCode } from "../../lib/qr";
import { requireMember } from "../../lib/session";
import { events, profiles, registrations, type Event } from "../../schema";
import { LinkButton, MoreInfo, page, str, Tag, view, type View, safeNext } from "../../ui/kit";
import { notifyHostRunningLate } from "../../services/eta-notice";
import { eventAnnouncements } from "../../services/announcements";
import { AnnouncementList } from "../../ui/announcements";
import { dayOfOpen, shownDayStatus, shownEta, isEtaStatus } from "../../domain/day-of";
import { DayStatusLine, EtaBox, FindTheTable } from "../../ui/day-of";
import { eventRoutes } from "./app";
import { forbidden, notFound } from "./detail";
import { costText, description, directionsUrl, eventIcs, firstName, me, title } from "./shared";
import { Script } from "../../ui/kit";

// ---------------------------------------------------------------- pass --



/**
 * The essentials of a booked table, on the pass: what a member needs at the
 * door with no signal (owner: offline next table). The service worker keeps
 * this page and fills in data-offline-saved with the time it saved it.
 */
function Essentials(props: { event: Event; hostName: string | null; v: View }) {
  const { event } = props;
  const { t, lang } = props.v;
  const map = event.mapUrl ?? directionsUrl(event);
  const desc = description(event, lang);
  return (
    <section class="card essentials" aria-labelledby="essentials-h" data-ends={event.endsAt.toISOString()} data-when={fmtDate(event.startsAt, lang)} data-offline-saved="">
      <h2 id="essentials-h" class="h3">
        <span aria-hidden="true">📌</span> {t("ข้อมูลที่ต้องใช้วันงาน", "What you need on the day")}
      </h2>
      <div class="muted with-info">
        <span>{t("เปิดตอนมีเน็ตครั้งเดียว แล้วดูได้แม้ไม่มีสัญญาณ", "Open once online, then it works offline.")}</span>
        <MoreInfo t={t}>{t("เก็บไว้บนเครื่องนี้เท่านั้น และลบเองเมื่องานจบหรือเมื่อออกจากระบบ", "Kept on this phone only, and cleared when the table ends or you sign out.")}</MoreInfo>
      </div>
      <dl class="facts">
        <dt>{t("เมื่อไหร่", "When")}</dt>
        <dd>
          {fmtDate(event.startsAt, lang)} {t(`ถึง ${fmtParts(event.endsAt, lang).time}`, `until ${fmtParts(event.endsAt, lang).time}`)}
        </dd>
        <dt>{t("ที่ไหน", "Where")}</dt>
        <dd>
          <b>{event.venueName}</b>
          {event.venueAddress ? <span class="ess-addr">{event.venueAddress}</span> : null}
          <a href={map} target="_blank" rel="noopener noreferrer" class="ess-map">
            {t("เปิดแผนที่", "Open map")} ↗
          </a>
        </dd>
        {event.safetyInfo ? (
          <>
            <dt>{t("จุดนัดพบ", "Meeting point")}</dt>
            <dd>{event.safetyInfo}</dd>
          </>
        ) : null}
        {event.nearestStation || event.venueNotes || event.venueNotesEn ? (
          <>
            <dt>{t("วิธีหาโต๊ะ", "Finding the table")}</dt>
            <dd>
              <FindTheTable t={t} lang={lang} e={event} bare />
            </dd>
          </>
        ) : null}
        <dt>{t("โฮสต์", "Host")}</dt>
        <dd>{props.hostName ? firstName(props.hostName) : t("ทีม Jurrgun", "Jurrgun team")}</dd>
        <dt>{t("สิ่งที่ต้องเตรียม", "What to bring")}</dt>
        <dd>
          <ul class="ess-bring">
            <li>{t("บัตรนี้ หรือรหัสบัตร", "This pass, or its code.")}</li>
            {event.costThb > 0 ? (
              <li>
                {t(`ค่าใช้จ่าย ${costText(event, t)} จ่ายที่งานหรือกับผู้จัด`, `${costText(event, t)}, paid at the venue or to the host`)}
                {event.paymentNote ? ` (${event.paymentNote})` : ""}
              </li>
            ) : null}
            {event.accessibility ? <li>♿ {event.accessibility}</li> : null}
          </ul>
          {desc ? (
            <details class="how">
              <summary>{t("รายละเอียดจากผู้จัด", "Notes from the host")}</summary>
              <p style="white-space:pre-line;margin:8px 0 0">{desc}</p>
            </details>
          ) : null}
        </dd>
        <dt>{t("ติดต่อฉุกเฉิน", "Emergency contact")}</dt>
        <dd>{event.emergencyContact || "191 / 1669"}</dd>
      </dl>
    </section>
  );
}

eventRoutes.get("/me/events/:id/pass", requireMember, async (c) => {
  const { t, lang } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const [row] = await db
    .select({ event: events, reg: registrations })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.eventId, id), eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed")))
    .limit(1);
  // Paused by the team: no pass until it is back on; the event page says why.
  if (row?.event.status === "paused") return c.redirect(`/events/${id}`);
  if (!row || row.event.status !== "published") return notFound(c);
  const { event, reg } = row;
  // Phone-down mode: once checked in and while the event runs, the app steps back.
  const now = new Date();
  if (reg.checkedInAt && now < event.endsAt && c.req.query("show") !== "pass") {
    const prompts: [string, string][] = [
      ...(event.activePrompt ? [[event.activePrompt, event.activePrompt] as [string, string]] : []),
      // The same curated icebreakers this table saw on the event page.
      ...icebreakersFor(event.id).map((x): [string, string] => [x.th, x.en]),
    ];
    return page(
      c,
      { title: t("วางมือถือได้แล้ว", "Phone down"), tab: "mine" },
      <section class="phone-down">
        <p class="pd-emoji" aria-hidden="true">📵</p>
        <h1>{t("วางมือถือได้แล้ว", "Phone down, people up")}</h1>
        <p class="muted">{t("เช็กอินแล้ว ลองหยิบสักข้อมาชวนคุย", "You're checked in. Try one of these.")}</p>
        <ol class="pd-prompts">
          {prompts.slice(0, 3).map(([th, en]) => (
            <li>{t(th, en)}</li>
          ))}
        </ol>
        <a class="btn ghost" href={`/me/events/${event.id}/pass?show=pass`}>{t("ดูบัตรเข้างาน", "Show my pass")}</a>
      </section>,
    );
  }
  const live = !reg.checkedInAt && checkInOpen(event.startsAt, now);
  const code = shortCode(reg.passToken);
  // Only the host's first name: the same as the event page shows, nothing more about anyone.
  const [host] = event.hostAccountId
    ? await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, event.hostAccountId)).limit(1)
    : [];
  const dayOf = dayOfOpen(event, now);
  const anns = await eventAnnouncements(db, event.id);
  return page(
    c,
    { title: t("บัตรเข้างาน", "Event pass"), tab: "mine" },
    <>
      <OfflineSavedNote t={t} lang={lang} />
      <DayStatusLine t={t} lang={lang} shown={shownDayStatus(event, now)} />
      {dayOf && !reg.checkedInAt ? <EtaBox t={t} eventId={event.id} current={shownEta(event, reg, now)} next={`/me/events/${event.id}/pass`} /> : null}
      <AnnouncementList t={t} lang={lang} items={anns} class="ann-pass" shown={1} />
      <section class={live ? "ticket is-live" : "ticket"} aria-label={t("บัตรเข้างาน", "Event pass")}>
        <div class="ticket-top">
          <p class="eyebrow">{t("บัตรเข้างาน", "Event pass")} · {user.profile.nickname}</p>
          <h1>{title(event, lang)}</h1>
          <p>
            {/* The venue only: the full address is one tap away under Directions, and often repeats the name. */}
            {fmtDate(event.startsAt, lang)} · {event.venueName}
          </p>
        </div>
        <div class="ticket-perf" aria-hidden="true" />
        <div class="ticket-body">
          {live ? (
            <p class="live-pill" role="status">
              <i aria-hidden="true" /> {t("เปิดเช็กอินแล้ว แสดงบัตรนี้ที่จุดนัดพบ", "Check-in is open. Show this at the meeting point")}
            </p>
          ) : null}
          {/* Tap the code to flip it to the short code, big, for a host typing it in. */}
          <button type="button" class="qr-flip" aria-pressed="false" onclick="var p=this.getAttribute('aria-pressed')!=='true';this.setAttribute('aria-pressed',String(p))">
            <span class="qr-face qr-front" role="img" aria-label={t("คิวอาร์โค้ดบัตรเข้างาน ให้โฮสต์สแกน แตะเพื่อดูรหัสแบบตัวใหญ่", "Event pass QR code for the host to scan. Tap to show the short code large")} dangerouslySetInnerHTML={{ __html: qrSvg(`bkksocial:pass:${reg.passToken}`) }} />
            <span class="qr-face qr-back" aria-hidden="true">
              <small>{t("รหัสบัตร", "Pass code")}</small>
              <b>{code}</b>
              <small>{t("แตะเพื่อกลับไปที่คิวอาร์", "Tap to go back to the QR")}</small>
            </span>
          </button>
          <p class="code">{code}</p>
          <p class="muted">{t("สแกนไม่ได้ ให้โฮสต์พิมพ์รหัสนี้ · อย่าแชร์บัตร", "Scan fails? The host types this code · Don't share your pass")}</p>
          {isRomanceEvent(event) ? (
            <p class="muted">
              {t(`ที่นั่งของคุณ: ${seatCode(reg.passToken)}`, `Your seat: ${seatCode(reg.passToken)}`)} ·{" "}
              {t("โฮสต์งาน 💘 เห็นแค่รหัสที่นั่ง ไม่เห็นชื่อคุณ", "At a 💘 event the host sees this seat code, not your name")}
            </p>
          ) : null}
          {reg.checkedInAt ? <Tag tone="ok">{t("เช็กอินแล้ว", "Checked in")}</Tag> : null}
        </div>
      </section>
      {now < event.startsAt ? (
        <p class="countdown" data-start={event.startsAt.toISOString()}  data-lang={lang}>
          {t("เริ่ม", "Starts")} {fmtDate(event.startsAt, lang)}
        </p>
      ) : null}
      <PassSteps t={t} checkedIn={!!reg.checkedInAt} />
      {now < event.startsAt ? <TableIntroPrompt v={view(c)} next={`/me/events/${event.id}/pass`} /> : null}
      <WarmupLine e={event} t={t} confirmed now={now} />
      <div class="pass-actions">
        <a class="chip-btn" href={`/me/events/${event.id}/calendar.ics`} download={`jurrgun-${event.id}.ics`}>
          <span aria-hidden="true">🗓️</span> {t("เพิ่มในปฏิทิน", "Add to calendar")}
        </a>
        <a class="chip-btn" href={directionsUrl(event)} target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">🧭</span> {t("เส้นทาง", "Directions")}
        </a>
      </div>
      <Script dangerouslySetInnerHTML={{ __html: COUNTDOWN_JS }} />
      <Essentials event={event} hostName={host?.nickname ?? null} v={view(c)} />
      <LinkButton href={`/events/${event.id}`} kind="ghost">{t("← รายละเอียดกิจกรรม", "← Event details")}</LinkButton>
    </>,
  );
});

/**
 * What happens next on the pass, as a three-step progress strip (owner, C4):
 * a spot, check-in, People I met. Done steps carry a tick and the current one
 * says "Now", so the state never rests on colour alone.
 */
export function PassSteps(props: { t: T; checkedIn: boolean }) {
  const { t } = props;
  const at = props.checkedIn ? 2 : 1;
  const steps = [
    { label: t("ได้ที่นั่งแล้ว", "You have a spot"), hint: t("จัดโต๊ะก่อนเริ่มงาน", "Tables set before the start") },
    { label: t("เช็กอินกับโฮสต์", "Check in with your host"), hint: t("เปิด 30 นาทีก่อนเริ่ม", "Opens 30 min before") },
    { label: t("คนที่เจอ", "People I met"), hint: t(`${PEOPLE_WINDOW_HOURS} ชม. หลังจบงาน ถ้าเลือกตรงกัน`, `${PEOPLE_WINDOW_HOURS} h after, if it's mutual`) },
  ];
  return (
    <ol class="pass-steps" aria-label={t("ขั้นตอนต่อไป", "What happens next")}>
      {steps.map((s, i) => (
        <li class={i < at ? "is-done" : i === at ? "is-now" : undefined} aria-current={i === at ? "step" : undefined}>
          <span class="ps-bar" aria-hidden="true" />
          <b>
            <span class="ps-mark" aria-hidden="true">{i < at ? "✓" : String(i + 1)}</span> {s.label}
          </b>
          {i < at ? <span class="sr-only">{t("(เสร็จแล้ว)", "(done)")}</span> : null}
          {i === at ? <small class="ps-now">{t("ตอนนี้", "Now")}</small> : null}
          <small>{s.hint}</small>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Running late" / "On my way": a confirmed attendee tells the host, on the
 * day only. Nobody else sees it; the host sees first names (host tools and
 * the event page).
 */
eventRoutes.post("/events/:id/eta", requireMember, async (c) => {
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const body = await c.req.parseBody();
  const raw = str(body.eta);
  const next = safeNext(str(body.next), `/events/${id}`);
  const [row] = await db
    .select({ event: events, reg: registrations })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.eventId, id), eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed")))
    .limit(1);
  if (!row || row.event.status !== "published") return notFound(c);
  const now = new Date();
  if (!dayOfOpen(row.event, now)) {
    return forbidden(c, "บอกโฮสต์ได้เฉพาะวันงาน ตั้งแต่ไม่กี่ชั่วโมงก่อนเริ่มจนจบงาน", "You can tell the host only on the day, from a few hours before the start until the end.", `/events/${id}`);
  }
  if (raw !== "clear" && !isEtaStatus(raw)) return c.redirect(next);
  await db
    .update(registrations)
    .set(raw === "clear" ? { etaStatus: null, etaAt: null } : { etaStatus: raw, etaAt: now })
    .where(eq(registrations.id, row.reg.id));
  // Running late tells the host once (first name only, never the event title); on my way stays quiet.
  if (raw === "running_late") {
    const hostId = row.event.hostAccountId ?? row.event.createdBy;
    const [host] = await db.select({ locale: profiles.locale }).from(profiles).where(eq(profiles.accountId, hostId)).limit(1);
    await notifyHostRunningLate(c.env, db, { eventId: id, hostId, attendeeId: user.account.id, firstName: user.profile.nickname ? firstName(user.profile.nickname) : null, hostLocale: host?.locale ?? null }, now);
  }
  return c.redirect(next);
});



eventRoutes.post("/events/:id/hello", requireMember, async (c) => {
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const body = await c.req.parseBody();
  const [row] = await db
    .select({ event: events, reg: registrations })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.eventId, id), eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed")))
    .limit(1);
  if (!row || row.event.status !== "published") return notFound(c);
  if (!helloOpen(row.event, new Date())) return c.redirect(`/events/${id}`);
  await db.update(registrations).set({ helloLine: cleanHello(str(body.hello)) }).where(eq(registrations.id, row.reg.id));
  return c.redirect(`/events/${id}#hello`);
});

/** The pass as a calendar file: only for the member holding a confirmed seat. */
eventRoutes.get("/me/events/:id/calendar.ics", requireMember, async (c) => {
  const { lang } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const [row] = await getDb(c.env)
    .select({ event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.eventId, id), eq(registrations.accountId, user.account.id), eq(registrations.status, "confirmed")))
    .limit(1);
  if (!row || row.event.status !== "published") return notFound(c);
  const url = `${new URL(c.req.url).origin}/me/events/${id}/pass`;
  return c.body(eventIcs(row.event, lang, url), 200, {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": `attachment; filename="jurrgun-${id}.ics"`,
    "cache-control": "private, no-store",
  });
});

/**
 * One countdown line, "Starts in 2 h 15 m", ticking each minute (owner, C4).
 * When check-in opens is the strip's second step.
 */
const COUNTDOWN_JS = `(function(){var el=document.querySelector(".countdown[data-start]");if(!el)return;var start=new Date(el.dataset.start).getTime(),th=el.dataset.lang!=="en";
function span(ms){var m=Math.max(0,Math.round(ms/60000)),d=Math.floor(m/1440),h=Math.floor(m%1440/60),mm=m%60;if(th)return d?d+" วัน "+h+" ชม.":h?h+" ชม. "+mm+" นาที":mm+" นาที";return d?d+" d "+h+" h":h?h+" h "+mm+" m":mm+" m"}
function tick(){var now=Date.now(),left=start-now;if(left<=0){el.textContent=th?"เริ่มแล้ว":"It's started";return}
el.textContent=(th?"เริ่มในอีก ":"Starts in ")+span(left)}
tick();setInterval(tick,60000)})()`;

