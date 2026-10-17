/**
 * Unread chats first on My people (owner card 5, 2026-10-17): only with unread
 * chats, a "New messages" group at the top holds up to 3 rows (the chat list's
 * own row and avatar) that open the thread, then "All chats". Finite, quiet.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { chatMessages, chatReads, connections, notifications } from "../src/schema";
import { newId } from "../src/lib/crypto";

const group = (html: string) => {
  const i = html.indexOf('<section class="people-new"');
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i));
};

async function friendWhoWrote(me: Member, n: number, read = false) {
  const other = await createMember({ nickname: `Pal${n}` });
  const [x, y] = me.id < other.id ? [me.id, other.id] : [other.id, me.id];
  const cid = newId();
  await db().insert(connections).values({ id: cid, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
  const key = `conn:${cid}`;
  await db().insert(chatMessages).values([
    { id: newId(), thread: key, sender: other.id, body: `First from ${n}`, createdAt: new Date(Date.now() - 120_000 + n) },
    { id: newId(), thread: key, sender: other.id, body: `Hello from ${n}`, createdAt: new Date(Date.now() - 60_000 + n) },
  ]);
  // What POST /chat/:thread leaves for the other person; opening the chat marks both read.
  if (read) await db().insert(chatReads).values({ thread: key, accountId: me.id, lastReadAt: new Date() });
  else await db().insert(notifications).values({ id: newId(), accountId: me.id, kind: "chat", titleTh: "มีข้อความใหม่", titleEn: "New message", link: `/chat/${key}`, createdAt: new Date(Date.now() - 60_000) });
  return key;
}

describe.skipIf(!HAS_DB)("My people: new messages first", () => {
  it("with unread chats, a group at the top with rows that open the thread and an All chats link", async () => {
    const me = await createMember();
    const key = await friendWhoWrote(me, 1);
    const html = await (await req("/connections?lang=en", { cookie: me.cookie })).text();
    const g = group(html);
    expect(g).toContain("New messages");
    expect(g).toContain(`href="/chat/${key}"`);
    expect(g).toContain("Hello from 1");
    expect(g).toContain('class="chat-av"');
    // The unread count on the row, in words for a screen reader too.
    expect(g).toMatch(/class="unread-badge"[^>]*>2<span class="sr-only"> new messages<\/span>/);
    expect(g).toContain('<a class="people-new-all" href="/chat">All chats');
    // At the top: before the people list.
    expect(html.indexOf('<section class="people-new"')).toBeLessThan(html.indexOf('class="glist people-list"'));
    const th = await (await req("/connections?lang=th", { cookie: me.cookie })).text();
    expect(group(th)).toContain("ข้อความใหม่");
    expect(group(th)).toContain("แชตทั้งหมด");
  });

  it("caps at 3 rows", async () => {
    const me = await createMember();
    for (const n of [1, 2, 3, 4]) await friendWhoWrote(me, n);
    const g = group(await (await req("/connections?lang=en", { cookie: me.cookie })).text());
    expect(g.match(/href="\/chat\/conn:/g)).toHaveLength(3);
  });

  it("no group when every chat is read", async () => {
    const me = await createMember();
    await friendWhoWrote(me, 1, true);
    const html = await (await req("/connections?lang=en", { cookie: me.cookie })).text();
    expect(html).not.toContain('<section class="people-new"');
    expect(html).toContain('class="glist people-list"');
  });
});
