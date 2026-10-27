/**
 * Admin-only partner types and measurement for the BMA:
 *  - a dating partner's events always carry open_to_more (create, edit, partner admins)
 *  - the north star trend (Weekly Reconnected Members per week)
 *  - City Insight's segment split and placement sources, with k = 10 suppression
 *  - first-touch placement capture on public landings and at sign-up
 */
import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { accounts, connections, events, partnerOrgs, profiles, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { OPEN_TO_MORE_TAG, partnerEventTags } from "../src/domain/rules";
import { segmentOf } from "../src/domain/segment";
import { cleanSource, sourceFromQuery } from "../src/lib/source";
import { weeklyReconnected, weeklyReconnectedTrend } from "../src/routes/admin/dashboard";
import { OTHER_SOURCES, segmentFunnel, sourceFunnel, suppressSegment } from "../src/routes/admin/insights";

const DAY = 86_400_000;

describe("partner event tags", () => {
  it("adds open_to_more only for dating partners, once", () => {
    expect(partnerEventTags(["food"], "dating")).toEqual(["food", OPEN_TO_MORE_TAG]);
    expect(partnerEventTags([OPEN_TO_MORE_TAG], "dating")).toEqual([OPEN_TO_MORE_TAG]);
    for (const k of ["events", "venue", "community", null, undefined]) expect(partnerEventTags(["food"], k)).toEqual(["food"]);
  });
});

describe("placement source values", () => {
  it("keeps a short slug and never personal-looking data", () => {
    expect(sourceFromQuery({ src: "Line OA" })).toBe("line_oa");
    expect(sourceFromQuery({ utm_source: "TikTok", utm_campaign: "Loy Krathong 2026" })).toBe("tiktok/loy_krathong_2026");
    expect(sourceFromQuery({ src: "bts", utm_source: "ignored", utm_campaign: "x" })).toBe("bts");
    expect(sourceFromQuery({ src: "0812345678" })).toBeNull();
    expect(sourceFromQuery({ src: "a@b.com" })).toBe("a_b_com");
    expect(sourceFromQuery({})).toBeNull();
    expect(sourceFromQuery({ src: "x".repeat(200) })!.length).toBeLessThanOrEqual(32);
    expect(cleanSource("line/loy_krathong")).toBe("line/loy_krathong");
    expect(cleanSource("<script>/../")).toBe("script");
    expect(cleanSource("")).toBeNull();
  });
});

const futureForm = (over: Record<string, string | string[]> = {}) => ({
  title: `Dating partner night ${randomToken(4)}`,
  startsAt: "2030-02-01T18:00",
  endsAt: "2030-02-01T20:00",
  venueName: "Rooftop",
  district: "pathum_wan",
  capacity: "20",
  ageMin: "20",
  ageMax: "40",
  languages: "th",
  intensity: "social",
  groupMin: "4",
  groupMax: "6",
  tags: ["food"],
  status: "draft",
  ...over,
});

const byTitle = async (title: string) => (await db().select().from(events).where(eq(events.title, title)).limit(1))[0];

describe.skipIf(!HAS_DB)("dating partner programme", () => {
  let admin: Member;
  let datingOrg: string;
  let eventsOrg: string;
  const setup = async () => {
    admin ??= await createMember({ role: "bma_admin" });
    if (!datingOrg) {
      datingOrg = newId();
      eventsOrg = newId();
      await db().insert(partnerOrgs).values([
        { id: datingOrg, name: `Swipe app ${randomToken(3)}`, kind: "dating" },
        { id: eventsOrg, name: `Board games ${randomToken(3)}` },
      ]);
    }
  };

  it("admins set and change a partner's type and notes", async () => {
    await setup();
    const name = `CMB ${randomToken(4)}`;
    const r = await req("/admin/partners/orgs", { cookie: admin.cookie, form: { name, kind: "dating", notes: "Pilot via BD team" } });
    expect(r.status).toBe(302);
    const [org] = await db().select().from(partnerOrgs).where(eq(partnerOrgs.name, name)).limit(1);
    expect(org.kind).toBe("dating");
    expect(org.notes).toBe("Pilot via BD team");
    expect((await req("/admin/partners/orgs", { cookie: admin.cookie, form: { name: `${name}x`, kind: "nightclub" } })).status).toBe(400);

    const html = await (await req("/admin/partners?lang=en", { cookie: admin.cookie })).text();
    expect(html).toContain("Dating or friend app");
    expect(html).toContain("Pilot via BD team");

    expect((await req(`/admin/partners/orgs/${org.id}`, { cookie: admin.cookie, form: { kind: "venue", notes: "" } })).status).toBe(302);
    const [after] = await db().select().from(partnerOrgs).where(eq(partnerOrgs.id, org.id)).limit(1);
    expect(after.kind).toBe("venue");
    expect(after.notes).toBeNull();

    // Only bma_admin manages partners.
    const viewer = await createMember({ role: "insight_viewer" });
    expect((await req(`/admin/partners/orgs/${org.id}`, { cookie: viewer.cookie, form: { kind: "dating" } })).status).not.toBe(302);
  });

  it("a dating partner's event gets open_to_more on create and keeps it on edit", async () => {
    await setup();
    const form = futureForm({ partnerOrgId: datingOrg });
    expect((await req("/admin/events/new", { cookie: admin.cookie, form })).status).toBe(302);
    const e = await byTitle(form.title as string);
    expect(e.tags).toEqual(["food", OPEN_TO_MORE_TAG]);

    // The edit form shows it as a locked tag.
    const edit = await (await req(`/admin/events/${e.id}/edit?lang=en`, { cookie: admin.cookie })).text();
    expect(edit).toContain(`data-locked-tag="${OPEN_TO_MORE_TAG}"`);
    expect(edit).toContain("Locked: this is a dating partner");

    // Removing the tag in a crafted post doesn't stick.
    expect((await req(`/admin/events/${e.id}/edit`, { cookie: admin.cookie, form: futureForm({ title: form.title as string, partnerOrgId: datingOrg, tags: ["walk"] }) })).status).toBe(302);
    expect((await byTitle(form.title as string)).tags).toEqual(["walk", OPEN_TO_MORE_TAG]);

    // Moving it to another kind of partner stops forcing it (the admin can then untick it).
    expect((await req(`/admin/events/${e.id}/edit`, { cookie: admin.cookie, form: futureForm({ title: form.title as string, partnerOrgId: eventsOrg, tags: ["walk"] }) })).status).toBe(302);
    expect((await byTitle(form.title as string)).tags).toEqual(["walk"]);

    // Other partners and no partner: no tag added.
    const plain = futureForm({ partnerOrgId: eventsOrg });
    await req("/admin/events/new", { cookie: admin.cookie, form: plain });
    expect((await byTitle(plain.title as string)).tags).toEqual(["food"]);
    const none = futureForm();
    await req("/admin/events/new", { cookie: admin.cookie, form: none });
    expect((await byTitle(none.title as string)).tags).toEqual(["food"]);
  });

  it("partner admins of a dating partner get the same tag, in the staff tools and on /host", async () => {
    await setup();
    const pa = await createMember({ role: "partner_admin" });
    await db().update(accounts).set({ partnerOrgId: datingOrg }).where(eq(accounts.id, pa.id));

    const form = futureForm({ partnerOrgId: eventsOrg });
    expect((await req("/admin/events/new", { cookie: pa.cookie, form })).status).toBe(302);
    const e = await byTitle(form.title as string);
    expect(e.partnerOrgId).toBe(datingOrg);
    expect(e.tags).toContain(OPEN_TO_MORE_TAG);
    const edit = await (await req(`/admin/events/${e.id}/edit?lang=en`, { cookie: pa.cookie })).text();
    expect(edit).toContain(`data-locked-tag="${OPEN_TO_MORE_TAG}"`);
    await req(`/admin/events/${e.id}/edit`, { cookie: pa.cookie, form: futureForm({ title: form.title as string, tags: [] }) });
    expect((await byTitle(form.title as string)).tags).toEqual([OPEN_TO_MORE_TAG]);

    // The /host flow partner admins can also use.
    const bkk = new Date(Date.now() + 5 * DAY + 7 * 3_600_000).toISOString().slice(0, 10);
    const title = `Host flow ${randomToken(4)}`;
    const r = await req("/host/new", {
      cookie: pa.cookie,
      form: {
        title,
        description: "Meet people over coffee.",
        startsAt: `${bkk}T14:00`,
        endsAt: `${bkk}T16:00`,
        venueName: "Cafe",
        district: "bang_rak",
        capacity: "8",
        ageMin: "18",
        ageMax: "99",
        languages: ["th"],
        costThb: "0",
        intensity: "social",
        groupMin: "4",
        groupMax: "6",
        visibility: "public",
        tags: ["food"],
      },
    });
    expect(r.status).toBe(302);
    const hosted = await byTitle(title);
    expect(hosted.tags).toEqual(["food", OPEN_TO_MORE_TAG]);
    // Members never see the partner type: the host form doesn't name it.
    const hostForm = await (await req(`/host/${hosted.id}/edit?lang=en`, { cookie: pa.cookie })).text();
    expect(hostForm).not.toMatch(/dating app|Dating or friend app|แอปเดต/);
  });
});

describe.skipIf(!HAS_DB)("north star trend", () => {
  it("counts reconnected members per week, newest first", async () => {
    const [a, b, c] = await Promise.all([createMember(), createMember(), createMember()]);
    const now = new Date();
    const mk = async (endedDaysAgo: number) => {
      const id = newId();
      const endsAt = new Date(now.getTime() - endedDaysAgo * DAY);
      await db().insert(events).values({ id, title: "Trend", startsAt: new Date(endsAt.getTime() - 2 * 3_600_000), endsAt, venueName: "V", district: "bang_rak", capacity: 10, status: "published", createdBy: a.id });
      return { id, at: new Date(endsAt.getTime() - 3_600_000) };
    };
    const [first, recent, older] = await Promise.all([mk(40), mk(2), mk(16)]);
    // a and b met 40 days ago; c never met anyone.
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db().insert(connections).values({ id: newId(), aAccount: lo, bAccount: hi, level: "friend", eventId: first.id, createdAt: new Date(now.getTime() - 40 * DAY) });
    const checkIn = (e: { id: string; at: Date }, m: Member) =>
      db().insert(registrations).values({ id: newId(), eventId: e.id, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: e.at });
    await Promise.all([checkIn(recent, a), checkIn(recent, b), checkIn(recent, c), checkIn(older, a), checkIn(older, b)]);

    const among = [a.id, b.id, c.id];
    const trend = await weeklyReconnectedTrend(db(), now, 8, among);
    expect(trend).toHaveLength(8);
    expect(trend.map((w) => w.n)).toEqual([2, 0, 2, 0, 0, 0, 0, 0]);
    expect(trend[0].end.getTime()).toBe(now.getTime());
    expect(trend[1].end.getTime()).toBe(trend[0].start.getTime());
    // Week 0 agrees with the headline tile.
    expect(await weeklyReconnected(db(), new Date(now.getTime() - 7 * DAY), among)).toBe(trend[0].n);
  });

  it("shows on the staff overview for admins and insight viewers, suppressed under 10 for viewers", async () => {
    const [admin, viewer, mod] = await Promise.all([createMember({ role: "bma_admin" }), createMember({ role: "insight_viewer" }), createMember({ role: "moderator" })]);
    const a = await (await req("/admin?lang=en", { cookie: admin.cookie })).text();
    expect(a).toContain('id="north-star-trend"');
    expect((a.match(/data-week-start=/g) ?? []).length).toBe(8);
    expect(a).toContain("Not suppressed, staff only.");
    const v = await (await req("/admin?lang=en", { cookie: viewer.cookie })).text();
    expect(v).toContain('id="north-star-trend"');
    expect(v).toContain("Weeks under 10 people");
    expect(await (await req("/admin?lang=en", { cookie: mod.cookie })).text()).not.toContain("north-star-trend");
  });
});

describe.skipIf(!HAS_DB)("City Insight splits", () => {
  it("segments in SQL agree with segmentOf", async () => {
    const bios: { newcomer: boolean; bio: Record<string, unknown> }[] = [
      { newcomer: false, bio: {} },
      { newcomer: true, bio: {} },
      { newcomer: false, bio: { story: "province" } },
      { newcomer: true, bio: { story: "expat" } },
      { newcomer: false, bio: { story: "nomad" } },
      { newcomer: false, bio: { story: "born_here" } },
      { newcomer: false, bio: { story: 5 } },
    ];
    const ms = await Promise.all(bios.map(() => createMember()));
    await Promise.all(ms.map((m, i) => db().update(profiles).set({ newcomer: bios[i].newcomer, bio: bios[i].bio }).where(eq(profiles.accountId, m.id))));
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const until = new Date(Date.now() + DAY).toISOString();
    const rows = await segmentFunnel(db(), since, until, ms.map((m) => m.id));
    const want = { local: 0, newcomer: 0, international: 0 };
    for (const b of bios) want[segmentOf(b)] += 1;
    expect(Object.fromEntries(rows.map((r) => [r.segment, r.members]))).toEqual(want);
  });

  it("suppresses every cell under 10 people", async () => {
    const locals = await Promise.all(Array.from({ length: 10 }, () => createMember()));
    const newcomers = await Promise.all(Array.from({ length: 3 }, () => createMember()));
    await db().update(profiles).set({ newcomer: true }).where(inArray(profiles.accountId, newcomers.map((m) => m.id)));
    // 3 locals RSVP to an event that ended yesterday; 2 check in.
    const id = newId();
    const endsAt = new Date(Date.now() - DAY);
    await db().insert(events).values({ id, title: "Seg", startsAt: new Date(endsAt.getTime() - 3_600_000), endsAt, venueName: "V", district: "bang_rak", capacity: 20, status: "published", createdBy: locals[0].id });
    await Promise.all(
      locals.slice(0, 3).map((m, i) =>
        db().insert(registrations).values({ id: newId(), eventId: id, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: i < 2 ? endsAt : null }),
      ),
    );
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const until = new Date(Date.now() + DAY).toISOString();
    const rows = await segmentFunnel(db(), since, until, [...locals, ...newcomers].map((m) => m.id));
    const cells = Object.fromEntries(rows.map((r) => [r.segment, suppressSegment(r)]));
    // 3 of 10 RSVP'd: the 3 is under k, so the rate is hidden too (card D2: percentages come from rounded counts).
    expect(cells.local).toEqual({ segment: "local", members: 10, regToRsvp: null, rsvpToCheckIn: null, mutualRate: null });
    expect(cells.newcomer).toEqual({ segment: "newcomer", members: null, regToRsvp: null, rsvpToCheckIn: null, mutualRate: null });
    expect(cells.international).toEqual({ segment: "international", members: null, regToRsvp: null, rsvpToCheckIn: null, mutualRate: null });
  });

  it("shows sources with 10+ sign-ups and folds the rest into one suppressed row", async () => {
    const tag = randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x");
    const big = await Promise.all(Array.from({ length: 10 }, () => createMember()));
    const small = await Promise.all(Array.from({ length: 3 }, () => createMember()));
    await db().update(accounts).set({ signupSource: `line_${tag}` }).where(inArray(accounts.id, big.map((m) => m.id)));
    await db().update(accounts).set({ signupSource: `tiktok_${tag}` }).where(inArray(accounts.id, small.map((m) => m.id)));
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const until = new Date(Date.now() + DAY).toISOString();
    const rows = await sourceFunnel(db(), since, until, [...big, ...small].map((m) => m.id));
    expect(rows).toEqual([
      { source: `line_${tag}`, signups: 10, firstRsvp: null, rate: null },
      { source: OTHER_SOURCES, signups: null, firstRsvp: null, rate: null },
    ]);
    expect(JSON.stringify(rows)).not.toContain(`tiktok_${tag}`);
  });

  it("City Insight shows both splits to insight viewers", async () => {
    const viewer = await createMember({ role: "insight_viewer" });
    const html = await (await req("/admin/insights?lang=en", { cookie: viewer.cookie })).text();
    expect(html).toContain('id="segments"');
    expect(html).toContain('data-segment="international"');
    expect(html).toContain('id="sources"');
  });
});

describe.skipIf(!HAS_DB)("placement capture", () => {
  const srcCookie = (r: Response) => (r.headers.get("set-cookie") ?? "").match(/jg_src=([^;]*)/)?.[1] ?? null;

  it("remembers the first source from a public landing for 30 days", async () => {
    const r = await req("/new?utm_source=LINE&utm_campaign=Loy%20Krathong");
    const v = srcCookie(r);
    expect(decodeURIComponent(v!)).toBe("line/loy_krathong");
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=2592000/);
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/);
    // First touch wins.
    expect(srcCookie(await req("/?src=tiktok", { cookie: `jg_src=${v}` }))).toBeNull();
    // Other landings, including one that redirects.
    expect(srcCookie(await req("/international?src=expat_fb"))).toBe("expat_fb");
    expect(srcCookie(await req("/signup?src=bts_poster"))).toBe("bts_poster");
    // The quiz and event links Marketing shares record it too, even when an event page sends a signed-out visitor to sign in.
    expect(srcCookie(await req("/quiz?src=line_quiz_tile"))).toBe("line_quiz_tile");
    expect(srcCookie(await req("/events/abc123?src=fb_event"))).toBe("fb_event");
    expect(srcCookie(await req("/events?src=x"))).toBeNull();
    expect(srcCookie(await req("/quiz/result?src=x"))).toBeNull();
    // Not a landing, or nothing usable.
    expect(srcCookie(await req("/privacy?src=x"))).toBeNull();
    expect(srcCookie(await req("/?src=0812345678"))).toBeNull();
  });

  it("stores the source on the account at sign-up, and only then", async () => {
    const username = `s_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const r = await req("/signup", { cookie: `jg_src=${encodeURIComponent("line/loy_krathong")}`, form: { username, password: "longenough1", confirm: "longenough1", terms: "1" } });
    expect(r.status).toBe(302);
    const [a] = await db().select({ s: accounts.signupSource }).from(accounts).where(eq(accounts.username, username)).limit(1);
    expect(a.s).toBe("line/loy_krathong");

    const plain = `p_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    await req("/signup", { form: { username: plain, password: "longenough1", confirm: "longenough1", terms: "1" } });
    const [b] = await db().select({ s: accounts.signupSource }).from(accounts).where(eq(accounts.username, plain)).limit(1);
    expect(b.s).toBeNull();
  });

  it("the privacy notice says so", async () => {
    const html = await (await req("/privacy?lang=en")).text();
    expect(html).toContain("Sign-up source: if a campaign or partner link brought you here");
  });
});
