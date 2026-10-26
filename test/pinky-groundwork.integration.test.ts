/**
 * Pinky groundwork that holds whatever buddy-to-partner Pinky becomes (owner
 * card C4, panel fixes): "Back to friends" clears both taps, a block withdraws
 * both, wrapping up a buddy withdraws your tap, buddy taps expire 7 days after
 * the pairing ends, and where-we-met shows a Bangkok Buddy pairing.
 */
import { describe, expect, it } from "vitest";
import { and, eq, or } from "drizzle-orm";
import { HAS_DB, createMember, db, ENV, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { buddyMatches, connectionChoices, connections, events, registrations } from "../src/schema";
import { runRetention } from "../src/services/retention";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const en = (m: Member) => `${m.cookie}; lang=en`;
const heart = (gender: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const });

async function pairAtTable() {
  const [a, b] = await Promise.all([createMember({ ...heart("woman"), nickname: "Ploy" }), createMember({ ...heart("man"), nickname: "Ken" })]);
  const ev = newId();
  const ends = new Date(Date.now() - 2 * HOUR);
  await db().insert(events).values({ id: ev, title: `GW-${ev.slice(0, 6)}`, startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Cafe", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
  for (const m of [a, b]) await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(Date.now() - 3 * HOUR) });
  return { a, b, ev };
}
const tap = (from: Member, to: Member, action = "tap") => req(`/people/${to.id}/pinky`, { cookie: from.cookie, form: { action } });
const tapsBetween = (x: Member, y: Member) =>
  db()
    .select()
    .from(connectionChoices)
    .where(and(eq(connectionChoices.choice, "romance"), or(and(eq(connectionChoices.fromAccount, x.id), eq(connectionChoices.toAccount, y.id)), and(eq(connectionChoices.fromAccount, y.id), eq(connectionChoices.toAccount, x.id)))));

async function buddyMatch(a: Member, b: Member, over: Partial<typeof buddyMatches.$inferInsert> = {}) {
  const id = newId();
  await db().insert(buddyMatches).values({ id, aAccount: a.id, bAccount: b.id, week: "2026-W43", state: "active", ...over });
  return id;
}

