/** Task 10: a first-time visitor gets Thai or English from the browser, until they choose. */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { langFromHeader } from "../src/lib/i18n";

describe("langFromHeader", () => {
  it("picks Thai whenever Thai is in the list, English when it isn't, Thai with no header", () => {
    expect(langFromHeader("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(langFromHeader("en-US,en;q=0.9,th;q=0.5")).toBe("th");
    expect(langFromHeader("en-GB,en;q=0.9")).toBe("en");
    expect(langFromHeader("ja-JP,ja;q=0.9")).toBe("en");
    expect(langFromHeader(undefined)).toBe("th");
    expect(langFromHeader("*")).toBe("th");
  });
});

describe("first visit language", () => {
  it("follows the browser, but a chosen language always wins", async () => {
    const en = await (await app.request("/privacy", { headers: { "accept-language": "en-US,en;q=0.9" } })).text();
    expect(en).toContain('<html lang="en"');
    const th = await (await app.request("/privacy", { headers: { "accept-language": "th-TH" } })).text();
    expect(th).toContain('<html lang="th"');
    const chosen = await (await app.request("/privacy", { headers: { "accept-language": "en-US", cookie: "lang=th" } })).text();
    expect(chosen).toContain('<html lang="th"');
  });
});
