/**
 * Member event flows (PRD §7–§10, §13.1, §24):
 *
 *   GET  /events                     Discover — "What can I do in Bangkok this week?"
 *                                    (also sends a pending bkk_invite cookie back to /invite/:token)
 *   POST /events/quiz-hint/dismiss   Hide the "Find your Bangkok Type" card (cookie)
 *   GET  /events/:id                 Event detail, my registration state, buddy box, invite box
 *   GET  /events/:id/cover           Cover image (signed-URL redirect; bytes only locally)
 *   POST /events/:id/invite          Create or reuse my +1 invite link (PRD §8.2)
 *   POST /events/:id/rsvp            RSVP (age, strikes, single-upcoming, seats, quota, +1, buddy)
 *   POST /events/:id/cancel          Cancel (late cancel = 1 strike)
 *   POST /events/:id/offer           Accept / decline a waitlist offer
 *   GET  /events/:id/live            Onsite page after check-in
 *   POST /events/:id/signal          Social signal (§9.2)
 *   GET  /events/:id/feedback        Post-event feedback form
 *   POST /events/:id/feedback        Save (upsert) feedback
 *   GET  /me/events                  My events + private strike standing
 *   GET  /me/events/:id/pass         Personal event pass (QR + short code)
 *
 * Every route is member-only. Middleware is attached per route (never with
 * `use("*")`): this sub-app is mounted at "/" and must not touch other areas.
 */
import { TableIntroPrompt } from "../ui/table-intro";
import { OfflineSavedNote, SaveNext } from "../ui/offline-next";
import { IcebreakerCard } from "../ui/icebreakers";
import { icebreakersFor, icebreakerWindow } from "../content/icebreakers";
import { segmentOf, type Segment } from "../domain/segment";
import { DEFAULT_RHYTHM, isPaused, MAX_UPCOMING, OPEN_TO_MORE_TAG, romanceEventOk, WOMEN_ONLY_TAG, womenOnlyEventOk, womenOnlyEventVisible } from "../domain/rules";
import { weekKey } from "../domain/buddy";
import { cleanBio } from "../content/profile";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import { type AnyColumn, and, asc, count, eq, gt, gte, ilike, inArray, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { batch, getDb } from "../db";
import {
  ageOn,
  isLateCancel,
  romanceEligible,
  seatAvailable,
  seatsOverbooked,
  strikeExpiry,
  strikeStanding,
  USERNAME_RE,
  normalizeUsername,
  withinRange,
  peopleWindow,
  PEOPLE_WINDOW_HOURS,
  checkInOpen,
  type StrikeStanding,
} from "../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, SIGNALS, VISITBANGKOK_ROUTES, label, values, districtsAZ } from "../lib/constants";
import { newId, randomToken } from "../lib/crypto";
import type { AppEnv, CurrentUser } from "../lib/env";
import { fmtDate, fmtParts, type Lang, type T } from "../lib/i18n";
import { eventPlace } from "../lib/places";
import { qrSvg, shortCode } from "../lib/qr";
import { seeAgain } from "../services/see-again";
import { SeeAgainCard } from "../ui/see-again";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import {
  accounts,
  blocks,
  buddyPairs,
  events,
  feedback,
  invites,
  partnerOrgs,
  profiles,
  registrations,
  strikes,
  vibes,
  type Event,
  type Registration,
  weeklyPlans,
  type Profile,
} from "../schema";
import { refreshWaitlist, runBuddyRound, seatState, SEAT_STATUSES } from "../services/events";
import { getObject, getObjectUrl } from "../storage";
import { ResidentTag, showsResidentBadge, TypeSpark, vibesFor } from "./people";
import {
  Button,
  Card,
  Choices,
  Empty,
  Field,
  LinkButton,
  MoreInfo,
  Notice,
  page,
  Select,
  str,
  Tag,
  TextArea,
  Toggle,
  view,
  ViewSwitch,
  type View,
  FactIcon,
} from "../ui/kit";
import { FullDiscover, type MapChip, type MapPoint, type TickerItem } from "../ui/discover-map";
import { bangkokWeather, heatBand, pm25Band, type Weather } from "../services/weather";
import { canView } from "../domain/hosting";
import { canJoin as canJoinTable, tableVisible } from "../domain/regular-tables";
import { blockedAmong, getTable, hostTable, memberIds, rejoinAfterFor, seatedFor, standing } from "../services/regular-tables";

export const eventRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;
type Db = ReturnType<typeof getDb>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BKK_OFFSET = 7 * HOUR;
/** Registration statuses that hold (or wait for) a place. */
const ACTIVE = ["confirmed", "offered", "waitlisted"] as const;

// ------------------------------------------------------------- helpers --

function me(c: Ctx): CurrentUser & { profile: NonNullable<CurrentUser["profile"]> } {
  return c.var.user! as CurrentUser & { profile: NonNullable<CurrentUser["profile"]> };
}

function title(e: Event, lang: Lang): string {
  return lang === "en" && e.titleEn ? e.titleEn : e.title;
}

function description(e: Event, lang: Lang): string {
  return lang === "en" && e.descriptionEn ? e.descriptionEn : e.description;
}

/** 00:00 Bangkok time of the Bangkok calendar day containing `d`. */
function bkkMidnight(d: Date): Date {
  const shifted = d.getTime() + BKK_OFFSET;
  return new Date(shifted - (shifted % DAY) - BKK_OFFSET);
}

/** [from, to) window for the "when" filter, or null for "all". */
export function whenWindow(when: string, now: Date = new Date()): [Date, Date] | null {
  const today = bkkMidnight(now);
  if (when === "today") return [today, new Date(today.getTime() + DAY)];
  if (when === "week") return [today, new Date(today.getTime() + 7 * DAY)];
  if (when === "weekend") {
    const dow = new Date(now.getTime() + BKK_OFFSET).getUTCDay(); // 0 Sun … 6 Sat
    const sat = dow === 6 ? today.getTime() : dow === 0 ? today.getTime() - DAY : today.getTime() + (6 - dow) * DAY;
    return [new Date(sat), new Date(sat + 2 * DAY)];
  }
  return null;
}

export function ageText(e: Event, t: T): string {
  return e.ageMin <= 18 && e.ageMax >= 99 ? t("ผู้ใหญ่ทุกวัย", "All adults") : `${e.ageMin}-${e.ageMax} ${t("ปี", "yrs")}`;
}

export function costText(e: Event, t: T): string {
  return e.costThb > 0 ? `฿${e.costThb}` : t("ฟรี", "Free");
}

function langsText(e: Event, lang: Lang): string {
  return e.languages.map((l) => label(LANGUAGES, l, lang)).join(" · ");
}

function questLabel(e: Event, lang: Lang): string | null {
  if (!e.visitBangkokRoute) return null;
  const r = VISITBANGKOK_ROUTES.find((x) => x.value === e.visitBangkokRoute);
  return r ? (lang === "en" ? r.en : r.th) : e.visitBangkokRoute;
}

function coverEmoji(e: Event): string {
  const tags = e.tags;
  if (tags.includes("food")) return "🍜";
  if (tags.includes("run")) return "🏃";
  if (tags.includes("walk") || tags.includes("city_quest")) return "🚶";
  if (tags.includes("art")) return "🎨";
  if (tags.includes("board_game")) return "🎲";
  if (tags.includes("volunteer")) return "🤲";
  if (tags.includes("pets")) return "🐶";
  if (tags.includes("language_exchange")) return "💬";
  return "🌆";
}

/** Cookie set by the public invite page so a new member lands back on it after onboarding. */
export const INVITE_COOKIE = "bkk_invite";
/** Invite tokens are randomToken(18): 24 base64url characters. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const QUIZ_HINT_COOKIE = "bkk_quiz_hint";
const FOR_YOU_COOKIE = "bkk_for_you";
/** Laptops: the filter rail starts open, since there is room for it. */
const RAIL_OPEN_JS = `(function(){try{var bar=document.querySelector(".disc-bar"),mark=document.querySelector(".disc-mark");if(!bar)return;
if(matchMedia("(min-width:1024px)").matches){var d=bar.querySelector("details.filters");if(d)d.open=true;return}
if(!mark||!("IntersectionObserver" in window))return;
new IntersectionObserver(function(es){var stuck=!es[0].isIntersecting&&es[0].boundingClientRect.top<0;if(stuck===bar.classList.contains("is-stuck"))return;
var h=bar.offsetHeight;bar.classList.toggle("is-stuck",stuck);bar.style.marginBottom=stuck?(h-bar.offsetHeight+12)+"px":""}).observe(mark)}catch(e){}})()`;

/**
 * A URL a browser can load the event's cover image from, or null for the
 * emoji fallback. Deployed: a short-lived signed URL straight from storage.
 * Locally: a member route that serves the bytes (dev only). No storage
 * binding at all (tests): null.
 */
export async function coverSrc(env: Ctx["env"], e: Pick<Event, "id" | "coverKey">): Promise<string | null> {
  if (!e.coverKey) return null;
  if (env.FILES) {
    try {
      return await getObjectUrl(env, e.coverKey);
    } catch {
      return null;
    }
  }
  return env.BUCKET ? `/events/${e.id}/cover` : null;
}

/** The colours of an event's scene cover, from its category. */
function sceneOf(e: Event): string {
  const tags = e.tags;
  if (tags.includes("food")) return "food";
  if (tags.includes("run") || tags.includes("walk") || tags.includes("pets") || tags.includes("volunteer")) return "park";
  if (tags.includes("city_quest")) return "river";
  if (tags.includes("art")) return "art";
  if (tags.includes("board_game") || tags.includes("language_exchange")) return "play";
  return "city";
}

function DateBlock(props: { d: Date; lang: Lang }) {
  const p = fmtParts(props.d, props.lang);
  return (
    <span class="ev-date">
      <b>{p.day}</b>
      <small>{p.weekday}</small>
    </span>
  );
}

/**
 * A Google Maps directions link to the meeting point: exact coordinates when
 * the event has them (its map link or a VisitBangkok route start), otherwise
 * the venue's name and address. Opens the Maps app on phones.
 */
export function directionsUrl(e: Pick<Event, "mapUrl" | "district" | "visitBangkokRoute" | "venueName" | "venueAddress">): string {
  const place = eventPlace(e);
  const dest =
    place && place.precision !== "area"
      ? `${place.lat},${place.lng}`
      : [e.venueName, e.venueAddress, label(DISTRICTS, e.district, "en"), "Bangkok"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** iCalendar text escaping (RFC 5545 §3.3.11). */
function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** One event as an .ics file: start, end, place, a link back, and a reminder an hour before. */
export function eventIcs(e: Event, lang: Lang, url: string, now = new Date()): string {
  const where = [e.venueName, e.venueAddress, label(DISTRICTS, e.district, lang)].filter(Boolean).join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jurrgun//Event pass//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@jurrgun`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(e.startsAt)}`,
    `DTEND:${icsTime(e.endsAt)}`,
    `SUMMARY:${icsText(title(e, lang))}`,
    `LOCATION:${icsText(where)}`,
    `DESCRIPTION:${icsText(`${lang === "en" ? "Your pass" : "บัตรเข้างาน"}: ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT1H",
    `DESCRIPTION:${icsText(title(e, lang))}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function Cover(props: { e: Event; src?: string | null; lang?: Lang; class?: string }) {
  return (
    <div class={`event-cover scene-${sceneOf(props.e)} ${props.class ?? ""}`.trim()} aria-hidden="true">
      {props.src ? <img src={props.src} alt="" loading="lazy" /> : <span class="scene-badge">{coverEmoji(props.e)}</span>}
      {props.lang ? <DateBlock d={props.e.startsAt} lang={props.lang} /> : null}
    </div>
  );
}

/**
 * Discover remembers its view (map or list) and time filter on this device:
 * a visit that chose them saves them, and a bare /events (the tab bar) goes
 * back to them. The Map link always says view=map, so it never bounces.
 */
const DISCOVER_MEMORY_JS = `(function(){try{var k="bkk-discover",p=new URLSearchParams(location.search);
if(!location.search){var s=localStorage.getItem(k);if(s&&s!=="view=map")location.replace("/events?"+s);return}
if(!p.has("view")&&!p.has("when"))return;var o=new URLSearchParams();o.set("view",p.get("view")==="list"?"list":"map");var w=p.get("when");if(w&&w!=="all")o.set("when",w);
localStorage.setItem(k,o.toString())}catch(e){}})()`;

/** "Free" / "฿250", and the first category, for the line above a title. */
function eyebrow(e: Event, t: T, lang: Lang): string {
  const first = e.tags[0];
  return [first ? label(EVENT_TAGS, first, lang) : null, costText(e, t)].filter(Boolean).join(" · ");
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SpotsTag(props: { e: Event; taken: number; t: T; going?: boolean }) {
  const left = Math.max(0, props.e.capacity - props.taken);
  // Someone already going doesn't need "Full, join the waitlist".
  if (props.going) return <Tag tone="ok">{props.t("✓ คุณได้ที่นั่งแล้ว", "✓ You're in")}</Tag>;
  return left > 0 ? (
    <Tag tone="ok">{props.t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`)}</Tag>
  ) : (
    <Tag tone="warn">{props.t("เต็มแล้ว ต่อคิวสำรองได้", "Full, join the waitlist")}</Tag>
  );
}

