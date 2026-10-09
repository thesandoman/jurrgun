/**
 * People I Met, mutual consent, circle, contact exchange, report, block and
 * notifications — against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import {
  accounts,
  blocks,
  connectionChoices,
  connections,
  contactShares,
  events,
  notifications,
  profiles,
  registrations,
  reports,
  vibes,
} from "../src/schema";
import { displayName } from "../src/vibe/archetypes";

const HOUR = 3_600_000;
/** The profile locale beats ?lang=, so English pages need the lang cookie. */
const en = (m: Member) => `${m.cookie}; lang=en`;

async function makeEvent(opts: { endedHoursAgo: number; groupsPublished?: boolean; title?: string }) {
  const id = newId();
  const ends = new Date(Date.now() - opts.endedHoursAgo * HOUR);
  await db()
    .insert(events)
    .values({
      id,
      title: opts.title ?? `งานทดสอบ ${id.slice(0, 6)}`,
      titleEn: opts.title ?? `Test event ${id.slice(0, 6)}`,
      startsAt: new Date(ends.getTime() - 2 * HOUR),
      endsAt: ends,
      venueName: "Lumphini Park",
      district: "pathum_wan",
      capacity: 20,
      status: "published",
      groupsPublishedAt: opts.groupsPublished ? new Date(ends.getTime() - HOUR) : null,
      createdBy: "test",
    });
  return id;
}

async function attend(eventId: string, m: Member, opts: { checkedIn?: boolean; groupNo?: number | null } = {}) {
  await db()
    .insert(registrations)
    .values({
      id: newId(),
      eventId,
      accountId: m.id,
      status: "confirmed",
      passToken: randomToken(),
      checkedInAt: opts.checkedIn === false ? null : new Date(Date.now() - 3 * HOUR),
      groupNo: opts.groupNo ?? null,
    });
}

const nick = () => `N${randomToken(4).replace(/[^A-Za-z0-9]/g, "x")}`;
const member = (o: Parameters<typeof createMember>[0] = {}) => createMember({ nickname: nick(), ...o });

async function choose(eventId: string, from: Member, picks: Record<string, string>) {
  const form: Record<string, string> = {};
  for (const [id, ch] of Object.entries(picks)) form[`choice_${id}`] = ch;
  return req(`/events/${eventId}/people`, { cookie: from.cookie, form, method: "POST" });
}

async function connectionBetween(eventId: string, x: Member, y: Member) {
  const [a, b] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
  const [row] = await db()
    .select()
    .from(connections)
    .where(and(eq(connections.aAccount, a), eq(connections.bAccount, b), eq(connections.eventId, eventId)));
  return row;
}

async function notesFor(m: Member) {
  return db().select().from(notifications).where(eq(notifications.accountId, m.id));
}

