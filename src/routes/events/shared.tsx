/**
 * Events, shared part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { HELLO_MAX, helloPrompt } from "../../domain/hello";
import { isGoTogether, ViaLine } from "../../ui/go-together";
import { OPEN_TO_MORE_TAG, WOMEN_ONLY_TAG, womenOnlyEventVisible } from "../../domain/rules";
import { type Context } from "hono";
import { type AnyColumn, and, asc, count, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { romanceEligible } from "../../domain/rules";
import { DISTRICTS, EVENT_TAGS, LANGUAGES, VISITBANGKOK_ROUTES, label } from "../../lib/constants";
import type { AppEnv, CurrentUser } from "../../lib/env";
import { fmtParts, type Lang, type T } from "../../lib/i18n";
import { eventPlace } from "../../lib/places";
import { blocks, events, profiles, registrations, strikes, type Event, type Profile } from "../../schema";
import { SEAT_STATUSES } from "../../services/events";
import { getObjectUrl } from "../../storage";
import { Button, Card, Field, Tag, type View, FactIcon } from "../../ui/kit";
import { noOpenInvite } from "../../services/collabs";


export type Ctx = Context<AppEnv>;
export type Db = ReturnType<typeof getDb>;

const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const BKK_OFFSET = 7 * HOUR;
/** Registration statuses that hold (or wait for) a place. */
export const ACTIVE = ["confirmed", "offered", "waitlisted"] as const;

// ------------------------------------------------------------- helpers --

export function me(c: Ctx): CurrentUser & { profile: NonNullable<CurrentUser["profile"]> } {
  return c.var.user! as CurrentUser & { profile: NonNullable<CurrentUser["profile"]> };
}

export function title(e: Event, lang: Lang): string {
  return lang === "en" && e.titleEn ? e.titleEn : e.title;
}

export function description(e: Event, lang: Lang): string {
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
  if (e.costThb === 0 && e.sourceName) return t(`โต๊ะฟรี บัตรซื้อที่ ${e.sourceName}`, `Table free, ticket on ${e.sourceName}`);
  return e.costThb > 0 ? `฿${e.costThb}` : t("ฟรี", "Free");
}

export function langsText(e: Event, lang: Lang): string {
  return e.languages.map((l) => label(LANGUAGES, l, lang)).join(" · ");
}

export function questLabel(e: Event, lang: Lang): string | null {
  if (!e.visitBangkokRoute) return null;
  const r = VISITBANGKOK_ROUTES.find((x) => x.value === e.visitBangkokRoute);
  return r ? (lang === "en" ? r.en : r.th) : e.visitBangkokRoute;
}

