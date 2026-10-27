/**
 * Events, detail part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { helloOpen } from "../../domain/hello";
import { isGoTogether, ShowLine, TicketButton, TicketNote, WarmupLine } from "../../ui/go-together";
import { TableIntroPrompt } from "../../ui/table-intro";
import { SaveNext } from "../../ui/offline-next";
import { IcebreakerCard } from "../../ui/icebreakers";
import { icebreakerWindow } from "../../content/icebreakers";
import { OPEN_TO_MORE_TAG, romanceEventOk, womenOnlyEventVisible } from "../../domain/rules";
import { getCookie, setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import { and, count, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb } from "../../db";
import { isLateCancel, strikeStanding, type StrikeStanding } from "../../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, label } from "../../lib/constants";
import type { CurrentUser } from "../../lib/env";
import { fmtDate, fmtParts, type T } from "../../lib/i18n";
import { seeAgain } from "../../services/see-again";
import { SeeAgainCard } from "../../ui/see-again";
import { requireMember } from "../../lib/session";
import { accounts, buddyPairs, events, invites, profiles, registrations, type Event, type Registration } from "../../schema";
import { refreshWaitlist, runBuddyRound, seatState } from "../../services/events";
import { Button, Card, Field, LinkButton, Notice, page, Tag, TextArea, Toggle, view, type View, FactIcon, FactTiles } from "../../ui/kit";
import { canView, isReviewer, ownsEvent, PAUSED_LINE } from "../../domain/hosting";
import { eventAnnouncements } from "../../services/announcements";
import { AnnouncementList } from "../../ui/announcements";
import { dayOfOpen, shownDayStatus, shownEta } from "../../domain/day-of";
import { DayStatusLine, EtaBox, EtaSummary, FindTheTable } from "../../ui/day-of";
import { canJoin as canJoinTable, tableVisible } from "../../domain/regular-tables";
import { blockedAmong, getTable, hostTable, memberIds, rejoinAfterFor, seatedFor, standing } from "../../services/regular-tables";
import { partnerNames } from "../../services/collabs";
import { BookingChecks, EntryRulesLine } from "../../ui/entry-rules";
import { needsDisclaimer, TALK_QUESTION_MAX } from "../../domain/event-rules";
import { eventRoutes } from "./app";
import {
  ACTIVE,
  Cover,
  coverEmoji,
  DAY,
  HelloBox,
  Seats,
  ShieldIcon,
  ageText,
  blockedWith,
  costText,
  coverSrc,
  description,
  directionsUrl,
  eyebrow,
  firstName,
  helloLines,
  jsonHas,
  langsText,
  me,
  myStrikes,
  questLabel,
  statusLabel,
  title,
} from "./shared";
import type { Ctx, Db } from "./shared";

// -------------------------------------------------------------- detail --

/** The event, or null when it doesn't exist or this viewer may not see it. */
/** Cookie remembering a private event's link, so RSVP and the pass work after opening it. */
const privateCookie = (id: string) => `bkk_pev_${id.replace(/[^\w-]/g, "")}`;

/**
 * The event, if this member may see it (src/domain/hosting.ts canView):
 * public events for everyone; private ones through their link (?t=…, then
 * remembered in a cookie scoped to the event), for the host side, staff and
 * anyone signed up; drafts and proposals for the host side and reviewers.
 */
export async function visibleEvent(c: Ctx, id: string): Promise<Event | null> {
  const db = getDb(c.env);
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return null;
  const a = c.var.user!.account;
  const viewer = { id: a.id, role: a.role, partnerOrgId: a.partnerOrgId };
  const p = c.var.user!.profile;
  if (!p || !romanceEventOk(event.tags, p) || !womenOnlyEventVisible(event.tags, p)) return null;
  if (canView(event, viewer)) return event;
  const fromLink = c.req.query("t");
  const token = fromLink ?? getCookie(c, privateCookie(id)) ?? null;
  const [reg] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(and(eq(registrations.eventId, id), eq(registrations.accountId, a.id)))
    .limit(1);
  if (!canView(event, viewer, { token, registered: !!reg })) {
    // A regular table's hangout opens for everyone sitting at that table.
    return event.status === "published" && (await seatedFor(db, event, a.id)) ? event : null;
  }
  if (fromLink && event.visibility === "private" && event.privateToken && fromLink === event.privateToken) {
    setCookie(c, privateCookie(id), fromLink, { path: `/events/${id}`, httpOnly: true, sameSite: "Lax", secure: new URL(c.req.url).protocol === "https:", maxAge: 60 * 86_400 });
  }
  return event;
}

/** For the host on the day: first names of attendees who said they're running late or on the way (not yet checked in). */
async function etaNames(db: Db, event: Event, now: Date): Promise<{ late: string[]; onWay: string[] }> {
  const rows = await db
    .select({ etaStatus: registrations.etaStatus, etaAt: registrations.etaAt, checkedInAt: registrations.checkedInAt, nickname: profiles.nickname })
    .from(registrations)
    .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
    .where(and(eq(registrations.eventId, event.id), eq(registrations.status, "confirmed"), isNotNull(registrations.etaStatus)))
    .limit(500);
  const pick = (k: string) => rows.filter((r) => !r.checkedInAt && shownEta(event, r, now) === k).map((r) => firstName(r.nickname ?? "?"));
  return { late: pick("running_late"), onWay: pick("on_my_way") };
}

export async function myRegistration(db: Db, eventId: string, accountId: string): Promise<Registration | null> {
  const [reg] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, accountId)))
    .limit(1);
  return reg ?? null;
}

export function notFound(c: Ctx) {
  const { t } = view(c);
  return page(
    c,
    { title: t("ไม่พบกิจกรรม", "Event not found"), tab: "events", status: 404 },
    <>
      <h1>{t("ไม่พบกิจกรรมนี้", "We couldn't find that event")}</h1>
      {/* Say why, then two ways on, so a dead link still leads to a table (Phase 3). */}
      <p class="muted">
        {t(
          "อาจจบไปแล้ว ถูกยกเลิก เป็นกิจกรรมส่วนตัว หรือลิงก์ไม่ครบ ลองดูโต๊ะที่เปิดอยู่สัปดาห์นี้แทน",
          "It may have ended, been cancelled or be private, or the link may be incomplete. Here's what's open this week instead.",
        )}
      </p>
      <div class="row">
        <LinkButton href="/?when=week">{t("กิจกรรมสัปดาห์นี้", "This week's events")}</LinkButton>
        <LinkButton href="/plan" kind="ghost">{t("แผนสัปดาห์นี้ของฉัน", "My plan this week")}</LinkButton>
      </div>
    </>,
  );
}

