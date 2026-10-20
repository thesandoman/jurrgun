/**
 * Owner decisions D51 to D61: health and public-sector partners, private
 * talks, collab events and their mixing rules, open entry, organiser
 * approval, join codes, alcohol, smoking and the disclaimer before booking.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, ENV, req } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import app from "../src/index";
import { accounts, eventPartners, events, partnerOrgs, profiles, registrations, talkQuestions } from "../src/schema";
import { createPartnerKey } from "../src/services/partner-keys";
import { runRetention } from "../src/services/retention";

const DAY = 86_400_000;
const isoIn = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * DAY + 7 * 3_600_000);
  return new Date(`${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+07:00`).toISOString();
};

/** Pages in English for this member. */
const en = async <T extends { id: string }>(m: T): Promise<T> => {
  await db().update(profiles).set({ locale: "en" }).where(eq(profiles.accountId, m.id));
  return m;
};

/** A verified partner organisation of a kind, its partner admin, and a live key. */
async function partner(kind: string, name = `Org ${randomToken(4)}`) {
  const orgId = newId();
  await db().insert(partnerOrgs).values({ id: orgId, name, kind: kind as never, status: "verified" });
  const admin = await en(await createMember({ role: "partner_admin" }));
  await db().update(accounts).set({ partnerOrgId: orgId }).where(eq(accounts.id, admin.id));
  const [acct] = await db().select().from(accounts).where(eq(accounts.id, admin.id));
  const { key } = await createPartnerKey(ENV, orgId, "test", admin.id);
  return { orgId, name, admin, username: acct.username, key };
}

const api = (key: string, method: string, payload?: unknown, path = "/api/partner/events") =>
  app.request(path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined }, ENV);

const body = (host: string, over: Record<string, unknown> = {}) => ({
  title: `Event ${randomToken(5)}`,
  description: "A small table at a public place, with a host who greets everyone.",
  starts_at: isoIn(8, 18),
  ends_at: isoIn(8, 20),
  host,
  capacity: 12,
  meeting_point: { name: "Public library", address: "10 Phahonyothin Road", district: "phaya_thai" },
  ...over,
});

/** A published public event straight in the database. */
async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const host = over.hostAccountId ?? (await createMember({ role: "host" })).id;
  await db()
    .insert(events)
    .values({
      id,
      title: `Rules ${randomToken(5)}`,
      description: "A table for testing entry rules.",
      startsAt: new Date(Date.now() + 9 * DAY),
      endsAt: new Date(Date.now() + 9 * DAY + 2 * 3_600_000),
      venueName: "Public park",
      venueAddress: "1 Park Road",
      district: "pathum_wan",
      capacity: 10,
      status: "published",
      hostAccountId: host,
      createdBy: host,
      ...over,
    });
  return (await db().select().from(events).where(eq(events.id, id)))[0];
}

describe.skipIf(!HAS_DB)("D51, D55: health and public-sector partners are set up by admins only", () => {
  it("the apply form neither offers nor accepts them", async () => {
    const m = await en(await createMember());
    const page = await (await req("/partner/apply", { cookie: m.cookie })).text();
    expect(page).not.toContain('value="health"');
    expect(page).not.toContain('value="public_sector"');
    const r = await req("/partner/apply", { cookie: m.cookie, form: { orgName: "A clinic", kind: "health", contact: "clinic@example.org" } });
    expect(r.status).toBe(400);
  });

  it("health events are free with no ticket link, and only health partners run private talks", async () => {
    const h = await partner("health");
    expect((await api(h.key, "POST", body(h.username, { cost_thb: 200 }))).status).toBe(400);
    expect((await api(h.key, "POST", body(h.username, { ticket_url: "https://www.ticketmelon.com/x" }))).status).toBe(400);
    const ev = await partner("events");
    expect((await api(ev.key, "POST", body(ev.username, { talk_mode: true }))).status).toBe(400);
    expect((await api(h.key, "POST", body(h.username, { talk_mode: true }))).status).toBe(201);
  });
});

