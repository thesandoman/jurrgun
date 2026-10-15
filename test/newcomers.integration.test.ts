/** /new: the front door for people new to Bangkok (design/reference/customer-profile.md). */
import { describe, expect, it } from "vitest";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { events } from "../src/schema";

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
