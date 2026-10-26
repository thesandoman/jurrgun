/**
 * Staff event management (/admin/events) — PRD §7.1, §8, §9, §10.5, §13.0,
 * §13.1, §20, §24.
 *
 * Roles: host, partner_admin, bma_admin (bma_admin passes every check).
 *   bma_admin      sees and edits every event
 *   partner_admin  sees and edits events of their own partner org (and events
 *                  they host); creates events only for their own org
 *   host           sees and OPERATES only events they host (check-in, groups,
 *                  prompts, notices, no-shows, buddy round); never edits details
 *
 * Every handler that touches one event goes through `withEvent`, which loads
 * the event and answers 404 when the caller may not see it.
 *
 * Privacy (§13.0): staff pages never show relationship status, romance data,
 * gender identity, age preferences or connection choices. Usernames are shown
 * to bma_admin only.
 */
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { suggestGroups } from "../../domain/matching";
import { canBeWomenOnly, checkInOpen, OPEN_TO_MORE_TAG, partnerEventTags, seatAvailable, strikeExpiry, WOMEN_ONLY_TAG } from "../../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, VISITBANGKOK_ROUTES, label, values, districtsAZ } from "../../lib/constants";
import { newId, randomToken } from "../../lib/crypto";
import type { AppEnv } from "../../lib/env";
import { fmtDate } from "../../lib/i18n";
import { batchAll, chunks, KEYSET_CHUNK, keysetAll } from "../../lib/bulk";
import { audit, notify, notifyMany } from "../../lib/records";
import { requireRole } from "../../lib/session";
import {
  accounts,
  blocks,
  buddyPairs,
  events,
  partnerOrgs,
  profiles,
  registrations,
  strikes,
  type Account,
  type Event,
  talkQuestions,
} from "../../schema";
import { loadAttendees, refreshWaitlist, runBuddyRound, seatState } from "../../services/events";
import { blockedAmong } from "../../services/regular-tables";
import { announceOpen, cancelWrites, eventAnnouncements, postAnnouncement, type AnnounceInput } from "../../services/announcements";
import { ANNOUNCE_MAX, ANNOUNCE_PER_DAY, canAnnounce, cleanBody, isAnnouncementKind } from "../../domain/announcements";
import { fromBangkok } from "../../domain/hosting";
import { AnnounceForm, AnnouncementList } from "../../ui/announcements";
import { checkVenueExtras } from "../../domain/hosting";
import { STATIONS } from "../../content/stations";
import { VenueFields, DayStatusForm, EtaSummary } from "../../ui/day-of";
import { DAY_OF_LEAD_HOURS, cleanNote, dayOfOpen, dayOfOpensAt, isDayStatus, shownDayStatus, shownEta, DAY_STATUS_TEXT } from "../../domain/day-of";
import { deleteObject, getObject, getObjectUrl, putObject } from "../../storage";
import { checkEventRules, effectiveAgeMin } from "../../domain/event-rules";
import { emptyEntryRules, EntryRuleFields, entryRulesFromBody, entryRulesFromEvent, type EntryRuleDraft } from "../../ui/entry-rules";
import {
  Button,
  Card,
  Choices,
  Empty,
  Field,
  LinkButton,
  list,
  Notice,
  page,
  Select,
  Stat,
  str,
  Tag,
  TextArea,
  Toggle,
  view,
  type View,
  TableFilter,
  pageOf,
  Pager,
} from "../../ui/kit";

export const adminEvents = new Hono<AppEnv>();
// Moderators host events too: they see and operate only the events they host (scopeWhere / canSee).
adminEvents.use("*", requireRole("host", "partner_admin", "circle_head"));

type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

const BASE = "/admin/events";
/** Registrations that hear about changes to an event. */
const REACHABLE = ["confirmed", "offered", "waitlisted"];
/** Attendee table rows per page, and waitlist entries shown, on the event page. */
const ATTENDEE_PAGE = 200;
const WAITLIST_SHOWN = 200;

/**
 * Everyone who hears about changes to an event (confirmed, offered,
 * waitlisted), however many: read in keyset pages, no cap.
 */
