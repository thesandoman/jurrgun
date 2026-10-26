/**
 * Event page on phones (owner card 2, 2026-10-26): the RSVP under the title is
 * gone on phones, the RSVP inside My registration stays, and one bar above the
 * tab bar carries the price, the spots left and the next action. It shows
 * without JS; the script only hides it while typing or while My registration
 * is on screen, and the page keeps room for it (WCAG 2.4.11).
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { A11Y_CSS } from "../src/ui/a11y-css";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const css = (() => {
  const i = A11Y_CSS.indexOf("/* Event page, phones (owner card 2)");
  return i < 0 ? "" : A11Y_CSS.slice(i);
})();

async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * DAY);
  await db()
    .insert(events)
    .values({ id, title: `BAR-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, costThb: 350, status: "published", createdBy: "test", ...over });
  return id;
}
async function mkReg(eventId: string, accountId: string, status = "confirmed") {
  await db().insert(registrations).values({ id: newId(), eventId, accountId, status, passToken: randomToken(18) });
}
const bar = (html: string) => html.match(/<div class="sticky-cta rsvp-bar[^"]*" id="sticky-rsvp">[\s\S]*?<script/)?.[0] ?? "";
const page = async (ev: string, cookie: string, lang = "en") => (await req(`/events/${ev}?lang=${lang}`, { cookie })).text();

describe("RSVP bar: the CSS", () => {
  it("phones only, above the tab bar and the raised centre button, padded for the safe area", () => {
    expect(css).toMatch(/@media \(max-width:760px\)\{[^@]*\.sticky-cta\.rsvp-bar\{[^}]*bottom:calc\(112px \+ env\(safe-area-inset-bottom,0px\)\)/);
    expect(css).toContain("@media (min-width:761px){#sticky-rsvp{display:none}");
  });

  it("the strip's RSVP under the title is hidden on phones", () => {
    expect(css).toMatch(/@media \(max-width:760px\)\{[^@]*\.ev-strip\.ev-tab\{display:none\}/);
  });

  it("the page reserves room under the bar (scroll-padding), and the bar steps aside while a text field has focus", () => {
    expect(css).toMatch(/html:has\(#sticky-rsvp\)\{scroll-padding-bottom:calc\(200px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
    expect(css).toMatch(/body:has\(#sticky-rsvp\) main\.wrap\{padding-bottom:96px\}/);
    expect(css).toMatch(/body:has\(main :is\(input[^)]*\),textarea\):focus\) \.rsvp-bar\{[^}]*visibility:hidden/);
  });

  it("no slide under reduced motion, and no fixed height on the button", () => {
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.sticky-cta,.sticky-cta.rsvp-bar{transition:none}}");
    expect(css).not.toMatch(/\.rsvp-bar \.btn\{[^}]*height/);
  });
});

describe.skipIf(!HAS_DB)("RSVP bar: the markup and its states", () => {
  it("open: the price, the spots left and the shared primary RSVP button; the inline RSVP in My registration stays", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    const html = await page(ev, m.cookie);
    const b = bar(html);
    expect(b).toContain('class="sticky-cta rsvp-bar is-open"');
    expect(b).toContain("<b>฿350</b>");
    expect(b).toContain("10 spots left");
    expect(b).toContain('<button type="submit" form="rsvp" class="btn primary">RSVP</button>');
    // The inline RSVP inside the registration card is kept.
    expect(html).toMatch(/<form method="post" action="\/events\/[^"]+\/rsvp" id="rsvp">[\s\S]*class="btn primary btn-ticket"/);
    // The top RSVP is marked tablet-only, so phones see one RSVP: the bar's.
    expect(html).toContain('class="ev-strip is-open ev-phone ev-tab"');
    // The script hides it for the keyboard, focused text fields and My registration in view.
    expect(html).toContain("visualViewport");
    expect(html).toContain('addEventListener("focusin"');
    expect(html).toContain('document.querySelectorAll(".ev-reg,.ev-strip")');
    // Thai first.
    const th = bar(await page(ev, m.cookie, "th"));
    expect(th).toContain("เหลือ 10 ที่");
    expect(th).toContain("ลงทะเบียนเข้าร่วม");
  });

  it("free: says Free", async () => {
    const m = await createMember();
    const ev = await mkEvent({ costThb: 0 });
    expect(bar(await page(ev, m.cookie))).toContain("<b>Free</b>");
  });

  it("full: Full, and the waitlist action", async () => {
    const m = await createMember();
    const ev = await mkEvent({ capacity: 1 });
    await mkReg(ev, (await createMember()).id);
    const b = bar(await page(ev, m.cookie));
    expect(b).toContain("is-full");
    expect(b).toContain(">Full<");
    expect(b).toContain('class="btn primary">Join the waitlist</button>');
  });

  it("waitlisted: the place in line, no button", async () => {
    const m = await createMember();
    const ev = await mkEvent({ capacity: 1 });
    await mkReg(ev, (await createMember()).id);
    await mkReg(ev, m.id, "waitlisted");
    const b = bar(await page(ev, m.cookie));
    expect(b).toContain("On the waitlist");
    expect(b).toContain("About #1 in line");
    expect(b).not.toContain('class="btn');
  });

  it("booked: You're going and the pass, no RSVP", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    await mkReg(ev, m.id);
    const b = bar(await page(ev, m.cookie));
    expect(b).toContain("is-ok");
    expect(b).toContain("✓ You&#39;re going");
    expect(b).toContain(`href="/me/events/${ev}/pass"`);
    expect(b).not.toContain('form="rsvp"');
  });

  it("past or already started without a place, and the host: no bar", async () => {
    const m = await createMember();
    const past = await mkEvent({ startsAt: new Date(Date.now() - 5 * HOUR) });
    expect(await page(past, m.cookie)).not.toContain('id="sticky-rsvp"');
    const live = await mkEvent({ startsAt: new Date(Date.now() - HOUR) });
    expect(await page(live, m.cookie)).not.toContain('id="sticky-rsvp"');
    const mine = await mkEvent({ hostAccountId: m.id });
    expect(await page(mine, m.cookie)).not.toContain('id="sticky-rsvp"');
  });
});
