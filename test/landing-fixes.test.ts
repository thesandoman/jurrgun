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
