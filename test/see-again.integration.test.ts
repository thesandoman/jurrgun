/**
 * "See them again" (past event, My events, My people) and the Small tables
 * filter on Discover, against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { blocks, connections, events, profiles, registrations } from "../src/schema";
import { SMALL_TABLE_MAX } from "../src/routes/events";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const en = (m: Member) => `${m.cookie}; lang=en`;
const tag = () => randomToken(5).replace(/[^A-Za-z0-9]/g, "x");
const member = (nickname: string) => createMember({ nickname });

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

/** A past event I checked in to (unless `checkedIn` is false). */
async function pastEvent(over: Partial<typeof events.$inferInsert> = {}) {
  return mkEvent({ startsAt: new Date(Date.now() - 2 * DAY), ...over });
}

async function book(eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) {
  await db()
    .insert(registrations)
    .values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(18), ...over });
}

async function attended(eventId: string, ...ms: Member[]) {
  for (const m of ms) await book(eventId, m.id, { checkedInAt: new Date(Date.now() - 2 * DAY) });
}

async function connect(eventId: string, x: Member, y: Member, level = "friend") {
  const [a, b] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
  const id = newId();
  await db().insert(connections).values({ id, aAccount: a, bAccount: b, level, eventId });
  return id;
}

const page = async (path: string, m: Member) => (await req(path, { cookie: en(m) })).text();

describe.skipIf(!HAS_DB)("see them again", () => {
  it("names connected people from the event and points to an event they booked, on all three pages", async () => {
    const me = await member(`Me${tag()}`);
    const ploy = await member(`Ploy${tag()}`);
    const ken = await member(`Ken${tag()}`);
    const stranger = await member(`Stranger${tag()}`);
    const past = await pastEvent({ titleEn: "Noodle night" });
    await attended(past, me, ploy, ken, stranger);
    await connect(past, me, ploy);
    await connect(past, me, ken, "romance");
    const next = await mkEvent({ titleEn: "Board games at Ari", startsAt: new Date(Date.now() + 4 * DAY) });
    await book(next, ploy.id);
    await book(next, ken.id);
    // The stranger (sat at the table, never connected) booked something sooner: never used.
    const theirs = await mkEvent({ titleEn: "Stranger's pick", startsAt: new Date(Date.now() + DAY) });
    await book(theirs, stranger.id);

    for (const path of [`/events/${past}`, "/me/events", "/connections"]) {
      const html = await page(path, me);
      expect(html, path).toContain('class="card see-again"');
      expect(html, path).toMatch(new RegExp(`Ploy\\w+, Ken\\w+|Ken\\w+, Ploy\\w+`));
      expect(html, path).toContain("2 of them are booked for Board games at Ari");
      expect(html, path).toContain(`href="/events/${next}">See this event`);
      // Nothing about the person I didn't connect with, and never the level.
      const card = html.slice(html.indexOf('class="card see-again"'), html.indexOf("</aside>", html.indexOf('class="card see-again"')));
      expect(card, path).not.toContain("Stranger");
      expect(card, path).not.toContain(theirs);
      expect(card, path).not.toMatch(/romance|something more|💘/i);
    }
    expect(await page(`/events/${past}`, me)).toContain("People you met here");
    expect(await page("/me/events", me)).toContain("People you met at Noodle night");
    // Thai first.
    const th = await (await req("/me/events", { cookie: me.cookie })).text();
    expect(th).toContain("คนที่คุณเจอที่");
    expect(th).toContain("ดูกิจกรรมนี้");
  });

  it("never shows private, sensitive, paused or already-booked plans; falls back to the chat", async () => {
    const me = await member(`Me${tag()}`);
    const ploy = await member(`Ploy${tag()}`);
    const past = await pastEvent({ titleEn: "Riverside walk" });
    await attended(past, me, ploy);
    const conn = await connect(past, me, ploy);
    const priv = await mkEvent({ visibility: "private", privateToken: randomToken(12) });
    const dating = await mkEvent({ tags: ["open_to_more"] });
    const women = await mkEvent({ tags: ["women_only"] });
    const queer = await mkEvent({ tags: ["lgbtq_community"] });
    const tooOld = await mkEvent({ ageMin: 60, ageMax: 99 });
    const waitlisted = await mkEvent();
    for (const e of [priv, dating, women, queer, tooOld]) await book(e, ploy.id);
    await book(waitlisted, ploy.id, { status: "waitlisted" });
    // One I'm already going to myself isn't a next step either.
    const both = await mkEvent();
    await book(both, ploy.id);
    await book(both, me.id);

    const html = await page(`/events/${past}`, me);
    expect(html).toContain('class="card see-again"');
    for (const id of [priv, dating, women, queer, tooOld, waitlisted, both]) expect(html).not.toContain(`href="/events/${id}">See this event`);
    expect(html).toContain(`href="/chat/conn:${conn}?say=`);
    expect(html).toContain(`Chat with ${(await nickOf(ploy))}`);

    // A plain public event, but Ploy has paused Jurrgun: still not shown.
    const open = await mkEvent();
    await book(open, ploy.id);
    await db().update(profiles).set({ pausedUntil: new Date(Date.now() + 7 * DAY) }).where(eq(profiles.accountId, ploy.id));
    expect(await page(`/events/${past}`, me)).not.toContain(`href="/events/${open}">See this event`);
    await db().update(profiles).set({ pausedUntil: null }).where(eq(profiles.accountId, ploy.id));
    expect(await page(`/events/${past}`, me)).toContain(`href="/events/${open}">See this event`);
  });

  it("several people with nothing to show: one step, to the chats", async () => {
    const me = await member(`Me${tag()}`);
    const a = await member(`Aa${tag()}`);
    const b = await member(`Bb${tag()}`);
    const c = await member(`Cc${tag()}`);
    const d = await member(`Dd${tag()}`);
    const past = await pastEvent();
    await attended(past, me, a, b, c, d);
    for (const x of [a, b, c, d]) await connect(past, me, x);
    const html = await page("/connections", me);
    expect(html).toContain("and 1 more");
    expect(html).toContain('href="/chat">Open your chats');
    expect((html.match(/class="card see-again"/g) ?? []).length).toBe(1);
  });

  it("no card for blocked, removed or unconnected people, or when I didn't check in", async () => {
    const me = await member(`Me${tag()}`);
    const blocked = await member(`Bl${tag()}`);
    const removed = await member(`Rm${tag()}`);
    const tablemate = await member(`Tm${tag()}`);
    const past = await pastEvent();
    await attended(past, me, blocked, removed, tablemate);
    await connect(past, me, blocked);
    const rid = await connect(past, me, removed);
    await db().update(connections).set({ removedAt: new Date() }).where(eq(connections.id, rid));
    await db().insert(blocks).values({ id: newId(), blocker: blocked.id, blocked: me.id });
    for (const path of [`/events/${past}`, "/me/events", "/connections"]) expect(await page(path, me), path).not.toContain('class="card see-again"');

    // Booked but never checked in: nothing on that event's page.
    const other = await member(`Ot${tag()}`);
    const missed = await pastEvent();
    await book(missed, me.id);
    await attended(missed, other);
    await connect(missed, me, other);
    expect(await page(`/events/${missed}`, me)).not.toContain('class="card see-again"');
  });
});

