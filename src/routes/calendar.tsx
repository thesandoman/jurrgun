/**
 * Calendars out (D48).
 *
 *   GET  /cal/<token>.ics         a member's private calendar: their booked
 *                                 seats, updating as they book and cancel
 *   GET  /settings/calendar       the link, for Google, Apple and Outlook
 *   POST /settings/calendar       make the link, or reset it (the old one stops)
 *   GET  /feeds/events.ics        Jurrgun's public events, for anyone to list
 *   GET  /feeds/events.json       the same as schema.org JSON-LD
 *
 * The public feed has only public, published events that aren't a Regular
 * Table's hangout, and never an Open to something more event. In a member's
 * own calendar an Open to something more event shows as a plain "Jurrgun
 * table", as on lock screens. No two-way sync: nothing is read back.
 */
import { Hono, type Context } from "hono";
import { and, asc, eq, gte, inArray, isNull, lt, not, sql } from "drizzle-orm";
import { getDb } from "../db";
import { randomToken } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { audit } from "../lib/records";
import { requireMember } from "../lib/session";
import { OPEN_TO_MORE_TAG } from "../domain/rules";
import { toIcal, toJsonLd, type CalEvent } from "../domain/calendar-out";
import { PAUSED_LINE } from "../domain/hosting";
import { accounts, calendarTokens, events, profiles, registrations, type Event } from "../schema";
import { Button, Card, LinkButton, Notice, page, view } from "../ui/kit";
import { noOpenInvite } from "../services/collabs";

export const calendarRoutes = new Hono<AppEnv>();
type C = Context<AppEnv>;
const DAY = 86_400_000;

const titleOf = (e: Event, lang: string) => (lang === "en" && e.titleEn ? e.titleEn : e.title);

function calEvent(e: Event, origin: string, lang: string, path: string, plain = false): CalEvent {
  const desc = lang === "en" && e.descriptionEn ? e.descriptionEn : e.description;
  return {
    id: e.id,
    title: `${plain ? (lang === "en" ? "Jurrgun table" : "โต๊ะ Jurrgun") : titleOf(e, lang)}${e.status === "paused" ? (lang === "en" ? " (paused)" : " (พักไว้ชั่วคราว)") : ""}`,
    description: (e.status === "paused" ? `${PAUSED_LINE[lang === "en" ? 1 : 0]}\n` : "") + (plain ? "" : `${desc.slice(0, 500)}${e.sourceName ? `\n${lang === "en" ? "Via" : "ผ่าน"} ${e.sourceName}${e.sourceUrl ? `: ${e.sourceUrl}` : ""}` : ""}`),
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    url: `${origin}${path}`,
    costThb: e.costThb,
    cancelled: e.status === "cancelled",
    paused: e.status === "paused",
  };
}

const ICS_HEADERS = { "content-type": "text/calendar; charset=utf-8" };

// ---------------------------------------------------- private feed --

calendarRoutes.get("/cal/:file", async (c) => {
  const m = /^([A-Za-z0-9_-]{20,80})\.ics$/.exec(c.req.param("file"));
  if (!m) return c.notFound();
  const db = getDb(c.env);
  const [owner] = await db
    .select({ accountId: calendarTokens.accountId, status: accounts.status, locale: profiles.locale })
    .from(calendarTokens)
    .innerJoin(accounts, eq(accounts.id, calendarTokens.accountId))
    .leftJoin(profiles, eq(profiles.accountId, calendarTokens.accountId))
    .where(eq(calendarTokens.token, m[1]))
    .limit(1);
  if (!owner || owner.status !== "active") return c.notFound();
  const lang = owner.locale === "en" ? "en" : "th";
  const rows = await db
    .select({ event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.accountId, owner.accountId), eq(registrations.status, "confirmed"), gte(events.startsAt, new Date(Date.now() - 30 * DAY)), inArray(events.status, ["published", "paused", "cancelled"])))
    .orderBy(asc(events.startsAt))
    .limit(200);
  const origin = new URL(c.req.url).origin;
  const body = toIcal(
    "Jurrgun",
    rows.map((r) => calEvent(r.event, origin, lang, `/me/events/${r.event.id}/pass`, r.event.tags.includes(OPEN_TO_MORE_TAG))),
  );
  return c.body(body, 200, { ...ICS_HEADERS, "cache-control": "private, max-age=900", "x-robots-tag": "noindex" });
});

// ------------------------------------------------------- settings --

calendarRoutes.use("/settings/calendar", requireMember);