function reachableRegistrations(db: Db, eventId: string) {
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
function checkedInRegistrations(db: Db, eventId: string) {
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

function canEdit(a: Account, e: Event): boolean {
  if (a.role === "bma_admin") return true;
  return a.role === "partner_admin" && !!a.partnerOrgId && e.partnerOrgId === a.partnerOrgId;
}

function canCreate(a: Account): boolean {
  return a.role === "bma_admin" || (a.role === "partner_admin" && !!a.partnerOrgId);
}

/** List filter matching `canSee`. */
function scopeWhere(a: Account): SQL | undefined {
  if (a.role === "bma_admin") return undefined;
  if (a.role === "partner_admin" && a.partnerOrgId) {
    return or(eq(events.partnerOrgId, a.partnerOrgId), eq(events.hostAccountId, a.id));
  }
  return eq(events.hostAccountId, a.id);
}

function me(c: Ctx): Account {
  return c.var.user!.account;
}

function notFound(c: Ctx) {
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

function forbidden(c: Ctx) {
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
function refuse(c: Ctx, e: Event, msg: string, status: 400 | 403 | 404 | 409 = 400) {
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

/** Load the event in the URL and check the caller may see (or edit) it. */
function withEvent(fn: Handler, opts: { edit?: boolean } = {}) {
  return async (c: Ctx) => {
    const id = c.req.param("id") ?? "";
    const db = getDb(c.env);
    const [e] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    const a = me(c);
    if (!e || !canSee(a, e)) return notFound(c);
    if (opts.edit && !canEdit(a, e)) return forbidden(c);
    return fn(c, e, db);
  };
}

function wantsJson(c: Ctx): boolean {
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

// ---------------------------------------------------------------- list --

type ListView = "upcoming" | "drafts" | "past";

adminEvents.get("/", async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const a = me(c);
  const db = getDb(c.env);
  const raw = c.req.query("view");
  const which: ListView = raw === "drafts" || raw === "past" ? raw : "upcoming";
  const now = new Date();

  const byView: Record<ListView, SQL | undefined> = {
    upcoming: and(ne(events.status, "draft"), gte(events.endsAt, now)),
    drafts: eq(events.status, "draft"),
    past: and(ne(events.status, "draft"), lt(events.endsAt, now)),
  };
  const rows = await db
    .select()
    .from(events)
    .where(and(byView[which], scopeWhere(a)))
    .orderBy(which === "past" ? desc(events.startsAt) : asc(events.startsAt))
    .limit(100);

  // One grouped query for every event's counts (no N+1).
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({
          eventId: registrations.eventId,
          status: registrations.status,
          n: sql<number>`count(*)`,
          checkedIn: sql<number>`count(${registrations.checkedInAt})`,
        })
        .from(registrations)
        .where(inArray(registrations.eventId, ids))
        .groupBy(registrations.eventId, registrations.status)
        .limit(1000)
    : [];
  const countOf = (id: string, status: string) =>
    counts.filter((x) => x.eventId === id && x.status === status).reduce((s, x) => s + Number(x.n), 0);
  const checkedOf = (id: string) =>
    counts.filter((x) => x.eventId === id && x.status === "confirmed").reduce((s, x) => s + Number(x.checkedIn), 0);

  const tabs: [ListView, string][] = [
    ["upcoming", t("กำลังจะมาถึง", "Upcoming")],
    ["drafts", t("ฉบับร่าง", "Drafts")],
    ["past", t("ที่ผ่านมา", "Past")],
  ];

  return page(c, { title: t("กิจกรรม", "Events"), admin: true }, (
    <>
      <div class="spread">
        <h1>{t("กิจกรรม", "Events")}</h1>
        {canCreate(a) ? <LinkButton href={`${BASE}/new`}>{t("+ สร้างกิจกรรม", "+ New event")}</LinkButton> : null}
      </div>
      <nav class="row" aria-label={t("มุมมอง", "View")}>
        {tabs.map(([key, text]) => (
          <a href={`${BASE}?view=${key}`} class="chip" aria-current={which === key ? "page" : undefined} style={which === key ? "font-weight:700" : undefined}>
            {text}
          </a>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมในมุมมองนี้", "No events in this view yet")}</Empty>
      ) : (
        <>
        <TableFilter t={t} target="admin-events" label={t("ค้นหาในรายการนี้ (ชื่อ เขต สถานะ)", "Search this list (name, district, status)")} />
        <div class="table-wrap scroll">
          <table id="admin-events">
            <caption class="sr-only">{t("รายการกิจกรรม", "Events")}</caption>
            <thead>
              <tr>
                <th>{t("กิจกรรม", "Event")}</th>
                <th>{t("วันเวลา", "When")}</th>
                <th>{t("เขต", "District")}</th>
                <th>{t("ยืนยัน / ที่นั่ง", "Confirmed / capacity")}</th>
                <th>{t("คิวสำรอง", "Waitlist")}</th>
                <th>{t("เช็กอิน", "Checked in")}</th>
                <th>{t("สถานะ", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr>
                  <td>
                    <a href={`${BASE}/${e.id}`}>{lang === "en" && e.titleEn ? e.titleEn : e.title}</a>
                  </td>
                  <td>{fmtDate(e.startsAt, lang)}</td>
                  <td>{label(DISTRICTS, e.district, lang)}</td>
                  <td>
                    {countOf(e.id, "confirmed")} / {e.capacity}
                    {countOf(e.id, "offered") ? <small> (+{countOf(e.id, "offered")} {t("เสนอแล้ว", "offered")})</small> : null}
                  </td>
                  <td>{countOf(e.id, "waitlisted")}</td>
                  <td>{checkedOf(e.id)}</td>
                  <td>
                    <StatusTag v={v} status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  ));
});

function StatusTag(props: { v: View; status: string }) {
  const { t } = props.v;
  if (props.status === "published") return <Tag tone="ok">{t("เผยแพร่", "Published")}</Tag>;
  if (props.status === "cancelled") return <Tag tone="warn">{t("ยกเลิก", "Cancelled")}</Tag>;
  if (props.status === "pending") return <Tag tone="warn">{t("รอตรวจ", "Waiting for review")}</Tag>;
  if (props.status === "paused") return <Tag tone="warn">{t("พักไว้", "Paused")}</Tag>;
  if (props.status === "rejected") return <Tag tone="warn">{t("ส่งกลับ", "Sent back")}</Tag>;
  return <Tag tone="muted">{t("ร่าง", "Draft")}</Tag>;
}

// ------------------------------------------------------- create / edit --

/** The event form's values, as typed (strings), so a 400 can re-render them. */
type Draft = EntryRuleDraft & {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  district: string;
  capacity: string;
  ageMin: string;
  ageMax: string;
  languages: string[];
  costThb: string;
  paymentNote: string;
  paymentUrl: string;
  visibility: string;
  intensity: string;
  groupMin: string;
  groupMax: string;
  plusOneAllowed: boolean;
  accessibility: string;
  safetyInfo: string;
  emergencyContact: string;
  tags: string[];
  residentPriority: boolean;
  residentQuota: string;
  buddyEnabled: boolean;
  hostAccountId: string;
  partnerOrgId: string;
  status: string;
  visitBangkokRoute: string;
  venueNotes: string;
  venueNotesEn: string;
  nearestStation: string;
  walkMinutes: string;
};

function emptyDraft(): Draft {
  return {
    ...emptyEntryRules(),
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    startsAt: "",
    endsAt: "",
    venueName: "",
    venueAddress: "",
    mapUrl: "",
    district: "",
    capacity: "20",
    ageMin: "18",
    ageMax: "99",
    languages: ["th"],
    costThb: "0",
    paymentNote: "",
    paymentUrl: "",
    visibility: "public",
    intensity: "social",
    groupMin: "4",
    groupMax: "6",
    plusOneAllowed: false,
    accessibility: "",
    safetyInfo: "",
    emergencyContact: "191 / 1669",
    tags: [],
    residentPriority: false,
    residentQuota: "0",
    buddyEnabled: false,
    hostAccountId: "",
    partnerOrgId: "",
    status: "draft",
    visitBangkokRoute: "",
    venueNotes: "",
    venueNotesEn: "",
    nearestStation: "",
    walkMinutes: "",
  };
}

function draftFromEvent(e: Event): Draft {
  return {
    ...entryRulesFromEvent(e),
    title: e.title,
    titleEn: e.titleEn ?? "",
    description: e.description,
    descriptionEn: e.descriptionEn ?? "",
    startsAt: toBkkInput(e.startsAt),
    endsAt: toBkkInput(e.endsAt),
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    mapUrl: e.mapUrl ?? "",
    district: e.district,
    capacity: String(e.capacity),
    ageMin: String(e.ageMin),
    ageMax: String(e.ageMax),
    languages: e.languages,
    costThb: String(e.costThb),
    paymentNote: e.paymentNote ?? "",
    paymentUrl: e.paymentUrl ?? "",
    visibility: e.visibility,
    intensity: e.intensity,
    groupMin: String(e.groupMin),
    groupMax: String(e.groupMax),
    plusOneAllowed: e.plusOneAllowed,
    accessibility: e.accessibility,
    safetyInfo: e.safetyInfo,
    emergencyContact: e.emergencyContact,
    tags: e.tags,
    residentPriority: e.residentPriority,
    residentQuota: String(e.residentQuota),
    buddyEnabled: e.buddyEnabled,
    hostAccountId: e.hostAccountId ?? "",
    partnerOrgId: e.partnerOrgId ?? "",
    status: e.status,
    visitBangkokRoute: e.visitBangkokRoute ?? "",
    venueNotes: e.venueNotes ?? "",
    venueNotesEn: e.venueNotesEn ?? "",
    nearestStation: e.nearestStation ?? "",
    walkMinutes: e.walkMinutes == null ? "" : String(e.walkMinutes),
  };
}

function draftFromBody(body: Record<string, unknown>): Draft {
  const s = (k: string) => str(body[k]);
  const b = (k: string) => str(body[k]) === "1";
  return {
    ...entryRulesFromBody(body),
    title: s("title"),
    titleEn: s("titleEn"),
    description: s("description"),
    descriptionEn: s("descriptionEn"),
    startsAt: s("startsAt"),
    endsAt: s("endsAt"),
    venueName: s("venueName"),
    venueAddress: s("venueAddress"),
    mapUrl: s("mapUrl"),
    district: s("district"),
    capacity: s("capacity"),
    ageMin: s("ageMin"),
    ageMax: s("ageMax"),
    languages: list(body.languages),
    costThb: s("costThb"),
    paymentNote: s("paymentNote"),
    paymentUrl: s("paymentUrl"),
    visibility: s("visibility") || "public",
    intensity: s("intensity"),
    groupMin: s("groupMin"),
    groupMax: s("groupMax"),
    plusOneAllowed: b("plusOneAllowed"),
    accessibility: s("accessibility"),
    safetyInfo: s("safetyInfo"),
    emergencyContact: s("emergencyContact"),
    tags: list(body.tags),
    residentPriority: b("residentPriority"),
    residentQuota: s("residentQuota"),
    buddyEnabled: b("buddyEnabled"),
    hostAccountId: s("hostAccountId"),
    partnerOrgId: s("partnerOrgId"),
    status: s("status"),
    visitBangkokRoute: s("visitBangkokRoute"),
    venueNotes: s("venueNotes"),
    venueNotesEn: s("venueNotesEn"),
    nearestStation: s("nearestStation"),
    walkMinutes: s("walkMinutes"),
  };
}

/** VisitBangkok City Quest preset (PRD §7.3). */
function applyRoute(d: Draft, routeValue: string | undefined): Draft {
  const r = VISITBANGKOK_ROUTES.find((x) => x.value === routeValue);
  if (!r) return d;
  return {
    ...d,
    title: `City Quest: ${r.th}`,
    titleEn: `City Quest: ${r.en}`,
    venueName: r.venue,
    district: r.district,
    tags: [...r.tags],
    visitBangkokRoute: r.value,
    groupMin: "4",
    groupMax: "6",
  };
}

// --------------------------------------------------------- cover image --

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The uploaded cover file, if one was chosen. */
function coverFile(body: Record<string, unknown>): File | null {
  const raw = Array.isArray(body.cover) ? body.cover[0] : body.cover;
  return raw instanceof File && raw.size > 0 ? raw : null;
}

function coverError(file: File | null, v: View): string | null {
  if (!file) return null;
  if (!COVER_TYPES.includes(file.type)) return v.t("ภาพปกต้องเป็นไฟล์ JPG, PNG หรือ WebP", "The cover must be a JPG, PNG or WebP image");
  if (file.size > COVER_MAX_BYTES) return v.t("ภาพปกต้องมีขนาดไม่เกิน 5 MB", "The cover must be 5 MB or smaller");
  return null;
}

/** Store the cover under a server-generated key. Null when storage refused it. */
async function uploadCover(c: Ctx, eventId: string, file: File): Promise<string | null> {
  const key = `uploads/events/${eventId}/${crypto.randomUUID()}`;
  try {
    await putObject(c.env, key, await file.arrayBuffer(), { contentType: file.type });
    return key;
  } catch {
    return null;
  }
}

/** Where the form can preview the current cover. Deployed: a signed URL. Locally: the route below. */
async function adminCoverSrc(c: Ctx, e: Event | null): Promise<string | null> {
  if (!e?.coverKey) return null;
  if (c.env.FILES) {
    try {
      return await getObjectUrl(c.env, e.coverKey);
    } catch {
      return null;
    }
  }
  return c.env.BUCKET ? `${BASE}/${e.id}/cover` : null;
}

type HostOption = { id: string; username: string; nickname: string | null; role: string };
type OrgOption = { id: string; name: string; kind: string };
/** `ownOrg` is a partner admin's own organisation (they can't choose another). */
type FormCtx = { hosts: HostOption[]; orgs: OrgOption[]; ownOrg: OrgOption | null };

async function loadFormCtx(db: Db, a: Account): Promise<FormCtx> {
  const orgCols = { id: partnerOrgs.id, name: partnerOrgs.name, kind: partnerOrgs.kind };
  const [hosts, orgs, own] = await Promise.all([
    db
      .select({ id: accounts.id, username: accounts.username, nickname: profiles.nickname, role: accounts.role })
      .from(accounts)
      .leftJoin(profiles, eq(profiles.accountId, accounts.id))
      .where(and(inArray(accounts.role, ["host", "partner_admin", "bma_admin", "circle_head"]), eq(accounts.status, "active")))
      .orderBy(asc(accounts.username))
      .limit(200),
    a.role === "bma_admin"
      ? db.select(orgCols).from(partnerOrgs).orderBy(asc(partnerOrgs.name)).limit(200)
      : Promise.resolve([] as OrgOption[]),
    a.role !== "bma_admin" && a.partnerOrgId
      ? db.select(orgCols).from(partnerOrgs).where(eq(partnerOrgs.id, a.partnerOrgId)).limit(1)
      : Promise.resolve([] as OrgOption[]),
  ]);
  return { hosts, orgs, ownOrg: own[0] ?? null };
}

/** Women and non-binary only events need a woman or non-binary host (D57). Reads only that host's private gender, never shown. */
async function womenHostOk(db: Db, hostId: string): Promise<boolean> {
  const [p] = await db.select({ gender: profiles.gender }).from(profiles).where(eq(profiles.accountId, hostId)).limit(1);
  return canBeWomenOnly(p?.gender);
}

/** The partner kind an event's form resolves to (dating partners lock open_to_more). */
function orgKindFor(a: Account, ctx: FormCtx, partnerOrgId: string | null | undefined): string | null {
  if (a.role !== "bma_admin") return ctx.ownOrg?.kind ?? null;
  return partnerOrgId ? (ctx.orgs.find((o) => o.id === partnerOrgId)?.kind ?? null) : null;
}

type EventValues = Omit<typeof events.$inferInsert, "id" | "createdBy" | "createdAt">;

const intIn = (s: string, min: number, max: number): number | null => {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};

/** Server-side validation of every §7.1 field. */
function validate(
  d: Draft,
  v: View,
  a: Account,
  ctx: FormCtx,
  existing: Event | null,
  /** Whether the host may run a women and non-binary only event (D57). */
  womenOk = true,
): { data: EventValues | null; errors: string[] } {
  const { t } = v;
  const errors: string[] = [];
  const need = (ok: boolean, th: string, en: string) => {
    if (!ok) errors.push(t(th, en));
  };

  need(d.title.length >= 3 && d.title.length <= 120, "ชื่อกิจกรรมต้องยาว 3 ถึง 120 ตัวอักษร", "Title must be 3 to 120 characters");
  need(d.titleEn.length <= 120, "ชื่อภาษาอังกฤษไม่เกิน 120 ตัวอักษร", "English title is at most 120 characters");
  need(d.description.length <= 4000 && d.descriptionEn.length <= 4000, "รายละเอียดไม่เกิน 4,000 ตัวอักษร", "Descriptions are at most 4,000 characters");

  const startsAt = fromBkkInput(d.startsAt);
  const endsAt = fromBkkInput(d.endsAt);
  need(!!startsAt, "วันเวลาเริ่มไม่ถูกต้อง", "Start date/time is invalid");
  need(!!endsAt, "วันเวลาจบไม่ถูกต้อง", "End date/time is invalid");
  if (startsAt && endsAt) {
    need(endsAt.getTime() > startsAt.getTime(), "เวลาจบต้องหลังเวลาเริ่ม", "The end must be after the start");
    need(endsAt.getTime() - startsAt.getTime() <= 24 * 3_600_000, "กิจกรรมยาวได้ไม่เกิน 24 ชั่วโมง", "An event can last at most 24 hours");
  }
  if (startsAt && !existing) {
    need(startsAt.getTime() > Date.now(), "เวลาเริ่มต้องอยู่ในอนาคต", "The start must be in the future");
  }

  need(d.venueName.length >= 2 && d.venueName.length <= 200, "ระบุสถานที่ (ไม่เกิน 200 ตัวอักษร)", "Venue name is required (max 200)");
  need(d.venueAddress.length <= 400, "ที่อยู่ไม่เกิน 400 ตัวอักษร", "Address is at most 400 characters");
  let mapUrl: string | null = null;
  if (d.mapUrl) {
    try {
      const u = new URL(d.mapUrl);
      if (u.protocol === "http:" || u.protocol === "https:") mapUrl = u.toString();
    } catch {
      mapUrl = null;
    }
    need(!!mapUrl && d.mapUrl.length <= 500, "ลิงก์แผนที่ต้องขึ้นต้นด้วย http:// หรือ https://", "Map link must be an http:// or https:// URL");
  }
  need(values(DISTRICTS).includes(d.district), "เลือกเขต", "Choose a district");

  // Large events have no fixed cap: the organiser decides (member hosts keep MEMBER_MAX_CAPACITY in domain/hosting.ts).
  const capacity = intIn(d.capacity, 1, ORGANISER_MAX_CAPACITY);
  need(capacity !== null, "จำนวนที่นั่งต้องอยู่ระหว่าง 1 ถึง 100,000", "Capacity must be 1 to 100,000");
  const ageMin = intIn(d.ageMin, 18, 99);
  const ageMax = intIn(d.ageMax, 18, 99);
  need(ageMin !== null && ageMax !== null && ageMin <= ageMax, "ช่วงอายุต้องอยู่ระหว่าง 18 ถึง 99 และอายุต่ำสุดต้องไม่เกินอายุสูงสุด", "Age range must be 18 to 99 with min ≤ max");
  need(d.languages.length > 0 && d.languages.every((l) => values(LANGUAGES).includes(l)), "เลือกภาษาอย่างน้อย 1 ภาษา", "Choose at least one language");
  const costThb = intIn(d.costThb || "0", 0, 100_000);
  need(costThb !== null, "ค่าใช้จ่ายต้องอยู่ระหว่าง 0 ถึง 100,000 บาท", "Cost must be 0 to 100,000 THB");
  need(d.paymentNote.length <= 500, "วิธีชำระเงินไม่เกิน 500 ตัวอักษร", "Payment note is at most 500 characters");
  let paymentUrl: string | null = null;
  if (d.paymentUrl) {
    try {
      const u = new URL(d.paymentUrl);
      if (u.protocol === "https:" && d.paymentUrl.length <= 500) paymentUrl = u.toString();
    } catch {
      paymentUrl = null;
    }
    need(!!paymentUrl, "ลิงก์ชำระเงินต้องขึ้นต้นด้วย https://", "The payment link must start with https://");
  }
  need(d.visibility === "public" || d.visibility === "private", "เลือกการมองเห็น", "Choose who can see the event");
  need(values(INTENSITY).includes(d.intensity), "เลือกระดับความโซเชียล", "Choose a social intensity");
  const groupMin = intIn(d.groupMin, 2, 12);
  const groupMax = intIn(d.groupMax, 2, 12);
  need(groupMin !== null && groupMax !== null && groupMin <= groupMax, "โต๊ะละ 2 ถึง 12 คน และค่าน้อยสุดต้องไม่เกินค่ามากสุด", "Group size must be 2 to 12 with min ≤ max");
  need(d.accessibility.length <= 1000 && d.safetyInfo.length <= 1000, "ข้อมูลการเข้าถึง/ความปลอดภัยไม่เกิน 1,000 ตัวอักษร", "Accessibility and safety info are at most 1,000 characters");
  need(d.emergencyContact.length <= 200, "ช่องทางฉุกเฉินไม่เกิน 200 ตัวอักษร", "Emergency contact is at most 200 characters");
  need(d.tags.every((x) => values(EVENT_TAGS).includes(x)), "แท็กไม่ถูกต้อง", "Unknown tag");
  const residentQuota = intIn(d.residentQuota || "0", 0, ORGANISER_MAX_CAPACITY);
  need(residentQuota !== null && (capacity === null || residentQuota <= capacity), "โควตาผู้อยู่อาศัยต้องไม่เกินจำนวนที่นั่ง", "Resident quota can't exceed capacity");
  need(!d.visitBangkokRoute || values(VISITBANGKOK_ROUTES).includes(d.visitBangkokRoute), "เส้นทาง VisitBangkok ไม่ถูกต้อง", "Unknown VisitBangkok route");
  const extras = checkVenueExtras(d, STATIONS.map((x) => x.key));
  for (const x of extras.errors) errors.push(t(x.th, x.en));

  let status = d.status;
  if (existing?.status === "cancelled") status = "cancelled";
  // A member's proposal keeps its review status unless staff pick draft or published.
  else if (existing && (existing.status === "pending" || existing.status === "rejected" || existing.status === "paused") && status === existing.status) status = existing.status;
  else need(status === "draft" || status === "published", "สถานะไม่ถูกต้อง", "Invalid status");

  need(!d.hostAccountId || ctx.hosts.some((h) => h.id === d.hostAccountId), "ผู้ดูแลกิจกรรมไม่ถูกต้อง", "Choose a valid host");

  // Partner org: bma_admin chooses; partner_admin is always their own org.
  let partnerOrgId: string | null;
  if (a.role === "bma_admin") {
    partnerOrgId = d.partnerOrgId || null;
    need(!partnerOrgId || ctx.orgs.some((o) => o.id === partnerOrgId), "องค์กรพาร์ตเนอร์ไม่ถูกต้อง", "Unknown partner organisation");
  } else {
    partnerOrgId = a.partnerOrgId;
  }

  // Entry rules (D51, D52, D56 to D61).
  const rules = checkEventRules(d, { partnerKind: orgKindFor(a, ctx, partnerOrgId), isAdmin: a.role === "bma_admin", costThb: costThb ?? 0, hasPaymentOrTicketLink: !!paymentUrl });
  for (const x of rules.errors) errors.push(t(x.th, x.en));
  need(!d.tags.includes(WOMEN_ONLY_TAG) || womenOk, "กิจกรรมเฉพาะผู้หญิงและนอนไบนารี ต้องมีโฮสต์ที่เป็นผู้หญิงหรือนอนไบนารี", "A women and non-binary only event needs a host who is a woman or non-binary.");

  if (errors.length) return { data: null, errors };
  return {
    errors,
    data: {
      title: d.title,
      titleEn: d.titleEn || null,
      description: d.description,
      descriptionEn: d.descriptionEn || null,
      startsAt: startsAt!,
      endsAt: endsAt!,
      venueName: d.venueName,
      venueAddress: d.venueAddress,
      mapUrl,
      district: d.district,
      capacity: capacity!,
      ageMin: effectiveAgeMin(ageMin!, rules.values.alcoholServed),
      ageMax: Math.max(ageMax!, effectiveAgeMin(ageMin!, rules.values.alcoholServed)),
      languages: d.languages,
      costThb: costThb!,
      paymentNote: d.paymentNote || null,
      paymentUrl,
      ...rules.values,
      visibility: d.visibility as "public" | "private",
      // A private event needs its link; it survives switching back and forth.
      privateToken: d.visibility === "private" ? (existing?.privateToken ?? randomToken(32)) : (existing?.privateToken ?? null),
      intensity: d.intensity,
      groupMin: groupMin!,
      groupMax: groupMax!,
      plusOneAllowed: d.plusOneAllowed,
      accessibility: d.accessibility,
      safetyInfo: d.safetyInfo,
      emergencyContact: d.emergencyContact,
      // Server-side rule: a dating partner's event always carries open_to_more.
      tags: partnerEventTags(d.tags, orgKindFor(a, ctx, partnerOrgId)),
      residentPriority: d.residentPriority,
      residentQuota: residentQuota!,
      buddyEnabled: d.buddyEnabled,
      hostAccountId: d.hostAccountId || null,
      partnerOrgId,
      status,
      visitBangkokRoute: d.visitBangkokRoute || null,
      ...extras.values,
    },
  };
}

function EventForm(props: {
  v: View;
  a: Account;
  d: Draft;
  ctx: FormCtx;
  action: string;
  errors?: string[];
  editing: boolean;
  cover?: { src: string | null; has: boolean };
}) {
  const { v, d, ctx } = props;
  const { t, lang } = v;
  const hostOpts = ctx.hosts.map((h) => ({ value: h.id, th: `${h.nickname ?? h.username} (${h.username})`, en: `${h.nickname ?? h.username} (${h.username})` }));
  const datingOrgs = ctx.orgs.filter((o) => o.kind === "dating");
  const orgOpts = ctx.orgs.map((o) =>
    o.kind === "dating" ? { value: o.id, th: `${o.name} (แอปเดต 💘)`, en: `${o.name} (dating app 💘)` } : { value: o.id, th: o.name, en: o.name },
  );
  const locked = orgKindFor(props.a, ctx, d.partnerOrgId || null) === "dating";
  const statusOpts = [
    { value: "draft", th: "ร่าง (ยังไม่แสดงต่อสมาชิก)", en: "Draft (hidden from members)" },
    { value: "published", th: "เผยแพร่", en: "Published" },
    ...(d.status === "pending" ? [{ value: "pending", th: "รอตรวจ (สมาชิกเสนอ)", en: "Waiting for review (member proposal)" }] : []),
    ...(d.status === "rejected" ? [{ value: "rejected", th: "ส่งกลับให้แก้", en: "Sent back to the host" }] : []),
    // Paused by the team: back on or cancelled from the review queue, so it isn't published from here.
    ...(d.status === "paused" ? [{ value: "paused", th: "ทีมงานพักไว้ (ตัดสินที่หน้าตรวจกิจกรรม)", en: "Paused by the team (decide in Event review)" }] : []),
  ];
  const visOpts = [
    { value: "public", th: "สาธารณะ: แสดงในหน้าค้นหา", en: "Public: listed on Discover" },
    { value: "private", th: "ส่วนตัว: เฉพาะคนที่มีลิงก์", en: "Private: only people with the link" },
  ];
  return (
    <form method="post" action={props.action} enctype="multipart/form-data">
      {props.errors?.length ? (
        <Notice kind="error">
          <ul>
            {props.errors.map((e) => (
              <li>{e}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <input type="hidden" name="visitBangkokRoute" value={d.visitBangkokRoute} />
      {d.visitBangkokRoute ? (
        <Notice kind="info">
          {t("City Quest จากเส้นทาง VisitBangkok: ", "City Quest from the VisitBangkok route: ")}
          {label(VISITBANGKOK_ROUTES, d.visitBangkokRoute, lang)}
        </Notice>
      ) : null}
      <Card>
        <h2>{t("ข้อมูลกิจกรรม", "About the event")}</h2>
        <Field label={t("ชื่อกิจกรรม (ไทย)", "Title (Thai)")} name="title" value={d.title} required maxlength={120} />
        <Field label={t("ชื่อกิจกรรม (อังกฤษ)", "Title (English)")} name="titleEn" value={d.titleEn} maxlength={120} />
        <TextArea label={t("รายละเอียด (ไทย)", "Description (Thai)")} name="description" value={d.description} rows={4} maxlength={4000} />
        <TextArea label={t("รายละเอียด (อังกฤษ)", "Description (English)")} name="descriptionEn" value={d.descriptionEn} rows={4} maxlength={4000} />
        <Choices legend={t("แท็ก", "Tags")} name="tags" options={locked ? EVENT_TAGS.filter((x) => x.value !== OPEN_TO_MORE_TAG) : EVENT_TAGS} values={d.tags} lang={lang} />
        {locked ? (
          <p data-locked-tag={OPEN_TO_MORE_TAG}>
            <input type="hidden" name="tags" value={OPEN_TO_MORE_TAG} />
            <Tag tone="accent">🔒 {label(EVENT_TAGS, OPEN_TO_MORE_TAG, lang)}</Tag>{" "}
            <small>
              {props.a.role === "bma_admin"
                ? t(
                    "ล็อกไว้ เพราะเป็นกิจกรรมของพาร์ตเนอร์แอปเดต จึงเห็นได้เฉพาะสมาชิกที่เลือกเปิดใจมากกว่าเพื่อน",
                    "Locked: this is a dating partner's event, so only members who chose Open to something more can see it.",
                  )
                : t("ล็อกไว้ เห็นได้เฉพาะสมาชิกที่เลือกเปิดใจมากกว่าเพื่อน", "Locked: only members who chose Open to something more can see it.")}
            </small>
          </p>
        ) : datingOrgs.length ? (
          <small>
            {t(
              "กิจกรรมของพาร์ตเนอร์แอปเดต (ดูในช่ององค์กรพาร์ตเนอร์ด้านล่าง) จะติดแท็ก 💘 เปิดใจมากกว่าเพื่อน ให้อัตโนมัติเมื่อบันทึก",
              "Events for a dating partner (marked in Partner organisation below) get the 💘 Open to something more tag automatically when saved.",
            )}
          </small>
        ) : null}
        <fieldset class="choices">
          <legend>{t("ภาพปก (ไม่บังคับ)", "Cover image (optional)")}</legend>
          {props.cover?.src ? (
            <img src={props.cover.src} alt={t("ภาพปกปัจจุบัน", "Current cover image")} style="width:100%;max-width:360px;height:120px;object-fit:cover;border-radius:12px" />
          ) : null}
          <div class="field">
            <label for="f-cover">{props.cover?.has ? t("เปลี่ยนภาพปก", "Replace the cover") : t("อัปโหลดภาพปก", "Upload a cover")}</label>
            <input id="f-cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" />
            <small>{t("JPG, PNG หรือ WebP ไม่เกิน 5 MB ถ้าไม่มีภาพ จะแสดงไอคอนตามหมวดแทน", "JPG, PNG or WebP, up to 5 MB. Without one, the event shows an icon for its category.")}</small>
          </div>
          {props.cover?.has ? <Toggle name="removeCover" label={t("ลบภาพปก", "Remove the cover")} /> : null}
        </fieldset>
      </Card>
      <Card>
        <h2>{t("วันเวลาและสถานที่", "When and where")}</h2>
        <div class="grid2">
          <Field label={t("เริ่ม (เวลากรุงเทพฯ)", "Starts (Bangkok time)")} name="startsAt" type="datetime-local" value={d.startsAt} required />
          <Field label={t("จบ (เวลากรุงเทพฯ)", "Ends (Bangkok time)")} name="endsAt" type="datetime-local" value={d.endsAt} required />
        </div>
        <Field label={t("สถานที่", "Venue")} name="venueName" value={d.venueName} required maxlength={200} />
        <Field label={t("ที่อยู่", "Address")} name="venueAddress" value={d.venueAddress} maxlength={400} />
        <Field
          label={t("ลิงก์แผนที่", "Map link")}
          name="mapUrl"
          type="url"
          value={d.mapUrl}
          placeholder="https://maps.google.com/…"
          maxlength={500}
          hint={t(
            "วางลิงก์ Google Maps แบบเต็ม (มี @ละติจูด,ลองจิจูด) เพื่อปักหมุดตรงสถานที่บนแผนที่ค้นหา ถ้าไม่มี จะแสดงเป็นระดับเขต",
            "Paste a full Google Maps link (with @lat,lng) to pin the exact place on the Discover map; without one it shows at district level",
          )}
        />
        <Select label={t("เขต", "District")} name="district" options={districtsAZ(lang)} value={d.district} lang={lang} required blank={t("เลือกเขต", "Choose a district")} />
        <VenueFields v={v} d={d} />
      </Card>
      <Card>
        <h2>{t("ผู้เข้าร่วม", "Who it's for")}</h2>
        <div class="grid2">
          <Field label={t("จำนวนที่นั่ง", "Capacity")} name="capacity" type="number" min={1} max={ORGANISER_MAX_CAPACITY} value={d.capacity} required />
          <Field label={t("อายุต่ำสุด", "Minimum age")} name="ageMin" type="number" min={18} max={99} value={d.ageMin} required />
          <Field label={t("อายุสูงสุด", "Maximum age")} name="ageMax" type="number" min={18} max={99} value={d.ageMax} required />
          <Select label={t("ระดับความโซเชียล", "Social intensity")} name="intensity" options={INTENSITY} value={d.intensity} lang={lang} />
          <Field label={t("คนต่อโต๊ะ (น้อยสุด)", "Smallest group")} name="groupMin" type="number" min={2} max={12} value={d.groupMin} required />
          <Field label={t("คนต่อโต๊ะ (มากสุด)", "Largest group")} name="groupMax" type="number" min={2} max={12} value={d.groupMax} required />
        </div>
        <Choices legend={t("ภาษา", "Languages")} name="languages" options={LANGUAGES} values={d.languages} lang={lang} />
        <Toggle name="plusOneAllowed" label={t("ชวนเพื่อนมาได้ 1 คน", "Bring-a-friend (+1) allowed")} checked={d.plusOneAllowed} />
        <Toggle name="buddyEnabled" label={t("เปิด Event Buddy", "Enable Event Buddy")} hint={t("จับคู่คนที่ไม่อยากมาคนเดียว 48 ชม. ก่อนงาน", "Pairs people who don't want to arrive alone, 48h before")} checked={d.buddyEnabled} />
        <Toggle name="residentPriority" label={t("ให้สิทธิ์ผู้อยู่อาศัยในกรุงเทพฯ ก่อน", "Bangkok resident priority")} checked={d.residentPriority} />
        <Field label={t("โควตาผู้อยู่อาศัย (ที่นั่ง)", "Resident quota (seats)")} name="residentQuota" type="number" min={0} max={ORGANISER_MAX_CAPACITY} value={d.residentQuota} hint={t("ไม่เกินจำนวนที่นั่ง", "At most the capacity")} />
        <EntryRuleFields t={t} d={d} talk={props.a.role === "bma_admin" || orgKindFor(props.a, ctx, d.partnerOrgId || null) === "health"} />
      </Card>
      <Card>
        <h2>{t("ค่าใช้จ่ายและความปลอดภัย", "Cost and safety")}</h2>
        <Field label={t("ค่าใช้จ่าย (บาท, 0 = ฟรี)", "Cost (THB, 0 = free)")} name="costThb" type="number" min={0} max={100000} value={d.costThb} />
        <Field label={t("วิธีชำระเงิน (นอกแอป)", "How to pay (off-platform)")} name="paymentNote" value={d.paymentNote} maxlength={500} />
        <Field label={t("ลิงก์ชำระเงินของผู้จัด (ไม่บังคับ)", "Host's payment link (optional)")} name="paymentUrl" type="url" value={d.paymentUrl} placeholder="https://…" maxlength={500} />
        <TextArea label={t("การเข้าถึง", "Accessibility")} name="accessibility" value={d.accessibility} maxlength={1000} />
        <TextArea label={t("ความปลอดภัย / จุดนัดพบ", "Safety / meeting point")} name="safetyInfo" value={d.safetyInfo} maxlength={1000} />
        <Field label={t("ติดต่อฉุกเฉิน", "Emergency contact")} name="emergencyContact" value={d.emergencyContact} maxlength={200} />
      </Card>
      <Card>
        <h2>{t("ผู้ดูแลและสถานะ", "Host and status")}</h2>
        <Select label={t("โฮสต์", "Host")} name="hostAccountId" options={hostOpts} value={d.hostAccountId} lang={lang} blank={t("ยังไม่กำหนด", "Not assigned")} />
        {props.a.role === "bma_admin" ? (
          <Select label={t("องค์กรพาร์ตเนอร์", "Partner organisation")} name="partnerOrgId" options={orgOpts} value={d.partnerOrgId} lang={lang} blank={t("Jurrgun (ไม่มีพาร์ตเนอร์)", "Jurrgun (no partner)")} />
        ) : null}
        {d.status === "cancelled" ? (
          <p>
            <Tag tone="warn">{t("ยกเลิกแล้ว", "Cancelled")}</Tag>
          </p>
        ) : (
          <Select label={t("สถานะ", "Status")} name="status" options={statusOpts} value={d.status} lang={lang} />
        )}
        <Select label={t("ใครเห็นกิจกรรมนี้", "Who can see it")} name="visibility" options={visOpts} value={d.visibility} lang={lang} />
      </Card>
      <div class="row end">
        <LinkButton href={BASE} kind="ghost">
          {t("ยกเลิก", "Cancel")}
        </LinkButton>
        <Button>{props.editing ? t("บันทึก", "Save") : t("สร้างกิจกรรม", "Create event")}</Button>
      </div>
    </form>
  );
}

function RoutePresets(props: { v: View }) {
  const { t, lang } = props.v;
  return (
    <details>
      <summary>{t("เริ่มจากเส้นทาง VisitBangkok (City Quest)", "Start from a VisitBangkok route (City Quest)")}</summary>
      <ul>
        {VISITBANGKOK_ROUTES.map((r) => (
          <li>
            <a href={`${BASE}/new?route=${r.value}`}>{lang === "en" ? r.en : r.th}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}

adminEvents.get("/new", async (c) => {
  const v = view(c);
  const a = me(c);
  if (!canCreate(a)) return forbidden(c);
  const ctx = await loadFormCtx(getDb(c.env), a);
  const d = applyRoute(emptyDraft(), c.req.query("route"));
  return page(c, { title: v.t("สร้างกิจกรรม", "New event"), admin: true }, (
    <>
      <h1>{v.t("สร้างกิจกรรม", "New event")}</h1>
      <RoutePresets v={v} />
      <EventForm v={v} a={a} d={d} ctx={ctx} action={`${BASE}/new`} editing={false} />
    </>
  ));
});

adminEvents.post("/new", async (c) => {
  const v = view(c);
  const a = me(c);
  if (!canCreate(a)) return forbidden(c);
  const db = getDb(c.env);
  const ctx = await loadFormCtx(db, a);
  const body = await c.req.parseBody({ all: true });
  const d = draftFromBody(body);
  const { data, errors } = validate(d, v, a, ctx, null, await womenHostOk(db, d.hostAccountId || a.id));
  const file = coverFile(body);
  const coverErr = coverError(file, v);
  const id = newId();
  const bad = (errs: string[]) =>
    page(c, { title: v.t("สร้างกิจกรรม", "New event"), admin: true, status: 400 }, (
      <>
        <h1>{v.t("สร้างกิจกรรม", "New event")}</h1>
        <EventForm v={v} a={a} d={d} ctx={ctx} action={`${BASE}/new`} errors={errs} editing={false} />
      </>
    ));
  if (!data || coverErr) return bad([...errors, ...(coverErr ? [coverErr] : [])]);
  let coverKey: string | null = null;
  if (file) {
    coverKey = await uploadCover(c, id, file);
    if (!coverKey) return bad([v.t("อัปโหลดภาพปกไม่สำเร็จ ลองใหม่อีกครั้ง", "The cover couldn't be uploaded. Please try again.")]);
  }
  await batch(c.env, [
    db.insert(events).values({ ...data, coverKey, id, createdBy: a.id }),
    audit(db, a.id, "event.create", { type: "event", id }, { title: data.title, status: data.status, partnerOrgId: data.partnerOrgId }),
  ]);
  return c.redirect(`${BASE}/${id}?notice=saved`);
});

adminEvents.get(
  "/:id/edit",
  withEvent(async (c, e, db) => {
    const v = view(c);
    const a = me(c);
    const ctx = await loadFormCtx(db, a);
    return page(c, { title: v.t("แก้ไขกิจกรรม", "Edit event"), admin: true }, (
      <>
        <p>
          <a href={`${BASE}/${e.id}`}>{v.t("← กลับ", "← Back")}</a>
        </p>
        <h1>{v.t("แก้ไขกิจกรรม", "Edit event")}</h1>
        <EventForm
          v={v}
          a={a}
          d={draftFromEvent(e)}
          ctx={ctx}
          action={`${BASE}/${e.id}/edit`}
          editing
          cover={{ src: await adminCoverSrc(c, e), has: !!e.coverKey }}
        />
      </>
    ));
  }, { edit: true }),
);

adminEvents.post(
  "/:id/edit",
  withEvent(async (c, e, db) => {
    const v = view(c);
    const a = me(c);
    const ctx = await loadFormCtx(db, a);
    const body = await c.req.parseBody({ all: true });
    const d = draftFromBody(body);
    const { data: validated, errors } = validate(d, v, a, ctx, e, await womenHostOk(db, d.hostAccountId || a.id));
    const file = coverFile(body);
    const coverErr = coverError(file, v);
    const bad = async (errs: string[]) =>
      page(c, { title: v.t("แก้ไขกิจกรรม", "Edit event"), admin: true, status: 400 }, (
        <>
          <h1>{v.t("แก้ไขกิจกรรม", "Edit event")}</h1>
          <EventForm
            v={v}
            a={a}
            d={d}
            ctx={ctx}
            action={`${BASE}/${e.id}/edit`}
            errors={errs}
            editing
            cover={{ src: await adminCoverSrc(c, e), has: !!e.coverKey }}
          />
        </>
      ));
    if (!validated || coverErr) return bad([...errors, ...(coverErr ? [coverErr] : [])]);
    // A paused event is put back on or cancelled from the review queue, where everyone with a place is told.
    if (e.status === "paused" && validated.status !== "paused") {
      return bad([v.t("ทีมงานพักกิจกรรมนี้ไว้ ให้ตัดสินที่หน้าตรวจกิจกรรม (กลับมาจัดต่อหรือยกเลิก)", "The team paused this event. Decide in Event review: back on, or cancel.")]);
    }
    // Unpublishing would hide the event, its passes and its cancel button from
    // people already coming (and then strike them as no-shows). Cancel instead.
    if (e.status === "published" && validated.status === "draft") {
      const [held] = await db
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.eventId, e.id), inArray(registrations.status, REACHABLE)))
        .limit(1);
      if (held) {
        return bad([
          v.t(
            "มีคนลงทะเบียนแล้ว จึงเปลี่ยนกลับเป็นฉบับร่างไม่ได้ ถ้าจัดไม่ได้ให้ยกเลิกกิจกรรมแทน (ระบบจะแจ้งทุกคน)",
            "People have already signed up, so this can't go back to draft. If it can't go ahead, cancel the event instead (everyone is notified).",
          ),
        ]);
      }
    }
    let coverKey = e.coverKey;
    if (file) {
      coverKey = await uploadCover(c, e.id, file);
      if (!coverKey) return bad([v.t("อัปโหลดภาพปกไม่สำเร็จ ลองใหม่อีกครั้ง", "The cover couldn't be uploaded. Please try again.")]);
    } else if (str(body.removeCover) === "1") {
      coverKey = null;
    }
    const data = { ...validated, coverKey };
    const moved =
      e.startsAt.getTime() !== data.startsAt.getTime() ||
      e.endsAt.getTime() !== data.endsAt.getTime() ||
      e.venueName !== data.venueName ||
      e.venueAddress !== (data.venueAddress ?? "");
    const queries: Parameters<typeof batchAll>[1] = [];
    queries.push(db.update(events).set(data).where(eq(events.id, e.id)));
    if (moved && e.status === "published" && data.status === "published") {
      const regs = await reachableRegistrations(db, e.id);
      const th = `เวลาหรือสถานที่เปลี่ยน: ${data.title}`;
      const en = `Time or venue changed: ${data.titleEn ?? data.title}`;
      queries.push(...notifyMany(db, regs.map((r) => ({ accountId: r.accountId, th, en })), "event_changed", `/events/${e.id}`));
    }
    queries.push(
      audit(db, a.id, "event.update", { type: "event", id: e.id }, { moved, capacity: [e.capacity, data.capacity], status: [e.status, data.status], cover: coverKey !== e.coverKey }),
    );
    // The change itself goes in the first batch; a very large fan-out continues in further batches.
    await batchAll(c.env, queries);
    // The old cover is unreferenced now: delete it (best effort).
    if (e.coverKey && e.coverKey !== coverKey) await deleteObject(c.env, e.coverKey).catch(() => {});
    if (data.capacity > e.capacity || (e.status !== "published" && data.status === "published")) {
      await refreshWaitlist(c.env, e.id);
    }
    return c.redirect(`${BASE}/${e.id}?notice=saved`);
  }, { edit: true }),
);

/** Cover preview for staff. Deployed: redirect to a signed URL. Locally: serve the bytes (dev only). */
adminEvents.get(
  "/:id/cover",
  withEvent(async (c, e) => {
    if (!e.coverKey) return c.notFound();
    if (c.env.FILES) {
      return new Response(null, { status: 302, headers: { location: await getObjectUrl(c.env, e.coverKey), "cache-control": "private, max-age=60" } });
    }
    if (!c.env.BUCKET) return c.notFound();
    const obj = await getObject(c.env, e.coverKey).catch(() => null);
    if (!obj) return c.notFound();
    return new Response(obj.body, { headers: { "content-type": obj.metadata.contentType ?? "application/octet-stream", "cache-control": "private, max-age=60" } });
  }),
);

adminEvents.post(
  "/:id/publish",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    if (e.status !== "draft") return refuse(c, e, t("เผยแพร่ได้เฉพาะฉบับร่าง", "Only a draft can be published"), 409);
    await batch(c.env, [
      db.update(events).set({ status: "published" }).where(eq(events.id, e.id)),
      audit(db, me(c).id, "event.publish", { type: "event", id: e.id }),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=saved`);
  }, { edit: true }),
);

adminEvents.post(
  "/:id/cancel",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    if (e.status === "cancelled") return refuse(c, e, t("กิจกรรมนี้ถูกยกเลิกแล้ว", "This event is already cancelled"), 409);
    const regs = await reachableRegistrations(db, e.id);
    const th = `ขออภัย กิจกรรมถูกยกเลิก: ${e.title}`;
    const en = `Sorry, this event was cancelled: ${e.titleEn ?? e.title}`;
    // Every seat and waitlist place is given back too (src/services/announcements.ts cancelWrites).
    await batchAll(c.env, [
      ...cancelWrites(db, e.id, new Date()),
      audit(db, me(c).id, "event.cancel", { type: "event", id: e.id }, { notified: regs.length }),
      ...notifyMany(db, regs.map((r) => ({ accountId: r.accountId, th, en })), "event_cancelled", `/events/${e.id}`),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=cancelled`);
  }, { edit: true }),
);

// ===================================================== OPERATIONS (below) ==

/** Icebreakers (PRD §9.3): activity- and city-based, never romantic. */
const PROMPTS: { key: string; th: string; en: string }[] = [
  { key: "river", th: "หาคนที่อยู่อีกฝั่งแม่น้ำ", en: "Find someone who lives across the river from you" },
  { key: "revisit", th: "เลือกที่หนึ่งในกรุงเทพฯ ที่ทุกคนในโต๊ะอยากกลับไปอีก", en: "Pick one place in Bangkok everyone in your group would revisit" },
  { key: "fix", th: "เลือกปัญหาเมือง 1 อย่างที่โต๊ะคุณจะแก้ก่อน", en: "Choose one city problem your table would fix first" },
  { key: "food", th: "แชร์ร้านอาหารลับ ๆ ในย่านของคุณ 1 ร้าน", en: "Share one hidden food spot from your neighbourhood" },
  { key: "route", th: "วางแผนเส้นทางเดินเล่น 1 ชั่วโมงที่โต๊ะคุณอยากไปด้วยกัน", en: "Plan a one-hour walk your table would do together" },
];

const QR_PREFIX = "bkksocial:pass:";

function registrationStatusLabel(v: View, s: string): string {
  const { t } = v;
  switch (s) {
    case "confirmed":
      return t("ยืนยันแล้ว", "Confirmed");
    case "offered":
      return t("เสนอที่นั่งแล้ว", "Offered");
    case "waitlisted":
      return t("อยู่ในคิวสำรอง", "Waitlisted");
    case "late_cancelled":
      return t("ยกเลิกกระชั้นชิด", "Late cancel");
    case "cancelled":
      return t("ยกเลิก", "Cancelled");
    default:
      return s;
  }
}

/**
 * Organiser approval (D57): approving takes a seat if one is free (else the
 * waitlist), declining frees nothing. Both tell the member.
 */
for (const answer of ["approve", "decline"] as const) {
  adminEvents.post(
    `/:id/requests/:reg/${answer}`,
    withEvent(async (c, e, db) => {
      const a = me(c);
      const [reg] = await db
        .select({ id: registrations.id, accountId: registrations.accountId })
        .from(registrations)
        .where(and(eq(registrations.id, c.req.param("reg") ?? ""), eq(registrations.eventId, e.id), eq(registrations.status, "requested")))
        .limit(1);
      if (!reg) return c.redirect(`${BASE}/${e.id}#requests`);
      const [acct] = await db.select({ bkk: accounts.bkkRegistered }).from(accounts).where(eq(accounts.id, reg.accountId)).limit(1);
      const status = answer === "decline" ? "cancelled" : seatAvailable(await seatState(db, e), acct?.bkk === "verified") ? "confirmed" : "waitlisted";
      const title = e.titleEn ?? e.title;
      await batch(c.env, [
        db.update(registrations).set({ status, cancelledAt: status === "cancelled" ? new Date() : null }).where(eq(registrations.id, reg.id)),
        audit(db, a.id, `event.request_${answer}`, { type: "event", id: e.id }),
        status === "confirmed"
          ? notify(db, reg.accountId, "rsvp", `ได้ที่นั่งแล้ว: ${e.title}`, `You're in: ${title}`, `/me/events/${e.id}/pass`)
          : status === "waitlisted"
            ? notify(db, reg.accountId, "waitlist", `ผู้จัดอนุมัติแล้ว อยู่ในคิวสำรอง: ${e.title}`, `Approved, and on the waitlist: ${title}`, `/events/${e.id}`)
            : notify(db, reg.accountId, "rsvp_declined", `ผู้จัดไม่ได้รับคำขอครั้งนี้: ${e.title}`, `The organiser couldn't take your request: ${title}`, `/events`),
      ]);
      return c.redirect(`${BASE}/${e.id}?notice=saved#requests`);
    }),
  );
}

/** Checked-in count for the station and JSON responses. */
async function checkedInCount(db: Db, eventId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "confirmed"), isNotNull(registrations.checkedInAt)))
    .limit(1);
  return Number(row?.n ?? 0);
}

// ----------------------------------------------------- operations page --

adminEvents.get(
  "/:id",
  withEvent(async (c, e0, db) => {
    const v = view(c);
    const { t, lang } = v;
    const a = me(c);
    const isAdmin = a.role === "bma_admin";
    const now = new Date();

    // Lazy timer: lapse expired offers and fill free seats on page load.
    let e = e0;
    if (e.status === "published" && e.startsAt.getTime() > now.getTime()) {
      const offers = await refreshWaitlist(c.env, e.id, now);
      if (offers > 0) [e] = await db.select().from(events).where(eq(events.id, e.id)).limit(1);
    }

    // Totals come from one grouped count, never from loading every registration
    // (an event can hold 100,000). The attendee table is paged.
    const { page: ap, offset } = pageOf(c.req.query("ap"), ATTENDEE_PAGE);
    const notWaitlisted = and(eq(registrations.eventId, e.id), ne(registrations.status, "waitlisted"), ne(registrations.status, "requested"));
    const anns = await eventAnnouncements(db, e.id);
    const announcer = canAnnounce(e, a);
    // Requests waiting for the organiser (D57), and a private talk's anonymous questions (D52).
    const [requests, questions] = await Promise.all([
      e.approvalRequired
        ? db
            .select({ id: registrations.id, nickname: profiles.nickname, createdAt: registrations.createdAt })
            .from(registrations)
            .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
            .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "requested")))
            .orderBy(asc(registrations.createdAt))
            .limit(200)
        : Promise.resolve([] as { id: string; nickname: string | null; createdAt: Date }[]),
      e.talkMode
        ? db.select({ id: talkQuestions.id, body: talkQuestions.body, createdAt: talkQuestions.createdAt }).from(talkQuestions).where(eq(talkQuestions.eventId, e.id)).orderBy(asc(talkQuestions.createdAt)).limit(300)
        : Promise.resolve([] as { id: string; body: string; createdAt: Date }[]),
    ]);
    const [totals, pageRows, waitRows, checked, pairs, hostRow] = await Promise.all([
      db
        .select({
          status: registrations.status,
          n: sql<number>`count(*)`.mapWith(Number),
          checkedIn: sql<number>`count(${registrations.checkedInAt})`.mapWith(Number),
          noShowPending: sql<number>`count(*) filter (where ${registrations.checkedInAt} is null and not ${registrations.noShowRecorded})`.mapWith(Number),
          plusOnes: sql<number>`count(${registrations.plusOneWith})`.mapWith(Number),
        })
        .from(registrations)
        .where(eq(registrations.eventId, e.id))
        .groupBy(registrations.status)
        .limit(20),
      db
        .select({
          id: registrations.id,
          accountId: registrations.accountId,
          status: registrations.status,
          plusOneWith: registrations.plusOneWith,
          wantsBuddy: registrations.wantsBuddy,
          checkedInAt: registrations.checkedInAt,
          checkInMethod: registrations.checkInMethod,
          groupNo: registrations.groupNo,
          noShowRecorded: registrations.noShowRecorded,
          nickname: profiles.nickname,
          // Usernames are for bma_admin only; nobody else even loads them.
          username: isAdmin ? accounts.username : sql<string | null>`null`,
        })
        .from(registrations)
        .innerJoin(accounts, eq(accounts.id, registrations.accountId))
        .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
        .where(notWaitlisted)
        .orderBy(asc(registrations.createdAt), asc(registrations.id))
        .limit(ATTENDEE_PAGE)
        .offset(offset),
      // The waitlist in the order members see their place in it: first come, first served.
      db
        .select({ id: registrations.id, accountId: registrations.accountId, status: registrations.status, offeredUntil: registrations.offeredUntil, nickname: profiles.nickname })
        .from(registrations)
        .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
        .where(and(eq(registrations.eventId, e.id), inArray(registrations.status, ["waitlisted", "offered"])))
        .orderBy(asc(registrations.createdAt), asc(registrations.id))
        .limit(WAITLIST_SHOWN),
      // Everyone checked in, for the seating view.
      keysetAll(registrations.id, (after, n) =>
        db
          .select({ id: registrations.id, accountId: registrations.accountId, groupNo: registrations.groupNo, createdAt: registrations.createdAt, nickname: profiles.nickname })
          .from(registrations)
          .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
          .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed"), isNotNull(registrations.checkedInAt), after))
          .orderBy(asc(registrations.id))
          .limit(n),
      ),
      db.select().from(buddyPairs).where(eq(buddyPairs.eventId, e.id)).orderBy(asc(buddyPairs.createdAt)).limit(500),
      e.hostAccountId
        ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, e.hostAccountId)).limit(1)
        : Promise.resolve([] as { nickname: string }[]),
    ]);

    const tally = (pick: (r: (typeof totals)[number]) => number, only?: (status: string) => boolean) =>
      totals.filter((r) => !only || only(r.status)).reduce((sum, r) => sum + pick(r), 0);
    const confirmedCount = tally((r) => r.n, (s) => s === "confirmed");
    const checkedCount = tally((r) => r.checkedIn, (s) => s === "confirmed");
    const waitlistedCount = tally((r) => r.n, (s) => s === "waitlisted");
    const waitlistCount = tally((r) => r.n, (s) => s === "waitlisted" || s === "offered");
    const attendingCount = tally((r) => r.n, (s) => s !== "waitlisted" && s !== "requested");
    const anyPlusOne = tally((r) => r.plusOnes, (s) => s !== "waitlisted") > 0;
    const noShowPending = tally((r) => r.noShowPending, (s) => s === "confirmed");
    const ended = now.getTime() >= e.endsAt.getTime();
    const noShows = ended ? confirmedCount - checkedCount : 0;

    const attendeesHref = (n: number) => `${BASE}/${e.id}${n > 1 ? `?ap=${n}` : ""}#attendees`;
    // Past the last page (people cancelled): go to the last one.
    if (pageRows.length === 0 && ap > 1 && attendingCount > 0) return c.redirect(attendeesHref(Math.ceil(attendingCount / ATTENDEE_PAGE)));

    const noName = t("(ไม่มีชื่อ)", "(no name)");
    const nick = new Map<string, string>();
    for (const r of [...pageRows, ...waitRows, ...checked]) nick.set(r.accountId, r.nickname ?? noName);
    // +1 partners and buddies who aren't on this page: look their nicknames up by id.
    const missing = [...new Set([...pageRows.map((r) => r.plusOneWith), ...pairs.flatMap((p) => p.members)])].filter((x): x is string => !!x && !nick.has(x));
    const pageIds = pageRows.map((r) => r.accountId);
    const [extraNicks, strikeRows] = await Promise.all([
      missing.length
        ? db.select({ accountId: profiles.accountId, nickname: profiles.nickname }).from(profiles).where(inArray(profiles.accountId, missing)).limit(missing.length)
        : Promise.resolve([] as { accountId: string; nickname: string }[]),
      // Strikes only for the people on this page.
      pageIds.length
        ? db
            .select({ accountId: strikes.accountId, waivedBy: strikes.waivedBy, reason: strikes.reason })
            .from(strikes)
            .where(and(eq(strikes.eventId, e.id), inArray(strikes.accountId, pageIds)))
            .limit(pageIds.length * 2)
        : Promise.resolve([] as { accountId: string; waivedBy: string | null; reason: string }[]),
    ]);
    for (const x of extraNicks) nick.set(x.accountId, x.nickname ?? noName);

    const strikeOf = new Map(strikeRows.map((s) => [s.accountId, s]));
    checked.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || (x.id < y.id ? -1 : 1));
    const groups = new Map<number, typeof checked>();
    for (const r of checked) {
      if (r.groupNo == null) continue;
      groups.set(r.groupNo, [...(groups.get(r.groupNo) ?? []), r]);
    }
    const groupNos = [...groups.keys()].sort((x, y) => x - y);
    const ungrouped = checked.filter((r) => r.groupNo == null);
    // The manual +1 link offers the confirmed people on this page of the list.
    const confirmedHere = pageRows.filter((r) => r.status === "confirmed");
    const editable = canEdit(a, e);
    const title = lang === "en" && e.titleEn ? e.titleEn : e.title;

    // Day-of: the host's status, and who said they're running late or on the way (first names only).
    const dayOpen = dayOfOpen(e, now);
    const etaRows = dayOpen
      ? await db
          .select({ etaStatus: registrations.etaStatus, etaAt: registrations.etaAt, checkedInAt: registrations.checkedInAt, nickname: profiles.nickname })
          .from(registrations)
          .leftJoin(profiles, eq(profiles.accountId, registrations.accountId))
          .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed"), isNotNull(registrations.etaStatus)))
          .limit(500)
      : [];
    const etaNames = (k: string) =>
      etaRows.filter((r) => !r.checkedInAt && shownEta(e, r, now) === k).map((r) => (r.nickname ?? noName).trim().split(/\s+/)[0] ?? noName);

    const swaps = c.req.query("swaps");
    const isolated = c.req.query("isolated");
    const blockedQ = c.req.query("blocked");

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
          {e.visitBangkokRoute ? <span>🧭 {label(VISITBANGKOK_ROUTES, e.visitBangkokRoute, lang)}</span> : null}
          {e.visibility === "private" ? <span>🔒 {t("ส่วนตัว", "Private")}</span> : null}
        </div>
        {e.visibility === "private" && e.privateToken && (editable || e.hostAccountId === a.id) ? (
          <div class="field">
            <label for="private-link">{t("ลิงก์ส่วนตัว (ส่งให้คนที่ชวนเท่านั้น)", "Private link (send it only to people you invite)")}</label>
            <input id="private-link" type="text" readonly value={`${new URL(c.req.url).origin}/events/${e.id}?t=${encodeURIComponent(e.privateToken)}`} onfocus="this.select()" />
          </div>
        ) : null}
        <div class="row" style="margin:10px 0">
          {e.status !== "cancelled" ? <LinkButton href={`${BASE}/${e.id}/checkin`}>{t("📷 จุดเช็กอิน", "📷 Check-in station")}</LinkButton> : null}
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
            <form method="post" action={`${BASE}/${e.id}/cancel`} onsubmit={`return confirm(${JSON.stringify(t("ยกเลิกกิจกรรมนี้และแจ้งผู้ลงทะเบียนทุกคน?", "Cancel this event and notify every registrant?"))})`}>
              <Button kind="danger">{t("ยกเลิกกิจกรรม", "Cancel event")}</Button>
            </form>
          ) : null}
        </div>

        <div class="stats">
          <Stat label={t("ยืนยัน / ที่นั่ง", "Confirmed / capacity")} value={`${confirmedCount} / ${e.capacity}`} />
          <Stat label={t("คาดว่าจะมา", "Expected")} value={confirmedCount} />
          <Stat label={t("เช็กอินแล้ว", "Checked in")} value={checkedCount} />
          <Stat label={t("ไม่มาตามนัด", "No-shows")} value={ended ? noShows : t("ยังไม่มี", "Not yet")} hint={ended ? undefined : t("นับหลังจบงาน", "Counted after the end")} />
          <Stat label={t("คิวสำรอง", "Waitlist")} value={waitlistedCount} />
        </div>

        {e.approvalRequired ? (
          <>
            <h2 id="requests">{t("คำขอที่นั่ง", "Place requests")}</h2>
            {requests.length === 0 ? (
              <Empty>{t("ยังไม่มีคำขอ", "No requests waiting")}</Empty>
            ) : (
              <ul class="plain">
                {requests.map((r) => (
                  <li class="row">
                    <span>{r.nickname ?? t("(ไม่มีชื่อ)", "(no name)")}</span>
                    {e.status === "published" ? (
                      <>
                        <form method="post" action={`${BASE}/${e.id}/requests/${r.id}/approve`} style="display:inline">
                          <Button>{t("อนุมัติ", "Approve")}</Button>
                        </form>
                        <form method="post" action={`${BASE}/${e.id}/requests/${r.id}/decline`} style="display:inline">
                          <Button kind="ghost">{t("ปฏิเสธ", "Decline")}</Button>
                        </form>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {e.talkMode ? (
          <>
            <h2 id="questions">{t("คำถามแบบไม่ระบุชื่อ", "Anonymous questions")}</h2>
            <p class="muted">{t("ไม่มีใครรู้ว่าใครถาม รวมถึงทีมงาน", "Nobody, staff included, can see who asked.")}</p>
            {questions.length === 0 ? (
              <Empty>{t("ยังไม่มีคำถาม", "No questions yet")}</Empty>
            ) : (
              <ol>
                {questions.map((q) => (
                  <li>{q.body}</li>
                ))}
              </ol>
            )}
          </>
        ) : null}

        <h2 id="attendees">{t("ผู้เข้าร่วม", "Attendees")}</h2>
        {attendingCount === 0 ? (
          <Empty>{t("ยังไม่มีผู้ลงทะเบียน", "No registrations yet")}</Empty>
        ) : (
          <>
          <Pager t={t} label={t("หน้าของรายชื่อผู้เข้าร่วม", "Attendee list pages")} page={ap} size={ATTENDEE_PAGE} shown={pageRows.length} total={attendingCount} href={attendeesHref} />
          <div class="table-wrap">
            <table>
              <caption class="sr-only">{t("ผู้เข้าร่วม", "Attendees")}</caption>
              <thead>
                <tr>
                  <th>{t("ชื่อเล่น", "Nickname")}</th>
                  {isAdmin ? <th>{t("ชื่อผู้ใช้", "Username")}</th> : null}
                  <th>{t("สถานะ", "Status")}</th>
                  <th>{t("มากับ (+1)", "+1 with")}</th>
                  <th>{t("ขอบัดดี้", "Wants buddy")}</th>
                  <th>{t("เช็กอิน", "Checked in")}</th>
                  <th>{t("โต๊ะ", "Table")}</th>
                  <th>{t("ไม่มาตามนัด", "No-show")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const s = strikeOf.get(r.accountId);
                  return (
                    <tr>
                      <td>{nick.get(r.accountId)}</td>
                      {isAdmin ? <td>{r.username}</td> : null}
                      <td>{registrationStatusLabel(v, r.status)}</td>
                      <td>{r.plusOneWith ? nick.get(r.plusOneWith) ?? "-" : "-"}</td>
                      <td>{r.wantsBuddy ? t("ใช่", "Yes") : "-"}</td>
                      <td>
                        {r.checkedInAt ? (
                          <>
                            {fmtDate(r.checkedInAt, lang)} <small>({r.checkInMethod === "manual" ? t("พิมพ์รหัส", "manual") : t("สแกน", "scan")})</small>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{r.groupNo ?? "-"}</td>
                      <td>
                        {r.noShowRecorded ? (
                          s && !s.waivedBy && s.reason === "no_show" ? (
                            <form method="post" action={`${BASE}/${e.id}/strikes/${r.accountId}/waive`} class="row">
                              <input type="text" name="reason" required maxlength={200} placeholder={t("เหตุผลที่ยกเว้น", "Reason to waive")} aria-label={t("เหตุผลที่ยกเว้น", "Reason to waive")} />
                              <Button kind="ghost">{t("ยกเว้น", "Waive")}</Button>
                            </form>
                          ) : s?.waivedBy ? (
                            <Tag tone="ok">{t("ยกเว้นแล้ว", "Waived")}</Tag>
                          ) : (
                            <Tag tone="warn">{t("ไม่มาตามนัด", "No-show")}</Tag>
                          )
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <h2>{t("คิวสำรอง", "Waitlist")}</h2>
        {waitRows.length === 0 ? (
          <Empty>{t("ไม่มีใครในคิวสำรอง", "Nobody on the waitlist")}</Empty>
        ) : (
          <>
            <ol>
              {waitRows.map((r) => (
                <li>
                  {nick.get(r.accountId)}{" "}
                  {r.status === "offered" ? (
                    <Tag tone="accent">
                      {t("เสนอที่นั่งแล้ว ยืนยันได้ถึง ", "Offered until ")}
                      {r.offeredUntil ? fmtDate(r.offeredUntil, lang) : ""}
                    </Tag>
                  ) : null}
                </li>
              ))}
            </ol>
            {waitlistCount > waitRows.length ? (
              <p class="muted">{t(`แสดง ${waitRows.length} คนแรกจากทั้งหมด ${waitlistCount} คน`, `Showing the first ${waitRows.length} of ${waitlistCount}`)}</p>
            ) : null}
            <small>{t("ตอนเสนอที่นั่ง ระบบจะใช้สิทธิ์ผู้อยู่อาศัยและกฎใบเตือนมาจัดลำดับด้วย", "Offers apply resident priority and strike rules on top of this order")}</small>
          </>
        )}
        {e.status === "published" && !ended ? (
          <form method="post" action={`${BASE}/${e.id}/waitlist/offer`}>
            <Button kind="ghost">{t("เสนอที่ว่างให้คิวถัดไป", "Offer next spot")}</Button>
          </form>
        ) : null}

        <h2 id="groups">{t("โต๊ะ", "Small groups")}</h2>
        <p>
          <small>
            {t(
              "จัดเฉพาะคนที่เช็กอินแล้ว คู่ +1 ได้นั่งด้วยกัน และคนที่บล็อกกันจะไม่อยู่โต๊ะเดียวกัน",
              "Built from checked-in attendees only. +1 pairs stay together; blocked pairs are never seated together.",
            )}{" "}
            {t(`โต๊ะละ ${e.groupMin} ถึง ${e.groupMax} คน`, `Tables of ${e.groupMin} to ${e.groupMax}.`)}
          </small>
        </p>
        {swaps !== undefined ? (
          <Notice kind={blockedQ && blockedQ !== "0" ? "warn" : "info"}>
            {t("ผลการจัดโต๊ะ: ", "Suggestion quality: ")}
            {t(`คู่ที่ยังอยากสลับโต๊ะ ${swaps}`, `${swaps} blocking swaps`)} · {t(`คนที่ไม่มีภาษาร่วม ${isolated ?? 0}`, `${isolated ?? 0} without a shared language`)}
            {blockedQ && blockedQ !== "0" ? ` · ${t(`คู่ที่บล็อกกันแต่อยู่โต๊ะเดียวกัน ${blockedQ} คู่ ย้ายออกด้วย`, `${blockedQ} blocked pairs share a group. Please move them`)}` : null}
          </Notice>
        ) : null}
        {e.groupsPublishedAt ? (
          <Notice kind="ok">
            {t("เผยแพร่โต๊ะแล้วเมื่อ ", "Groups published ")}
            {fmtDate(e.groupsPublishedAt, lang)} · {t("คนที่มาสายจะได้นั่งโต๊ะที่คนน้อยที่สุดโดยอัตโนมัติ", "late arrivals join the smallest group automatically")}
          </Notice>
        ) : null}
        <div class="grid2">
          {groupNos.map((g) => (
            <Card>
              <h3>
                {t("โต๊ะ", "Table")} {g} <small>({groups.get(g)!.length})</small>
              </h3>
              <ul>
                {groups.get(g)!.map((r) => (
                  <li>{nick.get(r.accountId)}</li>
                ))}
              </ul>
            </Card>
          ))}
          {ungrouped.length ? (
            <Card>
              <h3>{t("ยังไม่มีโต๊ะ", "Not in a group")}</h3>
              <ul>
                {ungrouped.map((r) => (
                  <li>{nick.get(r.accountId)}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <div class="row">
          <form method="post" action={`${BASE}/${e.id}/groups/suggest`}>
            <Button kind={groupNos.length ? "ghost" : "primary"}>{t("แนะนำโต๊ะ", "Suggest groups")}</Button>
          </form>
          {groupNos.length ? (
            <form method="post" action={`${BASE}/${e.id}/groups/publish`}>
              <Button>{e.groupsPublishedAt ? t("เผยแพร่อีกครั้ง", "Publish again") : t("เผยแพร่โต๊ะ", "Publish groups")}</Button>
            </form>
          ) : null}
        </div>
        {checked.length ? (
          <details>
            <summary>{t("ย้ายคนไปโต๊ะอื่น", "Move someone to another group")}</summary>
            <form method="post" action={`${BASE}/${e.id}/groups/move`}>
              <Select
                label={t("ผู้เข้าร่วม", "Attendee")}
                name="registrationId"
                lang={lang}
                options={checked.map((r) => ({ value: r.id, th: nick.get(r.accountId)!, en: nick.get(r.accountId)! }))}
              />
              <Field label={t("เลขโต๊ะ (เว้นว่าง = ไม่มีโต๊ะ)", "Table number (blank = none)")} name="groupNo" type="number" min={1} max={99} />
              <Button kind="ghost">{t("ย้าย", "Move")}</Button>
            </form>
          </details>
        ) : null}

        {e.status === "published" && !ended ? (
          <>
            <h2 id="day-of">{t("สถานะวันงาน", "On the day")}</h2>
            <DayStatusForm v={v} action={`${BASE}/${e.id}/day-status`} shown={shownDayStatus(e, now)} open={dayOpen} opensAt={fmtDate(dayOfOpensAt(e.startsAt), lang)} />
            {dayOpen ? <EtaSummary t={t} late={etaNames("running_late")} onWay={etaNames("on_my_way")} /> : null}
          </>
        ) : null}

        {announcer && announceOpen(e, now) ? (
          <section class="ann-compose" aria-labelledby="announce">
            <h2 id="announce">{t("ประกาศถึงคนที่มา", "Announce to people going")}</h2>
            <AnnounceForm t={t} e={e} action={`${BASE}/${e.id}/announce`} back={`${BASE}/${e.id}`} />
          </section>
        ) : null}
        <AnnouncementList t={t} lang={lang} items={anns} />

        <h2>{t("คำถามละลายพฤติกรรม", "Icebreaker prompt")}</h2>
        {e.activePrompt ? (
          <Notice kind="info">
            {t("กำลังแสดง: ", "Showing now: ")}
            {e.activePrompt}
          </Notice>
        ) : (
          <p class="muted">{t("ยังไม่มีคำถามที่แสดงอยู่", "No prompt is showing")}</p>
        )}
        <form method="post" action={`${BASE}/${e.id}/prompt`}>
          <fieldset class="choices">
            <legend>{t("เลือกคำถาม", "Choose a prompt")}</legend>
            {PROMPTS.map((p) => (
              <label class="toggle">
                <input type="radio" name="preset" value={p.key} />
                <span>
                  {p.th}
                  <small>{p.en}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label={t("หรือพิมพ์เอง (ไม่เกิน 200 ตัวอักษร)", "Or write your own (max 200)")} name="custom" maxlength={200} />
          <div class="row">
            <Button>{t("แสดงคำถาม", "Show prompt")}</Button>
            {e.activePrompt ? (
              <Button kind="ghost" name="clear" value="1">
                {t("ซ่อนคำถาม", "Clear prompt")}
              </Button>
            ) : null}
          </div>
        </form>

        {e.buddyEnabled ? (
          <>
            <h2>{t("Event Buddy", "Event Buddy")}</h2>
            {pairs.length ? (
              <ul>
                {pairs.map((p) => (
                  <li>{p.members.map((m) => nick.get(m) ?? "-").join(" · ")}</li>
                ))}
              </ul>
            ) : (
              <p class="muted">{e.buddyRoundAt ? t("รอบนี้ไม่มีคู่", "No pairs this round") : t("ยังไม่ได้จับคู่ (ระบบจับคู่เอง 48 ชม. ก่อนงาน)", "Not run yet (runs automatically 48h before)")}</p>
            )}
            {!e.buddyRoundAt && e.status === "published" ? (
              <form method="post" action={`${BASE}/${e.id}/buddies`}>
                <Button kind="ghost">{t("จับคู่บัดดี้ตอนนี้", "Run buddy round now")}</Button>
              </form>
            ) : null}
          </>
        ) : null}

        {e.plusOneAllowed || anyPlusOne ? (
          <details>
            <summary>{t("จับคู่ +1 ด้วยตนเอง", "Link a +1 pair manually")}</summary>
            <form method="post" action={`${BASE}/${e.id}/plusone`}>
              {(["a", "b"] as const).map((k) => (
                <Select
                  label={k === "a" ? t("คนที่ 1", "First person") : t("คนที่ 2", "Second person")}
                  name={k}
                  lang={lang}
                  options={confirmedHere.map((r) => ({ value: r.id, th: nick.get(r.accountId)!, en: nick.get(r.accountId)! }))}
                />
              ))}
              {attendingCount > ATTENDEE_PAGE ? (
                <p>
                  <small>{t("เลือกได้จากคนที่ยืนยันแล้วในหน้านี้ของรายชื่อผู้เข้าร่วม", "Choose from the confirmed people on this page of the attendee list.")}</small>
                </p>
              ) : null}
              <Button kind="ghost">{t("จับคู่", "Link")}</Button>
            </form>
          </details>
        ) : null}

        <h2>{t("คนที่ไม่มาตามนัด", "No-shows")}</h2>
        {ended ? (
          <form
            method="post"
            action={`${BASE}/${e.id}/noshows`}
            onsubmit={`return confirm(${JSON.stringify(
              ((n) =>
                t(
                  `บันทึก ${n} คนเป็นผู้ไม่มาตามนัด? แต่ละคนจะได้ใบเตือน 1 ใบ และได้รับแจ้ง (ยกเว้นให้ได้ภายหลัง)`,
                  `Record ${n} ${n === 1 ? "person" : "people"} as no-shows? Each gets 1 strike and a private notice (you can waive one later).`,
                ))(noShowPending),
            )})`}
          >
            <p>
              <small>
                {t(
                  "คนที่ยืนยันแล้วแต่ไม่ได้เช็กอินจะได้ใบเตือน 1 ใบ (หมดอายุใน 90 วัน) และได้รับแจ้งเป็นการส่วนตัว ยกเว้นให้ได้ในตารางด้านบน",
                  "Confirmed attendees who never checked in get 1 strike (expires in 90 days) and a private notice. You can waive one in the table above.",
                )}
              </small>
            </p>
            <Button kind="danger">{t("บันทึกคนที่ไม่มาตามนัด", "Record no-shows")}</Button>
          </form>
        ) : (
          <p class="muted">{t("บันทึกได้หลังกิจกรรมจบ", "Available after the event ends")}</p>
        )}
      </>
    ));
  }),
);

// ------------------------------------------------------------ check-in --

const SCANNER_JS = `(function(){
  var out=document.getElementById('scan-status'),count=document.getElementById('checked-count'),
      video=document.getElementById('scan-video'),btn=document.getElementById('scan-start'),
      msgs=JSON.parse(document.getElementById('scan-msgs').textContent);
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    out.textContent=msgs.unsupported;btn.hidden=true;return;
  }
  var detector=new BarcodeDetector({formats:['qr_code']}),busy=false,last='',lastAt=0;
  function show(text,ok){out.textContent=text;out.className='notice '+(ok?'ok':'error');}
  btn.addEventListener('click',function(){
    btn.hidden=true;
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(stream){
      video.srcObject=stream;video.hidden=false;return video.play();
    }).then(function(){out.textContent=msgs.ready;tick();}).catch(function(){out.textContent=msgs.denied;btn.hidden=false;});
  });
  function tick(){
    if(busy){return setTimeout(tick,250);}
    detector.detect(video).then(function(codes){
      for(var i=0;i<codes.length;i++){
        var raw=codes[i].rawValue||'';
        if(raw.indexOf('${QR_PREFIX}')!==0)continue;
        var token=raw.slice(${QR_PREFIX.length});
        if(token===last&&Date.now()-lastAt<4000)continue;
        last=token;lastAt=Date.now();busy=true;return send(token);
      }
    }).catch(function(){}).then(function(){busy=false;setTimeout(tick,250);});
  }
  function send(token){
    var body=new URLSearchParams();body.set('token',token);
    if(document.getElementById('scan-override').checked)body.set('override','1');
    return fetch(location.pathname,{method:'POST',credentials:'same-origin',
      headers:{'accept':'application/json','content-type':'application/x-www-form-urlencoded'},body:body.toString()})
      .then(function(r){return r.json();})
      .then(function(j){show(j.message,j.ok);if(typeof j.checkedIn==='number')count.textContent=String(j.checkedIn);
        if(navigator.vibrate)navigator.vibrate(j.ok?80:[60,60,60]);})
      .catch(function(){show(msgs.network,false);});
  }
})();`;

/** JSON for a <script type="application/json"> block, safe against </script>. */
function scriptJson(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

adminEvents.get(
  "/:id/checkin",
  withEvent(async (c, e, db) => {
    const v = view(c);
    const { t, lang } = v;
    const [count, [{ expected }]] = await Promise.all([
      checkedInCount(db, e.id),
      db
        .select({ expected: sql<number>`count(*)` })
        .from(registrations)
        .where(and(eq(registrations.eventId, e.id), eq(registrations.status, "confirmed")))
        .limit(1),
    ]);
    const open = checkInOpen(e.startsAt);
    const msgs = {
      unsupported: t(
        "เบราว์เซอร์นี้สแกน QR ไม่ได้ ใช้รหัส 6 ตัวด้านล่างแทน (Chrome บน Android ใช้ได้)",
        "This browser can't scan QR codes. Use the 6-character code below (Chrome on Android works)",
      ),
      ready: t("เล็งกล้องไปที่ QR บนบัตรเข้างาน", "Point the camera at the attendee's pass"),
      denied: t("เปิดกล้องไม่ได้ อนุญาตให้ใช้กล้อง หรือใช้รหัสด้านล่างแทน", "Couldn't open the camera. Allow access or use the code below"),
      network: t("เชื่อมต่อไม่ได้ ลองอีกครั้ง", "Network error. Try again"),
    };
    return page(c, { title: t("จุดเช็กอิน", "Check-in station"), admin: true }, (
      <>
        <p>
          <a href={`${BASE}/${e.id}`}>{t("← กลับไปหน้าจัดการ", "← Back to the event")}</a>
        </p>
        <h1>{t("จุดเช็กอิน", "Check-in station")}</h1>
        <p class="muted">
          {lang === "en" && e.titleEn ? e.titleEn : e.title} · {fmtDate(e.startsAt, lang)}
        </p>
        {e.status !== "published" ? <Notice kind="error">{t("กิจกรรมนี้ไม่ได้เผยแพร่อยู่", "This event isn't published")}</Notice> : null}
        {open ? null : (
          <Notice kind="warn">
            {t(
              "ตอนนี้อยู่นอกช่วงเช็กอิน (30 นาทีก่อนเริ่ม ถึง 60 นาทีหลังเริ่ม) ถ้าจำเป็นให้ติ๊ก 'ข้ามช่วงเวลา' ระบบจะบันทึกไว้",
              "Outside the check-in window (30 min before to 60 min after the start). Tick 'override' if you must; it is logged",
            )}
          </Notice>
        )}
        <div class="stats">
          <div class="stat">
            <div class="stat-v">
              <span id="checked-count">{count}</span> / {Number(expected)}
            </div>
            <div class="stat-l">{t("เช็กอินแล้ว", "Checked in")}</div>
          </div>
        </div>
        <Card>
          <h2>{t("สแกนบัตรเข้างาน", "Scan a pass")}</h2>
          <div id="scan-status" class="notice info" role="status" aria-live="polite">
            {t("กดปุ่มเพื่อเปิดกล้อง", "Tap the button to open the camera")}
          </div>
          <video id="scan-video" playsinline muted hidden style="width:100%;max-width:420px;border-radius:12px;background:#000"></video>
          <div class="row">
            <button type="button" id="scan-start" class="btn primary">
              {t("เปิดกล้อง", "Start camera")}
            </button>
          </div>
          <label class="toggle">
            <input type="checkbox" id="scan-override" />
            <span>{t("ข้ามช่วงเวลาเช็กอิน (บันทึกไว้)", "Override the check-in window (logged)")}</span>
          </label>
        </Card>
        <Card>
          <h2>{t("พิมพ์รหัส 6 ตัว", "Enter the 6-character code")}</h2>
          <form method="post" action={`${BASE}/${e.id}/checkin`}>
            <Field
              label={t("รหัสใต้ QR บนบัตรของผู้เข้าร่วม", "Code under the QR on the attendee's pass")}
              name="code"
              required
              maxlength={6}
              pattern="[A-Za-z0-9_\-]{6}"
              autocomplete="off"
            />
            <Toggle name="override" label={t("ข้ามช่วงเวลาเช็กอิน (บันทึกไว้)", "Override the check-in window (logged)")} />
            <Button>{t("เช็กอิน", "Check in")}</Button>
          </form>
        </Card>
        <script type="application/json" id="scan-msgs" dangerouslySetInnerHTML={{ __html: scriptJson(msgs) }} />
        <script dangerouslySetInnerHTML={{ __html: SCANNER_JS }} />
      </>
    ));
  }),
);

adminEvents.post(
  "/:id/checkin",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const a = me(c);
    const json = wantsJson(c);
    const body = await c.req.parseBody();
    let token = str(body.token);
    if (token.startsWith(QR_PREFIX)) token = token.slice(QR_PREFIX.length);
    const code = str(body.code).toUpperCase();
    const override = str(body.override) === "1";

    const fail = async (status: 400 | 403 | 404 | 409, msg: string) => {
      if (json) return c.json({ ok: false, message: msg, checkedIn: await checkedInCount(db, e.id) }, status);
      return refuse(c, e, msg, status);
    };

    if (e.status !== "published") return fail(409, t("กิจกรรมนี้ไม่ได้เผยแพร่อยู่", "This event isn't published"));

    let reg: typeof registrations.$inferSelect | undefined;
    let method: "scan" | "manual";
    if (token) {
      method = "scan";
      if (token.length > 200) return fail(400, t("บัตรไม่ถูกต้อง", "Invalid pass"));
      [reg] = await db
        .select()
        .from(registrations)
        .where(and(eq(registrations.eventId, e.id), eq(registrations.passToken, token)))
        .limit(1);
      if (!reg) return fail(404, t("ไม่พบบัตรนี้ในกิจกรรมนี้", "This pass isn't for this event"));
    } else if (/^[A-Z0-9_-]{6}$/.test(code)) {
      method = "manual";
      const found = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, e.id),
            eq(registrations.status, "confirmed"),
            sql`upper(left(${registrations.passToken}, 6)) = ${code}`,
          ),
        )
        .limit(2);
      if (found.length === 0) return fail(404, t("ไม่พบรหัสนี้ในกิจกรรมนี้", "No confirmed attendee has this code"));
      if (found.length > 1) return fail(409, t("รหัสนี้ตรงกับมากกว่า 1 คน สแกน QR แทนนะ", "This code matches more than one person. Please scan the QR instead"));
      reg = found[0];
    } else {
      return fail(400, t("ใส่รหัส 6 ตัวหรือสแกน QR", "Enter the 6-character code or scan the QR"));
    }

    const [prof] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, reg.accountId)).limit(1);
    const nickname = prof?.nickname ?? "";

    if (reg.status !== "confirmed") return fail(409, t(`${nickname} ยังไม่ได้ยืนยันที่นั่ง`, `${nickname} doesn't have a confirmed seat`));

    if (reg.checkedInAt) {
      const msg = t(`${nickname} เช็กอินแล้ว`, `${nickname} is already checked in`);
      if (json) return c.json({ ok: true, already: true, message: msg, nickname, groupNo: reg.groupNo, checkedIn: await checkedInCount(db, e.id) });
      return c.redirect(`${BASE}/${e.id}/checkin?notice=checked_in`);
    }

    const now = new Date();
    if (!checkInOpen(e.startsAt, now) && !override) {
      return fail(403, t("อยู่นอกช่วงเวลาเช็กอิน", "Outside the check-in window"));
    }

    // Late arrival after groups are out: smallest group, ties → lowest number,
    // never a group with someone they blocked or who blocked them (PRD §8.1).
    // If every group has one, they stay ungrouped and staff seat them by hand.
    let groupNo: number | null = null;
    if (e.groupsPublishedAt) {
      const [seated, blockRows] = await Promise.all([
        checkedInRegistrations(db, e.id).then((rows) => rows.filter((r) => r.groupNo != null)),
        db
          .select({ blocker: blocks.blocker, blocked: blocks.blocked })
          .from(blocks)
          .where(or(eq(blocks.blocker, reg.accountId), eq(blocks.blocked, reg.accountId)))
          .limit(1000),
      ]);
      const avoid = new Set(blockRows.map((b) => (b.blocker === reg!.accountId ? b.blocked : b.blocker)));
      const groups = new Map<number, { n: number; clash: boolean }>();
      for (const row of seated) {
        const g = groups.get(Number(row.groupNo)) ?? { n: 0, clash: false };
        g.n += 1;
        if (avoid.has(row.accountId)) g.clash = true;
        groups.set(Number(row.groupNo), g);
      }
      const best = [...groups]
        .filter(([, g]) => !g.clash)
        .sort(([ga, a], [gb, b]) => a.n - b.n || ga - gb)[0];
      groupNo = best ? best[0] : null;
    }

    const queries: Parameters<typeof batch>[1] = [
      db
        .update(registrations)
        .set({ checkedInAt: now, checkedInBy: a.id, checkInMethod: method, ...(groupNo !== null ? { groupNo } : {}) })
        .where(and(eq(registrations.id, reg.id), isNull(registrations.checkedInAt))),
      audit(db, a.id, "event.checkin", { type: "registration", id: reg.id }, { eventId: e.id, method, override: override && !checkInOpen(e.startsAt, now), groupNo }),
    ];
    if (groupNo !== null) {
      queries.push(notify(db, reg.accountId, "group", `คุณนั่งโต๊ะ ${groupNo}`, `You're in group ${groupNo}`, `/events/${e.id}`));
    }
    await batch(c.env, queries);

    const msg = t(`เช็กอิน ${nickname} แล้ว`, `${nickname} checked in`) + (groupNo !== null ? t(` · โต๊ะ ${groupNo}`, ` · group ${groupNo}`) : "");
    if (json) return c.json({ ok: true, already: false, message: msg, nickname, groupNo, checkedIn: await checkedInCount(db, e.id) });
    return c.redirect(`${BASE}/${e.id}/checkin?notice=checked_in`);
  }),
);

// -------------------------------------------------------------- groups --

/**
 * Hard rule (PRD §8.1): blocked pairs are never seated together. The shared
 * clearinghouse avoids it greedily but can still leave one when tables are
 * nearly full, so repair here: swap one of the pair with a solo attendee from
 * another table when that creates no new blocked pair. Table sizes and +1
 * pairs are untouched. Returns the number of conflicts left (0 normally).
 */
export function separateBlocked(groups: string[][], blocked: Map<string, Set<string>>, keepTogether: [string, string][]): number {
  const paired = new Set(keepTogether.flat());
  const clash = (a: string, b: string) => !!blocked.get(a)?.has(b) || !!blocked.get(b)?.has(a);
  const clean = (members: string[], who: string, without: string) => members.every((m) => m === without || m === who || !clash(who, m));
  const conflicts = () => {
    let n = 0;
    for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (clash(g[i], g[j])) n++;
    return n;
  };
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    outer: for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      for (const a of g) {
        const b = g.find((x) => x !== a && clash(a, x));
        if (!b) continue;
        for (const mover of [b, a]) {
          if (paired.has(mover)) continue;
          for (let hi = 0; hi < groups.length; hi++) {
            if (hi === gi) continue;
            for (const x of groups[hi]) {
              if (paired.has(x)) continue;
              if (!clean(groups[hi], mover, x) || !clean(g, x, mover)) continue;
              groups[hi][groups[hi].indexOf(x)] = mover;
              g[g.indexOf(mover)] = x;
              moved = true;
              break outer;
            }
          }
        }
      }
    }
    if (!moved) break;
  }
  return conflicts();
}


adminEvents.post(
  "/:id/groups/suggest",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const checked = await checkedInRegistrations(db, e.id);
    if (checked.length === 0) return refuse(c, e, t("ยังไม่มีใครเช็กอิน", "Nobody has checked in yet"), 409);

    const byAccount = new Map(checked.map((r) => [r.accountId, r]));
    const keepTogether: [string, string][] = [];
    for (const r of checked) {
      const other = r.plusOneWith ? byAccount.get(r.plusOneWith) : undefined;
      if (other && other.plusOneWith === r.accountId && r.accountId < other.accountId) keepTogether.push([r.accountId, other.accountId]);
    }
    // Profiles in slices, so no single query carries more ids than it can.
    const attendees = [];
    const now = new Date();
    for (const part of chunks(checked.map((r) => r.accountId), KEYSET_CHUNK)) attendees.push(...(await loadAttendees(db, part, now, e.id)));
    const result = suggestGroups(attendees, { seed: e.id, minSize: e.groupMin, maxSize: e.groupMax, keepTogether, romance: e.tags.includes(OPEN_TO_MORE_TAG) });
    const blockedMap = new Map(attendees.map((x) => [x.accountId, new Set(x.blocked)]));
    const blockedLeft = separateBlocked(result.groups, blockedMap, keepTogether);

    const queries: Parameters<typeof batchAll>[1] = [];
    // Clear old assignments (including anyone no longer checked in), then write 1..n.
    queries.push(db.update(registrations).set({ groupNo: null }).where(eq(registrations.eventId, e.id)));
    const placed = new Set<string>();
    const seats: [string, number][] = [];
    result.groups.forEach((members, i) => {
      for (const m of members) {
        const r = byAccount.get(m);
        if (!r) continue;
        placed.add(m);
        seats.push([r.id, i + 1]);
      }
    });
    // One update per WRITE_CHUNK people, each setting every seat in it.
    for (const part of chunks(seats)) {
      queries.push(
        db
          .update(registrations)
          .set({ groupNo: sql`case ${registrations.id} ${sql.join(part.map(([id, g]) => sql`when ${id} then ${g}::int`), sql` `)} end` })
          .where(inArray(registrations.id, part.map(([id]) => id))),
      );
    }
    // Suggested groups are a draft until the host publishes them again.
    queries.push(db.update(events).set({ groupsPublishedAt: null }).where(eq(events.id, e.id)));
    const m = result.metrics;
    queries.push(
      audit(db, me(c).id, "event.groups_suggest", { type: "event", id: e.id }, {
        groups: result.groups.length,
        attendees: checked.length,
        unplaced: checked.length - placed.size,
        blockingSwaps: m.blockingSwaps,
        isolated: m.isolated,
        blockedConflicts: blockedLeft,
      }),
    );
    await batchAll(c.env, queries);
    return c.redirect(
      `${BASE}/${e.id}?notice=groups_suggested&swaps=${m.blockingSwaps}&isolated=${m.isolated}&blocked=${blockedLeft}#groups`,
    );
  }),
);

adminEvents.post(
  "/:id/groups/move",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const body = await c.req.parseBody();
    const regId = str(body.registrationId);
    const rawGroup = str(body.groupNo);
    const groupNo = rawGroup === "" ? null : intIn(rawGroup, 1, 99);
    if (rawGroup !== "" && groupNo === null) return refuse(c, e, t("เลขโต๊ะต้องอยู่ระหว่าง 1 ถึง 99", "Table number must be 1 to 99"));
    const [reg] = await db
      .select({
        id: registrations.id,
        accountId: registrations.accountId,
        groupNo: registrations.groupNo,
        status: registrations.status,
        checkedInAt: registrations.checkedInAt,
      })
      .from(registrations)
      .where(and(eq(registrations.id, regId), eq(registrations.eventId, e.id)))
      .limit(1);
    if (!reg || reg.status !== "confirmed" || !reg.checkedInAt) return refuse(c, e, t("ย้ายได้เฉพาะคนที่เช็กอินแล้ว", "Only checked-in attendees can be moved"), 404);
    // Hard rule (PRD §8.1): blocked pairs are never seated together, by hand
    // either. The refusal doesn't say who, or which way the block goes.
    if (groupNo !== null && groupNo !== reg.groupNo) {
      const mates = await db
        .select({ accountId: registrations.accountId })
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, e.id),
            eq(registrations.status, "confirmed"),
            isNotNull(registrations.checkedInAt),
            eq(registrations.groupNo, groupNo),
            ne(registrations.id, reg.id),
          ),
        )
        .limit(500);
      const clash = await blockedAmong(db, reg.accountId, mates.map((m) => m.accountId));
      if (clash.size) {
        return refuse(c, e, t("ย้ายไปโต๊ะนี้ไม่ได้ เลือกโต๊ะอื่น", "This person can't be seated at that table. Choose another one"), 409);
      }
    }
    await batch(c.env, [
      db.update(registrations).set({ groupNo }).where(eq(registrations.id, reg.id)),
      audit(db, me(c).id, "event.group_move", { type: "registration", id: reg.id }, { eventId: e.id, from: reg.groupNo, to: groupNo }),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=saved#groups`);
  }),
);

adminEvents.post(
  "/:id/groups/publish",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const grouped = (await checkedInRegistrations(db, e.id)).filter((r) => r.groupNo != null);
    if (grouped.length === 0) return refuse(c, e, t("ยังไม่มีโต๊ะ กด 'แนะนำโต๊ะ' ก่อน", "No groups yet. Suggest groups first"), 409);
    await batchAll(c.env, [
      db.update(events).set({ groupsPublishedAt: new Date() }).where(eq(events.id, e.id)),
      audit(db, me(c).id, "event.groups_publish", { type: "event", id: e.id }, { notified: grouped.length }),
      ...notifyMany(
        db,
        grouped.map((r) => ({ accountId: r.accountId, th: `โต๊ะของคุณ: โต๊ะ ${r.groupNo}`, en: `Your group: group ${r.groupNo}` })),
        "group",
        `/events/${e.id}`,
      ),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=groups_published#groups`);
  }),
);

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
  }),
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
  }),
);

adminEvents.post(
  "/:id/strikes/:accountId/waive",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const accountId = c.req.param("accountId") ?? "";
    const reason = str((await c.req.parseBody()).reason);
    if (!reason || reason.length > 200) return refuse(c, e, t("ระบุเหตุผล (ไม่เกิน 200 ตัวอักษร)", "Give a reason (max 200 characters)"));
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
  }),
);
