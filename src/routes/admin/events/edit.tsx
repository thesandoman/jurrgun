/**
 * Staff events, edit part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { batch, getDb } from "../../../db";
import { canBeWomenOnly, OPEN_TO_MORE_TAG, partnerEventTags, seatAvailable, WOMEN_ONLY_TAG } from "../../../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, VISITBANGKOK_ROUTES, label, values, districtsAZ } from "../../../lib/constants";
import { newId, randomToken } from "../../../lib/crypto";
import { batchAll } from "../../../lib/bulk";
import { audit, notify, notifyMany } from "../../../lib/records";
import { accounts, events, partnerOrgs, profiles, registrations, type Account, type Event } from "../../../schema";
import { refreshWaitlist, seatState } from "../../../services/events";
import { cancelWrites } from "../../../services/announcements";
import { checkVenueExtras } from "../../../domain/hosting";
import { STATIONS } from "../../../content/stations";
import { VenueFields } from "../../../ui/day-of";
import { deleteObject, getObject, getObjectUrl, putObject } from "../../../storage";
import { checkEventRules, effectiveAgeMin } from "../../../domain/event-rules";
import { emptyEntryRules, EntryRuleFields, entryRulesFromBody, entryRulesFromEvent, type EntryRuleDraft } from "../../../ui/entry-rules";
import {
  Button,
  Card,
  Choices,
  Field,
  LinkButton,
  list,
  Notice,
  page,
  Select,
  str,
  Tag,
  TextArea,
  Toggle,
  view,
  type View,
} from "../../../ui/kit";
import { adminEvents } from "./app";
import {
  BASE,
  ORGANISER_MAX_CAPACITY,
  REACHABLE,
  canCreate,
  forbidden,
  fromBkkInput,
  me,
  reachableRegistrations,
  refuse,
  toBkkInput,
  withEvent,
} from "./shared";
import type { Ctx, Db } from "./shared";

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

export const intIn = (s: string, min: number, max: number): number | null => {
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
export const PROMPTS: { key: string; th: string; en: string }[] = [
  { key: "river", th: "หาคนที่อยู่อีกฝั่งแม่น้ำ", en: "Find someone who lives across the river from you" },
  { key: "revisit", th: "เลือกที่หนึ่งในกรุงเทพฯ ที่ทุกคนในโต๊ะอยากกลับไปอีก", en: "Pick one place in Bangkok everyone in your group would revisit" },
  { key: "fix", th: "เลือกปัญหาเมือง 1 อย่างที่โต๊ะคุณจะแก้ก่อน", en: "Choose one city problem your table would fix first" },
  { key: "food", th: "แชร์ร้านอาหารลับ ๆ ในย่านของคุณ 1 ร้าน", en: "Share one hidden food spot from your neighbourhood" },
  { key: "route", th: "วางแผนเส้นทางเดินเล่น 1 ชั่วโมงที่โต๊ะคุณอยากไปด้วยกัน", en: "Plan a one-hour walk your table would do together" },
];

export const QR_PREFIX = "bkksocial:pass:";

export function registrationStatusLabel(v: View, s: string): string {
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
    }, { roster: true }),
  );
}

/** Checked-in count for the station and JSON responses. */
export async function checkedInCount(db: Db, eventId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, "confirmed"), isNotNull(registrations.checkedInAt)))
    .limit(1);
  return Number(row?.n ?? 0);
}

