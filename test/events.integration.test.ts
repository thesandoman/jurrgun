/**
 * Member event flows against local Postgres: discover, RSVP, waitlist,
 * strikes, +1, pass, live page, signals and feedback.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { accounts, blocks, buddyPairs, events, feedback, profiles, registrations, strikes, vibes } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { shortCode } from "../src/lib/qr";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * DAY);
  await db()
    .insert(events)
    .values({
      id,
      title: `EV-${id.slice(0, 8)}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * HOUR),
      venueName: "Lumphini Park",
      district: "pathum_wan",
      capacity: 10,
      status: "published",
      createdBy: "test",
      ...over,
    });
  return id;
}

async function mkReg(eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) {
  const id = newId();
  await db()
    .insert(registrations)
    .values({ id, eventId, accountId, status: "confirmed", passToken: randomToken(18), ...over });
  return id;
}

async function regOf(eventId: string, accountId: string) {
  const [r] = await db()
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, accountId)))
    .limit(1);
  return r;
}

const loc = (r: Response) => r.headers.get("location") ?? "";
const nick = (p: string) => `${p}${randomToken(4).replace(/[^A-Za-z0-9]/g, "x")}`;

describe.skipIf(!HAS_DB)("events", () => {
  it("map view (the default): sv-map points, the same events listed below, filters kept", async () => {
    const m = await createMember();
    const exact = await mkEvent({ district: "bang_bon", mapUrl: "https://maps.google.com/?q=13.6339,100.3687", tags: ["food"] });
    const area = await mkEvent({ district: "bang_bon", tags: ["walk"] });
    const nowhere = await mkEvent({ district: "wang_thonglang" });
    const draft = await mkEvent({ district: "bang_bon", status: "draft" });
    const r = await req("/events?district=bang_bon", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('/vendor/sv-map.js?v=');
    const data = JSON.parse(html.split('<script type="application/json" id="dmap-data">')[1].split("</script>")[0]);
    const ids = data.points.map((p: { id: string }) => p.id);
    expect(ids).toContain(exact);
    expect(ids).toContain(area);
    expect(ids).not.toContain(draft);
    const pt = (id: string) => data.points.find((p: { id: string }) => p.id === id);
    expect(pt(exact).precision).toBe("exact");
    expect(pt(area).precision).toBe("area");
    expect(pt(exact).href).toBe(`/events/${exact}`);
    // The list section repeats the events under the map.
    expect(html).toContain('id="discover-list"');
    expect(html).toContain(`EV-${exact.slice(0, 8)}`);
    // Filters survive the switch, and nothing about other people is sent.
    expect(html).toContain('href="/events?district=bang_bon&amp;view=list"');
    expect(JSON.stringify(data)).not.toMatch(/accountId|nickname|attendees|researchId/);
    // Events without a place still appear in the list, with a note.
    const w = await (await req("/events?district=wang_thonglang", { cookie: `${m.cookie}; lang=en` })).text();
    expect(w).toContain(`EV-${nowhere.slice(0, 8)}`);
    expect(w).toContain("on the map yet");
    // List view is list only.
    const l = await (await req("/events?district=bang_bon&view=list", { cookie: m.cookie })).text();
    expect(l).not.toContain('id="dmap-data"');
    expect(l).toContain('name="view" value="list"');
    expect((await req("/events")).status).toBe(302);
  });

  it("Discover is a full-screen map with ticker, status card, tools, events sheet and centre button", async () => {
    const m = await createMember();
    const ev = await mkEvent({ district: "bang_bon", tags: ["city_quest"], startsAt: new Date(Date.now() + 2 * HOUR) });
    const html = await (await req("/events?district=bang_bon", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain('class="fullmap-body"');
    expect(html).toContain('class="fd-ticker"');
    expect(html).toContain("events this week");
    expect(html).toContain('class="fd-status ok"');
    for (const id of ['id="fd-q"', 'id="a11y"', 'id="fd-style"', 'id="fd-quests"', 'id="fd-me"', 'id="discover-sheet"', 'id="fd-filters"']) expect(html).toContain(id);
    expect(html).toContain('class="center');
    expect(html).toContain(`EV-${ev.slice(0, 8)}`);
    expect(html).not.toContain('class="topbar"'); // the page draws its own floating header
    expect(html).not.toContain("Open-Meteo"); // no weather in tests (NO_EXTERNAL)
  });

  it("searches events by title or venue, on the server too", async () => {
    const m = await createMember();
    const tag = `Zq${Date.now().toString(36)}`;
    const hit = await mkEvent({ district: "bang_bon" });
    await db().update(events).set({ venueName: `${tag} Hall` }).where(eq(events.id, hit));
    const miss = await mkEvent({ district: "bang_bon" });
    const html = await (await req(`/events?q=${tag.toLowerCase()}`, { cookie: m.cookie })).text();
    expect(html).toContain(`EV-${hit.slice(0, 8)}`);
    expect(html).not.toContain(`EV-${miss.slice(0, 8)}`);
    expect((await req("/events?q=%25%25", { cookie: m.cookie })).status).toBe(200); // wildcards are escaped
  });

  it("shows the map and an empty list section when no events match", async () => {
    const m = await createMember();
    const html = await (await req("/events?tag=festival&district=bang_bon&when=today&lang=en", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain('id="dmap"');
    expect(html).toContain('id="discover-list"');
    expect(html).toContain("No events on the map yet"); // sv-map's own empty line, set in its messages
    expect(html).toContain("No events match these filters yet");
    const data = JSON.parse(html.split('<script type="application/json" id="dmap-data">')[1].split("</script>")[0]);
    expect(data.points).toEqual([]);
  });

  it("redirects signed-out visitors to /login", async () => {
    const r = await req("/events");
    expect(r.status).toBe(302);
    expect(loc(r)).toMatch(/^\/login\?next=%2Fevents/);
    expect(loc(await req("/me/events"))).toMatch(/^\/login/);
    expect(loc(await req(`/events/${newId()}/rsvp`, { method: "POST" }))).toMatch(/^\/login/);
  });

  it("discover lists published upcoming events and hides drafts and past events", async () => {
    const m = await createMember();
    const pub = await mkEvent({ district: "nong_chok", startsAt: new Date(Date.now() + 2 * HOUR) });
    const draft = await mkEvent({ district: "nong_chok", status: "draft", startsAt: new Date(Date.now() + 2 * HOUR) });
    const past = await mkEvent({ district: "nong_chok", startsAt: new Date(Date.now() - 2 * DAY) });
    const r = await req("/events?district=nong_chok", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(`EV-${pub.slice(0, 8)}`);
    expect(html).not.toContain(`EV-${draft.slice(0, 8)}`);
    expect(html).not.toContain(`EV-${past.slice(0, 8)}`);
  });

  it("filters by free, tag, +1, age, language, intensity and date", async () => {
    const m = await createMember({ birthDate: "1996-05-01" });
    const soon = new Date(Date.now() + 2 * HOUR);
    const base = { district: "thung_khru", startsAt: soon };
    const free = await mkEvent({ ...base, tags: ["food"], plusOneAllowed: true, languages: ["th", "en"], intensity: "chill" });
    const paid = await mkEvent({ ...base, costThb: 300, tags: ["run"], ageMin: 60, ageMax: 99 });
    const later = await mkEvent({ ...base, startsAt: new Date(Date.now() + 10 * DAY) });
    const has = async (q: string, id: string) => (await (await req(`/events?district=thung_khru&${q}`, { cookie: m.cookie })).text()).includes(`EV-${id.slice(0, 8)}`);
    expect(await has("free=1", free)).toBe(true);
    expect(await has("free=1", paid)).toBe(false);
    expect(await has("tag=run", paid)).toBe(true);
    expect(await has("tag=run", free)).toBe(false);
    expect(await has("plusOne=1", paid)).toBe(false);
    expect(await has("plusOne=1", free)).toBe(true);
    expect(await has("fitsAge=1", paid)).toBe(false);
    expect(await has("fitsAge=1", free)).toBe(true);
    expect(await has("language=en", free)).toBe(true);
    expect(await has("language=en", paid)).toBe(false);
    expect(await has("intensity=chill", free)).toBe(true);
    expect(await has("intensity=chill", paid)).toBe(false);
    expect(await has("when=week", later)).toBe(false);
    expect(await has("when=all", later)).toBe(true);
  });

  it("detail: 404 for missing and draft events; staff can preview drafts", async () => {
    const m = await createMember();
    const host = await createMember({ role: "host" });
    const draft = await mkEvent({ status: "draft" });
    expect((await req(`/events/${newId()}`, { cookie: m.cookie })).status).toBe(404);
    expect((await req(`/events/${draft}`, { cookie: m.cookie })).status).toBe(404);
    expect((await req(`/events/${draft}`, { cookie: host.cookie })).status).toBe(200);
    const pub = await mkEvent({ costThb: 250, paymentNote: "Pay at the door", plusOneAllowed: true });
    const html = await (await req(`/events/${pub}`, { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain("Pay at the door");
    expect(html).toContain("RSVP");
  });

  it("RSVP confirms while seats last, then waitlists", async () => {
    const [a, b] = [await createMember(), await createMember()];
    const ev = await mkEvent({ capacity: 1 });
    const r1 = await req(`/events/${ev}/rsvp`, { cookie: a.cookie, method: "POST", form: {} });
    expect(loc(r1)).toBe(`/events/${ev}?notice=rsvp_confirmed`);
    const r2 = await req(`/events/${ev}/rsvp`, { cookie: b.cookie, method: "POST", form: {} });
    expect(loc(r2)).toBe(`/events/${ev}?notice=rsvp_waitlisted`);
    expect((await regOf(ev, a.id)).status).toBe("confirmed");
    expect((await regOf(ev, b.id)).status).toBe("waitlisted");
  });

  it("never overbooks when several members RSVP for the last seats at once", async () => {
    const people = await Promise.all(Array.from({ length: 6 }, () => createMember()));
    const ev = await mkEvent({ capacity: 2 });
    const results = await Promise.all(people.map((p) => req(`/events/${ev}/rsvp`, { cookie: p.cookie, method: "POST", form: {} })));
    for (const r of results) expect(r.status).toBe(302);
    const rows = await db().select().from(registrations).where(eq(registrations.eventId, ev)).limit(20);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.status === "confirmed" || r.status === "offered").length).toBeLessThanOrEqual(2);
  });

  it("a double-tapped RSVP makes one registration and no error", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    const [r1, r2] = await Promise.all([1, 2].map(() => req(`/events/${ev}/rsvp`, { cookie: m.cookie, method: "POST", form: {} })));
    expect(r1.status).toBe(302);
    expect(r2.status).toBe(302);
    const rows = await db().select().from(registrations).where(and(eq(registrations.eventId, ev), eq(registrations.accountId, m.id))).limit(5);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
  });

  it("keeps the resident quota for verified Bangkok residents", async () => {
    const [n1, n2] = [await createMember(), await createMember()];
    const resident = await createMember({ bkkRegistered: "verified" });
    const ev = await mkEvent({ capacity: 2, residentQuota: 1 });
    expect(loc(await req(`/events/${ev}/rsvp`, { cookie: n1.cookie, method: "POST", form: {} }))).toContain("rsvp_confirmed");
    expect(loc(await req(`/events/${ev}/rsvp`, { cookie: n2.cookie, method: "POST", form: {} }))).toContain("rsvp_waitlisted");
    expect(loc(await req(`/events/${ev}/rsvp`, { cookie: resident.cookie, method: "POST", form: {} }))).toContain("rsvp_confirmed");
  });

  it("refuses RSVPs outside the event age range", async () => {
    const m = await createMember({ birthDate: "1996-05-01" });
    const ev = await mkEvent({ ageMin: 40, ageMax: 60 });
    const r = await req(`/events/${ev}/rsvp`, { cookie: m.cookie, method: "POST", form: {} });
    expect(r.status).toBe(403);
    expect(await regOf(ev, m.id)).toBeUndefined();
  });

  it("3 strikes block RSVPs; 2 strikes allow only one upcoming RSVP", async () => {
    const three = await createMember();
    const exp = new Date(Date.now() + 80 * DAY);
    for (let i = 0; i < 3; i++) {
      await db().insert(strikes).values({ id: newId(), accountId: three.id, eventId: newId(), reason: "no_show", expiresAt: exp });
    }
    const ev = await mkEvent();
    const r = await req(`/events/${ev}/rsvp`, { cookie: three.cookie, method: "POST", form: {} });
    expect(r.status).toBe(403);

    const two = await createMember();
    for (let i = 0; i < 2; i++) {
      await db().insert(strikes).values({ id: newId(), accountId: two.id, eventId: newId(), reason: "late_cancel", expiresAt: exp });
    }
    const first = await mkEvent();
    const second = await mkEvent();
    expect(loc(await req(`/events/${first}/rsvp`, { cookie: two.cookie, method: "POST", form: {} }))).toContain("rsvp_confirmed");
    expect((await req(`/events/${second}/rsvp`, { cookie: two.cookie, method: "POST", form: {} })).status).toBe(403);
    // Once staff cancel that event, it no longer uses up the one place.
    await db().update(events).set({ status: "cancelled" }).where(eq(events.id, first));
    expect(loc(await req(`/events/${second}/rsvp`, { cookie: two.cookie, method: "POST", form: {} }))).toContain("rsvp_confirmed");
    // Strikes are shown privately in My events.
    expect(await (await req("/me/events", { cookie: `${two.cookie}; lang=en` })).text()).toContain("Active strikes: 2");
  });

  it("late cancel creates a strike; early cancel doesn't", async () => {
    const m = await createMember();
    const late = await mkEvent({ startsAt: new Date(Date.now() + 10 * HOUR) });
    const early = await mkEvent({ startsAt: new Date(Date.now() + 3 * DAY) });
    await req(`/events/${late}/rsvp`, { cookie: m.cookie, method: "POST", form: {} });
    await req(`/events/${early}/rsvp`, { cookie: m.cookie, method: "POST", form: {} });

    expect(loc(await req(`/events/${late}/cancel`, { cookie: m.cookie, method: "POST" }))).toBe(`/events/${late}?notice=late_cancel`);
    expect((await regOf(late, m.id)).status).toBe("late_cancelled");
    expect(loc(await req(`/events/${early}/cancel`, { cookie: m.cookie, method: "POST" }))).toBe(`/events/${early}?notice=cancelled`);
    expect((await regOf(early, m.id)).status).toBe("cancelled");

    const rows = await db().select().from(strikes).where(eq(strikes.accountId, m.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe(late);
    expect(rows[0].reason).toBe("late_cancel");

    // A cancelled row is reused on a new RSVP.
    expect(loc(await req(`/events/${early}/rsvp`, { cookie: m.cookie, method: "POST", form: {} }))).toContain("rsvp_confirmed");
  });

  it("a cancellation offers the seat to the next person, who can accept", async () => {
    const [a, b, c2] = [await createMember(), await createMember(), await createMember()];
    const ev = await mkEvent({ capacity: 1 });
    await req(`/events/${ev}/rsvp`, { cookie: a.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/rsvp`, { cookie: b.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/rsvp`, { cookie: c2.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/cancel`, { cookie: a.cookie, method: "POST" });
    const offered = await regOf(ev, b.id);
    expect(offered.status).toBe("offered");
    expect(offered.offeredUntil!.getTime()).toBeGreaterThan(Date.now());
    expect((await regOf(ev, c2.id)).status).toBe("waitlisted");

    // Someone without an offer can't accept one.
    expect((await req(`/events/${ev}/offer`, { cookie: c2.cookie, form: { action: "accept" } })).status).toBe(409);
    expect((await req(`/events/${ev}/offer`, { cookie: b.cookie, form: { action: "maybe" } })).status).toBe(400);
    expect(loc(await req(`/events/${ev}/offer`, { cookie: b.cookie, form: { action: "accept" } }))).toBe(`/events/${ev}?notice=offer_accepted`);
    expect((await regOf(ev, b.id)).status).toBe("confirmed");
  });

  it("declining an offer passes it on", async () => {
    const [a, b, c2] = [await createMember(), await createMember(), await createMember()];
    const ev = await mkEvent({ capacity: 1 });
    await req(`/events/${ev}/rsvp`, { cookie: a.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/rsvp`, { cookie: b.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/rsvp`, { cookie: c2.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/cancel`, { cookie: a.cookie, method: "POST" });
    await req(`/events/${ev}/offer`, { cookie: b.cookie, form: { action: "decline" } });
    expect((await regOf(ev, b.id)).status).toBe("cancelled");
    expect((await regOf(ev, c2.id)).status).toBe("offered");
  });

  it("links +1 pairs when both name each other", async () => {
    const [a, b] = [await createMember(), await createMember()];
    const ev = await mkEvent({ plusOneAllowed: true });
    await req(`/events/${ev}/rsvp`, { cookie: a.cookie, form: { plusOneUsername: b.username } });
    expect((await regOf(ev, a.id)).plusOneUsername).toBe(b.username);
    expect((await regOf(ev, a.id)).plusOneWith).toBeNull();
    await req(`/events/${ev}/rsvp`, { cookie: b.cookie, form: { plusOneUsername: a.username } });
    expect((await regOf(ev, a.id)).plusOneWith).toBe(b.id);
    expect((await regOf(ev, b.id)).plusOneWith).toBe(a.id);

    // Ignored when the event doesn't allow +1.
    const solo = await mkEvent();
    const c2 = await createMember();
    await req(`/events/${solo}/rsvp`, { cookie: c2.cookie, form: { plusOneUsername: a.username } });
    expect((await regOf(solo, c2.id)).plusOneUsername).toBeNull();
  });

  it("the pass is only for my own confirmed registration", async () => {
    const [a, b] = [await createMember(), await createMember()];
    const ev = await mkEvent({ capacity: 1 });
    await req(`/events/${ev}/rsvp`, { cookie: a.cookie, method: "POST", form: {} });
    await req(`/events/${ev}/rsvp`, { cookie: b.cookie, method: "POST", form: {} }); // waitlisted
    const r = await req(`/me/events/${ev}/pass`, { cookie: a.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(shortCode((await regOf(ev, a.id)).passToken));
    expect(html).toContain("<svg");
    expect((await req(`/me/events/${ev}/pass`, { cookie: b.cookie })).status).toBe(404);
    const other = await createMember();
    expect((await req(`/me/events/${ev}/pass`, { cookie: other.cookie })).status).toBe(404);
  });

  it("signals: 'open to a spark' only for romance-eligible members", async () => {
    const friendsOnly = await createMember({ relationship: "married" });
    const single = await createMember({ relationship: "single", romanceOn: true, genderIdentity: "woman", romanceOpenTo: "everyone" });
    const ev = await mkEvent({ startsAt: new Date(Date.now() - HOUR), groupsPublishedAt: new Date() });
    await mkReg(ev, friendsOnly.id, { checkedInAt: new Date(), groupNo: 1 });
    await mkReg(ev, single.id, { checkedInAt: new Date(), groupNo: 1 });

    expect((await req(`/events/${ev}/signal`, { cookie: friendsOnly.cookie, form: { signal: "open_to_spark" } })).status).toBe(400);
    expect((await req(`/events/${ev}/signal`, { cookie: friendsOnly.cookie, form: { signal: "talk_about", signalTopics: "a,b,c,d" } })).status).toBe(400);
    expect(loc(await req(`/events/${ev}/signal`, { cookie: friendsOnly.cookie, form: { signal: "talk_about", signalTopics: "food, music" } }))).toBe(`/events/${ev}/live?notice=saved`);
    expect((await regOf(ev, friendsOnly.id)).signalTopics).toEqual(["food", "music"]);
    expect(loc(await req(`/events/${ev}/signal`, { cookie: single.cookie, form: { signal: "open_to_spark" } }))).toContain("notice=saved");

    // The friends-only member never sees spark wording, even from a groupmate.
    const html = await (await req(`/events/${ev}/live`, { cookie: `${friendsOnly.cookie}; lang=en` })).text();
    expect(html).not.toContain("Open to a spark");
    const html2 = await (await req(`/events/${ev}/live`, { cookie: `${single.cookie}; lang=en` })).text();
    expect(html2).toContain("Open to a spark");

    // Cleared.
    await req(`/events/${ev}/signal`, { cookie: single.cookie, form: { signal: "" } });
    expect((await regOf(ev, single.id)).socialSignal).toBeNull();
  });

  it("live page needs check-in, shows groupmates only once published, and hides blocks", async () => {
    const [mateNick, blkNick, othNick] = [nick("Mate"), nick("Blk"), nick("Oth")];
    const me = await createMember({ nickname: nick("Me") });
    const mate = await createMember({ nickname: mateNick });
    const blocked = await createMember({ nickname: blkNick });
    const otherTable = await createMember({ nickname: othNick });
    const notIn = await createMember();
    const ev = await mkEvent({ startsAt: new Date(Date.now() - HOUR), activePrompt: "Find someone from across the river" });
    const at = new Date();
    await mkReg(ev, me.id, { checkedInAt: at, groupNo: 1 });
    await mkReg(ev, mate.id, { checkedInAt: at, groupNo: 1 });
    await mkReg(ev, blocked.id, { checkedInAt: at, groupNo: 1 });
    await mkReg(ev, otherTable.id, { checkedInAt: at, groupNo: 2 });
    await mkReg(ev, notIn.id);

    expect((await req(`/events/${ev}/live`, { cookie: notIn.cookie })).status).toBe(403);


    let html = await (await req(`/events/${ev}/live`, { cookie: me.cookie })).text();
    expect(html).toContain("Find someone from across the river");
    expect(html).not.toContain(mateNick);

    await db().update(events).set({ groupsPublishedAt: new Date() }).where(eq(events.id, ev));
    html = await (await req(`/events/${ev}/live`, { cookie: me.cookie })).text();
    expect(html).toContain(mateNick);
    expect(html).toContain(blkNick);
    expect(html).not.toContain(othNick);
    expect(html).not.toContain(mate.username);

    // Blocked by the other person: hidden from me too.
    await db().insert(blocks).values({ id: newId(), blocker: blocked.id, blocked: me.id });
    html = await (await req(`/events/${ev}/live`, { cookie: me.cookie })).text();
    expect(html).toContain(mateNick);
    expect(html).not.toContain(blkNick);
  });

  it("feedback: only after the event, for checked-in attendees, and editable", async () => {
    const m = await createMember();
    const absent = await createMember();
    const ended = await mkEvent({ startsAt: new Date(Date.now() - 5 * HOUR) });
    await mkReg(ended, m.id, { checkedInAt: new Date(Date.now() - 4 * HOUR) });
    await mkReg(ended, absent.id);
    const running = await mkEvent({ startsAt: new Date(Date.now() - HOUR) });
    await mkReg(running, m.id, { checkedInAt: new Date() });

    expect((await req(`/events/${running}/feedback`, { cookie: m.cookie })).status).toBe(403);
    expect((await req(`/events/${ended}/feedback`, { cookie: absent.cookie })).status).toBe(403);
    expect((await req(`/events/${ended}/feedback`, { cookie: m.cookie })).status).toBe(200);
    expect((await req(`/events/${ended}/feedback`, { cookie: m.cookie, form: { metNewPerson: "yes" } })).status).toBe(400);

    const form = { metNewPerson: "yes", wouldMeetAgain: "no", feltSafe: "5", groupRating: "4", comment: "Lovely" };
    expect(loc(await req(`/events/${ended}/feedback`, { cookie: m.cookie, form }))).toBe("/me/events?notice=thanks");
    expect(loc(await req(`/events/${ended}/feedback`, { cookie: m.cookie, form: { ...form, groupRating: "2", comment: "Edited" } }))).toBe("/me/events?notice=thanks");
    const rows = await db().select().from(feedback).where(and(eq(feedback.eventId, ended), eq(feedback.accountId, m.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].groupRating).toBe(2);
    expect(rows[0].comment).toBe("Edited");

    const mine = await (await req("/me/events", { cookie: `${m.cookie}; lang=en` })).text();
    expect(mine).toContain("Edit feedback");
    expect(mine).toContain(`/events/${ended}/people`);
  });

  it("shows my event buddy within 24h of the start, and cancelled events to registrants", async () => {
    const bNick = nick("Bud");
    const a = await createMember();
    const b = await createMember({ nickname: bNick });
    const ev = await mkEvent({ startsAt: new Date(Date.now() + 10 * HOUR), buddyEnabled: true, buddyRoundAt: new Date() });
    await mkReg(ev, a.id, { wantsBuddy: true });
    await mkReg(ev, b.id, { wantsBuddy: true });
    await db().insert(buddyPairs).values({ id: newId(), eventId: ev, members: [a.id, b.id], method: "test" });
    const html = await (await req(`/events/${ev}`, { cookie: `${a.cookie}; lang=en` })).text();
    expect(html).toContain("Your event buddy");
    expect(html).toContain(bNick);

    await db().update(events).set({ status: "cancelled" }).where(eq(events.id, ev));
    const r = await req(`/events/${ev}`, { cookie: `${a.cookie}; lang=en` });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("This event has been cancelled");
    const stranger = await createMember();
    expect((await req(`/events/${ev}`, { cookie: stranger.cookie })).status).toBe(404);
  });
  it("filters resident priority events and labels them", async () => {
    const m = await createMember();
    const base = { district: "lat_krabang", startsAt: new Date(Date.now() + 2 * HOUR) };
    const prio = await mkEvent({ ...base, residentPriority: true });
    const quota = await mkEvent({ ...base, residentQuota: 3 });
    const plain = await mkEvent(base);
    const html = await (await req("/events?district=lat_krabang&resident=1", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain(`EV-${prio.slice(0, 8)}`);
    expect(html).toContain(`EV-${quota.slice(0, 8)}`);
    expect(html).not.toContain(`EV-${plain.slice(0, 8)}`);
    expect(html).toContain("Resident priority events");
    expect(html).toContain("🏙️ Resident priority");
  });

  it("shows the Bangkok Type card until I take the quiz or hide it", async () => {
    const m = await createMember();
    const html = async (cookie = m.cookie) => (await req("/events", { cookie: `${cookie}; lang=en` })).text();
    expect(await html()).toContain("Find your Bangkok Type (2 min)");
    const hide = await req("/events/quiz-hint/dismiss", { cookie: m.cookie, method: "POST" });
    expect(hide.status).toBe(302);
    expect(hide.headers.get("set-cookie") ?? "").toContain("bkk_quiz_hint=hide");
    expect(await html(`${m.cookie}; bkk_quiz_hint=hide`)).not.toContain("Find your Bangkok Type");
    await db().insert(vibes).values({ accountId: m.id, vector: {}, archetype: "BDMN", visible: false });
    expect(await html()).not.toContain("Find your Bangkok Type");
  });

  it("falls back to the emoji cover when there is no storage binding", async () => {
    const m = await createMember();
    const ev = await mkEvent({ coverKey: `uploads/events/x/${newId()}`, tags: ["food"] });
    const html = await (await req(`/events/${ev}`, { cookie: m.cookie })).text();
    expect(html).toContain("🍜");
    expect(html).not.toContain("<img");
    expect((await req(`/events/${ev}/cover`, { cookie: m.cookie })).status).toBe(404);
  });

  it("live page: resident badge only when verified AND opted in; Bangkok Type only when visible; nobody hidden", async () => {
    const [aNick, bNick, cNick] = [`A${nick("a")}`, `B${nick("b")}`, `C${nick("c")}`];
    const me = await createMember({ nickname: nick("Me") });
    const a = await createMember({ nickname: aNick, bkkRegistered: "verified" });
    const b = await createMember({ nickname: bNick, bkkRegistered: "verified" });
    const c = await createMember({ nickname: cNick });
    const ev = await mkEvent({ startsAt: new Date(Date.now() - HOUR), groupsPublishedAt: new Date() });
    const at = new Date();
    for (const x of [me, a, b, c]) await mkReg(ev, x.id, { checkedInAt: at, groupNo: 1 });
    // a: verified + opted in. b: verified, not opted in. c: opted in, not verified.
    await db().update(profiles).set({ showResidentBadge: true }).where(eq(profiles.accountId, a.id));
    await db().update(profiles).set({ showResidentBadge: true }).where(eq(profiles.accountId, c.id));
    await db().update(accounts).set({ bkkRegistered: "not_verified" }).where(eq(accounts.id, c.id));
    // Types: a hidden, b visible (Food Hunter BDSH), me has the full opposite (CFMN = interesting).
    await db().insert(vibes).values([
      { accountId: a.id, vector: {}, archetype: "BFSN", visible: false },
      { accountId: b.id, vector: {}, archetype: "BDSH", visible: true },
      { accountId: me.id, vector: {}, archetype: "CFMN", visible: false },
    ]);
    const html = await (await req(`/events/${ev}/live`, { cookie: `${me.cookie}; lang=en` })).text();
    const items = html.split('<li class="person">').slice(1);
    const item = (n: string) => items.find((x) => x.includes(n)) ?? "";
    expect(item(aNick)).toContain("Bangkok resident");
    expect(item(bNick)).not.toContain("Bangkok resident");
    expect(item(cNick)).not.toContain("Bangkok resident");
    expect(item(aNick)).not.toContain("The Party Host");
    expect(item(bNick)).toContain("🍜 The Food Hunter");
    expect(item(bNick)).toContain("Interesting match");
    expect(item(bNick)).toContain("queue longest for");
    // Everyone is still listed (types never hide anyone).
    for (const n of [aNick, bNick, cNick]) expect(html).toContain(n);
  });
});