export function forbidden(c: Ctx, th: string, en: string, back: string) {
  const { t } = view(c);
  return page(
    c,
    { title: t("ยังเข้าไม่ได้", "Not available yet"), tab: "mine", status: 403 },
    <>
      <Notice kind="warn">{t(th, en)}</Notice>
      <LinkButton href={back} kind="ghost">{t("← กลับ", "← Back")}</LinkButton>
    </>,
  );
}

/**
 * My Event Buddy group (PRD §10.5): nicknames only, from 24h before start,
 * blocked people removed in both directions.
 */
export async function buddyNicknames(db: Db, event: Event, accountId: string, now = new Date()): Promise<string[] | null> {
  if (!event.buddyEnabled || !event.buddyRoundAt) return null;
  if (now.getTime() < event.startsAt.getTime() - DAY || now.getTime() > event.endsAt.getTime()) return null;
  const [pair] = await db
    .select({ members: buddyPairs.members })
    .from(buddyPairs)
    .where(and(eq(buddyPairs.eventId, event.id), jsonHas(buddyPairs.members, accountId)))
    .limit(1);
  if (!pair) return null;
  const others = pair.members.filter((m) => m !== accountId);
  const hidden = await blockedWith(db, accountId, others);
  const visible = others.filter((m) => !hidden.has(m));
  if (visible.length === 0) return [];
  // Only buddies who are still coming: an active account with an active seat.
  const rows = await db
    .select({ nickname: profiles.nickname })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.accountId))
    .innerJoin(registrations, and(eq(registrations.accountId, profiles.accountId), eq(registrations.eventId, event.id)))
    .where(and(inArray(profiles.accountId, visible), eq(accounts.status, "active"), inArray(registrations.status, [...ACTIVE])))
    .limit(10);
  return rows.map((r) => r.nickname);
}

/** Where a long host text breaks: about 4 lines, at a line or a space, never inside a Thai syllable. */
export function hostTextLead(text: string, maxChars = 200, maxLines = 4): [string, string] | null {
  const lines = text.split("\n");
  if (text.length <= maxChars + 60 && lines.length <= maxLines + 1) return null;
  let lead = lines.slice(0, maxLines).join("\n");
  if (lead.length > maxChars) {
    const space = lead.lastIndexOf(" ", maxChars);
    let cut = space > maxChars * 0.5 ? space : maxChars;
    // Thai vowels and tone marks above or below belong to the letter before them.
    while (cut < lead.length && /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(lead[cut])) cut++;
    lead = lead.slice(0, cut);
  }
  const rest = text.slice(lead.length).trim();
  return rest ? [lead.trimEnd(), rest] : null;
}

/** Host-written text as written; a long one shows about 4 lines, then "Read more". */
function HostText(props: { text: string; t: T }) {
  const { text, t } = props;
  if (!text) return null;
  const split = hostTextLead(text);
  if (!split) return <p style="white-space:pre-line">{text}</p>;
  return (
    <div class="host-text">
      <p class="host-text-lead">
        {split[0]}
        <span class="host-text-dots" aria-hidden="true">…</span>
      </p>
      <details class="host-text-more">
        <summary>{t("อ่านต่อ", "Read more")}</summary>
        <p>{split[1]}</p>
      </details>
    </div>
  );
}

export function BuddyBox(props: { names: string[] | null; event: Event; t: T }) {
  const { names, t } = props;
  if (!names || names.length === 0) return null;
  return (
    <section class="open-sec buddy">
      <h2>🤝 {t("บัดดี้ของคุณ", "Your event buddy")}</h2>
      <p>
        <strong>{names.join(", ")}</strong>
      </p>
      <p class="muted">
        {t("นัดเจอกันที่จุดนัดพบก่อนเริ่ม 15 นาที", "Meet at the meeting point 15 minutes early.")}
        {props.event.safetyInfo ? ` · ${props.event.safetyInfo}` : ""}
      </p>
    </section>
  );
}

type TableBoxData = { id: string; name: string; seated: boolean; canJoin: boolean } | null;

/**
 * The host's regular table on their event page: members see a link to it;
 * someone who went to this hangout (a confirmed seat, once it has started)
 * gets "Join this regular table" if the table's rules let them in.
 */
async function tablePrompt(db: Db, event: Event, user: CurrentUser, now: Date): Promise<TableBoxData> {
  const hostId = event.hostAccountId;
  if (!hostId || event.status !== "published") return null;
  const table = event.regularTableId ? await getTable(db, event.regularTableId) : await hostTable(db, hostId);
  if (!table || table.hostAccountId !== hostId) return null;
  const me = user.account.id;
  const st = await standing(db, table, me);
  if (st.isMember) return { id: table.id, name: table.name, seated: true, canJoin: false };
  if (!tableVisible(table, user.profile ?? {}, st.blockedWithHost)) return null;
  // Only after the hangout has started, and only for people who had a seat at it.
  if (event.startsAt.getTime() > now.getTime()) return null;
  const [reg] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(and(eq(registrations.eventId, event.id), eq(registrations.accountId, me), eq(registrations.status, "confirmed")))
    .limit(1);
  if (!reg) return null;
  const members = await memberIds(db, table.id);
  const [blocked, rejoinAfter] = await Promise.all([blockedAmong(db, me, [hostId, ...members]), rejoinAfterFor(db, table.id, me)]);
  const check = canJoinTable({ archived: false, isHost: false, invited: true, blocked: blocked.size > 0, womenOnly: table.womenOnly, viewer: user.profile ?? {}, memberCount: members.length, rejoinAfter });
  return check.ok ? { id: table.id, name: table.name, seated: false, canJoin: true } : null;
}