/** A row of seats: filled ones taken, open ones left (up to 16 drawn, then "+n"). */
function Seats(props: { capacity: number; taken: number }) {
  const shown = Math.min(props.capacity, 16);
  const filled = Math.min(shown, Math.round((Math.min(props.taken, props.capacity) / Math.max(1, props.capacity)) * shown));
  return (
    <span class="seats" role="img" aria-label={`${props.taken} / ${props.capacity}`}>
      {Array.from({ length: shown }, (_, i) => (
        <i class={i < filled ? "on" : ""} />
      ))}
      {props.capacity > shown ? <small>+{props.capacity - shown}</small> : null}
    </span>
  );
}

function EventCard(props: { e: Event; taken: number; v: View; mine?: string; cover?: string | null; feat?: boolean; pick?: boolean }) {
  const { e, v } = props;
  const { t, lang } = v;
  const quest = questLabel(e, lang);
  return (
    <Card href={`/events/${e.id}`} class={props.feat ? "ev-card feat" : "ev-card"}>
      <Cover e={e} src={props.cover} lang={lang} />
      <div class="ev-body">
        <p class="eyebrow">{eyebrow(e, t, lang)}</p>
        <div class="spread">
          <h3>{title(e, lang)}</h3>
          {props.mine ? <Tag tone="accent">{statusLabel(props.mine, t)}</Tag> : null}
        </div>
        <p class="chips2">
          <span><FactIcon name="time" /> {fmtParts(e.startsAt, lang).time}</span>
          <span><FactIcon name="place" /> {label(DISTRICTS, e.district, lang)}</span>
          <span><FactIcon name="lang" /> {langsText(e, lang)}</span>
        </p>
        <Seats capacity={e.capacity} taken={props.taken} />
        <div class="tags">
          {props.pick ? <Tag tone="ok">⭐ {t("เลือกให้คุณ", "Your pick")}</Tag> : null}
          <SpotsTag e={e} taken={props.taken} t={t} />
          {quest ? <Tag tone="accent">🧭 City Quest</Tag> : null}
          {e.plusOneAllowed ? <Tag>{t("ชวนเพื่อนมาได้ +1", "+1 welcome")}</Tag> : null}
          {e.residentPriority || e.residentQuota > 0 ? <Tag tone="muted">{t("🏙️ สิทธิ์ผู้มีทะเบียนบ้าน กทม.", "🏙️ Resident priority")}</Tag> : null}
        </div>
      </div>
    </Card>
  );
}

function statusLabel(status: string, t: T): string {
  switch (status) {
    case "confirmed":
      return t("ยืนยันแล้ว", "Going");
    case "waitlisted":
      return t("อยู่ในคิวสำรอง", "Waitlisted");
    case "offered":
      return t("มีที่ว่างรอคุณ", "Spot offered");
    case "late_cancelled":
      return t("ยกเลิกกระชั้นชิด", "Late cancel");
    default:
      return t("ยกเลิกแล้ว", "Cancelled");
  }
}

/** The next `n` public events this member may see, with seats taken and covers, for an empty My events. */
async function nextEvents(env: AppEnv["Bindings"], db: Db, profile: Profile, now: Date, n: number) {
  const where = [eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, now)];
  if (!romanceEligible(profile)) where.push(sql`not ${jsonHas(events.tags, OPEN_TO_MORE_TAG)}`);
  if (!womenOnlyEventVisible([WOMEN_ONLY_TAG], profile)) where.push(sql`not ${jsonHas(events.tags, WOMEN_ONLY_TAG)}`);
  const list = await db.select().from(events).where(and(...where)).orderBy(asc(events.startsAt)).limit(n);
  const [taken, coverPairs] = await Promise.all([
    takenCounts(db, list.map((e) => e.id)),
    Promise.all(list.filter((e) => e.coverKey).map(async (e) => [e.id, await coverSrc(env, e)] as const)),
  ]);
  return { list, taken, covers: new Map(coverPairs) };
}

/** Seats held (confirmed + offered) per event, in ONE grouped query. */
async function takenCounts(db: Db, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ eventId: registrations.eventId, n: count() })
    .from(registrations)
    .where(and(inArray(registrations.eventId, ids), inArray(registrations.status, [...SEAT_STATUSES])))
    .groupBy(registrations.eventId)
    .limit(ids.length);
  for (const r of rows) out.set(r.eventId, Number(r.n));
  return out;
}

async function myStrikes(db: Db, accountId: string) {
  return db
    .select({ createdAt: strikes.createdAt, expiresAt: strikes.expiresAt, waivedBy: strikes.waivedBy, reason: strikes.reason })
    .from(strikes)
    .where(eq(strikes.accountId, accountId))
    .limit(100);
}

/** Block pairs between me and any of `others`, both directions. */
async function blockedWith(db: Db, mine: string, others: string[]): Promise<Set<string>> {
  if (others.length === 0) return new Set();
  const rows = await db
    .select({ blocker: blocks.blocker, blocked: blocks.blocked })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blocker, mine), inArray(blocks.blocked, others)),
        and(eq(blocks.blocked, mine), inArray(blocks.blocker, others)),
      ),
    )
    .limit(1000);
  return new Set(rows.map((r) => (r.blocker === mine ? r.blocked : r.blocker)));
}

/**
 * `jsonb array contains value`, tolerant of rows whose array was stored as a
 * JSON *string* (locally, postgres.js JSON-encodes any parameter the server
 * types as jsonb, so drizzle's already-stringified jsonb values land double
 * encoded). The value goes in as text for the same reason. Works on Postgres
 * and CockroachDB.
 */
function jsonHas(col: AnyColumn, value: string) {
  return sql`(case when jsonb_typeof(${col}) = 'string' then (${col} #>> '{}')::jsonb else ${col} end) @> jsonb_build_array(${value}::text)`;
}

// ------------------------------------------------------------ discover --

/** Small tables filter: at most this many seats in the whole event (the host form's default size). */
export const SMALL_TABLE_MAX = 8;

