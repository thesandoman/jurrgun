/**
 * Staff events, shared part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { type Context } from "hono";
import { and, asc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../../db";
import { DISTRICTS, label } from "../../../lib/constants";
import type { AppEnv } from "../../../lib/env";
import { fmtDate } from "../../../lib/i18n";
import { keysetAll } from "../../../lib/bulk";
import { events, profiles, registrations, type Account, type Event } from "../../../schema";
import { announceOpen, eventAnnouncements } from "../../../services/announcements";
import { canAnnounce } from "../../../domain/announcements";
import { AnnounceForm, AnnouncementList } from "../../../ui/announcements";
import { countPolicy, isRomanceEvent, rosterAccess, shownCount, type RosterAccess } from "../../../domain/roster";
import { frozenCounts } from "../../../services/roster";
import { Button, LinkButton, Notice, page, Stat, Tag, TextArea, Toggle, view, type View } from "../../../ui/kit";


export type Ctx = Context<AppEnv>;
export type Db = ReturnType<typeof getDb>;

export const BASE = "/admin/events";
/** Registrations that hear about changes to an event. */
export const REACHABLE = ["confirmed", "offered", "waitlisted"];
/** Attendee table rows per page, and waitlist entries shown, on the event page. */
export const ATTENDEE_PAGE = 200;
export const WAITLIST_SHOWN = 200;

/**
 * Everyone who hears about changes to an event (confirmed, offered,
 * waitlisted), however many: read in keyset pages, no cap.
 */
export function reachableRegistrations(db: Db, eventId: string) {
  return keysetAll(registrations.id, (after, n) =>
    db
      .select({ id: registrations.id, accountId: registrations.accountId })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), inArray(registrations.status, REACHABLE), after))
      .orderBy(asc(registrations.id))
      .limit(n),
  );
}

/** Checked-in confirmed registrations (the seating pool), however many. */
export function checkedInRegistrations(db: Db, eventId: string) {
  return keysetAll(registrations.id, (after, n) =>
    db
      .select({ id: registrations.id, accountId: registrations.accountId, plusOneWith: registrations.plusOneWith, groupNo: registrations.groupNo })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "confirmed"), isNotNull(registrations.checkedInAt), after))
      .orderBy(asc(registrations.id))
      .limit(n),
  );
}
/** Staff and partner organisers set any size up to this; large events have no fixed cap (owner, D19). */
export const ORGANISER_MAX_CAPACITY = 100_000;

// ------------------------------------------------------------- access --

function canSee(a: Account, e: Event): boolean {
  if (a.role === "bma_admin") return true;
  if (e.hostAccountId === a.id) return true;
  return a.role === "partner_admin" && !!a.partnerOrgId && e.partnerOrgId === a.partnerOrgId;
}

export function canEdit(a: Account, e: Event): boolean {
  if (a.role === "bma_admin") return true;
  return a.role === "partner_admin" && !!a.partnerOrgId && e.partnerOrgId === a.partnerOrgId;
}

export function canCreate(a: Account): boolean {
  return a.role === "bma_admin" || (a.role === "partner_admin" && !!a.partnerOrgId);
}

/** List filter matching `canSee`. */
export function scopeWhere(a: Account): SQL | undefined {
  if (a.role === "bma_admin") return undefined;
  if (a.role === "partner_admin" && a.partnerOrgId) {
    return or(eq(events.partnerOrgId, a.partnerOrgId), eq(events.hostAccountId, a.id));
  }
  return eq(events.hostAccountId, a.id);
}

// ------------------------------------------------------- roster views --

type T = (th: string, en: string) => string;

/** A seat code as the 💘 host reads it. */
export function seatLabel(t: T, code: string | undefined): string {
  return code ? t(`ที่นั่ง ${code}`, `Seat ${code}`) : "-";
}

/**
 * The event page for someone who sees counts only (src/domain/roster.ts):
 * the partner's other admins, and staff on partner and 💘 events. No names,
 * no seat codes and no roster actions. 💘 events show counts frozen at 00:00
 * and rounded to 5.
 */
