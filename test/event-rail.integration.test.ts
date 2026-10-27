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

async function mkEvent(startsAt: Date, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  await db()
    .insert(events)
    .values({ id, title: `RAIL-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", ...over });
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
    expect(railHtml).toContain('<h2 id="reg-h" tabindex="-1">My registration</h2>');
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

describe("laptop event page, one RSVP (owner card 2): the CSS", () => {
  it("the rail's jump strip shows on laptops, its link is a 44px target, and the card's heading shows focus", () => {
    const i = A11Y_CSS.indexOf("/* Laptop event page, one RSVP");
    expect(i).toBeGreaterThan(-1);
    const css = A11Y_CSS.slice(i);
    expect(css).toMatch(/@media \(min-width:1024px\)\{[^@]*\.ev-rail \.ev-strip\.ev-jump\{display:flex\}/);
    expect(css).toMatch(/\.ev-jump \.ev-jump-link\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.ev-reg>h2\[tabindex\]:focus-visible\{outline:3px solid/);
  });
});

describe("small laptops: the header fits (1.4.10)", () => {
  it("from 1024 to 1159px the wordmark folds to the logo, so the header row never scrolls sideways", () => {
    expect(A11Y_CSS).toContain("@media (min-width:1024px) and (max-width:1159.98px){.topbar:has(.top-nav) .brand{font-size:0;gap:0}.topbar:has(.top-nav) .brand small{display:none}");
  });
});

describe.skipIf(!HAS_DB)("laptop event page, one RSVP (owner card 2): the markup", () => {
  // The rail, up to the phone and tablet bar (hidden on laptops).
  const railOf = (html: string) => html.slice(html.indexOf('<div class="ev-rail">'), html.indexOf('id="sticky-rsvp"'));
  const lapStrip = (html: string) => railOf(html).match(/<div class="ev-strip[^"]*ev-lap[^"]*">[\s\S]*?<\/div>/)?.[0] ?? "";

  for (const [what, over] of [
    ["+1", { plusOneAllowed: true }],
    ["buddy", { buddyEnabled: true }],
  ] as const) {
    it(`with ${what}: the rail shows the price, the spots left and a link to My registration; the card keeps the one RSVP`, async () => {
      const m = await createMember();
      const ev = await mkEvent(new Date(Date.now() + 3 * 24 * HOUR), { costThb: 350, ...over });
      const html = await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text();
      const s = lapStrip(html);
      expect(s).toContain('class="ev-strip is-open ev-lap ev-jump"');
      expect(s).toContain("<b>฿350</b>");
      expect(s).toContain("10 spots left");
      // A plain #anchor link without JS, to the card's heading, which can take focus.
      expect(s).toMatch(/<a href="#reg-h" class="ev-jump-link">Choose your seat<span aria-hidden="true"> ↓<\/span><\/a>/);
      expect(html).toContain('<h2 id="reg-h" tabindex="-1">My registration</h2>');
      // The script moves focus to the heading, and keeps the scroll instant under reduced motion.
      expect(s).toContain('h.focus({preventScroll:true})');
      expect(s).toContain("prefers-reduced-motion: reduce");
      expect(s).toContain('behavior:still?"auto":"smooth"');
      // One RSVP in the rail: the card's own submit button, none in the strip.
      expect(s).not.toContain('class="btn');
      const rail = railOf(html);
      expect(rail.match(/class="btn primary/g)?.length).toBe(1);
      expect(rail).toMatch(/<form method="post" action="\/events\/[^"]+\/rsvp" id="rsvp">[\s\S]*class="btn primary btn-ticket"/);
      // Thai first.
      const th = lapStrip(await (await req(`/events/${ev}?lang=th`, { cookie: m.cookie })).text());
      expect(th).toContain("เลือกที่นั่ง");
      expect(th).toContain("เหลือ 10 ที่");
    });
  }

  it("full with choices: the link says Join the waitlist", async () => {
    const m = await createMember();
    const other = await createMember();
    const ev = await mkEvent(new Date(Date.now() + 3 * 24 * HOUR), { capacity: 1, plusOneAllowed: true });
    await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: other.id, status: "confirmed", passToken: randomToken(18) });
    const s = lapStrip(await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text());
    expect(s).toContain("is-full");
    expect(s).toContain('class="ev-jump-link">Join the waitlist');
  });

  it("without choices: unchanged, the strip's RSVP submits the card's form and the card's own button is hidden on laptops", async () => {
    const m = await createMember();
    const ev = await mkEvent(new Date(Date.now() + 3 * 24 * HOUR));
    const s = lapStrip(await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text());
    expect(s).not.toContain("ev-jump");
    expect(s).toContain('<button type="submit" form="rsvp" class="btn primary">RSVP</button>');
    expect(laptop).toContain(".ev-rail .ev-strip:has(button[form=rsvp])~.ev-reg #rsvp .btn-ticket");
  });
});
