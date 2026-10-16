/**
 * Clearer unread: one style everywhere, counts in the accessible names, and
 * a chat is read when it is opened. Chats count on My people (the tab and the
 * Chats chip), not on the bell, so a message is never counted twice.
 */
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { chatMessages, connections, notifications } from "../src/schema";
import { newId } from "../src/lib/crypto";

async function chatWithMessage() {
  const [a, b] = await Promise.all([createMember({ nickname: "Ann" }), createMember({ nickname: "Bee" })]);
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const cid = newId();
  await db().insert(connections).values({ id: cid, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
  const key = `conn:${cid}`;
  const at = new Date(Date.now() - 60_000);
  await db().insert(chatMessages).values({ id: newId(), thread: key, sender: b.id, body: "See you Sunday?", createdAt: at });
  // What POST /chat/:thread leaves for the other person (written directly so quiet hours can't delay it).
  await db().insert(notifications).values({ id: newId(), accountId: a.id, kind: "chat", titleTh: "มีข้อความใหม่", titleEn: "New message", link: `/chat/${key}`, createdAt: at });
  return { a, b, key };
}

describe.skipIf(!HAS_DB)("clearer unread", () => {
  it("counts unread chats on the My people tab and the Chats chip, with the count in the name", async () => {
    const { a } = await chatWithMessage();
    await db().insert(notifications).values({ id: newId(), accountId: a.id, kind: "rsvp", titleTh: "ยืนยันแล้ว", titleEn: "You're in", link: "/me/events" });
    const en = await (await req("/events?view=list", { cookie: `${a.cookie}; lang=en` })).text();
    expect(en).toContain('aria-label="My people, 1 unread chat"');
    expect(en).toContain('<span class="unread-badge tab-badge" aria-hidden="true">1</span>');
    // The bell counts the RSVP only: the message is counted once, under Chats.
    expect(en).toContain('aria-label="Notifications, 1 unread"');
    const th = await (await req("/events?view=list", { cookie: `${a.cookie}; lang=th` })).text();
    expect(th).toContain('aria-label="คนรู้จัก แชตยังไม่ได้อ่าน 1"');
    expect(th).toContain('aria-label="การแจ้งเตือน ยังไม่ได้อ่าน 1"');
    const people = await (await req("/connections", { cookie: `${a.cookie}; lang=en` })).text();
    expect(people).toContain('aria-label="Chats, 1 unread"');
  });

  it("the chat list marks the unread chat with the same pill and says how many", async () => {
    const { a } = await chatWithMessage();
    const html = await (await req("/chat", { cookie: `${a.cookie}; lang=en` })).text();
    expect(html).toContain('class="unread"');
    expect(html).toContain('<b class="unread-badge unread-new">New</b>');
    expect(html).toContain("1 unread chat");
  });

  it("the bell neither lists nor clears a chat's message", async () => {
    const { a } = await chatWithMessage();
    const panel = await (await req("/notifications/panel", { cookie: `${a.cookie}; lang=en` })).text();
    expect(panel).not.toContain("New message");
    await req("/notifications", { cookie: a.cookie });
    const waiting = await db().select().from(notifications).where(and(eq(notifications.accountId, a.id), eq(notifications.kind, "chat"), isNull(notifications.readAt)));
    expect(waiting).toHaveLength(1);
  });

  it("opening the chat reads it: the count goes on that very page and stays gone", async () => {
    const { a, key } = await chatWithMessage();
    const open = await (await req(`/chat/${key}`, { cookie: `${a.cookie}; lang=en` })).text();
    expect(open).toContain("See you Sunday?");
    expect(open).not.toContain('class="unread-badge tab-badge"');
    const waiting = await db().select().from(notifications).where(and(eq(notifications.accountId, a.id), eq(notifications.kind, "chat"), isNull(notifications.readAt)));
    expect(waiting).toHaveLength(0);
    const list = await (await req("/chat", { cookie: `${a.cookie}; lang=en` })).text();
    expect(list).not.toContain('class="unread"');
    expect(list).not.toContain("unread chat");
    const page = await (await req("/events?view=list", { cookie: `${a.cookie}; lang=en` })).text();
    expect(page).not.toContain("unread chat");
  });
});
