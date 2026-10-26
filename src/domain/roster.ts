/**
 * Who sees names, seat codes or only counts for an event's people. This is
 * the one rule every staff and partner surface follows: the admin event page,
 * the check-in station, the events list, the partner area and the partner API.
 * Owner decisions, 2026-10-26: Dating & Pinky card C1 together with Partners
 * card P1.
 *
 *  - 💘 events (open_to_more): seeing who is there would show who is single
 *    with 💘 on, and staff never see romance data. Only the event's named host
 *    works with the people, and only through seat codes, never names (the host
 *    runs check-in and the tables). Everyone else, bma_admin and the partner's
 *    own admins included, sees "under 10" or a FROZEN count rounded to 5. The
 *    count is frozen at 00:00 Bangkok time so it can't move while someone
 *    watches and give one person's booking away.
 *  - Any other partner event: only the named host sees names. The partner's
 *    other admins (and bma_admin) see counts from 10 up, never who (D47).
 *  - Jurrgun's own events: the host and bma_admin see names, as before.
 */
import { OPEN_TO_MORE_TAG, roundedCount, safeCount } from "./rules";

export type RosterAccess = "names" | "codes" | "counts";
/** How a count is shown: as it is, from 10 up, or frozen and rounded to 5. */
export type CountPolicy = "exact" | "from10" | "frozen5";

type Viewer = { id: string; role: string };
type RosterEvent = { hostAccountId: string | null; partnerOrgId: string | null; tags: string[] };

export const isRomanceEvent = (e: { tags: string[] }) => e.tags.includes(OPEN_TO_MORE_TAG);

/** What this viewer may see of the people at this event. */
export function rosterAccess(viewer: Viewer, e: RosterEvent): RosterAccess {
  const host = !!e.hostAccountId && e.hostAccountId === viewer.id;
  if (isRomanceEvent(e)) return host ? "codes" : "counts";
  if (e.partnerOrgId) return host ? "names" : "counts";
  return host || viewer.role === "bma_admin" ? "names" : "counts";
}

/** How counts are shown to someone with this access. People who work with the roster see it as it is. */
export function countPolicy(access: RosterAccess, e: { tags: string[] }): CountPolicy {
  if (access !== "counts") return "exact";
  return isRomanceEvent(e) ? "frozen5" : "from10";
}

/**
 * A count as this policy shows it, or null for "under 10". For "frozen5", pass
 * the count frozen at 00:00 today (services/roster.ts frozenCounts), not the
 * live one.
 */
export function shownCount(policy: CountPolicy, n: number): number | null {
  if (policy === "exact") return n;
  if (policy === "from10") return safeCount(n);
  return roundedCount(n);
}

/** Partner-facing counts (the partner area and API) for one event: the same rule as a counts-only viewer. */
export const partnerCountPolicy = (e: { tags: string[] }): CountPolicy => (isRomanceEvent(e) ? "frozen5" : "exact");

// ------------------------------------------------------------- seat codes --

const SEAT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A 💘 event's stand-in for a name: five characters derived from the seat's
 * secret pass token. The member sees the same code on their pass, so the host
 * can match a person to a seat at the door. The code can't be worked out
 * from an account id, and it's different at every event. It is not the
 * check-in code: that's the token's first six characters, and this is a hash
 * of the whole token.
 */
export function seatCode(passToken: string): string {
  let h = 0x811c9dc5;
  const s = `seat:${passToken}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += SEAT_ALPHABET[h % 32];
    h = Math.floor(h / 32);
  }
  return out;
}
