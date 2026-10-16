/**
 * Finalize review (owner, 2026-10-16): Me has plain cards and one prompt slot,
 * the type toggle and retake live on the quiz result, past events are compact
 * rows by month with buttons only inside the 72-hour window, and the pass shows
 * a three-step strip with one countdown line.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import { accounts, events, profiles, registrations, vibes } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { byMonth, PassSteps } from "../src/routes/events";
import { SectionHead, SubLabel } from "../src/ui/section-head";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t = (_th: string, en: string) => en;

async function mkEvent(startsAt: Date) {
  const id = newId();
  await db()
    .insert(events)
    .values({ id, title: `EV-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
  return id;
}
async function mkReg(eventId: string, accountId: string, checkedInAt?: Date) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(18), checkedInAt });
}

describe("finalize review: pieces", () => {
  it("groups consecutive items by month, keeping their order", () => {
    expect(byMonth(["a1", "a2", "b1", "a3"], (x) => x[0])).toEqual([
      ["a", ["a1", "a2"]],
      ["b", ["b1"]],
      ["a", ["a3"]],
    ]);
    expect(byMonth([], () => "x")).toEqual([]);
  });

  it("the pass strip marks done steps with a tick and the current one in words", () => {
    const before = String(<PassSteps t={t} checkedIn={false} />);
    expect(before).toContain('class="pass-steps"');
    expect(before).toContain('<li class="is-done">');
    expect(before).toContain('<li class="is-now" aria-current="step">');
    expect(before).toContain("✓");
    expect(before).toContain("(done)");
    expect(before).toContain(">Now<");
    expect(before.match(/class="is-done"/g)).toHaveLength(1);
    const after = String(<PassSteps t={t} checkedIn />);
    expect(after.match(/class="is-done"/g)).toHaveLength(2);
    expect(after).toMatch(/<li class="is-now" aria-current="step">[\s\S]*People I met/);
  });

  it("SectionHead and SubLabel are the two heading levels", () => {
    const head = String(<SectionHead title="Things I love" link={{ href: "/x", label: "Edit" }} />);
    expect(head).toBe('<div class="sec-head"><h2>Things I love</h2><a href="/x">Edit</a></div>');
    expect(String(<SectionHead title="Plain" />)).toBe('<div class="sec-head"><h2>Plain</h2></div>');
    expect(String(<SubLabel>Out and about</SubLabel>)).toBe('<h3 class="sub-label">Out and about</h3>');
  });
});

describe.skipIf(!HAS_DB)("finalize review: pages", () => {
  it("Me: neutral cards, the type as a link only, and the toggle and retake on the quiz result", async () => {
    const m = await createMember();
    await db().insert(vibes).values({ accountId: m.id, vector: {}, archetype: "BDMN", visible: false });
    await attendedOnce(m.id);
    const me = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(me).not.toMatch(/class="me-(stat|row) tint-/);
    expect(me).toMatch(/class="me-stat-emoji tint-/);
    expect(me).toMatch(/class="me-bubble tint-/);
    expect(me).toContain('href="/quiz/result" class="teaser"');
    expect(me).not.toContain("Show my type to people at my Tables");
    expect(me).not.toContain("Retake the quiz");
    expect(me).toContain('<h2 id="me-type-h">Your Bangkok Type</h2><a href="/types">All types</a>');
    expect(me).toContain('<h3 class="sub-label">Out and about</h3>');
    const result = await (await req("/quiz/result?lang=en", { cookie: m.cookie })).text();
    expect(result).toContain("Show my type to people at my Tables");
    expect(result).toContain("Retake the quiz");
  });

  it("Me: one prompt slot, the six-month question ahead of the profile nudge", async () => {
    const m = await createMember();
    let html = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain("Help your table get to know you");
    await db().update(profiles).set({ newcomer: true }).where(eq(profiles.accountId, m.id));
    await db().update(accounts).set({ createdAt: new Date(Date.now() - 200 * DAY) }).where(eq(accounts.id, m.id));
    html = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain("Still new to Bangkok?");
    expect(html).not.toContain("Help your table get to know you");
    // The tiles, then the next table, then the one prompt.
    await attendedOnce(m.id);
    html = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    const order = ['class="me-stats"', "Your next table", "Still new to Bangkok?"].map((s) => html.indexOf(s));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("My events: past events are compact rows by month, with buttons only while the window is open", async () => {
    const m = await createMember();
    const recent = await mkEvent(new Date(Date.now() - 6 * HOUR));
    const old = await mkEvent(new Date(Date.now() - 40 * DAY));
    await mkReg(recent, m.id, new Date(Date.now() - 5 * HOUR));
    await mkReg(old, m.id, new Date(Date.now() - 40 * DAY + HOUR));
    const html = await (await req("/me/events?lang=en", { cookie: m.cookie })).text();
    expect(html.match(/class="past-month"/g)!.length).toBe(2);
    expect(html).toContain('<li class="past-row is-open">');
    expect(html).toContain(`/events/${recent}/people`);
    expect(html).toContain(`/events/${recent}/feedback`);
    expect(html).not.toContain(`/events/${old}/people`);
    expect(html).not.toContain(`/events/${old}/feedback`);
    expect(html).toContain(`<a class="past-main" href="/events/${old}">`);
    expect(html).toContain("✓ Attended");
  });

  it("the pass: the strip instead of circles, and one countdown line", async () => {
    const m = await createMember();
    const ev = await mkEvent(new Date(Date.now() + 2 * DAY));
    await mkReg(ev, m.id);
    const html = await (await req(`/me/events/${ev}/pass?lang=en`, { cookie: m.cookie })).text();
    expect(html).toContain('class="pass-steps"');
    expect(html).not.toContain('class="next-steps"');
    expect(html).toContain('class="countdown"');
    expect(html).not.toContain("check‑in opens in");
  });
});
