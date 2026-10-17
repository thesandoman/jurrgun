/**
 * Host announcements (owner-approved 2026-10-17, migration 0024): Update,
 * Time changed, Venue moved, Cancelled. Who hears what, what changes on the
 * event, the limits, lock-screen text, who can read them, and account deletion.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import { accounts, announcements, auditLog, events, notifications, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { toBangkokInput } from "../src/domain/hosting";
import {
  ANNOUNCE_PER_DAY,
  canAnnounce,
  cleanBody,
  hearsAbout,
  limitRefusal,
  notifyText,
  pushNow,
  recipientStatuses,
} from "../src/domain/announcements";
import { runRetention, ANNOUNCEMENT_RETENTION_DAYS } from "../src/services/retention";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mkEvent(hostId: string, extra: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = new Date(Date.now() + 2 * DAY);
  await db()
    .insert(events)
    .values({ id, title: `ANN-${id.slice(0, 6)} Secret supper`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Soi Social Club", district: "watthana", capacity: 8, status: "published", createdBy: hostId, hostAccountId: hostId, visibility: "private", privateToken: randomToken(12), ...extra });
  return id;
}
const reg = async (eventId: string, accountId: string, status = "confirmed") => {
  const id = newId();
  await db().insert(registrations).values({ id, eventId, accountId, status, passToken: randomToken(18) });
  return id;
};
const announce = (cookie: string, eventId: string, form: Record<string, string>) => req(`/admin/events/${eventId}/announce`, { cookie, form: { back: `/admin/events/${eventId}`, ...form } });
const notesFor = (eventId: string, kind?: string) =>
  db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.link, `/events/${eventId}`), ...(kind ? [eq(notifications.kind, kind)] : [])));

describe("announcement rules (pure)", () => {
  it("confirmed seats hear every kind; the waitlist and offers never a plain update", () => {
    for (const k of ["update", "time", "venue", "cancelled"] as const) expect(hearsAbout("confirmed", k)).toBe(true);
    for (const s of ["waitlisted", "offered"]) {
      expect(hearsAbout(s, "update")).toBe(false);
      expect(hearsAbout(s, "time")).toBe(true);
      expect(hearsAbout(s, "venue")).toBe(true);
      expect(hearsAbout(s, "cancelled")).toBe(true);
    }
    expect(hearsAbout("cancelled", "cancelled")).toBe(false);
    expect(recipientStatuses("update")).toEqual(["confirmed"]);
  });

  it("the host, or the creator when there is no host, the organiser and bma_admin may announce", () => {
    const e = { hostAccountId: "h", createdBy: "c", partnerOrgId: "org" };
    expect(canAnnounce(e, { id: "h", role: "host", partnerOrgId: null })).toBe(true);
    expect(canAnnounce(e, { id: "c", role: "circle_head", partnerOrgId: null })).toBe(false);
    expect(canAnnounce({ ...e, hostAccountId: null }, { id: "c", role: "circle_head", partnerOrgId: null })).toBe(true);
    expect(canAnnounce(e, { id: "p", role: "partner_admin", partnerOrgId: "org" })).toBe(true);
    expect(canAnnounce(e, { id: "p", role: "partner_admin", partnerOrgId: "other" })).toBe(false);
    expect(canAnnounce(e, { id: "x", role: "bma_admin", partnerOrgId: null })).toBe(true);
    expect(canAnnounce(e, { id: "x", role: "user", partnerOrgId: null })).toBe(false);
  });

  it(`allows ${ANNOUNCE_PER_DAY} in 24 hours and no repeat within 10 minutes`, () => {
    const now = new Date("2026-10-17T10:00:00Z");
    const at = (minAgo: number, body = `m${minAgo}`) => ({ body, createdAt: new Date(now.getTime() - minAgo * 60_000) });
    expect(limitRefusal([at(30), at(60), at(90), at(120)], "new", now)).toBeNull();
    expect(limitRefusal([at(30), at(60), at(90), at(120), at(150)], "new", now)).toBe("too_many");
    expect(limitRefusal([at(30), at(60), at(90), at(120), at(25 * 60)], "new", now)).toBeNull();
    expect(limitRefusal([at(5, "Bring water")], "bring WATER", now)).toBe("duplicate");
    expect(limitRefusal([at(11, "Bring water")], "Bring water", now)).toBeNull();
    expect(limitRefusal([at(5, "")], "", now)).toBeNull();
    expect(cleanBody("  hello \n  there ")).toBe("hello there");
    expect(cleanBody("x".repeat(400))).toHaveLength(280);
  });

  it("lock-screen text never names the event and never carries the message for urgent kinds", () => {
    const startsAt = new Date("2026-10-18T12:00:00Z");
    for (const lang of ["th", "en"] as const) {
      for (const k of ["time", "venue", "cancelled"] as const) {
        const s = notifyText(k, lang, { body: "Secret supper moves upstairs", startsAt });
        expect(s).not.toContain("Secret supper");
        expect(s).not.toMatch(/[\u2013\u2014]/);
      }
    }
    expect(notifyText("time", "th", { body: "", startsAt })).toContain("19:00");
  });

  it("urgent pushes wait out quiet hours only for events more than 12 hours away", () => {
    const now = new Date("2026-10-17T16:00:00Z"); // 23:00 Bangkok
    expect(pushNow(false, new Date(now.getTime() + 3 * DAY), now)).toBe(true);
    expect(pushNow(true, new Date(now.getTime() + 3 * DAY), now)).toBe(false);
    expect(pushNow(true, new Date(now.getTime() + 9 * HOUR), now)).toBe(true);
  });
});

describe.skipIf(!HAS_DB)("host announcements", () => {
  it("a plain update goes to confirmed seats only, as a non-urgent notice", async () => {
    const host = await createMember({ role: "host" });
    const [going, waiting, offered] = await Promise.all([createMember(), createMember(), createMember()]);
    const ev = await mkEvent(host.id);
    await Promise.all([reg(ev, going.id), reg(ev, waiting.id, "waitlisted"), reg(ev, offered.id, "offered")]);
    const r = await announce(host.cookie, ev, { kind: "update", body: "Bring a jumper, the aircon is strong" });
    expect(r.status).toBe(302);
    const notes = await notesFor(ev);
    expect(notes.map((n) => n.accountId)).toEqual([going.id]);
    expect(notes[0].kind).toBe("event_update");
    expect(notes[0].titleTh).not.toContain("Secret supper");
    const [row] = await db().select().from(announcements).where(eq(announcements.eventId, ev));
    expect(row).toMatchObject({ kind: "update", body: "Bring a jumper, the aircon is strong", authorAccountId: host.id });
    // The audit row records the event and kind, never the message.
    const [a] = await db().select().from(auditLog).where(and(eq(auditLog.action, "event.announce"), eq(auditLog.targetId, ev)));
    expect(a.detail).toMatchObject({ kind: "update" });
    expect(JSON.stringify(a.detail)).not.toContain("jumper");
  });

  it("an update needs a message", async () => {
    const host = await createMember({ role: "host" });
    const ev = await mkEvent(host.id);
    expect((await announce(host.cookie, ev, { kind: "update", body: "  " })).status).toBe(400);
  });

  it("a time change moves the event and reaches seats and the waitlist, without the title", async () => {
    const host = await createMember({ role: "host" });
    const [going, waiting] = await Promise.all([createMember(), createMember()]);
    const ev = await mkEvent(host.id);
    await Promise.all([reg(ev, going.id), reg(ev, waiting.id, "waitlisted")]);
    const s = new Date(Date.now() + 3 * DAY);
    s.setUTCSeconds(0, 0);
    const en = new Date(s.getTime() + 2 * HOUR);
    const r = await announce(host.cookie, ev, { kind: "time", body: "", startsAt: toBangkokInput(s), endsAt: toBangkokInput(en) });
    expect(r.status).toBe(302);
    const [e] = await db().select().from(events).where(eq(events.id, ev));
    expect(e.startsAt.getTime()).toBe(s.getTime());
    expect(e.endsAt.getTime()).toBe(en.getTime());
    const notes = await notesFor(ev, "event_changed");
    expect(notes.map((n) => n.accountId).sort()).toEqual([going.id, waiting.id].sort());
    for (const n of notes) expect(`${n.titleTh} ${n.titleEn}`).not.toContain("Secret supper");
  });

  it("a venue move changes the venue and clears the old directions", async () => {
    const host = await createMember({ role: "host" });
    const ev = await mkEvent(host.id, { nearestStation: "bts_asok", walkMinutes: 5, venueNotes: "ชั้น 2" });
    const r = await announce(host.cookie, ev, { kind: "venue", body: "Upstairs is closed", venueName: "Rooftop Cafe", venueAddress: "Sukhumvit 11", mapUrl: "https://maps.google.com/?q=rooftop" });
    expect(r.status).toBe(302);
    const [e] = await db().select().from(events).where(eq(events.id, ev));
    expect(e).toMatchObject({ venueName: "Rooftop Cafe", venueAddress: "Sukhumvit 11", mapUrl: "https://maps.google.com/?q=rooftop", nearestStation: null, walkMinutes: null, venueNotes: null });
    expect((await announce(host.cookie, ev, { kind: "venue", venueName: "Rooftop Cafe", venueAddress: "x", mapUrl: "http://insecure" })).status).toBe(400);
  });

  it("cancelled needs the tick, then cancels, releases every seat and tells the waitlist", async () => {
    const host = await createMember({ role: "host" });
    const [going, waiting, offered] = await Promise.all([createMember(), createMember(), createMember()]);
    const ev = await mkEvent(host.id);
    await Promise.all([reg(ev, going.id), reg(ev, waiting.id, "waitlisted"), reg(ev, offered.id, "offered")]);
    expect((await announce(host.cookie, ev, { kind: "cancelled", body: "Sorry, the cafe is closed" })).status).toBe(400);
    const r = await announce(host.cookie, ev, { kind: "cancelled", body: "Sorry, the cafe is closed", confirm: "1" });
    expect(r.status).toBe(302);
    const [e] = await db().select().from(events).where(eq(events.id, ev));
    expect(e.status).toBe("cancelled");
    const regs = await db().select().from(registrations).where(eq(registrations.eventId, ev));
    expect(regs.map((x) => x.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    const notes = await notesFor(ev, "event_cancelled");
    expect(notes.map((n) => n.accountId).sort()).toEqual([going.id, waiting.id, offered.id].sort());
    // No more announcements once it's cancelled; people who were signed up can still read it.
    expect((await announce(host.cookie, ev, { kind: "update", body: "hello again" })).status).toBe(409);
    const page = await (await req(`/events/${ev}`, { cookie: waiting.cookie })).text();
    expect(page).toContain("Sorry, the cafe is closed");
  });

  it(`refuses a 6th announcement in a day and a repeat within 10 minutes`, async () => {
    const host = await createMember({ role: "host" });
    const ev = await mkEvent(host.id);
    expect((await announce(host.cookie, ev, { kind: "update", body: "one" })).status).toBe(302);
    expect((await announce(host.cookie, ev, { kind: "update", body: "ONE" })).status).toBe(409);
    for (const b of ["two", "three", "four", "five"]) expect((await announce(host.cookie, ev, { kind: "update", body: b })).status).toBe(302);
    expect((await announce(host.cookie, ev, { kind: "update", body: "six" })).status).toBe(409);
    expect(await db().select().from(announcements).where(eq(announcements.eventId, ev))).toHaveLength(5);
  });

  it("only the host side can announce; other hosts and members get 404 or 403", async () => {
    const [host, otherHost, member] = await Promise.all([createMember({ role: "host" }), createMember({ role: "host" }), createMember()]);
    const ev = await mkEvent(host.id);
    expect((await announce(otherHost.cookie, ev, { kind: "update", body: "hi" })).status).toBe(404);
    expect((await announce(member.cookie, ev, { kind: "update", body: "hi" })).status).toBe(403);
    // A member-proposed event with no host: its creator announces.
    const ch = await createMember({ role: "circle_head" });
    const own = await mkEvent(ch.id, { hostAccountId: null });
    expect((await req(`/admin/events/${own}/announce`, { cookie: ch.cookie, form: { kind: "update", body: "see you", back: "/host" } })).headers.get("location")).toBe("/host?notice=announced#announce");
  });

  it("shows at the top of the event page and on the pass, only to people who can see the event", async () => {
    const host = await createMember({ role: "host" });
    const [going, stranger] = await Promise.all([createMember(), createMember()]);
    const ev = await mkEvent(host.id);
    await reg(ev, going.id);
    await announce(host.cookie, ev, { kind: "update", body: "Look for the green flag" });
    const html = await (await req(`/events/${ev}`, { cookie: going.cookie })).text();
    expect(html).toContain("Look for the green flag");
    // Above the details: before the fact tiles.
    expect(html.indexOf("Look for the green flag")).toBeLessThan(html.indexOf("ev-facts"));
    expect(await (await req(`/me/events/${ev}/pass`, { cookie: going.cookie })).text()).toContain("Look for the green flag");
    // A private event without its link: no page, no announcements.
    const hidden = await req(`/events/${ev}`, { cookie: stranger.cookie });
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).not.toContain("Look for the green flag");
  });

  it("the composer sits beside the day-of controls for the host", async () => {
    const host = await createMember({ role: "host" });
    const ev = await mkEvent(host.id);
    const html = await (await req(`/admin/events/${ev}`, { cookie: host.cookie })).text();
    expect(html).toContain(`action="/admin/events/${ev}/announce"`);
    expect(html.indexOf('id="day-of"')).toBeLessThan(html.indexOf('id="announce"'));
    expect(await (await req("/host", { cookie: host.cookie })).text()).toContain(`action="/admin/events/${ev}/announce"`);
  });

  it("account deletion cuts the author link, the export lists them, and they go after the event", async () => {
    const host = await createMember({ role: "host" });
    const ev = await mkEvent(host.id);
    await announce(host.cookie, ev, { kind: "update", body: "Export me" });
    const data = JSON.parse(await (await req("/settings/privacy/export", { cookie: host.cookie })).text());
    expect(data.announcementsISent[0]).toMatchObject({ kind: "update", body: "Export me" });
    await db().update(accounts).set({ status: "deactivated", deactivatedAt: new Date(Date.now() - 40 * DAY) }).where(eq(accounts.id, host.id));
    await runRetention(ENV, new Date());
    const [row] = await db().select().from(announcements).where(eq(announcements.eventId, ev));
    expect(row.authorAccountId).toBeNull();
    expect(row.body).toBe("Export me");
    // Past the retention period after the event: gone.
    const old = new Date(Date.now() - (ANNOUNCEMENT_RETENTION_DAYS + 1) * DAY);
    await db().update(events).set({ startsAt: old, endsAt: old }).where(eq(events.id, ev));
    await runRetention(ENV, new Date());
    expect(await db().select().from(announcements).where(inArray(announcements.eventId, [ev]))).toHaveLength(0);
  });
});
