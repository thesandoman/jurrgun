/**
 * เกี่ยวก้อย · Pinky: a private tap on the card of someone you met, that
 * becomes a Pinky (a mutual connection at level romance) only when both
 * tapped, both have 💘 on, neither blocks the other and both checked in to
 * that event. A one-sided tap must never leak.
 */
import { describe, expect, it } from "vitest";
import { and, eq, or } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { auditLog, blocks, connectionChoices, connections, datingIntents, events, notifications, profiles, registrations } from "../src/schema";
import { pinkyOffered, pinkyOn, pinkyUnlocked, type PinkySide } from "../src/domain/pinky";

const HOUR = 3_600_000;
const en = (m: Member) => `${m.cookie}; lang=en`;

async function endedEvent(endedHoursAgo = 2) {
  const id = newId();
  const ends = new Date(Date.now() - endedHoursAgo * HOUR);
  await db()
    .insert(events)
    .values({ id, title: `PINKY-${id.slice(0, 6)}`, startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Soi Social Club", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
  return id;
}
async function attend(eventId: string, m: Member, checkedIn = true) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: checkedIn ? new Date(Date.now() - 3 * HOUR) : null });
}
async function dating(m: Member, mode = "dating") {
  await db().insert(datingIntents).values({ accountId: m.id, mode }).onConflictDoUpdate({ target: datingIntents.accountId, set: { mode } });
}
const heart = (gender: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const });

/** Two 💘 members who both checked in to one event. */
async function pair(opts: { endedHoursAgo?: number } = {}) {
  const [a, b] = await Promise.all([createMember({ ...heart("woman"), nickname: "Ploy" }), createMember({ ...heart("man"), nickname: "Ken" })]);
  await Promise.all([dating(a), dating(b, "dating_only")]);
  const ev = await endedEvent(opts.endedHoursAgo);
  await attend(ev, a);
  await attend(ev, b);
  return { a, b, ev };
}
const card = (viewer: Member, target: Member) => req(`/people/${target.id}`, { cookie: en(viewer) }).then((r) => r.text());
const tap = (from: Member, to: Member, action = "tap") => req(`/people/${to.id}/pinky`, { cookie: from.cookie, form: { action } });
/** Just the Pinky row of a card (or "" when there is none). */
function row(html: string): string {
  const i = html.indexOf('<section class="pinky"');
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i));
}
async function between(ev: string, x: Member, y: Member) {
  const [a, b] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
  const [c] = await db().select().from(connections).where(and(eq(connections.aAccount, a), eq(connections.bAccount, b), eq(connections.eventId, ev)));
  return c ?? null;
}
const notesOf = (m: Member) => db().select().from(notifications).where(eq(notifications.accountId, m.id));

