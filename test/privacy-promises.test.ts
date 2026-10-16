/**
 * The privacy notice, the Terms and "How we keep you safe" against the code,
 * one promise at a time, so the words and the code can't drift apart
 * (owner, 16 Oct 2026: design/reference/privacy-risk-assessment.md §7).
 *
 * Tests marked PENDING describe code another change is bringing (retention
 * periods for reports, the audit log and read notifications, keyed IP hashes,
 * the consent rows for relationship status and gender). They fail until it lands.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import app from "../src/index";
import * as retention from "../src/services/retention";
import * as rules from "../src/domain/rules";
import * as session from "../src/lib/session";
import { SV_MAP_JS_B64 } from "../src/vendor/sv-map.generated";
import { CONSENT_CATEGORIES, COOKIES, DEVICE_STORAGE, PROCESSORS, RETENTION, periodDays, periodText } from "../src/content/privacy";
import { SAFETY_PROMISES } from "../src/routes/policies";

const DASHES = /[–—]/;
const FILES = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("vendor/") && !f.endsWith("assets.ts"))
  .map((f) => ({ path: `src/${f}`, text: readFileSync(`src/${f}`, "utf8") }));
const ALL = FILES.map((f) => f.text).join("\n");

const get = async (path: string, lang: "th" | "en") => (await app.request(path, { headers: { cookie: `lang=${lang}` } })).text();
/** What a reader sees: the main content without scripts, styles or tags. */
const words = (html: string) =>
  html
    .slice(html.indexOf("<main"), html.indexOf("</main>"))
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");

const MODULES: Record<string, Record<string, unknown>> = {
  "services/retention": retention as unknown as Record<string, unknown>,
  "domain/rules": rules as unknown as Record<string, unknown>,
  "lib/session": session as unknown as Record<string, unknown>,
};

describe("privacy notice: retention periods match the code", () => {
  for (const item of RETENTION.filter((r) => r.period && r.code)) {
    const mod = MODULES[item.from ?? "services/retention"];
    const want = periodDays(item.period!);
    const pending = item.code instanceof RegExp ? " (PENDING: retention constant from the privacy fixes)" : "";
    it(`${item.what.en}: ${periodText(item.period!).en}${pending}`, () => {
      if (typeof item.code === "string") {
        expect(mod[item.code], item.code).toBe(want);
      } else {
        const names = Object.keys(mod).filter((k) => (item.code as RegExp).test(k));
        expect(names, `an exported constant matching ${item.code}`).not.toHaveLength(0);
        for (const n of names) expect(mod[n], n).toBe(want);
      }
    });
  }

  it("strikes are kept as long as reports (PENDING: retention constant from the privacy fixes)", () => {
    const mod = MODULES["services/retention"];
    const names = Object.keys(mod).filter((k) => /STRIKE/.test(k) && /DAYS$/.test(k));
    const reports = RETENTION.find((r) => r.what.en.startsWith("Reports"))!;
    expect(names).not.toHaveLength(0);
    for (const n of names) expect(mod[n], n).toBe(periodDays(reports.period!));
  });

  it("the email codes go with the sign-in attempts, after 24 hours", async () => {
    const { CODE_RETENTION_HOURS } = await import("../src/services/email-code");
    expect(CODE_RETENTION_HOURS).toBe(retention.LOGIN_ATTEMPT_RETENTION_HOURS);
  });

  it("every period is on the page, in both languages", async () => {
    for (const lang of ["th", "en"] as const) {
      const text = words(await get("/privacy", lang));
      for (const r of RETENTION) {
        expect(text).toContain(r.what[lang]);
        if (r.period) expect(text).toContain(periodText(r.period)[lang]);
      }
    }
  });
});

