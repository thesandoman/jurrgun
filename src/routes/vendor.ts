/**
 * Serves bundled third-party browser files (no CDN of ours to depend on).
 * The content is versioned by the URL (?v=), so it can be cached hard.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { SV_MAP_CSS, SV_MAP_JS } from "../vendor/sv-map.generated";

export const vendorRoutes = new Hono<AppEnv>();

const LONG = "public, max-age=86400, stale-while-revalidate=604800";

vendorRoutes.get("/vendor/sv-map.js", (c) =>
  c.body(SV_MAP_JS, 200, { "content-type": "application/javascript; charset=utf-8", "cache-control": LONG }),
);
vendorRoutes.get("/vendor/sv-map.css", (c) =>
  c.body(SV_MAP_CSS, 200, { "content-type": "text/css; charset=utf-8", "cache-control": LONG }),
);
