/**
 * Mobile follow-ups (owner, 2026-10-26 via Main): the chat list shows a dot
 * per unread chat and no counts on screen, Me gets its avatar and the
 * district back in its line, and the tab bar shows icons only at large text.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import app from "../src/index";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import { chatMessages, connections, profiles } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { meLine } from "../src/ui/me-hub";
import { A11Y_CSS } from "../src/ui/a11y-css";

/** Me's header: from the greeting block to its end. */
function meHead(html: string): string {
  const i = html.indexOf('<header class="me-head"');
  return i < 0 ? "" : html.slice(i, html.indexOf("</header>", i));
}

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

describe("Me's line: the district first", () => {
  // 5 October 2025, 10:00 in Bangkok.
  const since = new Date("2025-10-05T03:00:00Z");

  it("puts the district's display name first, then since when and the tables", () => {
    expect(meLine("th", since, 3, "พญาไท")).toBe("พญาไท · อยู่กับเจอกันตั้งแต่ ต.ค. 2568 · โต๊ะประจำ 3 โต๊ะ");
    expect(meLine("en", since, 3, "Phaya Thai")).toBe("Phaya Thai · With Jurrgun since Oct 2025 · 3 Regular Tables");
  });

  it("leaves the district out when it isn't set, and keeps the 0 and 1 table rules", () => {
    expect(meLine("en", since, 1, null)).toBe("With Jurrgun since Oct 2025 · 1 Regular Table");
    expect(meLine("th", since, 0, "")).toBe("อยู่กับเจอกันตั้งแต่ ต.ค. 2568");
    expect(meLine("en", since, 0, "Phaya Thai")).toBe("Phaya Thai · With Jurrgun since Oct 2025");
    expect(meLine("en", null, 0, "Phaya Thai")).toBe("Phaya Thai");
  });
});

describe.skipIf(!HAS_DB)("Me page: the avatar, the district and no New to Bangkok sticker", () => {
  it("shows the district first in the line, each part whole, with a decorative 40px avatar beside it", async () => {
    const m = await createMember({ nickname: "Fon", district: "phaya_thai" });
    await db().update(profiles).set({ newcomer: true }).where(eq(profiles.accountId, m.id));
    const th = meHead(await (await req("/settings", { cookie: `${m.cookie}; lang=th` })).text());
    expect(th).toMatch(/<p class="me-line"><span>พญาไท<\/span> · <span>อยู่กับเจอกันตั้งแต่ [^<]+ 25\d\d<\/span><\/p>/);
    // No photo: the coloured initial, hidden from screen readers (the greeting says the name).
    expect(th).toMatch(/<span class="me-av" aria-hidden="true"><span class="avstack" style="--av:40px">/);
    expect(th.indexOf('class="me-av"')).toBeLessThan(th.indexOf('class="me-hi"'));
    const en = await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text();
    expect(meHead(en)).toContain("<span>Phaya Thai</span> · <span>With Jurrgun since");
    expect(en).not.toContain("New to Bangkok");
    expect(en).not.toContain('class="me-sticker"');
    expect(th).not.toContain("มาใหม่ในกรุงเทพ");
  });

  it("with a photo, the avatar is an image with empty alt", async () => {
    const m = await createMember({ nickname: "Pim" });
    await db().update(profiles).set({ photoKey: `uploads/${m.id}/main.jpg` }).where(eq(profiles.accountId, m.id));
    // Locally (no signer) a bucket makes photoSrc() serve the member-only photo route.
    const res = await app.request("/settings", { headers: { cookie: `${m.cookie}; lang=en` } }, { ...ENV, BUCKET: {} });
    const head = meHead(await res.text());
    expect(head).toContain('<img class="me-av" src="/settings/photo" alt="" width="40" height="40"');
  });

  it("no district in the line when it isn't set", async () => {
    const m = await createMember({ nickname: "Nok", district: "" });
    const head = meHead(await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text());
    expect(head).toMatch(/<p class="me-line"><span>With Jurrgun since [A-Z][a-z]{2} \d{4}<\/span><\/p>/);
    expect(head).toContain('class="me-av"');
  });
});

describe("tab bar above 150% text: icons only", () => {
  /** The rules inside the tab bar's container query. */
  const block = (() => {
    const i = A11Y_CSS.indexOf("@container tabbar (width < 12rem){");
    return i < 0 ? "" : A11Y_CSS.slice(i, A11Y_CSS.indexOf("\n}", i));
  })();

  it("the bar is a named container and the query is in rem", () => {
    expect(A11Y_CSS).toContain(".tabbar{container:tabbar/inline-size}");
    expect(block).not.toBe("");
  });

  it("hides every label but the current tab's visually, never with display:none, and keeps 44px targets", () => {
    expect(block).toContain(".tabbar a:not(.on)>span.tab-label{position:absolute;width:1px;height:1px;");
    expect(block).toContain("clip-path:inset(50%)");
    expect(block).not.toContain("display:none");
    expect(block).not.toMatch(/\.tabbar a\.on>span\.tab-label\{[^}]*(position:absolute|clip)/);
    expect(block).toContain(".tabbar a{min-width:44px}");
  });
});

describe.skipIf(!HAS_DB)("tab bar: each label is the tab's accessible name", () => {
  it("puts each label in its own span inside the link, not hidden from screen readers", async () => {
    const m = await createMember();
    const html = await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text();
    const bar = html.slice(html.indexOf('<nav class="tabbar"'), html.indexOf("</nav>", html.indexOf('<nav class="tabbar"')));
    for (const label of ["Discover", "Buddy", "My events", "My people", "Me"]) expect(bar).toContain(`<span class="tab-label">${label}</span>`);
    expect(bar).not.toMatch(/<span class="tab-label"[^>]*aria-hidden/);
    // The current tab is marked, so the large-text rule keeps its label in sight.
    expect(bar).toMatch(/<a href="\/settings" class="on" aria-current="page">[\s\S]*?<span class="tab-label">Me<\/span>/);
    const th = await (await req("/settings", { cookie: `${m.cookie}; lang=th` })).text();
    expect(th).toContain('<span class="tab-label">นัดของฉัน</span>');
  });
});
