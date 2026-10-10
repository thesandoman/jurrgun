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
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
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
  type StrikeStanding,
} from "../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, SIGNALS, VISITBANGKOK_ROUTES, label, values } from "../lib/constants";
import { newId, randomToken } from "../lib/crypto";
import type { AppEnv, CurrentUser } from "../lib/env";
import { fmtDate, fmtParts, type Lang, type T } from "../lib/i18n";
import { eventPlace } from "../lib/places";
import { qrSvg, shortCode } from "../lib/qr";
import { audit, notify } from "../lib/records";
import { requireMember } from "../lib/session";
import {
  accounts,
  blocks,
  buddyPairs,
  events,
  feedback,
  invites,
  profiles,
  registrations,
  strikes,
  vibes,
  type Event,
  type Registration,
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
  Notice,
  page,
  Select,
  str,
  Tag,
  TextArea,
  Toggle,
  view,
  type View,
} from "../ui/kit";
import { FullDiscover, type MapChip, type MapPoint, type TickerItem } from "../ui/discover-map";
import { bangkokWeather, heatBand, pm25Band, type Weather } from "../services/weather";

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
  return e.ageMin <= 18 && e.ageMax >= 99 ? t("ผู้ใหญ่ทุกวัย", "All adults") : `${e.ageMin}–${e.ageMax} ${t("ปี", "yrs")}`;
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

function Cover(props: { e: Event; src?: string | null; lang?: Lang; class?: string }) {
  return (
    <div class={`event-cover scene-${sceneOf(props.e)} ${props.class ?? ""}`.trim()} aria-hidden="true">
      {props.src ? <img src={props.src} alt="" loading="lazy" /> : <span class="scene-badge">{coverEmoji(props.e)}</span>}
      {props.lang ? <DateBlock d={props.e.startsAt} lang={props.lang} /> : null}
    </div>
  );
}

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

