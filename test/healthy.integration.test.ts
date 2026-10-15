/**
 * Phase 1 guardrails end to end: chat with limits, the home-safe check,
 * late-night review, the upcoming-RSVP cap and weekly rhythm, pause, and the
 * daily contact-share cap.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { buddyMatches, buddyQuests, chatMessages, connections, contactShares, events, notifications, profiles, registrations, reports, safeArrivals } from "../src/schema";
import { MAX_SHARES_PER_DAY, MAX_UPCOMING } from "../src/domain/rules";

const DAY = 86_400_000;
const pair = (a: Member, b: Member) => (a.id < b.id ? [a.id, b.id] : [b.id, a.id]);

async function activeBuddies() {
  const [a, b] = await Promise.all([createMember(), createMember()]);
  const [x, y] = pair(a, b);
  const id = newId();
  await db().insert(buddyMatches).values({ id, aAccount: x, bAccount: y, week: "2026-W42", state: "active" });
  return { a, b, id };
}

async function event(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * DAY);
  await db()
    .insert(events)
    .values({ id, title: "Board games", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 20, status: "published", createdBy: "test", ...over });
  return id;
}

describe.skipIf(!HAS_DB)("chat with limits", () => {
  it("buddies chat; before meeting, handles are blocked; after a shared quest they're fine; money is flagged", async () => {
    const { a, b, id } = await activeBuddies();
    const thread = `/chat/buddy:${id}`;
    expect((await req(thread, { cookie: a.cookie })).status).toBe(200);
    // A stranger can't open it.
    const stranger = await createMember();
    expect((await req(thread, { cookie: stranger.cookie })).status).toBe(404);

    expect((await req(thread, { cookie: a.cookie, form: { body: "Hi! Saturday morning walk?" } })).status).toBe(302);
    const blocked = await req(thread, { cookie: `${a.cookie}; lang=en`, form: { body: "add my line id: sunny_99" } });
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toContain("Share contact");
    // b gets one notification for the thread, not one per message.
    await req(thread, { cookie: a.cookie, form: { body: "Or Sunday?" } });
    const notes = await db().select().from(notifications).where(and(eq(notifications.accountId, b.id), eq(notifications.link, thread)));
    expect(notes).toHaveLength(1);

    // They met: a quest both finished.
    await db().insert(buddyQuests).values({ id: newId(), matchId: id, week: "2026-W42", scenario: "x", typeCode: "BDSH", district: "bang_rak", aDoneAt: new Date(), bDoneAt: new Date() });
    expect((await req(thread, { cookie: a.cookie, form: { body: "my line id: sunny_99" } })).status).toBe(302);

    await req(thread, { cookie: a.cookie, form: { body: "can you lend me 500 baht" } });
    const html = await (await req(`${thread}?lang=en`, { cookie: `${b.cookie}; lang=en` })).text();
    expect(html).toContain("Never send money");
    const [msg] = await db().select().from(chatMessages).where(and(eq(chatMessages.thread, `buddy:${id}`), eq(chatMessages.moneyFlag, true)));
    // b reports it: a critical report on the message.
    expect((await req(`${thread}/report/${msg.id}`, { cookie: b.cookie, method: "POST" })).headers.get("location")).toContain("notice=reported");
    const [rep] = await db().select().from(reports).where(eq(reports.targetMessage, msg.id));
    expect(rep.severity).toBe("critical");
    expect(rep.targetAccount).toBe(a.id);

    // The pairing ends: the chat is read-only.
    await db().update(buddyMatches).set({ state: "ended" }).where(eq(buddyMatches.id, id));
    expect((await req(thread, { cookie: a.cookie, form: { body: "still there?" } })).status).toBe(400);
  });

  it("circle connections chat; a block hides the thread", async () => {
    const [a, b] = await Promise.all([createMember(), createMember()]);
    const [x, y] = pair(a, b);
    const cid = newId();
    await db().insert(connections).values({ id: cid, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
    expect((await req(`/chat/conn:${cid}`, { cookie: b.cookie, form: { body: "Nice to meet you!" } })).status).toBe(302);
    expect(await (await req("/chat", { cookie: a.cookie })).text()).toContain(`/chat/conn:${cid}`);
    await req(`/block/${b.id}`, { cookie: a.cookie, form: { back: "/connections" } });
    expect((await req(`/chat/conn:${cid}`, { cookie: a.cookie })).status).toBe(404);
  });
});

describe.skipIf(!HAS_DB)("first-meet safety", () => {
  it("home safe? check: set, answer help, the safety team is told", async () => {
    const [m, mod] = await Promise.all([createMember(), createMember({ role: "moderator" })]);
    const r = await req("/safety/arrival", { cookie: m.cookie, form: { back: "21:30", context: "self" } });
    const [row] = await db().select().from(safeArrivals).where(eq(safeArrivals.accountId, m.id));
    expect(r.headers.get("location")).toBe(`/safety/arrival/${row.id}?set=1`);
    // The prompt is dated for back-by time, so it's hidden until then.
    const [note] = await db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, "safe_arrival")));
    expect(note.createdAt.getTime()).toBe(row.backBy.getTime());
    await req(`/safety/arrival/${row.id}`, { cookie: m.cookie, form: { answer: "help" } });
    const [after] = await db().select().from(safeArrivals).where(eq(safeArrivals.id, row.id));
    expect(after.answer).toBe("help");
    expect(await db().select().from(notifications).where(and(eq(notifications.accountId, mod.id), eq(notifications.link, `/admin/users/${m.id}`)))).toHaveLength(1);
    // Nobody else can open it.
    expect((await req(`/safety/arrival/${row.id}`, { cookie: mod.cookie })).status).toBe(404);
  });
});

describe.skipIf(!HAS_DB)("healthy limits", () => {
  it("caps upcoming RSVPs, and checks the weekly rhythm once", async () => {
    const m = await createMember();
    // Rhythm 1: the second RSVP in a week asks first.
    await req("/settings/habits", { cookie: m.cookie, form: { rhythm: "1" } });
    // A Wednesday at noon Bangkok time, at least 10 days out, so both hangouts fall in the same week whatever day the test runs.
    const wed = new Date(Date.now() + 10 * DAY);
    wed.setUTCHours(5, 0, 0, 0);
    wed.setUTCDate(wed.getUTCDate() + ((3 - wed.getUTCDay() + 7) % 7));
    const base = wed.getTime();
    const e1 = await event({ startsAt: new Date(base) });
    const e2 = await event({ startsAt: new Date(base + 3600_000 * 3) });
    expect((await req(`/events/${e1}/rsvp`, { cookie: m.cookie, form: { go: "1" } })).status).toBe(302);
    const ask = await req(`/events/${e2}/rsvp`, { cookie: `${m.cookie}; lang=en`, form: { go: "1" } });
    expect(ask.status).toBe(200);
    expect(await ask.text()).toContain("Your week is already full");
    expect((await req(`/events/${e2}/rsvp`, { cookie: m.cookie, form: { rhythmOk: "1" } })).status).toBe(302);
    // Hard cap on upcoming RSVPs.
    for (let i = 2; i < MAX_UPCOMING; i++) {
      const e = await event({ startsAt: new Date(base + (i + 1) * 8 * DAY) });
      await req(`/events/${e}/rsvp`, { cookie: m.cookie, form: { rhythmOk: "1" } });
    }
    const over = await event({ startsAt: new Date(base + 60 * DAY) });
    expect((await req(`/events/${over}/rsvp`, { cookie: m.cookie, form: { rhythmOk: "1" } })).status).toBe(409);
    expect(await db().select().from(registrations).where(and(eq(registrations.accountId, m.id), eq(registrations.eventId, over)))).toHaveLength(0);
  });

  it("pause: set and lift; an RSVP ends it", async () => {
    const m = await createMember();
    await req("/settings/habits", { cookie: m.cookie, form: { pause: "2" } });
    let [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.pausedUntil!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
    const e = await event();
    await req(`/events/${e}/rsvp`, { cookie: m.cookie, form: { go: "1" } });
    [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.pausedUntil).toBeNull();
  });

  it("late-night events from a partner host go to review", async () => {
    const host = await createMember({ role: "host" });
    const d = new Date(Date.now() + 5 * DAY + 7 * 3600_000);
    const day = d.toISOString().slice(0, 10);
    const r = await req("/host/new", {
      cookie: host.cookie,
      form: { title: "Night market walk", description: "A late walk through the night market with a small group.", startsAt: `${day}T22:30`, endsAt: `${day}T23:59`, venueName: "Jodd Fairs", district: "huai_khwang", capacity: "8", ageMin: "18", ageMax: "99", languages: "th", costThb: "0", intensity: "social", groupMin: "4", groupMax: "6", visibility: "public", safetyInfo: "Meet at the main gate." },
    });
    expect(r.headers.get("location")).toBe("/host?notice=submitted");
  });

  it("caps contact shares per day", async () => {
    const m = await createMember();
    const others = await Promise.all(Array.from({ length: MAX_SHARES_PER_DAY + 1 }, () => createMember()));
    const ids: string[] = [];
    for (const o of others) {
      const [x, y] = pair(m, o);
      const id = newId();
      ids.push(id);
      await db().insert(connections).values({ id, aAccount: x, bAccount: y, level: "friend", eventId: randomToken(6) });
    }
    for (const id of ids.slice(0, MAX_SHARES_PER_DAY)) await req(`/connections/${id}/share`, { cookie: m.cookie, form: { method: "line", value: "sunny_99" } });
    const last = await req(`/connections/${ids[MAX_SHARES_PER_DAY]}/share`, { cookie: m.cookie, form: { method: "line", value: "sunny_99" } });
    expect(last.status).toBe(400);
    expect(await db().select().from(contactShares).where(eq(contactShares.accountId, m.id))).toHaveLength(MAX_SHARES_PER_DAY);
  });
});
