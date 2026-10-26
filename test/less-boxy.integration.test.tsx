/**
 * Less boxy (owner decisions, 2026-10-16): repeated items are rows of one
 * grouped list (ul/li, hairlines between rows) instead of a card each.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { chatMessages, connections, events, notifications, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { IcebreakerCard } from "../src/ui/icebreakers";
import { PROFILE_CSS } from "../src/ui/profile-card";
import { Notice } from "../src/ui/kit";
import { SHEET_JS, SHEET_PLACE_JS } from "../src/ui/sheet";

const v = { lang: "en" as const, t: (_th: string, en: string) => en, user: null, path: "/" };
const rule = (css: string, sel: string) => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)) + 1);

const HOUR = 3_600_000;

describe("grouped lists: the shared style", () => {
  it("one rounded group with an edge, rows split by an inset hairline, nothing clipped", () => {
    expect(A11Y_CSS).toContain(".glist{list-style:none;");
    expect(A11Y_CSS).toMatch(/\.glist\{[^}]*border:1px solid var\(--line\)[^}]*border-radius:16px/);
    expect(A11Y_CSS).toMatch(/\.glist>\*\+\*::before\{[^}]*left:var\(--glist-inset,16px\)[^}]*height:1px/);
    // A ⋯ popover inside a row must never be cut off by the group.
    expect(A11Y_CSS).not.toMatch(/\.glist\{[^}]*overflow:hidden/);
  });
});

describe("open sections", () => {
  it("a read-only section is open on the page with a thin line above it, no card surface or shadow", () => {
    const open = rule(A11Y_CSS, ".open-sec{");
    expect(open).toContain("border-top:1px solid var(--line)");
    expect(open).toContain("background:none");
    expect(open).toContain("box-shadow:none");
    expect(String(<IcebreakerCard v={v} eventId="ev-1" />)).toContain('<section class="open-sec icebreakers"');
  });

  it("profile sections and prompt answers are open too", () => {
    for (const sel of [".pc-sec{", ".pc-card{"]) {
      const r = rule(PROFILE_CSS, sel);
      expect(r, sel).toContain("border-top:1px solid var(--line)");
      expect(r, sel).not.toMatch(/background|box-shadow|border-radius/);
    }
    expect(rule(PROFILE_CSS, ".pc-dating{")).not.toContain("background");
  });
});

describe("no boxes inside boxes", () => {
  it("fact tiles, icebreakers and info notes have no tinted tile behind them", () => {
    expect(rule(A11Y_CSS, ".fact-tile{position:relative")).toContain("background:none");
    expect(A11Y_CSS).not.toContain(".type-facts .fact-tile{background");
    expect(rule(A11Y_CSS, ".ice-list li{padding")).toContain("background:none");
    expect(rule(A11Y_CSS, ".notice.info{")).toContain("background:none");
  });

  it("an info note is one line led by an icon; status notes keep their plain text", () => {
    expect(String(<Notice>Draft</Notice>)).toBe('<div class="notice info" role="status"><span class="notice-ico" aria-hidden="true">ℹ️</span><span class="notice-text">Draft</span></div>');
    expect(String(<Notice icon="🔒">Private</Notice>)).toContain('<span class="notice-ico" aria-hidden="true">🔒</span><span class="notice-text">Private</span>');
    expect(String(<Notice kind="error">Oops</Notice>)).toBe('<div class="notice error" role="alert">Oops</div>');
  });
});

describe("flat surfaces", () => {
  it("cards keep a 1px soft line and 16px corners, and no drop shadow, hover included", () => {
    expect(A11Y_CSS).toContain(":root{--radius:16px}");
    expect(A11Y_CSS).toMatch(/\.card,\.card\.hero,\.ticket,[^{]*\{box-shadow:none\}/);
    expect(A11Y_CSS).toContain(".card{border:1px solid var(--line)}");
    expect(rule(A11Y_CSS, ".card.link:hover,a.card:hover{")).toContain("box-shadow:none!important");
    expect(rule(A11Y_CSS, ".card.me-next{")).toContain("box-shadow:none");
  });
});

describe("the ⋯ popover on laptops never runs past the screen", () => {
  type Rect = { top: number; bottom: number; left: number; right: number };
  type Placed = { left: number; top: number; maxHeight: number; up: boolean };
  const place = new Function(`${SHEET_PLACE_JS};return sheetPlace`)() as (s: Rect, w: number, h: number, W: number, H: number, start: boolean) => Placed;
  const at = (top: number): Rect => ({ top, bottom: top + 44, left: 1000, right: 1044 });
  const inside = (x: Placed, h: number, H: number) => {
    const shown = Math.min(h, x.maxHeight);
    expect(x.top).toBeGreaterThanOrEqual(8);
    expect(x.top + shown).toBeLessThanOrEqual(H - 8);
  };

  it("opens below, at full height, when it fits", () => {
    const x = place(at(80), 300, 400, 1280, 900, false);
    expect(x).toMatchObject({ up: false, top: 130 });
    expect(x.maxHeight).toBeGreaterThanOrEqual(400);
    inside(x, 400, 900);
  });

  it("flips above when there is more room there, capped to that room", () => {
    const x = place(at(620), 300, 560, 1280, 700, false);
    expect(x.up).toBe(true);
    expect(x.top).toBe(620 - 6 - 560);
    inside(x, 560, 700);
    // Contact shared plus four links in a short window: taller than either side, so it scrolls inside.
    const y = place(at(330), 300, 900, 1280, 700, false);
    expect(y.maxHeight).toBe(330 - 6 - 8);
    expect(y.top).toBe(8);
    inside(y, 900, 700);
  });

  it("stays below and capped when below has more room, and keeps 8px from the side edges", () => {
    const x = place(at(200), 360, 900, 1280, 700, false);
    expect(x).toMatchObject({ up: false, top: 250, maxHeight: 700 - 250 - 8 });
    inside(x, 900, 700);
    expect(place({ top: 100, bottom: 144, left: 1250, right: 1294 }, 360, 200, 1280, 700, true).left).toBe(1280 - 360 - 8);
    expect(place({ top: 100, bottom: 144, left: 0, right: 44 }, 360, 200, 1280, 700, false).left).toBe(8);
  });

  it("the sheet script uses it and clears the cap when the sheet closes or becomes a bottom sheet", () => {
    expect(SHEET_JS).toContain("function sheetPlace(");
    expect(SHEET_JS).toContain('p.style.maxHeight=x.maxHeight+"px"');
    expect(SHEET_JS).toContain('p.style.maxHeight="";p.style.left="";p.style.top=""');
  });
});

describe.skipIf(!HAS_DB)("grouped lists on member pages", () => {
  it("Me: each settings group is one list of rows, the hint shown under the title", async () => {
    const m = await createMember();
    const html = await (await req("/settings?lang=en", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain('<ul class="glist me-list">');
    expect(html).toMatch(/<li><a href="\/learn" class="me-row">[\s\S]*?<strong>Learn<\/strong><small>Friends, wellbeing, getting around<\/small>/);
    expect(html).toContain('<div class="glist quick-list">');
  });

  it("My events: upcoming tables are rows of one list, past events too", async () => {
    const m = await createMember();
    const up = newId();
    const past = newId();
    const now = Date.now();
    await db()
      .insert(events)
      .values([
        { id: up, title: "Up soon", startsAt: new Date(now + 48 * HOUR), endsAt: new Date(now + 51 * HOUR), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" },
        { id: past, title: "Went before", startsAt: new Date(now - 240 * HOUR), endsAt: new Date(now - 237 * HOUR), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" },
      ]);
    await db()
      .insert(registrations)
      .values([
        { id: newId(), eventId: up, accountId: m.id, status: "confirmed", passToken: randomToken(18) },
        { id: newId(), eventId: past, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(now - 239 * HOUR) },
      ]);
    const html = await (await req("/me/events?lang=en", { cookie: `${m.cookie}; lang=en` })).text();
    const list = html.indexOf('<ul class="glist up-rows">');
    expect(list).toBeGreaterThan(0);
    const row = html.indexOf('<li class="up-row">', list);
    expect(row).toBeGreaterThan(list);
    expect(html.slice(row, html.indexOf("</li>", row))).toContain("Up soon");
    expect(html).toContain('<ul class="glist past-rows">');
  });

  it("Chats: one list, the unread row keeps its dot", async () => {
    const [a, b] = await Promise.all([createMember({ nickname: "Ann" }), createMember({ nickname: "Bee" })]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const cid = newId();
    await db().insert(connections).values({ id: cid, aAccount: x, bAccount: y, level: "friend", eventId: newId() });
    await db().insert(chatMessages).values({ id: newId(), thread: `conn:${cid}`, sender: b.id, body: "See you Sunday?" });
    const html = await (await req("/chat", { cookie: `${a.cookie}; lang=en` })).text();
    expect(html).toMatch(/<ul class="glist chat-list"><li><a href="\/chat\/conn:[^"]+" class="unread">[\s\S]*?See you Sunday\?[\s\S]*?class="unread-dot chat-dot"/);
  });

  it("Notifications: one list per day", async () => {
    const m = await createMember();
    await db().insert(notifications).values({ id: newId(), accountId: m.id, kind: "test", titleTh: "ทดสอบ", titleEn: "Test note", link: "/events" });
    const html = await (await req("/notifications?lang=en", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toMatch(/<ul class="glist notif-list notif-page"><li class="unread"><a href="\/events">[\s\S]*?Test note/);
  });
});
