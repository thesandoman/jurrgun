/**
 * Pinky Plans (owner, 2026-10-26, with the 3 Wise Men conditions): the
 * private space a mutual Pinky opens. Only the two people can open it, staff
 * never see it, the Pinky and its connection change together, and End kindly
 * deletes the plan and the Pinky-period chat but keeps reported messages.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { chatMessages, connectionChoices, connections, events, pinkies, pinkyPlans, registrations, reports } from "../src/schema";

const HOUR = 3_600_000;
const en = (m: Member) => `${m.cookie}; lang=en`;
const heart = (gender: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const });

/** Two 💘 members who met at a table and both tapped: a live Pinky. */
async function pinkyPair() {
  const [a, b] = await Promise.all([createMember({ ...heart("woman"), nickname: "Ploy" }), createMember({ ...heart("man"), nickname: "Ken" })]);
  const ev = newId();
  const ends = new Date(Date.now() - 2 * HOUR);
  await db().insert(events).values({ id: ev, title: `PP-${ev.slice(0, 6)}`, startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Cafe", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
  for (const m of [a, b]) await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(Date.now() - 3 * HOUR) });
  await req(`/people/${b.id}/pinky`, { cookie: a.cookie, form: { action: "tap" } });
  await req(`/people/${a.id}/pinky`, { cookie: b.cookie, form: { action: "tap" } });
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const [p] = await db().select().from(pinkies).where(and(eq(pinkies.aAccount, x), eq(pinkies.bAccount, y)));
  return { a, b, ev, p };
}
const space = (m: Member, id: string) => req(`/pinky/${id}`, { cookie: en(m) });
const post = (m: Member, path: string, form: Record<string, string> = { go: "1" }) => req(path, { cookie: m.cookie, form });

