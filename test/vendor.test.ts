/**
 * The bundled sv-map browser files: served with the right types, and identical
 * to the installed package (re-run `npm run svmap` after updating it).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { SV_MAP_VERSION } from "../src/vendor/sv-map.generated";
import { svMapCss, svMapJs } from "../src/routes/vendor";

describe("sv-map vendor files", () => {
  it("serves the JS module and the stylesheet", async () => {
    const js = await app.request("/vendor/sv-map.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    expect(await js.text()).toContain("export async function createMap");
    const css = await app.request("/vendor/sv-map.css");
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  it("keeps the deploy pipeline's module scan clean (no `from \"./…\"` in the bundle source)", async () => {
    const gen = readFileSync("src/vendor/sv-map.generated.ts", "utf8");
    expect(gen).not.toMatch(/from "\.\//);
  });

  it("matches the installed package exactly", () => {
    const pkg = JSON.parse(readFileSync("node_modules/sv-map/package.json", "utf8"));
    expect(SV_MAP_VERSION).toBe(pkg.version);
    expect(svMapJs()).toBe(readFileSync("node_modules/sv-map/src/sv-map.js", "utf8"));
    expect(svMapCss()).toBe(readFileSync("node_modules/sv-map/src/sv-map.css", "utf8"));
  });
});
