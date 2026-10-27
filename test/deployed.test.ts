import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { isLocalHost, secureCookie } from "../src/lib/deployed";
import { clientIp } from "../src/routes/auth";

describe("isLocalHost", () => {
  it("knows local development hosts", () => {
    for (const h of ["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "::1", "[::1]"]) expect(isLocalHost(h)).toBe(true);
  });
  it("treats everything else as deployed", () => {
    for (const h of ["jurrgun.apps.sv-academy.org", "localhost.evil.example", "127.0.0.2", "example.com"]) expect(isLocalHost(h)).toBe(false);
  });
});

type Probe = { secure: boolean; ip: string };
const read = async (r: Response): Promise<Probe> => (await r.json()) as Probe;

function probe() {
  const app = new Hono();
  app.get("/", (c) => c.json({ secure: secureCookie(c), ip: clientIp(c as never) }));
  return app;
}

describe("secureCookie and clientIp", () => {
  it("Secure is on when deployed, even if the request URL says http", async () => {
    const r = await probe().request("http://jurrgun.apps.sv-academy.org/");
    expect((await read(r)).secure).toBe(true);
  });
  it("Secure is off on a local http dev host", async () => {
    const r = await probe().request("http://localhost:8787/");
    expect((await read(r)).secure).toBe(false);
  });
  it("deployed: x-forwarded-for is ignored, cf-connecting-ip wins", async () => {
    const app = probe();
    const spoof = await app.request("https://jurrgun.apps.sv-academy.org/", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect((await read(spoof)).ip).toBe("unknown");
    const cf = await app.request("https://jurrgun.apps.sv-academy.org/", { headers: { "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" } });
    expect((await read(cf)).ip).toBe("5.6.7.8");
  });
  it("local: x-forwarded-for still works for dev and tests", async () => {
    const r = await probe().request("http://localhost/", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect((await read(r)).ip).toBe("9.9.9.9");
  });
});

describe("burnPasswordCheck", () => {
  it("never accepts a password", async () => {
    const { burnPasswordCheck } = await import("../src/lib/crypto");
    expect(await burnPasswordCheck("anything")).toBe(false);
    expect(await burnPasswordCheck("")).toBe(false);
  });
});
