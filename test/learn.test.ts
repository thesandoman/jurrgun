/**
 * Public FAQ and Learn pages — no login, no database.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { ABOUT, FAQ, HELPLINES, LEARN_CARDS, LEARN_GROUPS, TOPICS, type Block, type Text, type Topic } from "../src/content/learn";

const NEW_TOPICS = ["making-friends", "meetup-etiquette", "communication", "loneliness-and-mental-health", "inclusion", "new-to-bangkok", "getting-around"];
const DASHES = /[\u2013\u2014]/; // en and em dash

/** Every piece of copy in a topic, in both languages. */
function texts(topic: Topic): Text[] {
  const fromBlock = (b: Block): Text[] => (b.kind === "list" ? b.items : [b.text]);
  return [topic.title, topic.summary, ...topic.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap(fromBlock)])];
}

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
  it("lists every topic and helpline without login", async () => {
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

  it("opens with the What is Jurrgun blurb, in both languages", async () => {
    const en = await (await app.request("/learn?lang=en")).text();
    const th = await (await app.request("/learn")).text();
    expect(en).toContain("What is Jurrgun");
    expect(en).toContain("social meetup app for Bangkok");
    expect(en.indexOf("What is Jurrgun")).toBeLessThan(en.indexOf(`/learn/${TOPICS[0].slug}`));
    expect(th).toContain(ABOUT.th);
    expect(ABOUT.en).not.toMatch(DASHES);
    expect(ABOUT.th).not.toMatch(DASHES);
  });

  it("groups the cards into sections and every card is on the page and in LEARN_CARDS", async () => {
    const html = await (await app.request("/learn?lang=en")).text();
    for (const g of LEARN_GROUPS) expect(html).toContain(`<h2>${g.title.en}</h2>`);
    for (const topic of TOPICS) expect(LEARN_CARDS.map((c) => c.slug)).toContain(topic.slug);
    expect(LEARN_CARDS.map((c) => c.slug)).toContain("bangkok-types");
    expect(new Set(LEARN_CARDS.map((c) => c.slug)).size).toBe(LEARN_CARDS.length);
  });

  it.each(NEW_TOPICS)("new topic %s is bilingual, sourced, dash free and renders", async (slug) => {
    const topic = TOPICS.find((x) => x.slug === slug);
    expect(topic).toBeDefined();
    for (const x of texts(topic!)) {
      expect(x.th.trim().length).toBeGreaterThan(0);
      expect(x.en.trim().length).toBeGreaterThan(0);
      expect(x.th).toMatch(/[\u0E00-\u0E7F]/); // Thai copy is really Thai
      expect(x.th).not.toMatch(DASHES);
      expect(x.en).not.toMatch(DASHES);
    }
    expect(topic!.sources.length).toBeGreaterThan(0);
    for (const src of topic!.sources) expect(src.url).toMatch(/^https:\/\//);
    const en = await (await app.request(`/learn/${slug}?lang=en`)).text();
    const th = await (await app.request(`/learn/${slug}`)).text();
    for (const s of topic!.sections) {
      expect(en).toContain(s.heading.en.replaceAll("'", "&#39;"));
      expect(th).toContain(s.heading.th);
    }
  });

  it("points to Sanroo as another map of Bangkok places", async () => {
    const html = await (await app.request("/learn/getting-around?lang=en")).text();
    expect(html).toContain('href="https://sanroo.xyz/"');
    expect(html).toContain("another map of Bangkok places");
  });

  it("lists the mental health hotline 1323 on the loneliness topic", async () => {
    const html = await (await app.request("/learn/loneliness-and-mental-health?lang=en")).text();
    expect(html).toContain("tel:1323");
    expect(html).toContain("1323");
  });
});
