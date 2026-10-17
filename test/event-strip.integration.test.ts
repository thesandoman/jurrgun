/**
 * Event page status strip (owner card, 2026-10-17): right under the title, my
 * status and the one next action, driving the forms in My registration.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * DAY);
  await db()
    .insert(events)
    .values({ id, title: `STRIP-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", ...over });
  return id;
}
async function mkReg(eventId: string, accountId: string, status = "confirmed", over: Partial<typeof registrations.$inferInsert> = {}) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId, status, passToken: randomToken(18), ...over });
}
const strip = (html: string) => html.match(/<div class="ev-strip[^"]*">[\s\S]*?<\/div>/)?.[0] ?? "";

describe.skipIf(!HAS_DB)("event page: the status strip", () => {
  it("not registered, seats left: one RSVP button that submits the RSVP form below, right after the title", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    const html = await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text();
    const s = strip(html);
    expect(s).toContain('class="ev-strip is-open ev-phone"');
    expect(s).toContain("10 spots left");
    expect(s).toContain('<button type="submit" form="rsvp" class="btn primary">RSVP</button>');
    expect(html).toContain('id="rsvp"');
    // Under the title, before the fact tiles.
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf('class="ev-strip'));
    expect(html.indexOf('class="ev-strip')).toBeLessThan(html.indexOf("ev-facts"));
    // The strip says it, so the tag row no longer repeats the spots.
    expect(html).not.toMatch(/class="tag[^"]*">10 spots left/);
  });

  it("with +1, buddy or free-seat choices the button goes to the form instead of posting", async () => {
    const m = await createMember();
    const ev = await mkEvent({ plusOneAllowed: true });
    const s = strip(await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text());
    expect(s).toContain('<a href="#rsvp" class="btn primary">RSVP</a>');
    expect(s).not.toContain('form="rsvp"');
  });

  it("full: Join the waitlist", async () => {
    const m = await createMember();
    const other = await createMember();
    const ev = await mkEvent({ capacity: 1 });
    await mkReg(ev, other.id);
    const s = strip(await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text());
    expect(s).toContain('class="ev-strip is-full ev-phone"');
    expect(s).toContain(">Full<");
    expect(s).toContain("Join the waitlist");
  });

  it("confirmed: You're going and My pass, Thai first", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    await mkReg(ev, m.id);
    const en = strip(await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text());
    expect(en).toContain("✓ You&#39;re going");
    expect(en).toContain(`href="/me/events/${ev}/pass"`);
    expect(en).toContain("My pass");
    const th = strip(await (await req(`/events/${ev}?lang=th`, { cookie: m.cookie })).text());
    expect(th).toContain("✓ คุณได้ที่แล้ว");
    expect(th).toContain("บัตรของฉัน");
  });

  it("offered: the accept button submits the offer form; waitlisted: the status only", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    await mkReg(ev, m.id, "offered", { offeredUntil: new Date(Date.now() + 6 * HOUR) });
    const html = await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text();
    expect(strip(html)).toContain('<button type="submit" form="offer" name="action" value="accept" class="btn primary">Accept the spot</button>');
    expect(html).toContain('id="offer"');

    const w = await createMember();
    const ev2 = await mkEvent({ capacity: 1 });
    await mkReg(ev2, (await createMember()).id);
    await mkReg(ev2, w.id, "waitlisted");
    const s = strip(await (await req(`/events/${ev2}?lang=en`, { cookie: w.cookie })).text());
    expect(s).toContain("On the waitlist");
    expect(s).toContain("About #1 in line");
    expect(s).not.toContain("<button");
    expect(s).not.toContain('class="btn');
  });

  it("started: the pass while it runs; ended or not registered once started: no strip", async () => {
    const m = await createMember();
    const live = await mkEvent({ startsAt: new Date(Date.now() - HOUR) });
    await mkReg(live, m.id);
    const s = strip(await (await req(`/events/${live}?lang=en`, { cookie: m.cookie })).text());
    expect(s).toContain("Happening now");
    expect(s).toContain("My pass");
    const other = await createMember();
    expect(await (await req(`/events/${live}?lang=en`, { cookie: other.cookie })).text()).not.toContain('class="ev-strip');
    const done = await mkEvent({ startsAt: new Date(Date.now() - 5 * HOUR) });
    await mkReg(done, m.id);
    expect(await (await req(`/events/${done}?lang=en`, { cookie: m.cookie })).text()).not.toContain('class="ev-strip');
  });

  it("My registration stays lower on the page, and the sticky bar steps aside while the strip is on screen", async () => {
    const m = await createMember();
    const ev = await mkEvent();
    const html = await (await req(`/events/${ev}?lang=en`, { cookie: m.cookie })).text();
    expect(html.indexOf('class="ev-strip')).toBeLessThan(html.indexOf("<h2>My registration</h2>"));
    expect(html).toContain('id="sticky-rsvp"');
    expect(html).toContain('document.querySelectorAll(".ev-strip")');
  });
});
