/**
 * Pinky Plans follow-ups the owner approved on 30 Oct (P-N1 to P-N3):
 * - the other person hears, neutrally, when the plan changes or is confirmed;
 * - a plan whose time has passed reads as "Last time", with one way on, and a
 *   confirmed plan offers the private home-safe check;
 * - polish: no invitation line once mutual, a clear "no message is sent"
 *   label, neutral buttons in the space, and "Nobody did anything wrong" stays.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { events, notifications, pinkies, pinkyPlans, registrations } from "../src/schema";

const HOUR = 3_600_000;
const en = (m: Member) => `${m.cookie}; lang=en`;
const heart = (gender: string, nickname: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const, nickname });

async function pinkyPair() {
  const [a, b] = await Promise.all([createMember(heart("woman", "Ploy")), createMember(heart("man", "Ken"))]);
  const ev = newId();
  const ends = new Date(Date.now() - 2 * HOUR);
  await db().insert(events).values({ id: ev, title: `PN-${ev.slice(0, 6)}`, startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Cafe", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
  for (const m of [a, b]) await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(Date.now() - 3 * HOUR) });
  await req(`/people/${b.id}/pinky`, { cookie: a.cookie, form: { action: "tap" } });
  await req(`/people/${a.id}/pinky`, { cookie: b.cookie, form: { action: "tap" } });
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const [p] = await db().select().from(pinkies).where(and(eq(pinkies.aAccount, x), eq(pinkies.bAccount, y)));
  return { a, b, p };
}
const post = (m: Member, path: string, form: Record<string, string> = { go: "1" }) => req(path, { cookie: m.cookie, form });
const planNotes = (m: Member) => db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, "pinky_plan")));
function row(html: string): string {
  const i = html.indexOf('<section class="pinky"');
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i));
}

describe.skipIf(!HAS_DB)("Pinky Plans follow-ups (P-N1 to P-N3)", () => {
  it("P-N1: a plan change or a confirm sends the other person one neutral notification, never two waiting", async () => {
    const { a, b, p } = await pinkyPair();
    await post(a, `/pinky/${p.id}/plan`, { place: "Lumphini Park", district: "pathum_wan", startsAt: "2030-01-12T17:00" });
    let notes = await planNotes(b);
    expect(notes.length).toBe(1);
    expect(notes[0].titleEn).toBe("Your plan was updated in My people");
    expect(notes[0].titleTh).toBe("แผนของคุณมีอัปเดตในคนรู้จัก");
    expect(`${notes[0].titleEn} ${notes[0].titleTh}`.toLowerCase()).not.toMatch(/\bpinky\b|\bdate\b|(?<!อัป)เดต|เกี่ยวก้อย/);
    // Another change while one is still unread: still only one waiting.
    await post(a, `/pinky/${p.id}/plan`, { place: "Lumphini Park", district: "pathum_wan", startsAt: "2030-01-12T18:00" });
    expect((await planNotes(b)).length).toBe(1);
    // Read it; a confirm then sends one more. A's own actions never notify a.
    await db().update(notifications).set({ readAt: new Date() }).where(eq(notifications.accountId, b.id));
    await post(a, `/pinky/${p.id}/confirm`);
    notes = await planNotes(b);
    expect(notes.filter((n) => !n.readAt).length).toBe(1);
    expect((await planNotes(a)).length).toBe(0);
    // A note edit stays silent.
    await db().update(notifications).set({ readAt: new Date() }).where(eq(notifications.accountId, b.id));
    await post(a, `/pinky/${p.id}/note`, { note: "bring water" });
    expect((await planNotes(b)).filter((n) => !n.readAt).length).toBe(0);
  });

  it("P-N2: a past plan reads as 'Last time' with one way on; a confirmed plan offers the private home-safe check", async () => {
    const { a, b, p } = await pinkyPair();
    await post(a, `/pinky/${p.id}/plan`, { place: "Ari", district: "phaya_thai", startsAt: "2030-01-12T10:00" });
    await post(a, `/pinky/${p.id}/confirm`);
    await post(b, `/pinky/${p.id}/confirm`);
    const upcoming = await (await req(`/pinky/${p.id}`, { cookie: en(a) })).text();
    expect(upcoming).toContain("Both confirmed");
    expect(upcoming).toContain('action="/safety/arrival"');
    expect(upcoming).toContain('name="context" value="self"');
    await db().update(pinkyPlans).set({ startsAt: new Date(Date.now() - 2 * 24 * HOUR) }).where(eq(pinkyPlans.pinkyId, p.id));
    const past = await (await req(`/pinky/${p.id}`, { cookie: en(a) })).text();
    expect(past).toContain("Last time");
    expect(past).toContain("Plan the next one");
    expect(past).not.toContain("Both confirmed");
    expect(past).not.toMatch(/\d+(st|nd|rd|th)? date/i);
  });

  it("P-N3: no invitation line once mutual, a clear label, neutral buttons, and the friends message stays", async () => {
    const { a, b, p } = await pinkyPair();
    const card = row(await (await req(`/people/${b.id}`, { cookie: en(a) })).text());
    expect(card).not.toContain("Hook pinkies to try a date");
    expect(card).toContain("Back to friends (no message is sent)");
    const html = await (await req(`/pinky/${p.id}`, { cookie: en(a) })).text();
    expect(html).not.toMatch(/btn danger|btn ghost danger/);
    const after = await (await req(`/connections?notice=back_to_friends`, { cookie: en(a) })).text();
    expect(after).toContain('class="notice ok stay"');
    expect(after).toContain("Nobody did anything wrong.");
    expect(after).toContain('class="stay-close" href="/connections"');
  });
});
