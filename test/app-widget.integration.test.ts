/**
 * The app widget's next table (owner card S4): never a title, the place only for tables that may
 * show one (never 💘 or women-only), nothing once the table has ended.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const HOUR = 3_600_000;
async function book(accountId: string, startsIn: number, tags: string[] = [], status = "published") {
  const id = newId();
  const startsAt = new Date(Date.now() + startsIn);
  await db().insert(events).values({ id, title: `SECRET-TITLE-${id.slice(0, 6)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 8, status, tags, createdBy: "test" });
  await db().insert(registrations).values({ id: newId(), eventId: id, accountId, status: "confirmed", passToken: randomToken(18) });
  return id;
}
const next = async (cookie: string) => (await (await req("/api/app/next-table?lang=en", { cookie })).json()) as { table: null | { place: string | null; pass: string; cancelled: boolean } };

describe.skipIf(!HAS_DB)("app widget: next table", () => {
  it("nothing booked: null", async () => {
    const m = await createMember();
    expect((await next(m.cookie)).table).toBeNull();
  });

  it("the soonest table, with its place but never its title", async () => {
    const m = await createMember();
    const later = await book(m.id, 48 * HOUR);
    const soon = await book(m.id, 3 * HOUR);
    const r = await req("/api/app/next-table?lang=en", { cookie: m.cookie });
    const text = await r.text();
    expect(text).not.toContain("SECRET-TITLE");
    const { table } = JSON.parse(text);
    expect(table.pass).toBe(`/me/events/${soon}/pass`);
    expect(table.place).toContain("Lumphini Park");
    expect(later).not.toBe(soon);
  });

  it("💘 and women-only tables stay plain: no place", async () => {
    for (const tag of ["open_to_more", "women_only"]) {
      const m = await createMember();
      await book(m.id, 2 * HOUR, [tag]);
      expect((await next(m.cookie)).table?.place).toBeNull();
    }
  });

  it("an ended table drops off; a cancelled one is marked", async () => {
    const m = await createMember();
    await book(m.id, -5 * HOUR);
    expect((await next(m.cookie)).table).toBeNull();
    await book(m.id, 4 * HOUR, [], "cancelled");
    expect((await next(m.cookie)).table?.cancelled).toBe(true);
  });

  it("signed out: no data", async () => {
    const r = await req("/api/app/next-table");
    expect(r.status).not.toBe(200);
  });
});
