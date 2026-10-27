/**
 * Local development or the deployed app? Decided from the request's own host,
 * so nothing here depends on a setting being present.
 *
 * Local means localhost, 127.0.0.1, [::1] or a *.localhost name (wrangler dev,
 * vitest's default http://localhost). Everything else is treated as deployed.
 */
import type { Context } from "hono";

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1";
}

/** True unless this request came to a local development host. */
export function isDeployed(c: Context): boolean {
  return !isLocalHost(new URL(c.req.url).hostname);
}

/**
 * The cookie `Secure` flag: always on when deployed, whatever protocol the
 * request URL reports, so a cookie can never be set for plain http in
 * production. Off on local hosts, where dev servers run over http.
 */
export function secureCookie(c: Context): boolean {
  return isDeployed(c) || new URL(c.req.url).protocol === "https:";
}
