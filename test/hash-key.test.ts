import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { hashKey, hashKeyFor, MIN_HASH_SECRET } from "../src/lib/hash-key";
import type { AppEnv, Bindings } from "../src/lib/env";

const env = (x: Partial<Bindings>) => x as Bindings;

describe("hash key (JG-3)", () => {
  it("uses IP_HASH_SECRET, then EMAIL_HASH_SALT, and treats short values as missing", () => {
    const long = "x".repeat(MIN_HASH_SECRET);
    expect(hashKey(env({ IP_HASH_SECRET: long, EMAIL_HASH_SALT: "y".repeat(20) }))).toBe(long);
    expect(hashKey(env({ EMAIL_HASH_SALT: long }))).toBe(long);
    expect(hashKey(env({ IP_HASH_SECRET: "short" }))).toBe("");
    expect(hashKey(env({}))).toBe("");
  });

  it("logs hash_secret_missing once on a deployed host, never locally or when set", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new Hono<AppEnv>();
    app.get("/", (c) => c.text(hashKeyFor(c) ? "set" : "none"));
    await app.request("http://localhost/", {}, {});
    expect(spy).not.toHaveBeenCalled();
    await app.request("https://jurrgun.apps.sv-academy.org/", {}, { IP_HASH_SECRET: "z".repeat(32) });
    expect(spy).not.toHaveBeenCalled();
    await app.request("https://jurrgun.apps.sv-academy.org/", {}, {});
    await app.request("https://jurrgun.apps.sv-academy.org/", {}, {});
    const lines = spy.mock.calls.map((a) => a.join(" ")).filter((l) => l.includes("hash_secret_missing"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/z{8}/);
    spy.mockRestore();
  });
});
