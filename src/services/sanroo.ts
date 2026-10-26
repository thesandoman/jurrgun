/**
 * Sanroo's city headline for City Pulse's "Bangkok now" (owner D63).
 *
 * Sanroo (แสนรู้, floodmap.apps.sv-academy.org) is a live Bangkok map of
 * water, rain, air and traffic. Its /api/summary is a short written summary
 * of city conditions. Nothing about the member is sent: it is a plain GET
 * with no parameters. The hourly clock fetches it (fetchSanrooHeadline) into
 * social_city_now; pages read that row (sanrooHeadline), so no member's page
 * waits on Sanroo (owner card D1). A failed fetch keeps the last headline.
 */

import type { DatabaseEnv } from "../db";
import { cityNow } from "./city-now";

export const SANROO_URL = "https://floodmap.apps.sv-academy.org/";
export const SANROO_SUMMARY_URL = "https://floodmap.apps.sv-academy.org/api/summary";

export type SanrooHeadline = { th: string; en: string; at: string | null; fetchedAt: number };

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

/** Live fetch, for the hourly clock only (services/city-now.ts). Null when it fails. */
export async function fetchSanrooHeadline(now = Date.now(), get: typeof fetch = fetch): Promise<SanrooHeadline | null> {
  try {
    const r = await get(SANROO_SUMMARY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    return r.ok ? parseSanroo(await r.json(), now) : null;
  } catch {
    return null;
  }
}

/** The latest stored headline (fetched by the hourly clock), or null. One database read, no outside call. */
export async function sanrooHeadline(env: DatabaseEnv): Promise<SanrooHeadline | null> {
  return (await cityNow(env)).sanroo;
}