function TableBox(props: { box: TableBoxData; t: T }) {
  const { box, t } = props;
  if (!box) return null;
  return (
    <section class="open-sec table-box">
      <h2>👥 {t(`โต๊ะประจำ "${box.name}"`, `Regular Table "${box.name}"`)}</h2>
      {box.seated ? (
        <LinkButton href={`/tables/${box.id}`} kind="ghost">
          {t("ไปที่โต๊ะประจำ", "Go to the Regular Table")}
        </LinkButton>
      ) : (
        <form method="post" action={`/tables/${box.id}/join`}>
          <p class="muted">{t("เข้าร่วมแล้ว เจ้าภาพจะชวนไปครั้งหน้า", "Join, and the host invites you next time.")}</p>
          <Button>{t("เข้าร่วมโต๊ะประจำ", "Join this Regular Table")}</Button>
        </form>
      )}
    </section>
  );
}

type DetailOpts = { error?: string; status?: 200 | 400 | 403 | 409 };

export async function renderDetail(c: Ctx, event: Event, opts: DetailOpts = {}) {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const db = getDb(c.env);
  const now = new Date();

  const [reg, state, host, buddies, standingRows, cover, partner, tableBox, anns] = await Promise.all([
    myRegistration(db, event.id, user.account.id),
    seatState(db, event),
    event.hostAccountId
      ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, event.hostAccountId)).limit(1)
      : Promise.resolve([] as { nickname: string }[]),
    buddyNicknames(db, event, user.account.id, now),
    myStrikes(db, user.account.id),
    coverSrc(c.env, event),
    partnerNames(c.env, event),
    tablePrompt(db, event, user, now),
    // Host announcements: everyone who can open this page can read them (visibleEvent decided that).
    eventAnnouncements(db, event.id),
  ]);

  // Bring-a-friend (PRD §8.2): my open invite link, if I have one.
  let inviteUrl: string | null = null;
  if (canInvite(event, reg, now)) {
    const [inv] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.eventId, event.id), eq(invites.inviter, user.account.id), isNull(invites.usedBy)))
      .limit(1);
    if (inv) inviteUrl = `${new URL(c.req.url).origin}/invite/${inv.id}`;
  }

  let waitPos: number | null = null;
  if (reg?.status === "waitlisted") {
    const [row] = await db
      .select({ n: count() })
      .from(registrations)
      .where(and(eq(registrations.eventId, event.id), eq(registrations.status, "waitlisted"), lt(registrations.createdAt, reg.createdAt)));
    waitPos = Number(row?.n ?? 0) + 1;
  }

  const left = Math.max(0, event.capacity - state.taken);
  const started = event.startsAt.getTime() <= now.getTime();
  const ended = event.endsAt.getTime() <= now.getTime();
  const quest = questLabel(event, lang);
  const standing = strikeStanding(standingRows, now);
  // Afterwards: the people I met here, and one way back to them.
  // A private talk never asks who to see again (D52).
  const again = ended && reg?.checkedInAt && !event.talkMode ? await seeAgain(db, { id: user.account.id, birthDate: user.profile.birthDate }, { eventId: event.id, now }) : null;
  // On the day: the host's one-line status for people going (and the host), and "running late" / "on my way".
  const going = reg?.status === "confirmed" && event.status === "published";
  const hosting = ownsEvent(event, { id: user.account.id, role: user.account.role, partnerOrgId: user.account.partnerOrgId });
  const dayOf = event.status === "published" && dayOfOpen(event, now);
  const dayStatus = going || hosting ? shownDayStatus(event, now) : null;
  const eta = dayOf && hosting ? await etaNames(db, event, now) : null;
  const hello = going && helloOpen(event, now) ? await helloLines(db, event, reg!, user.account.id) : null;
  // "Running late" / "on my way" and the host's who's-coming list: no ids, so they can sit in both layouts.
  const dayOfControls = (where: "ev-phone" | "ev-lap") => (
    <>
      {going && dayOf && !reg!.checkedInAt ? (
        <div class={where}>
          <EtaBox t={t} eventId={event.id} current={shownEta(event, reg!, now)} next={`/events/${event.id}`} />
        </div>
      ) : null}
      {eta ? (
        <Card class={`eta-host ${where}`}>
          <h2 class="h3">{t("ใครกำลังมา", "Who's on the way")}</h2>
          <EtaSummary t={t} late={eta.late} onWay={eta.onWay} />
          <a href={`/admin/events/${event.id}#day-of`}>{t("ตั้งสถานะวันงาน", "Set the day-of status")}</a>
        </Card>
      ) : null}
    </>
  );
  const stripProps = { event, reg, v, left, waitPos, started, ended, standing };

  return page(
    c,
    // Going: the event lives under My events, so that tab lights up.
    { title: title(event, lang), tab: reg?.status === "confirmed" ? "mine" : "events", status: opts.status },
    <>
      {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
      {event.status === "cancelled" ? (
        <Notice kind="warn">{t("กิจกรรมนี้ยกเลิกแล้ว ขอโทษที่ทำให้ไม่สะดวกนะ", "This event has been cancelled. Sorry for the change of plans.")}</Notice>
      ) : null}
      {event.status === "draft" ? <Notice kind="info">{t("ฉบับร่าง สมาชิกยังไม่เห็นกิจกรรมนี้", "Draft: members can't see this yet")}</Notice> : null}
      {event.status === "pending" ? <Notice kind="info">{t("รอทีมงานตรวจ สมาชิกยังไม่เห็นกิจกรรมนี้", "Waiting for review: members can't see this yet")}</Notice> : null}
      {event.status === "rejected" ? <Notice kind="warn">{t("ทีมงานส่งกลับให้แก้ไข", "Sent back by the team for changes")}{event.reviewNote ? `: ${event.reviewNote}` : ""}</Notice> : null}
      {event.status === "paused" ? (
        // The moderator's note is for the host side only; people with a place see the calm line.
        hosting || isReviewer(user.account.role) ? (
          <Notice kind="warn">
            {t("ทีมงานพักกิจกรรมนี้ไว้ ดึงออกจากหน้าค้นหาแล้ว คนที่มีที่นั่งยังเก็บที่ไว้", "Paused by the team and off Discover. People with a place keep it.")}
            {event.reviewNote ? ` ${t("เหตุผล", "Why")}: ${event.reviewNote}` : ""}
          </Notice>
        ) : (
          <Notice kind="warn">{t(PAUSED_LINE[0], PAUSED_LINE[1])}</Notice>
        )
      ) : null}
      {event.visibility === "private" && event.regularTableId ? (
        <Notice kind="info" icon="🔒">{t("แฮงเอาต์ของโต๊ะประจำ เห็นได้เฉพาะคนในโต๊ะและคนที่ได้ลิงก์จากเจ้าภาพ", "A Regular Table hangout: only people at the table, and people the host sent the link to, can see it.")}</Notice>
      ) : event.visibility === "private" ? (
        <Notice kind="info" icon="🔒">{t("กิจกรรมส่วนตัว เห็นได้เฉพาะคนที่มีลิงก์ อย่าโพสต์ลิงก์นี้ในที่สาธารณะ", "Private event: only people with the link can see it. Please don't post the link publicly.")}</Notice>
      ) : null}
      {/* Laptops (owner card, 2026-10-17): details on the left, a sticky rail on the right with the next action,
          My registration and the day-of controls. Phones read one column in the same order as before; the
          day-of controls show once per screen size (ev-phone / ev-lap). */}
      <div class="ev-layout">
      <div class="ev-main">
      <DayStatusLine t={t} lang={lang} shown={dayStatus} class="ev-phone" />
      {hello ? <HelloBox t={t} lang={lang} event={event} mine={reg!.helloLine} lines={hello} /> : null}
      {dayOfControls("ev-phone")}
      {/* Owner card 7 (2026-10-26): no empty tinted band above the title; an uploaded photo still shows. */}
      {cover ? <Cover e={event} src={cover} class="ev-scene" /> : null}
      <Card class={cover ? "ev-sheet" : "ev-sheet ev-flat"}>
        <p class="eyebrow">
          <span class="ev-emoji" aria-hidden="true">{coverEmoji(event)}</span> {eyebrow(event, t, lang)}
        </p>
        <h1>{title(event, lang)}</h1>
        <StatusStrip {...stripProps} class="ev-phone" />
        <AnnouncementList t={t} lang={lang} items={anns} />
        {quest ? (
          <p>
            <Tag tone="accent">🧭 {t("ซิตี้เควสต์", "City Quest")}</Tag> {quest}
          </p>
        ) : null}
        <FactTiles
          cols={4}
          class="ev-facts"
          facts={[
            {
              icon: "📅",
              label: t("เมื่อไหร่", "When"),
              answer: fmtDate(event.startsAt, lang),
              sub: isGoTogether(event) ? t("เวลานัดเจอ", "time we meet") : t(`ถึง ${fmtParts(event.endsAt, lang).time}`, `until ${fmtParts(event.endsAt, lang).time}`),
            },
            { icon: "📍", label: t("ที่ไหน", "Where"), answer: event.venueName, sub: label(DISTRICTS, event.district, lang) },
            {
              icon: "👥",
              label: t("โต๊ะ", "Table"),
              answer: t(`โต๊ะละ ${event.groupMin} ถึง ${event.groupMax} คน`, `Tables of ${event.groupMin}-${event.groupMax}`),
              sub: label(INTENSITY, event.intensity, lang),
            },
            {
              icon: "🪑",
              label: t("ที่นั่ง", "Spots"),
              answer: left > 0 ? t(`เหลือ ${left} ที่`, `${left} left`) : reg?.status === "confirmed" ? t("เต็มแล้ว คุณได้ที่แล้ว", "Full, you're in") : t("เต็มแล้ว", "Full"),
              sub: <Seats capacity={event.capacity} taken={state.taken} />,
            },
          ]}
        />
        <ShowLine e={event} t={t} lang={lang} />
        <EntryRulesLine e={event} t={t} />
        {reg?.status === "confirmed" && !started ? <TableIntroPrompt v={v} next={`/events/${event.id}`} /> : null}
        <WarmupLine e={event} t={t} confirmed={reg?.status === "confirmed"} now={now} />
        {reg?.status === "confirmed" && event.status === "published" && !ended ? <SaveNext paths={[`/me/events/${event.id}/pass`]} /> : null}
        {event.venueAddress || event.mapUrl ? (
          <p class="ev-line">
            {event.venueAddress ? `📍 ${event.venueAddress} ` : null}
            {event.mapUrl ? (
              <a href={event.mapUrl} target="_blank" rel="noopener noreferrer">
                {t("เปิดแผนที่", "Open map")}
              </a>
            ) : null}
          </p>
        ) : null}
        <FindTheTable t={t} lang={lang} e={event} />
        <p class="ev-actions">
          <LinkButton kind="tonal" href={directionsUrl(event)} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">🧭</span> {t("เส้นทาง", "Directions")}
          </LinkButton>
          <TicketButton e={event} t={t} />
        </p>
        <TicketNote e={event} t={t} />
        <div class="tags">
          {partner.length ? <Tag tone="ok">🤝 {t(`ร่วมกับ ${partner.join(" + ")}`, `With ${partner.join(" + ")}`)}</Tag> : null}
          {event.tags.map((tag) => (
            <Tag tone={tag === OPEN_TO_MORE_TAG ? "love" : "muted"}>{label(EVENT_TAGS, tag, lang)}</Tag>
          ))}
        </div>
        <HostText text={description(event, lang)} t={t} />
      </Card>
      {reg?.status === "confirmed" && event.status === "published" && icebreakerWindow(event.startsAt, event.endsAt, now) ? (
        <IcebreakerCard v={v} eventId={event.id} chatKey={event.visibility === "private" ? `circle:${event.id}` : null} />
      ) : null}

      <section class="open-sec ev-details">
        <h2>{t("รายละเอียด", "Details")}</h2>
        <p class="chips2">
          <span>🧑‍🤝‍🧑 {host[0]?.nickname ?? t("ทีม Jurrgun", "Jurrgun team")}</span>
          <span>🎂 {ageText(event, t)}</span>
          <span><FactIcon name="lang" /> {langsText(event, lang)}</span>
          <span>💸 {costText(event, t)}</span>
          {event.plusOneAllowed ? <span>➕ {t("ชวนเพื่อนมาได้ +1", "+1 welcome")}</span> : null}
          {event.accessibility ? <span>♿ {t("มีข้อมูลการเข้าถึง", "Access info")}</span> : null}
          {event.freeSeats > 0 && event.costThb > 0 ? <span>🎁 {t("มีที่นั่งส่งต่อน้ำใจ", "Pay-it-forward seats")}</span> : null}
          {event.endsAt.getTime() - event.startsAt.getTime() <= 90 * 60_000 ? <span>⏱️ {t("สั้น ๆ ไม่เกิน 90 นาที", "Short: 90 min or less")}</span> : null}
        </p>
        <details class="how">
        <summary>{t("รายละเอียดทั้งหมด", "All details")}</summary>
        <dl class="facts">
          <dt>{t("ผู้จัด / โฮสต์", "Host")}</dt>
          <dd>{host[0]?.nickname ?? t("ทีม Jurrgun", "Jurrgun team")}</dd>
          {partner.length ? (
            <>
              <dt>{t("พาร์ตเนอร์", "Partners")}</dt>
              <dd>🤝 {partner.join(" + ")}</dd>
            </>
          ) : null}
          <dt>{t("จำนวนที่นั่ง", "Capacity")}</dt>
          <dd>
            {event.capacity} · {left > 0 ? t(`เหลือ ${left} ที่`, `${left} left`) : t("เต็มแล้ว ต่อคิวสำรองได้", "Full, waitlist open")}
          </dd>
          <dt>{t("ช่วงอายุ", "Age range")}</dt>
          <dd>{ageText(event, t)}</dd>
          <dt>{t("ภาษา", "Languages")}</dt>
          <dd>{langsText(event, lang)}</dd>
          <dt>{t("ค่าใช้จ่าย", "Cost")}</dt>
          <dd>
            {costText(event, t)}
            {event.costThb > 0 ? (
              <small>
                {" "}
                {t("จ่ายนอกแอป ที่งานหรือกับผู้จัด", "Paid outside the app, at the venue or to the host.")}
                {event.paymentNote ? ` ${event.paymentNote}` : ""}
              </small>
            ) : null}
            {event.costThb > 0 && event.paymentUrl ? (
              <>
                {" "}
                <a href={event.paymentUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {t("จ่ายเงินให้ผู้จัด ↗", "Pay the host ↗")}
                </a>
              </>
            ) : null}
          </dd>
          <dt>{t("ความคึกคัก", "Social intensity")}</dt>
          <dd>{label(INTENSITY, event.intensity, lang)}</dd>
          <dt>{t("คนต่อโต๊ะ", "Table size")}</dt>
          <dd>{t(`โต๊ะละ ${event.groupMin} ถึง ${event.groupMax} คน`, `Tables of ${event.groupMin}-${event.groupMax}`)}</dd>
          <dt>{t("ชวนเพื่อนมาได้ (+1)", "Bring a friend (+1)")}</dt>
          <dd>{event.plusOneAllowed ? t("ได้", "Yes") : t("ไม่ได้", "No")}</dd>
          <dt>{t("การเข้าถึง", "Accessibility")}</dt>
          <dd>{event.accessibility || t("ถามโฮสต์ได้", "Ask the host")}</dd>
          <dt>{t("จุดนัดพบและความปลอดภัย", "Meeting point & safety")}</dt>
          <dd>{event.safetyInfo || t("โฮสต์จะแจ้งก่อนงาน", "Your host will share it before the event")}</dd>
          <dt>{t("ติดต่อฉุกเฉิน", "Emergency contact")}</dt>
          <dd>{event.emergencyContact || "191 / 1669"}</dd>
          {event.residentQuota > 0 || event.residentPriority ? (
            <>
              <dt>{t("สิทธิ์ผู้มีทะเบียนบ้าน กทม.", "Bangkok resident priority")}</dt>
              <dd>
                {event.residentQuota > 0
                  ? t(`กันไว้ ${event.residentQuota} ที่สำหรับผู้มีทะเบียนบ้านในกรุงเทพฯ ที่ยืนยันแล้ว`, `${event.residentQuota} seats held for verified Bangkok-registered residents`)
                  : t("ผู้มีทะเบียนบ้าน กทม. ที่ยืนยันแล้ว ได้ลำดับก่อนในคิวสำรอง", "Verified residents go first on the waitlist")}
              </dd>
            </>
          ) : null}
        </dl>
        </details>
      </section>

      {event.talkMode && reg?.status === "confirmed" && !ended ? (
        <Card>
          <h2 class="h3">{t("ถามแบบไม่ระบุชื่อ", "Ask anonymously")}</h2>
          <p class="muted">{t("ผู้จัดเห็นแค่คำถาม ไม่มีใครรู้ว่าใครถาม รวมถึงทีมงาน", "The organiser sees only the question. Nobody, staff included, can see who asked.")}</p>
          <form method="post" action={`/events/${event.id}/questions`}>
            <TextArea label={t("คำถามของคุณ", "Your question")} name="question" rows={3} required maxlength={TALK_QUESTION_MAX} />
            <Button>{t("ส่งคำถาม", "Send the question")}</Button>
          </form>
        </Card>
      ) : null}
      {event.talkMode ? null : <BuddyBox names={buddies} event={event} t={t} />}
      <TableBox box={tableBox} t={t} />
      </div>

      <div class="ev-rail">
      <DayStatusLine t={t} lang={lang} shown={dayStatus} class="ev-lap" />
      {dayOfControls("ev-lap")}
      <StatusStrip {...stripProps} class="ev-lap" />
      {event.status === "cancelled" ? null : (
        <Card class="ev-reg">
          <h2>{t("การลงทะเบียนของฉัน", "My registration")}</h2>
          <p class="safe-line">
            <ShieldIcon />
            <span>
              {t(
                "สถานที่สาธารณะ มีโฮสต์ดูแล และไม่มีใครเห็นโปรไฟล์ของคุณ จนกว่าจะเลือกกันทั้งสองฝ่าย",
                "A public place with a host, and nobody sees your profile unless you both say yes.",
              )}
            </span>
          </p>
          <RegistrationBox event={event} reg={reg} v={v} waitPos={waitPos} started={started} ended={ended} standing={standing} />
          {canInvite(event, reg, now) ? <InviteBox event={event} url={inviteUrl} v={v} /> : null}
        </Card>
      )}
      </div>
      </div>
      {again ? <SeeAgainCard v={v} data={again} here /> : null}
      {hosting ? null : <RsvpBar {...stripProps} />}
    </>,
  );
}

type StripProps = {
  event: Event;
  reg: Registration | null;
  v: View;
  left: number;
  waitPos: number | null;
  started: boolean;
  ended: boolean;
  standing: StrikeStanding;
};

/**
 * Where I stand on an event and the ONE next action, worked out once for the
 * status strip and the phone RSVP bar. "book" marks the RSVP or waitlist action.
 * Its buttons drive the forms in My registration (form="rsvp", form="offer").
 */
function stripParts(props: StripProps): { tone: string; text: string; sub: string | null; action: Child | null; book: boolean } | null {
  const { event, reg, left, started, ended } = props;
  const { t, lang } = props.v;
  if (event.status !== "published" || ended) return null;
  const status = reg?.status;
  const part = (tone: string, text: string, sub: string | null, action: Child | null, book = false) => ({ tone, text, sub, action, book });
  if (status === "confirmed") {
    if (started && reg!.checkedInAt) {
      return part("ok", t("✓ เช็กอินแล้ว", "✓ You're checked in"), null, <LinkButton href={`/events/${event.id}/live`}>{t("หน้าในงาน", "Live page")}</LinkButton>);
    }
    return part(
      "ok",
      t("✓ คุณได้ที่แล้ว", "✓ You're going"),
      started ? t("กิจกรรมเริ่มแล้ว", "Happening now") : null,
      <LinkButton href={`/me/events/${event.id}/pass`}>{t("🎟️ บัตรของฉัน", "🎟️ My pass")}</LinkButton>,
    );
  }
  if (status === "offered" && !started) {
    return part(
      "accent",
      t("มีที่ว่างรอคุณ", "A spot opened for you"),
      reg!.offeredUntil ? t(`ยืนยันภายใน ${fmtDate(reg!.offeredUntil, lang)}`, `Confirm by ${fmtDate(reg!.offeredUntil, lang)}`) : null,
      <button type="submit" form="offer" name="action" value="accept" class="btn primary">
        {t("รับที่นั่ง", "Accept the spot")}
      </button>,
    );
  }
  if (status === "requested" && !started) {
    return part("warn", t("ขอที่นั่งแล้ว", "Requested"), t("รอผู้จัดตอบ", "Waiting for the organiser"), null);
  }
  if (status === "waitlisted" && !started) {
    return part(
      "warn",
      t("อยู่ในคิวสำรอง", "On the waitlist"),
      props.waitPos ? t(`ราวคิวที่ ${props.waitPos} มีที่ว่างเราจะแจ้ง`, `About #${props.waitPos} in line. We'll tell you if a spot opens.`) : null,
      null,
    );
  }
  if (started) return null;
  if (props.standing.blockedUntil) {
    return part("muted", t("ยังลงทะเบียนไม่ได้", "You can't RSVP yet"), t(`ได้อีกครั้งหลัง ${fmtDate(props.standing.blockedUntil, lang)}`, `Again after ${fmtDate(props.standing.blockedUntil, lang)}`), null);
  }
  // With choices to make first (+1, buddy, a free seat) the button takes you to them; otherwise it RSVPs at once.
  const choices = event.plusOneAllowed || event.buddyEnabled || (event.freeSeats > 0 && event.costThb > 0) || !!event.groupJoinCode || needsDisclaimer(event);
  const label = left > 0 ? bookLabel(event, t) : t("ต่อคิวสำรอง", "Join the waitlist");
  return part(
    left > 0 ? "open" : "full",
    left > 0 ? t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`) : t("เต็มแล้ว", "Full"),
    null,
    choices ? (
      <a href="#rsvp" class="btn primary">
        {label}
      </a>
    ) : (
      <button type="submit" form="rsvp" class="btn primary">
        {label}
      </button>
    ),
    true,
  );
}

/**
 * The status strip under the title (owner card, 2026-10-17): where I stand and
 * the ONE next action. On phones (owner card 2, 2026-10-26) the RSVP itself
 * lives in the bottom bar instead, so the strip's RSVP shows on tablets only
 * (ev-tab) and phones never see two RSVP buttons.
 */
export function StatusStrip(props: StripProps & { class?: string }) {
  const p = stripParts(props);
  if (!p) return null;
  const phoneBook = p.book && props.class === "ev-phone";
  return (
    <div class={["ev-strip", `is-${p.tone}`, props.class, phoneBook ? "ev-tab" : null].filter(Boolean).join(" ")}>
      <p class="ev-strip-text">
        <b>{p.text}</b>
        {p.sub ? <small>{p.sub}</small> : null}
      </p>
      {p.action}
    </div>
  );
}

/** The booking button's words: a request (D57), a go-together group at an open event (D56), or an RSVP. */
function bookLabel(e: Event, t: T): string {
  if (e.approvalRequired) return t("ขอที่นั่ง", "Request a place");
  if (e.openEntry) return t("เข้ากลุ่มไปด้วยกัน", "Join a group");
  return t("ลงทะเบียนเข้าร่วม", "RSVP");
}

/**
 * Phones (owner card 2, 2026-10-26): one bar above the tab bar with the price,
 * the spots left and the next action, from the same logic as the status strip.
 * It shows without JS; the script only hides it while the keyboard is open,
 * a text field has focus, or My registration or the status strip is on screen,
 * so two RSVP buttons are never visible together.
 */
function RsvpBar(props: StripProps) {
  const { event } = props;
  const { t } = props.v;
  const p = stripParts(props);
  if (!p) return null;
  // Going together: the ticket is bought at the source, so "Free" would mislead; only a table cost shows.
  const price = isGoTogether(event) && event.costThb === 0 ? null : costText(event, t);
  return (
    <div class={`sticky-cta rsvp-bar is-${p.tone}`} id="sticky-rsvp">
      <p class="sticky-cta-note">
        {p.book && price ? (
          <>
            <b>{price}</b>
            <span aria-hidden="true"> · </span>
            <span>{p.text}</span>
          </>
        ) : (
          <>
            <b>{p.text}</b>
            {p.sub ? <small>{p.sub}</small> : null}
          </>
        )}
      </p>
      {p.action}
      <script dangerouslySetInnerHTML={{ __html: RSVP_BAR_JS }} />
    </div>
  );
}

/**
 * Hides the RSVP bar while typing (keyboard up or a text field focused) or while My registration or the strip is in view.
 * "In view" means above the tab bar and the bar itself (the bottom 180px) and below the top bar (72px), so an edge peeking behind either doesn't count.
 */
const RSVP_BAR_JS = `(function(){var b=document.getElementById("sticky-rsvp");if(!b)return;
var seen=new Map(),typing=false,TXT='input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]):not([type=submit]):not([type=button]),textarea,[contenteditable="true"]';
var vv=window.visualViewport;function kb(){return !!vv&&vv.height<window.innerHeight*0.75}
function sync(){var on=typing||kb();seen.forEach(function(x){if(x)on=true});b.classList.toggle("is-off",on);if(on)b.setAttribute("inert","");else b.removeAttribute("inert")}
if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){seen.set(e.target,e.isIntersecting)});sync()},{rootMargin:"-72px 0px -180px 0px"});document.querySelectorAll(".ev-reg,.ev-strip").forEach(function(s){io.observe(s)})}
document.addEventListener("focusin",function(e){typing=!!(e.target&&e.target.matches&&e.target.matches(TXT));sync()});
document.addEventListener("focusout",function(){typing=false;setTimeout(sync,50)});
if(vv)vv.addEventListener("resize",sync);
var a=b.querySelector('a[href="#rsvp"]'),f=document.getElementById("rsvp");if(a&&f)a.addEventListener("click",function(){setTimeout(function(){var c=f.querySelector("input:not([type=hidden]),button");if(c)c.focus({preventScroll:true})},350)})})()`;

/** A confirmed attendee of a +1 event, without a +1 yet, before the start. */
export function canInvite(event: Event, reg: Registration | null, now = new Date()): boolean {
  return (
    event.status === "published" &&
    event.plusOneAllowed &&
    event.startsAt.getTime() > now.getTime() &&
    reg?.status === "confirmed" &&
    !reg.plusOneWith
  );
}

/** Copy / LINE / native share for the invite link. Progressive: the link works without it. */
const SHARE_JS = `(function(){
var box=document.getElementById("invite");if(!box)return;
var url=box.getAttribute("data-url"),text=box.getAttribute("data-text");
var copy=box.querySelector("[data-copy]"),share=box.querySelector("[data-share]");
if(copy&&navigator.clipboard){copy.hidden=false;copy.addEventListener("click",function(){navigator.clipboard.writeText(url).then(function(){copy.textContent=copy.getAttribute("data-done");});});}
if(share&&navigator.share){share.hidden=false;share.addEventListener("click",function(){navigator.share({title:document.title,text:text,url:url}).catch(function(){});});}
})();`;

function InviteBox(props: { event: Event; url: string | null; v: View }) {
  const { t, lang } = props.v;
  const base = `/events/${props.event.id}`;
  if (!props.url) {
    return (
      <form method="post" action={`${base}/invite`} id="invite">
        <h3>{t("ชวนเพื่อนมาด้วย (+1)", "Invite a friend (+1)")}</h3>
        <p class="muted">{t("ลิงก์สมัครเป็น +1 ของคุณ ใช้ได้ครั้งเดียว", "A one-time sign-up link for your +1.")}</p>
        <Button kind="ghost">{t("ชวนเพื่อน", "Invite a friend")}</Button>
      </form>
    );
  }
  const text = t(`มากิจกรรม "${title(props.event, "th")}" ด้วยกันไหม? ลงทะเบียนเป็น +1 ของฉันได้ที่ลิงก์นี้`, `Come to "${title(props.event, "en")}" with me? Sign up as my +1 here:`);
  const line = `https://line.me/R/msg/text/?${encodeURIComponent(`${text} ${props.url}`)}`;
  return (
    <div id="invite" class="invite-box" data-url={props.url} data-text={text} lang={lang}>
      <h3>{t("ชวนเพื่อนมาด้วย (+1)", "Invite a friend (+1)")}</h3>
      <p class="muted">{t("ส่งให้เพื่อน 1 คน ใช้ได้ครั้งเดียว", "Send to one friend. It works once.")}</p>
      <div class="field">
        <label for="invite-url">{t("ลิงก์ชวนเพื่อน", "Invite link")}</label>
        <input id="invite-url" type="url" readonly value={props.url} onfocus="this.select()" />
      </div>
      <div class="row">
        <button type="button" class="btn ghost" data-copy data-done={t("คัดลอกแล้ว", "Copied")} hidden>
          {t("คัดลอกลิงก์", "Copy link")}
        </button>
        <a class="btn ghost" href={line} target="_blank" rel="noopener noreferrer">
          {t("แชร์ทาง LINE", "Share on LINE")}
        </a>
        <button type="button" class="btn ghost" data-share hidden>
          {t("แชร์", "Share")}
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SHARE_JS }} />
    </div>
  );
}

