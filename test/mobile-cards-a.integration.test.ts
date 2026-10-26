/**
 * Mobile cards A (owner, 2026-10-26 via Main): the top bar fits from 360px
 * (card 1), 48px primary actions (card 4), no counts (card 5), the Me line
 * (card 6) and the day-of status words (card 9).
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import { events, notifications, profiles } from "../src/schema";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { newId } from "../src/lib/crypto";
import { tr } from "../src/lib/i18n";
import { bangkokDay, eventIdOfLink, urgentForToday } from "../src/domain/digest";
import { bellLabel } from "../src/ui/notif-menu";
import { meLine } from "../src/ui/me-hub";
import { DayStatusLine } from "../src/ui/day-of";
import { DAY_STATUSES, DAY_STATUS_TEXT } from "../src/domain/day-of";

/** A published event starting at `startsAt`; returns its id. */
async function eventAt(startsAt: Date): Promise<string> {
  const id = newId();
  await db().insert(events).values({ id, title: `EV-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3_600_000), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
  return id;
}

async function unread(accountId: string, kind: string, link: string) {
  await db().insert(notifications).values({ id: newId(), accountId, kind, titleTh: "อัปเดต", titleEn: "Update", link, createdAt: new Date(Date.now() - 60_000) });
}

/** The accessibility menu's markup: from its <details> to the end of its panel. */
function a11yMenu(html: string): string {
  const start = html.indexOf('<details class="a11y');
  return html.slice(start, html.indexOf("</details>", start));
}

describe.skipIf(!HAS_DB)("card 1: the language switch and City Pulse in the top bar", () => {
  it("on member pages the switch is a globe row in the accessibility menu, not a chip in the bar", async () => {
    const m = await createMember();
    const th = await (await req("/settings", { cookie: `${m.cookie}; lang=th` })).text();
    const menu = a11yMenu(th);
    expect(menu).toContain('class="a11y-row a11y-lang" href="/lang/en?back=%2Fsettings"');
    expect(menu).toContain('class="a11y-lang-ico"');
    expect(menu).toMatch(/ภาษา<small>เปลี่ยนเป็นภาษาอังกฤษ<\/small><\/span><b lang="en">English<\/b>/);
    expect(th).not.toContain('class="chip lang-chip"');
    const en = await (await req("/events?view=list", { cookie: `${m.cookie}; lang=en` })).text();
    expect(a11yMenu(en)).toMatch(/Language<small>Switch to Thai<\/small><\/span><b lang="th">ไทย<\/b>/);
    expect(en).not.toContain('class="chip lang-chip"');
  });

  it("keeps the switch in sight on the landing page and in onboarding, and out of their menu", async () => {
    const landing = await (await req("/?lang=en", { cookie: "jg_intro=seen" })).text();
    expect(landing).toContain('<a href="/lang/th?back=%2F" class="chip lang-chip" lang="th">ไทย</a>');
    expect(a11yMenu(landing)).not.toContain("a11y-lang");
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const first = await (await req("/onboarding/basics", { cookie: `${m.cookie}; lang=th` })).text();
    expect(first).toContain('class="chip lang-chip" lang="en">EN</a>');
    expect(a11yMenu(first)).not.toContain("a11y-lang");
  });

  it("City Pulse keeps its name beside a small Prototype tag", async () => {
    const m = await createMember();
    const html = await (await req("/settings", { cookie: `${m.cookie}; lang=th` })).text();
    expect(html).toMatch(/<summary><span class="proto-tag">ทดลอง<\/span><\/summary>/);
    expect(html).toMatch(/class="pulse-btn"[^>]*><svg[\s\S]*?<\/svg><span>City Pulse<\/span><\/a>/);
    // From 360px the name shows again (the 2026-10-26 polish hid it up to 420px).
    expect(A11Y_CSS).toContain("@media (min-width:360px) and (max-width:480px){\n  .pulse-btn{min-width:44px;padding:4px 10px;font-size:.8rem}\n  .pulse-btn span{position:static;");
    // Large text wraps the bar instead of pushing the page sideways.
    expect(A11Y_CSS).toContain(".topbar{flex-wrap:wrap;row-gap:4px}");
  });
});

describe("card 4: 48px primary actions from the shared class", () => {
  it("sizes primary buttons from a 48px token, above any page's squeeze, and keeps everything else at 44px", () => {
    expect(A11Y_CSS).toContain(":root{--tap:44px;--tap-primary:48px}");
    expect(A11Y_CSS).toContain(".btn.primary:not(#_){min-height:var(--tap-primary)}");
    // "Bigger buttons" in the accessibility menu raises both tokens rather than being undone.
    expect(A11Y_CSS).toContain("html.a11y-touch{--tap:56px;--tap-primary:56px}");
    expect(A11Y_CSS).toContain(":is(a,button,label,summary).chip{display:inline-flex;align-items:center;justify-content:center;min-height:var(--tap)}");
    expect(A11Y_CSS).toContain(".pill span{min-height:var(--tap)}");
    // The rule comes after every contextual ".x .btn{min-height:44px}" squeeze in the file.
    expect(A11Y_CSS.lastIndexOf(".btn{min-height:44px")).toBeLessThan(A11Y_CSS.indexOf(".btn.primary:not(#_)"));
  });
});

describe("card 5: no counts, a dot or the word Today", () => {
  it("reads the event from a notification's link", () => {
    expect(eventIdOfLink("/events/abc")).toBe("abc");
    expect(eventIdOfLink("/events/abc/live")).toBe("abc");
    expect(eventIdOfLink("/events/abc?notice=x")).toBe("abc");
    expect(eventIdOfLink("/events/abc#invite")).toBe("abc");
    expect(eventIdOfLink("/me/events")).toBeNull();
    expect(eventIdOfLink(null)).toBeNull();
  });

  it("is urgent for today only for an urgent kind about an event on today's Bangkok date", () => {
    // 23:30 in Bangkok on 26 October is 16:30 UTC; an event at 00:30 Bangkok the next day is tomorrow.
    const now = new Date("2026-10-26T16:30:00Z");
    expect(bangkokDay(now)).toBe("2026-10-26");
    const tonight = new Date("2026-10-26T12:00:00Z");
    const tomorrow = new Date("2026-10-26T17:30:00Z");
    expect(urgentForToday({ kind: "event_notice", link: "/events/a" }, tonight, now)).toBe(true);
    expect(urgentForToday({ kind: "event_changed", link: "/events/a" }, tonight, now)).toBe(true);
    expect(urgentForToday({ kind: "waitlist_offer", link: "/events/a" }, tonight, now)).toBe(true);
    expect(urgentForToday({ kind: "event_notice", link: "/events/a" }, tomorrow, now)).toBe(false);
    // A host's plain update waits for the evening summary: not urgent.
    expect(urgentForToday({ kind: "event_update", link: "/events/a" }, tonight, now)).toBe(false);
    expect(urgentForToday({ kind: "rsvp", link: "/me/events" }, tonight, now)).toBe(false);
  });

  it("says the full count to screen readers, with Today first when the bell shows it", () => {
    const th = tr("th");
    const en = tr("en");
    expect(bellLabel(th, 0)).toBe("การแจ้งเตือน");
    expect(bellLabel(th, 3)).toBe("การแจ้งเตือน 3 รายการที่ยังไม่อ่าน");
    expect(bellLabel(en, 3)).toBe("3 unread notifications");
    expect(bellLabel(en, 1)).toBe("1 unread notification");
    expect(bellLabel(th, 2, true)).toBe("วันนี้: การแจ้งเตือน 2 รายการที่ยังไม่อ่าน");
    expect(bellLabel(en, 2, true)).toBe("Today: 2 unread notifications");
  });
});

describe.skipIf(!HAS_DB)("card 5: the bell on a page", () => {
  /** The bell's <summary>, from the page. */
  const bell = (html: string) => html.slice(html.indexOf('<details class="notif"'), html.indexOf("</summary>", html.indexOf('<details class="notif"')));

  it("shows a dot, never a number, for ordinary unread items", async () => {
    const m = await createMember();
    await unread(m.id, "rsvp", "/me/events");
    await unread(m.id, "event_notice", `/events/${await eventAt(new Date(Date.now() + 3 * 86_400_000))}`);
    const html = bell(await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text());
    expect(html).toContain('aria-label="2 unread notifications"');
    expect(html).toContain('<span class="unread-dot notif-dot" aria-hidden="true"></span>');
    expect(html).not.toContain("notif-today");
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
  });

  it("says Today, in words, for an urgent item about an event happening today", async () => {
    const m = await createMember();
    const today = await eventAt(new Date());
    await unread(m.id, "event_changed", `/events/${today}`);
    await unread(m.id, "thanks", "/thanks");
    const th = bell(await (await req("/settings", { cookie: `${m.cookie}; lang=th` })).text());
    expect(th).toContain('aria-label="วันนี้: การแจ้งเตือน 2 รายการที่ยังไม่อ่าน"');
    expect(th).toContain('<span class="notif-today" aria-hidden="true">วันนี้</span>');
    expect(th).not.toContain("notif-dot");
    const en = bell(await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text());
    expect(en).toContain('<span class="notif-today" aria-hidden="true">Today</span>');
    expect(en.replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
  });

  it("keeps the dot when today's item is one the evening summary holds back", async () => {
    const m = await createMember();
    await unread(m.id, "event_update", `/events/${await eventAt(new Date())}`);
    const html = bell(await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text());
    expect(html).toContain("notif-dot");
    expect(html).not.toContain("notif-today");
  });
});

describe("card 6: Me's one line", () => {
  // 5 October 2025, 10:00 in Bangkok.
  const since = new Date("2025-10-05T03:00:00Z");

  it("gives the Thai short month and the Buddhist Era year, and the English month and year", () => {
    expect(meLine("th", since, 3)).toBe("อยู่กับเจอกันตั้งแต่ ต.ค. 2568 · โต๊ะประจำ 3 โต๊ะ");
    expect(meLine("en", since, 3)).toBe("With Jurrgun since Oct 2025 · 3 Regular Tables");
  });

  it("uses Bangkok time for the month", () => {
    // 31 October 2025, 18:00 UTC is already 1 November in Bangkok.
    expect(meLine("en", new Date("2025-10-31T18:00:00Z"), 0)).toBe("With Jurrgun since Nov 2025");
  });

  it("leaves the tables out at 0 and says one Regular Table in the singular", () => {
    expect(meLine("th", since, 0)).toBe("อยู่กับเจอกันตั้งแต่ ต.ค. 2568");
    expect(meLine("en", since, 0)).toBe("With Jurrgun since Oct 2025");
    expect(meLine("th", since, 1)).toBe("อยู่กับเจอกันตั้งแต่ ต.ค. 2568 · โต๊ะประจำ 1 โต๊ะ");
    expect(meLine("en", since, 1)).toBe("With Jurrgun since Oct 2025 · 1 Regular Table");
    expect(meLine("en", null, 0)).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("card 6: the Me page and My month in people", () => {
  it("Me: the line, then the next table, the profile peek and the Bangkok Type; no hero and no tiles", async () => {
    const m = await createMember({ nickname: "Mint" });
    await attendedOnce(m.id);
    const html = await (await req("/settings", { cookie: `${m.cookie}; lang=th` })).text();
    expect(html).not.toContain('class="me-hero"');
    expect(html).not.toContain('class="me-stats"');
    expect(html).not.toContain('class="me-avatar"');
    expect(html).toMatch(/<p class="me-line"><span>บางรัก ·<\/span> <span>อยู่กับเจอกันตั้งแต่ [^<]+ 25\d\d<\/span><\/p>/);
    expect(html).toContain("ดูโปรไฟล์แบบที่คนอื่นเห็น");
    expect(html).toContain('id="me-type-h"');
    const order = ['class="me-line"', 'class="card me-next"', 'class="me-peek"', 'id="me-type-h"'].map((s) => html.indexOf(s));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("My month in people holds the counts that left Me, and none before a first outing", async () => {
    const m = await createMember();
    let html = await (await req("/me/month", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).not.toContain("Since you joined");
    await attendedOnce(m.id);
    html = await (await req("/me/month", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain('<h2 id="month-sofar-h">Since you joined</h2>');
    expect(html).toMatch(/<a class="fact" href="\/me\/events#past"><b aria-hidden="true">🎉<\/b><span class="big-n">1<\/span><small>Events attended<\/small><\/a>/);
    expect(html).toMatch(/<a class="fact" href="\/connections"><b aria-hidden="true">🤝<\/b><span class="big-n">0<\/span><small>My people<\/small><\/a>/);
    expect(html).toMatch(/<a class="fact" href="\/me\/events#upcoming"><b aria-hidden="true">🗓️<\/b><span class="big-n">0<\/span><small>Coming up<\/small><\/a>/);
  });
});

describe("card 9: the day-of status line says its status in words", () => {
  const words: Record<string, [string, string]> = {
    on_time: ["ตรงเวลา", "On time"],
    running_late: ["ช้ากว่ากำหนด", "late"],
    moved: ["ย้ายจุดนัดพบ", "moved"],
    cancelled: ["งด", "Called off"],
  };

  it("covers every status there is", () => {
    expect([...DAY_STATUSES].sort()).toEqual(Object.keys(words).sort());
  });

  for (const status of DAY_STATUSES) {
    it(`${status}: Thai and English words in the line, beside the coloured edge`, () => {
      const at = new Date("2026-10-26T11:05:00Z");
      for (const lang of ["th", "en"] as const) {
        const html = String(DayStatusLine({ t: tr(lang), lang, shown: { status, note: null, at } }));
        expect(html).toContain(`class="day-status ds-${status}"`);
        const text = html.replace(/<[^>]*>/g, "");
        expect(text).toContain(words[status]![lang === "th" ? 0 : 1]);
        // The status is the bold words, not only the edge colour.
        expect(html).toMatch(new RegExp(`<b>${lang === "th" ? DAY_STATUS_TEXT[status].th : DAY_STATUS_TEXT[status].en}</b>`));
      }
    });
  }

  it("keeps the coloured left edge", () => {
    expect(A11Y_CSS).toContain("border-left:4px solid var(--brand)");
    expect(A11Y_CSS).toContain(".day-status.ds-running_late,.day-status.ds-moved{border-left-color:var(--warn)");
  });
});
