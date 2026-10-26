/**
 * Mobile follow-ups (owner, 2026-10-26 via Main): the chat list shows a dot
 * per unread chat and no counts on screen, Me gets its avatar and the
 * district back in its line, and the tab bar shows icons only at large text.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { chatMessages, connections } from "../src/schema";
import { newId } from "../src/lib/crypto";

/** A friend chat in which the other person wrote `n` messages that `a` has not read. */
async function unreadChat(n: number) {
  const [a, b] = await Promise.all([createMember({ nickname: "Ann" }), createMember({ nickname: "Bee" })]);
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const cid = newId();
  await db().insert(connections).values({ id: cid, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
  const key = `conn:${cid}`;
  await db()
    .insert(chatMessages)
    .values(Array.from({ length: n }, (_, i) => ({ id: newId(), thread: key, sender: b.id, body: `Message ${i + 1}`, createdAt: new Date(Date.now() - 60_000 + i) })));
  return { a, key };
}

/** The chat row that opens `key`. */
function row(html: string, key: string): string {
  const i = html.indexOf(`<a href="/chat/${key}"`);
  return i < 0 ? "" : html.slice(i, html.indexOf("</a>", i));
}

describe.skipIf(!HAS_DB)("chat list: a dot per unread chat, the counts for screen readers only", () => {
  it("shows a dot and no number pill, with the count in the row's accessible name", async () => {
    const { a, key } = await unreadChat(3);
    const en = await (await req("/chat", { cookie: `${a.cookie}; lang=en` })).text();
    const r = row(en, key);
    expect(r).toContain('<span class="unread-dot chat-dot" aria-hidden="true"></span>');
    expect(r).toContain('<span class="sr-only">, 3 unread</span>');
    expect(r).not.toContain("unread-badge");
    expect(r).not.toMatch(/>3</);
    const th = await (await req("/chat", { cookie: `${a.cookie}; lang=th` })).text();
    expect(row(th, key)).toContain('<span class="sr-only"> ยังไม่อ่าน 3 ข้อความ</span>');
  });

  it("has no visible unread line, only a visually hidden total", async () => {
    const { a } = await unreadChat(1);
    const en = await (await req("/chat", { cookie: `${a.cookie}; lang=en` })).text();
    expect(en).not.toContain('class="unread-sum"');
    expect(en).toContain('<p class="sr-only">1 unread chat</p>');
    const th = await (await req("/chat", { cookie: `${a.cookie}; lang=th` })).text();
    expect(th).toContain('<p class="sr-only">ยังไม่ได้อ่าน 1 แชต</p>');
  });

  it("no dot and no total once the chat is read", async () => {
    const { a, key } = await unreadChat(1);
    await req(`/chat/${key}`, { cookie: `${a.cookie}; lang=en` });
    const en = await (await req("/chat", { cookie: `${a.cookie}; lang=en` })).text();
    expect(row(en, key)).not.toContain("unread-dot");
    expect(en).not.toContain("unread chat");
  });
});
