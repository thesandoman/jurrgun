/**
 * Sanroo's city headline for City Pulse's "Bangkok now" (owner D63).
 *
 * Sanroo (แสนรู้, floodmap.apps.sv-academy.org) is a live Bangkok map of
 * water, rain, air and traffic. Its /api/summary is a short written summary
 * of city conditions. Nothing about the member is sent: it is a plain GET
 * with no parameters. Cached in memory for 30 minutes per isolate; a slow or
 * failed request just leaves the headline out.
 */

export const SANROO_URL = "https://floodmap.apps.sv-academy.org/";
export const SANROO_SUMMARY_URL = "https://floodmap.apps.sv-academy.org/api/summary";

export type SanrooHeadline = { th: string; en: string; at: string | null; fetchedAt: number };

const TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 1500;
const MAX = 160;

/** Pure: keep a short, plain headline from the summary response, or null. */
export function parseSanroo(raw: unknown, now = Date.now()): SanrooHeadline | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX) : "");
  const th = clean(r.headlineTh);
  const en = clean(r.headlineEn);
  if (!th && !en) return null;
  return { th: th || en, en: en || th, at: typeof r.createdAt === "string" ? r.createdAt : null, fetchedAt: now };
}

let cache: SanrooHeadline | null = null;
let inflight: Promise<SanrooHeadline | null> | null = null;

export async function sanrooHeadline(env: { NO_EXTERNAL?: string }, now = Date.now()): Promise<SanrooHeadline | null> {
  if (env.NO_EXTERNAL) return null; // tests and offline development
  if (cache && now - cache.fetchedAt < TTL_MS) return cache;
  inflight ??= (async () => {
    try {
      const r = await fetch(SANROO_SUMMARY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
      const got = r.ok ? parseSanroo(await r.json(), now) : null;
      if (got) cache = got;
      return cache;
    } catch {
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
