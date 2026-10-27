/**
 * Signed-out landing ("/") fixes, 2026-10-27: every bento tile link is a
 * public page (never a members-only one that bounces to /login), the Safety
 * tile says something true about safety, the last bento row has no hole, the
 * learn rail lines up with the page gutter, and pages without a tab bar don't
 * keep an empty band under the footer.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";

const visitor = (lang: "en" | "th") => ({ headers: { cookie: `jg_intro=seen; lang=${lang}`, accept: "text/html" } });

async function bento(lang: "en" | "th" = "en") {
  const html = await (await app.request("/", visitor(lang))).text();
  const start = html.indexOf('class="bento');
  const end = html.indexOf('class="rail-wrap"');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return { html, bento: html.slice(start, end) };
}

const MEMBERS_ONLY = ["/buddy", "/buddy/passport", "/events", "/me/events", "/connections", "/settings", "/tables", "/quiz"];

describe("signed-out landing tiles", () => {
  it("link only to pages a visitor can open", async () => {
    const { bento: b } = await bento();
    // Tile links, not the hero's Get started and Sign in.
    const tiles = [...b.matchAll(/<a href="([^"]+)" class="tile2/g)].map((m) => m[1]);
    expect(tiles.length).toBeGreaterThan(0);
    for (const href of tiles) {
      expect(MEMBERS_ONLY, href).not.toContain(href.split("?")[0]);
      const res = await app.request(href, visitor("en"), { NO_EXTERNAL: "1" });
      expect(res.status, href).toBe(200);
      expect(res.headers.get("location") ?? "", href).not.toContain("/login");
    }
  });

  it("never points a tile at a members-only page", async () => {
    const { bento: b } = await bento();
    for (const path of MEMBERS_ONLY) expect(b).not.toContain(`href="${path}"`);
  });

  it("shows Buddy as a plain explainer, without the link arrow", async () => {
    const { bento: b } = await bento();
    expect(b).toContain("Bangkok Buddy");
    expect(b).not.toContain('class="go"');
    expect(b).toMatch(/<div class="tile2 tall t-deep[^"]*">/);
  });
});

describe("card 3: honest bento", () => {
  it("has no passport tile", async () => {
    const { bento: b } = await bento();
    expect(b).not.toContain("districts to collect");
    expect(b).not.toContain("/buddy/passport");
    expect((await bento("th")).bento).not.toContain("เขตให้สะสม");
  });

  it("explains the three steps, Thai first, with the app's Table Host term", async () => {
    const steps = (b: string) => [...b.slice(b.indexOf('class="steps3"')).matchAll(/<li>([^<]+)<\/li>/g)].slice(0, 3).map((m) => m[1]);
    expect(steps((await bento("th")).bento)).toEqual([
      "เลือกโต๊ะ",
      "เจอเจ้าภาพโต๊ะที่สถานที่จริง นั่งกัน 4 ถึง 6 คน จัดที่ให้คละกัน",
      "เลือกเงียบ ๆ ว่าอยากเจอใครอีก",
    ]);
    const en = steps((await bento("en")).bento);
    expect(en).toEqual(["Pick a table", "Meet your Table Host at a real place, 4 to 6 people seated to mix", "Choose quietly who you&#39;d like to see again"]);
    expect(en.join(" ")).not.toMatch(/[–—]/);
  });

  it("fills every row: the last two tiles are wide, so four columns end on a full row", async () => {
    const { bento: b } = await bento();
    const tiles = [...b.matchAll(/class="tile2 ([a-z]*) /g)].map((m) => m[1]);
    // hero (4 cells) + Buddy (2) + two singles + two wides (2 each) = 12 cells = 3 full rows of 4, 6 rows of 2.
    expect(tiles).toEqual(["hero", "tall", "", "", "wide", "wide"]);
  });
});

describe("Safety tile", () => {
  it("says what keeps people safe, in Thai and English, and links to /safety", async () => {
    const en = (await bento("en")).bento;
    const th = (await bento("th")).bento;
    const tile = (b: string) => b.slice(b.lastIndexOf("<a", b.indexOf("🛡️")), b.indexOf("</a>", b.indexOf("🛡️")));
    expect(tile(en)).toContain('href="/safety"');
    expect(tile(en)).toContain("Safety first");
    expect(tile(en)).toContain("Always in public places. Report or block in the app.");
    expect(tile(th)).toContain("นัดในที่สาธารณะเสมอ รายงานหรือบล็อกได้ในแอป");
    // The old line was about mutual choices, not safety.
    expect(en).not.toContain("You only hear when it's mutual");
    expect(tile(en) + tile(th)).not.toMatch(/[–—]/);
  });
});

describe("card 1: bigger headline", () => {
  it("grows from 2.4rem on phones to 3.2rem on laptops in the display font", async () => {
    const { A11Y_CSS } = await import("../src/ui/a11y-css");
    expect(A11Y_CSS).toContain(".tile2.hero .hero-title{font-family:var(--display);font-size:clamp(2.4rem,1.6rem + 2.5vw,3.2rem)}");
  });

  it("keeps each phrase whole but lets it wrap rather than overflow, with แล้วเจอกันนะ on its own line", async () => {
    const { A11Y_CSS } = await import("../src/ui/a11y-css");
    expect(A11Y_CSS).toContain(".hero-title .ph{display:inline-block;max-width:100%}");
    expect(A11Y_CSS).toContain(".hero-title .ph:last-child{display:block}");
    const th = (await bento("th")).html;
    const h1 = th.slice(th.indexOf('<h1 class="hero-title">'), th.indexOf("</h1>"));
    expect(h1).not.toContain("nowrap");
    expect([...h1.matchAll(/<span class="ph">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(["กลุ่มเล็ก", "สถานที่จริง", "แล้วเจอกันนะ"]);
    const en = (await bento("en")).html;
    const h1en = en.slice(en.indexOf('<h1 class="hero-title">'), en.indexOf("</h1>"));
    expect([...h1en.matchAll(/<span class="ph">([^<]+)<\/span>/g)].map((m) => m[1]).at(-1)).toBe("See you there.");
  });

  it("has a plain support line and a solid eyebrow tag with no blur", async () => {
    const { A11Y_CSS } = await import("../src/ui/a11y-css");
    const en = (await bento("en")).html;
    expect(en).toContain('<p class="hero-sub">Make friends in Bangkok. No endless swiping.</p>');
    expect(A11Y_CSS).toContain(".tile2.hero .pill2{background:var(--surface);color:var(--ink);text-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}");
  });

  it('keeps "ผู้กำกับดูแล" whole in the footer', async () => {
    const th = (await bento("th")).html;
    expect(th).toContain('<span style="white-space:nowrap">ผู้กำกับดูแล</span>');
  });
});

describe("card 2: one start", () => {
  it("has a single primary, Find my first table, to sign up, with Sign in as the secondary link", async () => {
    const en = (await bento("en")).html;
    const main = en.slice(en.indexOf("<main"), en.indexOf("</main>"));
    expect(main.match(/class="btn primary/g)?.length).toBe(1);
    expect(main).toContain('<a href="/signup" class="btn primary start-cta"><span>Find my first table</span><span class="start-arrow" aria-hidden="true">→</span></a>');
    expect(main).toContain('<a href="/login" class="hero-link">Sign in</a>');
    expect(main.match(/href="\/signup"/g)?.length).toBe(1);
    const th = (await bento("th")).html;
    expect(th).toContain("<span>หาโต๊ะแรก</span>");
  });

  it("presses to .97 without bounce, and not at all with reduced motion", async () => {
    const { A11Y_CSS } = await import("../src/ui/a11y-css");
    expect(A11Y_CSS).toContain(".btn:active{transform:scale(.97)}");
    expect(A11Y_CSS).toContain(".btn.start-cta{gap:12px;min-height:48px;");
    expect(A11Y_CSS).toContain("@media (prefers-reduced-motion:reduce){.btn.start-cta:active{transform:none}}");
  });
});

describe("bottom padding", () => {
  it("keeps tab bar room only on pages with a tab bar", async () => {
    const { A11Y_CSS } = await import("../src/ui/a11y-css");
    expect(A11Y_CSS).toContain("body:not(:has(.tabbar)){padding-bottom:env(safe-area-inset-bottom,0px)}");
    // Signed-in phones still reserve the room above the bar.
    expect(A11Y_CSS).toContain("body:has(.tabbar){padding-bottom:calc(104px + env(safe-area-inset-bottom,0px))}");
    const { html } = await bento();
    expect(html).not.toContain('class="tabbar"');
  });
});
