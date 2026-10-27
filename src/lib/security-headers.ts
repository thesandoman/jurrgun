/**
 * Security headers on every response (owner card S1, 2026-10-27).
 *
 * Enforced now:
 *   Strict-Transport-Security   HTTPS only, for a year (deployed hosts only)
 *   X-Frame-Options: DENY       nothing may frame Jurrgun (clickjacking); CSP
 *                               frame-ancestors joins it once the CSP is enforced
 *   X-Content-Type-Options      no MIME sniffing
 *   Referrer-Policy             other sites see our origin, never the path
 *   Permissions-Policy          camera for check-in QR scanning, location for the
 *                               map's Locate button (both this site only); no
 *                               microphone, payment or USB
 *
 * Report-only for two weeks, then enforced (CSP_ENFORCE):
 *   Content-Security-Policy     scripts only with this response's nonce, from
 *                               us, or MapLibre on jsDelivr; map tiles from Esri
 *                               and OpenStreetMap. Violations go to
 *                               /api/csp-report, which logs the directive and
 *                               the blocked origin only, never the page path.
 */
import type { MiddlewareHandler } from "hono";
import { isDeployed } from "./deployed";
import type { AppEnv } from "./env";
import { randomToken } from "./crypto";

/** Flip to true once two weeks of reports are clean. */
export const CSP_ENFORCE = false;
export const CSP_REPORT_PATH = "/api/csp-report";

const MAP_TILES = ["https://server.arcgisonline.com", "https://tile.openstreetmap.org"];
const MAP_CODE = "https://cdn.jsdelivr.net";
const OAUTH = ["https://accounts.google.com", "https://access.line.me"];

export function cspFor(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${MAP_CODE}`,
    // Inline <style> blocks and style attributes are everywhere; styles can't run code.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // Photos and assets come from signed storage URLs; tiles from the map hosts.
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${MAP_TILES.join(" ")} ${MAP_CODE}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `form-action 'self' ${OAUTH.join(" ")}`,
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

export const PERMISSIONS_POLICY = "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()";

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  const nonce = randomToken(16);
  c.set("nonce", nonce);
  await next();
  const h = c.res.headers;
  if (isDeployed(c)) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Frame-Options", "DENY");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", PERMISSIONS_POLICY);
  if ((h.get("content-type") ?? "").startsWith("text/html")) {
    h.set(CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", cspFor(nonce));
  }
};

/**
 * Shrinks a CSP violation report to what's safe to log: the directive and the
 * blocked origin ("inline", "eval" or a scheme+host). The page path, source
 * file, sample text and anything else the browser sent are dropped, so no
 * member URL or content reaches the logs.
 */
export function cspReportSummary(raw: string): { directive: string; blocked: string } | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = (body && typeof body === "object" && "csp-report" in body ? (body as Record<string, unknown>)["csp-report"] : body) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const directive = String(r["effective-directive"] ?? r["violated-directive"] ?? "").split(" ")[0].slice(0, 40);
  const uri = String(r["blocked-uri"] ?? "");
  let blocked = uri.slice(0, 20);
  if (/^https?:/i.test(uri)) {
    try {
      blocked = new URL(uri).origin;
    } catch {
      blocked = "invalid";
    }
  }
  return directive ? { directive, blocked } : null;
}
