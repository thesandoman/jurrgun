/**
 * Serves bundled third-party browser files (no CDN of ours to depend on).
 * The content is versioned by the URL (?v=), so it can be cached hard.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { SV_MAP_CSS_B64, SV_MAP_JS_B64 } from "../vendor/sv-map.generated";

export const vendorRoutes = new Hono<AppEnv>();

const LONG = "public, max-age=86400, stale-while-revalidate=604800";

/** UTF-8 text from base64 (decoded once per isolate, then reused). */
function fromB64(b64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}
let js: string | undefined;
let css: string | undefined;
export const svMapJs = () => (js ??= fromB64(SV_MAP_JS_B64));
export const svMapCss = () => (css ??= fromB64(SV_MAP_CSS_B64));

vendorRoutes.get("/vendor/sv-map.js", (c) =>
  c.body(svMapJs(), 200, { "content-type": "application/javascript; charset=utf-8", "cache-control": LONG }),
);
vendorRoutes.get("/vendor/sv-map.css", (c) =>
  c.body(svMapCss(), 200, { "content-type": "text/css; charset=utf-8", "cache-control": LONG }),
);