export async function countsOnlyPage(c: Ctx, e: Event, db: Db, access: RosterAccess, now: Date) {
  const v = view(c);
  const { t, lang } = v;
  const a = me(c);
  const policy = countPolicy(access, e);
  const romance = isRomanceEvent(e);
  let booked: number;
  let checkedIn: number;
  if (policy === "frozen5") {
    const f = (await frozenCounts(db, [e.id], now)).get(e.id);
    booked = f?.booked ?? 0;
    checkedIn = f?.checkedIn ?? 0;
  } else {
    const [row] = await db
      .select({
        booked: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')`.mapWith(Number),
        checkedIn: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed' and ${registrations.checkedInAt} is not null)`.mapWith(Number),
      })
      .from(registrations)
      .where(eq(registrations.eventId, e.id))
      .limit(1);
    booked = row?.booked ?? 0;
    checkedIn = row?.checkedIn ?? 0;
  }
  const shown = (n: number) => shownCount(policy, n) ?? t("ไม่ถึง 10", "under 10");
  const editable = canEdit(a, e);
  const title = lang === "en" && e.titleEn ? e.titleEn : e.title;
  const [hostRow, anns] = await Promise.all([
    e.hostAccountId ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, e.hostAccountId)).limit(1) : Promise.resolve([] as { nickname: string }[]),
    eventAnnouncements(db, e.id),
  ]);
  const announcer = canAnnounce(e, a);
  return page(c, { title, admin: true }, (
    <>
      <p>
        <a href={BASE}>{t("← กิจกรรมทั้งหมด", "← All events")}</a>
      </p>
      <div class="spread">
        <h1>{title}</h1>
        <StatusTag v={v} status={e.status} />
      </div>
      <div class="meta">
        <span>🗓 {fmtDate(e.startsAt, lang)} {t("ถึง", "to")} {fmtDate(e.endsAt, lang)}</span>
        <span>📍 {e.venueName} · {label(DISTRICTS, e.district, lang)}</span>
        <span>👤 {t("โฮสต์", "Host")}: {hostRow[0]?.nickname ?? t("ยังไม่กำหนด", "not assigned")}</span>
      </div>
      <div class="row" style="margin:10px 0">
        {editable ? (
          <LinkButton href={`${BASE}/${e.id}/edit`} kind="ghost">
            {t("แก้ไขรายละเอียด", "Edit details")}
          </LinkButton>
        ) : null}
        {editable && e.status === "draft" ? (
          <form method="post" action={`${BASE}/${e.id}/publish`}>
            <Button kind="ghost">{t("เผยแพร่", "Publish")}</Button>
          </form>
        ) : null}
        {editable && e.status !== "cancelled" ? (
          <form method="post" action={`${BASE}/${e.id}/cancel`} data-confirm={t("ยกเลิกกิจกรรมนี้และแจ้งผู้ลงทะเบียนทุกคน?", "Cancel this event and notify every registrant?")}>
            <Button kind="danger">{t("ยกเลิกกิจกรรม", "Cancel event")}</Button>
          </form>
        ) : null}
      </div>
      <div class="stats">
        <Stat label={t("จองแล้ว", "Booked")} value={shown(booked)} hint={policy === "frozen5" ? t("ปัดเป็นหลัก 5 นับถึง 00:00 น. วันนี้", "rounded to 5, counted up to 00:00 today") : undefined} />
        <Stat label={t("ที่นั่ง", "Capacity")} value={e.capacity} />
        <Stat label={t("เช็กอินแล้ว", "Checked in")} value={shown(checkedIn)} />
      </div>
      <Notice kind="info">
        {romance
          ? t(
              "นี่คือกิจกรรม 💘 จึงเห็นได้แค่จำนวน ไม่เห็นว่าใครจอง เพื่อไม่ให้ใครรู้ว่าใครเปิดรับเรื่องเดต โฮสต์ที่ระบุชื่อไว้ดูแลคนที่มาด้วยรหัสที่นั่ง",
              "This is a 💘 event, so you see counts only, never who booked: nobody learns who is open to dating. The named host looks after people by seat code.",
            )
          : t(
              "เห็นได้แค่จำนวน ไม่เห็นว่าใครจอง เฉพาะโฮสต์ที่ระบุชื่อไว้เท่านั้นที่เห็นรายชื่อ เพราะเป็นคนเช็กอินและจัดโต๊ะ",
              "You see counts only, never who booked. Only the named host sees names, because they run check-in and the tables.",
            )}
      </Notice>
      {announcer && announceOpen(e, now) ? (
        <section class="ann-compose" aria-labelledby="announce">
          <h2 id="announce">{t("ประกาศถึงคนที่มา", "Announce to people going")}</h2>
          <AnnounceForm t={t} e={e} action={`${BASE}/${e.id}/announce`} back={`${BASE}/${e.id}`} />
        </section>
      ) : null}
      <AnnouncementList t={t} lang={lang} items={anns} />
    </>
  ));
}

/**
 * The 💘 host's private way to raise a safety concern about a seat: it files a
 * report on that person without the host ever learning their name. The words
 * go to moderators only.
 */