const WHEN_OPTS = [
  { value: "all", th: "ทั้งหมด", en: "Any time" },
  { value: "today", th: "วันนี้", en: "Today" },
  { value: "week", th: "สัปดาห์นี้", en: "This week" },
  { value: "weekend", th: "สุดสัปดาห์นี้", en: "This weekend" },
];

eventRoutes.get("/events", requireMember, async (c) => {
  // Arrived from an invite link before signing up: go back to it, once.
  const pending = getCookie(c, INVITE_COOKIE);
  if (pending) {
    deleteCookie(c, INVITE_COOKIE, { path: "/" });
    if (INVITE_TOKEN_RE.test(pending)) return c.redirect(`/invite/${pending}`);
  }
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const db = getDb(c.env);
  const now = new Date();
  const q = {
    when: c.req.query("when") ?? "all",
    district: c.req.query("district") ?? "",
    tag: c.req.query("tag") ?? "",
    free: c.req.query("free") === "1",
    short: c.req.query("short") === "1",
    small: c.req.query("small") === "1",
    language: c.req.query("language") ?? "",
    intensity: c.req.query("intensity") ?? "",
    plusOne: c.req.query("plusOne") === "1",
    fitsAge: c.req.query("fitsAge") === "1",
    resident: c.req.query("resident") === "1",
    text: (c.req.query("q") ?? "").trim().slice(0, 80),
  };
  const mapView = c.req.query("view") !== "list"; // the map is the default

  // Private events open only through their link; they are never listed.
  const where = [eq(events.status, "published"), eq(events.visibility, "public"), gt(events.endsAt, now)];
  const win = whenWindow(q.when, now);
  if (win) where.push(gte(events.startsAt, win[0]), lt(events.startsAt, win[1]));
  if (values(DISTRICTS).includes(q.district)) where.push(eq(events.district, q.district));
  if (values(EVENT_TAGS).includes(q.tag)) where.push(jsonHas(events.tags, q.tag));
  // Dating events exist only for members with romance mode on (romanceEventOk).
  if (!romanceEligible(user.profile)) where.push(sql`not ${jsonHas(events.tags, OPEN_TO_MORE_TAG)}`);
  // Women-only events are only listed for women and non-binary members (and anyone who hasn't said).
  if (!womenOnlyEventVisible([WOMEN_ONLY_TAG], user.profile)) where.push(sql`not ${jsonHas(events.tags, WOMEN_ONLY_TAG)}`);
  if (q.free) where.push(eq(events.costThb, 0));
  // Short and sweet: 90 minutes or less, for carers and long work days.
  if (q.short) where.push(sql`${events.endsAt} - ${events.startsAt} <= interval '90 minutes'`);
  // Small tables: the whole event is one table, for members who find a big room a lot.
  if (q.small) where.push(lte(events.capacity, SMALL_TABLE_MAX));
  if (values(LANGUAGES).includes(q.language)) where.push(jsonHas(events.languages, q.language));
  if (values(INTENSITY).includes(q.intensity)) where.push(eq(events.intensity, q.intensity));
  if (q.plusOne) where.push(eq(events.plusOneAllowed, true));
  // PRD §7.2: "Bangkok registered resident priority" (waitlist priority or a held quota).
  if (q.resident) where.push(or(eq(events.residentPriority, true), gt(events.residentQuota, 0))!);
  if (q.text) {
    // Text search over title, English title and venue (LIKE wildcards escaped).
    const like = `%${q.text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(events.title, like), ilike(events.titleEn, like), ilike(events.venueName, like))!);
  }
  if (q.fitsAge) {
    const age = ageOn(user.profile.birthDate, now);
    where.push(lte(events.ageMin, age), gte(events.ageMax, age));
  }

  const list = await db.select().from(events).where(and(...where)).orderBy(asc(events.startsAt)).limit(100);
  const ids = list.map((e) => e.id);
  const hintHidden = getCookie(c, QUIZ_HINT_COOKIE) === "hide";
  const [taken, mine, myVibe, coverPairs, weather, [plan]] = await Promise.all([
    takenCounts(db, ids),
    ids.length
      ? db
          .select({ eventId: registrations.eventId, status: registrations.status })
          .from(registrations)
          .where(and(eq(registrations.accountId, user.account.id), inArray(registrations.eventId, ids), inArray(registrations.status, [...ACTIVE])))
          .limit(100)
      : Promise.resolve([] as { eventId: string; status: string }[]),
    hintHidden ? Promise.resolve([{ id: "hidden" }]) : db.select({ id: vibes.accountId }).from(vibes).where(eq(vibes.accountId, user.account.id)).limit(1),
    Promise.all(list.filter((e) => e.coverKey).map(async (e) => [e.id, await coverSrc(c.env, e)] as const)),
    mapView ? bangkokWeather(c.env).catch(() => null) : Promise.resolve(null),
    // This week's plan, if it's been made: its picks get a tag in the list rather than looking like separate events.
    db.select({ picks: weeklyPlans.picks }).from(weeklyPlans).where(and(eq(weeklyPlans.accountId, user.account.id), eq(weeklyPlans.week, weekKey(new Date())))).limit(1),
  ]);
  const picked = new Set(((plan?.picks ?? []) as { kind: string; ref: string }[]).filter((x) => x.kind === "event").map((x) => x.ref));
  const covers = new Map(coverPairs);
  const myStatus = new Map(mine.map((r) => [r.eventId, r.status]));
  const filtered = !!(q.when !== "all" || q.district || q.tag || q.free || q.short || q.small || q.language || q.intensity || q.plusOne || q.fitsAge || q.resident || q.text);
  // The same filters, in list or map view.
  const params = new URLSearchParams(c.req.query());
  params.delete("view");
  params.delete("notice");
  // Explicit view=map, so a bare /events can restore the last choice (DISCOVER_MEMORY_JS).
  params.set("view", "map");
  const mapHref = `/events?${params}`;
  params.set("view", "list");
  const listHref = `/events?${params}`;
  const placed = mapView ? list.map((e) => ({ e, place: eventPlace(e) })) : [];
  const unplaced = placed.filter((x) => !x.place).length;

  const filtersForm = (
    <form method="get" action="/events" class="filters">
      {mapView ? null : <input type="hidden" name="view" value="list" />}
      {q.text ? <input type="hidden" name="q" value={q.text} /> : null}
      <Select label={t("เมื่อไหร่", "When")} name="when" options={WHEN_OPTS} value={q.when} lang={lang} />
      <Select label={t("เขต", "District")} name="district" options={districtsAZ(lang)} value={q.district} lang={lang} blank={t("ทุกเขต", "Any district")} />
      <Select label={t("หมวด", "Category")} name="tag" options={EVENT_TAGS.filter((x) => (x.value !== OPEN_TO_MORE_TAG || romanceEligible(user.profile)) && (x.value !== WOMEN_ONLY_TAG || womenOnlyEventVisible([WOMEN_ONLY_TAG], user.profile)))} value={q.tag} lang={lang} blank={t("ทุกหมวด", "Any category")} />
      <Select label={t("ภาษา", "Language")} name="language" options={LANGUAGES} value={q.language} lang={lang} blank={t("ทุกภาษา", "Any language")} />
      <Select label={t("ความคึกคัก", "Social intensity")} name="intensity" options={INTENSITY} value={q.intensity} lang={lang} blank={t("ทุกแบบ", "Any")} />
      <Toggle name="free" label={t("ฟรีเท่านั้น", "Free only")} checked={q.free} />
      <Toggle name="short" label={t("สั้น ๆ ไม่เกิน 90 นาที", "Short: 90 minutes or less")} checked={q.short} />
      <Toggle name="small" label={t(`โต๊ะเล็ก ไม่เกิน ${SMALL_TABLE_MAX} คน`, `Small tables: ${SMALL_TABLE_MAX} people or fewer`)} checked={q.small} />
      <Toggle name="plusOne" label={t("ชวนเพื่อนมาได้ (+1)", "Can bring a friend (+1)")} checked={q.plusOne} />
      <Toggle name="fitsAge" label={t("เหมาะกับช่วงอายุของฉัน", "Fits my age")} checked={q.fitsAge} />
      <Toggle name="resident" label={t("กิจกรรมที่ให้สิทธิ์ผู้มีทะเบียนบ้าน กทม.", "Resident priority events")} checked={q.resident} />
      <div class="row">
        <Button>{t("ดูกิจกรรม", "Show events")}</Button>
        {filtered ? <LinkButton href={mapView ? "/events" : "/events?view=list"} kind="ghost">{t("ล้างตัวกรอง", "Clear")}</LinkButton> : null}
      </div>
    </form>
  );
  const unplacedNote =
    mapView && unplaced > 0 ? (
      <p class="muted">
        {t(`มี ${unplaced} กิจกรรมที่ยังไม่ได้ปักหมุดบนแผนที่ แต่ดูได้ในรายการนี้`, `${unplaced} event${unplaced === 1 ? " isn't" : "s aren't"} on the map yet, but ${unplaced === 1 ? "it's" : "they're"} in this list`)}
      </p>
    ) : null;
  // The events, with `extra` (the For you and quiz cards) after the third one, so events come first.
  const cardList = (extra?: Child) => {
    if (list.length === 0)
      return (
        <>
          <Empty>{t("ยังไม่มีกิจกรรมที่ตรงกับตัวกรองนี้ แวะมาดูใหม่นะ", "No events match these filters yet. Check back soon.")}</Empty>
          {extra}
        </>
      );
    const items = list.map((e) => (
      <div class="ev-item" data-s={`${title(e, lang)} ${e.venueName} ${label(DISTRICTS, e.district, lang)}`.toLowerCase()}>
        <EventCard e={e} taken={taken.get(e.id) ?? 0} v={v} mine={myStatus.get(e.id)} cover={covers.get(e.id)} pick={picked.has(e.id)} />
      </div>
    ));
    return (
      <>
        {items.slice(0, 3)}
        {extra}
        {items.slice(3)}
      </>
    );
  };
  const cards = cardList();
  const filterCount = [q.district, q.tag, q.free, q.short, q.small, q.language, q.intensity, q.plusOne, q.fitsAge, q.resident, q.text].filter(Boolean).length;
  const forYouHidden = getCookie(c, FOR_YOU_COOKIE) === "hide";
  const quizHint = myVibe.length === 0 ? quizHintCard(t) : null;

  if (mapView) {
    const week = list.filter((e) => e.startsAt.getTime() < now.getTime() + 7 * 86_400_000);
    const open = week.filter((e) => (taken.get(e.id) ?? 0) < e.capacity).length;
    const status = week.length
      ? {
          ok: true,
          title: t(`✓ ${week.length} กิจกรรมสัปดาห์นี้ · ${open} ยังมีที่ว่าง`, `✓ ${week.length} event${week.length === 1 ? "" : "s"} this week · ${open} with spots left`),
          sub: t(`นับจากฐานข้อมูลตอนเปิดหน้านี้ · ${fmtTime(now, lang)}`, `Counted from the database when this page loaded · ${fmtTime(now, lang)}`),
        }
      : {
          ok: false,
          title: t("ยังไม่มีกิจกรรมสัปดาห์นี้ · แตะดูทั้งหมด", "No events this week yet · tap to see all"),
          sub: t(`อัปเดตตอนเปิดหน้านี้ · ${fmtTime(now, lang)}`, `Updated when this page loaded · ${fmtTime(now, lang)}`),
        };
    return page(
      c,
      { title: t("ค้นหากิจกรรม", "Discover"), tab: "events", fullscreen: true },
      <>
      <script dangerouslySetInnerHTML={{ __html: DISCOVER_MEMORY_JS }} />
      <FullDiscover
        t={t}
        lang={lang}
        points={placed.flatMap(({ e, place }) => (place ? [mapPoint(e, place, taken.get(e.id) ?? 0, myStatus.get(e.id), v, covers.get(e.id))] : []))}
        chips={mapChips(list, lang)}
        ticker={tickerItems({ v, list, taken, weather, hasVibe: myVibe.length > 0, newcomer: user.profile.newcomer })}
        status={status}
        search={q.text}
        filtered={filtered}
        filters={filtersForm}
        list={
          <>
            {unplacedNote}
            {cards}
          </>
        }
        count={list.length}
        listHref={listHref}
        langHref={`/lang/${lang === "th" ? "en" : "th"}?back=${encodeURIComponent(mapHref)}`}
        hasQuests={list.some((e) => e.tags.includes("city_quest"))}
      />
      </>,
    );
  }

  return page(
    c,
    { title: t("ค้นหากิจกรรม", "Discover"), tab: "events" },
    <>
      <script dangerouslySetInnerHTML={{ __html: DISCOVER_MEMORY_JS }} />
      <p class="eyebrow">{t("กลุ่มเล็ก สถานที่จริง", "Small groups, real places")}</p>
      <h1>{t("สัปดาห์นี้ในกรุงเทพฯ ทำอะไรดี?", "What can I do in Bangkok this week?")}</h1>
      <a href="/plan" class="plan-line">
        <span aria-hidden="true">🗓️</span> {t("แผนสัปดาห์นี้: เราเลือกให้ 2 อย่าง", "This week's plan: 2 picks made for you")} <span aria-hidden="true">›</span>
      </a>
      <div class="disc">
        {/* Phones: one sticky bar above the cards. Laptops: a sticky rail with the filters open. */}
        <div class="disc-mark" aria-hidden="true" />
        <div class="disc-bar">
          <nav class="seg" aria-label={t("เมื่อไหร่", "When")}>
            {WHEN_OPTS.map((o) => {
              const p = new URLSearchParams(params);
              if (o.value === "all") p.delete("when");
              else p.set("when", o.value);
              return (
                <a href={`/events?${p}`} class={q.when === o.value ? "on" : undefined} aria-current={q.when === o.value ? "page" : undefined}>
                  {lang === "en" ? o.en : o.th}
                </a>
              );
            })}
          </nav>
          <div class="disc-tools">
            <details class="filters" open={filtered}>
              <summary>
                <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 5h18l-7 8v6l-4-2v-4z" />
                </svg>
                <span class="fl">{t("ตัวกรอง", "Filters")}</span>
                {filterCount > 0 ? <span class="count">{filterCount}</span> : null}
              </summary>
              {filtersForm}
            </details>
            <ViewSwitch t={t} on="cards" mapHref={mapHref} cardsHref={listHref} />
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: RAIL_OPEN_JS }} />
        <h2 class="sr-only">{t("รายการกิจกรรม", "Event list")}</h2>
        <section id="discover-list" class="discover-list" aria-label={t("รายการกิจกรรม", "Event list")}>
          {cardList(
            <>
              {forYouHidden ? null : (
                <ForYou v={v} segment={segmentOf(user.profile)} newcomer={cleanBio(user.profile.bio).newcomerAsked ? user.profile.newcomer : undefined} dismissable />
              )}
              {quizHint}
            </>,
          )}
        </section>
      </div>
    </>,
  );
});

/** Hide the "For you" card on Discover (per browser). */
eventRoutes.post("/events/for-you/dismiss", requireMember, (c) => {
  setCookie(c, FOR_YOU_COOKIE, "hide", { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", httpOnly: true });
  return c.redirect("/events?view=list");
});

function quizHintCard(t: T) {
  return (
    <Card class="hint quiz-hint">
      <div class="spread">
        <a href="/quiz">
          <strong>{t("🧭 มาหาไทป์กรุงเทพฯ ของคุณกัน (16 ข้อ ราว 3 นาที)", "🧭 Find your Bangkok Type (16 quick questions, about 3 minutes)")}</strong>
        </a>
        <form method="post" action="/events/quiz-hint/dismiss">
          <button type="submit" class="btn ghost" aria-label={t("ซ่อนการ์ดนี้", "Hide this card")}>
            ✕
          </button>
        </form>
      </div>
      <p class="muted">{t("แบบทดสอบไลฟ์สไตล์สั้น ๆ ช่วยจัดโต๊ะให้มีคนหลากหลาย และมีเรื่องคุยตั้งแต่แรก ไม่มีเรื่องการเมือง และเป็นความลับจนกว่าคุณจะเลือกให้คนอื่นเห็น", "A short lifestyle quiz. It helps us seat a good mix, with something in common to start. Nothing political, and private unless you choose to show it.")}</p>
    </Card>
  );
}

/** Hide the "Find your Bangkok Type" card on Discover (per browser). */
eventRoutes.post("/events/quiz-hint/dismiss", requireMember, (c) => {
  setCookie(c, QUIZ_HINT_COOKIE, "hide", { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", httpOnly: true });
  return c.redirect("/events");
});

// ---------------------------------------------------------- map view --

/** One event as the map needs it: what the card shows, plus where. Nothing about other people. */
function mapPoint(
  e: Event,
  place: NonNullable<ReturnType<typeof eventPlace>>,
  taken: number,
  mine: string | undefined,
  v: View,
  cover: string | null | undefined,
): MapPoint {
  const { t, lang } = v;
  const left = Math.max(0, e.capacity - taken);
  return {
    id: e.id,
    title: title(e, lang),
    when: fmtDate(e.startsAt, lang),
    venue: e.venueName,
    district: label(DISTRICTS, e.district, lang),
    lat: place.lat,
    lng: place.lng,
    precision: place.precision,
    emoji: coverEmoji(e),
    cover: cover ?? null,
    tags: e.tags,
    free: e.costThb === 0,
    cost: costText(e, t),
    spots: left > 0 ? t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`) : t("เต็มแล้ว", "Full"),
    full: left === 0,
    mine: mine ? statusLabel(mine, t) : null,
  };
}

