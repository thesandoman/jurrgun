/**
 * Bring-a-friend invite links (PRD §8.2) against local Postgres: create and
 * reuse, the public page and its cookie, accept (same RSVP rules), one use,
 * self-accept, full events and the /events cookie redirect.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { invites, notifications, registrations, events } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * DAY);
  await db()
    .insert(events)
    .values({
      id,
      title: `INV-${id.slice(0, 8)}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
      venueName: "Benjakitti Park",
      district: "khlong_toei",
      capacity: 10,
      status: "published",
      plusOneAllowed: true,
      createdBy: "test",
      ...over,
    });
  return id;
}

async function confirm(eventId: string, m: Member) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId: m.id, status: "confirmed", passToken: randomToken(18) });
}

async function regOf(eventId: string, accountId: string) {
  const [r] = await db()
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, accountId)))
    .limit(1);
  return r;
}

async function invitesOf(eventId: string, inviter: string) {
  return db()
    .select()
    .from(invites)
    .where(and(eq(invites.eventId, eventId), eq(invites.inviter, inviter)))
    .limit(10);
}

/** Inviter confirmed on a +1 event, with an invite token. */
async function setup(over: Partial<typeof events.$inferInsert> = {}) {
  const inviter = await createMember({ nickname: `Inv${randomToken(3).replace(/[^A-Za-z0-9]/g, "x")}` });
  const eventId = await mkEvent(over);
  await confirm(eventId, inviter);
  const r = await req(`/events/${eventId}/invite`, { cookie: inviter.cookie, method: "POST" });
  expect(r.status).toBe(302);
  const [inv] = await invitesOf(eventId, inviter.id);
  return { inviter, eventId, token: inv.id };
}

const loc = (r: Response) => r.headers.get("location") ?? "";

