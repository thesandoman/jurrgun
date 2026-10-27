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

  it("shows Buddy and the districts as plain explainers, without the link arrow", async () => {
    const { bento: b } = await bento();
    expect(b).toContain("Bangkok Buddy");
    expect(b).toContain("districts to collect");
    expect(b).not.toContain('class="go"');
    expect(b).toMatch(/<div class="tile2 tall t-deep[^"]*">/);
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
