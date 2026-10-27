/**
 * Session rules (owner card S4, 2026-10-27).
 *
 * - A session lasts at most SESSION_DAYS (30, lib/session.ts) and ends after
 *   IDLE_DAYS (14) without use. The member is then sent to sign in and
 *   brought back to the page they were on (requireUser's ?next=).
 * - last_seen_at is written at most once an hour, so a busy member costs one
 *   small write an hour, not one per page.
 * - device is only "phone", "tablet" or "computer", worked out once at sign-in
 *   from the browser's user agent. The user agent itself and the IP are never
 *   stored.
 */
export const IDLE_DAYS = 14;
export const LAST_SEEN_EVERY_MS = 60 * 60_000;
const DAY = 86_400_000;

export type DeviceKind = "phone" | "tablet" | "computer";

export function deviceKind(userAgent: string | null | undefined): DeviceKind {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet|kindle|silk|playbook/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return "tablet";
  if (/iphone|ipod|android|mobile|windows phone|blackberry|opera mini/.test(ua)) return "phone";
  return "computer";
}

/** True when this session has gone unused for IDLE_DAYS or more. */
export function isIdle(s: { lastSeenAt: Date | null; createdAt: Date }, now: Date): boolean {
  const seen = (s.lastSeenAt ?? s.createdAt).getTime();
  return now.getTime() - seen >= IDLE_DAYS * DAY;
}

/** True when last_seen_at is due a refresh (unset, or older than an hour). */
export function needsTouch(lastSeenAt: Date | null, now: Date): boolean {
  return !lastSeenAt || now.getTime() - lastSeenAt.getTime() >= LAST_SEEN_EVERY_MS;
}
