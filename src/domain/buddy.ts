/**
 * Bangkok Buddy (docs/BANGKOK-BUDDY.md): pure rules, no database.
 *
 *  - One buddy at a time, at most one NEW match per person per ISO week.
 *  - Matched once a week in a clearinghouse (see clearBuddies): stable
 *    roommates on stated preferences, Pareto improvements as the fallback,
 *    and a reservation level that eases the longer someone waits.
 *  - Preferences: Bangkok Type (each type's `clicks`, then the match labels)
 *    and districts (same home, or home near the other type's hangouts).
 *  - A shared language and each other's private age range are required.
 *  - Weekly quests are hand-written quiz-bank answers (src/vibe/bank) set in
 *    a district neither buddy has stamped yet, alternating whose type picks.
 *  - Romance only ever surfaces when BOTH privately chose "open to more",
 *    both are romance-eligible and compatible, after two finished quests.
 */
import { ARCHETYPES, matchLabel, type ArchetypeKey } from "../vibe/archetypes";
import type { Text } from "../vibe/content";
import { SCENARIOS, type Scenario, type TypeCode } from "../vibe/scenarios";
import { hashString } from "../vibe/rng";
import { greedyPairs, stableRoommates, type Preferences } from "../match/roommates";

/** friends | activity | open (to more, if mutual) | dating (dating only). All PRIVATE. */
export const BUDDY_INTENTS = ["friends", "activity", "open", "dating"] as const;
/** Intents that count as open to dating. */
export const DATING_INTENTS: readonly string[] = ["open", "dating"];
export type BuddyIntent = (typeof BUDDY_INTENTS)[number];

export const isBuddyIntent = (x: string): x is BuddyIntent => (BUDDY_INTENTS as readonly string[]).includes(x);

/** Finished quests before a mutual "open to more" is revealed. */
export const ROMANCE_AFTER_QUESTS = 2;