describe.skipIf(!HAS_DB)("D52: private talk mode", () => {
  it("counts stay hidden under 10, talks stay out of the public feed, and questions are anonymous", async () => {
    const h = await partner("health");
    const out = (await (await api(h.key, "POST", body(h.username, { talk_mode: true, title: "Ask a nurse: safer dating" }))).json()) as { id: string };
    const m = await en(await createMember());
    await db().insert(registrations).values({ id: newId(), eventId: out.id, accountId: m.id, status: "confirmed", passToken: randomToken(18) });

    const list = JSON.stringify(await (await api(h.key, "GET")).json());
    expect(list).toContain('"booked":null');
    expect(await (await req("/partner", { cookie: h.admin.cookie })).text()).toContain("under 10");

    expect(await (await app.request("/feeds/events.ics", {}, ENV)).text()).not.toContain("Ask a nurse: safer dating");

    const page = await (await req(`/events/${out.id}`, { cookie: m.cookie })).text();
    expect(page).toContain('name="question"');
    for (let i = 0; i < 3; i++) {
      const r = await req(`/events/${out.id}/questions`, { cookie: m.cookie, form: { question: `Is PrEP free for me? (${i})` } });
      expect(r.status).toBe(302);
    }
    expect((await req(`/events/${out.id}/questions`, { cookie: m.cookie, form: { question: "One more question" } })).status).toBe(409);
    const qs = await db().select().from(talkQuestions).where(eq(talkQuestions.eventId, out.id));
    expect(qs).toHaveLength(3);
    for (const q of qs) expect(JSON.stringify(q)).not.toContain(m.id);
    const hostPage = await (await req(`/admin/events/${out.id}`, { cookie: h.admin.cookie })).text();
    expect(hostPage).toContain("Is PrEP free for me? (0)");

    // No People I Met after a talk.
    expect((await req(`/events/${out.id}/people`, { cookie: m.cookie })).status).not.toBe(200);
  });
});

describe.skipIf(!HAS_DB)("D52: anonymous questions are deleted 30 days after the talk", () => {
  it("removes old talks' questions and keeps recent ones", async () => {
    const old = await mkEvent({ talkMode: true, startsAt: new Date(Date.now() - 40 * DAY), endsAt: new Date(Date.now() - 40 * DAY + 3_600_000) });
    const recent = await mkEvent({ talkMode: true, startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - 2 * DAY + 3_600_000) });
    await db().insert(talkQuestions).values([
      { id: newId(), eventId: old.id, body: "old question", askerHash: "x" },
      { id: newId(), eventId: recent.id, body: "recent question", askerHash: "y" },
    ]);
    await runRetention(ENV, new Date());
    expect(await db().select().from(talkQuestions).where(eq(talkQuestions.eventId, old.id))).toHaveLength(0);
    expect(await db().select().from(talkQuestions).where(eq(talkQuestions.eventId, recent.id))).toHaveLength(1);
  });
});

describe.skipIf(!HAS_DB)("D53, D54: collab events", () => {
  it("an open invite keeps the event off Discover; once accepted, both partners are named and see the same counts", async () => {
    const lead = await partner("venue", `Lead ${randomToken(4)}`);
    const co = await partner("events", `Brewer ${randomToken(4)}`);
    const name = `Isan supper club ${randomToken(6)}`;
    const out = (await (await api(lead.key, "POST", body(lead.username, { title: name }))).json()) as { id: string };
    expect((await req(`/partner/events/${out.id}/cohosts`, { cookie: lead.admin.cookie, form: { orgId: co.orgId } })).status).toBe(302);

    const member = await en(await createMember());
    // Search for it by name: the shared test database holds many other events.
    const find = `/events?view=list&q=${encodeURIComponent(name)}`;
    expect(await (await req(find, { cookie: member.cookie })).text()).not.toContain(`/events/${out.id}"`);

    const [inv] = await db().select().from(eventPartners).where(eq(eventPartners.eventId, out.id));
    expect((await req(`/partner/invites/${inv.id}/accept`, { cookie: co.admin.cookie, method: "POST" })).status).toBe(302);
    const listing = await (await req(find, { cookie: member.cookie })).text();
    expect(listing).toContain(`/events/${out.id}"`);
    expect(listing).toContain(`With ${lead.name} + ${co.name}`);

    const coList = (await (await api(co.key, "GET")).json()) as { events: { id: string; role: string }[] };
    expect(coList.events.find((e) => e.id === out.id)?.role).toBe("cohost");
  });

  it("refuses health with dating, and a dating co-host puts the event behind 💘", async () => {
    const health = await partner("health");
    const dating = await partner("dating");
    const t = (await (await api(health.key, "POST", body(health.username))).json()) as { id: string };
    await req(`/partner/events/${t.id}/cohosts`, { cookie: health.admin.cookie, form: { orgId: dating.orgId } });
    expect(await db().select().from(eventPartners).where(eq(eventPartners.eventId, t.id))).toHaveLength(0);

    const venue = await partner("venue");
    const v = (await (await api(venue.key, "POST", body(venue.username))).json()) as { id: string };
    await req(`/partner/events/${v.id}/cohosts`, { cookie: venue.admin.cookie, form: { orgId: dating.orgId } });
    const [inv] = await db().select().from(eventPartners).where(eq(eventPartners.eventId, v.id));
    await req(`/partner/invites/${inv.id}/accept`, { cookie: dating.admin.cookie, method: "POST" });
    const [e] = await db().select().from(events).where(eq(events.id, v.id));
    expect(e.tags).toContain("open_to_more");
    // 💘 events show their tag on staff pages another file checks (staff-privacy): clear it at once.
    await db().delete(eventPartners).where(eq(eventPartners.eventId, v.id));
    await db().delete(events).where(eq(events.id, v.id));
  });
});

