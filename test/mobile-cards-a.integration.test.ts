/**
 * Mobile cards A (owner, 2026-10-26 via Main): the top bar fits from 360px
 * (card 1), 48px primary actions (card 4), no counts (card 5), the Me line
 * (card 6) and the day-of status words (card 9).
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { profiles } from "../src/schema";
import { A11Y_CSS } from "../src/ui/a11y-css";

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
