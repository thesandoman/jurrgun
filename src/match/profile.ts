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
 *   - Inputs are the non-political Vibe vector, interests and languages only.
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

export const SCORE_WEIGHTS = { similarity: 0.55, interests: 0.3, novelty: 0.15 };

/**
 * How much `a` would enjoy meeting `b`, in [0, 1]. Asymmetric: it uses a's
 * category weights. Three parts:
 *   similarity — closeness of Vibe vectors, weighted by what a cares about;
 *   interests  — overlap of interest tags;
 *   novelty    — a small bonus for exactly ONE strong difference: "mostly
 *                alike, one thing to talk about" beats identical twins.
 */
export function score(a: Profile, b: Profile): number {
  let wSum = 0;
  let sim = 0;
  let strongDiffs = 0;
  for (const c of CATEGORIES) {
    const w = a.weights?.[c] ?? 1;
    const diff = Math.abs(a.vibe[c] - b.vibe[c]); // 0..2
    wSum += w;
    sim += w * (1 - diff / 2);
    if (diff >= 1) strongDiffs += 1;
  }
  const similarity = wSum === 0 ? 0 : sim / wSum;
  const novelty = strongDiffs === 1 ? 1 : strongDiffs === 0 ? 0.5 : strongDiffs === 2 ? 0.3 : 0;
  return (
    SCORE_WEIGHTS.similarity * similarity +
    SCORE_WEIGHTS.interests * jaccard(a.interests, b.interests) +
    SCORE_WEIGHTS.novelty * novelty
  );
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