describe.skipIf(!HAS_DB)("Pinky groundwork (C4 panel fixes)", () => {
  it("Back to friends clears both taps and says nobody did anything wrong", async () => {
    const { a, b, ev } = await pairAtTable();
    await tap(a, b);
    await tap(b, a);
    const res = await tap(a, b, "back");
    expect(res.headers.get("location")).toBe(`/people/${b.id}?notice=back_to_friends`);
    expect(await tapsBetween(a, b)).toEqual([]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const [c] = await db().select().from(connections).where(and(eq(connections.aAccount, x), eq(connections.bAccount, y), eq(connections.eventId, ev)));
    expect(c.level).toBe("friend");
    const page = await (await req(`/people/${b.id}?notice=back_to_friends`, { cookie: en(a) })).text();
    expect(page).toContain("Nobody did anything wrong.");
  });

  it("after Back to friends there's no new tap for that table, here or in People I Met", async () => {
    const { a, b, ev } = await pairAtTable();
    await tap(a, b);
    await tap(b, a);
    await tap(b, a, "back");
    // No row on either card, and a forged tap stores nothing.
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const html = await (await req(`/people/${y.id}`, { cookie: en(x) })).text();
      expect(html).not.toContain('<section class="pinky"');
      await tap(x, y);
    }
    expect(await tapsBetween(a, b)).toEqual([]);
    // People I Met can't reopen it either: a romance pick there counts as friend.
    await req(`/events/${ev}/people`, { cookie: a.cookie, form: { [`choice_${b.id}`]: "romance" } });
    await req(`/events/${ev}/people`, { cookie: b.cookie, form: { [`choice_${a.id}`]: "romance" } });
    expect(await tapsBetween(a, b)).toEqual([]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const [c] = await db().select().from(connections).where(and(eq(connections.aAccount, x), eq(connections.bAccount, y), eq(connections.eventId, ev)));
    expect(c.level).toBe("friend");
  });

  it("a block withdraws both people's taps", async () => {
    const { a, b } = await pairAtTable();
    await tap(a, b);
    await db().insert(connectionChoices).values({ id: newId(), eventId: `buddy:${newId()}`, fromAccount: b.id, toAccount: a.id, choice: "romance" });
    expect((await tapsBetween(a, b)).length).toBe(2);
    await req(`/block/${a.id}`, { cookie: b.cookie, form: { back: "/connections" } });
    expect(await tapsBetween(a, b)).toEqual([]);
  });

  it("asking to wrap up a buddy withdraws my own tap, not theirs", async () => {
    const [a, b] = await Promise.all([createMember(heart("woman")), createMember(heart("man"))]);
    const m = await buddyMatch(a, b);
    await db().insert(connectionChoices).values([
      { id: newId(), eventId: `buddy:${m}`, fromAccount: a.id, toAccount: b.id, choice: "romance" },
      { id: newId(), eventId: `buddy:${m}`, fromAccount: b.id, toAccount: a.id, choice: "romance" },
    ]);
    await req(`/buddy/${m}/end`, { cookie: a.cookie, form: { note: "lovely" } });
    const left = await db().select().from(connectionChoices).where(eq(connectionChoices.eventId, `buddy:${m}`));
    expect(left.map((r) => r.fromAccount)).toEqual([b.id]);
  });

  it("buddy taps expire 7 days after the pairing ends", async () => {
    const [a, b] = await Promise.all([createMember(heart("woman")), createMember(heart("man"))]);
    const active = await buddyMatch(a, b);
    const recent = await buddyMatch(a, b, { state: "ended", endedAt: new Date(Date.now() - 2 * DAY) });
    const old = await buddyMatch(a, b, { state: "ended", endedAt: new Date(Date.now() - 8 * DAY) });
    for (const m of [active, recent, old]) await db().insert(connectionChoices).values({ id: newId(), eventId: `buddy:${m}`, fromAccount: a.id, toAccount: b.id, choice: "romance" });
    await runRetention(ENV);
    const left = (await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, a.id))).map((r) => r.eventId).sort();
    expect(left).toEqual([`buddy:${active}`, `buddy:${recent}`].sort());
  });

  it("retention deletes Back-to-friends markers and ended buddy connections with what they belong to", async () => {
    const [a, b] = await Promise.all([createMember(), createMember()]);
    const old = await buddyMatch(a, b, { state: "ended", endedAt: new Date(Date.now() - 8 * DAY) });
    const live = await buddyMatch(a, b);
    const ev = newId();
    const ends = new Date(Date.now() - 100 * HOUR);
    await db().insert(events).values({ id: ev, title: "GW-old", startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Cafe", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
    await db().insert(connectionChoices).values([
      { id: newId(), eventId: `pinky-ended:buddy:${old}`, fromAccount: a.id, toAccount: b.id, choice: "none" },
      { id: newId(), eventId: `pinky-ended:buddy:${live}`, fromAccount: a.id, toAccount: b.id, choice: "none" },
      { id: newId(), eventId: `pinky-ended:${ev}`, fromAccount: a.id, toAccount: b.id, choice: "none" },
    ]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const gone = newId();
    const kept = newId();
    await db().insert(connections).values([
      { id: gone, aAccount: x, bAccount: y, level: "activity", eventId: `buddy:${old}`, removedAt: new Date(Date.now() - 8 * DAY) },
      { id: kept, aAccount: x, bAccount: y, level: "activity", eventId: `buddy:${live}` },
    ]);
    await runRetention(ENV);
    const markers = (await db().select().from(connectionChoices).where(eq(connectionChoices.fromAccount, a.id))).map((r) => r.eventId);
    expect(markers.sort()).toEqual([`pinky-ended:buddy:${live}`]);
    const conns = (await db().select().from(connections).where(or(eq(connections.id, gone), eq(connections.id, kept)))).map((r) => r.id);
    expect(conns).toEqual([kept]);
  });

  it("where-we-met shows a Bangkok Buddy pairing", async () => {
    const [a, b] = await Promise.all([createMember(), createMember()]);
    const m = await buddyMatch(a, b);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "activity", eventId: `buddy:${m}` });
    const html = await (await req(`/people/${b.id}`, { cookie: en(a) })).text();
    expect(html).toContain("Bangkok Buddy");
    expect(html).toContain('href="/buddy"');
  });
});
