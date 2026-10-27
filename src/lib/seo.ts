/**
 * Search and answer-engine basics (Marketing M1, owner-approved 2026-10-26):
 * robots.txt, sitemap.xml, llms.txt, canonical and hreflang links, a robots
 * meta tag, and JSON-LD.
 *
 * Panel rules this file keeps:
 * - Only the public pages below are indexable. Member, chat, admin, host,
 *   partner and demo pages get `noindex`, and so does any host other than
 *   the live one (staging, local dev, previews).
 * - Canonical links always point at the live address, BRAND.url. The planned
 *   domain (BRAND.plannedDomain) is not bought and never appears here.
 * - llms.txt and JSON-LD only state what the site already says: no member
 *   counts, partners or safety claims, and the BMA only in BRAND.bma's words.
 * - FAQ structured data only on /faq, where every question is on the page.
 */
import { ABOUT, FAQ, TOPICS } from "../content/learn";
import { BRAND } from "../ui/brand";
import { asset, assets } from "../assets";

export const SITE_HOST = BRAND.url;
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** The Search Console verification file name Google issued for the live address (owner, 2026-10-27). */
export const GOOGLE_SITE_VERIFICATION = "google50488074a0eaeddb.html";

/**
 * Learn topics that lead with dating stay reachable and indexable, but are
 * left out of the sitemap and llms.txt, so search engines don't meet
 * Jurrgun first as a dating site (friends first, PRODUCT.md D4).
 */
const DATING_LED = new Set(["dating-in-bangkok", "date-responsibly"]);

/** The 16 Bangkok Type pages, by the same slugs as their share images. */
const TYPE_PATHS = Object.keys(assets)
  .map((k) => /^og\/types\/([a-z0-9-]+)\.jpg$/.exec(k)?.[1])
  .filter((x): x is string => !!x)
  .map((slug) => `/types/${slug}`);

/** Pages a visitor can open without signing in, and that may be indexed. */
const INDEXABLE = new Set<string>([
  "/",
  "/intro",
  "/new",
  "/international",
  "/local",
  "/faq",
  "/learn",
  "/learn/bangkok-types",
  ...TOPICS.map((x) => `/learn/${x.slug}`),
  "/types",
  ...TYPE_PATHS,
  "/safety",
  "/safety/how",
  "/code-of-conduct",
  "/privacy",
  "/terms",
]);

/**
 * Paths that show a public page to visitors and a member page to members:
 * indexable only when the render says it is the public page. "/" is the
 * visitor landing signed out and Discover signed in (noindex).
 */
const PUBLIC_ONLY_WHEN_SAID = new Set<string>(["/"]);

/** /international redirects visitors with no language choice, so its default is the English page. */
const DEFAULT_LANG: Record<string, "en"> = { "/international": "en" };

/** Sitemap order: the homepage, the front doors, the intro, then what the app is, then help. */
const SITEMAP: string[] = [
  "/",
  "/new",
  "/international",
  "/local",
  "/intro",
  "/faq",
  "/types",
  ...TYPE_PATHS,
  "/learn",
  "/learn/bangkok-types",
  ...TOPICS.filter((x) => !DATING_LED.has(x.slug)).map((x) => `/learn/${x.slug}`),
  "/safety/how",
  "/code-of-conduct",
  "/safety",
  "/privacy",
  "/terms",
];

export function isLiveHost(host: string | undefined | null): boolean {
  return (host ?? "").toLowerCase().split(":")[0] === SITE_HOST;
}

/** Strip one trailing slash, so /faq/ and /faq share a canonical. */
function normPath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isIndexable(path: string): boolean {
  return INDEXABLE.has(normPath(path));
}

export type HeadLinks = {
  robots: string | null;
  canonical: string | null;
  alternates: { hreflang: string; href: string }[];
};

/**
 * What the <head> says to search engines for one request. `explicitLang` is
 * the ?lang= the URL itself carries (not a cookie), so the Thai and English
 * views of a page each have their own canonical.
 */
