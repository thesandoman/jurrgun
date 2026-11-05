/**
 * Service worker and offline page. No database needed (no session cookie).
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { ALL_CSS, CSS_HREF } from "../src/ui/kit";

describe("PWA", () => {
  it("serves the service worker as uncached JavaScript", async () => {
    const res = await app.request("/sw.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const js = await res.text();
    expect(js).toContain("/offline");
    expect(js).toContain("skipWaiting");
    expect(js).toContain("clients.claim");
    // The four public shell files are precached; the only page ever stored is the member's
    // own pass (test/offline-next.test.ts runs that logic), in its own cache.
    expect(js).toContain('["/offline", "/icon.svg", "/manifest.webmanifest", CSS]');
    expect(js).toContain(`const CSS = ${JSON.stringify(CSS_HREF)};`);
    expect(js.match(/\.put\(/g)).toHaveLength(1);
    expect(js).toContain("const PASS = /^\\/me\\/events\\/[A-Za-z0-9_-]+\\/pass$/;");
  });

  it("serves a bilingual offline page without a login", async () => {
    const res = await app.request("/offline");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("คุณออฟไลน์อยู่");
    expect(html).toContain('href="tel:191"');
    expect(html).toContain('href="tel:1669"');
    const en = await (await app.request("/offline?lang=en")).text();
    expect(en).toContain("You&#39;re offline");
  });

  it("links one stylesheet, cached for a year by its content hash, instead of inlining it", async () => {
    const html = await (await app.request("/offline")).text();
    expect(html).toContain(`<link rel="stylesheet" href="${CSS_HREF}"/>`);
    expect(html).not.toContain(ALL_CSS.slice(0, 200));
    expect(html.length).toBeLessThan(60_000);
    const css = await app.request(CSS_HREF);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(css.headers.get("cache-control")).toContain("immutable");
    expect(await css.text()).toBe(ALL_CSS);
    // A page from before a deploy still gets styled, just not cached for long.
    const old = await app.request("/css/000000000000.css");
    expect(old.headers.get("cache-control")).toBe("no-cache");
    expect((await old.text()).length).toBe(ALL_CSS.length);
  });
});
