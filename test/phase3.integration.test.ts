/** Phase 3, people before the app: graduation, thank-yous, energy check-in, pay-it-forward, short filter, phone-down, month in people. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { connections, contactShares, events, graduations, notifications, profiles, registrations, thanks } from "../src/schema";

const pair = (a: Member, b: Member) => (a.id < b.id ? [a.id, b.id] : [b.id, a.id]);
async function connect(a: Member, b: Member) {
  const [x, y] = pair(a, b);
  const id = newId();
  await db().insert(connections).values({ id, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
  return id;
}

describe.skipIf(!HAS_DB)("people before the app", () => {
  it("graduates a pair who shared contacts and met twice, once, and asks 'still in touch?' 30 days later", async () => {
    const [a, b] = await Promise.all([createMember(), createMember()]);
    const c1 = await connect(a, b);
    await connect(a, b);
    for (const m of [a, b]) await db().insert(contactShares).values({ id: newId(), connectionId: c1, accountId: m.id, method: "line", value: "x_" + m.id.slice(0, 4) });
    const html = await (await req("/connections?lang=en", { cookie: `${a.cookie}; lang=en` })).text();
    // A friendship to celebrate, with a next step (owner), not a goodbye.
    expect(html).toMatch(/You and [^<]+ have met 2 times\. That&#39;s a friendship\./);
    expect(html).toContain("?say=");
    expect(html).not.toContain("need us anymore");
    const [note] = await db().select().from(notifications).where(and(eq(notifications.accountId, a.id), eq(notifications.kind, "graduated")));
    expect(note.titleEn).toMatch(/^🎉 You and .+ have met 2 times\. That's a friendship\.$/);
    // The one moment with confetti (owner, Phase 2A): the friendship lands with a celebration, once.
    expect(html).toContain("data-celebrate=\"\"");
    expect(note.link).toBe("/connections?notice=friendship");
    const fromNote = await (await req("/connections?lang=en&notice=friendship", { cookie: b.cookie })).text();
    expect(fromNote).toContain("toast party");
    expect(fromNote).toContain("That&#39;s a friendship. Go meet again soon.");
    expect(fromNote).not.toContain("data-celebrate=\"\"");
    expect(await (await req("/connections?lang=en", { cookie: a.cookie })).text()).not.toContain("data-celebrate=\"\"");
    await req("/connections", { cookie: b.cookie });
    expect(await db().select().from(graduations).where(eq(graduations.connectionId, c1))).toHaveLength(1);
    const asks = await db().select().from(notifications).where(and(eq(notifications.accountId, a.id), eq(notifications.kind, "still_in_touch")));
    expect(asks).toHaveLength(1);
    expect(asks[0].createdAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await req(`/connections/${c1}/still`, { cookie: a.cookie, form: { still: "yes" } });
    const [g] = await db().select().from(graduations).where(eq(graduations.connectionId, c1));
    expect(a.id < b.id ? g.aStill : g.bStill).toBe(true);
  });

  it("thank-you notes are private and one per connection", async () => {
    const [a, b, c] = await Promise.all([createMember(), createMember(), createMember()]);
    const id = await connect(a, b);
    await req(`/connections/${id}/thanks`, { cookie: a.cookie, form: { body: "Thanks for the great chat" } });
    await req(`/connections/${id}/thanks`, { cookie: a.cookie, form: { body: "Again" } });
    expect(await db().select().from(thanks).where(eq(thanks.toAccount, b.id))).toHaveLength(1);
    expect(await (await req("/thanks", { cookie: b.cookie })).text()).toContain("Thanks for the great chat");
    expect(await (await req("/thanks", { cookie: c.cookie })).text()).not.toContain("Thanks for the great chat");
    expect((await req(`/connections/${id}/thanks`, { cookie: c.cookie, form: { body: "hi" } })).status).toBe(404);
  });

  it("energy check-in is stored privately; low twice shows support", async () => {
    const m = await createMember();
    await req("/plan/energy", { cookie: m.cookie, form: { energy: "low" } });
    await req("/plan/energy", { cookie: m.cookie, form: { energy: "low" } });
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect((p.bio as { socialEnergy?: string }).socialEnergy).toBe("low");
    const html = await (await req("/plan", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain("1323");
  });

  it("pay-it-forward: a free seat once a month, until they're gone", async () => {
    const [a, b, c] = await Promise.all([createMember(), createMember(), createMember()]);
    const mk = async () => {
      const id = newId();
      const startsAt = new Date(Date.now() + 9 * 86_400_000);
      await db().insert(events).values({ id, title: "Paid supper", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "X", district: "bang_rak", capacity: 10, status: "published", createdBy: "t", costThb: 400, freeSeats: 1 });
      return id;
    };
    const e1 = await mk();
    expect((await req(`/events/${e1}/rsvp`, { cookie: a.cookie, form: { freeSeat: "1", rhythmOk: "1" } })).status).toBe(302);
    const [reg] = await db().select().from(registrations).where(and(eq(registrations.eventId, e1), eq(registrations.accountId, a.id)));
    expect(reg.freeSeat).toBe(true);
    expect((await req(`/events/${e1}/rsvp`, { cookie: b.cookie, form: { freeSeat: "1", rhythmOk: "1" } })).status).toBe(409);
    const e2 = await mk();
    expect((await req(`/events/${e2}/rsvp`, { cookie: a.cookie, form: { freeSeat: "1", rhythmOk: "1" } })).status).toBe(409);
    expect((await req(`/events/${e2}/rsvp`, { cookie: c.cookie, form: { freeSeat: "1", rhythmOk: "1" } })).status).toBe(302);
  });

  it("phone-down mode after check-in, and the month in people", async () => {
    const m = await createMember();
    const id = newId();
    const startsAt = new Date(Date.now() - 30 * 60_000);
    await db().insert(events).values({ id, title: "Now", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "X", district: "dusit", capacity: 10, status: "published", createdBy: "t" });
    await db().insert(registrations).values({ id: newId(), eventId: id, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: new Date() });
    const html = await (await req(`/me/events/${id}/pass`, { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain("Phone down, people up");
    expect(await (await req(`/me/events/${id}/pass?show=pass`, { cookie: `${m.cookie}; lang=en` })).text()).toContain("Event pass");
    const month = await (await req("/me/month", { cookie: `${m.cookie}; lang=en` })).text();
    expect(month).toContain("Tables you sat at");
    expect(month).toContain("Dusit");
  });

  it("the short filter keeps 90-minute events", async () => {
    const m = await createMember();
    const start = new Date(Date.now() + 5 * 86_400_000);
    const short = newId();
    const long = newId();
    await db().insert(events).values([
      { id: short, title: "Short filter quick coffee", startsAt: start, endsAt: new Date(start.getTime() + 60 * 60_000), venueName: "X", district: "dusit", capacity: 10, status: "published", createdBy: "t" },
      { id: long, title: "Short filter long hike", startsAt: start, endsAt: new Date(start.getTime() + 4 * 3600_000), venueName: "X", district: "dusit", capacity: 10, status: "published", createdBy: "t" },
    ]);
    const html = await (await req("/events?view=list&short=1&q=Short%20filter", { cookie: m.cookie })).text();
    expect(html).toContain("Short filter quick coffee");
    expect(html).not.toContain("Short filter long hike");
  });
});
