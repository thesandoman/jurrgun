/**
 * Events, discover part (split from routes/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { pulseGlance, weatherBits } from "../pulse";
import { segmentOf, type Segment } from "../../domain/segment";
import { OPEN_TO_MORE_TAG, WOMEN_ONLY_TAG, womenOnlyEventVisible } from "../../domain/rules";
import { weekKey } from "../../domain/buddy";
import { cleanBio } from "../../content/profile";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import { and, asc, eq, gt, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { ageOn, romanceEligible } from "../../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, label, values, districtsAZ } from "../../lib/constants";
import type { AppEnv, CurrentUser } from "../../lib/env";
import { fmtDate, fmtParts, type Lang, type T } from "../../lib/i18n";
import { eventPlace } from "../../lib/places";
import { requireMember } from "../../lib/session";
import { events, profiles, registrations, vibes, type Event, weeklyPlans, type Profile } from "../../schema";
import { Button, Card, Empty, LinkButton, page, safeNext, Select, str, Toggle, view, ViewSwitch, type View, PULSE_ICON } from "../../ui/kit";
import { FullDiscover, NoEventsYet, sheetCopy, type MapChip, type MapPoint } from "../../ui/discover-map";
import { collabNamesFor } from "../../services/collabs";
import { listableBase } from "../../services/events";
import { hasConsent, NOTIFICATIONS_CONSENT } from "../../services/consent";
import { vapidKeys } from "../../services/push";
import { DISTRICT_ALERT_ON, districtName } from "../../domain/district-alert";
import { audit } from "../../lib/records";
import { eventRoutes } from "./app";
import {
  ACTIVE,
  DISCOVER_MEMORY_JS,
  EventCard,
  FOR_YOU_COOKIE,
  INVITE_COOKIE,
  INVITE_TOKEN_RE,
  QUIZ_HINT_COOKIE,
  RAIL_OPEN_JS,
  costText,
  coverEmoji,
  coverSrc,
  jsonHas,
  me,
  statusLabel,
  takenCounts,
  title,
  whenWindow,
} from "./shared";
import type { Db } from "./shared";

// ------------------------------------------------------------ discover --

/** Small tables filter: at most this many seats in the whole event (the host form's default size). */
export const SMALL_TABLE_MAX = 8;

const WHEN_OPTS = [
  { value: "all", th: "ทั้งหมด", en: "Any time" },
  { value: "today", th: "วันนี้", en: "Today" },
  { value: "week", th: "สัปดาห์นี้", en: "This week" },
  { value: "weekend", th: "สุดสัปดาห์นี้", en: "This weekend" },
];

/**
 * What Discover may list for this member at all, before any filter: the list
 * and its popular picks both start here. Private events open only through
 * their link; dating events exist only with romance mode on (romanceEventOk);
 * women-only events are listed only for women and non-binary members (and
 * anyone who hasn't said).
 */
function listable(profile: Profile, now: Date) {
  const where = listableBase(now);
  if (!romanceEligible(profile)) where.push(sql`not ${jsonHas(events.tags, OPEN_TO_MORE_TAG)}`);
  if (!womenOnlyEventVisible([WOMEN_ONLY_TAG], profile)) where.push(sql`not ${jsonHas(events.tags, WOMEN_ONLY_TAG)}`);
  return where;
}

/**
 * Popularity for Discover's picks (owner, 2026-10-17), any category: events
 * with a seat still open first (a pick you can't join helps nobody), then the
 * most seats held (confirmed and offered), then the fullest, then the
 * soonest. Members never see the numbers, only the order.
 */