describe("privacy notice: cookies and device storage", () => {
  /** Every cookie name the app sets, resolved from setCookie(c, NAME, …). */
  function setCookieNames(): string[] {
    const names = new Set<string>();
    for (const m of ALL.matchAll(/setCookie\(\s*c\s*,\s*([^,]+?)\s*,/g)) {
      const arg = m[1].trim();
      const lit = /^["'`]([^"'`]+)["'`]$/.exec(arg);
      if (lit) {
        names.add(lit[1]);
        continue;
      }
      const ternary = arg.split(/[?:]/).map((x) => x.trim()).filter((x) => /^[A-Z_]+$/.test(x));
      const idents = ternary.length ? ternary : [];
      const call = /^([a-zA-Z]+)\(/.exec(arg);
      if (call) {
        const def = new RegExp(`const ${call[1]} = \\([^)]*\\) => \`([^$\`]+)\\$`).exec(ALL);
        expect(def, `definition of ${call[1]}`).not.toBeNull();
        names.add(def![1]);
        continue;
      }
      for (const id of idents.length ? idents : [arg]) {
        const def = new RegExp(`const ${id} = "([^"]+)"`).exec(ALL);
        expect(def, `definition of ${id}`).not.toBeNull();
        names.add(def![1]);
      }
    }
    return [...names];
  }

  it("lists every cookie the app sets, and nothing it doesn't", () => {
    const set = setCookieNames();
    expect(set.length).toBeGreaterThan(5);
    for (const name of set) expect(COOKIES.map((k) => k.name), name).toContain(name);
    for (const k of COOKIES) expect(set, k.name).toContain(k.name);
  });

  it("names the session, language, intro and theme stores the owner asked about", () => {
    const names = [...COOKIES, ...DEVICE_STORAGE].map((k) => k.name);
    for (const n of ["bkk_sid", "lang", "jg_intro", "jg_src", "bkk-a11y"]) expect(names).toContain(n);
    // The theme is a device setting, not a cookie.
    expect(COOKIES.map((k) => k.name)).not.toContain("theme");
  });

  it("lists every key kept in the browser's local storage", () => {
    const keys = new Set<string>();
    for (const f of FILES.filter((x) => x.text.includes("localStorage"))) {
      for (const m of f.text.matchAll(/"(bkk-[a-z0-9-]+)"/g)) keys.add(m[1]);
    }
    // An older text-size key, read once and removed on the next save.
    keys.delete("bkk-text");
    expect(keys.size).toBeGreaterThan(2);
    for (const k of keys) expect(DEVICE_STORAGE.map((d) => d.name), k).toContain(k);
  });

  it("shows every cookie and stored key on the page", async () => {
    const html = await get("/privacy", "en");
    for (const k of [...COOKIES, ...DEVICE_STORAGE]) expect(html).toContain(k.name);
  });
});

