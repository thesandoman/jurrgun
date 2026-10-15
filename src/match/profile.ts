/**
 * Who can be matched with whom, and how good a match is.
 *
 * Inclusive by construction:
 *   - Matching is ONE-SIDED (anyone can be paired with anyone). There is no
 *     men/women two-sided market, so gender identity is never an input to
 *     friend, buddy or group matching.
 *   - Gender identity and "open to" preferences exist ONLY for the optional
 *     romance layer, are optional, and are read only by `romanceCompatible`.
 *   - Language is a hard constraint for 1:1 pairing so expats are never paired
 *     with someone they can't talk to — and a soft one for groups, where one
 *     bridge speaker is enough.
 *   - Inputs are the non-political Vibe vector, interests, languages, and for
 *     seating the Bangkok Type, the member's segment, the 💘 opt-in (only on
 *     open_to_more events) and who chose each other before. Never gender.
 *
 * Seating mixes people instead of sorting them (owner, D31): everyone has an
 * anchor at the table, the table spans different types, and nobody is ranked.
 * No score here is ever shown to a member.
 */

import { CATEGORIES, type Category } from "../vibe/content";

export type Intent = "friends" | "activity-buddy" | "explore" | "romance";

export type Profile = {
  id: string;
  vibe: Record<Category, number>;
  /**
   * How much each category matters to THIS person when judging a match
   * (0..1; default 1). Different people weigh things differently, which is
   * what makes preferences asymmetric — and stable matching meaningful.
   */
  weights?: Partial<Record<Category, number>>;
  interests: string[];
  languages: string[];
  age: number;
  /** Private: who this person is open to being PAIRED with 1:1 after events. */
  ageRange: [number, number];
  intents: Intent[];
  blocked?: string[];
  /** Bangkok Type code (e.g. "CFMH"), if the quiz was taken. Used only to keep tables mixed. */
  type?: string;
  /** local | newcomer | international (src/domain/segment.ts). */
  segment?: "local" | "newcomer" | "international";
  /** On a 💘 open_to_more event: this member has romance mode on. Never their gender. */
  openToMore?: boolean;
  /** People this member chose and who chose them back (a connection), at any earlier event. */
  mutual?: string[];
  /** People this member sat at a table with before without either choosing the other. */
  metNoClick?: string[];
  romance?: {
    /** Declared Single AND opted in to "Open to something more". */
    eligible: boolean;
    /** Self-described, optional, private. e.g. "woman", "man", "non-binary". */
    identity?: string;
    /** Identities this person is open to, or "everyone". */
    openTo?: string[] | "everyone";
  };
};

const NON_ROMANCE: Intent[] = ["friends", "activity-buddy", "explore"];

export function sharesLanguage(a: Profile, b: Profile): boolean {
  return a.languages.some((l) => b.languages.includes(l));
}

export function isBlocked(a: Profile, b: Profile): boolean {
  return (a.blocked?.includes(b.id) ?? false) || (b.blocked?.includes(a.id) ?? false);
}

function inRange(age: number, [min, max]: [number, number]): boolean {
  return age >= min && age <= max;
}

/** Hard rules for a 1:1 buddy / friend pairing. */
export function canPair(a: Profile, b: Profile): boolean {
  if (a.id === b.id) return false;
  if (isBlocked(a, b)) return false;
  if (!sharesLanguage(a, b)) return false;
  if (!inRange(b.age, a.ageRange) || !inRange(a.age, b.ageRange)) return false;
  const aFriendly = a.intents.some((i) => NON_ROMANCE.includes(i));
  const bFriendly = b.intents.some((i) => NON_ROMANCE.includes(i));
  return aFriendly && bFriendly;
}

/**
 * Romance is never algorithmically paired. This gate is used only by the
 * post-event mutual-consent step: both must be eligible, and each must fall
 * inside the other's "open to". Works for any combination of identities.
 */
export function romanceCompatible(a: Profile, b: Profile): boolean {
  const ra = a.romance;
  const rb = b.romance;
  if (!ra?.eligible || !rb?.eligible) return false;
  if (!a.intents.includes("romance") || !b.intents.includes("romance")) return false;
  const accepts = (openTo: string[] | "everyone" | undefined, identity: string | undefined) =>
    openTo === "everyone" || (identity !== undefined && (openTo ?? []).includes(identity));
  return accepts(ra.openTo, rb.identity) && accepts(rb.openTo, ra.identity);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / (a.length + b.length - inter);
}

/**
 * The seating score's parts (D31). Similarity across every letter used to be
 * 0.55 of the score, which sorted people into bubbles of the same type; now
 * the only letter where likeness counts is energy (comfort), and the other
 * three reward some difference.
 */