export function rankPopular<E extends { id: string; capacity: number; startsAt: Date }>(list: E[], taken: Map<string, number>): E[] {
  const held = (e: E) => taken.get(e.id) ?? 0;
  const open = (e: E) => (held(e) < e.capacity ? 1 : 0);
  const fill = (e: E) => held(e) / Math.max(1, e.capacity);
  return [...list].sort((a, b) => open(b) - open(a) || held(b) - held(a) || fill(b) - fill(a) || a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
}

/** How many events lead Discover's list, and how far ahead "this week" looks. */
const PICKS = 3;
const TOP_WEEK = 10;
const WEEK_MS = 7 * 86_400_000;

/**
 * The popular picks and the top 10 this week for this member: upcoming events
 * they may see (listable) and that fit their age, minus the ones they're
 * already going to, ranked by rankPopular. Two queries: the candidates, then
 * seats held and my own seats together.
 */
async function discoverPicks(env: AppEnv["Bindings"], db: Db, user: CurrentUser & { profile: Profile }, now: Date) {
  const age = ageOn(user.profile.birthDate, now);
  const candidates = await db
    .select()
    .from(events)
    .where(and(...listable(user.profile, now), gt(events.startsAt, now), lte(events.ageMin, age), gte(events.ageMax, age)))
    .orderBy(asc(events.startsAt))
    .limit(200);
  const ids = candidates.map((e) => e.id);
  const [taken, going] = await Promise.all([
    takenCounts(db, ids),
    ids.length
      ? db
          .select({ eventId: registrations.eventId })
          .from(registrations)
          .where(and(eq(registrations.accountId, user.account.id), inArray(registrations.eventId, ids), inArray(registrations.status, [...ACTIVE])))
          .limit(200)
      : Promise.resolve([] as { eventId: string }[]),
  ]);
  const mine = new Set(going.map((r) => r.eventId));
  const ranked = rankPopular(
    candidates.filter((e) => !mine.has(e.id)),
    taken,
  );
  // A pick is popular: someone has to be going already.
  const picks = ranked.filter((e) => (taken.get(e.id) ?? 0) > 0).slice(0, PICKS);
  const shown = new Set(picks.map((e) => e.id));
  const week = ranked.filter((e) => !shown.has(e.id) && e.startsAt.getTime() < now.getTime() + WEEK_MS).slice(0, TOP_WEEK);
  const covers = new Map(await Promise.all(picks.filter((e) => e.coverKey).map(async (e) => [e.id, await coverSrc(env, e)] as const)));
  return { picks, week, taken, covers };
}

/** "10 อันดับสัปดาห์นี้ / Top 10 this week": one plain numbered row per event, no card, no score. */
function TopWeek(props: { list: Event[]; taken: Map<string, number>; v: View }) {
  const { t, lang } = props.v;
  return (
    <ol class="top-week" role="list">
      {props.list.map((e) => {
        const p = fmtParts(e.startsAt, lang);
        const left = Math.max(0, e.capacity - (props.taken.get(e.id) ?? 0));
        return (
          <li>
            <a href={`/events/${e.id}`}>
              <span class="tw-title">{title(e, lang)}</span>
              <small>
                {p.weekday} {p.day} · {p.time} · {label(DISTRICTS, e.district, lang)} · {left > 0 ? t(`เหลือ ${left} ที่`, `${left} spot${left === 1 ? "" : "s"} left`) : t("เต็มแล้ว", "Full")}
              </small>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

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
    alcoholFree: c.req.query("alcoholFree") === "1",
    smokeFree: c.req.query("smokeFree") === "1",
    language: c.req.query("language") ?? "",
    intensity: c.req.query("intensity") ?? "",
    plusOne: c.req.query("plusOne") === "1",
    fitsAge: c.req.query("fitsAge") === "1",
    resident: c.req.query("resident") === "1",
    text: (c.req.query("q") ?? "").trim().slice(0, 80),
  };
  const mapView = c.req.query("view") !== "list"; // the map is the default

  const where = listable(user.profile, now);
  const win = whenWindow(q.when, now);
  if (win) where.push(gte(events.startsAt, win[0]), lt(events.startsAt, win[1]));
  if (values(DISTRICTS).includes(q.district)) where.push(eq(events.district, q.district));
  if (values(EVENT_TAGS).includes(q.tag)) where.push(jsonHas(events.tags, q.tag));
  if (q.free) where.push(eq(events.costThb, 0));
  // Short and sweet: 90 minutes or less, for carers and long work days.
  if (q.short) where.push(sql`${events.endsAt} - ${events.startsAt} <= interval '90 minutes'`);
  // Alcohol-free and smoke-free (D58, D59).
  if (q.alcoholFree) where.push(eq(events.alcoholServed, false));
  if (q.smokeFree) where.push(eq(events.smokingArea, false));
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
  const [taken, mine, myVibe, coverPairs, [plan]] = await Promise.all([
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
    // This week's plan, if it's been made: its picks get a tag in the list rather than looking like separate events.
    db.select({ picks: weeklyPlans.picks }).from(weeklyPlans).where(and(eq(weeklyPlans.accountId, user.account.id), eq(weeklyPlans.week, weekKey(new Date())))).limit(1),
  ]);
  const picked = new Set(((plan?.picks ?? []) as { kind: string; ref: string }[]).filter((x) => x.kind === "event").map((x) => x.ref));
  const covers = new Map(coverPairs);
  const collabs = await collabNamesFor(c.env, list);
  const myStatus = new Map(mine.map((r) => [r.eventId, r.status]));
  const filtered = !!(q.when !== "all" || q.district || q.tag || q.free || q.short || q.small || q.alcoholFree || q.smokeFree || q.language || q.intensity || q.plusOne || q.fitsAge || q.resident || q.text);
  // The plain list leads with the popular picks and the top 10 this week (owner, 2026-10-17); once you
  // filter, you see just your matches. The full list below leaves out the events already shown above.
  const top = mapView || filtered ? null : await discoverPicks(c.env, db, user, now);
  const above = new Set(top ? [...top.picks, ...top.week].map((e) => e.id) : []);
  const rest = above.size ? list.filter((e) => !above.has(e.id)) : list;
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
      <Toggle name="alcoholFree" label={t("ไม่มีแอลกอฮอล์", "Alcohol-free")} checked={q.alcoholFree} />
      <Toggle name="smokeFree" label={t("ปลอดบุหรี่", "Smoke-free")} checked={q.smokeFree} />
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
    if (rest.length === 0 && above.size) return extra;
    if (rest.length === 0)
      return (
        <>
          <Empty>{t("ยังไม่มีกิจกรรมที่ตรงกับตัวกรองนี้ แวะมาดูใหม่นะ", "No events match these filters yet. Check back soon.")}</Empty>
          {extra}
        </>
      );
    const items = rest.map((e) => (
      <div class="ev-item" data-s={`${title(e, lang)} ${e.venueName} ${label(DISTRICTS, e.district, lang)}`.toLowerCase()}>
        <EventCard e={e} taken={taken.get(e.id) ?? 0} v={v} mine={myStatus.get(e.id)} cover={covers.get(e.id)} pick={picked.has(e.id)} partners={collabs.get(e.id)} />
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
  const filterCount = [q.district, q.tag, q.free, q.short, q.small, q.alcoholFree, q.smokeFree, q.language, q.intensity, q.plusOne, q.fitsAge, q.resident, q.text].filter(Boolean).length;
  const forYouHidden = getCookie(c, FOR_YOU_COOKIE) === "hide";
  const quizHint = myVibe.length === 0 ? quizHintCard(t) : null;

  if (mapView) {
    // The empty-district alert (owner card 7) sits under "Suggest an event" when nothing is coming up.
    const alert =
      list.length === 0 && !filtered && districtName(user.profile.district, lang)
        ? {
            district: user.profile.district,
            // Without a yes to notifications the alert is off whatever the flag says: point to Settings.
            state: !(await hasConsent(db, user.account.id, NOTIFICATIONS_CONSENT)) ? ("consent" as const) : user.profile.districtAlertOptIn ? ("on" as const) : ("off" as const),
            settingsHref: vapidKeys(c.env) ? "/settings#push" : "/settings/consents",
          }
        : null;
    const week = list.filter((e) => e.startsAt.getTime() < now.getTime() + 7 * 86_400_000);
    const open = week.filter((e) => (taken.get(e.id) ?? 0) < e.capacity).length;
    const status = sheetCopy({ total: list.length, week: week.length, open, filtered }, t);
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
        status={status}
        search={q.text}
        filtered={filtered}
        filters={filtersForm}
        list={
          <>
            {unplacedNote}
            {/* The quiz card used to ride in the ticker; it sits after the third event, as in the list view. */}
            {list.length === 0 ? (
              <>
                <NoEventsYet t={t} filtered={filtered} clearHref="/events" alert={alert} />
                {quizHint}
              </>
            ) : (
              cardList(quizHint)
            )}
          </>
        }
        listHref={listHref}
        langHref={`/lang/${lang === "th" ? "en" : "th"}?back=${encodeURIComponent(mapHref)}`}
        hasQuests={list.some((e) => e.tags.includes("city_quest"))}
      />
      </>,
    );
  }

  // One calm City Pulse line (owner D62): Bangkok now, and whether a question is waiting. No count, no dot.
  const glance = await pulseGlance(c);
  const nowBits = weatherBits(t, glance.weather);
  return page(
    c,
    { title: t("ค้นหากิจกรรม", "Discover"), tab: "events" },
    <>
      <script dangerouslySetInnerHTML={{ __html: DISCOVER_MEMORY_JS }} />
      <a href="/pulse" class="cp-line">
        {PULSE_ICON}
        <b>City Pulse</b>
        {nowBits.length ? <span>{t("กรุงเทพฯ ตอนนี้", "Bangkok now")} {nowBits.join(" · ")}</span> : null}
        {glance.waiting ? <span>· {t("มีคำถามสัปดาห์นี้รออยู่", "this week's question is waiting")}</span> : null}
        <span aria-hidden="true">›</span>
      </a>
      <p class="eyebrow">{t("กลุ่มเล็ก สถานที่จริง", "Small groups, real places")}</p>
      <h1>{t("สัปดาห์นี้ในกรุงเทพฯ ทำอะไรดี?", "What can I do in Bangkok this week?")}</h1>
      <a href="/plan" class="plan-line">
        <span aria-hidden="true">🗓️</span> {t("แผนสัปดาห์นี้: เราเลือกให้ 2 อย่าง", "This week's plan: 2 picks made for you")} <span aria-hidden="true">›</span>
      </a>
      {top?.picks.length ? (
        <section class="disc-picks" aria-labelledby="disc-picks-h">
          <h2 id="disc-picks-h">{t("ยอดนิยม", "Popular picks")}</h2>
          {top.picks.map((e) => (
            <EventCard e={e} taken={top.taken.get(e.id) ?? 0} v={v} cover={top.covers.get(e.id)} pick={picked.has(e.id)} />
          ))}
        </section>
      ) : null}
      {top?.week.length ? (
        <section class="disc-top" aria-labelledby="disc-top-h">
          <h2 id="disc-top-h">{t(`${top.week.length} อันดับสัปดาห์นี้`, `Top ${top.week.length} this week`)}</h2>
          <TopWeek list={top.week} taken={top.taken} v={v} />
        </section>
      ) : null}
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
        {above.size ? null : <h2 class="sr-only">{t("รายการกิจกรรม", "Event list")}</h2>}
        <section id="discover-list" class="discover-list" aria-label={t("รายการกิจกรรม", "Event list")}>
          {above.size ? <h2 class="disc-more-h">{t("กิจกรรมอื่น ๆ", "More events")}</h2> : null}
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

/**
 * The empty-district alert on (owner card 7): only with a yes to
 * notifications (no row means no, and this never says yes for the member),
 * only for one of Bangkok's districts. The audit row's time is when the
 * member opted in: the weekly job counts events published after it.
 */
eventRoutes.post("/events/district-alert", requireMember, async (c) => {
  const user = me(c);
  const db = getDb(c.env);
  if (!districtName(user.profile.district, "en")) return c.redirect("/events");
  if (!(await hasConsent(db, user.account.id, NOTIFICATIONS_CONSENT))) return c.redirect(vapidKeys(c.env) ? "/settings#push" : "/settings/consents");
  if (!user.profile.districtAlertOptIn) {
    await batch(c.env, [
      db.update(profiles).set({ districtAlertOptIn: true, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id)),
      audit(db, user.account.id, DISTRICT_ALERT_ON, { type: "account", id: user.account.id }),
    ]);
  }
  return c.redirect(safeNext(str((await c.req.parseBody()).back), "/events"));
});

/** The alert off: one tap, from the alert itself or Settings. A POST, never a GET. */
eventRoutes.post("/events/district-alert/off", requireMember, async (c) => {
  const user = me(c);
  await getDb(c.env).update(profiles).set({ districtAlertOptIn: false, updatedAt: new Date() }).where(eq(profiles.accountId, user.account.id));
  const back = safeNext(str((await c.req.parseBody()).back), "/notifications");
  return c.redirect(`${back}${back.includes("?") ? "&" : "?"}notice=district_alert_off`);
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

