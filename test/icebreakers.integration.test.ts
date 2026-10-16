/**
 * Curated icebreakers on the event page (confirmed attendees, from a few days
 * before until the end) and in a hangout's group chat as tap-to-send rows.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { chatMessages, events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { icebreakersFor } from "../src/content/icebreakers";

const DAY = 86_400_000;

async function mkEvent(hostId: string, startsIn: number, visibility: "public" | "private" = "public") {
  const id = newId();
  const startsAt = new Date(Date.now() + startsIn);
  await db()
    .insert(events)
    .values({ id, title: `ICE-${id.slice(0, 6)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3_600_000), venueName: "Lumphini Park", district: "pathum_wan", capacity: 8, status: "published", createdBy: hostId, hostAccountId: hostId, visibility, privateToken: visibility === "private" ? randomToken(12) : null });
  return id;
}
const reg = (eventId: string, accountId: string) => db().insert(registrations).values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(18) });

describe.skipIf(!HAS_DB)("curated icebreakers", () => {
  it("the event page shows this event's three to confirmed attendees in the days before", async () => {
    const host = await createMember();
    const [going, looking] = await Promise.all([createMember(), createMember()]);
    const id = await mkEvent(host.id, 2 * DAY);
    await reg(id, going.id);
    const html = await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=en` })).text();
    expect(html).toContain("Icebreakers for your table");
    for (const x of icebreakersFor(id)) expect(html).toContain(x.en.replace(/'/g, "&#39;"));
    const th = await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=th` })).text();
    expect(th).toContain("คำถามชวนคุยสำหรับโต๊ะนี้");
    expect(th).toContain(icebreakersFor(id)[0].th);
    // Not for someone who hasn't booked.
    const other = await (await req(`/events/${id}`, { cookie: `${looking.cookie}; lang=en` })).text();
    expect(other).not.toContain("Icebreakers for your table");
  });

  it("waits until a few days before", async () => {
    const host = await createMember();
    const m = await createMember();
    const id = await mkEvent(host.id, 10 * DAY);
    await reg(id, m.id);
    const html = await (await req(`/events/${id}`, { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).not.toContain("Icebreakers for your table");
  });

  it("a hangout's group chat offers them as one-tap sends", async () => {
    const host = await createMember();
    const m = await createMember();
    const id = await mkEvent(host.id, DAY, "private");
    await reg(id, m.id);
    const key = `circle:${id}`;
    const html = await (await req(`/chat/${key}`, { cookie: `${m.cookie}; lang=en` })).text();
    // Inside the composer's + Sheet (B3), open there.
    expect(html).toContain('class="how chat-ice" open');
    expect(html.indexOf("chat-plus")).toBeGreaterThan(0);
    expect(html.indexOf("chat-plus")).toBeLessThan(html.indexOf("chat-ice"));
    const first = icebreakersFor(id)[0];
    expect(html).toContain(`<button name="body" value="${first.en.replace(/'/g, "&#39;")}">`);
    // The profile-prompt starters step aside so there's one set of suggestions.
    expect(html).not.toContain("data-starter=");
    const sent = await req(`/chat/${key}`, { cookie: m.cookie, form: { body: first.en } });
    expect(sent.status).toBe(302);
    const rows = await db().select().from(chatMessages).where(and(eq(chatMessages.thread, key), eq(chatMessages.sender, m.id)));
    expect(rows.map((r) => r.body)).toEqual([first.en]);
    // The event page points to the group chat.
    const page = await (await req(`/events/${id}`, { cookie: `${m.cookie}; lang=en` })).text();
    expect(page).toContain(`href="/chat/${key}"`);
  });
});
