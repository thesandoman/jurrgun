/**
 * Outcomes for M&E (admins) and for circle hosts. Pure: no database.
 *
 * Every figure comes with the size of its base and is suppressed (null) when
 * that base is under k: k = 10 for admin views (K_THRESHOLD in rules.ts) and
 * k = 5 for a host's own events, which are smaller. Nothing here ranks or
 * scores a person.
 */
import { K_THRESHOLD } from "./rules";

export const HOST_K = 5;

/** A percentage (0 to 100, rounded), or null when the base is under k. */
export function pctOf(n: number, base: number, k = K_THRESHOLD): number | null {
  return base >= k && base > 0 ? Math.round((n / base) * 100) : null;
}

/** An average to one decimal, or null when there are fewer than k values. */
export function avgOf(values: number[], k = K_THRESHOLD): number | null {
  return values.length >= k ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

export type FeedbackRow = { feltSafe: number | null; feltHeard: number | null; wouldMeetAgain: boolean | null; metNewPerson?: boolean | null };

/** Felt safe (4 or 5 of 5), felt heard (average), would meet again, met someone new. */
export function feedbackSummary(rows: FeedbackRow[], k = K_THRESHOLD) {
  const safe = rows.filter((r) => r.feltSafe !== null);
  const heard = rows.map((r) => r.feltHeard).filter((x): x is number => x !== null);
  const again = rows.filter((r) => r.wouldMeetAgain !== null);
  const met = rows.filter((r) => r.metNewPerson !== undefined && r.metNewPerson !== null);
  return {
    responses: rows.length,
    feltSafePct: pctOf(safe.filter((r) => (r.feltSafe ?? 0) >= 4).length, safe.length, k),
    feltHeardAvg: avgOf(heard, k),
    againPct: pctOf(again.filter((r) => r.wouldMeetAgain).length, again.length, k),
    metNewPct: pctOf(met.filter((r) => r.metNewPerson).length, met.length, k),
  };
}

/** Of the people who came to a host's or circle's events, the share who came back (2+ events). */
export function returnRate(attendance: { accountId: string }[], k = K_THRESHOLD): number | null {
  const counts = new Map<string, number>();
  for (const a of attendance) counts.set(a.accountId, (counts.get(a.accountId) ?? 0) + 1);
  return pctOf([...counts.values()].filter((n) => n >= 2).length, counts.size, k);
}

/** Show-up rate: checked in of those who held a confirmed seat. */
export const showUpRate = (checkedIn: number, confirmed: number, k = K_THRESHOLD) => pctOf(checkedIn, confirmed, k);

/** Counts by key, keeping only keys with at least k (for skip reasons, demand). */
export function countsAtLeast(keys: string[], k = K_THRESHOLD): [string, number][] {
  const m = new Map<string, number>();
  for (const x of keys) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].filter(([, n]) => n >= k).sort((a, b) => b[1] - a[1]);
}
