import { describe, expect, it } from "vitest";
import app from "../src/index";
import { cspReportSummary, PERMISSIONS_POLICY } from "../src/lib/security-headers";

const PAGES = ["/privacy", "/intro", "/login", "/signup"];

async function get(url: string) {
  return app.request(url, {}, {} as never);
}

describe("security headers (card S1)", () => {
  it("every page carries the enforced headers", async () => {
    for (const p of PAGES) {
      const r = await get(`https://jurrgun.apps.sv-academy.org${p}`);
      expect(r.headers.get("x-frame-options"), p).toBe("DENY");
      expect(r.headers.get("x-content-type-options"), p).toBe("nosniff");
      expect(r.headers.get("referrer-policy"), p).toBe("strict-origin-when-cross-origin");
      expect(r.headers.get("permissions-policy"), p).toBe(PERMISSIONS_POLICY);
      expect(r.headers.get("strict-transport-security"), p).toMatch(/^max-age=31536000/);
    }
  });

  it("HSTS only when deployed, never on localhost", async () => {
    const r = await get("http://localhost/privacy");
    expect(r.headers.get("strict-transport-security")).toBeNull();
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });

  it("CSP is report-only for now, and every executable inline script carries this response's nonce", async () => {
    for (const p of PAGES) {
      const r = await get(`https://jurrgun.apps.sv-academy.org${p}`);
      expect(r.headers.get("content-security-policy"), p).toBeNull();
      const csp = r.headers.get("content-security-policy-report-only") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce, p).toBeTruthy();
      const html = await r.text();
      const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      expect(tags.length, p).toBeGreaterThan(0);
      for (const tag of tags) {
        if (/type="application\/(ld\+)?json"/.test(tag)) continue;
        expect(tag, `${p}: ${tag}`).toContain(`nonce="${nonce}"`);
      }
    }
  });

  it("each response gets a fresh nonce", async () => {
    const a = (await get("https://jurrgun.apps.sv-academy.org/privacy")).headers.get("content-security-policy-report-only");
    const b = (await get("https://jurrgun.apps.sv-academy.org/privacy")).headers.get("content-security-policy-report-only");
    expect(a).not.toBe(b);
  });

  it("JSON responses get the headers but no CSP", async () => {
    const r = await get("https://jurrgun.apps.sv-academy.org/api/hello");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy-report-only")).toBeNull();
  });
});

describe("CSP reports", () => {
  it("accepts a browser report without an Origin check and answers 204", async () => {
    const body = JSON.stringify({ "csp-report": { "document-uri": "https://jurrgun.apps.sv-academy.org/events/abc?x=1", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?token=1" } });
    const r = await app.request("https://jurrgun.apps.sv-academy.org/api/csp-report", { method: "POST", body, headers: { "content-type": "application/csp-report", origin: "null" } }, {} as never);
    expect(r.status).toBe(204);
  });

  it("keeps only the directive and the blocked origin, never the page path", () => {
    const s = cspReportSummary(JSON.stringify({ "csp-report": { "document-uri": "https://jurrgun.apps.sv-academy.org/events/abc", "violated-directive": "img-src 'self'", "blocked-uri": "https://evil.example/a/b?c=d", "script-sample": "secret" } }));
    expect(s).toEqual({ directive: "img-src", blocked: "https://evil.example" });
    expect(cspReportSummary(JSON.stringify({ "effective-directive": "script-src", "blocked-uri": "inline" }))).toEqual({ directive: "script-src", blocked: "inline" });
    expect(cspReportSummary("not json")).toBeNull();
  });
});
