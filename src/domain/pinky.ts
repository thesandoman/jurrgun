/**
 * เกี่ยวก้อย · Pinky (owner-approved 10-16): two people who met at a table
 * both "hook pinkies" to try a date. No new tables: a tap is a "romance"
 * choice in social_connection_choices for an event both checked in to, and a
 * Pinky is a mutual connection at level "romance".
 *
 * It unlocks only when all of these hold:
 *  - both tapped (each one's choice for that event is "romance");
 *  - both have 💘 on: dating mode "dating" or "dating_only" AND romance mode
 *    eligible (single, romance on), so switching 💘 off always ends it;
 *  - each is open to the other (romanceCompatible, the same rule as romantic
 *    choices after an event, women-only included);
 *  - neither blocks the other;
 *  - both checked in to that event.
 *
 * Privacy: a one-sided tap is never shown, counted or hinted at to the other
 * person. Stepping back removes your tap without telling anyone.
 *
 * Bangkok Buddy stays friends only: a buddy pairing is never an event here.
 *
 * Why not buddy.ts's romanceUnlocked: it gates on finished buddy quests,
 * which Pinky doesn't have. datingFit ranks private preferences for the
 * buddy deck; it is a ranking, not consent, so two people who both chose
 * each other are not overruled by it.
 */
import { romanceCompatible, romanceEligible, type RomanceSide } from "./rules";

/** Dating modes (social_dating_intents.mode) that count as 💘 on. */
export const PINKY_MODES: readonly string[] = ["dating", "dating_only"];

export type PinkySide = RomanceSide & { relationship: string; romanceOn: boolean; datingMode: string | null | undefined };

/** 💘 on, for Pinky: dating mode on and romance mode eligible. */
export function pinkyOn(p: PinkySide): boolean {
  return !!p.datingMode && PINKY_MODES.includes(p.datingMode) && romanceEligible(p);
}

/** Whether the Pinky row may be shown on `them`'s card to `me` (never says anything about taps). */
export function pinkyOffered(me: PinkySide, them: PinkySide, met: boolean, blocked: boolean): boolean {
  return met && !blocked && pinkyOn(me) && romanceEligible(them) && romanceCompatible(me, them);
}

/** Every rule for a mutual Pinky. */
export function pinkyUnlocked(p: { taps: [boolean, boolean]; sides: [PinkySide, PinkySide]; blocked: boolean; bothCheckedIn: boolean }): boolean {
  const [a, b] = p.sides;
  return p.taps[0] && p.taps[1] && !p.blocked && p.bothCheckedIn && pinkyOn(a) && pinkyOn(b) && romanceCompatible(a, b);
}
