/** Member, settings and chat pages say noindex even on the live host (Marketing M1, Website review). */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { createMember, ENV, HAS_DB } from "./helpers";

const LIVE = "https://jurrgun.apps.sv-academy.org";

describe.skipIf(!HAS_DB)("noindex on signed-in pages", () => {
  it("events, settings, chat and my events are noindex with no canonical or JSON-LD", async () => {
    const m = await createMember();
    for (const path of ["/events", "/settings", "/chat", "/me/events", "/connections"]) {
      const res = await app.request(`${LIVE}${path}`, { headers: { cookie: m.cookie, accept: "text/html" } }, ENV);
      expect(res.status, path).toBe(200);
      const page = await res.text();
      expect(page, path).toContain('<meta name="robots" content="noindex"/>');
      expect(page, path).not.toContain('rel="canonical"');
      expect(page, path).not.toContain("application/ld+json");
    }
  });
});