export function headLinks(opts: { host: string | undefined | null; path: string; explicitLang?: string | null; status?: number; publicView?: boolean }): HeadLinks {
  const path = normPath(opts.path);
  const ok =
    (opts.status ?? 200) === 200 && isLiveHost(opts.host) && isIndexable(path) && (!PUBLIC_ONLY_WHEN_SAID.has(path) || opts.publicView === true);
  if (!ok) return { robots: "noindex", canonical: null, alternates: [] };
  const lang = opts.explicitLang === "th" || opts.explicitLang === "en" ? opts.explicitLang : DEFAULT_LANG[path] ?? null;
  const at = (l: string | null) => SITE_ORIGIN + path + (l ? `?lang=${l}` : "");
  const alternates = [
    { hreflang: "th", href: at("th") },
    { hreflang: "en", href: at("en") },
  ];
  if (!DEFAULT_LANG[path]) alternates.push({ hreflang: "x-default", href: at(null) });
  return { robots: null, canonical: at(lang), alternates };
}

/** /sw.js and /manifest.webmanifest stay crawlable: Web Push and reminders need the service worker. */
export function robotsTxt(host: string | undefined | null): string {
  if (!isLiveHost(host)) return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin",
    "Disallow: /auth/",
    "Disallow: /cal/",
    "Disallow: /chat",
    "Disallow: /invite/",
    "Disallow: /me/",
    "Disallow: /notifications",
    "Disallow: /settings",
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sitemapXml(): string {
  const urls = SITEMAP.map((path) => {
    const links = headLinks({ host: SITE_HOST, path, publicView: true });
    const alts = links.alternates
      .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${xmlEscape(a.href)}"/>`)
      .join("\n");
    return `  <url>\n    <loc>${xmlEscape(links.canonical ?? SITE_ORIGIN + path)}</loc>\n${alts}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

/** llmstxt.org format: a short, factual map of the public site for answer engines. */
export function llmsTxt(): string {
  const topics = TOPICS.filter((x) => !DATING_LED.has(x.slug));
  return [
    `# ${BRAND.name} (${BRAND.th})`,
    "",
    `> ${BRAND.tagline.en} ${BRAND.tagline.th}`,
    "",
    ABOUT.en,
    "",
    `${BRAND.meaning.en}. ${BRAND.bma.en}.`,
    "",
    "The app is bilingual: Thai first, with English throughout. Add ?lang=en or ?lang=th to any page below.",
    "",
    "## Start here",
    "",
    `- [Jurrgun](${SITE_ORIGIN}/): the homepage, what Jurrgun is and how to start`,
    `- [Intro](${SITE_ORIGIN}/intro): how Jurrgun works, in three short slides`,
    `- [New to Bangkok](${SITE_ORIGIN}/new): for people who moved to the city recently`,
    `- [From abroad](${SITE_ORIGIN}/international?lang=en): for international residents, in English`,
    `- [Bangkok locals](${SITE_ORIGIN}/local): for people who call Bangkok home and want new friends`,
    `- [FAQ](${SITE_ORIGIN}/faq): cost, who can join, language, what happens after an event, privacy`,
    `- [Bangkok Types](${SITE_ORIGIN}/types): the 16 types from the short quiz`,
    "",
    "## Learn",
    "",
    ...topics.map((x) => `- [${x.title.en}](${SITE_ORIGIN}/learn/${x.slug}): ${x.summary.en}`),
    "",
    "## Safety and policies",
    "",
    `- [How we keep you safe](${SITE_ORIGIN}/safety/how)`,
    `- [Code of conduct](${SITE_ORIGIN}/code-of-conduct)`,
    `- [Safety net and helplines](${SITE_ORIGIN}/safety)`,
    `- [Privacy](${SITE_ORIGIN}/privacy)`,
    `- [Terms](${SITE_ORIGIN}/terms)`,
    "",
  ].join("\n");
}

type Lang = "th" | "en";

/** Organization and WebSite, for the signed-out homepage. */
export function siteJsonLd(lang: Lang): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND.name,
      alternateName: BRAND.th,
      url: SITE_ORIGIN,
      logo: SITE_ORIGIN + asset("brand/mark-512.png"),
      slogan: BRAND.tagline[lang],
      // Thai doesn't end a sentence with a full stop.
      description: `${ABOUT[lang]} ${BRAND.bma[lang]}${lang === "en" ? "." : ""}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND.name,
      alternateName: BRAND.th,
      url: SITE_ORIGIN,
      inLanguage: ["th", "en"],
    },
  ];
}

/** FAQPage from the same FAQ list /faq shows in full, in the page's language. */
export function faqJsonLd(lang: Lang): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: lang,
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q[lang],
      acceptedAnswer: { "@type": "Answer", text: f.a[lang] },
    })),
  };
}

/** JSON for a <script type="application/ld+json">, safe against a closing tag in the text. */
export function ldJson(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