describe.skipIf(!HAS_DB)("D56 to D61: entry rules at booking", () => {
  it("alcohol makes an event 20+ and asks for the ticked disclaimer; alcohol-free filters it out", async () => {
    const p = await partner("venue");
    const out = (await (await api(p.key, "POST", body(p.username, { alcohol_served: true, title: "Wine on the river" }))).json()) as { id: string };
    const [e] = await db().select().from(events).where(eq(events.id, out.id));
    expect(e).toMatchObject({ alcoholServed: true, ageMin: 20 });

    const m = await en(await createMember({ birthDate: "1995-01-01" }));
    const page = await (await req(`/events/${out.id}`, { cookie: m.cookie })).text();
    expect(page).toContain("Alcohol served");
    expect(page).toContain('name="disclaimer"');
    expect((await req(`/events/${out.id}/rsvp`, { cookie: m.cookie, method: "POST", form: {} })).status).toBe(400);
    expect((await req(`/events/${out.id}/rsvp`, { cookie: m.cookie, form: { disclaimer: "1" } })).status).toBe(302);

    const dry = await (await req("/events?view=list&alcoholFree=1", { cookie: m.cookie })).text();
    expect(dry).not.toContain("Wine on the river");
  });

  it("a join code gates the group's event", async () => {
    const e = await mkEvent({ groupLabel: "Chula students", groupJoinCode: "CHULA-26" });
    const m = await en(await createMember());
    expect((await req(`/events/${e.id}/rsvp`, { cookie: m.cookie, form: { joinCode: "WRONG", disclaimer: "1" } })).status).toBe(403);
    expect((await req(`/events/${e.id}/rsvp`, { cookie: m.cookie, form: { joinCode: "chula-26" } })).status).toBe(302);
    const [r] = await db().select().from(registrations).where(and(eq(registrations.eventId, e.id), eq(registrations.accountId, m.id)));
    expect(r.status).toBe("confirmed");
  });

  it("organiser approval turns an RSVP into a request the host answers", async () => {
    const host = await en(await createMember({ role: "host" }));
    const e = await mkEvent({ approvalRequired: true, hostAccountId: host.id });
    const m = await en(await createMember());
    await req(`/events/${e.id}/rsvp`, { cookie: m.cookie, method: "POST", form: {} });
    const [r] = await db().select().from(registrations).where(and(eq(registrations.eventId, e.id), eq(registrations.accountId, m.id)));
    expect(r.status).toBe("requested");
    expect(await (await req(`/events/${e.id}`, { cookie: m.cookie })).text()).toContain("Requested");
    expect((await req(`/admin/events/${e.id}/requests/${r.id}/approve`, { cookie: host.cookie, method: "POST" })).status).toBe(302);
    const [after] = await db().select().from(registrations).where(eq(registrations.id, r.id));
    expect(after.status).toBe("confirmed");
  });

  it("open entry says no booking is needed, and the button joins a group", async () => {
    const e = await mkEvent({ openEntry: true, tags: ["festival"] });
    const m = await en(await createMember());
    const page = await (await req(`/events/${e.id}`, { cookie: m.cookie })).text();
    expect(page).toContain("Open entry, no booking needed");
    expect(page).toContain("Join a group");
  });

  it("the host form has the entry rules, and private talks only for admins and health partners", async () => {
    const admin = await en(await createMember({ role: "bma_admin" }));
    const form = await (await req("/admin/events/new", { cookie: admin.cookie })).text();
    expect(form).toContain('name="alcoholServed"');
    expect(form).toContain('name="talkMode"');
    const venue = await partner("venue");
    const theirs = await (await req("/admin/events/new", { cookie: venue.admin.cookie })).text();
    expect(theirs).toContain('name="groupJoinCode"');
    expect(theirs).not.toContain('name="talkMode"');
  });

  it("women and non-binary only needs a woman or non-binary host", async () => {
    const p = await partner("community");
    expect((await api(p.key, "POST", body(p.username, { tags: ["women_only"] }))).status).toBe(400);
    await db().update(profiles).set({ gender: "woman" }).where(eq(profiles.accountId, p.admin.id));
    expect((await api(p.key, "POST", body(p.username, { tags: ["women_only"] }))).status).toBe(201);
  });
});