const CHIP_EMOJI: Record<string, string> = {
  food: "🍜", run: "🏃", walk: "🚶", culture: "🏛️", art: "🎨", volunteer: "🤲", board_game: "🎲", workshop: "🛠️", pets: "🐶",
  language_exchange: "💬", newcomers: "👋", queer_friendly: "🏳️‍🌈", lgbtq_community: "🏳️‍🌈", english_friendly: "🇬🇧",
  step_free: "♿", city_quest: "🧭", festival: "🎉", daytime: "☀️",
};

function fmtTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(d);
}

/**
 * The Discover ticker, Sanroo style: city conditions first (heat, rain and
 * PM2.5 decide whether an outdoor meet-up is pleasant), then what's on.
 */
function tickerItems(p: { v: View; list: Event[]; taken: Map<string, number>; weather: Weather | null; hasVibe: boolean; newcomer: boolean }): TickerItem[] {
  const { t, lang } = p.v;
  const out: TickerItem[] = [];
  const w = p.weather;
  if (w?.rain3h != null) {
    out.push({ icon: w.rain3h >= 60 ? "🌧️" : "⛅", text: t(`โอกาสฝนตกใน 3 ชม. ${w.rain3h}%${w.rain24h != null ? ` · ฝนใน 24 ชม. ข้างหน้า ${w.rain24h} มม.` : ""}`, `Rain chance next 3h ${w.rain3h}%${w.rain24h != null ? ` · next 24h ${w.rain24h} mm` : ""}`), tone: w.rain3h >= 60 ? "warn" : undefined });
  }
  if (w?.feelsLike != null) {
    const b = heatBand(w.feelsLike);
    out.push({ icon: "🌡️", text: t(`รู้สึกเหมือน ${w.feelsLike}°C · ${b.th}`, `Feels like ${w.feelsLike}°C · ${b.en}`), tone: b.tone === "ok" ? undefined : b.tone });
  }
  if (w?.pm25 != null) {
    const b = pm25Band(w.pm25);
    out.push({ icon: "😷", text: t(`PM2.5 ${w.pm25} มคก./ลบ.ม. · ${b.th}`, `PM2.5 ${w.pm25} µg/m³ · ${b.en}`), tone: b.tone === "ok" ? "ok" : b.tone });
  }
  const now = Date.now();
  const week = p.list.filter((e) => e.startsAt.getTime() < now + 7 * 86_400_000);
  out.push({ icon: "🎟️", text: t(`${week.length} กิจกรรมสัปดาห์นี้ · ฟรี ${week.filter((e) => e.costThb === 0).length}`, `${week.length} events this week · ${week.filter((e) => e.costThb === 0).length} free`) });
  const next = p.list[0];
  if (next) out.push({ icon: "⏰", text: t(`ถัดไป: ${title(next, lang)} · ${fmtDate(next.startsAt, lang)}`, `Next up: ${title(next, lang)} · ${fmtDate(next.startsAt, lang)}`), href: `/events/${next.id}` });
  const filling = p.list
    .map((e) => ({ e, left: e.capacity - (p.taken.get(e.id) ?? 0) }))
    .filter((x) => x.left > 0 && x.left <= 5)
    .sort((a, b) => a.left - b.left)[0];
  if (filling) out.push({ icon: "🔥", text: t(`ใกล้เต็ม: ${title(filling.e, lang)} · เหลือ ${filling.left} ที่`, `Filling up: ${title(filling.e, lang)} · ${filling.left} left`), href: `/events/${filling.e.id}`, tone: "warn" });
  const quest = p.list.find((e) => e.tags.includes("city_quest"));
  if (quest) out.push({ icon: "🧭", text: t(`ซิตี้เควสต์: ${title(quest, lang)}`, `City Quest: ${title(quest, lang)}`), href: `/events/${quest.id}` });
  if (p.newcomer) out.push({ icon: "👋", text: t("มาใหม่ในกรุงเทพฯ? ลองกิจกรรมสำหรับคนมาใหม่", "New to Bangkok? Try a newcomers meet-up"), href: "/events?tag=newcomers" });
  if (!p.hasVibe) out.push({ icon: "🧩", text: t("มาหาไทป์กรุงเทพฯ ของคุณกัน (16 ข้อ ราว 3 นาที)", "Find your Bangkok Type (16 quick questions, about 3 minutes)"), href: "/quiz" });
  out.push({ icon: "🤝", text: t("ความยินยอม: “ได้” ที่แท้จริงต้องชัดเจน เต็มใจ และเปลี่ยนใจได้เสมอ", "Consent: a real yes is clear, free and can change"), href: "/learn/consent" });
  out.push({ icon: "🛡️", text: t("ฉุกเฉินโทร 191 · เจ็บป่วย 1669", "Emergency 191 · medical 1669"), href: "/learn/date-responsibly" });
  out.push({ icon: "⚠️", text: t("เวอร์ชันทดลอง: อย่าใส่ข้อมูลส่วนตัวจริง", "Prototype: please don't use real personal data") });
  if (w) out.push({ icon: "ℹ️", text: t("ข้อมูลอากาศจาก Open-Meteo.com", "Weather data by Open-Meteo.com"), href: "https://open-meteo.com/" });
  return out;
}