describe("privacy notice: who else is involved", () => {
  const mapJs = atob(SV_MAP_JS_B64);
  /** Hosts the app or the browser talks to, and the provider that covers each. */
  const HOSTS: [RegExp, string][] = [
    [/accounts\.google\.com|oauth2\.googleapis\.com/, "Google"],
    [/access\.line\.me|api\.line\.me|\/\/line\.me/, "LINE"],
    [/api\.resend\.com/, "Resend"],
    [/api\.postmarkapp\.com/, "Postmark"],
    [/arcgisonline\.com/, "Esri"],
    [/tile\.openstreetmap\.org/, "OpenStreetMap"],
    [/cdn\.jsdelivr\.net/, "jsDelivr"],
    [/google\.com\/maps/, "Google Maps"],
    [/open-meteo\.com/, "Open-Meteo"],
  ];
  const outbound = [
    ...FILES.filter((f) => /src\/(services|lib)\/|routes\/(oauth|events)\.tsx/.test(f.path)).flatMap((f) => [...f.text.matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/maps)?/g)].map((m) => m[0])),
    ...[...mapJs.matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/g)].map((m) => m[0]),
  ].filter((u) => !/sv-academy\.org|example\.|w3\.org|schema\.org/.test(u));

  it("names a provider for every outside address in the code", () => {
    const names = PROCESSORS.map((p) => p.name).join(" · ");
    for (const url of new Set(outbound)) {
      const hit = HOSTS.find(([re]) => re.test(url));
      expect(hit, `a provider for ${url}`).toBeDefined();
      expect(names).toContain(hit![1]);
    }
  });

  it("names hosting, sign-in, email, push, maps and transfers on the page", async () => {
    for (const lang of ["th", "en"] as const) {
      const text = words(await get("/privacy", lang));
      for (const p of PROCESSORS) expect(text).toContain(p.name);
      for (const n of ["SV Cloud", "Cloudflare", "Google", "LINE", "Resend", "Postmark", "Apple", "Mozilla", "Microsoft", "Esri", "Google Maps"]) expect(text).toContain(n);
    }
    expect(words(await get("/privacy", "en"))).toContain("outside Thailand");
    expect(words(await get("/privacy", "th"))).toContain("นอกประเทศไทย");
  });

  it("Google and LINE sign-in asks for openid only", () => {
    const oauth = readFileSync("src/routes/oauth.tsx", "utf8");
    expect(oauth).toContain('scope: "openid"');
    expect(oauth).not.toMatch(/scope: "[^"]*(email|profile)/);
  });

  it("push messages are encrypted before they reach a push service", () => {
    expect(readFileSync("src/lib/webpush.ts", "utf8")).toContain("aes128gcm");
  });

  it("the map's my location button stays in the browser", () => {
    expect(mapJs).toContain("my location: stays in the browser");
    expect(mapJs).not.toMatch(/fetch\([^)]*(coords|lat)/);
  });

  it("IP addresses are hashed with a secret key (PENDING: keyed IP hashes from the privacy fixes)", () => {
    const auth = readFileSync("src/routes/auth.tsx", "utf8");
    const start = auth.indexOf("export async function ipKey");
    const fn = auth.slice(start, auth.indexOf("\n}\n", start));
    expect(fn.length).toBeGreaterThan(40);
    expect(fn).not.toMatch(/sha256\(ip\)/);
  });
});

