/** /new: the front door for people new to Bangkok (design/reference/customer-profile.md). */
import { describe, expect, it } from "vitest";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { eq } from "drizzle-orm";
import { connections, events, profiles, registrations } from "../src/schema";
import { firstTable } from "../src/routes/newcomers";
import { getDb } from "../src/db";
import { weeklyReconnected } from "../src/routes/admin/dashboard";

const ENV = { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev" } as never;

const table = async (title: string, tags: string[], extra: Partial<typeof events.$inferInsert> = {}) => {
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  await db().insert(events).values({ id: newId(), title, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Somewhere", district: "bang_rak", capacity: 10, status: "published", createdBy: "t", tags, ...extra });
};

describe.skipIf(!HAS_DB)("/new", () => {
  it("is public, shows newcomer tables only, never dating or private ones, and remembers the newcomer", async () => {
    const tag = newId().slice(0, 6);
    await table(`Newcomer walk ${tag}`, ["newcomers"]);
    await table(`Language table ${tag}`, ["language_exchange"]);
    await table(`Singles social ${tag}`, ["newcomers", "open_to_more"]);
    await table(`Private walk ${tag}`, ["newcomers"], { visibility: "private" });
    await table(`Pottery ${tag}`, ["art"]);
    const res = await req("/new?lang=en");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("jg_new=1");
    const html = await res.text();
    expect(html).toContain("New in Bangkok?");
    // Only the next six newcomer tables are listed, so check exclusions, not inclusions.
    for (const hidden of [`Singles social ${tag}`, `Private walk ${tag}`, `Pottery ${tag}`]) expect(html).not.toContain(hidden);
    expect(html).toContain('href="/signup"');
  });

  it("sends members to the event itself", async () => {
    const m = await createMember();
    const html = await (await req("/new", { cookie: m.cookie })).text();
    expect(html).toContain('href="/events"');
  });
});

describe.skipIf(!HAS_DB)("the Rebuilder's journey", () => {
  it("pre-ticks 'new in town' in onboarding after /new", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null, newcomer: false }).where(eq(profiles.accountId, m.id));
    const html = await (await req("/onboarding/basics", { cookie: `${m.cookie}; jg_new=1` })).text();
    expect(html).toMatch(/name="newcomer"[^>]*checked/);
    const plain = await (await req("/onboarding/basics", { cookie: m.cookie })).text();
    expect(plain).not.toMatch(/name="newcomer"[^>]*checked/);
  });

  it("suggests a first table until the member has booked one, never a dating table", async () => {
    const m = await createMember({ district: "bang_rak" });
    const p = (await db().select().from(profiles).where(eq(profiles.accountId, m.id)))[0];
    const tag = newId().slice(0, 6);
    await table(`Singles ${tag}`, ["open_to_more"], { startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000) });
    const pick = await firstTable(ENV, p);
    expect(pick).not.toBeNull();
    expect(pick!.title).not.toContain(`Singles ${tag}`);
    await db().insert(registrations).values({ id: newId(), eventId: pick!.id, accountId: m.id, status: "confirmed", passToken: randomToken(16) });
    expect(await firstTable(ENV, p)).toBeNull();
  });

  it("counts Weekly Reconnected Members: met before, sat together again this week", async () => {
    const [a, b, c] = await Promise.all([createMember(), createMember(), createMember()]);
    await db().insert(connections).values({ id: newId(), aAccount: a.id, bAccount: b.id, level: "friend", eventId: newId(), createdAt: new Date(Date.now() - 20 * 86_400_000) });
    const id = newId();
    const startsAt = new Date(Date.now() - 2 * 86_400_000);
    await db().insert(events).values({ id, title: "Meet again", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" });
    for (const x of [a, b, c]) await db().insert(registrations).values({ id: newId(), eventId: id, accountId: x.id, status: "confirmed", passToken: randomToken(16), checkedInAt: startsAt });
    // a and b were connected before and sat together again; c knew nobody.
    expect(await weeklyReconnected(getDb(ENV), new Date(Date.now() - 7 * 86_400_000), [a.id, b.id, c.id])).toBe(2);
  });
});

describe("segments (domain/segment.ts)", () => {
  it("comes from the member's own Bangkok story and new-in-town flag", async () => {
    const { segmentOf } = await import("../src/domain/segment");
    expect(segmentOf({ newcomer: false, bio: { story: "expat" } })).toBe("international");
    expect(segmentOf({ newcomer: true, bio: { story: "nomad" } })).toBe("international");
    expect(segmentOf({ newcomer: false, bio: { story: "province" } })).toBe("newcomer");
    expect(segmentOf({ newcomer: true, bio: {} })).toBe("newcomer");
    expect(segmentOf({ newcomer: false, bio: { story: "local" } })).toBe("local");
    expect(segmentOf({ newcomer: false, bio: null })).toBe("local");
  });
});

describe.skipIf(!HAS_DB)("a page for each person", () => {
  it("opens /international in English and lists English-friendly tables", async () => {
    expect((await req("/international")).headers.get("location")).toBe("/lang/en?back=%2Finternational");
    const tag = newId().slice(0, 6);
    await table(`Thai English table ${tag}`, ["language_exchange"]);
    const res = await req("/international?lang=en");
    expect(res.headers.get("set-cookie")).toContain("jg_intl=1");
    const html = await res.text();
    expect(html).toContain("Make Thai friends");
  });

  it("shows Discover's For you card by segment", async () => {
    const [intl, local] = await Promise.all([createMember(), createMember()]);
    await db().update(profiles).set({ bio: { story: "expat" } }).where(eq(profiles.accountId, intl.id));
    await db().update(profiles).set({ bio: { story: "local" }, newcomer: false }).where(eq(profiles.accountId, local.id));
    const a = await (await req("/events?view=list&lang=en", { cookie: intl.cookie })).text();
    const b = await (await req("/events?view=list&lang=en", { cookie: local.cookie })).text();
    expect(a).toContain("Welcome to Bangkok");
    expect(b).toContain("Your Bangkok, new faces");
    expect(b).not.toContain("Welcome to Bangkok");
  });

  it("only women and non-binary members see the women-only option and events", async () => {
    const [w, m] = await Promise.all([createMember(), createMember()]);
    await db().update(profiles).set({ gender: "woman" }).where(eq(profiles.accountId, w.id));
    await db().update(profiles).set({ gender: "man" }).where(eq(profiles.accountId, m.id));
    const tag = newId().slice(0, 6);
    const id = newId();
    const startsAt = new Date(Date.now() + 4 * 86_400_000);
    await db().insert(events).values({ id, title: `Women's walk ${tag}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Park", district: "bang_rak", capacity: 10, status: "published", createdBy: "t", tags: ["women_only"] });
    expect(await (await req("/events?view=list", { cookie: m.cookie })).text()).not.toContain(`Women's walk ${tag}`);
    expect((await req(`/events/${id}`, { cookie: m.cookie })).status).toBe(404);
    expect(await (await req("/events?view=list", { cookie: w.cookie })).text()).toContain(`Women&#39;s walk ${tag}`);
    const forMan = await (await req("/settings/connections", { cookie: m.cookie })).text();
    const forWoman = await (await req("/settings/connections", { cookie: w.cookie })).text();
    expect(forMan).toMatch(/<div data-women-only[^>]*hidden/);
    expect(forWoman).not.toMatch(/<div data-women-only[^>]*hidden/);
  });
});