/** Category chips for the map: the categories these events actually have, most common first (up to 8). */
function mapChips(list: Event[], lang: Lang): MapChip[] {
  const n = new Map<string, number>();
  for (const e of list) for (const tag of e.tags) n.set(tag, (n.get(tag) ?? 0) + 1);
  return [...n.entries()]
    .filter(([tag]) => values(EVENT_TAGS).includes(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => ({ value: tag, label: label(EVENT_TAGS, tag, lang), emoji: CHIP_EMOJI[tag] ?? "•" }));
}

/**
 * The first card on Discover, different for locals, newcomers and
 * internationals (domain/segment.ts). Suggestions only: everyone sees every event.
 */
function ForYou(props: { v: View; segment: Segment; newcomer?: boolean; dismissable?: boolean }) {
  const { t } = props.v;
  const card = (title: string, body: string, links: [string, string][]) => (
    <Card class="hint for-you">
      {props.dismissable ? (
        <div class="spread">
          <strong>{title}</strong>
          <form method="post" action="/events/for-you/dismiss">
            <button type="submit" class="btn ghost" aria-label={t("ซ่อนการ์ดนี้", "Hide this card")}>
              ✕
            </button>
          </form>
        </div>
      ) : (
        <strong>{title}</strong>
      )}
      <p>{body}</p>
      <p class="row">
        {links.map(([href, text]) => (
          <a href={href}>{text}</a>
        ))}
      </p>
    </Card>
  );
  // Settled in (they said "Not anymore"): the same shortcuts, without the welcome.
  if (props.segment === "international" && props.newcomer === false)
    return card(
      t("โต๊ะที่คุยภาษาอังกฤษได้สัปดาห์นี้", "English-friendly this week"),
      t("โต๊ะที่ใช้ภาษาอังกฤษได้และโต๊ะแลกเปลี่ยนภาษา", "English-friendly and language-exchange tables."),
      [
        ["/events?tag=english_friendly", t("โต๊ะที่ใช้ภาษาอังกฤษได้", "English-friendly tables")],
        ["/events?tag=language_exchange", t("แลกเปลี่ยนภาษา", "Language exchange")],
      ],
    );
  if (props.segment === "international")
    return card(
      t("ยินดีต้อนรับสู่กรุงเทพฯ 👋", "Welcome to Bangkok 👋"),
      t("เริ่มจากโต๊ะที่ใช้ภาษาอังกฤษได้และโต๊ะแลกเปลี่ยนภาษา เจอเพื่อนคนไทยได้ ไม่ต้องพูดไทยเก่ง", "Start with English-friendly and language-exchange tables. Make Thai friends, no fluent Thai needed."),
      [
        ["/events?tag=english_friendly", t("โต๊ะที่ใช้ภาษาอังกฤษได้", "English-friendly tables")],
        ["/events?tag=language_exchange", t("แลกเปลี่ยนภาษา", "Language exchange")],
        ["/learn/new-to-bangkok", t("คู่มือคนมาใหม่", "New to Bangkok guide")],
      ],
    );
  if (props.segment === "newcomer")
    return card(
      t("เพิ่งย้ายมากรุงเทพฯ ใช่ไหม? 👋", "New to Bangkok? 👋"),
      t("ลองโต๊ะสำหรับคนมาใหม่ ทุกคนก็มาคนเดียวเหมือนกัน แล้วหาบัดดี้ไว้ตะลุยเมืองด้วยกัน", "Try a newcomer table. Everyone comes alone. Then get a buddy to explore the city with."),
      [
        ["/events?tag=newcomers", t("โต๊ะสำหรับคนมาใหม่", "Newcomer tables")],
        ["/events?tag=city_quest", t("ซิตี้เควสต์", "City Quests")],
        ["/buddy", t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")],
      ],
    );
  return card(
    t("กรุงเทพฯ ของคุณ ในมุมใหม่ ✨", "Your Bangkok, new faces ✨"),
    t("เจอคนใหม่ในย่านของคุณเอง ชวนคนที่เคยเจอกลับมาเจอกันอีก หรือลองเป็นโฮสต์ให้คนมาใหม่", "Meet new people in your own district, see people you've met again, or host a table for newcomers."),
    [
      ["/events?tag=run", t("วิ่งและกีฬา", "Runs and sport")],
      ["/events?tag=board_game", t("บอร์ดเกม", "Board games")],
      ["/connections", t("คนรู้จัก", "My people")],
    ],
  );
}

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
async function visibleEvent(c: Ctx, id: string): Promise<Event | null> {
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

async function myRegistration(db: Db, eventId: string, accountId: string): Promise<Registration | null> {
  const [reg] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, accountId)))
    .limit(1);
  return reg ?? null;
}

function notFound(c: Ctx) {
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
        <LinkButton href="/events?when=week">{t("กิจกรรมสัปดาห์นี้", "This week's events")}</LinkButton>
        <LinkButton href="/plan" kind="ghost">{t("แผนสัปดาห์นี้ของฉัน", "My plan this week")}</LinkButton>
      </div>
    </>,
  );
}

