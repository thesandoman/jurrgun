/**
 * "What the city heard" for members (owner D63, D65): rounded shares of a
 * closed City Pulse question, under the same k as the BMA's totals.
 *
 * - Nothing shows until K_THRESHOLD people answered.
 * - An answer picked by fewer than K_THRESHOLD people is left out.
 * - Shares are "about N in 10", never exact counts or percentages, so two
 *   views (city and district) can't be subtracted into a small group's answers.
 */
import { safeCount } from "./rules";

export type Share = { value: string; tenths: number };

/** Top answers as "about N in 10". tenths 0 means "under 1 in 10". Null when too few answered. */
export function heardShares(n: number, counts: Map<string, number>, max = 3): Share[] | null {
  if (safeCount(n) === null || n <= 0) return null;
  const out = [...counts]
    .filter(([, k]) => safeCount(k) !== null)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([value, k]) => ({ value, tenths: Math.min(10, Math.round((k / n) * 10)) }));
  return out.length ? out : null;
}

/** Monday 00:00 in Bangkok (UTC+7, no DST) for the week holding `now`. */
export function bkkWeekStart(now: Date): Date {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  const dow = (local.getUTCDay() + 6) % 7; // Monday 0
  const mid = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
  return new Date(mid - 7 * 3_600_000);
}

/** The Monday that starts this Bangkok week, as YYYY-MM-DD: the key for once-a-week limits. */
export function bkkWeekKey(now: Date): string {
  return new Date(bkkWeekStart(now).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** YYYY-MM in Bangkok time: the only time stored with place checks and suggestions. */
export function bkkMonth(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
}
