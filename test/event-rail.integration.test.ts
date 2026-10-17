/**
 * Laptop event page (owner card, 2026-10-17): from 1024px, details on the
 * left and a sticky rail on the right with the next action, My registration
 * and the day-of controls. Phones keep one column in the same order.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { A11Y_CSS } from "../src/ui/a11y-css";

const HOUR = 3_600_000;
const laptop = (() => {
  const i = A11Y_CSS.indexOf("/* Laptop event page");
  return i < 0 ? "" : A11Y_CSS.slice(i);
})();

async function mkEvent(startsAt: Date) {
  const id = newId();
  await db()
    .insert(events)
    .values({ id, title: `RAIL-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
  return id;
}

describe("laptop event page: the grid", () => {
  it("two columns with a sticky rail from 1024px only, and the page widens for it", () => {
    expect(laptop).toMatch(/@media \(min-width:1024px\)\{[^@]*\.ev-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) 340px;gap:48px;align-items:start\}/);
    expect(laptop).toMatch(/\.ev-rail\{position:sticky;top:/);
    expect(laptop).toContain("main.wrap:has(.ev-layout){max-width:1180px}");
    // One copy of the strip and the day-of controls per screen size; the floating RSVP bar steps aside on laptops.
    expect(laptop).toMatch(/\.ev-lap\{display:none\}/);
    expect(laptop).toMatch(/\.ev-phone\{display:none\}/);
    expect(laptop).toMatch(/#sticky-rsvp\{display:none\}/);
    // A status with no action (waitlist) is already in the card below: no second copy in the rail.
    expect(laptop).toContain(".ev-rail .ev-strip:not(:has(.btn)){display:none}");
  });
});

describe.skipIf(!HAS_DB)("laptop event page: the markup", () => {
  it("details in the main column; the rail holds the strip's action and My registration, after the details", async () => {
    const m = await createMember();
    const ev = await mkEvent(new Date(Date.now() + 2 * 24 * HOUR));
    await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18) });
    const html = await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text();
    const main = html.indexOf('<div class="ev-main">');
    const rail = html.indexOf('<div class="ev-rail">');
    expect(main).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(main);
    expect(html.indexOf("<h2>Details</h2>")).toBeGreaterThan(main);
    expect(html.indexOf("<h2>Details</h2>")).toBeLessThan(rail);
    const railHtml = html.slice(rail);
    expect(railHtml).toMatch(/class="ev-strip is-ok ev-lap"[\s\S]*My pass/);
    expect(railHtml).toContain("<h2>My registration</h2>");
    expect(railHtml).toContain("Cancel my spot");
    // The phone strip stays under the title.
    expect(html.indexOf('class="ev-strip is-ok ev-phone"')).toBeLessThan(rail);
  });

  it("on the day, the running-late buttons sit in the rail for laptops and at the top for phones", async () => {
    const m = await createMember();
    const ev = await mkEvent(new Date(Date.now() + 2 * HOUR));
    await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18) });
    const html = await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text();
    const rail = html.indexOf('<div class="ev-rail">');
    const phone = html.indexOf('<div class="ev-phone"><form method="post" action="/events/');
    const lap = html.indexOf('<div class="ev-lap"><form method="post" action="/events/');
    expect(phone).toBeGreaterThan(-1);
    expect(phone).toBeLessThan(html.indexOf("<h1>"));
    expect(lap).toBeGreaterThan(rail);
  });
});