describe.skipIf(!HAS_DB)("invite a friend", () => {
  it("creates one invite per attendee and reuses the unused one", async () => {
    const { inviter, eventId, token } = await setup();
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const again = await req(`/events/${eventId}/invite`, { cookie: inviter.cookie, method: "POST" });
    expect(loc(again)).toBe(`/events/${eventId}#invite`);
    expect(await invitesOf(eventId, inviter.id)).toHaveLength(1);
    const html = await (await req(`/events/${eventId}`, { cookie: `${inviter.cookie}; lang=en` })).text();
    expect(html).toContain(`/invite/${token}`);
    expect(html).toContain("https://line.me/R/msg/text/?");
    expect(html).toContain("Copy link");
  });

  it("only a confirmed attendee of a +1 event can invite", async () => {
    const m = await createMember();
    const noPlus = await mkEvent({ plusOneAllowed: false });
    await confirm(noPlus, m);
    expect((await req(`/events/${noPlus}/invite`, { cookie: m.cookie, method: "POST" })).status).toBe(403);
    const plus = await mkEvent();
    expect((await req(`/events/${plus}/invite`, { cookie: m.cookie, method: "POST" })).status).toBe(403);
    expect(await invitesOf(plus, m.id)).toHaveLength(0);
    // Logged out: sign in first.
    expect(loc(await req(`/events/${plus}/invite`, { method: "POST" }))).toMatch(/^\/login/);
  });

  it("the public invite page shows the event and inviter, and sets the invite cookie", async () => {
    const { inviter, token } = await setup();
    const r = await req(`/invite/${token}?lang=en`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(`${await nickOf(inviter)} invited you along`);
    expect(html).toContain("/signup");
    expect(html).toContain(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
    expect(html).not.toContain(inviter.username);
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`bkk_invite=${token}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800/);

    expect((await req(`/invite/${randomToken(18)}`)).status).toBe(404);
    expect((await req(`/invite/bad token!`)).status).toBe(404);
  });

  it("accepting confirms the friend, links both as +1, uses the invite and notifies the inviter", async () => {
    const { inviter, eventId, token } = await setup();
    const friend = await createMember();
    const page = await (await req(`/invite/${token}`, { cookie: friend.cookie })).text();
    expect(page).toContain(`/invite/${token}/accept`);

    const r = await req(`/invite/${token}/accept`, { cookie: friend.cookie, method: "POST" });
    expect(r.status).toBe(302);
    expect(loc(r)).toBe(`/events/${eventId}?notice=rsvp_confirmed`);

    const mine = await regOf(eventId, friend.id);
    const theirs = await regOf(eventId, inviter.id);
    expect(mine.status).toBe("confirmed");
    expect(mine.plusOneWith).toBe(inviter.id);
    expect(mine.plusOneUsername).toBe(inviter.username);
    expect(theirs.plusOneWith).toBe(friend.id);
    expect(theirs.plusOneUsername).toBe(friend.username);

    const [inv] = await db().select().from(invites).where(eq(invites.id, token)).limit(1);
    expect(inv.usedBy).toBe(friend.id);
    expect(inv.usedAt).toBeInstanceOf(Date);

    const notes = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.accountId, inviter.id), eq(notifications.kind, "invite_accepted")))
      .limit(5);
    expect(notes).toHaveLength(1);

    // One use per token.
    const late = await createMember();
    const again = await req(`/invite/${token}/accept`, { cookie: late.cookie, method: "POST" });
    expect(again.status).toBe(410);
    expect(await regOf(eventId, late.id)).toBeUndefined();
    expect((await req(`/invite/${token}`)).status).toBe(410);

    // The inviter now has a +1, so no new invite box.
    expect((await req(`/events/${eventId}/invite`, { cookie: inviter.cookie, method: "POST" })).status).toBe(403);
  });

  it("refuses your own invite", async () => {
    const { inviter, eventId, token } = await setup();
    const r = await req(`/invite/${token}/accept`, { cookie: inviter.cookie, method: "POST" });
    expect(r.status).toBe(403);
    const [inv] = await db().select().from(invites).where(eq(invites.id, token)).limit(1);
    expect(inv.usedBy).toBeNull();
    expect((await regOf(eventId, inviter.id)).plusOneWith).toBeNull();
  });

  it("applies the RSVP rules: a full event waitlists the friend, the age range refuses", async () => {
    const { inviter, eventId, token } = await setup({ capacity: 1 });
    const friend = await createMember();
    const r = await req(`/invite/${token}/accept`, { cookie: friend.cookie, method: "POST" });
    expect(loc(r)).toBe(`/events/${eventId}?notice=rsvp_waitlisted`);
    const mine = await regOf(eventId, friend.id);
    expect(mine.status).toBe("waitlisted");
    expect(mine.plusOneWith).toBe(inviter.id);

    const young = await setup({ ageMin: 40, ageMax: 60 });
    const tooYoung = await createMember({ birthDate: "2000-01-01" });
    const refused = await req(`/invite/${young.token}/accept`, { cookie: tooYoung.cookie, method: "POST" });
    expect(refused.status).toBe(403);
    const [inv] = await db().select().from(invites).where(eq(invites.id, young.token)).limit(1);
    expect(inv.usedBy).toBeNull();
  });

  it("an invite stops working once the inviter cancels", async () => {
    const { inviter, eventId, token } = await setup();
    await req(`/events/${eventId}/cancel`, { cookie: inviter.cookie, method: "POST" });
    const friend = await createMember();
    expect((await req(`/invite/${token}/accept`, { cookie: friend.cookie, method: "POST" })).status).toBe(410);
  });

  it("signed-out accept goes to sign-in", async () => {
    const { token } = await setup();
    expect(loc(await req(`/invite/${token}/accept`, { method: "POST" }))).toMatch(/^\/login/);
  });

  it("/events sends a new member with the invite cookie back to the invite, once", async () => {
    const { token } = await setup();
    const m = await createMember();
    const r = await req("/events", { cookie: `${m.cookie}; bkk_invite=${token}` });
    expect(r.status).toBe(302);
    expect(loc(r)).toBe(`/invite/${token}`);
    expect(r.headers.get("set-cookie") ?? "").toMatch(/bkk_invite=;/);
    // A junk cookie is just cleared.
    const junk = await req("/events", { cookie: `${m.cookie}; bkk_invite=..%2F..` });
    expect(junk.status).toBe(200);
    // A member opening the invite page doesn't get the cookie (no loop back from /events).
    const open = await req(`/invite/${token}`, { cookie: m.cookie });
    expect(open.headers.get("set-cookie") ?? "").not.toContain(`bkk_invite=${token}`);
  });
});

async function nickOf(m: Member): Promise<string> {
  const { profiles } = await import("../src/schema");
  const [p] = await db().select({ n: profiles.nickname }).from(profiles).where(eq(profiles.accountId, m.id)).limit(1);
  return p.n;
}
