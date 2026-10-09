/**
 * Public FAQ and Learn pages — no login, no database.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { FAQ, HELPLINES, TOPICS } from "../src/content/learn";

describe("FAQ", () => {
  it("shows the first questions on the home page, below the hero", async () => {
    const html = await (await app.request("/?lang=en", { headers: { cookie: "jg_intro=seen" } })).text();
    const hero = html.indexOf("Small groups. Real places. No swiping.");
    const faq = html.indexOf(FAQ[0].q.en);
    expect(hero).toBeGreaterThan(-1);
    expect(faq).toBeGreaterThan(hero);
    expect(html).toContain('href="/faq"');
    expect(html).not.toContain(FAQ[FAQ.length - 1].q.en); // home shows a subset
  });

  it("/faq lists every question, in Thai by default", async () => {
    const res = await app.request("/faq");
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const f of FAQ) expect(html).toContain(f.q.th);
  });
});

describe("Learn", () => {
  it("lists the four topics and helplines without login", async () => {
    const res = await app.request("/learn?lang=en");
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const topic of TOPICS) expect(html).toContain(`/learn/${topic.slug}`);
    for (const h of HELPLINES) expect(html).toContain(`tel:${h.number}`);
  });

  it.each(["dating-in-bangkok", "consent", "sexual-health", "date-responsibly"])("renders /learn/%s in both languages", async (slug) => {
    const topic = TOPICS.find((x) => x.slug === slug)!;
    const en = await (await app.request(`/learn/${slug}?lang=en`)).text();
    const th = await (await app.request(`/learn/${slug}`)).text();
    expect(en).toContain(topic.sections[0].heading.en);
    expect(th).toContain(topic.sections[0].heading.th);
  });

  it("cites sources on every topic and links every helpline to its source", async () => {
    for (const topic of TOPICS) {
      expect(topic.sources.length).toBeGreaterThan(0);
      const html = await (await app.request(`/learn/${topic.slug}?lang=en`)).text();
      expect(html).toContain("Sources");
      for (const src of topic.sources) expect(html).toContain(src.url.replaceAll("&", "&amp;"));
    }
    for (const h of HELPLINES) expect(h.source).toMatch(/^https:\/\//);
  });

  it("404s an unknown topic", async () => {
    expect((await app.request("/learn/nope")).status).toBe(404);
  });

  it("links FAQ and Learn from the footer of every page", async () => {
    const html = await (await app.request("/privacy")).text();
    expect(html).toContain('href="/faq"');
    expect(html).toContain('href="/learn"');
  });
});
