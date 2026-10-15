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
    const before = await weeklyReconnected(getDb(ENV), new Date(Date.now() - 7 * 86_400_000));
    await db().insert(connections).values({ id: newId(), aAccount: a.id, bAccount: b.id, level: "friend", eventId: newId(), createdAt: new Date(Date.now() - 20 * 86_400_000) });
    const id = newId();
    const startsAt = new Date(Date.now() - 2 * 86_400_000);
    await db().insert(events).values({ id, title: "Meet again", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" });
    for (const x of [a, b, c]) await db().insert(registrations).values({ id: newId(), eventId: id, accountId: x.id, status: "confirmed", passToken: randomToken(16), checkedInAt: startsAt });
    const after = await weeklyReconnected(getDb(ENV), new Date(Date.now() - 7 * 86_400_000));
    // a and b were connected before and sat together again; c knew nobody.
    expect(after - before).toBe(2);
  });
});