describe("Pinky rules (pure)", () => {
  const on: PinkySide = { relationship: "single", romanceOn: true, genderIdentity: "woman", romanceOpenTo: "everyone" };
  const other: PinkySide = { ...on, genderIdentity: "man" };
  it("needs both taps, both 💘 on, no block, both checked in and a fit", () => {
    const base = { taps: [true, true] as [boolean, boolean], sides: [on, other] as [PinkySide, PinkySide], blocked: false, bothCheckedIn: true };
    expect(pinkyUnlocked(base)).toBe(true);
    expect(pinkyUnlocked({ ...base, taps: [true, false] })).toBe(false);
    expect(pinkyUnlocked({ ...base, blocked: true })).toBe(false);
    expect(pinkyUnlocked({ ...base, bothCheckedIn: false })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [on, { ...other, romanceOn: false }] })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [on, { ...other, relationship: "married" }] })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [{ ...on, romanceOpenTo: ["woman"] }, other] })).toBe(false);
    expect(pinkyOn({ ...on, romanceOn: false })).toBe(false);
  });

  it("the row depends only on the viewer and the table, never on the other person", () => {
    const base = { met: true, blocked: false, windowOpen: true, mutual: false };
    expect(pinkyOffered(on, base)).toBe(true);
    expect(pinkyOffered({ ...on, romanceOn: false }, base)).toBe(false);
    expect(pinkyOffered(on, { ...base, windowOpen: false })).toBe(false);
    expect(pinkyOffered(on, { ...base, windowOpen: false, mutual: true })).toBe(true);
    expect(pinkyOffered(on, { ...base, blocked: true })).toBe(false);
    expect(pinkyOffered(on, { ...base, met: false })).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("เกี่ยวก้อย · Pinky", () => {
  it("shows the same quiet row on everyone a 💘 member met, whatever their status", async () => {
    const { a, b, ev } = await pair();
    const friendsOnly = await createMember();
    // 💘 on with no dating answers saved: one test of 💘 everywhere (owner card C2).
    const heartNoMode = await createMember(heart("man"));
    for (const m of [friendsOnly, heartNoMode]) await attend(ev, m);
    const html = await card(a, b);
    expect(row(html)).toContain("เกี่ยวก้อย · Pinky");
    expect(row(html)).toContain("Hook pinkies to try a date");
    expect(row(html)).toContain('value="tap"');
    expect(row(await card(friendsOnly, b))).toBe("");
    expect(row(await card(heartNoMode, b))).toContain('value="tap"');
    // The row on a friends-only member's card is the very same: it says nothing about them.
    expect(row(await card(a, friendsOnly)).replaceAll(friendsOnly.id, b.id)).toBe(row(html));
    // Tapping without it being offered does nothing.
    await tap(friendsOnly, b);
    expect(await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, friendsOnly.id))).toEqual([]);
  });

  it("a one-sided tap never leaks to the other person", async () => {
    const { a, b, ev } = await pair();
    const beforeRow = row(await card(b, a));
    const beforeConn = await (await req("/connections", { cookie: en(b) })).text();
    const res = await tap(a, b);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/people/${b.id}#pinky`);
    const [choice] = await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, ev), eq(connectionChoices.fromAccount, a.id)));
    expect(choice.choice).toBe("romance");
    // a sees their own tap.
    expect(row(await card(a, b))).toContain("Your pinky is out");
    // b's view of a is exactly what it was, nobody was told, nothing was created.
    expect(row(await card(b, a))).toBe(beforeRow);
    expect(await notesOf(b)).toEqual([]);
    expect(await notesOf(a)).toEqual([]);
    expect(await between(ev, a, b)).toBeNull();
    const afterConn = await (await req("/connections", { cookie: en(b) })).text();
    expect(afterConn).not.toContain("tag love\">เกี่ยวก้อย");
    expect(afterConn.length).toBe(beforeConn.length);
    // People I Met (still open) shows b only b's own choices.
    const people = await (await req(`/events/${ev}/people`, { cookie: en(b) })).text();
    expect(people).not.toMatch(new RegExp(`name="choice_${a.id}" value="romance" checked`));
    // Nothing on a staff page or in the audit log.
    const audits = await db().select().from(auditLog).where(or(eq(auditLog.actor, a.id), eq(auditLog.targetId, b.id)));
    expect(audits).toEqual([]);
  });

  it("unlocks when both tap: a Pinky for both, told in neutral words", async () => {
    const { a, b, ev } = await pair();
    await tap(a, b);
    await tap(b, a);
    const c = await between(ev, a, b);
    expect(c?.level).toBe("romance");
    expect(c?.removedAt).toBeNull();
    expect(row(await card(a, b))).toContain("You and Ken both hooked pinkies");
    expect(row(await card(b, a))).toContain("You and Ploy both hooked pinkies");
    expect(row(await card(a, b))).toContain(`href="/chat/conn:${c!.id}"`);
    for (const m of [a, b]) {
      const notes = await notesOf(m);
      expect(notes.length).toBe(1);
      expect(`${notes[0].titleEn} ${notes[0].titleTh}`.toLowerCase()).not.toMatch(/date|pinky|romance|เดต|เกี่ยวก้อย/);
    }
    const conns = await (await req("/connections", { cookie: en(a) })).text();
    expect(conns).toContain('<span class="tag love">เกี่ยวก้อย · Pinky</span>');
    // Tapping again changes nothing and tells nobody twice.
    await tap(a, b);
    expect((await notesOf(a)).length).toBe(1);
  });

  it("stepping back ends a Pinky as friends, telling nobody", async () => {
    const { a, b, ev } = await pair();
    await tap(a, b);
    await tap(b, a);
    const before = [(await notesOf(a)).length, (await notesOf(b)).length];
    await tap(a, b, "back");
    const c = await between(ev, a, b);
    expect(c?.level).toBe("friend");
    expect(c?.removedAt).toBeNull();
    // My tap is withdrawn, not turned into a friend pick.
    expect(await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, ev), eq(connectionChoices.fromAccount, a.id)))).toEqual([]);
    expect([(await notesOf(a)).length, (await notesOf(b)).length]).toEqual(before);
    expect(row(await card(a, b))).toContain('value="tap"');
    expect(await (await req("/connections", { cookie: en(b) })).text()).not.toContain("tag love\">เกี่ยวก้อย");
  });

  it("stepping back from a one-sided tap removes it, so a later tap from them doesn't unlock", async () => {
    const { a, b, ev } = await pair();
    await tap(a, b);
    await tap(a, b, "back");
    expect(await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, ev), eq(connectionChoices.fromAccount, a.id)))).toEqual([]);
    await tap(b, a);
    expect(await between(ev, a, b)).toBeNull();
    expect(await notesOf(a)).toEqual([]);
    expect(row(await card(a, b))).toContain('value="tap"');
  });

  it("never unlocks when the other has 💘 off, answers the tap the same way, and never after a block", async () => {
    const { a, b, ev } = await pair();
    // b's romance choice from People I Met, made back when b had 💘 on.
    await db().insert(connectionChoices).values({ id: newId(), eventId: ev, fromAccount: b.id, toAccount: a.id, choice: "romance" });
    await db().update(profiles).set({ romanceOn: false }).where(eq(profiles.accountId, b.id));
    expect(row(await card(b, a))).toBe("");
    const res = await tap(a, b);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/people/${b.id}#pinky`);
    expect(row(await card(a, b))).toContain("Your pinky is out");
    expect(await between(ev, a, b)).toBeNull();
    expect(await notesOf(a)).toEqual([]);

    const p = await pair();
    await db().insert(blocks).values({ id: newId(), blocker: p.b.id, blocked: p.a.id });
    expect((await tap(p.a, p.b)).status).toBe(404);
    await tap(p.b, p.a);
    expect(await between(p.ev, p.a, p.b)).toBeNull();
  });

  it("needs an event both checked in to: a buddy connection stays friends only", async () => {
    const [a, b] = await Promise.all([createMember(heart("woman")), createMember(heart("man"))]);
    await Promise.all([dating(a), dating(b)]);
    const ev = await endedEvent();
    await attend(ev, a);
    await attend(ev, b, false);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "friend", eventId: `buddy:${newId()}` });
    const html = await card(a, b);
    expect(html).toContain('class="pc-');
    expect(row(html)).toBe("");
    await tap(a, b);
    await tap(b, a);
    expect(await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, a.id))).toEqual([]);
  });

  it("once People I Met closes, there's no row and no tap, but a Pinky stays", async () => {
    const { a, b, ev } = await pair({ endedHoursAgo: 100 });
    expect(row(await card(a, b))).toBe("");
    await tap(a, b);
    expect(await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, a.id))).toEqual([]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "romance", eventId: ev });
    expect(row(await card(a, b))).toContain("both hooked pinkies");
  });

  it("switching 💘 off ends every Pinky and withdraws every tap, silently", async () => {
    const { a, b, ev } = await pair();
    await tap(a, b);
    await tap(b, a);
    const notes = (await notesOf(b)).length;
    const off = await req("/settings/quick", { cookie: a.cookie, form: { key: "romance", on: "0" } });
    expect(off.status).toBe(302);
    expect((await between(ev, a, b))?.level).toBe("friend");
    // Withdrawn, not turned into a "friend" pick a never made.
    expect(await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, a.id))).toEqual([]);
    expect((await notesOf(b)).length).toBe(notes);
    expect(row(await card(a, b))).toBe("");
  });
});

describe.skipIf(!HAS_DB)("the 💘 switch leaves no trace for staff", () => {
  it("switching 💘 on from prefer-not writes no audit row, only the consent rows", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    const r = await req("/settings/quick", { cookie: m.cookie, form: { key: "romance", on: "1", consent: "1" } });
    expect(r.status).toBe(302);
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.relationship).toBe("single");
    expect(p.romanceOn).toBe(true);
    expect(await db().select().from(auditLog).where(or(eq(auditLog.actor, m.id), eq(auditLog.targetId, m.id)))).toEqual([]);
  });
});
