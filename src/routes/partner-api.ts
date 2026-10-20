/**
 * The partner API (D47): a verified partner's own system, with a
 * Jurrgun-issued key (Authorization: Bearer jgk_…), posts go-together events.
 *
 *   POST /api/partner/events   one event; a named host of the partner and a
 *                              public meeting point are required
 *   GET  /api/partner/events   the partner's upcoming events with counts
 *
 * A verified partner's events go live on Discover; a partner a moderator sent
 * back to review posts into the review queue. A dating partner's events
 * always carry the 💘 tag, so only members who opted in see them. Nothing
 * about members ever leaves through here: booking counts only (D47).
 */
import { Hono } from "hono";
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { batch, getDb } from "../db";
import { checkProposal, toBangkokInput, type ProposalInput } from "../domain/hosting";
import { lateOrLong, partnerEventTags } from "../domain/rules";
import { DISTRICTS, EVENT_TAGS, INTENSITY, LANGUAGES, values } from "../lib/constants";
import { newId, randomToken } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { audit } from "../lib/records";
import { accounts, events, registrations, type PartnerOrg } from "../schema";
import { orgForKey } from "../services/partner-keys";
import { checkOutsideUrl } from "../services/outside-fetch";
import { sourceForHost } from "../content/sources";
import { STATIONS } from "../content/stations";

type PartnerEnv = { Bindings: AppEnv["Bindings"]; Variables: AppEnv["Variables"] & { partnerOrg: PartnerOrg } };
export const partnerApi = new Hono<PartnerEnv>();

/** Events one partner may post in 24 hours. */
export const PARTNER_DAILY_MAX = 50;

const ALLOWED = () => ({ districts: values(DISTRICTS), languages: values(LANGUAGES), intensity: values(INTENSITY), tags: values(EVENT_TAGS).filter((x) => x !== "city_quest"), stations: STATIONS.map((s) => s.key) });

const text = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const isoToBkk = (v: unknown) => {
  if (typeof v !== "string") return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : toBangkokInput(d);
};
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : []);

partnerApi.use("*", async (c, next) => {
  const org = await orgForKey(c.env, c.req.header("authorization"));
  if (!org) return c.json({ error: "A live partner key is required (Authorization: Bearer jgk_…)" }, 401);
  c.set("partnerOrg", org);
  await next();
});

