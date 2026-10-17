/**
 * Chats list (owner card, 2026-10-17): a one-to-one chat shows the other
 * person's photo or My people's coloured initial; a hangout chat shows its
 * category emoji; Bangkok Buddy keeps 🤝. Rows stay 44px+ with unread styling.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { chatMessages, connections, events, profiles, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const HOUR = 3_600_000;
const row = (html: string, key: string) => {
  const i = html.indexOf(`href="/chat/${key}"`);
  return i < 0 ? "" : html.slice(i, html.indexOf("</li>", i));
};

async function connect(a: string, b: string) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const id = newId();
  await db().insert(connections).values({ id, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
  return `conn:${id}`;
}

describe.skipIf(!HAS_DB)("chats list: who it's with, at a glance", () => {
  it("one-to-one: the coloured initial avatar without a photo, the photo when there is one", async () => {
    const [me, bee, cat] = await Promise.all([createMember({ nickname: "Ann" }), createMember({ nickname: "Bee" }), createMember({ nickname: "Cat" })]);
    const toBee = await connect(me.id, bee.id);
    const toCat = await connect(me.id, cat.id);
    await db().update(profiles).set({ photoKey: `uploads/${cat.id}/main.jpg` }).where(eq(profiles.accountId, cat.id));
    await db().insert(chatMessages).values({ id: newId(), thread: toBee, sender: bee.id, body: "Sunday?" });
    const html = await (await req("/chat?lang=en", { cookie: me.cookie })).text();
    const b = row(html, toBee);
    expect(b).toContain('<span class="chat-av" aria-hidden="true"><span class="avstack"');
    expect(b).toMatch(/class="av"[^>]*>B<\/span>/);
    expect(b).not.toContain("💬");
    // Unread styling stays.
    expect(b).toContain('class="unread"');
    const c = row(html, toCat);
    expect(c).toContain(`<img class="chat-av" src="/people/${cat.id}/photo/main" alt=""`);
  });

  it("a hangout chat shows its category emoji", async () => {
    const [me, host] = await Promise.all([createMember(), createMember()]);
    const ev = newId();
    const startsAt = new Date(Date.now() + 24 * HOUR);
    await db()
      .insert(events)
      .values({ id: ev, title: "Noodles", startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Soi 38", district: "khlong_toei", capacity: 6, status: "published", visibility: "private", tags: ["food"], hostAccountId: host.id, createdBy: host.id });
    await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: me.id, status: "confirmed", passToken: randomToken(18) });
    const html = await (await req("/chat?lang=en", { cookie: me.cookie })).text();
    const r = row(html, `circle:${ev}`);
    expect(r).toContain('<b aria-hidden="true">🍜</b>');
    expect(r).not.toContain("👥");
  });
});