async function nickOf(m: Member) {
  const [p] = await db().select({ n: profiles.nickname }).from(profiles).where(eq(profiles.accountId, m.id));
  return p.n;
}

describe.skipIf(!HAS_DB)("small tables filter", () => {
  it(`keeps events of ${SMALL_TABLE_MAX} seats or fewer, counts as a filter, and keeps the query`, async () => {
    const m = await createMember();
    const word = `Sm${tag()}`;
    const small = await mkEvent({ title: `${word} small`, titleEn: `${word} small`, capacity: 6 });
    const edge = await mkEvent({ title: `${word} edge`, titleEn: `${word} edge`, capacity: SMALL_TABLE_MAX });
    const big = await mkEvent({ title: `${word} big`, titleEn: `${word} big`, capacity: 20 });
    const all = await page(`/events?view=list&q=${word}`, m);
    for (const id of [small, edge, big]) expect(all).toContain(`/events/${id}`);
    expect(all).not.toMatch(/name="small" value="1" checked/);

    const list = await page(`/events?view=list&q=${word}&small=1`, m);
    expect(list).toContain(`/events/${small}`);
    expect(list).toContain(`/events/${edge}`);
    expect(list).not.toContain(`/events/${big}`);
    expect(list).toContain(`Small tables: ${SMALL_TABLE_MAX} people or fewer`);
    expect(list).toMatch(/name="small" value="1" checked/);
    // The Filters badge counts it like the others (the text search is the other one).
    expect(list).toContain('<span class="count">2</span>');
    expect(await page("/events?view=list&small=1", m)).toContain('<span class="count">1</span>');
    // The When tabs and the map switch keep it in the URL.
    expect(list).toMatch(/href="\/events\?[^"]*small=1[^"]*view=map"/);

    // The map view filters the same way.
    const map = await page(`/events?q=${word}&small=1`, m);
    const data = JSON.parse(map.split('<script type="application/json" id="dmap-data">')[1].split("</script>")[0]);
    const ids = data.points.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(big);
    expect(map).toContain('class="fd-filters active"');

    // Thai first.
    const th = await (await req(`/events?view=list&small=1`, { cookie: m.cookie })).text();
    expect(th).toContain(`โต๊ะเล็ก ไม่เกิน ${SMALL_TABLE_MAX} คน`);
  });
});