function forbidden(c: Ctx, th: string, en: string, back: string) {
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
async function buddyNicknames(db: Db, event: Event, accountId: string, now = new Date()): Promise<string[] | null> {
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

function BuddyBox(props: { names: string[] | null; event: Event; t: T }) {
  const { names, t } = props;
  if (!names || names.length === 0) return null;
  return (
    <Card class="buddy">
      <h2>🤝 {t("บัดดี้ของคุณ", "Your event buddy")}</h2>
      <p>
        <strong>{names.join(", ")}</strong>
      </p>
      <p class="muted">
        {t("นัดเจอกันที่จุดนัดพบก่อนเริ่ม 15 นาที", "Meet at the meeting point 15 minutes early.")}
        {props.event.safetyInfo ? ` · ${props.event.safetyInfo}` : ""}
      </p>
    </Card>
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
    <Card class="hint">
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
    </Card>
  );
}

type DetailOpts = { error?: string; status?: 200 | 400 | 403 | 409 };

async function renderDetail(c: Ctx, event: Event, opts: DetailOpts = {}) {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const db = getDb(c.env);
  const now = new Date();

  const [reg, state, host, buddies, standingRows, cover, partner, tableBox] = await Promise.all([
    myRegistration(db, event.id, user.account.id),
    seatState(db, event),
    event.hostAccountId
      ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, event.hostAccountId)).limit(1)
      : Promise.resolve([] as { nickname: string }[]),
    buddyNicknames(db, event, user.account.id, now),
    myStrikes(db, user.account.id),
    coverSrc(c.env, event),
    event.partnerOrgId
      ? db.select({ name: partnerOrgs.name }).from(partnerOrgs).where(eq(partnerOrgs.id, event.partnerOrgId)).limit(1)
      : Promise.resolve([] as { name: string }[]),
    tablePrompt(db, event, user, now),
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
  const again = ended && reg?.checkedInAt ? await seeAgain(db, { id: user.account.id, birthDate: user.profile.birthDate }, { eventId: event.id, now }) : null;

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
      {event.visibility === "private" && event.regularTableId ? (
        <Notice kind="info">🔒 {t("แฮงเอาต์ของโต๊ะประจำ เห็นได้เฉพาะคนในโต๊ะและคนที่ได้ลิงก์จากเจ้าภาพ", "A Regular Table hangout: only people at the table, and people the host sent the link to, can see it.")}</Notice>
      ) : event.visibility === "private" ? (
        <Notice kind="info">🔒 {t("กิจกรรมส่วนตัว เห็นได้เฉพาะคนที่มีลิงก์ อย่าโพสต์ลิงก์นี้ในที่สาธารณะ", "Private event: only people with the link can see it. Please don't post the link publicly.")}</Notice>
      ) : null}
      <Cover e={event} src={cover} class="ev-scene" />
      <Card class="ev-sheet">
        <p class="eyebrow">{eyebrow(event, t, lang)}</p>
        <h1>{title(event, lang)}</h1>
        {quest ? (
          <p>
            <Tag tone="accent">🧭 City Quest</Tag> {quest}
          </p>
        ) : null}
        <div class="facts4">
          <div class="fact">
            <b aria-hidden="true">📅</b>
            <small>{t("เมื่อไหร่", "When")}</small>
            <span>{fmtDate(event.startsAt, lang)}</span>
            <small>{t(`ถึง ${fmtParts(event.endsAt, lang).time}`, `until ${fmtParts(event.endsAt, lang).time}`)}</small>
          </div>
          <div class="fact">
            <b aria-hidden="true">📍</b>
            <small>{t("ที่ไหน", "Where")}</small>
            <span>{event.venueName}</span>
            <small>{label(DISTRICTS, event.district, lang)}</small>
          </div>
          <div class="fact">
            <b aria-hidden="true">👥</b>
            <small>{t("โต๊ะ", "Table")}</small>
            <span>{t(`โต๊ะละ ${event.groupMin} ถึง ${event.groupMax} คน`, `Tables of ${event.groupMin}-${event.groupMax}`)}</span>
            <small>{label(INTENSITY, event.intensity, lang)}</small>
          </div>
          <div class="fact">
            <b aria-hidden="true">🪑</b>
            <small>{t("ที่นั่ง", "Spots")}</small>
            <span>{left > 0 ? t(`เหลือ ${left} ที่`, `${left} left`) : reg?.status === "confirmed" ? t("เต็มแล้ว คุณได้ที่แล้ว", "Full, you're in") : t("เต็มแล้ว", "Full")}</span>
            <Seats capacity={event.capacity} taken={state.taken} />
          </div>
        </div>
        {reg?.status === "confirmed" && !started ? <TableIntroPrompt v={v} next={`/events/${event.id}`} /> : null}
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
        <p class="ev-actions">
          <a class="chip-btn" href={directionsUrl(event)} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">🧭</span> {t("เส้นทาง", "Directions")}
          </a>
        </p>
        <div class="tags">
          {partner[0] ? <Tag tone="ok">🤝 {t(`ร่วมกับพาร์ตเนอร์ ${partner[0].name}`, `With partner ${partner[0].name}`)}</Tag> : null}
          <SpotsTag e={event} taken={state.taken} t={t} going={reg?.status === "confirmed"} />
          {event.tags.map((tag) => (
            <Tag tone={tag === OPEN_TO_MORE_TAG ? "love" : "muted"}>{label(EVENT_TAGS, tag, lang)}</Tag>
          ))}
        </div>
        <HostText text={description(event, lang)} t={t} />
      </Card>
      {reg?.status === "confirmed" && event.status === "published" && icebreakerWindow(event.startsAt, event.endsAt, now) ? (
        <IcebreakerCard v={v} eventId={event.id} chatKey={event.visibility === "private" ? `circle:${event.id}` : null} />
      ) : null}

      <Card>
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
          {partner[0] ? (
            <>
              <dt>{t("พาร์ตเนอร์", "Partner")}</dt>
              <dd>🤝 {partner[0].name}</dd>
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
      </Card>

      <BuddyBox names={buddies} event={event} t={t} />
      <TableBox box={tableBox} t={t} />

      {event.status === "cancelled" ? null : (
        <Card>
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
      {again ? <SeeAgainCard v={v} data={again} here /> : null}
      {event.status === "published" && !started && (!reg || reg.status === "cancelled" || reg.status === "late_cancelled") ? (
        <StickyRsvp t={t} left={left} />
      ) : null}
    </>,
  );
}

/**
 * The main action, always in reach: a bar above the tab bar that jumps to the
 * RSVP form. It hides while the form itself is on screen.
 */
function StickyRsvp(props: { t: T; left: number }) {
  const { t, left } = props;
  return (
    <div class="sticky-cta" id="sticky-rsvp">
      <span class="sticky-cta-note">
        {left > 0 ? t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`) : t("เต็มแล้ว ต่อคิวสำรองได้", "Full, join the waitlist")}
      </span>
      <a href="#rsvp" class="btn primary">
        {left > 0 ? t("ลงทะเบียนเข้าร่วม", "RSVP") : t("ต่อคิวสำรอง", "Join the waitlist")}
      </a>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var b=document.getElementById("sticky-rsvp"),f=document.getElementById("rsvp");if(!b||!f)return;if("IntersectionObserver" in window)new IntersectionObserver(function(e){b.classList.toggle("is-off",e[0].isIntersecting)}).observe(f);b.querySelector("a").addEventListener("click",function(){setTimeout(function(){var c=f.querySelector("input:not([type=hidden]),button");if(c)c.focus({preventScroll:true})},350)})})()`,
        }}
      />
    </div>
  );
}

/** A confirmed attendee of a +1 event, without a +1 yet, before the start. */
function canInvite(event: Event, reg: Registration | null, now = new Date()): boolean {
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

  if (status === "confirmed") {
    return (
      <>
        <p>
          <Tag tone="ok">{statusLabel("confirmed", t)}</Tag>{" "}
          {reg!.plusOneWith ? t("มากับเพื่อน", "Bringing a friend") : t("มาคนเดียว", "Going alone")}
        </p>
        {reg!.checkedInAt && !ended ? (
          <LinkButton href={`${base}/live`}>{t("เข้าหน้าในงาน", "Open the live page")}</LinkButton>
        ) : null}
        {!started ? (
          <>
            <div class="row">
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
        <form method="post" action={`${base}/offer`} class="row">
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
        <button type="submit" class="btn primary btn-ticket">
          <span>{t("ลงทะเบียนเข้าร่วม", "RSVP")}</span>
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
  if (existing && (ACTIVE as readonly string[]).includes(existing.status)) return { refusal: null, existing, active: true };

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
  // One card for the latest event with people to see again, not one per event.
  const again = past.some((r) => r.reg.checkedInAt) ? await seeAgain(db, { id: user.account.id, birthDate: user.profile.birthDate }, { now }) : null;
  const standing = strikeStanding(strikeRows, now);
  const activeStrikes = strikeRows.filter((s) => !s.waivedBy && s.expiresAt.getTime() > now.getTime());

  return page(
    c,
    { title: t("กิจกรรมของฉัน", "My events"), tab: "mine" },
    <>
      <h1>{t("กิจกรรมของฉัน", "My events")}</h1>
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
          <p>
            <a href="/events?view=list">{t("ดูกิจกรรมทั้งหมด", "See all events")} →</a>
          </p>
        </>
      ) : (
        upcoming.map(({ event, reg }) => (
          <Card>
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
                <div class="row">
                  {reg.status === "confirmed" && event.status === "published" ? (
                    <LinkButton href={`/me/events/${event.id}/pass`}>{t("🎟️ บัตรเข้างาน", "🎟️ Pass")}</LinkButton>
                  ) : null}
                  {reg.checkedInAt ? <LinkButton href={`/events/${event.id}/live`} kind="ghost">{t("หน้าในงาน", "Live page")}</LinkButton> : null}
                  {reg.status === "offered" ? <LinkButton href={`/events/${event.id}`}>{t("ยืนยันที่นั่ง", "Confirm your spot")}</LinkButton> : null}
                </div>
              </div>
            </div>
          </Card>
        ))
      )}

      <h2 id="past">{t("ที่ผ่านมา", "Past")}</h2>
      {again ? <SeeAgainCard v={v} data={again} /> : null}
      {past.length === 0 ? (
        <Empty>{t("ยังไม่มีกิจกรรมที่ผ่านมา", "No past events yet.")}</Empty>
      ) : (
        past.map(({ event, reg }) => {
          const attended = !!reg.checkedInAt;
          return (
            <Card>
              <div class="spread">
                <h3>
                  <a href={`/events/${event.id}`}>{title(event, lang)}</a>
                </h3>
                <Tag tone={attended ? "ok" : "muted"}>{attended ? t("เข้าร่วมแล้ว", "Attended") : t("ไม่ได้เช็กอิน", "Not checked in")}</Tag>
              </div>
              <div class="meta">
                <span>🗓️ {fmtDate(event.startsAt, lang)}</span>
              </div>
              {attended ? (
                <div class="row">
                  {peopleWindow(event.endsAt, now) === "open" ? (
                    <LinkButton href={`/events/${event.id}/people`}>{t("คนที่เจอ", "People I met")}</LinkButton>
                  ) : null}
                  <LinkButton href={`/events/${event.id}/feedback`} kind="ghost">
                    {gaveFeedback.has(event.id) ? t("แก้ไขความคิดเห็น", "Edit feedback") : t("ให้ความคิดเห็น", "Give feedback")}
                  </LinkButton>
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </>,
  );
});

// ---------------------------------------------------------------- pass --

/** The first word of a nickname: the host's first name, nothing more. */
export function firstName(nickname: string): string {
  return nickname.trim().split(/\s+/)[0] ?? nickname;
}

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
  return page(
    c,
    { title: t("บัตรเข้างาน", "Event pass"), tab: "mine" },
    <>
      <OfflineSavedNote t={t} lang={lang} />
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
          <p class="muted">{t("สแกนไม่ได้ ให้โฮสต์พิมพ์รหัสนี้ · อย่าแชร์บัตร", "Scan fails? The host types this code · don't share it")}</p>
          {reg.checkedInAt ? <Tag tone="ok">{t("เช็กอินแล้ว", "Checked in")}</Tag> : null}
        </div>
      </section>
      {now < event.startsAt ? (
        <p class="countdown" data-start={event.startsAt.toISOString()}  data-lang={lang}>
          {t("เริ่ม", "Starts")} {fmtDate(event.startsAt, lang)}
        </p>
      ) : null}
      {now < event.startsAt ? <TableIntroPrompt v={view(c)} next={`/me/events/${event.id}/pass`} /> : null}
      <div class="pass-actions">
        <a class="chip-btn" href={`/me/events/${event.id}/calendar.ics`} download={`jurrgun-${event.id}.ics`}>
          <span aria-hidden="true">🗓️</span> {t("เพิ่มในปฏิทิน", "Add to calendar")}
        </a>
        <a class="chip-btn" href={directionsUrl(event)} target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">🧭</span> {t("เส้นทาง", "Directions")}
        </a>
      </div>
      <script dangerouslySetInnerHTML={{ __html: COUNTDOWN_JS }} />
      <Essentials event={event} hostName={host?.nickname ?? null} v={view(c)} />
      <ol class="next-steps" aria-label={t("ขั้นตอนต่อไป", "What happens next")}>
        <li class="done">
          <span>
            <b>{t("ได้ที่นั่งแล้ว", "You have a spot")}</b>
            <small>{t("จะจัดโต๊ะให้ก่อนงานเริ่ม", "Tables are set before the start")}</small>
          </span>
        </li>
        <li class={reg.checkedInAt ? "done" : undefined}>
          <span>
            <b>{t("เช็กอินกับโฮสต์", "Check in with your host")}</b>
            <small>
              {event.safetyInfo
                ? t(`เปิด 30 นาทีก่อนเริ่ม · จุดนัดพบ: ${event.safetyInfo}`, `Opens 30 min before the start · ${event.safetyInfo}`)
                : t("เปิด 30 นาทีก่อนเริ่ม", "Opens 30 min before the start")}
            </small>
          </span>
        </li>
        <li>
          <span>
            <b>{t("คนที่เจอ", "People I met")}</b>
            <small>
              {t(
                `เปิดให้เลือก ${PEOPLE_WINDOW_HOURS} ชม. หลังจบงาน และจะได้รู้จักกันต่อเมื่อเลือกกันทั้งสองฝ่ายเท่านั้น`,
                `Opens for ${PEOPLE_WINDOW_HOURS} hours after the event. You only connect if you both choose to.`,
              )}
            </small>
          </span>
        </li>
      </ol>
      <LinkButton href={`/events/${event.id}`} kind="ghost">{t("← รายละเอียดกิจกรรม", "← Event details")}</LinkButton>
    </>,
  );
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
 * "Starts in 2 h 15 m · check-in opens in 1 h 45 m", ticking each minute.
 * Check-in opens 30 minutes before the start (rules.checkInOpen).
 */
const COUNTDOWN_JS = `(function(){var el=document.querySelector(".countdown[data-start]");if(!el)return;var start=new Date(el.dataset.start).getTime(),th=el.dataset.lang!=="en";
function span(ms){var m=Math.max(0,Math.round(ms/60000)),d=Math.floor(m/1440),h=Math.floor(m%1440/60),mm=m%60;if(th)return d?d+" วัน "+h+" ชม.":h?h+" ชม. "+mm+" นาที":mm+" นาที";return d?d+" d "+h+" h":h?h+" h "+mm+" m":mm+" m"}
function tick(){var now=Date.now(),left=start-now,open=left-30*60000;if(left<=0){el.textContent=th?"เริ่มแล้ว":"It's started";return}
var s=(th?"เริ่มในอีก ":"Starts in ")+span(left);s+=open>864e5?"":open>0?(th?" · เปิดเช็กอินในอีก ":" · check‑in opens in ")+span(open):(th?" · เปิดเช็กอินแล้ว":" · check‑in is open");el.textContent=s}
tick();setInterval(tick,60000)})()`;

// ---------------------------------------------------------------- live --

async function checkedInRegistration(c: Ctx, id: string) {
  const user = me(c);
  const db = getDb(c.env);
  const event = await visibleEvent(c, id);
  if (!event) return { event: null, reg: null };
  const reg = await myRegistration(db, id, user.account.id);
  return { event, reg: reg && reg.status === "confirmed" && reg.checkedInAt ? reg : null };
}

function signalOptions(eligible: boolean) {
  return SIGNALS.filter((s) => s.value !== "open_to_spark" || eligible);
}

eventRoutes.get("/events/:id/live", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const { event, reg } = await checkedInRegistration(c, id);
  if (!event) return notFound(c);
  if (!reg) return forbidden(c, "หน้านี้เปิดหลังจากโฮสต์เช็กอินให้คุณแล้ว", "This page opens once your host has checked you in.", `/events/${id}`);
  const eligible = romanceEligible(user.profile);

  let mates: { accountId: string; nickname: string; pronouns: string | null; signal: string | null; topics: string[]; resident: boolean }[] = [];
  if (event.groupsPublishedAt && reg.groupNo !== null) {
    const rows = await db
      .select({
        accountId: registrations.accountId,
        signal: registrations.socialSignal,
        topics: registrations.signalTopics,
        nickname: profiles.nickname,
        pronouns: profiles.pronouns,
        showPronouns: profiles.showPronouns,
        showResidentBadge: profiles.showResidentBadge,
        bkkRegistered: accounts.bkkRegistered,
      })
      .from(registrations)
      .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
      .innerJoin(accounts, eq(accounts.id, registrations.accountId))
      .where(
        and(
          eq(registrations.eventId, id),
          eq(registrations.groupNo, reg.groupNo),
          eq(registrations.status, "confirmed"),
          ne(registrations.accountId, user.account.id),
        ),
      )
      .limit(50);
    const hidden = await blockedWith(db, user.account.id, rows.map((r) => r.accountId));
    mates = rows
      .filter((r) => !hidden.has(r.accountId))
      .map((r) => ({
        accountId: r.accountId,
        resident: showsResidentBadge(r, r),
        nickname: r.nickname,
        pronouns: r.showPronouns ? r.pronouns : null,
        // Never show romance signals to someone who isn't romance-eligible.
        signal: r.signal === "open_to_spark" && !eligible ? null : r.signal,
        topics: r.topics ?? [],
      }));
  }
  const [buddies, vibeMap] = await Promise.all([
    buddyNicknames(db, event, user.account.id),
    vibesFor(db, [...mates.map((m) => m.accountId), user.account.id]),
  ]);
  const myVibe = vibeMap.get(user.account.id);
  const opts = [{ value: "", th: "ไม่เลือก", en: "No signal" }, ...signalOptions(eligible)];

  return page(
    c,
    { title: t("ในงาน", "Live"), tab: "mine" },
    <>
      <h1>{title(event, lang)}</h1>
      <p class="muted">{t("เช็กอินแล้ว ขอให้สนุกนะ", "You're checked in. Enjoy!")}</p>

      <Card>
        <h2>{t("โต๊ะของฉัน", "My table")}</h2>
        {event.groupsPublishedAt && reg.groupNo !== null ? (
          <>
            <p>
              <Tag tone="accent">{t(`โต๊ะ ${reg.groupNo}`, `Table ${reg.groupNo}`)}</Tag>
            </p>
            {mates.length === 0 ? (
              <Empty>{t("ยังไม่มีใครอื่นที่โต๊ะของคุณ", "No one else at your table yet.")}</Empty>
            ) : (
              <ul class="people">
                {mates.map((m) => (
                  <li class="person">
                    <span class="avatar" aria-hidden="true">{m.nickname.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <a href={`/people/${m.accountId}`}>
                        <strong>{m.nickname}</strong>
                      </a>
                      {m.pronouns ? <small> ({m.pronouns})</small> : null}
                      {m.resident ? (
                        <>
                          {" "}
                          <ResidentTag v={v} />
                        </>
                      ) : null}
                      <TypeSpark v={v} theirs={vibeMap.get(m.accountId)} mine={myVibe} />
                      {m.signal ? (
                        <>
                          {" "}
                          <Tag tone={m.signal === "open_to_spark" ? "love" : undefined}>{label(SIGNALS, m.signal, lang)}</Tag>
                        </>
                      ) : null}
                      {m.topics.length ? <small> {m.topics.join(" · ")}</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p class="muted">{t("โฮสต์จะจัดกลุ่มหลังปิดเช็กอิน", "Your host will announce groups once check-in closes.")}</p>
        )}
      </Card>

      {event.activePrompt ? (
        <Card class="prompt">
          <h2>💡 {t("คำถามชวนคุยจากโฮสต์", "Icebreaker from your host")}</h2>
          <p>{event.activePrompt}</p>
        </Card>
      ) : null}

      <BuddyBox names={buddies} event={event} t={t} />

      <Card>
        <h2>{t("สัญญาณทักทายของฉัน", "My social signal")}</h2>
        <p class="muted">{t("ไม่บังคับ เปลี่ยนได้ตลอด คนที่โต๊ะจะเห็น", "Optional and easy to change. Your table can see it.")}</p>
        <form method="post" action={`/events/${id}/signal`}>
          <Choices legend={t("เลือกสัญญาณ", "Pick a signal")} name="signal" type="radio" options={opts} values={[reg.socialSignal ?? ""]} lang={lang} />
          <Field
            label={t("คุยกับฉันเรื่อง… (คั่นด้วยจุลภาค ไม่เกิน 3 เรื่อง)", "Talk to me about (comma-separated, up to 3)")}
            name="signalTopics"
            value={(reg.signalTopics ?? []).join(", ")}
            maxlength={100}
          />
          <Button>{t("บันทึก", "Save")}</Button>
        </form>
      </Card>

      <Card>
        <h2>🛟 {t("ความปลอดภัย", "Safety")}</h2>
        {event.safetyInfo ? <p>{event.safetyInfo}</p> : null}
        <p>
          {t("ติดต่อฉุกเฉิน: ", "Emergency contact: ")}
          <strong>{event.emergencyContact || "1555"}</strong>
        </p>
        <p class="muted">
          {t("ไม่สบายใจ? บอกโฮสต์ได้ทันที หรือ", "Feeling uncomfortable? Tell your host any time, or")} <a href="/report">{t("รายงาน", "make a report")}</a>
        </p>
      </Card>
    </>,
  );
});

eventRoutes.post("/events/:id/signal", requireMember, async (c) => {
  const { t } = view(c);
  const user = me(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const { event, reg } = await checkedInRegistration(c, id);
  if (!event) return notFound(c);
  if (!reg) return forbidden(c, "ตั้งสัญญาณได้หลังเช็กอิน", "You can set a signal after check-in.", `/events/${id}`);
  const body = await c.req.parseBody();
  const signal = str(body.signal);
  const bad = (th: string, en: string) =>
    page(
      c,
      { title: t("ในงาน", "Live"), tab: "mine", status: 400 },
      <>
        <Notice kind="error">{t(th, en)}</Notice>
        <LinkButton href={`/events/${id}/live`} kind="ghost">{t("← กลับ", "← Back")}</LinkButton>
      </>,
    );
  if (signal && !values(signalOptions(romanceEligible(user.profile))).includes(signal)) {
    return bad("เลือกสัญญาณนี้ไม่ได้", "That signal isn't available.");
  }
  const topics = str(body.signalTopics)
    .split(/[,،、，]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (topics.length > 3 || topics.some((x) => x.length > 30)) {
    return bad("หัวข้อได้สูงสุด 3 เรื่อง เรื่องละไม่เกิน 30 ตัวอักษร", "Up to 3 topics, 30 characters each.");
  }
  await db
    .update(registrations)
    .set({ socialSignal: signal || null, signalTopics: topics.length ? topics : null })
    .where(eq(registrations.id, reg.id));
  return c.redirect(`/events/${id}/live?notice=saved`);
});

// ------------------------------------------------------------ feedback --

const YES_NO = [
  { value: "yes", th: "ใช่", en: "Yes" },
  { value: "no", th: "ไม่", en: "No" },
];
const SCALE = ["1", "2", "3", "4", "5"].map((n) => ({ value: n, th: n, en: n }));

async function feedbackGate(c: Ctx, id: string) {
  const { event, reg } = await checkedInRegistration(c, id);
  if (!event) return { event: null, reg: null, error: notFound(c) };
  if (!reg) return { event, reg: null, error: forbidden(c, "ให้ความคิดเห็นได้เฉพาะคนที่เช็กอินแล้ว", "Only checked-in attendees can give feedback.", `/events/${id}`) };
  if (event.endsAt.getTime() > Date.now()) {
    return { event, reg, error: forbidden(c, "ให้ความคิดเห็นได้หลังกิจกรรมจบ", "Feedback opens when the event ends.", `/events/${id}`) };
  }
  return { event, reg, error: null };
}

function FeedbackForm(props: { v: View; event: Event; values: Record<string, string>; error?: string }) {
  const { t, lang } = props.v;
  const val = props.values;
  return (
    <>
      <h1>{t("กิจกรรมเป็นยังไงบ้าง?", "How was it?")}</h1>
      <p class="muted">{title(props.event, lang)}</p>
      {props.error ? <Notice kind="error">{props.error}</Notice> : null}
      <form method="post">
        <Choices legend={t("ได้รู้จักคนใหม่ไหม?", "Did you meet someone new?")} name="metNewPerson" type="radio" options={YES_NO} values={[val.metNewPerson ?? ""]} lang={lang} required />
        <Choices legend={t("อยากเจอใครจากวันนี้อีกไหม?", "Would you meet someone from today again?")} name="wouldMeetAgain" type="radio" options={YES_NO} values={[val.wouldMeetAgain ?? ""]} lang={lang} required />
        <Choices legend={t("รู้สึกปลอดภัยแค่ไหน (1-5)", "How safe did you feel? (1-5)")} name="feltSafe" type="radio" options={SCALE} values={[val.feltSafe ?? ""]} lang={lang} required />
        <Choices legend={t("รู้สึกว่ามีคนฟังคุณแค่ไหน (1-5)", "Did you feel heard? (1-5)")} name="feltHeard" type="radio" options={SCALE} values={[val.feltHeard ?? ""]} lang={lang} />
        <Choices legend={t("ให้คะแนนโต๊ะของคุณ (1-5)", "Rate your table (1-5)")} name="groupRating" type="radio" options={SCALE} values={[val.groupRating ?? ""]} lang={lang} required />
        <TextArea label={t("อยากบอกอะไรเพิ่มไหม (ไม่บังคับ)", "Anything else? (optional)")} name="comment" value={val.comment} maxlength={500} />
        <Button>{t("ส่งความคิดเห็น", "Send feedback")}</Button>
      </form>
    </>
  );
}

eventRoutes.get("/events/:id/feedback", requireMember, async (c) => {
  const v = view(c);
  const id = c.req.param("id");
  const gate = await feedbackGate(c, id);
  if (gate.error) return gate.error;
  const db = getDb(c.env);
  const [fb] = await db
    .select()
    .from(feedback)
    .where(and(eq(feedback.eventId, id), eq(feedback.accountId, me(c).account.id)))
    .limit(1);
  const yn = (b: boolean | null | undefined) => (b === true ? "yes" : b === false ? "no" : "");
  const vals: Record<string, string> = fb
    ? {
        metNewPerson: yn(fb.metNewPerson),
        wouldMeetAgain: yn(fb.wouldMeetAgain),
        feltSafe: fb.feltSafe ? String(fb.feltSafe) : "",
        feltHeard: fb.feltHeard ? String(fb.feltHeard) : "",
        groupRating: fb.groupRating ? String(fb.groupRating) : "",
        comment: fb.comment,
      }
    : {};
  return page(c, { title: v.t("ความคิดเห็น", "Feedback"), tab: "mine" }, <FeedbackForm v={v} event={gate.event!} values={vals} />);
});

eventRoutes.post("/events/:id/feedback", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const user = me(c);
  const id = c.req.param("id");
  const gate = await feedbackGate(c, id);
  if (gate.error) return gate.error;
  const body = await c.req.parseBody();
  const vals = {
    metNewPerson: str(body.metNewPerson),
    wouldMeetAgain: str(body.wouldMeetAgain),
    feltSafe: str(body.feltSafe),
    feltHeard: str(body.feltHeard),
    groupRating: str(body.groupRating),
    comment: str(body.comment),
  };
  const yn = (s: string) => (s === "yes" ? true : s === "no" ? false : undefined);
  const scale = (s: string) => (/^[1-5]$/.test(s) ? Number(s) : undefined);
  const met = yn(vals.metNewPerson);
  const again = yn(vals.wouldMeetAgain);
  const safe = scale(vals.feltSafe);
  const rating = scale(vals.groupRating);
  if (met === undefined || again === undefined || safe === undefined || rating === undefined || vals.comment.length > 500) {
    return page(
      c,
      { title: t("ความคิดเห็น", "Feedback"), tab: "mine", status: 400 },
      <FeedbackForm v={v} event={gate.event!} values={vals} error={t("ตอบให้ครบทุกข้อ (ความเห็นไม่เกิน 500 ตัวอักษร)", "Please answer every question (comment up to 500 characters).")} />,
    );
  }
  const data = { metNewPerson: met, wouldMeetAgain: again, feltSafe: safe, feltHeard: scale(vals.feltHeard) ?? null, groupRating: rating, comment: vals.comment };
  const db = getDb(c.env);
  await db
    .insert(feedback)
    .values({ id: newId(), eventId: id, accountId: user.account.id, ...data })
    .onConflictDoUpdate({ target: [feedback.eventId, feedback.accountId], set: data });
  // Felt unsafe: make reporting one tap away.
  if (safe <= 2) return c.redirect(`/report?event=${encodeURIComponent(id)}&from=feedback`);
  return c.redirect("/me/events?notice=thanks");
});