describe.skipIf(!HAS_DB)("People I Met", () => {
  it("redirects anonymous visitors to /login", async () => {
    const r = await req("/events/x/people");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("/login");
    for (const p of ["/connections", "/notifications", "/report?event=x"]) {
      expect((await req(p)).headers.get("location")).toContain("/login");
    }
  });

  it("follows the 72h window and needs a check-in", async () => {
    const me = await member();
    const upcoming = await makeEvent({ endedHoursAgo: -2 });
    const closed = await makeEvent({ endedHoursAgo: 80 });
    const open = await makeEvent({ endedHoursAgo: 1 });
    const notIn = await makeEvent({ endedHoursAgo: 1 });
    for (const e of [upcoming, closed, open]) await attend(e, me);
    await attend(notIn, me, { checkedIn: false });

    const before = await req(`/events/${upcoming}/people`, { cookie: en(me) });
    expect(before.status).toBe(200);
    expect(await before.text()).toContain("opens after the event");
    const after = await req(`/events/${closed}/people`, { cookie: en(me) });
    expect(await after.text()).toContain("closed 72 hours");
    const ok = await req(`/events/${open}/people`, { cookie: en(me) });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Only mutual choices create a connection. Nobody is ever told you didn");
    const refused = await req(`/events/${notIn}/people`, { cookie: me.cookie });
    expect(refused.status).toBe(403);
    expect((await choose(notIn, me, {})).status).toBe(403);
    expect((await choose(closed, me, {})).status).toBe(403);
    expect((await req(`/events/nope/people`, { cookie: me.cookie })).status).toBe(404);
  });

  it("lists only my group, hides blocks both ways, inactive accounts and age mismatches", async () => {
    const me = await member({ birthDate: "1996-05-01", ageMin: 20, ageMax: 40 });
    const same = await member();
    const otherTable = await member();
    const iBlocked = await member();
    const blockedMe = await member();
    const tooOld = await member({ birthDate: "1960-01-01" }); // outside my range
    const prefersOlder = await member({ ageMin: 45, ageMax: 99 }); // I'm outside theirs
    const banned = await member();
    const notCheckedIn = await member();
    const ev = await makeEvent({ endedHoursAgo: 1, groupsPublished: true });
    await attend(ev, me, { groupNo: 1 });
    for (const m of [same, iBlocked, blockedMe, tooOld, prefersOlder, banned]) await attend(ev, m, { groupNo: 1 });
    await attend(ev, otherTable, { groupNo: 2 });
    await attend(ev, notCheckedIn, { groupNo: 1, checkedIn: false });
    await db().insert(blocks).values({ id: newId(), blocker: me.id, blocked: iBlocked.id });
    await db().insert(blocks).values({ id: newId(), blocker: blockedMe.id, blocked: me.id });
    await db().update(accounts).set({ status: "banned" }).where(eq(accounts.id, banned.id));

    const html = await (await req(`/events/${ev}/people`, { cookie: me.cookie })).text();
    expect(html).toContain(`choice_${same.id}`);
    for (const m of [otherTable, iBlocked, blockedMe, tooOld, prefersOlder, banned, notCheckedIn]) {
      expect(html).not.toContain(m.id);
    }
    // Posting for someone off my list is ignored.
    await choose(ev, me, { [otherTable.id]: "friend", [same.id]: "friend" });
    const mine = await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, me.id));
    expect(mine.map((x) => x.toAccount)).toEqual([same.id]);
  });

  it("with no published groups the whole event is one group; a null group sees nobody once published", async () => {
    const me = await member();
    const a = await member();
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, me);
    await attend(ev, a, { groupNo: 3 });
    expect(await (await req(`/events/${ev}/people`, { cookie: me.cookie })).text()).toContain(a.id);

    const ev2 = await makeEvent({ endedHoursAgo: 1, groupsPublished: true });
    await attend(ev2, me);
    await attend(ev2, a, { groupNo: 1 });
    expect(await (await req(`/events/${ev2}/people`, { cookie: me.cookie })).text()).not.toContain(a.id);
  });

  it("friend + friend creates a connection and notifies both; one-sided creates nothing", async () => {
    const x = await member();
    const y = await member();
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, x);
    await attend(ev, y);

    const r = await choose(ev, x, { [y.id]: "friend" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(`/events/${ev}/people?notice=choices_saved`);
    expect(await connectionBetween(ev, x, y)).toBeUndefined();
    expect(await notesFor(y)).toHaveLength(0); // unreturned interest never disclosed

    await choose(ev, y, { [x.id]: "friend" });
    const conn = await connectionBetween(ev, x, y);
    expect(conn.level).toBe("friend");
    expect(conn.removedAt).toBeNull();
    const nx = await notesFor(x);
    const ny = await notesFor(y);
    expect(nx).toHaveLength(1);
    expect(ny).toHaveLength(1);
    expect(ny[0].titleEn).toContain("new connection");

    // Saving again doesn't re-notify.
    await choose(ev, y, { [x.id]: "friend" });
    expect(await notesFor(x)).toHaveLength(1);
  });

  it("romance + friend gives a friend connection and never reveals the romance choice", async () => {
    const x = await member({ romanceOn: true, genderIdentity: "woman", romanceOpenTo: "everyone" });
    const y = await member({ romanceOn: true, genderIdentity: "man", romanceOpenTo: "everyone" });
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, x);
    await attend(ev, y);
    await choose(ev, x, { [y.id]: "romance" });
    await choose(ev, y, { [x.id]: "friend" });
    expect((await connectionBetween(ev, x, y)).level).toBe("friend");

    const page = await (await req("/connections", { cookie: en(y) })).text();
    expect(page).toContain("Would like to be friends");
    expect(page).not.toContain("Open to something more");
    const yPeople = await (await req(`/events/${ev}/people`, { cookie: en(y) })).text();
    // y sees the romance option (eligible) but only their own choice is checked.
    expect(yPeople).not.toMatch(new RegExp(`name="choice_${x.id}" value="romance" checked`));
    for (const n of [...(await notesFor(x)), ...(await notesFor(y))]) {
      expect(`${n.titleEn} ${n.titleTh}`.toLowerCase()).not.toContain("romance");
      expect(n.titleEn).not.toContain("something more");
    }
  });

  it("romance + romance gives romance only when compatible", async () => {
    const ev = await makeEvent({ endedHoursAgo: 1 });
    const x = await member({ romanceOn: true, genderIdentity: "woman", romanceOpenTo: ["man"] });
    const y = await member({ romanceOn: true, genderIdentity: "man", romanceOpenTo: ["woman"] });
    const z = await member({ romanceOn: true, genderIdentity: "woman", romanceOpenTo: ["woman"] });
    for (const m of [x, y, z]) await attend(ev, m);
    await choose(ev, x, { [y.id]: "romance", [z.id]: "romance" });
    await choose(ev, y, { [x.id]: "romance" });
    await choose(ev, z, { [x.id]: "romance" });
    expect((await connectionBetween(ev, x, y)).level).toBe("romance");
    expect((await connectionBetween(ev, x, z)).level).toBe("friend"); // x isn't open to women
  });

  it("a non-eligible user sees no romance option and a forged romance is stored as friend", async () => {
    const plain = await member({ relationship: "married" });
    const other = await member({ romanceOn: true, genderIdentity: "man", romanceOpenTo: "everyone" });
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, plain);
    await attend(ev, other);
    const html = await (await req(`/events/${ev}/people`, { cookie: en(plain) })).text();
    expect(html).not.toContain('value="romance"');
    expect(html).not.toContain("Open to something more");
    await choose(ev, plain, { [other.id]: "romance" });
    const [row] = await db()
      .select()
      .from(connectionChoices)
      .where(and(eq(connectionChoices.fromAccount, plain.id), eq(connectionChoices.toAccount, other.id)));
    expect(row.choice).toBe("friend");
    await choose(ev, other, { [plain.id]: "romance" });
    expect((await connectionBetween(ev, plain, other)).level).toBe("friend");
  });

  it("changing to none removes the connection", async () => {
    const x = await member();
    const y = await member();
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, x);
    await attend(ev, y);
    await choose(ev, x, { [y.id]: "activity" });
    await choose(ev, y, { [x.id]: "friend" });
    expect((await connectionBetween(ev, x, y)).level).toBe("activity");
    await choose(ev, x, { [y.id]: "none" });
    expect((await connectionBetween(ev, x, y)).removedAt).not.toBeNull();
    expect(await (await req("/connections", { cookie: y.cookie })).text()).not.toContain(`/block/${x.id}`);
  });
});