function RegistrationBox(props: {
  event: Event;
  reg: Registration | null;
  v: View;
  waitPos: number | null;
  started: boolean;
  ended: boolean;
  standing: StrikeStanding;
}) {
  const { event, reg, v, started, ended } = props;
  const { t, lang } = v;
  const base = `/events/${event.id}`;
  const status = reg?.status;

  // Paused by the team: the place is kept, but no pass or check-in until it's back on.
  // Giving the place up is still the member's call, and never a strike.
  if (event.status === "paused") {
    const holding = status === "confirmed" || status === "offered" || status === "waitlisted" || status === "requested";
    return holding && !started ? (
      <>
        <p>
          <Tag tone="warn">{t("พักไว้ชั่วคราว", "Paused")}</Tag> {status === "confirmed" ? t("ที่นั่งของคุณยังอยู่", "Your place is kept.") : statusLabel(status!, t)}
        </p>
        <form method="post" action={`${base}/cancel`}>
          <Button kind="ghost">{status === "requested" ? t("ถอนคำขอ", "Withdraw the request") : t("สละที่นั่ง", "Give up my place")}</Button>
        </form>
      </>
    ) : (
      <p class="muted">{t("ปิดรับลงทะเบียน", "Registration is closed.")}</p>
    );
  }

  if (status === "confirmed") {
    return (
      <>
        <p>
          <Tag tone="ok">{statusLabel("confirmed", t)}</Tag>{" "}
          {reg!.plusOneWith ? t("มากับเพื่อน", "Bringing a friend") : t("มาคนเดียว", "Coming alone")}
        </p>
        {reg!.checkedInAt && !ended ? (
          <LinkButton href={`${base}/live`}>{t("เข้าหน้าในงาน", "Open the live page")}</LinkButton>
        ) : null}
        {!started ? (
          <>
            <div class="row reg-pass">
              <LinkButton href={`/me/events/${event.id}/pass`}>{t("🎟️ บัตรเข้างานของฉัน", "🎟️ My event pass")}</LinkButton>
            </div>
            <form method="post" action={`${base}/cancel`}>
              <p class="muted">
                {isLateCancel(event.startsAt)
                  ? t("เหลือไม่ถึง 24 ชม. ถ้ายกเลิกตอนนี้จะนับเป็นใบเตือน 1 ใบ", "Less than 24h to go, so cancelling now counts as 1 strike.")
                  : t("ยกเลิกได้ฟรีจนถึง 24 ชม. ก่อนเริ่มงาน", "Free to cancel until 24h before the start.")}
              </p>
              <Button kind="danger">{t("ยกเลิกการเข้าร่วม", "Cancel my spot")}</Button>
            </form>
          </>
        ) : null}
        {ended && reg!.checkedInAt ? (
          <LinkButton href={`${base}/feedback`} kind="ghost">{t("ให้ความคิดเห็น", "Give feedback")}</LinkButton>
        ) : null}
      </>
    );
  }

  if (status === "requested") {
    return (
      <>
        <p>
          <Tag tone="warn">{t("ขอที่นั่งแล้ว", "Requested")}</Tag> {t("รอผู้จัดตอบ เราจะแจ้งในการแจ้งเตือน", "Waiting for the organiser. We'll tell you in your notifications.")}
        </p>
        <form method="post" action={`${base}/cancel`}>
          <Button kind="ghost">{t("ถอนคำขอ", "Withdraw the request")}</Button>
        </form>
      </>
    );
  }

  if (status === "waitlisted") {
    return (
      <>
        <p>
          <Tag tone="warn">{statusLabel("waitlisted", t)}</Tag>{" "}
          {props.waitPos ? t(`ราวคิวที่ ${props.waitPos}`, `About #${props.waitPos} in line`) : null}
        </p>
        <p class="muted">{t("มีที่ว่างเราจะแจ้ง แล้วยืนยันภายใน 12 ชม.", "We'll tell you if a spot opens. 12h to confirm.")}</p>
        <form method="post" action={`${base}/cancel`}>
          <Button kind="ghost">{t("ออกจากคิวสำรอง", "Leave the waitlist")}</Button>
        </form>
      </>
    );
  }

  if (status === "offered") {
    return (
      <>
        <p>
          <Tag tone="accent">{statusLabel("offered", t)}</Tag>{" "}
          {reg!.offeredUntil ? t(`ยืนยันภายใน ${fmtDate(reg!.offeredUntil, lang)}`, `Confirm by ${fmtDate(reg!.offeredUntil, lang)}`) : null}
        </p>
        <form method="post" action={`${base}/offer`} class="row" id="offer">
          <Button name="action" value="accept">{t("รับที่นั่ง", "Accept the spot")}</Button>
          <Button name="action" value="decline" kind="ghost">{t("ไม่รับ", "Decline")}</Button>
        </form>
      </>
    );
  }

  if (event.status !== "published" || started) {
    return <p class="muted">{started ? t("กิจกรรมเริ่มแล้ว ปิดรับลงทะเบียน", "This event has started, so registration is closed.") : t("ปิดรับลงทะเบียน", "Registration is closed.")}</p>;
  }

  return (
    <>
      {status === "cancelled" || status === "late_cancelled" ? <p class="muted">{t("คุณยกเลิกไปแล้ว ลงทะเบียนใหม่ได้ถ้ายังมีที่", "You cancelled. You can sign up again if there's room.")}</p> : null}
      {props.standing.blockedUntil ? (
        <Notice kind="warn">
          {t(`คุณมีใบเตือน ${props.standing.active} ใบ จึงลงทะเบียนได้อีกครั้งหลัง ${fmtDate(props.standing.blockedUntil, lang)}`, `You have ${props.standing.active} strikes, so you can RSVP again after ${fmtDate(props.standing.blockedUntil, lang)}`)}
        </Notice>
      ) : null}
      <form method="post" action={`${base}/rsvp`} id="rsvp">
        {event.freeSeats > 0 && event.costThb > 0 ? (
          <Toggle
            name="freeSeat"
            label={t("ขอใช้ที่นั่งส่งต่อน้ำใจ (ฟรี)", "Use a pay-it-forward seat (free)")}
            hint={t("ไม่ต้องให้เหตุผล และไม่มีใครรู้ ใช้ได้เดือนละ 1 ครั้ง", "No questions asked, nobody else knows. Once a month.")}
          />
        ) : null}
        {event.buddyEnabled ? (
          <Toggle name="wantsBuddy" label={t("หาบัดดี้ให้ฉันในงานนี้", "Find me a buddy for this event")} hint={t("จับคู่ให้ 48 ชม. ก่อนงาน เห็นกันแค่ชื่อเล่น และไม่ใช่การจับคู่เดต", "Paired 48h before. Nicknames only, never a date.")} />
        ) : null}
        {event.plusOneAllowed ? (
          <Field
            label={t("มากับเพื่อน? ใส่ชื่อผู้ใช้ของเพื่อน (ไม่บังคับ)", "Bringing a friend? Their username (optional)")}
            name="plusOneUsername"
            maxlength={30}
            hint={t("เพื่อนลงทะเบียนเองและใส่ชื่อผู้ใช้ของคุณ", "They RSVP too, with your username.")}
          />
        ) : null}
        <BookingChecks e={event} t={t} />
        <button type="submit" class="btn primary btn-ticket">
          <span>{bookLabel(event, t)}</span>
        </button>
      </form>
    </>
  );
}

eventRoutes.get("/events/:id", requireMember, async (c) => {
  const id = c.req.param("id");
  const first = await visibleEvent(c, id);
  if (!first) return notFound(c);
  // Lazy timers: expire stale offers, fill free seats, run the buddy round.
  await refreshWaitlist(c.env, id);
  await runBuddyRound(c.env, first);
  const event = (await visibleEvent(c, id)) ?? first;
  return renderDetail(c, event);
});