partnerApi.post("/events", async (c) => {
  const org = c.var.partnerOrg;
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "A JSON object is required" }, 400);
  const meet = (body.meeting_point ?? {}) as Record<string, unknown>;
  const db = getDb(c.env);

  // The named host: an active account of this partner (its admin or one of its hosts).
  const hostName = text(body.host, 40).toLowerCase().replace(/^@/, "");
  const [host] = hostName
    ? await db
        .select({ id: accounts.id, role: accounts.role, status: accounts.status })
        .from(accounts)
        .where(and(eq(accounts.username, hostName), eq(accounts.partnerOrgId, org.id)))
        .limit(1)
    : [];
  const errors: string[] = [];
  if (!host || host.status !== "active" || !["host", "partner_admin"].includes(host.role)) errors.push("host must be the username of an active host of your organisation");

  const ticket = text(body.ticket_url, 500);
  const ticketUrl = ticket ? checkOutsideUrl(ticket) : null;
  if (ticket && !ticketUrl) errors.push("ticket_url must be a public https link");
  const cost = text(body.cost_thb ?? 0);
  const d: ProposalInput = {
    title: text(body.title, 200),
    titleEn: text(body.title_en, 200),
    description: text(body.description),
    startsAt: isoToBkk(body.starts_at),
    endsAt: isoToBkk(body.ends_at),
    venueName: text(meet.name, 300),
    venueAddress: text(meet.address, 500),
    mapUrl: text(meet.map_url, 600),
    district: text(meet.district, 40),
    capacity: text(body.capacity ?? ""),
    ageMin: text(body.age_min ?? 18),
    ageMax: text(body.age_max ?? 99),
    languages: strings(body.languages).length ? strings(body.languages) : ["th"],
    costThb: cost,
    paymentNote: text(body.payment_note, 600),
    paymentUrl: "",
    intensity: text(body.intensity) || "social",
    groupMin: text(body.group_min ?? 4),
    groupMax: text(body.group_max ?? 6),
    plusOneAllowed: body.plus_one === true,
    tags: strings(body.tags),
    visibility: "public",
    accessibility: text(body.accessibility, 1100),
    safetyInfo: text(body.safety_info, 1100),
    venueNotes: text(meet.notes, 600),
    venueNotesEn: text(meet.notes_en, 600),
    nearestStation: text(meet.station, 40),
    walkMinutes: text(meet.walk_minutes ?? ""),
    warmupUrl: text(body.warmup_url, 600),
    // A public meeting point is required for every partner event (D47), not just go-together ones.
    goTogether: true,
    sourceUrl: ticketUrl?.toString() ?? "",
  };
  const { values: vals, errors: problems } = checkProposal(d, ALLOWED());
  errors.push(...problems.map((p) => p.en));
  if (errors.length || !vals || !host) return c.json({ error: "Invalid event", problems: errors }, 400);

  const [{ n }] = await db
    .select({ n: count() })
    .from(events)
    .where(and(eq(events.partnerOrgId, org.id), gte(events.createdAt, new Date(Date.now() - 86_400_000))));
  if (Number(n) >= PARTNER_DAILY_MAX) return c.json({ error: `At most ${PARTNER_DAILY_MAX} events a day` }, 429);

  const live = org.status === "verified" && !lateOrLong(vals.startsAt, vals.endsAt);
  const id = newId();
  const referralCode = randomToken(6);
  await batch(c.env, [
    db.insert(events).values({
      id,
      ...vals,
      tags: partnerEventTags(vals.tags, org.kind),
      descriptionEn: null,
      emergencyContact: "191 / 1669",
      hostAccountId: host.id,
      partnerOrgId: org.id,
      status: live ? "published" : "pending",
      submittedAt: new Date(),
      sourceName: ticketUrl ? (sourceForHost(ticketUrl.hostname)?.name ?? org.name) : org.name,
      sourceUrl: ticketUrl?.toString() ?? null,
      sourceCredit: org.name,
      referralCode,
      createdBy: host.id,
    }),
    audit(db, `partner:${org.id}`, live ? "event.partner_publish" : "event.partner_submit", { type: "event", id }),
  ]);
  const origin = new URL(c.req.url).origin;
  return c.json({ id, status: live ? "published" : "pending", url: `${origin}/events/${id}?ref=${referralCode}`, referral_code: referralCode }, 201);
});

partnerApi.get("/events", async (c) => {
  const org = c.var.partnerOrg;
  const db = getDb(c.env);
  const rows = await db
    .select({ id: events.id, title: events.title, startsAt: events.startsAt, status: events.status, referralCode: events.referralCode })
    .from(events)
    .where(and(eq(events.partnerOrgId, org.id), gte(events.startsAt, new Date(Date.now() - 30 * 86_400_000))))
    .orderBy(desc(events.startsAt))
    .limit(100);
  const counts = await bookingCounts(c.env, rows.map((r) => r.id));
  return c.json({
    events: rows.map((r) => ({ id: r.id, title: r.title, starts_at: r.startsAt.toISOString(), status: r.status, referral_code: r.referralCode, ...(counts.get(r.id) ?? { booked: 0, checked_in: 0 }) })),
  });
});

/** Booked seats and check-ins per event: totals only, never who (D47). */
export async function bookingCounts(env: AppEnv["Bindings"], ids: string[]): Promise<Map<string, { booked: number; checked_in: number }>> {
  if (!ids.length) return new Map();
  const rows = await getDb(env)
    .select({
      eventId: registrations.eventId,
      booked: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')`,
      checkedIn: sql<number>`count(${registrations.checkedInAt})`,
    })
    .from(registrations)
    .where(and(inArray(registrations.eventId, ids), isNotNull(registrations.eventId)))
    .groupBy(registrations.eventId)
    .limit(ids.length);
  return new Map(rows.map((r) => [r.eventId, { booked: Number(r.booked), checked_in: Number(r.checkedIn) }]));
}