describe.skipIf(!HAS_DB)("Bangkok circle, report, block, notifications", () => {
  async function connectedPair() {
    const x = await member();
    const y = await member();
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, x);
    await attend(ev, y);
    await choose(ev, x, { [y.id]: "friend" });
    await choose(ev, y, { [x.id]: "friend" });
    const conn = await connectionBetween(ev, x, y);
    return { x, y, ev, conn };
  }

  it("shows an empty state pointing to events", async () => {
    const m = await member();
    const html = await (await req("/connections", { cookie: en(m) })).text();
    expect(html).toContain("No connections yet");
    expect(html).toContain('href="/events"');
  });

  it("shares contacts: I always see mine, they see it once shared; validation and participants only", async () => {
    const { x, y, conn } = await connectedPair();
    const outsider = await member();
    expect((await req(`/connections/${conn.id}/share`, { cookie: outsider.cookie, form: { method: "line", value: "abc" } })).status).toBe(404);
    expect((await req(`/connections/${conn.id}/share`, { cookie: x.cookie, form: { method: "line", value: "bad handle!" } })).status).toBe(400);
    expect((await req(`/connections/${conn.id}/share`, { cookie: x.cookie, form: { method: "fax", value: "abc" } })).status).toBe(400);

    let yView = await (await req("/connections", { cookie: y.cookie })).text();
    expect(yView).not.toContain("x_line_id");
    const r = await req(`/connections/${conn.id}/share`, { cookie: x.cookie, form: { method: "line", value: "@x_line_id" } });
    expect(r.headers.get("location")).toBe("/connections?notice=shared");
    expect(await (await req("/connections", { cookie: x.cookie })).text()).toContain("x_line_id");
    yView = await (await req("/connections", { cookie: y.cookie })).text();
    expect(yView).toContain("x_line_id");
    expect((await notesFor(y)).some((n) => n.kind === "contact_shared")).toBe(true);

    // Upsert, not a second row.
    await req(`/connections/${conn.id}/share`, { cookie: x.cookie, form: { method: "instagram", value: "x.ig" } });
    const shares = await db().select().from(contactShares).where(eq(contactShares.connectionId, conn.id));
    expect(shares).toHaveLength(1);
    expect(shares[0].method).toBe("instagram");
  });

  it("removes a connection (participants only) and it stays removed", async () => {
    const { x, y, ev, conn } = await connectedPair();
    const outsider = await member();
    expect((await req(`/connections/${conn.id}/remove`, { cookie: outsider.cookie, method: "POST" })).status).toBe(404);
    const r = await req(`/connections/${conn.id}/remove`, { cookie: x.cookie, method: "POST" });
    expect(r.status).toBe(302);
    expect((await connectionBetween(ev, x, y)).removedAt).not.toBeNull();
    await choose(ev, y, { [x.id]: "again" });
    expect((await connectionBetween(ev, x, y)).removedAt).not.toBeNull();
    expect(await (await req("/connections", { cookie: x.cookie })).text()).not.toContain(conn.id);
  });

  it("allows reporting people I shared an event with, refuses others, and flags critical", async () => {
    const { x, y, ev } = await connectedPair();
    const stranger = await member();
    const mod = await member({ role: "moderator" });

    const form = await req(`/report?account=${y.id}&event=${ev}`, { cookie: x.cookie });
    expect(form.status).toBe(200);
    const html = await form.text();
    expect(html).toContain("191");
    expect(html).toContain("1669");
    expect(html).not.toContain(y.username); // nickname only

    expect((await req(`/report?account=${stranger.id}`, { cookie: x.cookie })).status).toBe(403);
    expect((await req("/report", { cookie: x.cookie, form: { account: stranger.id, reason: "harassment" } })).status).toBe(403);
    expect((await req("/report", { cookie: x.cookie, form: { account: y.id, reason: "nope" } })).status).toBe(400);
    expect((await req("/report", { cookie: x.cookie, form: { account: y.id, reason: "other", details: "a".repeat(1001) } })).status).toBe(400);

    const ok = await req("/report", { cookie: x.cookie, form: { account: y.id, event: ev, reason: "harassment" } });
    expect(ok.headers.get("location")).toBe("/connections?notice=reported");
    const crit = await req("/report", { cookie: en(x), form: { account: y.id, reason: "unsafe", unsafe: "1", details: "help" } });
    expect(crit.status).toBe(200);
    expect(await crit.text()).toContain("1669");
    const rows = await db().select().from(reports).where(eq(reports.reporter, x.id));
    expect(rows.map((r) => r.severity).sort()).toEqual(["critical", "standard"]);
    expect((await notesFor(mod)).filter((n) => n.kind === "report").length).toBe(2);

    // Events: only if registered.
    expect((await req(`/report?event=${ev}`, { cookie: x.cookie })).status).toBe(200);
    expect((await req(`/report?event=${ev}`, { cookie: stranger.cookie })).status).toBe(403);
  });

  it("block removes the connection, hides both ways and ignores duplicates", async () => {
    const { x, y, ev } = await connectedPair();
    expect((await req(`/block/${x.id}`, { cookie: x.cookie, method: "POST" })).status).toBe(400);
    const r = await req(`/block/${y.id}`, { cookie: x.cookie, form: { back: "/connections" } });
    expect(r.headers.get("location")).toBe("/connections?notice=blocked");
    const evil = await req(`/block/${y.id}`, { cookie: x.cookie, form: { back: "//evil.example" } });
    expect(evil.headers.get("location")).toBe("/connections?notice=blocked");
    expect(await db().select().from(blocks).where(and(eq(blocks.blocker, x.id), eq(blocks.blocked, y.id)))).toHaveLength(1);
    expect((await connectionBetween(ev, x, y)).removedAt).not.toBeNull();
    expect(await (await req(`/events/${ev}/people`, { cookie: y.cookie })).text()).not.toContain(x.id);
  });

  it("lists notifications newest first and marks them read", async () => {
    const { x } = await connectedPair();
    const before = await notesFor(x);
    expect(before.some((n) => n.readAt === null)).toBe(true);
    const html = await (await req("/notifications", { cookie: en(x) })).text();
    expect(html).toContain("new connection");
    expect((await notesFor(x)).every((n) => n.readAt !== null)).toBe(true);
    const fresh = await member();
    expect(await (await req("/notifications", { cookie: en(fresh) })).text()).toContain("No notifications yet");
  });
});