function SpotsTag(props: { e: Event; taken: number; t: T }) {
  const left = Math.max(0, props.e.capacity - props.taken);
  return left > 0 ? (
    <Tag tone="ok">{props.t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`)}</Tag>
  ) : (
    <Tag tone="warn">{props.t("เต็มแล้ว — ต่อคิวสำรองได้", "Full — join the waitlist")}</Tag>
  );
}

function EventCard(props: { e: Event; taken: number; v: View; mine?: string; cover?: string | null; feat?: boolean }) {
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
        <p class="ev-line">
          {fmtDate(e.startsAt, lang)} · {e.venueName} · {label(DISTRICTS, e.district, lang)}
        </p>
        <p class="ev-line">
          {ageText(e, t)} · {langsText(e, lang)} · {label(INTENSITY, e.intensity, lang)}
        </p>
        <div class="tags">
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
      return t("รายชื่อสำรอง", "Waitlisted");
    case "offered":
      return t("มีที่ว่างรอคุณ", "Spot offered");
    case "late_cancelled":
      return t("ยกเลิกช้า", "Late cancel");
    default:
      return t("ยกเลิกแล้ว", "Cancelled");
  }
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
    language: c.req.query("language") ?? "",
    intensity: c.req.query("intensity") ?? "",
    plusOne: c.req.query("plusOne") === "1",
    fitsAge: c.req.query("fitsAge") === "1",
    resident: c.req.query("resident") === "1",
    text: (c.req.query("q") ?? "").trim().slice(0, 80),
  };
  const mapView = c.req.query("view") !== "list"; // the map is the default

  const where = [eq(events.status, "published"), gt(events.endsAt, now)];
  const win = whenWindow(q.when, now);
  if (win) where.push(gte(events.startsAt, win[0]), lt(events.startsAt, win[1]));
  if (values(DISTRICTS).includes(q.district)) where.push(eq(events.district, q.district));
  if (values(EVENT_TAGS).includes(q.tag)) where.push(jsonHas(events.tags, q.tag));
  if (q.free) where.push(eq(events.costThb, 0));
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
  const [taken, mine, myVibe, coverPairs, weather] = await Promise.all([
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
  ]);
  const covers = new Map(coverPairs);
  const myStatus = new Map(mine.map((r) => [r.eventId, r.status]));
  const filtered = !!(q.when !== "all" || q.district || q.tag || q.free || q.language || q.intensity || q.plusOne || q.fitsAge || q.resident || q.text);
  // The same filters, in list or map view.
  const params = new URLSearchParams(c.req.query());
  params.delete("view");
  params.delete("notice");
  const mapHref = `/events${params.size ? `?${params}` : ""}`;
  params.set("view", "list");
  const listHref = `/events?${params}`;
  const placed = mapView ? list.map((e) => ({ e, place: eventPlace(e) })) : [];
  const unplaced = placed.filter((x) => !x.place).length;

  const filtersForm = (
    <form method="get" action="/events" class="filters">
      {mapView ? null : <input type="hidden" name="view" value="list" />}
      {q.text ? <input type="hidden" name="q" value={q.text} /> : null}
      <Select label={t("เมื่อไหร่", "When")} name="when" options={WHEN_OPTS} value={q.when} lang={lang} />
      <Select label={t("เขต", "District")} name="district" options={DISTRICTS} value={q.district} lang={lang} blank={t("ทุกเขต", "Any district")} />
      <Select label={t("หมวด", "Category")} name="tag" options={EVENT_TAGS} value={q.tag} lang={lang} blank={t("ทุกหมวด", "Any category")} />
      <Select label={t("ภาษา", "Language")} name="language" options={LANGUAGES} value={q.language} lang={lang} blank={t("ทุกภาษา", "Any language")} />
      <Select label={t("ความคึกคัก", "Social intensity")} name="intensity" options={INTENSITY} value={q.intensity} lang={lang} blank={t("ทุกแบบ", "Any")} />
      <Toggle name="free" label={t("ฟรีเท่านั้น", "Free only")} checked={q.free} />
      <Toggle name="plusOne" label={t("ชวนเพื่อนมาได้ (+1)", "Can bring a friend (+1)")} checked={q.plusOne} />
      <Toggle name="fitsAge" label={t("เหมาะกับช่วงอายุของฉัน", "Fits my age")} checked={q.fitsAge} />
      <Toggle name="resident" label={t("กิจกรรมที่ให้สิทธิ์ผู้มีทะเบียนบ้าน กทม.", "Resident priority events")} checked={q.resident} />
      <div class="row">
        <Button>{t("ค้นหา", "Show events")}</Button>
        {filtered ? <LinkButton href={mapView ? "/events" : "/events?view=list"} kind="ghost">{t("ล้างตัวกรอง", "Clear")}</LinkButton> : null}
      </div>
    </form>
  );
  const unplacedNote =
    mapView && unplaced > 0 ? (
      <p class="muted">
        {t(`${unplaced} กิจกรรมยังไม่มีตำแหน่งบนแผนที่ แต่อยู่ในรายการนี้`, `${unplaced} event${unplaced === 1 ? " isn't" : "s aren't"} on the map yet, but ${unplaced === 1 ? "it's" : "they're"} in this list`)}
      </p>
    ) : null;
  const cards =
    list.length === 0 ? (
      <Empty>{t("ยังไม่มีกิจกรรมที่ตรงกับตัวกรองนี้ กลับมาดูใหม่เร็ว ๆ นี้", "No events match these filters yet. Check back soon.")}</Empty>
    ) : (
      list.map((e, i) => (
        <div class="ev-item" data-s={`${title(e, lang)} ${e.venueName} ${label(DISTRICTS, e.district, lang)}`.toLowerCase()}>
          <EventCard e={e} taken={taken.get(e.id) ?? 0} v={v} mine={myStatus.get(e.id)} cover={covers.get(e.id)} feat={!mapView && i === 0} />
        </div>
      ))
    );

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
      />,
    );
  }

  return page(
    c,
    { title: t("ค้นหากิจกรรม", "Discover"), tab: "events" },
    <>
      <p class="eyebrow">{t("กลุ่มเล็ก สถานที่จริง ไม่ต้องปัดหา", "Small groups, real places, no swiping")}</p>
      <h1>{t("สัปดาห์นี้ในกรุงเทพฯ ทำอะไรดี?", "What can I do in Bangkok this week?")}</h1>
      <div class="seg-row">
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
        <nav class="seg views" aria-label={t("มุมมอง", "View")}>
          <a href={mapHref}>{t("แผนที่", "Map")}</a>
          <a href={listHref} class="on" aria-current="page">
            {t("รายการ", "List")}
          </a>
        </nav>
      </div>
      {user.profile.newcomer ? (
        <Card class="hint">
          <strong>{t("เพิ่งย้ายมากรุงเทพฯ ใช่ไหม? 👋", "New to Bangkok? 👋")}</strong>
          <p>
            {t("ลองกิจกรรม 'มาใหม่ในกรุงเทพฯ' — ทุกคนมาคนเดียวเหมือนกัน", "Try a 'New to Bangkok' meet-up — everyone arrives on their own.")}{" "}
            <a href="/events?tag=newcomers">{t("ดูกิจกรรมสำหรับคนมาใหม่", "See newcomer events")}</a>
          </p>
        </Card>
      ) : null}
      {myVibe.length === 0 ? (
        <Card class="hint quiz-hint">
          <div class="spread">
            <a href="/quiz">
              <strong>{t("🧭 ค้นหา Bangkok Type ของคุณ (2 นาที)", "🧭 Find your Bangkok Type (2 min)")}</strong>
            </a>
            <form method="post" action="/events/quiz-hint/dismiss">
              <button type="submit" class="btn ghost" aria-label={t("ซ่อนการ์ดนี้", "Hide this card")}>
                ✕
              </button>
            </form>
          </div>
          <p class="muted">{t("แบบทดสอบไลฟ์สไตล์สั้น ๆ ช่วยจัดโต๊ะให้เข้ากับคุณ ไม่มีเรื่องการเมือง เป็นความลับจนกว่าคุณจะเลือกแสดง", "A short lifestyle quiz that helps seat you at the right table. Nothing political, and private unless you choose to show it.")}</p>
        </Card>
      ) : null}
      <details open={filtered}>
        <summary>{t("ตัวกรอง", "Filters")}</summary>
        {filtersForm}
      </details>
      <section id="discover-list" class="discover-list" aria-label={t("รายการกิจกรรม", "Event list")}>
        {cards}
      </section>
    </>,
  );
});

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
    out.push({ icon: w.rain3h >= 60 ? "🌧️" : "⛅", text: t(`โอกาสฝน 3 ชม. ${w.rain3h}%${w.rain24h != null ? ` · ฝน 24 ชม.ข้างหน้า ${w.rain24h} มม.` : ""}`, `Rain chance next 3h ${w.rain3h}%${w.rain24h != null ? ` · next 24h ${w.rain24h} mm` : ""}`), tone: w.rain3h >= 60 ? "warn" : undefined });
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
  if (!p.hasVibe) out.push({ icon: "🧩", text: t("ค้นหา Bangkok Type ของคุณ (2 นาที)", "Find your Bangkok Type (2 min)"), href: "/quiz" });
  out.push({ icon: "🤝", text: t("ความยินยอม: ‘ใช่’ ต้องชัดเจน เต็มใจ เปลี่ยนใจได้", "Consent: a real yes is clear, free and can change"), href: "/learn/consent" });
  out.push({ icon: "🛡️", text: t("ฉุกเฉินโทร 191 · เจ็บป่วย 1669", "Emergency 191 · medical 1669"), href: "/learn/date-responsibly" });
  out.push({ icon: "⚠️", text: t("ต้นแบบ: ห้ามใช้ข้อมูลส่วนตัวจริง", "Prototype: please don't use real personal data") });
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

// -------------------------------------------------------------- detail --

/** The event, or null when it doesn't exist or this viewer may not see it. */
async function visibleEvent(c: Ctx, id: string): Promise<Event | null> {
  const db = getDb(c.env);
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return null;
  if (event.status === "published" || c.var.user!.account.role !== "user") return event;
  if (event.status === "cancelled") {
    // People who had registered can still see that it was cancelled.
    const [reg] = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.eventId, id), eq(registrations.accountId, c.var.user!.account.id)))
      .limit(1);
    if (reg) return event;
  }
  return null;
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
      <LinkButton href="/events" kind="ghost">{t("← กลับไปหน้ากิจกรรม", "← Back to events")}</LinkButton>
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
  const rows = await db
    .select({ nickname: profiles.nickname })
    .from(profiles)
    .where(inArray(profiles.accountId, visible))
    .limit(10);
  return rows.map((r) => r.nickname);
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
        {props.event.safetyInfo ? ` — ${props.event.safetyInfo}` : ""}
      </p>
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

  const [reg, state, host, buddies, standingRows, cover] = await Promise.all([
    myRegistration(db, event.id, user.account.id),
    seatState(db, event),
    event.hostAccountId
      ? db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, event.hostAccountId)).limit(1)
      : Promise.resolve([] as { nickname: string }[]),
    buddyNicknames(db, event, user.account.id, now),
    myStrikes(db, user.account.id),
    coverSrc(c.env, event),
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

  return page(
    c,
    { title: title(event, lang), tab: "events", status: opts.status },
    <>
      {opts.error ? <Notice kind="error">{opts.error}</Notice> : null}
      {event.status === "cancelled" ? (
        <Notice kind="warn">{t("กิจกรรมนี้ถูกยกเลิกแล้ว ขออภัยในความไม่สะดวก", "This event has been cancelled. Sorry for the change of plans.")}</Notice>
      ) : null}
      {event.status === "draft" ? <Notice kind="info">{t("ฉบับร่าง — ผู้ใช้ทั่วไปยังไม่เห็น", "Draft — members can't see this yet")}</Notice> : null}
      <Cover e={event} src={cover} class="ev-scene" />
      <Card class="ev-sheet">
        <p class="eyebrow">{eyebrow(event, t, lang)}</p>
        <h1>{title(event, lang)}</h1>
        {quest ? (
          <p>
            <Tag tone="accent">🧭 City Quest</Tag> {quest}
          </p>
        ) : null}
        <div class="kv">
          <div>
            {t("เมื่อไหร่", "When")}
            <b>{fmtDate(event.startsAt, lang)}</b>
            {t(`ถึง ${fmtParts(event.endsAt, lang).time}`, `until ${fmtParts(event.endsAt, lang).time}`)}
          </div>
          <div>
            {t("ที่ไหน", "Where")}
            <b>{event.venueName}</b>
            {label(DISTRICTS, event.district, lang)}
          </div>
          <div>
            {t("กลุ่ม", "Group")}
            <b>{t(`โต๊ะละ ${event.groupMin}–${event.groupMax} คน`, `Tables of ${event.groupMin}–${event.groupMax}`)}</b>
            {label(INTENSITY, event.intensity, lang)}
          </div>
          <div>
            {t("ที่นั่ง", "Spots")}
            <b>{left > 0 ? t(`เหลือ ${left} ที่`, `${left} left`) : t("เต็มแล้ว", "Full")}</b>
            {t(`จาก ${event.capacity} ที่`, `of ${event.capacity}`)}
          </div>
        </div>
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
        <div class="tags">
          <SpotsTag e={event} taken={state.taken} t={t} />
          {event.tags.map((tag) => (
            <Tag tone="muted">{label(EVENT_TAGS, tag, lang)}</Tag>
          ))}
        </div>
        <p style="white-space:pre-line">{description(event, lang)}</p>
      </Card>

      <Card>
        <h2>{t("รายละเอียด", "Details")}</h2>
        <dl class="facts">
          <dt>{t("ผู้จัด / โฮสต์", "Host")}</dt>
          <dd>{host[0]?.nickname ?? t("ทีม Jurrgun", "Jurrgun team")}</dd>
          <dt>{t("จำนวนที่นั่ง", "Capacity")}</dt>
          <dd>
            {event.capacity} · {left > 0 ? t(`เหลือ ${left} ที่`, `${left} left`) : t("เต็ม — มีคิวสำรอง", "Full — waitlist open")}
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
                {t("ชำระนอกแอป ที่สถานที่หรือกับพาร์ตเนอร์", "Paid off-platform, at the venue or to the partner.")}
                {event.paymentNote ? ` ${event.paymentNote}` : ""}
              </small>
            ) : null}
          </dd>
          <dt>{t("ความคึกคัก", "Social intensity")}</dt>
          <dd>{label(INTENSITY, event.intensity, lang)}</dd>
          <dt>{t("ขนาดกลุ่ม", "Group size")}</dt>
          <dd>{t(`โต๊ะละ ${event.groupMin}–${event.groupMax} คน`, `Tables of ${event.groupMin}–${event.groupMax}`)}</dd>
          <dt>{t("ชวนเพื่อนมาได้ (+1)", "Bring a friend (+1)")}</dt>
          <dd>{event.plusOneAllowed ? t("ได้", "Yes") : t("ไม่ได้", "No")}</dd>
          <dt>{t("การเข้าถึง", "Accessibility")}</dt>
          <dd>{event.accessibility || t("สอบถามโฮสต์ได้", "Ask the host")}</dd>
          <dt>{t("จุดนัดพบและความปลอดภัย", "Meeting point & safety")}</dt>
          <dd>{event.safetyInfo || t("โฮสต์จะแจ้งก่อนงาน", "Your host will share it before the event")}</dd>
          <dt>{t("ติดต่อฉุกเฉิน", "Emergency contact")}</dt>
          <dd>{event.emergencyContact || "1555 (กทม. / BMA)"}</dd>
          {event.residentQuota > 0 || event.residentPriority ? (
            <>
              <dt>{t("สิทธิ์ผู้มีทะเบียนบ้าน กทม.", "Bangkok resident priority")}</dt>
              <dd>
                {event.residentQuota > 0
                  ? t(`กันไว้ ${event.residentQuota} ที่สำหรับผู้มีทะเบียนบ้านในกรุงเทพฯ ที่ยืนยันแล้ว`, `${event.residentQuota} seats held for verified Bangkok-registered residents`)
                  : t("ผู้มีทะเบียนบ้าน กทม. ได้คิวสำรองก่อน", "Verified residents go first on the waitlist")}
              </dd>
            </>
          ) : null}
        </dl>
      </Card>

      <BuddyBox names={buddies} event={event} t={t} />

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
    </>,
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
        <p class="muted">{t("สร้างลิงก์ให้เพื่อนลงทะเบียนเป็น +1 ของคุณ ใช้ได้ 1 ครั้ง", "Make a link your friend can use to sign up as your +1. It works once.")}</p>
        <Button kind="ghost">{t("ชวนเพื่อน", "Invite a friend")}</Button>
      </form>
    );
  }
  const text = t(`มากิจกรรม "${title(props.event, "th")}" ด้วยกันไหม? ลงทะเบียนเป็น +1 ของฉันได้ที่ลิงก์นี้`, `Come to "${title(props.event, "en")}" with me? Sign up as my +1 here:`);
  const line = `https://line.me/R/msg/text/?${encodeURIComponent(`${text} ${props.url}`)}`;
  return (
    <div id="invite" class="invite-box" data-url={props.url} data-text={text} lang={lang}>
      <h3>{t("ชวนเพื่อนมาด้วย (+1)", "Invite a friend (+1)")}</h3>
      <p class="muted">{t("ส่งลิงก์นี้ให้เพื่อน 1 คน เพื่อนจะลงทะเบียนเป็น +1 ของคุณ ลิงก์ใช้ได้ครั้งเดียว", "Send this link to one friend. They sign up as your +1. The link works once.")}</p>
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
                  ? t("เหลือไม่ถึง 24 ชม. — ยกเลิกตอนนี้นับเป็น 1 strike", "Less than 24h to go — cancelling now counts as 1 strike.")
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
          {props.waitPos ? t(`ประมาณคิวที่ ${props.waitPos}`, `About #${props.waitPos} in line`) : null}
        </p>
        <p class="muted">{t("ถ้ามีที่ว่าง เราจะแจ้งคุณ และคุณมีเวลา 12 ชม. ในการยืนยัน", "If a spot opens we'll notify you, and you'll have 12 hours to confirm.")}</p>
        <form method="post" action={`${base}/cancel`}>
          <Button kind="ghost">{t("ออกจากรายชื่อสำรอง", "Leave the waitlist")}</Button>
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
    return <p class="muted">{started ? t("กิจกรรมเริ่มแล้ว ปิดรับลงทะเบียน", "This event has started — registration is closed.") : t("ปิดรับลงทะเบียน", "Registration is closed.")}</p>;
  }

  return (
    <>
      {status === "cancelled" || status === "late_cancelled" ? <p class="muted">{t("คุณยกเลิกไปแล้ว ลงทะเบียนใหม่ได้ถ้ายังมีที่", "You cancelled — you can sign up again if there's room.")}</p> : null}
      {props.standing.blockedUntil ? (
        <Notice kind="warn">
          {t(`คุณมี ${props.standing.active} strikes — ลงทะเบียนได้อีกครั้งหลัง ${fmtDate(props.standing.blockedUntil, lang)}`, `You have ${props.standing.active} strikes — you can RSVP again after ${fmtDate(props.standing.blockedUntil, lang)}`)}
        </Notice>
      ) : null}
      <form method="post" action={`${base}/rsvp`}>
        {event.buddyEnabled ? (
          <Toggle name="wantsBuddy" label={t("หาบัดดี้ให้ฉันในงานนี้", "Find me a buddy for this event")} hint={t("จับคู่ 48 ชม. ก่อนงาน เห็นแค่ชื่อเล่น ไม่ใช่การจับคู่เดต", "Paired 48h before. Nicknames only — never a date.")} />
        ) : null}
        {event.plusOneAllowed ? (
          <Field
            label={t("มากับเพื่อน? ใส่ชื่อผู้ใช้ของเพื่อน (ไม่บังคับ)", "Bringing a friend? Their username (optional)")}
            name="plusOneUsername"
            maxlength={30}
            hint={t("เพื่อนต้องลงทะเบียนเองและใส่ชื่อผู้ใช้ของคุณด้วย", "Your friend RSVPs too and enters your username.")}
          />
        ) : null}
        <Button>{t("ลงทะเบียนเข้าร่วม", "RSVP")}</Button>
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
    return no(`กิจกรรมนี้สำหรับอายุ ${event.ageMin}–${event.ageMax} ปี`, `This event is for ages ${event.ageMin}–${event.ageMax}.`, 403);
  }

  const existing = await myRegistration(db, event.id, user.account.id);
  if (existing && (ACTIVE as readonly string[]).includes(existing.status)) return { refusal: null, existing, active: true };

  const standing = strikeStanding(await myStrikes(db, user.account.id), now);
  if (standing.blockedUntil) {
    return no(
      `คุณมี ${standing.active} strikes จึงลงทะเบียนได้อีกครั้งหลัง ${fmtDate(standing.blockedUntil, "th")}`,
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
        "คุณมี 2 strikes จึงจองล่วงหน้าได้ครั้งละ 1 กิจกรรม — ยกเลิกหรือรอให้กิจกรรมเดิมจบก่อน",
        "With 2 strikes you can hold only 1 upcoming RSVP at a time — cancel it or wait until it's over.",
        403,
      );
    }
  }
  return { refusal: null, existing, active: false };
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
      : notify(db, user.account.id, "waitlist", `อยู่ในรายชื่อสำรอง: ${event.title}`, `Waitlisted: ${event.titleEn ?? event.title}`, `/events/${id}`),
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
    return renderDetail(c, event, { error: t("กิจกรรมเริ่มแล้ว ยกเลิกไม่ได้", "The event has started — it can't be cancelled now."), status: 400 });
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
  const reg = await myRegistration(db, id, user.account.id);
  if (!reg || reg.status !== "offered" || !reg.offeredUntil || reg.offeredUntil.getTime() <= now.getTime() || event.startsAt.getTime() <= now.getTime()) {
    await refreshWaitlist(c.env, id, now);
    return renderDetail(c, event, { error: t("ข้อเสนอนี้หมดอายุแล้ว", "This offer has expired."), status: 409 });
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
  const standing = strikeStanding(strikeRows, now);
  const activeStrikes = strikeRows.filter((s) => !s.waivedBy && s.expiresAt.getTime() > now.getTime());

  return page(
    c,
    { title: t("กิจกรรมของฉัน", "My events"), tab: "mine" },
    <>
      <h1>{t("กิจกรรมของฉัน", "My events")}</h1>
      {standing.active > 0 ? (
        <Card class="strikes">
          <h2>{t("สถานะ strike ของคุณ (เห็นเฉพาะคุณ)", "Your strikes (only you can see this)")}</h2>
          <p>
            {t(`strike ที่ยังมีผล: ${standing.active}`, `Active strikes: ${standing.active}`)}
          </p>
          <ul>
            {activeStrikes.map((s) => (
              <li>
                {s.reason === "late_cancel" ? t("ยกเลิกช้า", "Late cancel") : t("ไม่มาตามนัด", "No-show")} —{" "}
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
              {t("ตอนนี้จองล่วงหน้าได้ครั้งละ 1 กิจกรรม และไม่ได้สิทธิ์คิวสำรองก่อน", "For now you can hold 1 upcoming RSVP at a time, and you lose waitlist priority.")}
            </Notice>
          ) : (
            <p class="muted">{t("ถ้ามี 2 strikes จะจองได้ครั้งละ 1 กิจกรรม และ 3 strikes จะงดลงทะเบียน 30 วัน", "At 2 strikes you can hold 1 RSVP at a time; at 3 you can't RSVP for 30 days.")}</p>
          )}
          <p class="muted">{t("ยกเลิกก่อนงาน 24 ชม. ขึ้นไปไม่นับ strike · strike หมดอายุใน 90 วัน", "Cancelling 24h+ ahead is free · strikes expire after 90 days")}</p>
        </Card>
      ) : null}

      <h2>{t("กำลังจะมาถึง", "Upcoming")}</h2>
      {upcoming.length === 0 ? (
        <Empty>
          {t("ยังไม่มีกิจกรรม", "Nothing booked yet.")} <a href="/events">{t("ค้นหากิจกรรม", "Find something to do")}</a>
        </Empty>
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

      <h2>{t("ที่ผ่านมา", "Past")}</h2>
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
                    <LinkButton href={`/events/${event.id}/people`}>{t("คนที่ได้เจอ", "People I met")}</LinkButton>
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
  return page(
    c,
    { title: t("บัตรเข้างาน", "Event pass"), tab: "mine" },
    <>
      <section class="ticket" aria-label={t("บัตรเข้างาน", "Event pass")}>
        <div class="ticket-top">
          <p class="eyebrow">{t("บัตรเข้างาน", "Event pass")} · {user.profile.nickname}</p>
          <h1>{title(event, lang)}</h1>
          <p>
            {fmtDate(event.startsAt, lang)} · {event.venueName}
            {event.venueAddress ? `, ${event.venueAddress}` : ""}
          </p>
        </div>
        <div class="ticket-perf" aria-hidden="true" />
        <div class="ticket-body">
          <div
            role="img"
            aria-label={t("คิวอาร์โค้ดบัตรเข้างาน ให้โฮสต์สแกน", "Event pass QR code for the host to scan")}
            dangerouslySetInnerHTML={{ __html: qrSvg(`bkksocial:pass:${reg.passToken}`) }}
          />
          <p class="code">{shortCode(reg.passToken)}</p>
          <p class="muted">{t("ถ้าสแกนไม่ได้ ให้โฮสต์ใส่รหัสนี้ · อย่าแชร์บัตรนี้", "If the scan fails, the host can type this code · don't share this pass")}</p>
          {reg.checkedInAt ? <Tag tone="ok">{t("เช็กอินแล้ว", "Checked in")}</Tag> : null}
        </div>
      </section>
      <ol class="next-steps" aria-label={t("ขั้นตอนต่อไป", "What happens next")}>
        <li class="done">
          <span>
            <b>{t("ได้ที่นั่งแล้ว", "You have a spot")}</b>
            <small>{t("โต๊ะจะจัดก่อนงานเริ่ม", "Tables are set before the start")}</small>
          </span>
        </li>
        <li class={reg.checkedInAt ? "done" : undefined}>
          <span>
            <b>{t("เช็กอินกับโฮสต์", "Check in with your host")}</b>
            <small>
              {event.safetyInfo
                ? t(`เปิด 30 นาทีก่อนเริ่ม · จุดนัดพบ: ${event.safetyInfo}`, `Opens 30 min before the start · Meet: ${event.safetyInfo}`)
                : t("เปิด 30 นาทีก่อนเริ่ม", "Opens 30 min before the start")}
            </small>
          </span>
        </li>
        <li>
          <span>
            <b>{t("คนที่ได้เจอ", "People I met")}</b>
            <small>
              {t(
                `เปิดหลังจบงาน ${PEOPLE_WINDOW_HOURS} ชม. จะเชื่อมต่อกันก็ต่อเมื่อเลือกกันทั้งสองฝ่าย`,
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
      <p class="muted">{t("เช็กอินแล้ว ขอให้สนุก!", "You're checked in — enjoy!")}</p>

      <Card>
        <h2>{t("โต๊ะ / กลุ่มของฉัน", "My table")}</h2>
        {event.groupsPublishedAt && reg.groupNo !== null ? (
          <>
            <p>
              <Tag tone="accent">{t(`กลุ่มที่ ${reg.groupNo}`, `Group ${reg.groupNo}`)}</Tag>
            </p>
            {mates.length === 0 ? (
              <Empty>{t("ยังไม่มีสมาชิกคนอื่นในกลุ่ม", "No one else in your group yet.")}</Empty>
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
                          <Tag>{label(SIGNALS, m.signal, lang)}</Tag>
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
          <p class="muted">{t("โฮสต์จะจัดกลุ่มหลังเช็กอินปิด", "Your host will announce groups once check-in closes.")}</p>
        )}
      </Card>

      {event.activePrompt ? (
        <Card class="prompt">
          <h2>💡 {t("โจทย์จากโฮสต์", "Icebreaker from your host")}</h2>
          <p>{event.activePrompt}</p>
        </Card>
      ) : null}

      <BuddyBox names={buddies} event={event} t={t} />

      <Card>
        <h2>{t("สัญญาณทักทายของฉัน", "My social signal")}</h2>
        <p class="muted">{t("ไม่บังคับ เปลี่ยนได้ตลอด คนในกลุ่มจะเห็น", "Optional and easy to change. Your group can see it.")}</p>
        <form method="post" action={`/events/${id}/signal`}>
          <Choices legend={t("เลือกสัญญาณ", "Pick a signal")} name="signal" type="radio" options={opts} values={[reg.socialSignal ?? ""]} lang={lang} />
          <Field
            label={t("คุยเรื่องนี้กับฉันได้ (คั่นด้วยจุลภาค สูงสุด 3)", "Talk to me about (comma-separated, up to 3)")}
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
          {t("ไม่สบายใจ? บอกโฮสต์ได้ทันที หรือ", "Feeling uncomfortable? Tell your host any time, or")} <a href="/report">{t("แจ้งรายงาน", "make a report")}</a>
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
  if (!reg) return { event, reg: null, error: forbidden(c, "ให้ความคิดเห็นได้เฉพาะผู้ที่เช็กอินแล้ว", "Only checked-in attendees can give feedback.", `/events/${id}`) };
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
        <Choices legend={t("อยากเจอใครสักคนอีกไหม?", "Would you meet someone from today again?")} name="wouldMeetAgain" type="radio" options={YES_NO} values={[val.wouldMeetAgain ?? ""]} lang={lang} required />
        <Choices legend={t("รู้สึกปลอดภัยแค่ไหน (1–5)", "How safe did you feel? (1–5)")} name="feltSafe" type="radio" options={SCALE} values={[val.feltSafe ?? ""]} lang={lang} required />
        <Choices legend={t("ให้คะแนนโต๊ะ/กลุ่มของคุณ (1–5)", "Rate your table (1–5)")} name="groupRating" type="radio" options={SCALE} values={[val.groupRating ?? ""]} lang={lang} required />
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
  const data = { metNewPerson: met, wouldMeetAgain: again, feltSafe: safe, groupRating: rating, comment: vals.comment };
  const db = getDb(c.env);
  await db
    .insert(feedback)
    .values({ id: newId(), eventId: id, accountId: user.account.id, ...data })
    .onConflictDoUpdate({ target: [feedback.eventId, feedback.accountId], set: data });
  return c.redirect("/me/events?notice=thanks");
});