/** ISO 8601 week, e.g. "2026-W42" (weeks start on Monday, in Bangkok time). */
export function weekKey(now: Date): string {
  // Bangkok is UTC+7 all year.
  const local = new Date(now.getTime() + 7 * 3600_000);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export type BuddyCandidate = {
  accountId: string;
  archetype: ArchetypeKey;
  district: string;
  languages: string[];
};

/** Districts a type is drawn to: its hangouts. */
function typeDistricts(code: ArchetypeKey): Set<string> {
  return new Set(ARCHETYPES[code].hangouts.map((h) => h.district));
}

/**
 * How good a pair is, or null when they can't be matched (no shared
 * language). Higher is better. Symmetric.
 */
export function pairScore(a: BuddyCandidate, b: BuddyCandidate): number | null {
  if (!a.languages.some((l) => b.languages.includes(l))) return null;
  let s = 0;
  if (ARCHETYPES[a.archetype].clicks.some((c) => c.key === b.archetype)) s += 3;
  if (ARCHETYPES[b.archetype].clicks.some((c) => c.key === a.archetype)) s += 3;
  const ml = matchLabel(a.archetype, b.archetype);
  if (ml === "natural" || ml === "complementary") s += 2;
  else if (ml === "interesting") s += 1;
  if (a.district === b.district) s += 3;
  if (typeDistricts(a.archetype).has(b.district)) s += 1;
  if (typeDistricts(b.archetype).has(a.district)) s += 1;
  return s;
}

// ------------------------------------------------------------ clearinghouse --
//
// Once a week everyone waiting for a buddy is matched together, not first
// come first served. Preferences come only from what people told us (their
// Bangkok Type, home district, languages, their own age range, who they
// blocked): no popularity score, no Elo, no predicted "chance" of liking.
//
//  1. Each person lists who they'd accept, best first (pairScore, ties broken
//     by a per-week hash so nobody is always first in line).
//  2. A reservation level (optimal search, McCall style): early on you are
//     only offered a strong fit; each week you wait, the bar lowers, so
//     nobody waits forever and nobody is rushed into a poor fit.
//  3. Irving's stable roommates: no two people would both rather be with each
//     other than with who they got. With strict preferences a stable matching
//     is also Pareto optimal.
//  4. When no stable matching exists: greedy pairs, then Pareto improvements
//     (swap partners between two pairs, or pair two people left alone, only
//     when nobody ends up worse and someone ends up better) until none is left.

export type PoolMember = BuddyCandidate & {
  age: number;
  ageMin: number;
  ageMax: number;
  /** Blocked either way, or a past buddy: never matched again. */
  excluded: ReadonlySet<string>;
  /** Weeks since they became available (opted in, or their last buddy ended). */
  weeksWaiting: number;
  /**
   * Dating only: the people they can date (also open to dating, both
   * romance-eligible and compatible). Undefined for everyone else.
   */
  datesWith?: ReadonlySet<string>;
};

/** The minimum pairScore someone is offered, by weeks waited. */
export function reservation(weeksWaiting: number): number {
  return Math.max(0, 4 - Math.max(0, Math.floor(weeksWaiting)));
}

const inRange = (age: number, min: number, max: number) => age >= min && age <= max;

/** Whether `a` would accept `b` at all, and how much. */
function acceptScore(a: PoolMember, b: PoolMember): number | null {
  if (a.accountId === b.accountId || a.excluded.has(b.accountId) || b.excluded.has(a.accountId)) return null;
  if (!inRange(b.age, a.ageMin, a.ageMax) || !inRange(a.age, b.ageMin, b.ageMax)) return null;
  // Someone here only for dating is only paired with people they can date.
  if (a.datesWith && !a.datesWith.has(b.accountId)) return null;
  if (b.datesWith && !b.datesWith.has(a.accountId)) return null;
  const s = pairScore(a, b);
  if (s === null || s < reservation(a.weeksWaiting)) return null;
  return s;
}

/** Everyone's acceptable list, best first. */
export function buddyPreferences(pool: PoolMember[], salt: string): Preferences {
  const prefs: Preferences = new Map();
  for (const a of pool) {
    const scored: { id: string; s: number; h: number }[] = [];
    for (const b of pool) {
      const s = acceptScore(a, b);
      if (s !== null) scored.push({ id: b.accountId, s, h: hashString(`${salt}|${a.accountId}|${b.accountId}`) });
    }
    scored.sort((x, y) => y.s - x.s || x.h - y.h);
    prefs.set(a.accountId, scored.map((x) => x.id));
  }
  return prefs;
}

const mutual = (prefs: Preferences, a: string, b: string) => (prefs.get(a)?.includes(b) ?? false) && (prefs.get(b)?.includes(a) ?? false);

/** Lower is better; being alone ranks after everyone acceptable. */
function rankOf(prefs: Preferences, x: string, y: string | undefined): number {
  const xs = prefs.get(x) ?? [];
  if (y === undefined) return xs.length;
  const i = xs.indexOf(y);
  return i === -1 ? Infinity : i;
}

/**
 * Applies Pareto improvements until none is left: re-pair two pairs, or pair
 * two people who are both alone, when nobody is worse off and someone is
 * better off (by their own ranking).
 */
export function paretoImprove(prefs: Preferences, pairs: [string, string][]): [string, string][] {
  let current = pairs.map((p) => [...p] as [string, string]);
  const ids = [...prefs.keys()];
  for (let round = 0; round < 200; round++) {
    let changed = false;
    // Two people both alone who'd accept each other.
    const paired = new Set(current.flat());
    const alone = ids.filter((x) => !paired.has(x));
    for (let i = 0; i < alone.length && !changed; i++) {
      for (let j = i + 1; j < alone.length; j++) {
        if (mutual(prefs, alone[i], alone[j])) {
          current.push([alone[i], alone[j]]);
          changed = true;
          break;
        }
      }
    }
    // Swap partners between two pairs.
    for (let i = 0; i < current.length && !changed; i++) {
      for (let j = i + 1; j < current.length && !changed; j++) {
        const [a, b] = current[i];
        const [c, d] = current[j];
        for (const [p, q] of [
          [[a, c], [b, d]],
          [[a, d], [b, c]],
        ] as [[string, string], [string, string]][]) {
          if (!mutual(prefs, p[0], p[1]) || !mutual(prefs, q[0], q[1])) continue;
          const before = [rankOf(prefs, a, b), rankOf(prefs, b, a), rankOf(prefs, c, d), rankOf(prefs, d, c)];
          const partnerAfter = new Map([
            [p[0], p[1]],
            [p[1], p[0]],
            [q[0], q[1]],
            [q[1], q[0]],
          ]);
          const after = [a, b, c, d].map((x) => rankOf(prefs, x, partnerAfter.get(x)));
          if (after.every((r, k) => r <= before[k]) && after.some((r, k) => r < before[k])) {
            current[i] = p;
            current[j] = q;
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) break;
  }
  return current.map(([x, y]) => (x < y ? [x, y] : [y, x]));
}

export type ClearingResult = { pairs: [string, string][]; method: "stable" | "pareto"; unmatched: string[] };

/** This week's buddy pairs for everyone in the pool. */
export function clearBuddies(pool: PoolMember[], salt: string): ClearingResult {
  const prefs = buddyPreferences(pool, salt);
  const sr = stableRoommates(prefs);
  let pairs: [string, string][];
  let method: ClearingResult["method"];
  if (sr.stable) {
    pairs = sr.pairs.map(([x, y]) => (x < y ? [x, y] : [y, x]));
    method = "stable";
  } else {
    const byId = new Map(pool.map((p) => [p.accountId, p]));
    const greedy = greedyPairs(
      pool.map((p) => p.accountId),
      (x, y) => (mutual(prefs, x, y) ? pairScore(byId.get(x)!, byId.get(y)!) : null),
    );
    pairs = paretoImprove(prefs, greedy);
    method = "pareto";
  }
  const placed = new Set(pairs.flat());
  return { pairs, method, unmatched: pool.map((p) => p.accountId).filter((id) => !placed.has(id)) };
}

/** Why two types click, from either side's `clicks`, or null. */
export function clickReason(mine: ArchetypeKey, theirs: ArchetypeKey): Text | null {
  return ARCHETYPES[mine].clicks.find((c) => c.key === theirs)?.why ?? ARCHETYPES[theirs].clicks.find((c) => c.key === mine)?.why ?? null;
}

/** Quests come from situations you'd do with a friend or new people. */
const QUEST_SCENARIOS: Scenario[] = SCENARIOS.filter((s) => s.kind === "core" && (s.context === "friends" || s.context === "meetup"));

export type QuestPick = { scenario: string; typeCode: TypeCode; district: string };

/**
 * This week's quest for a pair: alternating weeks follow each buddy's type,
 * set in a district neither has stamped (any district once all are stamped).
 */
export function pickQuest(matchId: string, week: string, codes: [ArchetypeKey, ArchetypeKey], stamped: ReadonlySet<string>): QuestPick {
  const weekNo = Number(week.slice(-2)) || 0;
  const order: ArchetypeKey[] = weekNo % 2 === 0 ? [codes[0], codes[1]] : [codes[1], codes[0]];
  for (const code of order) {
    const fresh = QUEST_SCENARIOS.filter((s) => !stamped.has(s.answers[code].district));
    if (fresh.length) {
      const sc = fresh[hashString(`${matchId}|${week}|${code}`) % fresh.length];
      return { scenario: sc.id, typeCode: code, district: sc.answers[code].district };
    }
  }
  const code = order[0];
  const sc = QUEST_SCENARIOS[hashString(`${matchId}|${week}`) % QUEST_SCENARIOS.length];
  return { scenario: sc.id, typeCode: code, district: sc.answers[code].district };
}

/** The quest's hand-written text, or null if the bank no longer has it. */
export function questText(q: { scenario: string; typeCode: string }): (Text & { icon: string }) | null {
  const sc = SCENARIOS.find((s) => s.id === q.scenario);
  const a = sc?.answers[q.typeCode as TypeCode];
  return a ? { en: a.en, th: a.th, icon: a.icon } : null;
}

/** Whether a mutual "open to more" may now be revealed to both. */
export function romanceUnlocked(p: {
  intents: [string, string];
  eligible: [boolean, boolean];
  compatible: boolean;
  finishedQuests: number;
}): boolean {
  return p.intents.every((i) => DATING_INTENTS.includes(i)) && p.eligible.every(Boolean) && p.compatible && p.finishedQuests >= ROMANCE_AFTER_QUESTS;
}

// ------------------------------------------------------------ no ghosting --
//
// A buddy pairing never just goes quiet. It ends when:
//  - both agree to wrap up (one asks, the other agrees), or
//  - both have shared a contact in My Bangkok circle (LINE, IG and so on), so
//    the friendship carries on off the app, or
//  - one sends a kind wrap-up note and WRAP_NOTICE_DAYS pass without a reply.
// Safety comes first: blocking ends a pairing at once and is never ghosting.

export const WRAP_NOTICE_DAYS = 7;
/** A proposal neither answered closes after this many days. */
export const PROPOSAL_DAYS = 3;

export const WRAP_NOTES = {
  lovely: { en: "It was lovely exploring with you, thank you!", th: "ดีใจที่ได้ออกสำรวจด้วยกัน ขอบคุณนะ!" },
  busy: { en: "Life got busy for me. Thank you for the time together.", th: "ช่วงนี้ชีวิตยุ่งมาก ขอบคุณสำหรับเวลาที่ได้ใช้ด้วยกันนะ" },
  different: { en: "I'd like to try a different buddy. Wishing you a great next match!", th: "อยากลองบัดดี้คนใหม่ ขอให้เจอบัดดี้ที่ใช่นะ!" },
  offapp: { en: "Let's keep in touch outside the app.", th: "ไว้คุยกันต่อนอกแอปนะ" },
} satisfies Record<string, Text>;
export type WrapNote = keyof typeof WRAP_NOTES;
export const isWrapNote = (x: string): x is WrapNote => Object.prototype.hasOwnProperty.call(WRAP_NOTES, x);

/** Matching runs daily: the round key is the Bangkok date, e.g. "2026-10-13". */
export function dayKey(now: Date): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
