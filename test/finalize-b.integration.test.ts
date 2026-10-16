/**
 * Finalize review B1, B3, B4 (owner, 2026-10-16): slim person cards with Chat
 * and one ⋯ Sheet, the chat composer in one row with Report behind a bubble's
 * ⋯, and Buddy's extras folded into one Sheet.
 */
import { describe, expect, it } from "vitest";
import { createMember, db, HAS_DB, req, type Member } from "./helpers";
import { newId } from "../src/lib/crypto";
import { buddyMatches, buddyOptins, chatMessages, connections, events, regularTableMembers, regularTables } from "../src/schema";

const DAY = 86_400_000;
const pair = (a: Member, b: Member) => (a.id < b.id ? [a.id, b.id] : [b.id, a.id]);

async function connected() {
  const [a, b] = await Promise.all([createMember(), createMember({ nickname: `Pal${newId().slice(0, 4)}` })]);
  const ev = newId();
  const startsAt = new Date(Date.now() - 3 * DAY);
  await db()
    .insert(events)
    .values({ id: ev, title: "Soi walk", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" });
  const [x, y] = pair(a, b);
  const id = newId();
  await db().insert(connections).values({ id, aAccount: x, bAccount: y, level: "friend", eventId: ev });
  return { a, b, id, ev };
}

describe.skipIf(!HAS_DB)("finalize review B", () => {
  it("a My people row is avatar, name, last met, Chat and one ⋯ holding thank-you, share contact, report, block and remove", async () => {
    const { a, b, id } = await connected();
    const html = await (await req("/connections?lang=en", { cookie: `${a.cookie}; lang=en` })).text();
    // One grouped list (owner, 2026-10-16), each person a row in it, not a card of their own.
    const list = html.indexOf('<ul class="glist people-list"');
    expect(list).toBeGreaterThan(0);
    const start = html.indexOf('<li class="person-row">', list);
    expect(start).toBeGreaterThan(list);
    expect(html).not.toContain("person-card");
    const card = html.slice(start, html.indexOf("</ul>", start));
    expect(card).toContain('<h2 class="pc-name">');
    expect(card).toContain("Last met at Soi walk");
    expect(card).toContain(`href="/chat/conn:${id}"`);
    // Everything else is inside the one Sheet, in this order.
    const at = card.indexOf('<details class="sheet"');
    const sheet = card.slice(at);
    expect(sheet).toContain("aria-label=\"More options for ");
    const order = [`/connections/${id}/thanks`, `/connections/${id}/share`, `/report?account=${b.id}`, `/block/${b.id}`, `/connections/${id}/remove`].map((x) => sheet.indexOf(x));
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    // Nothing of that on the card face.
    const face = card.slice(0, at);
    expect(face).not.toMatch(/\/thanks|\/share|\/report|\/block|\/remove/);
    expect(face).not.toContain("Also met at");
  });

  it("a share error reopens the Sheet with the message inside it", async () => {
    const { a, id } = await connected();
    const r = await req(`/connections/${id}/share`, { cookie: `${a.cookie}; lang=en`, form: { method: "line", value: "!!" } });
    expect(r.status).toBe(400);
    const html = await r.text();
    const at = html.lastIndexOf('<details class="sheet"', html.indexOf("Please enter a valid handle"));
    expect(at).toBeGreaterThan(0);
    expect(html.slice(at, at + 60)).toContain('open=""');
  });

  it("chat: + Sheet, the text field and Send in one row; Report sits in a bubble's ⋯ Sheet", async () => {
    const { a, b, id } = await connected();
    const [msg] = await db().insert(chatMessages).values({ id: newId(), thread: `conn:${id}`, sender: b.id, body: "See you Saturday?" }).returning();
    const html = await (await req(`/chat/conn:${id}?lang=en`, { cookie: `${a.cookie}; lang=en` })).text();
    const row = html.slice(html.indexOf('class="chat-compose"'));
    const plus = row.indexOf("chat-plus");
    const field = row.indexOf("<textarea");
    const send = row.indexOf(">Send<");
    expect(plus).toBeGreaterThan(0);
    expect(plus).toBeLessThan(field);
    expect(field).toBeLessThan(send);
    // Starters live in the + Sheet: with JS they fill the field, without JS they send.
    expect(row.slice(plus, field)).toContain("data-starter=");
    // The bubble: a long-press target, and Report is a form inside a Sheet, not a bare link.
    expect(html).toContain("data-sheet-hold");
    const rep = html.indexOf(`/chat/conn:${id}/report/${msg.id}`);
    expect(rep).toBeGreaterThan(0);
    expect(html.lastIndexOf('<details class="sheet', rep)).toBeGreaterThan(html.lastIndexOf("<li", rep));
    expect(html).toContain("Report this message");
    expect(html).not.toContain('class="linkish"');
  });

  it("a group chat names itself once", async () => {
    const host = await createMember();
    const me = await createMember();
    const tableId = newId();
    const name = `Runners ${newId().slice(0, 4)}`;
    await db().insert(regularTables).values({ id: tableId, hostAccountId: host.id, name, district: "bang_rak", joinToken: newId() });
    await db().insert(regularTableMembers).values({ id: newId(), tableId, accountId: me.id });
    const html = await (await req(`/chat/table:${tableId}?lang=en`, { cookie: `${me.cookie}; lang=en` })).text();
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main.split(name).length - 1).toBe(1);
    expect(main).toContain(`<h1>${name}</h1>`);
    expect(main).toContain(`href="/tables/${tableId}">Table page</a>`);
  });

  it("Buddy: Chat on the face; profile, stay safe, wrap up, settings, report and block in one Sheet", async () => {
    const [a, b] = await Promise.all([createMember(), createMember()]);
    const [x, y] = pair(a, b);
    const mid = newId();
    await db().insert(buddyOptins).values([a, b].map((m) => ({ accountId: m.id, intent: "friends", active: true, updatedAt: new Date() })));
    await db().insert(buddyMatches).values({ id: mid, aAccount: x, bAccount: y, week: "2026-W42", state: "active" });
    const html = await (await req("/buddy?lang=en", { cookie: `${a.cookie}; lang=en` })).text();
    const from = html.indexOf('class="pc-acts buddy-acts"');
    expect(from).toBeGreaterThan(0);
    const acts = html.slice(from);
    expect(acts.indexOf(`href="/chat/buddy:${mid}"`)).toBeLessThan(acts.indexOf('<details class="sheet'));
    const sheet = acts.slice(acts.indexOf('<details class="sheet'));
    for (const s of [`href="/people/${b.id}"`, "Stay safe", "Wrap up kindly", "Buddy settings", `/report?account=${b.id}`, `/block/${b.id}`]) expect(sheet, s).toContain(s);
    // Once on the page, and the safe-arrival card stays on the face after the Sheet.
    expect(html.split("Buddy settings").length - 1).toBe(1);
    expect(html.indexOf('class="row safe-arrival"')).toBeGreaterThan(html.indexOf("/block/", from));
    expect(html).not.toContain("⬜");
  });

  it("My events no longer carries the see-them-again card", async () => {
    const m = await createMember();
    expect(await (await req("/me/events?lang=en", { cookie: m.cookie })).text()).not.toContain('class="card see-again"');
  });
});
