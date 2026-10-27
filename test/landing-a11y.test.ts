/**
 * Landing and intro accessibility: one h1, the hero carries its call to
 * action, and the intro has a real Next button, a slide count for screen
 * readers, the accessibility menu and marked language links.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";

const seen = { headers: { cookie: "jg_intro=seen; lang=en", accept: "text/html" } };

describe("home landing", () => {
  it("has exactly one h1, and Get started sits in the hero", async () => {
    const html = await (await app.request("/", seen)).text();
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
    expect(html).toContain('<h1 class="hero-title">');
    const hero = html.slice(html.indexOf("tile2 hero"), html.indexOf("</h1>") + 600);
    expect(hero).toContain('href="/signup" class="btn primary start-cta"');
  });
});

describe("intro", () => {
  it("uses a real button, announces the slide, and offers the accessibility menu", async () => {
    const html = await (await app.request("/intro", { headers: { cookie: "lang=en", accept: "text/html" } })).text();
    expect(html).toContain('<button type="button" class="btn primary intro-next" id="intro-next">');
    expect(html).toMatch(/id="intro-status" role="status"[^>]*>Slide 1 of 3</);
    expect(html).toContain('id="a11y"');
    expect(html).toMatch(/lang="en" aria-current="true">English</);
    expect(html).not.toContain('href="#" class="btn primary intro-next"');
  });
});

describe("inline scripts", () => {
  it("never glue two IIFEs together (the second would be called on the first's result)", async () => {
    for (const path of ["/", "/intro", "/login"]) {
      // /login reads the sign-in providers from env: pass one, or it answers with the error page.
      const res = await app.request(path, seen, { NO_EXTERNAL: "1" });
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, path).not.toMatch(/\}\)\(\)\(function/);
    }
  });
});
