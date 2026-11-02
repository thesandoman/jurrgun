/**
 * My events with nothing booked (production 500, 2 Nov 2026). The deployed database
 * can't type a bare parameter on the left of IN (subquery), but local Postgres can,
 * so the first test can't catch that on its own: the second pins the cast.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { eventSeenBy, pairSeenBy } from "../src/services/demo";

const DAY = 86_400_000;

describe.skipIf(!HAS_DB)("My events with nothing booked", () => {
  it("answers 200 and suggests the next public events", async () => {
    const m = await createMember();
    const id = newId();
    const title = `NEXT-${id.slice(0, 8)}`;
    // Soon, so it is among the three next events whatever else the shared test database holds.
    const startsAt = new Date(Date.now() + 120_000);
    await db()
      .insert(events)
      .values({ id, title, startsAt, endsAt: new Date(startsAt.getTime() + DAY / 12), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", visibility: "public", createdBy: "test" });
    const res = await req("/me/events?lang=en", { cookie: m.cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Nothing booked yet");
    expect(html).toContain(title);
  });
});

describe("the viewer id in demo filters", () => {
  const render = (q: ReturnType<typeof sql>) => new PgDialect().sqlToQuery(q).sql;

  it("is cast, so the deployed database knows its type", () => {
    expect(render(eventSeenBy(sql`e.id`, "viewer"))).toContain("::text in");
    expect(render(pairSeenBy(sql`a`, sql`b`, "viewer"))).toContain("::text in");
  });
});
