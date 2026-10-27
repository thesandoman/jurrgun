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
  const end = html.indexOf('class="eyebrow doors-eyebrow"');
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

describe("card 4: flat tiles", () => {
  it("drops every shadow on and inside the landing tiles", async () => {
    const { A11Y_CSS } = await import("../src/ui/a11y-css");
    expect(A11Y_CSS).toContain(".landing-bento .tile2,.landing-bento .tile2 *{box-shadow:none}");
    expect((await bento()).html).toContain('class="bento landing-bento"');
  });
});

describe("card 5: three doors", () => {
  it("replaces the learn rail and door buttons with three door rows and one Learn more link", async () => {
    const { html } = await bento("en");
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main).not.toContain("rail-wrap");
    expect(main).toContain('<h2 class="eyebrow doors-eyebrow">Where to start</h2>');
    const doors = [...main.matchAll(/<a href="([^"]+)" class="door">/g)].map((m) => m[1]);
    expect(doors).toEqual(["/new", "/international", "/local"]);
    expect(main.match(/class="door-go" aria-hidden="true">→</g)?.length).toBe(3);
    expect(main).toContain('<a href="/learn">Learn more</a>');
    // The footer already has these, so the landing doesn't repeat them.
    for (const dup of ['href="/faq"', 'href="/code-of-conduct"']) expect(main).not.toContain(dup);
    expect(main).toContain('href="/partner/apply"');
    const th = (await bento("th")).html;
    expect(th).toContain("เริ่มจากตรงไหนดี");
    expect(th).toContain("เรียนรู้เพิ่ม");
  });

  it("every door and every landing link outside the footer opens for a visitor", async () => {
    const { html } = await bento("en");
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    const hrefs = [...new Set([...main.matchAll(/<a href="(\/[^"#]*)"/g)].map((m) => m[1]))]// Sign up and sign in are the point; the partner link (kept by the owner) asks organisers to sign in to apply.
      .filter((h) => !["/signup", "/login", "/partner/apply"].includes(h));
    for (const href of hrefs) {
      if (["/new", "/local", "/international"].includes(href)) continue; // these read the database: covered in the integration test
      const res = await app.request(href, visitor("en"), { NO_EXTERNAL: "1" });
      expect(res.status, href).toBe(200);
    }
  });
});

describe("card 6: the BMA line", () => {
  it("is one quiet line under the start, with no chip and no 🏛️ in the hero", async () => {
    const hero = (h: string) => h.slice(h.indexOf("tile2 hero"), h.indexOf("</a>", h.indexOf('class="trust-line"')) + 1);
    const en = (await bento("en")).html;
    const th = (await bento("th")).html;
    expect(en).toContain('<p class="trust-line">Real places, Table Hosts, check-in · An independent app, hosted and overseen by the BMA</p>');
    expect(th).toContain('<p class="trust-line">สถานที่จริง มีเจ้าภาพโต๊ะ เช็กอินได้ · แอปอิสระ กทม. เป็นเจ้าภาพและกำกับดูแล</p>');
    // Under the start: after the hero buttons.
    expect(en.indexOf('class="trust-line"')).toBeGreaterThan(en.indexOf('class="hero-link"'));
    const bentoEn = (await bento("en")).bento;
    expect(bentoEn.slice(0, bentoEn.indexOf("</h1>") + 2000)).not.toContain("🏛️");
    expect(hero(en)).not.toContain("endorse");
  });

  it("uses a neutral class name everywhere", async () => {
    const { STYLES } = await import("../src/ui/styles");
    expect(STYLES).not.toContain("endorse");
    expect(STYLES).toContain(".trust-line{");
    const en = (await bento("en")).html;
    expect(en).not.toContain("endorse");
    expect(en).toContain('class="foot-trust"');
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
