/**
 * /partners, the public explainer for organisers (owner U2, 2026-10-30): open
 * to visitors, one Apply button to the signed-in /partner/apply, the landing
 * links here, and the copy keeps Partners' guards (no "free forever", no
 * "official", no API promise, no outside calendars by name, no dashes).
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { headLinks } from "../src/lib/seo";
import { PARTNERS_COPY, PARTNERS_DESCRIPTION } from "../src/routes/partners";

const LIVE = "https://jurrgun.apps.sv-academy.org";
const visitor = (lang: "en" | "th") => ({ headers: { cookie: `jg_intro=seen; lang=${lang}`, accept: "text/html" } });
const mainOf = (h: string) => h.slice(h.indexOf("<main"), h.indexOf("</main>"));
const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

async function partners(lang: "en" | "th", url = `/partners?lang=${lang}`) {
  const res = await app.request(url, visitor(lang), { NO_EXTERNAL: "1" });
  return { res, html: await res.text() };
}

/** Every string the page can show, in both languages. */
function allCopy(): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") out.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(PARTNERS_COPY);
  walk(PARTNERS_DESCRIPTION);
  return out;
}

describe("/partners", () => {
  it("opens signed out (200) with exactly one primary button, to /partner/apply", async () => {
    for (const lang of ["th", "en"] as const) {
      const { res, html } = await partners(lang);
      expect(res.status, lang).toBe(200);
      const main = mainOf(html);
      const primaries = [...main.matchAll(/<a href="([^"]+)" class="btn primary[^"]*"/g)].map((m) => m[1]);
      expect(primaries, lang).toEqual(["/partner/apply"]);
      expect(main.match(/class="btn /g)?.length, lang).toBe(1);
      expect(main, lang).toContain(lang === "th" ? "สมัครเป็นพาร์ตเนอร์" : ">Apply<");
    }
  });

  it("is Thai first, and every section is on the page in order, with headings in order", async () => {
    const th = mainOf((await partners("th", "/partners")).html);
    expect(th).toContain(PARTNERS_COPY.whoTitle[0]);
    const en = mainOf((await partners("en")).html);
    const order = [PARTNERS_COPY.whoTitle, PARTNERS_COPY.canTitle, PARTNERS_COPY.privacyTitle, PARTNERS_COPY.howTitle, PARTNERS_COPY.rulesTitle].map((x) =>
      decode(en).indexOf(`<h2>${x[1]}</h2>`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const levels = [...en.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    // The CTA comes after the rules, and the team-set line closes the page.
    expect(en.indexOf('href="/partner/apply"')).toBeGreaterThan(en.indexOf(PARTNERS_COPY.rulesTitle[1]));
    expect(decode(en)).toContain(PARTNERS_COPY.contact[1]);
  });

  it("keeps Partners' copy guards in both languages", async () => {
    const banned = [/free forever/i, /official/i, /\bAPI\b/, /TCDC/i, /BACC/i, /\bBMA\b/, /กทม/, /ฟรีตลอด/, /[–—]/, /testimonial/i];
    for (const s of allCopy()) for (const b of banned) expect(s, String(b)).not.toMatch(b);
    for (const lang of ["th", "en"] as const) {
      const main = decode(mainOf((await partners(lang)).html));
      for (const b of banned) expect(main, `${lang} ${b}`).not.toMatch(b);
      // No dating headline: 💘 only as a rule, never in a heading.
      expect(main).not.toMatch(/<h[1-6][^>]*>[^<]*(💘|dating|เดต)/i);
    }
  });

  it("the landing links organisers here, not straight to the form", async () => {
    const main = mainOf(await (await app.request("/", visitor("en"))).text());
    expect(main).toContain('href="/partners"');
    expect(main).not.toContain('href="/partner/apply"');
  });

  it("remembers a ?src= placement like the other public landings", async () => {
    const { res } = await partners("en", "/partners?lang=en&src=poster");
    expect(res.headers.get("set-cookie") ?? "").toContain("jg_src=poster");
  });
});

describe("/partners SEO", () => {
  it("is indexable on the live address with its own canonical", async () => {
    expect(headLinks({ host: "jurrgun.apps.sv-academy.org", path: "/partners" }).canonical).toBe(`${LIVE}/partners`);
    const page = await (await app.request(`${LIVE}/partners?lang=en`, visitor("en"), { NO_EXTERNAL: "1" })).text();
    expect(page).toContain(`<link rel="canonical" href="${LIVE}/partners?lang=en"/>`);
    expect(page).not.toContain('name="robots"');
  });

  it("sits right after the front doors in the sitemap, before the intro, and has an llms.txt line", async () => {
    const xml = await (await app.request(`${LIVE}/sitemap.xml`)).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.indexOf(`${LIVE}/partners`)).toBe(locs.indexOf(`${LIVE}/local`) + 1);
    expect(locs.indexOf(`${LIVE}/intro`)).toBe(locs.indexOf(`${LIVE}/partners`) + 1);
    const txt = await (await app.request(`${LIVE}/llms.txt`)).text();
    expect(txt).toContain(`- [Partners](${LIVE}/partners): `);
  });

  it("its description is the page's own words, under 155 characters in each language", async () => {
    for (const [i, lang] of (["th", "en"] as const).entries()) {
      const page = decode(await (await app.request(`${LIVE}/partners?lang=${lang}`, visitor(lang), { NO_EXTERNAL: "1" })).text());
      const desc = /<meta name="description" content="([^"]*)"\/>/.exec(page)?.[1] ?? "";
      expect(desc, lang).toBe(PARTNERS_DESCRIPTION[i]);
      expect([...desc].length, lang).toBeLessThan(155);
      // Each sentence of it is on the page.
      const main = mainOf(page);
      expect(main, lang).toContain(PARTNERS_COPY.fee[i]);
      expect(main, lang).toContain(desc.replace(` ${PARTNERS_COPY.fee[i]}`, ""));
    }
  });
});
