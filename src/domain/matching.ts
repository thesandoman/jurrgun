/**
 * Glue between app profiles and the matching experiment in src/match/.
 *
 * Uses the Bangkok Vibe vector when the person has taken the quiz; anyone who
 * hasn't is treated as neutral (0) on every category, so matching then runs
 * on interests, social styles and languages alone.
 */
import { CATEGORIES, type Category } from "../vibe/content";
import { formGroups, type GroupResult } from "../match/clearinghouse";
import { canPair, preferenceList, score, type Profile as MatchProfile } from "../match/profile";
import { greedyPairs, stableRoommates, type Preferences } from "../match/roommates";

export type Attendee = {
  accountId: string;
  age: number;
  ageMin: number;
  ageMax: number;
  languages: string[];
  interests: string[];
  socialStyles: string[];
  intents: string[];
  blocked: string[];
  /** Bangkok Vibe vector, if the quiz was taken. */
  vibe?: Record<string, number> | null;
  /** Same key = same university (src/content/profile.ts universityKey). */
  university?: string | null;
};

const NEUTRAL_VIBE = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

export function toMatchProfile(a: Attendee): MatchProfile {
  const intents = a.intents.filter((i) => i !== "romance") as MatchProfile["intents"];
  return {
    id: a.accountId,
    vibe: a.vibe ? (Object.fromEntries(CATEGORIES.map((c) => [c, a.vibe?.[c] ?? 0])) as Record<Category, number>) : NEUTRAL_VIBE,
    // A shared university counts like a shared interest.
    interests: [...a.interests, ...a.socialStyles.map((s) => `style:${s}`), ...(a.university ? [`uni:${a.university}`] : [])],
    languages: a.languages.length ? a.languages : ["th"],
    age: a.age,
    ageRange: [a.ageMin, a.ageMax],
    intents: intents.length ? intents : ["friends"],
    blocked: a.blocked,
  };
}

/** Event tables: exchange-stable clearinghouse (PRD §8.1 v3). */
export function suggestGroups(
  attendees: Attendee[],
  opts: { seed: string; minSize: number; maxSize: number; keepTogether: [string, string][] },
): GroupResult {
  return formGroups(attendees.map(toMatchProfile), {
    seed: opts.seed,
    minSize: opts.minSize,
    maxSize: opts.maxSize,
    keepTogether: opts.keepTogether,
    method: "stable",
  });
}

export type BuddyRound = { groups: string[][]; method: "stable" | "greedy"; unmatched: string[] };

/**
 * Event Buddy (PRD §10.5): Irving's stable roommates, greedy fallback when no
 * stable matching exists, and a leftover person joins the pair they score
 * best with (a trio) rather than going alone.
 */
export function buddyRound(people: Attendee[]): BuddyRound {
  const profiles = people.map(toMatchProfile);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const prefs: Preferences = new Map(profiles.map((p) => [p.id, preferenceList(p, profiles)]));
  const sr = stableRoommates(prefs);
  let pairs: [string, string][];
  let method: "stable" | "greedy";
  if (sr.stable) {
    pairs = sr.pairs;
    method = "stable";
  } else {
    method = "greedy";
    pairs = greedyPairs(
      profiles.map((p) => p.id),
      (a, b) => {
        const pa = byId.get(a)!;
        const pb = byId.get(b)!;
        return canPair(pa, pb) ? (score(pa, pb) + score(pb, pa)) / 2 : null;
      },
    );
  }
  const groups: string[][] = pairs.map((p) => [...p]);
  const placed = new Set(groups.flat());
  const unmatched: string[] = [];
  for (const p of profiles) {
    if (placed.has(p.id)) continue;
    // Join the pair where everyone can pair with them and the fit is best.
    let best: string[] | null = null;
    let bestScore = -Infinity;
    for (const g of groups) {
      if (g.length >= 3) continue;
      if (!g.every((m) => canPair(p, byId.get(m)!))) continue;
      const s = g.reduce((sum, m) => sum + score(p, byId.get(m)!), 0) / g.length;
      if (s > bestScore) {
        bestScore = s;
        best = g;
      }
    }
    if (best) {
      best.push(p.id);
      placed.add(p.id);
    } else unmatched.push(p.id);
  }
  return { groups, method, unmatched };
}
