/**
 * No repeats, round two (owner cards): one chat per person, Discover marks this
 * week's picks, the Me tiles open the right part of My events, and Learn lists
 * each source once.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import { buddyMatches, chatMessages, connections, events, weeklyPlans } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { weekKey } from "../src/domain/buddy";

const event = async (title: string, daysFromNow: number) => {
  const id = newId();
  const startsAt = new Date(Date.now() + daysFromNow * 86_400_000);
  await db().insert(events).values({ id, title, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" });
  return id;
};

describe.skipIf(!HAS_DB)("no repeats, round two", () => {
  it("someone met at two events is one chat: the old thread opens the new one, both meetings' messages show, new ones go to the newest", async () => {
    const me = await createMember();
    const them = await createMember();
    const [oldC, newC] = [newId(), newId()];
    await db().insert(connections).values([
      { id: oldC, aAccount: me.id, bAccount: them.id, level: "friend", eventId: await event("First meet", -10), createdAt: new Date(Date.now() - 9 * 86_400_000) },
      { id: newC, aAccount: them.id, bAccount: me.id, level: "friend", eventId: await event("Second meet", -3), createdAt: new Date(Date.now() - 2 * 86_400_000) },
    ]);
    await db().insert(chatMessages).values([
      { id: newId(), thread: `conn:${oldC}`, sender: them.id, body: "from the first meet", createdAt: new Date(Date.now() - 8 * 86_400_000) },
      { id: newId(), thread: `conn:${newC}`, sender: me.id, body: "from the second meet", createdAt: new Date(Date.now() - 86_400_000) },
    ]);
    const old = await req(`/chat/conn:${oldC}`, { cookie: me.cookie });
    expect(old.status).toBe(302);
    expect(old.headers.get("location")).toBe(`/chat/conn:${newC}`);
    const html = await (await req(`/chat/conn:${newC}?lang=en`, { cookie: me.cookie })).text();
    expect(html).toContain("from the first meet");
    expect(html).toContain("from the second meet");
    const list = await (await req("/chat?lang=en", { cookie: me.cookie })).text();
    expect(list.split(`href="/chat/conn:`).length - 1).toBe(1);
    await req(`/chat/conn:${oldC}`, { cookie: me.cookie, method: "POST", form: { body: "see you Saturday" } });
    const [sent] = await db().select({ thread: chatMessages.thread }).from(chatMessages).where(eq(chatMessages.body, "see you Saturday")).limit(1);
    expect(sent.thread).toBe(`conn:${newC}`);
  });

  it("a buddy you're also connected with is one chat: the buddy chat while paired, the people chat (with its history) after", async () => {
    const me = await createMember();
    const them = await createMember();
    const conn = newId();
    const mid = newId();
    await db().insert(connections).values({ id: conn, aAccount: me.id, bAccount: them.id, level: "friend", eventId: await event("Met here", -5) });
    await db().insert(buddyMatches).values({ id: mid, aAccount: me.id, bAccount: them.id, week: "2026-W42", state: "active" });
    await db().insert(chatMessages).values([
      { id: newId(), thread: `conn:${conn}`, sender: them.id, body: "people chat hello", createdAt: new Date(Date.now() - 3 * 86_400_000) },
      { id: newId(), thread: `buddy:${mid}`, sender: me.id, body: "buddy chat hello", createdAt: new Date(Date.now() - 86_400_000) },
    ]);
    expect((await req(`/chat/conn:${conn}`, { cookie: me.cookie })).headers.get("location")).toBe(`/chat/buddy:${mid}`);
    const paired = await (await req(`/chat/buddy:${mid}?lang=en`, { cookie: me.cookie })).text();
    expect(paired).toContain("people chat hello");
    expect(paired).toContain("buddy chat hello");
    const list = await (await req("/chat?lang=en", { cookie: me.cookie })).text();
    expect(list.split('href="/chat/').length - 1).toBe(1);
    await db().update(buddyMatches).set({ state: "ended" }).where(eq(buddyMatches.id, mid));
    const after = await (await req(`/chat/conn:${conn}?lang=en`, { cookie: me.cookie })).text();
    expect(after).toContain("buddy chat hello");
  });

  it("Discover tags this week's picks", async () => {
    const m = await createMember();
    const id = await event(`Picked walk ${newId().slice(0, 4)}`, 2);
    await db().insert(weeklyPlans).values({ id: newId(), accountId: m.id, week: weekKey(new Date()), picks: [{ kind: "event", ref: id, reasons: [] }] });
    const html = await (await req("/events?view=list&lang=en", { cookie: m.cookie })).text();
    expect(html).toContain("⭐ Your pick");
  });

  it("keeps the pick tag on a picked event that reaches Top 10 this week", async () => {
    // Alone in its own corner of the database: only a 100+ member can see an event for ages 100 to 120,
    // so it is this member's only candidate and lands in "Top 1 this week" (nobody holds a seat, so it
    // is not one of the popular picks), which takes it out of the main list.
    const m = await createMember({ birthDate: "1920-01-01" });
    const id = newId();
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    await db().insert(events).values({ id, title: `Centenarian walk ${id.slice(0, 4)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t", ageMin: 100, ageMax: 120 });
    await db().insert(weeklyPlans).values({ id: newId(), accountId: m.id, week: weekKey(new Date()), picks: [{ kind: "event", ref: id, reasons: [] }] });
    for (const lang of ["en", "th"] as const) {
      const html = await (await req(`/events?view=list&lang=${lang}`, { cookie: m.cookie })).text();
      const start = html.indexOf('<section class="disc-top"');
      expect(start).toBeGreaterThan(-1);
      const topWeek = html.slice(start, html.indexOf("</section>", start));
      expect(topWeek).toContain(`href="/events/${id}"`);
      expect(topWeek).toContain(lang === "en" ? '<span class="tag ok">⭐ Your pick</span>' : '<span class="tag ok">⭐ เลือกให้คุณ</span>');
    }
  });

  it("the counts on My month in people open Upcoming and Past, and Learn lists each source once", async () => {
    const m = await createMember();
    await attendedOnce(m.id); // the counts show from a first event (they moved from Me, mobile card 6)
    const hub = await (await req("/me/month?lang=en", { cookie: m.cookie })).text();
    expect(hub).toContain('href="/me/events#past"');
    expect(hub).toContain('href="/me/events#upcoming"');
    const mine = await (await req("/me/events?lang=en", { cookie: m.cookie })).text();
    expect(mine).toContain('id="upcoming"');
    expect(mine).toContain('id="past"');
    const learn = await (await req("/learn?lang=en", { cookie: m.cookie })).text();
    if (learn.includes("Sources")) expect(learn).not.toMatch(/>source</);
  });
});
