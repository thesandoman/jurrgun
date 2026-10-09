/**
 * Starter regression tests. These run in CI before every deploy, so a failure
 * here blocks the deploy instead of shipping a broken site.
 *
 * `app.request()` calls a route directly — no server, no network, milliseconds.
 * Copy this shape for every route you add, and add the unhappy path too.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";

/** A returning visitor (has seen the intro). */
const seen = { headers: { cookie: "jg_intro=seen" } };

describe("GET /", () => {
  it("sends a first-time visitor to the intro, once", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/intro");
  });

  it("serves the landing page as HTML to returning visitors", async () => {
    const res = await app.request("/", seen);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("shows the Jurrgun landing page in Thai by default", async () => {
    const body = await (await app.request("/", seen)).text();
    expect(body).toContain("Jurrgun");
    expect(body).toContain("เจอกัน");
    expect(body).toContain('lang="th"');
  });

  it("switches to English with ?lang=en", async () => {
    const body = await (await app.request("/?lang=en", seen)).text();
    expect(body).toContain("Small groups. Real places. No swiping.");
  });
});

describe("GET /intro", () => {
  it("explains the name, sets the seen cookie and ends in sign-up", async () => {
    const res = await app.request("/intro?lang=en");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("jg_intro=seen");
    const html = await res.text();
    expect(html).toContain("see you later");
    expect(html.match(/class="intro-slide/g)?.length).toBe(5);
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('class="tabbar"');
  });

  it("serves the new app icon", async () => {
    const svg = await (await app.request("/icon.svg")).text();
    expect(svg).toContain("#16a34a"); // waving-hand mark
    const manifest = (await (await app.request("/manifest.webmanifest")).json()) as { name: string; theme_color: string };
    expect(manifest.name).toContain("Jurrgun");
    expect(manifest.theme_color).toBe("#0c8a45");
  });
});

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/hello", () => {
  it("greets the world by default", async () => {
    const res = await app.request("/api/hello");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Hello, world!" });
  });

  it("greets a supplied name", async () => {
    const res = await app.request("/api/hello?name=Somchai");
    expect(await res.json()).toEqual({ message: "Hello, Somchai!" });
  });

  // The unhappy path matters as much as the happy one — this is where bugs live.
  it("rejects an over-long name with 400, not a crash", async () => {
    const res = await app.request(`/api/hello?name=${"a".repeat(65)}`);
    expect(res.status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("answers 404 with JSON rather than an empty body", async () => {
    const res = await app.request("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("GET /assets/*", () => {
  it("404s when the object is not in the bucket", async () => {
    const res = await app.request("/assets/missing.png", {}, {
      BUCKET: { get: async () => null },
    });
    expect(res.status).toBe(404);
  });

  it("serves the object with its content type", async () => {
    const res = await app.request("/assets/logo.svg", {}, {
      BUCKET: {
        get: async (key: string) => {
          expect(key).toBe("assets/logo.svg");
          return {
            body: new Blob(["<svg></svg>"]).stream(),
            httpEtag: '"abc123"',
            httpMetadata: { contentType: "image/svg+xml" },
            uploaded: new Date("2026-08-01T00:00:00.000Z"),
            size: 11,
          };
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("etag")).toBe('"abc123"');
  });

  it("falls back to a generic content type when none is stored", async () => {
    const res = await app.request("/assets/nested/hero.mp4", {}, {
      BUCKET: {
        get: async (key: string) => {
          expect(key).toBe("assets/nested/hero.mp4");
          return {
            body: new Blob(["x"]).stream(),
            httpEtag: '"e"',
            httpMetadata: {},
            uploaded: new Date("2026-08-01T00:00:00.000Z"),
            size: 1,
          };
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });
});
