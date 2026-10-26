/**
 * Search and answer-engine basics (Marketing M1): robots.txt, sitemap.xml,
 * llms.txt, canonical and hreflang, noindex outside the public pages, and
 * JSON-LD that only repeats what the page says.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { BRAND } from "../src/ui/brand";
import { headLinks } from "../src/lib/seo";

const LIVE = "https://jurrgun.apps.sv-academy.org";
const html = { headers: { accept: "text/html" } };
const get = (url: string, init = html) => app.request(url, init);

describe("robots.txt", () => {
  it("allows the live site, blocks private areas and names the sitemap", async () => {
    const res = await get(`${LIVE}/robots.txt`);
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /admin");
    expect(txt).toContain("Disallow: /chat");
    expect(txt).toContain(`Sitemap: ${LIVE}/sitemap.xml`);
    expect(txt).toContain("Disallow: /settings");
    expect(txt).not.toMatch(/Disallow: \/(sw\.js|manifest)/);
  });

  it("blocks everything on any other host (staging, dev, previews)", async () => {
    const txt = await (await get("http://localhost/robots.txt")).text();
    expect(txt).toBe("User-agent: *\nDisallow: /\n");
  });
});

describe("sitemap.xml", () => {
  it("lists the public front doors on the live address with th and en alternates", async () => {
    const res = await get(`${LIVE}/sitemap.xml`);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    for (const p of ["/intro", "/new", "/faq", "/learn", "/safety/how", "/privacy"]) expect(xml).toContain(`<loc>${LIVE}${p}</loc>`);
    expect(xml).toContain(`<loc>${LIVE}/international?lang=en</loc>`);
    expect(xml).toContain(`hreflang="en" href="${LIVE}/faq?lang=en"`);
  });

  it("never lists member, admin or chat pages, dating-led topics or the planned domain", async () => {
    const xml = await (await get(`${LIVE}/sitemap.xml`)).text();
    for (const p of ["/settings", "/api/", "/events", "/admin", "/chat", "/me/", "/host", "/pulse", "/learn/dating-in-bangkok", "/learn/date-responsibly"]) expect(xml).not.toContain(`${LIVE}${p}<`);
    expect(xml).not.toContain(BRAND.plannedDomain);
  });
});

describe("llms.txt", () => {
  it("states the site's own facts and links", async () => {
    const txt = await (await get(`${LIVE}/llms.txt`)).text();
    expect(txt).toContain("# Jurrgun (เจอกัน)");
    expect(txt).toContain(BRAND.tagline.en);
    expect(txt).toContain(BRAND.bma.en);
    expect(txt).toContain(`${LIVE}/faq`);
  });

  it("makes no claims the site doesn't: no counts, partners, endorsement or planned domain", async () => {
    const txt = await (await get(`${LIVE}/llms.txt`)).text();
    expect(txt).not.toMatch(/\bmembers? (so far|joined)|\d[\d,]* members|partnered with|endorsed|official app/i);
    expect(txt).not.toContain(BRAND.plannedDomain);
    expect(txt).not.toMatch(/[–—]/);
  });
});

describe("head links", () => {
  it("public pages get a canonical on the live address and th, en, x-default alternates", async () => {
    const page = await (await get(`${LIVE}/faq`)).text();
    expect(page).toContain(`<link rel="canonical" href="${LIVE}/faq"/>`);
    expect(page).toContain(`<link rel="alternate" hreflang="th" href="${LIVE}/faq?lang=th"/>`);
    expect(page).toContain(`<link rel="alternate" hreflang="x-default" href="${LIVE}/faq"/>`);
    expect(page).not.toContain('name="robots"');
  });

  it("the English view has its own canonical", async () => {
    const page = await (await get(`${LIVE}/faq?lang=en`)).text();
    expect(page).toContain(`<link rel="canonical" href="${LIVE}/faq?lang=en"/>`);
  });

  it("/international defaults to its English page (unit: the page itself needs the database)", () => {
    const l = headLinks({ host: "jurrgun.apps.sv-academy.org", path: "/international" });
    expect(l.canonical).toBe(`${LIVE}/international?lang=en`);
    expect(l.alternates.map((a) => a.hreflang)).toEqual(["th", "en"]);
    expect(headLinks({ host: "jurrgun.apps.sv-academy.org", path: "/new/" }).canonical).toBe(`${LIVE}/new`);
    expect(headLinks({ host: "jurrgun.apps.sv-academy.org", path: "/events" }).robots).toBe("noindex");
    expect(headLinks({ host: "jurrgun.apps.sv-academy.org", path: "/faq", status: 500 }).robots).toBe("noindex");
  });

  it("login and other non-public pages are noindex with no canonical", async () => {
    const page = await (await get(`${LIVE}/login`)).text();
    expect(page).toContain('<meta name="robots" content="noindex"/>');
    expect(page).not.toContain('rel="canonical"');
  });

  it("any host but the live one is noindex", async () => {
    const page = await (await get("http://localhost/faq")).text();
    expect(page).toContain('<meta name="robots" content="noindex"/>');
    expect(page).not.toContain("application/ld+json");
  });

  it("learn topics use their own summary as the description", async () => {
    const page = await (await get(`${LIVE}/learn/making-friends?lang=en`)).text();
    expect(page).toMatch(/<meta name="description" content="[^"]+"\/>/);
    expect(page).not.toContain('content="Jurrgun (เจอกัน): กลุ่มเล็ก');
  });
});

describe("JSON-LD", () => {
  const blocks = (page: string) => [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

  it("/faq carries FAQPage data whose questions are all on the page", async () => {
    const page = await (await get(`${LIVE}/faq?lang=en`)).text();
    const faq = blocks(page).find((b) => b["@type"] === "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity.length).toBeGreaterThan(5);
    for (const q of faq.mainEntity) expect(page).toContain(`<summary>${q.name.replace(/'/g, "&#39;")}</summary>`);
  });

  it("/intro carries Organization and WebSite data with the BMA line word for word", async () => {
    const page = await (await get(`${LIVE}/intro?lang=en`)).text();
    const all = blocks(page);
    const org = all.find((b) => b["@type"] === "Organization");
    expect(org.url).toBe(LIVE);
    expect(org.description).toContain(BRAND.bma.en);
    expect(all.some((b) => b["@type"] === "WebSite")).toBe(true);
    expect(JSON.stringify(all)).not.toMatch(/member(Count|s joined)|aggregateRating|review|sponsor|funder/i);
  });

  it("only /faq has FAQ data", async () => {
    const page = await (await get(`${LIVE}/learn?lang=en`)).text();
    expect(blocks(page).some((b) => b["@type"] === "FAQPage")).toBe(false);
  });
});