describe.skipIf(!HAS_DB)("Pinky Plans", () => {
  it("a mutual Pinky opens a private space for the two of them only", async () => {
    const { a, b, p } = await pinkyPair();
    expect(p).toBeTruthy();
    const [conn] = await db().select().from(connections).where(eq(connections.id, p.connectionId));
    expect(conn.level).toBe("romance");
    const card = await (await req(`/people/${b.id}`, { cookie: en(a) })).text();
    expect(card).toContain("You chose each other. Now go somewhere real.");
    expect(card).toContain(`href="/pinky/${p.id}"`);
    const html = await (await space(b, p.id)).text();
    expect(html).toContain("Pinky: you both chose each other");
    expect(html).toContain("Ideas for you two");
    expect(html).toContain(`href="/chat/conn:${p.connectionId}"`);
    // Nobody else, staff included.
    const [other, admin] = await Promise.all([createMember(), createMember({ role: "bma_admin" })]);
    expect((await space(other, p.id)).status).toBe(404);
    expect((await space(admin, p.id)).status).toBe(404);
    // /connections links the tag to the space.
    expect(await (await req("/connections", { cookie: en(a) })).text()).toContain(`href="/pinky/${p.id}"`);
  });

  it("one shared plan: both confirm, and a change of time clears the confirms", async () => {
    const { a, b, p } = await pinkyPair();
    await post(a, `/pinky/${p.id}/plan`, { place: "Lumphini Park", district: "pathum_wan", startsAt: "2030-01-12T17:00" });
    await post(a, `/pinky/${p.id}/confirm`);
    expect(await (await space(b, p.id)).text()).not.toContain("Both confirmed");
    await post(b, `/pinky/${p.id}/confirm`);
    expect(await (await space(a, p.id)).text()).toContain("Both confirmed");
    await post(b, `/pinky/${p.id}/plan`, { place: "Lumphini Park", district: "pathum_wan", startsAt: "2030-01-12T18:00" });
    const [plan] = await db().select().from(pinkyPlans).where(eq(pinkyPlans.pinkyId, p.id));
    expect(plan.aConfirmedAt).toBeNull();
    expect(plan.bConfirmedAt).toBeNull();
  });

  it("one shared note both can edit, with no history, no names and no times", async () => {
    const { a, b, p } = await pinkyPair();
    await post(a, `/pinky/${p.id}/note`, { note: "Bring an umbrella" });
    expect(await (await space(b, p.id)).text()).toContain("Bring an umbrella");
    await post(b, `/pinky/${p.id}/note`, { note: "And sunscreen" });
    const html = await (await space(a, p.id)).text();
    expect(html).toContain("And sunscreen");
    expect(html).not.toContain("Bring an umbrella");
    const planSection = html.slice(html.indexOf('id="pk-plan"'), html.indexOf('id="pk-ideas"'));
    expect(planSection).not.toMatch(/edited|last saved|seen by|แก้ไขโดย/i);
  });

  it("ideas come three at a time, never with a counter, and stop for the day", async () => {
    const { a, p } = await pinkyPair();
    const first = await (await space(a, p.id)).text();
    expect((first.match(/class="pk-idea"/g) ?? []).length).toBe(3);
    expect(first).not.toMatch(/\d\s*\/\s*9/);
    await post(a, `/pinky/${p.id}/ideas`);
    await post(a, `/pinky/${p.id}/ideas`);
    const last = await (await space(a, p.id)).text();
    expect(last).toContain("enough for today. Pick one and go.");
    expect(last).not.toContain("Other ideas");
    // Using an idea fills the plan's place.
    const key = /name="idea" value="([a-z_]+)"/.exec(last)![1];
    await post(a, `/pinky/${p.id}/idea`, { idea: key });
    const [plan] = await db().select().from(pinkyPlans).where(eq(pinkyPlans.pinkyId, p.id));
    expect(plan.ideaKey).toBe(key);
  });

  it("pause needs no reason; only the one who paused resumes, and either can End kindly while paused", async () => {
    const { a, b, p } = await pinkyPair();
    await post(a, `/pinky/${p.id}/pause`);
    const theirs = await (await space(b, p.id)).text();
    expect(theirs).toContain("Paused for now. Nobody needs to explain.");
    expect(theirs).not.toContain(`/pinky/${p.id}/resume`);
    expect(await (await space(a, p.id)).text()).toContain(`/pinky/${p.id}/resume`);
    // Writes wait while paused.
    await post(b, `/pinky/${p.id}/note`, { note: "nope" });
    expect(await db().select().from(pinkyPlans).where(eq(pinkyPlans.pinkyId, p.id))).toEqual([]);
    expect((await post(b, `/pinky/${p.id}/end`, { message: "friends" })).headers.get("location")).toBe("/connections?notice=back_to_friends");
    expect(await db().select().from(pinkies).where(eq(pinkies.id, p.id))).toEqual([]);
  });

  it("End kindly deletes the Pinky-period chat but keeps earlier and reported messages, then sends the gentle message", async () => {
    const { a, b, ev, p } = await pinkyPair();
    const thread = `conn:${p.connectionId}`;
    const before = newId();
    const during = newId();
    const reported = newId();
    await db().insert(chatMessages).values([
      { id: before, thread, sender: a.id, body: "before", createdAt: new Date(p.createdAt.getTime() - HOUR) },
      { id: during, thread, sender: b.id, body: "during", createdAt: new Date(p.createdAt.getTime() + 1000) },
      { id: reported, thread, sender: b.id, body: "reported one", createdAt: new Date(p.createdAt.getTime() + 2000) },
    ]);
    await db().insert(reports).values({ id: newId(), reporter: a.id, targetAccount: b.id, targetMessage: reported, reason: "harassment", details: "Chat message: reported one" });
    await post(a, `/pinky/${p.id}/note`, { note: "secret plan" });
    await post(a, `/pinky/${p.id}/end`, { message: "thanks" });
    const left = (await db().select().from(chatMessages).where(eq(chatMessages.thread, thread))).map((m) => m.body);
    expect(left).toContain("before");
    expect(left).toContain("reported one");
    expect(left).not.toContain("during");
    expect(left.some((m) => /Thank you for the date|ขอบคุณที่ไปเดตด้วยกัน/.test(m))).toBe(true);
    expect(await db().select().from(pinkyPlans).where(eq(pinkyPlans.pinkyId, p.id))).toEqual([]);
    const [conn] = await db().select().from(connections).where(eq(connections.id, p.connectionId));
    expect(conn.level).toBe("friend");
    // No new tap for that table afterwards.
    expect(await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, ev), eq(connectionChoices.choice, "romance")))).toEqual([]);
    const card = await (await req(`/people/${b.id}`, { cookie: en(a) })).text();
    expect(card).not.toContain('<section class="pinky"');
  });

  it("switching 💘 off, or a block, deletes the Pinky with its plan", async () => {
    const one = await pinkyPair();
    await post(one.a, `/pinky/${one.p.id}/note`, { note: "x" });
    await req("/settings/quick", { cookie: one.a.cookie, form: { key: "romance", on: "0" } });
    expect(await db().select().from(pinkies).where(eq(pinkies.id, one.p.id))).toEqual([]);
    expect(await db().select().from(pinkyPlans).where(eq(pinkyPlans.pinkyId, one.p.id))).toEqual([]);
    const two = await pinkyPair();
    await req(`/block/${two.a.id}`, { cookie: two.b.cookie, form: { back: "/connections" } });
    expect(await db().select().from(pinkies).where(eq(pinkies.id, two.p.id))).toEqual([]);
  });

  it("the safety share fills where and when from the plan, and who starts empty", async () => {
    const { a, p } = await pinkyPair();
    await post(a, `/pinky/${p.id}/plan`, { place: "Ari", district: "phaya_thai", startsAt: "2030-01-12T10:00" });
    const html = await (await space(a, p.id)).text();
    const href = /href="(\/safety\?[^"]+)"/.exec(html)![1].replaceAll("&amp;", "&");
    const safety = await (await req(href, { cookie: en(a) })).text();
    expect(safety).toContain('name="where" maxlength="80" value="Ari"');
    expect(safety).toMatch(/<input name="who" maxlength="40" placeholder/);
  });
});