export function SeatConcernForm(props: { t: T; action: string; registrationId: string }) {
  const { t } = props;
  return (
    <details>
      <summary>{t("แจ้งข้อกังวล", "Raise a concern")}</summary>
      <form method="post" action={props.action}>
        <input type="hidden" name="registrationId" value={props.registrationId} />
        <TextArea label={t("เกิดอะไรขึ้น (ทีมดูแลเท่านั้นที่เห็น)", "What happened (only moderators see this)")} name="details" maxlength={1000} rows={3} required />
        <Toggle name="urgent" label={t("ด่วน มีคนไม่ปลอดภัยตอนนี้", "Urgent: someone is unsafe right now")} />
        <Button kind="ghost">{t("ส่งถึงทีมดูแล", "Send to moderators")}</Button>
      </form>
    </details>
  );
}

export function me(c: Ctx): Account {
  return c.var.user!.account;
}

export function notFound(c: Ctx) {
  const { t } = view(c);
  return page(c, { title: t("ไม่พบกิจกรรม", "Event not found"), admin: true, status: 404 }, (
    <>
      <h1>{t("ไม่พบกิจกรรม", "Event not found")}</h1>
      <p>
        <a href={BASE}>{t("← กลับไปหน้ากิจกรรม", "← Back to events")}</a>
      </p>
    </>
  ));
}

export function forbidden(c: Ctx) {
  const { t } = view(c);
  return page(c, { title: t("ไม่มีสิทธิ์", "Not allowed"), admin: true, status: 403 }, (
    <>
      <h1>{t("ไม่มีสิทธิ์", "Not allowed")}</h1>
      <p>{t("บทบาทของคุณทำสิ่งนี้ไม่ได้", "Your role can't do this.")}</p>
      <p>
        <a href={BASE}>{t("← กลับไปหน้ากิจกรรม", "← Back to events")}</a>
      </p>
    </>
  ));
}

/** An action was refused: 400/403/409 page with the reason and a way back. */
export function refuse(c: Ctx, e: Event, msg: string, status: 400 | 403 | 404 | 409 = 400) {
  const { t } = view(c);
  return page(c, { title: t("ทำรายการไม่ได้", "Couldn't do that"), admin: true, status }, (
    <>
      <Notice kind="error">{msg}</Notice>
      <p>
        <a href={`${BASE}/${e.id}`}>{t("← กลับไปหน้าจัดการกิจกรรม", "← Back to the event")}</a>
      </p>
    </>
  ));
}

type Handler = (c: Ctx, e: Event, db: Db) => Promise<Response> | Response;

/**
 * Load the event in the URL and check the caller may see (or edit) it.
 * `roster`: the action works with the people (check-in, tables, +1s, requests,
 * no-shows), so a counts-only viewer can't use it (src/domain/roster.ts).
 */
export function withEvent(fn: Handler, opts: { edit?: boolean; roster?: boolean } = {}) {
  return async (c: Ctx) => {
    const id = c.req.param("id") ?? "";
    const db = getDb(c.env);
    const [e] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    const a = me(c);
    if (!e || !canSee(a, e)) return notFound(c);
    if (opts.edit && !canEdit(a, e)) return forbidden(c);
    if (opts.roster && rosterAccess(a, e) === "counts") return forbidden(c);
    return fn(c, e, db);
  };
}

export function wantsJson(c: Ctx): boolean {
  return (c.req.header("accept") ?? "").includes("application/json");
}

// --------------------------------------------------------- Bangkok time --

const BKK_OFFSET = 7 * 3_600_000;

/** A Date as the value of a datetime-local input, in Bangkok time (UTC+7). */
export function toBkkInput(d: Date): string {
  return new Date(d.getTime() + BKK_OFFSET).toISOString().slice(0, 16);
}

/** A datetime-local value typed in Bangkok time → the instant. Null if invalid. */
export function fromBkkInput(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+07:00`);
  if (Number.isNaN(d.getTime()) || toBkkInput(d) !== s) return null;
  return d;
}


export function StatusTag(props: { v: View; status: string }) {
  const { t } = props.v;
  if (props.status === "published") return <Tag tone="ok">{t("เผยแพร่", "Published")}</Tag>;
  if (props.status === "cancelled") return <Tag tone="warn">{t("ยกเลิก", "Cancelled")}</Tag>;
  if (props.status === "pending") return <Tag tone="warn">{t("รอตรวจ", "Waiting for review")}</Tag>;
  if (props.status === "paused") return <Tag tone="warn">{t("พักไว้", "Paused")}</Tag>;
  if (props.status === "rejected") return <Tag tone="warn">{t("ส่งกลับ", "Sent back")}</Tag>;
  return <Tag tone="muted">{t("ร่าง", "Draft")}</Tag>;
}