export function coverEmoji(e: Pick<Event, "tags">): string {
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
export const QUIZ_HINT_COOKIE = "bkk_quiz_hint";
export const FOR_YOU_COOKIE = "bkk_for_you";
/** Laptops: the filter rail starts open, since there is room for it. */
export const RAIL_OPEN_JS = `(function(){try{var bar=document.querySelector(".disc-bar"),mark=document.querySelector(".disc-mark");if(!bar)return;
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

/** The colours of an event's scene cover, from its category: park is green, food and play (nights) mango, river and art (culture, language) sky, city cream. */
function sceneOf(e: Event): string {
  const tags = e.tags;
  if (tags.includes("food")) return "food";
  if (tags.includes("run") || tags.includes("walk") || tags.includes("pets") || tags.includes("volunteer")) return "park";
  if (tags.includes("city_quest") || tags.includes("language_exchange")) return "river";
  if (tags.includes("art")) return "art";
  if (tags.includes("board_game")) return "play";
  return "city";
}

export function DateBlock(props: { d: Date; lang: Lang }) {
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

export function Cover(props: { e: Event; src?: string | null; lang?: Lang; class?: string }) {
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
export const DISCOVER_MEMORY_JS = `(function(){try{var k="bkk-discover",p=new URLSearchParams(location.search);
if(!location.search){var s=localStorage.getItem(k);if(s&&s!=="view=map")location.replace("/?"+s);return}
if(!p.has("view")&&!p.has("when"))return;var o=new URLSearchParams();o.set("view",p.get("view")==="list"?"list":"map");var w=p.get("when");if(w&&w!=="all")o.set("when",w);
localStorage.setItem(k,o.toString())}catch(e){}})()`;

/** "Free" / "฿250", and the first category, for the line above a title. */
export function eyebrow(e: Event, t: T, lang: Lang): string {
  const first = e.tags[0];
  // Going together: the ticket is bought at the source, so "Free" would mislead; only a table cost shows.
  if (isGoTogether(e)) return [t("ไปด้วยกัน", "Go together"), e.costThb > 0 ? costText(e, t) : null].filter(Boolean).join(" · ");
  return [first ? label(EVENT_TAGS, first, lang) : null, costText(e, t)].filter(Boolean).join(" · ");
}

export function ShieldIcon() {
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
    left <= 3 ? (
      <Tag tone="warn">⏳ {props.t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`)}</Tag>
    ) : (
      <Tag>{props.t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`)}</Tag>
    )
  ) : (
    <Tag tone="warn">{props.t("เต็มแล้ว ต่อคิวสำรองได้", "Full, join the waitlist")}</Tag>
  );
}

/** A row of seats: filled ones taken, open ones left (up to 16 drawn, then "+n"). */
export function Seats(props: { capacity: number; taken: number }) {
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

export function EventCard(props: { e: Event; taken: number; v: View; mine?: string; cover?: string | null; feat?: boolean; pick?: boolean; partners?: string[] }) {
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
        <ViaLine e={e} t={t} />
        {props.partners && props.partners.length > 1 ? <p class="ev-via">🤝 {t(`ร่วมกับ ${props.partners.join(" + ")}`, `With ${props.partners.join(" + ")}`)}</p> : null}
        <Seats capacity={e.capacity} taken={props.taken} />
        <div class="tags">
          {props.pick ? <Tag tone="ok">⭐ {t("เลือกให้คุณ", "Your pick")}</Tag> : null}
          <SpotsTag e={e} taken={props.taken} t={t} />
          {quest ? <Tag tone="accent">🧭 {t("ซิตี้เควสต์", "City Quest")}</Tag> : null}
          {e.plusOneAllowed ? <Tag>{t("ชวนเพื่อนมาได้ +1", "+1 welcome")}</Tag> : null}
          {e.residentPriority || e.residentQuota > 0 ? <Tag tone="muted">{t("🏙️ สิทธิ์ผู้มีทะเบียนบ้าน กทม.", "🏙️ Resident priority")}</Tag> : null}
        </div>
      </div>
    </Card>
  );
}

export function statusLabel(status: string, t: T): string {
  switch (status) {
    case "confirmed":
      return t("ยืนยันแล้ว", "Confirmed");
    case "waitlisted":
      return t("⏳ อยู่ในคิวสำรอง", "⏳ Waitlisted");
    case "offered":
      return t("มีที่ว่างรอคุณ", "Spot offered");
    case "late_cancelled":
      return t("ยกเลิกกระชั้นชิด", "Late cancel");
    default:
      return t("ยกเลิกแล้ว", "Cancelled");
  }
}

/** The next `n` public events this member may see, with seats taken and covers, for an empty My events. */
export async function nextEvents(env: AppEnv["Bindings"], db: Db, profile: Profile, now: Date, n: number) {
  const where = [eq(events.status, "published"), eq(events.visibility, "public"), gt(events.startsAt, now), noOpenInvite()];
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
export async function takenCounts(db: Db, ids: string[]): Promise<Map<string, number>> {
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

export async function myStrikes(db: Db, accountId: string) {
  return db
    .select({ createdAt: strikes.createdAt, expiresAt: strikes.expiresAt, waivedBy: strikes.waivedBy, reason: strikes.reason })
    .from(strikes)
    .where(eq(strikes.accountId, accountId))
    .limit(100);
}

/** Block pairs between me and any of `others`, both directions. */
export async function blockedWith(db: Db, mine: string, others: string[]): Promise<Set<string>> {
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
export function jsonHas(col: AnyColumn, value: string) {
  return sql`(case when jsonb_typeof(${col}) = 'string' then (${col} #>> '{}')::jsonb else ${col} end) @> jsonb_build_array(${value}::text)`;
}


export function HelloBox(props: { t: T; lang: Lang; event: Event; mine: string | null; lines: { nickname: string; line: string }[] }) {
  const { t, lang } = props;
  const prompt = helloPrompt(props.event.tags);
  return (
    <Card class="hello">
      <h2 class="h3" id="hello">👋 {t("ทักกันก่อน", "Say hi first")}</h2>
      <p>{lang === "th" ? prompt.th : prompt.en}</p>
      {props.lines.length ? (
        <ul>
          {props.lines.map((x) => (
            <li>
              <strong>{x.nickname}</strong> {x.line}
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted">{t("ยังไม่มีใครทัก คุณเริ่มก่อนก็ได้นะ", "No one has said hi yet. You could be first.")}</p>
      )}
      <form method="post" action={`/events/${props.event.id}/hello`}>
        <Field label={t("หนึ่งบรรทัดของคุณ", "Your one line")} name="hello" value={props.mine ?? ""} maxlength={HELLO_MAX} />
        <Button>{t("บันทึก", "Save")}</Button>
      </form>
      <p class="muted">{t("ไม่บังคับ เห็นเฉพาะคนที่ไปงานนี้ ลบเองหลังงาน 7 วัน", "Optional. Only the people going see it, and it's deleted 7 days after.")}</p>
    </Card>
  );
}

/**
 * "Say hi first" (owner card 10-16): the lines of the other people going, or
 * only those at your own table once groups are out. Blocked people never show.
 */
export async function helloLines(db: Db, event: Event, reg: { groupNo: number | null }, mine: string): Promise<{ nickname: string; line: string }[]> {
  const sameTable = event.groupsPublishedAt && reg.groupNo !== null;
  const rows = await db
    .select({ accountId: registrations.accountId, line: registrations.helloLine, nickname: profiles.nickname })
    .from(registrations)
    .innerJoin(profiles, eq(profiles.accountId, registrations.accountId))
    .where(
      and(
        eq(registrations.eventId, event.id),
        eq(registrations.status, "confirmed"),
        ne(registrations.accountId, mine),
        isNotNull(registrations.helloLine),
        ...(sameTable ? [eq(registrations.groupNo, reg.groupNo!)] : []),
      ),
    )
    .limit(40);
  const hidden = await blockedWith(db, mine, rows.map((r) => r.accountId));
  return rows.filter((r) => !hidden.has(r.accountId) && r.line).map((r) => ({ nickname: firstName(r.nickname), line: r.line! }));
}

/** The first word of a nickname: the host's first name, nothing more. */
export function firstName(nickname: string): string {
  return nickname.trim().split(/\s+/)[0] ?? nickname;
}

/** Consecutive items under one month heading, in the order given (newest first on My events). */
export function byMonth<X>(items: X[], month: (x: X) => string): [string, X[]][] {
  const out: [string, X[]][] = [];
  for (const x of items) {
    const m = month(x);
    const last = out[out.length - 1];
    if (last && last[0] === m) last[1].push(x);
    else out.push([m, [x]]);
  }
  return out;
}
