/**
 * Event page (owner card 7, 2026-10-26): no empty tinted band above the title.
 * The category emoji sits inline before the category line, decorative only.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { A11Y_CSS } from "../src/ui/a11y-css";

const HOUR = 3_600_000;

describe("event page without the band: the CSS", () => {
  it("the sheet sits in the page like any card when there is no band", () => {
    expect(A11Y_CSS).toContain("main .card.ev-sheet.ev-flat{margin-top:0;");
  });
});

describe.skipIf(!HAS_DB)("event page without the band: the markup", () => {
  it("no cover band; the emoji is inline before the category line and aria-hidden", async () => {
    const m = await createMember();
    const id = newId();
    const startsAt = new Date(Date.now() + 3 * 24 * HOUR);
    await db()
      .insert(events)
      .values({ id, title: `BAND-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Soi Social Club", district: "pathum_wan", capacity: 8, costThb: 350, tags: ["food"], status: "published", createdBy: "test" });
    const html = await (await req(`/events/${id}?lang=en`, { cookie: m.cookie })).text();
    expect(html).not.toMatch(/<div class="[^"]*ev-scene/);
    expect(html).not.toMatch(/class="event-cover/);
    expect(html).toContain('class="card ev-sheet ev-flat"');
    const line = html.match(/<p class="eyebrow">([\s\S]*?)<\/p>/)?.[1] ?? "";
    expect(line).toMatch(/^<span class="ev-emoji" aria-hidden="true">🍜<\/span> [^<]*· ฿350$/);
    // The line above the title comes right before the title.
    expect(html.indexOf('<p class="eyebrow">')).toBeLessThan(html.indexOf("<h1>"));
  });
});
