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
import { auditLog, blocks, connectionChoices, connections, datingIntents, events, notifications, registrations } from "../src/schema";
import { pinkyOn, pinkyUnlocked, type PinkySide } from "../src/domain/pinky";

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
  const on: PinkySide = { relationship: "single", romanceOn: true, genderIdentity: "woman", romanceOpenTo: "everyone", datingMode: "dating" };
  const other: PinkySide = { ...on, genderIdentity: "man", datingMode: "dating_only" };
  it("needs both taps, both 💘 on, no block, both checked in and a fit", () => {
    const base = { taps: [true, true] as [boolean, boolean], sides: [on, other] as [PinkySide, PinkySide], blocked: false, bothCheckedIn: true };
    expect(pinkyUnlocked(base)).toBe(true);
    expect(pinkyUnlocked({ ...base, taps: [true, false] })).toBe(false);
    expect(pinkyUnlocked({ ...base, blocked: true })).toBe(false);
    expect(pinkyUnlocked({ ...base, bothCheckedIn: false })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [on, { ...other, datingMode: "friends" }] })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [on, { ...other, romanceOn: false }] })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [on, { ...other, relationship: "married" }] })).toBe(false);
    expect(pinkyUnlocked({ ...base, sides: [{ ...on, romanceOpenTo: ["woman"] }, other] })).toBe(false);
    expect(pinkyOn({ ...on, datingMode: null })).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("เกี่ยวก้อย · Pinky", () => {
  it("shows a quiet row only to members with 💘 on, on the card of someone they met", async () => {
    const { a, b, ev } = await pair();
    const friendsOnly = await createMember();
    const heartNoMode = await createMember(heart("man"));
    await dating(heartNoMode, "friends");
    for (const m of [friendsOnly, heartNoMode]) await attend(ev, m);
    const html = await card(a, b);
    expect(row(html)).toContain("เกี่ยวก้อย · Pinky");
    expect(row(html)).toContain("Hook pinkies to try a date");
    expect(row(html)).toContain('value="tap"');
    expect(row(await card(friendsOnly, b))).toBe("");
    expect(row(await card(heartNoMode, b))).toBe("");
    // A 💘 member never sees it on the card of someone who isn't open to dating.
    expect(row(await card(a, friendsOnly))).toBe("");
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
    const [mine] = await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, ev), eq(connectionChoices.fromAccount, a.id)));
    expect(mine.choice).toBe("friend");
    expect([(await notesOf(a)).length, (await notesOf(b)).length]).toEqual(before);
    expect(row(await card(a, b))).toContain('value="tap"');
    expect(await (await req("/connections", { cookie: en(b) })).text()).not.toContain("tag love\">เกี่ยวก้อย");
  });

  it("stepping back from a one-sided tap removes it, so a later tap from them doesn't unlock", async () => {
    // People I Met has closed and they aren't connected: the tap is simply removed.
    const { a, b, ev } = await pair({ endedHoursAgo: 100 });
    await tap(a, b);
    await tap(a, b, "back");
    expect(await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, ev), eq(connectionChoices.fromAccount, a.id)))).toEqual([]);
    await tap(b, a);
    expect(await between(ev, a, b)).toBeNull();
    expect(await notesOf(a)).toEqual([]);
    expect(row(await card(a, b))).toContain('value="tap"');
  });

  it("never unlocks when the other has 💘 dating mode off, or after a block", async () => {
    const { a, b, ev } = await pair();
    await dating(b, "friends");
    // b's romance choice from People I Met, made back when b was dating.
    await db().insert(connectionChoices).values({ id: newId(), eventId: ev, fromAccount: b.id, toAccount: a.id, choice: "romance" });
    expect(row(await card(b, a))).toBe("");
    await tap(a, b);
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

  it("switching 💘 off ends every Pinky and withdraws every tap, silently", async () => {
    const { a, b, ev } = await pair({ endedHoursAgo: 100 });
    await tap(a, b);
    await tap(b, a);
    const notes = (await notesOf(b)).length;
    const off = await req("/settings/quick", { cookie: a.cookie, form: { key: "romance", on: "0" } });
    expect(off.status).toBe(302);
    expect((await between(ev, a, b))?.level).toBe("friend");
    const mine = await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, a.id));
    expect(mine.map((r) => r.choice)).toEqual(["friend"]);
    expect((await notesOf(b)).length).toBe(notes);
    expect(row(await card(a, b))).toBe("");
  });
});