export const SCORE_WEIGHTS = { interests: 0.35, comfort: 0.2, difference: 0.25, history: 0.2 };

/** The letters where some difference makes a table better: explore, motion, culture. */
const DIFFERENCE_CATEGORIES: Category[] = ["explore", "motion", "culture"];

/** Strangers who sat together before and didn't choose each other: never seat them together again. */
export const NO_CLICK_SCORE = -0.6;

/**
 * Same-energy comfort, 0..1: two Chill people or two Buzz people are at ease;
 * opposite ends tire each other out.
 */
export function comfort(a: Profile, b: Profile): number {
  return 1 - Math.abs(a.vibe.energy - b.vibe.energy) / 2;
}

/**
 * Healthy difference, 0..1: how much two people differ on explore, motion and
 * culture. A moderate difference scores best ("one thing to talk about");
 * total opposites a little less, twins least.
 */
export function difference(a: Profile, b: Profile): number {
  let t = 0;
  for (const c of DIFFERENCE_CATEGORIES) {
    const d = Math.abs(a.vibe[c] - b.vibe[c]) / 2; // 0..1
    t += d <= 0.6 ? d / 0.6 : 1 - (d - 0.6) * 0.5;
  }
  return t / DIFFERENCE_CATEGORIES.length;
}

/**
 * Connection history: 1 when a and b chose each other before (and this
 * event's coin says to reunite them: "sometimes", so mutual pairs still meet
 * new people), the no-click penalty when they sat together before and neither
 * chose the other, else 0.
 */
export function history(a: Profile, b: Profile, coin: (a: string, b: string) => boolean = () => true): number {
  if (a.mutual?.includes(b.id) || b.mutual?.includes(a.id)) return coin(a.id, b.id) ? 1 : 0;
  if (a.metNoClick?.includes(b.id) || b.metNoClick?.includes(a.id)) return NO_CLICK_SCORE / SCORE_WEIGHTS.history;
  return 0;
}

/**
 * How well `a` would get on with `b` at a table, roughly 0..1 (it can go
 * below 0 for a pair who didn't click before). Interests are what people talk
 * about first; comfort keeps energy compatible; difference keeps the table
 * from being a mirror; history brings back people who chose each other.
 * `a`'s personal weights tilt comfort and difference toward what a cares about.
 */
export function score(a: Profile, b: Profile, coin?: (a: string, b: string) => boolean): number {
  const w = (c: Category) => a.weights?.[c] ?? 1;
  const dw = DIFFERENCE_CATEGORIES.reduce((t, c) => t + w(c), 0) / DIFFERENCE_CATEGORIES.length;
  return (
    SCORE_WEIGHTS.interests * jaccard(a.interests, b.interests) +
    SCORE_WEIGHTS.comfort * w("energy") * comfort(a, b) +
    SCORE_WEIGHTS.difference * dw * difference(a, b) +
    SCORE_WEIGHTS.history * history(a, b, coin)
  );
}

/** The old score, kept only so the simulation can compare before and after (D31). Never used for seating. */
export function similarityScore(a: Profile, b: Profile): number {
  let wSum = 0;
  let sim = 0;
  let strongDiffs = 0;
  for (const c of CATEGORIES) {
    const w = a.weights?.[c] ?? 1;
    const diff = Math.abs(a.vibe[c] - b.vibe[c]);
    wSum += w;
    sim += w * (1 - diff / 2);
    if (diff >= 1) strongDiffs += 1;
  }
  const similarity = wSum === 0 ? 0 : sim / wSum;
  const novelty = strongDiffs === 1 ? 1 : strongDiffs === 0 ? 0.5 : strongDiffs === 2 ? 0.3 : 0;
  return 0.55 * similarity + 0.3 * jaccard(a.interests, b.interests) + 0.15 * novelty;
}

/** An anchor: a shared interest, the same segment, or the same energy letter (B or C). */
export function isAnchor(a: Profile, b: Profile): boolean {
  if (a.interests.some((i) => b.interests.includes(i))) return true;
  if (a.segment && a.segment === b.segment) return true;
  return a.vibe.energy >= 0 === b.vibe.energy >= 0;
}

/**
 * a's ranked list of acceptable partners, best first. Ties broken by id so
 * the result is deterministic.
 */
export function preferenceList(a: Profile, others: Profile[]): string[] {
  return others
    .filter((b) => canPair(a, b))
    .map((b) => ({ id: b.id, s: score(a, b) }))
    .sort((x, y) => y.s - x.s || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((x) => x.id);
}