describe.skipIf(!HAS_DB)("resident badge and Bangkok Types on people lists", () => {
  const optIn = (m: Member) => db().update(profiles).set({ showResidentBadge: true }).where(eq(profiles.accountId, m.id));

  it("People I Met: badge only when verified AND opted in; type only when visible; order stays by nickname", async () => {
    const me = await member();
    // Nicknames sort a < b < c < d; types must not change that order.
    const p = nick();
    const a = await createMember({ nickname: `${p}a`, bkkRegistered: "verified" });
    const b = await createMember({ nickname: `${p}b`, bkkRegistered: "verified" });
    const c2 = await createMember({ nickname: `${p}c` });
    const d = await createMember({ nickname: `${p}d` });
    const ev = await makeEvent({ endedHoursAgo: 1 });
    for (const x of [me, a, b, c2, d]) await attend(ev, x);
    await optIn(a);
    await optIn(c2); // opted in but not verified: no badge
    await db().insert(vibes).values([
      { accountId: d.id, vector: {}, archetype: "explore+", modifier: null, visible: true },
      { accountId: b.id, vector: {}, archetype: "culture-", visible: false },
      { accountId: me.id, vector: {}, archetype: "plan-", visible: false },
    ]);
    const html = await (await req(`/events/${ev}/people`, { cookie: en(me) })).text();
    const cards = html.split('<section class="card').slice(1);
    const card = (n: string) => cards.find((x) => x.includes(`<legend>${n}</legend>`)) ?? "";
    expect(card(`${p}a`)).toContain("Bangkok resident");
    expect(card(`${p}b`)).not.toContain("Bangkok resident");
    expect(card(`${p}c`)).not.toContain("Bangkok resident");
    expect(card(`${p}b`)).not.toContain("Heritage Lover");
    expect(card(`${p}d`)).toContain("🧭 The Explorer");
    expect(card(`${p}d`)).toContain("Complementary match"); // explorer + planner
    const order = [`${p}a`, `${p}b`, `${p}c`, `${p}d`].map((n) => html.indexOf(`<legend>${n}</legend>`));
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it("My Bangkok circle shows the badge and a visible type; no spark line without my own quiz", async () => {
    const x = await member({ bkkRegistered: "verified" });
    const y = await member();
    const ev = await makeEvent({ endedHoursAgo: 1 });
    await attend(ev, x);
    await attend(ev, y);
    await choose(ev, x, { [y.id]: "friend" });
    await choose(ev, y, { [x.id]: "friend" });
    let html = await (await req("/connections", { cookie: en(y) })).text();
    expect(html).not.toContain("Bangkok resident");
    await optIn(x);
    await db().insert(vibes).values({ accountId: x.id, vector: {}, archetype: "rhythm-", modifier: "explore+", visible: true });
    html = await (await req("/connections", { cookie: en(y) })).text();
    expect(html).toContain("Bangkok resident");
    expect(html).toContain(`🌅 ${displayName("rhythm-", "explore+").en}`);
    expect(html).not.toContain("Conversation spark");
    await db().insert(vibes).values({ accountId: y.id, vector: {}, archetype: "motion+", visible: false });
    html = await (await req("/connections", { cookie: en(y) })).text();
    expect(html).toContain("Conversation spark");
    expect(html).toContain("Complementary match"); // mover + early riser
    // x's own view of y: y's type is hidden.
    expect(await (await req("/connections", { cookie: en(x) })).text()).not.toContain("The Mover");
  });
});
