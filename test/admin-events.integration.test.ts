/**
 * Staff event management (/admin/events) against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { accounts, blocks, buddyPairs, events, notifications, partnerOrgs, registrations, strikes } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { shortCode } from "../src/lib/qr";

const MIN = 60_000;
const HOUR = 60 * MIN;

async function mkEvent(createdBy: string, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 10 * MIN);
  await db()
    .insert(events)
    .values({
      id,
      title: "ทดสอบกิจกรรม",
      titleEn: "Test event",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      venueName: "Test venue",
      district: "bang_rak",
      capacity: 20,
      status: "published",
      createdBy,
      ...over,
    });
  return id;
}

async function register(eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) {
  const id = newId();
  const passToken = over.passToken ?? randomToken();
  await db()
    .insert(registrations)
    .values({ id, eventId, accountId, status: "confirmed", passToken, ...over });
  return { id, passToken };
}

const jsonCheckin = (cookie: string, eventId: string, form: Record<string, string>) =>
  req(`/admin/events/${eventId}/checkin`, { cookie, form, method: "POST" }).then(async (r) => r);

/** `req` doesn't set accept; build the JSON variant by hand. */
async function checkinJson(cookie: string, eventId: string, form: Record<string, string>) {
  const { default: app } = await import("../src/index");
  const { ENV } = await import("./helpers");
  const res = await app.request(
    `/admin/events/${eventId}/checkin`,
    {
      method: "POST",
      headers: { cookie, accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    },
    ENV,
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; already?: boolean; groupNo?: number | null; checkedIn: number } };
}

async function kinds(accountId: string, kind: string) {
  return db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.accountId, accountId), eq(notifications.kind, kind)))
    .limit(50);
}