calendarRoutes.get("/settings/calendar", async (c) => {
  const v = view(c);
  const { t } = v;
  const me = c.var.user!.account.id;
  const [row] = await getDb(c.env).select({ token: calendarTokens.token }).from(calendarTokens).where(eq(calendarTokens.accountId, me)).limit(1);
  const origin = new URL(c.req.url).origin;
  const https = row ? `${origin}/cal/${row.token}.ics` : null;
  const webcal = https?.replace(/^https?:/, "webcal:");
  return page(
    c,
    { title: t("ปฏิทินของฉัน", "My calendar"), tab: "me" },
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("ปฏิทินของฉัน", "My calendar")}</h1>
      <p class="muted">
        {t(
          "ใส่ลิงก์นี้ใน Google Calendar, Apple หรือ Outlook แล้วนัดที่จองไว้จะขึ้นเองและอัปเดตตามเมื่อจองหรือยกเลิก ลิงก์นี้เป็นของคุณคนเดียว อย่าส่งต่อ",
          "Add this link to Google Calendar, Apple or Outlook and your booked tables show up, updating as you book or cancel. The link is yours alone: don't share it.",
        )}
      </p>
      {c.req.query("notice") === "reset" ? <Notice kind="ok">{t("สร้างลิงก์ใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก เพิ่มลิงก์ใหม่ในปฏิทินอีกครั้ง", "New link made. The old one no longer works; add the new one to your calendar again.")}</Notice> : null}
      {https && webcal ? (
        <Card>
          <div class="field">
            <label for="cal-link">{t("ลิงก์ปฏิทินส่วนตัว", "Private calendar link")}</label>
            <input id="cal-link" type="text" readonly value={https} onfocus="this.select()" />
          </div>
          <div class="row">
            <LinkButton href={webcal}>{t("เพิ่มใน Apple หรือ Outlook", "Add to Apple or Outlook")}</LinkButton>
            <LinkButton href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} kind="ghost" target="_blank" rel="noopener noreferrer">
              {t("เพิ่มใน Google Calendar", "Add to Google Calendar")} ↗
            </LinkButton>
          </div>
          <form method="post" action="/settings/calendar">
            <p class="muted">{t("ถ้าเผลอส่งลิงก์ให้คนอื่น สร้างลิงก์ใหม่ได้ ลิงก์เดิมจะใช้ไม่ได้ทันที", "Shared it by mistake? Make a new link; the old one stops working at once.")}</p>
            <Button kind="ghost">{t("สร้างลิงก์ใหม่", "Make a new link")}</Button>
          </form>
        </Card>
      ) : (
        <form method="post" action="/settings/calendar">
          <Button>{t("สร้างลิงก์ปฏิทินของฉัน", "Make my calendar link")}</Button>
        </form>
      )}
    </>,
  );
});

calendarRoutes.post("/settings/calendar", async (c) => {
  const me = c.var.user!.account.id;
  const db = getDb(c.env);
  const token = randomToken(24);
  const [had] = await db.select({ accountId: calendarTokens.accountId }).from(calendarTokens).where(eq(calendarTokens.accountId, me)).limit(1);
  await db
    .insert(calendarTokens)
    .values({ accountId: me, token })
    .onConflictDoUpdate({ target: calendarTokens.accountId, set: { token, createdAt: new Date() } });
  // The audit records that a link was made or reset, never the link.
  await audit(db, me, had ? "calendar.reset" : "calendar.create", { type: "account", id: me });
  return c.redirect(`/settings/calendar${had ? "?notice=reset" : ""}`);
});

// --------------------------------------------------------- public --

export const PUBLIC_FEED_DAYS = 90;

async function publicEvents(c: C): Promise<CalEvent[]> {
  const now = Date.now();
  const rows = await getDb(c.env)
    .select()
    .from(events)
    .where(
      and(
        eq(events.status, "published"),
        eq(events.visibility, "public"),
        isNull(events.regularTableId),
        gte(events.startsAt, new Date(now)),
        lt(events.startsAt, new Date(now + PUBLIC_FEED_DAYS * DAY)),
        not(sql`${events.tags} @> ${JSON.stringify([OPEN_TO_MORE_TAG])}::jsonb`),
        // Private talks never appear in a public feed (D52); collabs only once every co-host answered (D53).
        eq(events.talkMode, false),
        noOpenInvite(),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(300);
  const origin = new URL(c.req.url).origin;
  const lang = c.req.query("lang") === "en" ? "en" : "th";
  return rows.map((e) => calEvent(e, origin, lang, `/events/${e.id}`));
}

const PUBLIC_CACHE = "public, max-age=3600";

calendarRoutes.get("/feeds/events.ics", async (c) => c.body(toIcal("Jurrgun Bangkok", await publicEvents(c)), 200, { ...ICS_HEADERS, "cache-control": PUBLIC_CACHE, "access-control-allow-origin": "*" }));

calendarRoutes.get("/feeds/events.json", async (c) =>
  c.body(JSON.stringify(toJsonLd("Jurrgun Bangkok", await publicEvents(c))), 200, {
    "content-type": "application/ld+json; charset=utf-8",
    "cache-control": PUBLIC_CACHE,
    "access-control-allow-origin": "*",
  }),
);