describe("privacy notice: consents", () => {
  /** Category names the code writes: literals and the named constants. */
  function writtenCategories(): Set<string> {
    const out = new Set<string>();
    for (const m of ALL.matchAll(/insert\(consents\)\s*\.values\(\{[^}]*?category: "([a-z_]+)"/g)) out.add(m[1]);
    // Consent helpers write categories through named constants (e.g. check(RELATIONSHIP_CONSENT, ...)).
    for (const m of ALL.matchAll(/(?:category: |check\(|consentRow\([^,]+,[^,]+, )([A-Z_]+_CONSENT)\b/g)) {
      const def = new RegExp(`const ${m[1]} = "([^"]+)"`).exec(ALL);
      if (def) out.add(def[1]);
    }
    // Onboarding writes its CONSENT_ITEMS keys.
    const items = /const CONSENT_ITEMS[\s\S]*?\];/.exec(readFileSync("src/routes/onboarding.tsx", "utf8"))![0];
    for (const m of items.matchAll(/key: "([a-z_]+)"/g)) out.add(m[1]);
    return out;
  }

  it("the consent centre lists every category the code writes", () => {
    const listed = CONSENT_CATEGORIES.map((c) => c.key);
    for (const cat of writtenCategories()) expect(listed, cat).toContain(cat);
  });

  it("every listed category is written somewhere (PENDING: relationship and gender consent rows from the privacy fixes)", () => {
    const written = writtenCategories();
    for (const c of CONSENT_CATEGORIES) expect([...written], c.key).toContain(c.key);
  });

  it("service and safety are explained, never switched off with a toggle", () => {
    for (const key of ["service", "safety"]) expect(CONSENT_CATEGORIES.find((c) => c.key === key)?.control).toBe("required");
    for (const key of ["personalization", "research", "notifications", "profile_links"]) expect(CONSENT_CATEGORIES.find((c) => c.key === key)?.control).toBe("toggle");
  });
});

describe("Terms and safety page match the rules", () => {
  it("the Terms quote the age, flags, suspension and late-cancel rules from the code", async () => {
    const en = words(await get("/terms", "en"));
    expect(en).toContain(`You're ${rules.MIN_AGE} or over.`);
    expect(en).toContain(`${rules.FLAGS_TO_REMOVE} flags mean a ${rules.FLAG_SUSPEND_DAYS}-day suspension.`);
    expect(en).toContain(`under ${rules.LATE_CANCEL_HOURS} hours`);
    expect(en).toContain(`deleted after ${retention.DEACTIVATED_RETENTION_DAYS} days`);
    expect(rules.FLAG_WINDOW_DAYS).toBe(365);
    expect(en).toContain("a flag counts for 1 year");
    const th = words(await get("/terms", "th"));
    expect(th).toContain(`อายุ ${rules.MIN_AGE} ปีขึ้นไป`);
    expect(th).toContain("กฎหมายไทย");
  });

  it("the Terms cover every part of the brief (section 6)", async () => {
    const en = words(await get("/terms", "en"));
    for (const h of ["Who runs Jurrgun", "A pilot", "Who can join", "Safety rules", "If someone breaks the rules", "Block and report", "What you post", "Paid events", "Meeting in person", "Closing an account", "Changes to these Terms", "Law and contact"]) {
      expect(en).toContain(h);
    }
    expect(en).toContain("independent app");
    expect(en).not.toMatch(/endorse|made by the BMA|BMA's app/i);
  });

  it("the safety page has every promise, one line each", async () => {
    for (const lang of ["th", "en"] as const) {
      const text = words(await get("/safety/how", lang));
      for (const s of SAFETY_PROMISES) {
        expect(text).toContain(s.title[lang]);
        expect(text).toContain(s.line[lang]);
      }
    }
    expect(SAFETY_PROMISES.map((s) => s.title.en)).toEqual(
      expect.arrayContaining(["Mutual only", "No cold messages", "Women-only tables", "Staff can't see dating data", "Block and report", "Check-in at real places", "Day-of status"]),
    );
  });

  it("women-only spaces are for women and non-binary members, as the safety page says", () => {
    expect(rules.canBeWomenOnly("woman")).toBe(true);
    expect(rules.canBeWomenOnly("man")).toBe(false);
    expect(rules.womenOnlyOk({ gender: "woman", womenOnly: true }, { gender: "man" })).toBe(false);
  });

  it("the footer links the safety page on every page, and the guide and Safety net link it too", async () => {
    expect(await get("/privacy", "en")).toContain('href="/safety/how"');
    expect(readFileSync("src/routes/guide.tsx", "utf8")).toContain('href="/safety/how"');
    expect(await get("/safety", "en")).toContain('href="/safety/how"');
  });
});

describe("the contact line and no placeholders", () => {
  it("the notice has the BMA privacy contact, word for word", async () => {
    expect(words(await get("/privacy", "th"))).toContain(
      "ติดต่อเรื่องข้อมูลส่วนตัว: กรุงเทพมหานคร (ผู้ดูแลและกำกับบริการ) ศาลาว่าการกรุงเทพมหานคร 173 ถนนดินสอ แขวงเสาชิงช้า เขตพระนคร กรุงเทพฯ 10200 · สายด่วน 1555",
    );
    expect(words(await get("/privacy", "en"))).toContain(
      "Privacy contact: Bangkok Metropolitan Administration (host and overseer of this service), Bangkok City Hall, 173 Dinso Road, Sao Chingcha, Phra Nakhon, Bangkok 10200 · Hotline 1555",
    );
  });

  it("the notice, Terms, safety page and consent words have no placeholders or dashes", async () => {
    for (const path of ["/privacy", "/terms", "/safety/how"]) {
      for (const lang of ["th", "en"] as const) {
        const text = words(await get(path, lang));
        expect(text, `${path} ${lang}`).not.toContain("[");
        expect(text, `${path} ${lang}`).not.toMatch(/to be provided|placeholder|TBD|TODO|รอเจ้าของ|รอระบุ/i);
        expect(text, `${path} ${lang}`).not.toMatch(DASHES);
      }
    }
    const content = readFileSync("src/content/privacy.ts", "utf8");
    expect(content).not.toMatch(DASHES);
    expect(content).not.toMatch(/to be provided|รอเจ้าของ/i);
  });
});