describe.skipIf(!HAS_DB)("admin events", () => {
  let admin: Member;
  let host: Member;
  let otherHost: Member;

  const setup = async () => {
    admin ??= await createMember({ role: "bma_admin", nickname: "Admin A" });
    host ??= await createMember({ role: "host", nickname: "Host H" });
    otherHost ??= await createMember({ role: "host", nickname: "Host O" });
  };

  it("gates roles: moderator, insight viewer and member are refused; host can't create", async () => {
    await setup();
    const mod = await createMember({ role: "moderator" });
    const insight = await createMember({ role: "insight_viewer" });
    const member = await createMember();
    expect((await req("/admin/events", { cookie: mod.cookie })).status).toBe(403);
    expect((await req("/admin/events", { cookie: insight.cookie })).status).toBe(403);
    expect((await req("/admin/events", { cookie: member.cookie })).status).toBe(403);
    expect((await req("/admin/events")).status).toBe(302); // signed out → login

    expect((await req("/admin/events", { cookie: host.cookie })).status).toBe(200);
    expect((await req("/admin/events/new", { cookie: host.cookie })).status).toBe(403);
    const post = await req("/admin/events/new", { cookie: host.cookie, form: { title: "Nope" } });
    expect(post.status).toBe(403);
  });

  it("scopes hosts to their own events (404 for others) and blocks hosts from editing", async () => {
    await setup();
    const mine = await mkEvent(admin.id, { hostAccountId: host.id, title: "งานของโฮสต์ H" });
    const theirs = await mkEvent(admin.id, { hostAccountId: otherHost.id, title: "งานของโฮสต์ O" });
    expect((await req(`/admin/events/${mine}`, { cookie: host.cookie })).status).toBe(200);
    expect((await req(`/admin/events/${theirs}`, { cookie: host.cookie })).status).toBe(404);
    expect((await req(`/admin/events/${theirs}/checkin`, { cookie: host.cookie })).status).toBe(404);
    expect((await req(`/admin/events/${theirs}/noshows`, { cookie: host.cookie, method: "POST" })).status).toBe(404);
    expect((await req(`/admin/events/${mine}/edit`, { cookie: host.cookie })).status).toBe(403);
    expect((await req(`/admin/events/${mine}/cancel`, { cookie: host.cookie, method: "POST" })).status).toBe(403);
    const list = await (await req("/admin/events", { cookie: host.cookie })).text();
    expect(list).toContain("งานของโฮสต์ H");
    expect(list).not.toContain("งานของโฮสต์ O");
  });

  it("scopes partner admins to their org and forces their org on create", async () => {
    await setup();
    const orgA = newId();
    const orgB = newId();
    await db().insert(partnerOrgs).values([
      { id: orgA, name: "Org A" },
      { id: orgB, name: "Org B" },
    ]);
    const partner = await createMember({ role: "partner_admin" });
    await db().update(accounts).set({ partnerOrgId: orgA }).where(eq(accounts.id, partner.id));
    const own = await mkEvent(admin.id, { partnerOrgId: orgA });
    const other = await mkEvent(admin.id, { partnerOrgId: orgB });
    expect((await req(`/admin/events/${own}`, { cookie: partner.cookie })).status).toBe(200);
    expect((await req(`/admin/events/${own}/edit`, { cookie: partner.cookie })).status).toBe(200);
    expect((await req(`/admin/events/${other}`, { cookie: partner.cookie })).status).toBe(404);

    const title = `Partner ${randomToken(4)}`;
    const r = await req("/admin/events/new", {
      cookie: partner.cookie,
      form: {
        title,
        startsAt: "2030-03-01T10:00",
        endsAt: "2030-03-01T12:00",
        venueName: "Hall",
        district: "pathum_wan",
        capacity: "10",
        ageMin: "18",
        ageMax: "99",
        languages: "th",
        intensity: "social",
        groupMin: "4",
        groupMax: "6",
        status: "draft",
        partnerOrgId: orgB,
      },
    });
    expect(r.status).toBe(302);
    const [created] = await db().select().from(events).where(eq(events.title, title)).limit(1);
    expect(created.partnerOrgId).toBe(orgA);
  });

  const validForm = (over: Record<string, string | string[]> = {}) => ({
    title: `Walk ${randomToken(4)}`,
    titleEn: "Evening walk",
    startsAt: "2030-01-15T19:30",
    endsAt: "2030-01-15T21:00",
    venueName: "Lumphini Park",
    district: "pathum_wan",
    capacity: "12",
    ageMin: "18",
    ageMax: "60",
    languages: ["th", "en"],
    costThb: "0",
    intensity: "chill",
    groupMin: "4",
    groupMax: "6",
    tags: ["walk", "daytime"],
    residentQuota: "0",
    status: "published",
    mapUrl: "https://maps.example.com/x",
    ...over,
  });

  it("validates create and stores Bangkok wall-clock time as UTC+7", async () => {
    await setup();
    const bad: Record<string, string>[] = [
      { endsAt: "2030-01-15T18:00" },
      { capacity: "0" },
      { capacity: "501" },
      { startsAt: "not-a-date" },
      { groupMin: "7", groupMax: "6" },
      { mapUrl: "javascript:alert(1)" },
      { residentQuota: "13" },
      { startsAt: "2020-01-01T10:00", endsAt: "2020-01-01T11:00" },
    ];
    for (const b of bad) {
      const r = await req("/admin/events/new", { cookie: admin.cookie, form: validForm(b) });
      expect(r.status, JSON.stringify(b)).toBe(400);
    }
    const form = validForm();
    const r = await req("/admin/events/new", { cookie: admin.cookie, form });
    expect(r.status).toBe(302);
    const [e] = await db().select().from(events).where(eq(events.title, form.title as string)).limit(1);
    expect(e.startsAt.toISOString()).toBe("2030-01-15T12:30:00.000Z");
    expect(e.endsAt.toISOString()).toBe("2030-01-15T14:00:00.000Z");
    expect(e.tags).toEqual(["walk", "daytime"]);
    expect(r.headers.get("location")).toBe(`/admin/events/${e.id}?notice=saved`);
    const edit = await (await req(`/admin/events/${e.id}/edit`, { cookie: admin.cookie })).text();
    expect(edit).toContain('value="2030-01-15T19:30"');
  });

  it("notifies registrants when a published event moves, and offers new seats on capacity increase", async () => {
    await setup();
    const id = await mkEvent(admin.id, { startsAt: new Date(Date.now() + 48 * HOUR), capacity: 1 });
    const a = await createMember();
    const w = await createMember();
    await register(id, a.id);
    await register(id, w.id, { status: "waitlisted" });
    const [e] = await db().select().from(events).where(eq(events.id, id)).limit(1);
    const toInput = (d: Date) => new Date(d.getTime() + 7 * HOUR).toISOString().slice(0, 16);
    const r = await req(`/admin/events/${id}/edit`, {
      cookie: admin.cookie,
      form: validForm({
        title: e.title,
        startsAt: toInput(new Date(e.startsAt.getTime() + HOUR)),
        endsAt: toInput(new Date(e.endsAt.getTime() + HOUR)),
        venueName: e.venueName,
        district: e.district,
        capacity: "2",
      }),
    });
    expect(r.status).toBe(302);
    expect((await kinds(a.id, "event_changed")).length).toBe(1);
    expect((await kinds(w.id, "event_changed")).length).toBe(1);
    const [wr] = await db().select().from(registrations).where(and(eq(registrations.eventId, id), eq(registrations.accountId, w.id))).limit(1);
    expect(wr.status).toBe("offered");
  });

  it("pre-fills the form from a VisitBangkok route", async () => {
    await setup();
    const html = await (await req("/admin/events/new?route=yaowarat", { cookie: admin.cookie, method: "GET" })).text();
    expect(html).toContain('name="visitBangkokRoute" value="yaowarat"');
    expect(html).toContain('value="Yaowarat Road"');
    expect(html).toMatch(/<option value="samphanthawong" selected/);
    expect(html).toMatch(/value="city_quest" checked/);
  });

  it("checks in by token and by code, idempotently, only for this event and inside the window", async () => {
    await setup();
    const id = await mkEvent(admin.id, { hostAccountId: host.id });
    const otherEvent = await mkEvent(admin.id, { hostAccountId: host.id });
    const a = await createMember();
    const b = await createMember();
    const ra = await register(id, a.id);
    const rb = await register(id, b.id);
    const elsewhere = await register(otherEvent, (await createMember()).id);

    let r = await checkinJson(host.cookie, id, { token: `bkksocial:pass:${ra.passToken}` });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.checkedIn).toBe(1);
    const [row] = await db().select().from(registrations).where(eq(registrations.id, ra.id)).limit(1);
    expect(row.checkedInAt).not.toBeNull();
    expect(row.checkInMethod).toBe("scan");
    expect(row.checkedInBy).toBe(host.id);

    r = await checkinJson(host.cookie, id, { token: ra.passToken });
    expect(r.status).toBe(200);
    expect(r.body.already).toBe(true);
    expect(r.body.checkedIn).toBe(1);

    r = await checkinJson(host.cookie, id, { token: elsewhere.passToken });
    expect(r.status).toBe(404);

    const form = await req(`/admin/events/${id}/checkin`, { cookie: host.cookie, form: { code: shortCode(rb.passToken).toLowerCase() } });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe(`/admin/events/${id}/checkin?notice=checked_in`);
    const [rowB] = await db().select().from(registrations).where(eq(registrations.id, rb.id)).limit(1);
    expect(rowB.checkInMethod).toBe("manual");

    expect((await jsonCheckin(host.cookie, id, { code: "ZZZZZZ" })).status).toBe(404);

    // Outside the window: refused unless overridden.
    const later = await mkEvent(admin.id, { hostAccountId: host.id, startsAt: new Date(Date.now() + 3 * HOUR) });
    const rc = await register(later, a.id);
    expect((await checkinJson(host.cookie, later, { token: rc.passToken })).status).toBe(403);
    expect((await checkinJson(host.cookie, later, { token: rc.passToken, override: "1" })).status).toBe(200);

    // Waitlisted people can't be checked in.
    const rw = await register(id, (await createMember()).id, { status: "waitlisted" });
    expect((await checkinJson(host.cookie, id, { token: rw.passToken })).status).toBe(409);

    const station = await (await req(`/admin/events/${id}/checkin`, { cookie: host.cookie })).text();
    expect(station).toContain('<span id="checked-count">2</span>');
    expect(station).toContain("BarcodeDetector");
  });

  it("suggests groups from checked-in attendees, keeps +1s together, separates blocked pairs, and seats late arrivals", async () => {
    await setup();
    const id = await mkEvent(admin.id, { hostAccountId: host.id, groupMin: 2, groupMax: 3 });
    const people = await Promise.all(Array.from({ length: 6 }, () => createMember({ languages: ["th"] })));
    const notCheckedIn = await createMember({ languages: ["th"] });
    const [p0, p1, p2, p3] = people;
    const now = new Date();
    for (const p of people) {
      await register(id, p.id, {
        checkedInAt: now,
        checkInMethod: "scan",
        plusOneWith: p.id === p0.id ? p1.id : p.id === p1.id ? p0.id : null,
      });
    }
    await register(id, notCheckedIn.id);
    await db().insert(blocks).values({ id: newId(), blocker: p2.id, blocked: p3.id });

    const r = await req(`/admin/events/${id}/groups/suggest`, { cookie: host.cookie, method: "POST" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("notice=groups_suggested");
    const rows = await db().select().from(registrations).where(eq(registrations.eventId, id)).limit(50);
    const g = new Map(rows.map((x) => [x.accountId, x.groupNo]));
    for (const p of people) expect(g.get(p.id)).toBeGreaterThanOrEqual(1);
    expect(g.get(notCheckedIn.id)).toBeNull();
    expect(g.get(p0.id)).toBe(g.get(p1.id));
    expect(g.get(p2.id)).not.toBe(g.get(p3.id));

    // Move one person (host override) — audited, and checked.
    const target = rows.find((x) => x.accountId === people[5].id)!;
    expect((await req(`/admin/events/${id}/groups/move`, { cookie: host.cookie, form: { registrationId: target.id, groupNo: "abc" } })).status).toBe(400);

    const pub = await req(`/admin/events/${id}/groups/publish`, { cookie: host.cookie, method: "POST" });
    expect(pub.headers.get("location")).toContain("notice=groups_published");
    for (const p of people) expect((await kinds(p.id, "group")).length).toBe(1);
    expect((await kinds(notCheckedIn.id, "group")).length).toBe(0);

    // Late arrival → smallest group, ties → lowest number.
    const after = await db().select().from(registrations).where(eq(registrations.eventId, id)).limit(50);
    const sizes = new Map<number, number>();
    for (const x of after) if (x.groupNo) sizes.set(x.groupNo, (sizes.get(x.groupNo) ?? 0) + 1);
    const expected = [...sizes.entries()].sort((x, y) => x[1] - y[1] || x[0] - y[0])[0][0];
    const late = after.find((x) => x.accountId === notCheckedIn.id)!;
    const res = await checkinJson(host.cookie, id, { token: late.passToken });
    expect(res.status).toBe(200);
    expect(res.body.groupNo).toBe(expected);
    const [lateRow] = await db().select().from(registrations).where(eq(registrations.id, late.id)).limit(1);
    expect(lateRow.groupNo).toBe(expected);
  });

  it("records no-shows once, only after the end, and lets the host waive a strike", async () => {
    await setup();
    const future = await mkEvent(admin.id, { hostAccountId: host.id });
    expect((await req(`/admin/events/${future}/noshows`, { cookie: host.cookie, method: "POST" })).status).toBe(409);

    const past = await mkEvent(admin.id, { hostAccountId: host.id, startsAt: new Date(Date.now() - 4 * HOUR) });
    const came = await createMember();
    const missed = await createMember();
    await register(past, came.id, { checkedInAt: new Date(Date.now() - 4 * HOUR) });
    await register(past, missed.id);

    for (let i = 0; i < 2; i++) {
      const r = await req(`/admin/events/${past}/noshows`, { cookie: host.cookie, method: "POST" });
      expect(r.headers.get("location")).toContain("notice=strikes_recorded");
    }
    const rows = await db().select().from(strikes).where(eq(strikes.eventId, past)).limit(10);
    expect(rows.length).toBe(1);
    expect(rows[0].accountId).toBe(missed.id);
    expect(rows[0].reason).toBe("no_show");
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * HOUR);
    expect((await kinds(missed.id, "strike")).length).toBe(1);
    expect((await kinds(came.id, "strike")).length).toBe(0);

    expect((await req(`/admin/events/${past}/strikes/${missed.id}/waive`, { cookie: host.cookie, form: { reason: "" } })).status).toBe(400);
    const w = await req(`/admin/events/${past}/strikes/${missed.id}/waive`, { cookie: host.cookie, form: { reason: "Was ill" } });
    expect(w.status).toBe(302);
    const [s] = await db().select().from(strikes).where(eq(strikes.eventId, past)).limit(1);
    expect(s.waivedBy).toBe(host.id);
    expect(s.waivedReason).toBe("Was ill");
    expect((await kinds(missed.id, "strike_waived")).length).toBe(1);
    expect((await req(`/admin/events/${past}/strikes/${missed.id}/waive`, { cookie: host.cookie, form: { reason: "again" } })).status).toBe(409);
  });

  it("runs a forced buddy round once", async () => {
    await setup();
    const id = await mkEvent(admin.id, { hostAccountId: host.id, buddyEnabled: true, startsAt: new Date(Date.now() + 5 * 24 * HOUR) });
    const ps = await Promise.all(Array.from({ length: 4 }, () => createMember({ languages: ["th", "en"] })));
    for (const p of ps) await register(id, p.id, { wantsBuddy: true });
    const r = await req(`/admin/events/${id}/buddies`, { cookie: host.cookie, method: "POST" });
    expect(r.headers.get("location")).toContain("notice=buddy_round");
    const pairs = await db().select().from(buddyPairs).where(eq(buddyPairs.eventId, id)).limit(10);
    expect(pairs.length).toBeGreaterThan(0);
    expect((await req(`/admin/events/${id}/buddies`, { cookie: host.cookie, method: "POST" })).status).toBe(409);
    const html = await (await req(`/admin/events/${id}`, { cookie: host.cookie })).text();
    expect(html).toContain("Event Buddy");
  });

  it("cancels an event and notifies every registrant", async () => {
    await setup();
    const id = await mkEvent(admin.id, { hostAccountId: host.id, startsAt: new Date(Date.now() + 48 * HOUR) });
    const a = await createMember();
    const w = await createMember();
    const gone = await createMember();
    await register(id, a.id);
    await register(id, w.id, { status: "waitlisted" });
    await register(id, gone.id, { status: "cancelled" });
    const r = await req(`/admin/events/${id}/cancel`, { cookie: admin.cookie, method: "POST" });
    expect(r.status).toBe(302);
    const [e] = await db().select().from(events).where(eq(events.id, id)).limit(1);
    expect(e.status).toBe("cancelled");
    expect((await kinds(a.id, "event_cancelled")).length).toBe(1);
    expect((await kinds(w.id, "event_cancelled")).length).toBe(1);
    expect((await kinds(gone.id, "event_cancelled")).length).toBe(0);
    expect((await req(`/admin/events/${id}/cancel`, { cookie: admin.cookie, method: "POST" })).status).toBe(409);
  });

  it("sends notices, sets prompts and links +1 pairs", async () => {
    await setup();
    const id = await mkEvent(admin.id, { hostAccountId: host.id, plusOneAllowed: true });
    const a = await createMember();
    const b = await createMember();
    const ra = await register(id, a.id);
    const rb = await register(id, b.id);
    expect((await req(`/admin/events/${id}/notice`, { cookie: host.cookie, form: { th: "สวัสดี", en: "" } })).status).toBe(400);
    const n = await req(`/admin/events/${id}/notice`, { cookie: host.cookie, form: { th: "จุดนัดย้ายไปประตู 2", en: "Meet at gate 2" } });
    expect(n.headers.get("location")).toContain("notice=notice_sent");
    expect((await kinds(a.id, "event_notice")).length).toBe(1);

    await req(`/admin/events/${id}/prompt`, { cookie: host.cookie, form: { preset: "river" } });
    let [e] = await db().select().from(events).where(eq(events.id, id)).limit(1);
    expect(e.activePrompt).toContain("Find someone who lives across the river from you");
    await req(`/admin/events/${id}/prompt`, { cookie: host.cookie, form: { clear: "1" } });
    [e] = await db().select().from(events).where(eq(events.id, id)).limit(1);
    expect(e.activePrompt).toBeNull();
    expect((await req(`/admin/events/${id}/prompt`, { cookie: host.cookie, form: { custom: "x".repeat(201) } })).status).toBe(400);

    await req(`/admin/events/${id}/plusone`, { cookie: host.cookie, form: { a: ra.id, b: rb.id } });
    const rows = await db().select().from(registrations).where(inArray(registrations.id, [ra.id, rb.id])).limit(2);
    const by = new Map(rows.map((x) => [x.accountId, x.plusOneWith]));
    expect(by.get(a.id)).toBe(b.id);
    expect(by.get(b.id)).toBe(a.id);
  });

  it("never shows a host usernames or relationship status in the attendee table", async () => {
    await setup();
    const id = await mkEvent(admin.id, { hostAccountId: host.id });
    const m = await createMember({ nickname: "Nim Privacy", relationship: "married", ageMin: 33, ageMax: 44 });
    await register(id, m.id);
    const hostHtml = await (await req(`/admin/events/${id}?lang=en`, { cookie: host.cookie })).text();
    expect(hostHtml).toContain("Nim Privacy");
    expect(hostHtml).not.toContain(m.username);
    expect(hostHtml).not.toContain("Married");
    expect(hostHtml).not.toContain("แต่งงาน");
    expect(hostHtml).not.toMatch(/relationship|romance/i);
    const adminHtml = await (await req(`/admin/events/${id}`, { cookie: admin.cookie })).text();
    expect(adminHtml).toContain(m.username);
  });
  /** POST multipart/form-data (file uploads), which `req` doesn't do. */
  async function multipart(path: string, cookie: string, fields: Record<string, string | string[]>, file?: { name: string; type: string; bytes: number }) {
    const { default: app } = await import("../src/index");
    const { ENV } = await import("./helpers");
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
    if (file) fd.append("cover", new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    return app.request(path, { method: "POST", headers: { cookie }, body: fd }, ENV);
  }

  it("cover image: the form is multipart, bad type / size is 400, and no storage binding fails gracefully", async () => {
    await setup();
    const form = await (await req("/admin/events/new", { cookie: admin.cookie })).text();
    expect(form).toContain('enctype="multipart/form-data"');
    expect(form).toContain('name="cover"');

    const titleOf = (x: string) => db().select().from(events).where(eq(events.title, x)).limit(1);
    const f1 = validForm();
    const badType = await multipart("/admin/events/new", `${admin.cookie}; lang=en`, f1, { name: "x.gif", type: "image/gif", bytes: 10 });
    expect(badType.status).toBe(400);
    expect(await badType.text()).toContain("JPG, PNG or WebP");
    expect(await titleOf(f1.title as string)).toHaveLength(0);

    const f2 = validForm();
    const tooBig = await multipart("/admin/events/new", `${admin.cookie}; lang=en`, f2, { name: "x.jpg", type: "image/jpeg", bytes: 5 * 1024 * 1024 + 1 });
    expect(tooBig.status).toBe(400);
    expect(await tooBig.text()).toContain("5 MB or smaller");

    // Tests have no storage binding: a valid image can't be stored, and nothing is created.
    const f3 = validForm();
    const noStore = await multipart("/admin/events/new", `${admin.cookie}; lang=en`, f3, { name: "x.png", type: "image/png", bytes: 100 });
    expect(noStore.status).toBe(400);
    expect(await noStore.text()).toContain("be uploaded. Please try again");
    expect(await titleOf(f3.title as string)).toHaveLength(0);

    // Multipart without a file still creates the event (no cover).
    const f4 = validForm();
    const ok = await multipart("/admin/events/new", admin.cookie, f4);
    expect(ok.status).toBe(302);
    const [created] = await titleOf(f4.title as string);
    expect(created.coverKey).toBeNull();

    // Edit: remove an existing cover (deleting the old object is best effort).
    await db().update(events).set({ coverKey: `uploads/events/${created.id}/old` }).where(eq(events.id, created.id));
    const edit = await (await req(`/admin/events/${created.id}/edit`, { cookie: `${admin.cookie}; lang=en` })).text();
    expect(edit).toContain("Remove the cover");
    const removed = await multipart(`/admin/events/${created.id}/edit`, admin.cookie, { ...f4, removeCover: "1" });
    expect(removed.status).toBe(302);
    const [after] = await db().select().from(events).where(eq(events.id, created.id)).limit(1);
    expect(after.coverKey).toBeNull();
    const badEdit = await multipart(`/admin/events/${created.id}/edit`, admin.cookie, f4, { name: "x.txt", type: "text/plain", bytes: 5 });
    expect(badEdit.status).toBe(400);
    expect((await req(`/admin/events/${created.id}/cover`, { cookie: admin.cookie })).status).toBe(404);
  });
});
