/**
 * เกี่ยวก้อย · Pinky (owner-approved 10-16): two people who met at a table
 * both "hook pinkies" to try a date. No new tables: a tap is a "romance"
 * choice in social_connection_choices for an event both checked in to, and a
 * Pinky is a mutual connection at level "romance".
 *
 * The same row for everyone (owner card C2, 2026-10-26): with 💘 on, the row
 * shows on the card of every person you met at a table, while that table's
 * People I Met window is open. It never depends on the other person, so its
 * presence says nothing about whether they're single, have 💘 on, or are open
 * to you. A tap gets exactly the same answer whatever their status. A tap is
 * an ordinary People I Met choice, so it expires when that window closes
 * (retention deletes it).
 *
 * Every rule about the other person is checked silently, only at unlock:
 *  - both tapped (each one's choice for that event is "romance");
 *  - both have 💘 on (romanceEligible: single and romance mode on, the same
 *    test 💘 events and People I Met use), so switching 💘 off always ends it;
 *  - each is open to the other (romanceCompatible, women-only included);
 *  - neither blocks the other;
 *  - both checked in to that event.
 *
 * Privacy: a one-sided tap is never shown, counted or hinted at to the other
 * person. Stepping back removes your tap without telling anyone.
 *
 * Bangkok Buddy stays friends only: a buddy pairing is never an event here.
 */
import { romanceCompatible, romanceEligible, type RomanceSide } from "./rules";

export type PinkySide = RomanceSide & { relationship: string; romanceOn: boolean };

/** 💘 on, for Pinky: the one test used everywhere (single and romance mode on). */
export function pinkyOn(p: { relationship: string; romanceOn: boolean }): boolean {
  return romanceEligible(p);
}

/**
 * Whether the Pinky row shows on someone's card. It depends only on the
 * viewer and the table they shared, never on the other person's status: a
 * mutual Pinky keeps showing; otherwise the viewer needs 💘 on and an open
 * People I Met window.
 */
export function pinkyOffered(me: { relationship: string; romanceOn: boolean }, p: { met: boolean; blocked: boolean; windowOpen: boolean; mutual: boolean }): boolean {
  if (!p.met || p.blocked || !pinkyOn(me)) return false;
  return p.mutual || p.windowOpen;
}

/** Every rule for a mutual Pinky. */
export function pinkyUnlocked(p: { taps: [boolean, boolean]; sides: [PinkySide, PinkySide]; blocked: boolean; bothCheckedIn: boolean }): boolean {
  const [a, b] = p.sides;
  return p.taps[0] && p.taps[1] && !p.blocked && p.bothCheckedIn && pinkyOn(a) && pinkyOn(b) && romanceCompatible(a, b);
}
