/**
 * Small-group clearinghouse for events.
 *
 * Given the checked-in attendees of one event, split them into tables of
 * 4–6 so that the result is EXCHANGE-STABLE: there are no two people in
 * different groups who would both be happier if they swapped places. That is
 * the group equivalent of "no blocking pair" in stable matching, and it is the
 * property that makes an assignment feel fair rather than arbitrary.
 *
 * Exchange-stable splits do not always exist, so the search is capped and the
 * number of remaining blocking swaps is reported. In the experiment it reaches
 * zero in practice; see design/reference/matching-experiment.md.
 *
 * Inputs are the non-political Vibe vector, interests, languages, Bangkok
 * Type, segment, who chose each other before, and (on 💘 events only) the
 * romance opt-in. Never gender. +1 friends who asked to stay together move as
 * one unit.
 *
 * Tables mix people instead of sorting them (owner, D31, "an anchor and some
 * spread"): everyone has at least one anchor at the table, at most 2 people
 * share a Bangkok Type, a table spans 3 or more types when it can, newcomers
 * sit with a local, and on 💘 events every opted-in member sits with at least
 * one other. These are soft costs inside each person's happiness, so the
 * exchange-stable search keeps them while still respecting the hard rules.
 */

import { isAnchor, isBlocked, score, sharesLanguage, similarityScore, type Profile } from "./profile";

const noClick = (a: Profile, b: Profile) => !!(a.metNoClick?.includes(b.id) || b.metNoClick?.includes(a.id));
import { createRng, hashString, shuffle } from "../vibe/rng";

export type GroupMethod = "random" | "greedy" | "stable";

export type GroupOptions = {
  seed: string;
  minSize?: number;
  maxSize?: number;
  /** Pairs who came together (+1) and asked to stay together. */
  keepTogether?: [string, string][];
  method?: GroupMethod;
  maxRounds?: number;
  /** A 💘 open_to_more event: every opted-in member should sit with at least one other. */
  romance?: boolean;
  /** "mix" (default, D31) or the old "similarity" score, kept only for the simulation's before/after. */
  scoring?: "mix" | "similarity";
};

export type GroupMetrics = {
  meanUtility: number;
  minUtility: number;
  /** Swaps both sides would still take. 0 = exchange-stable. */
  blockingSwaps: number;
  /** People with nobody in their group who shares a language. */
  isolated: number;
  /** Blocked pairs sitting at the same table. Must be 0. */
  blockedConflicts: number;
  swapsMade: number;
  /** Mean number of different Bangkok Types per table (people without a type don't count). */
  typesPerTable: number;
  /** Tables of 3+ typed people where everyone has the same type. Target: 0. */
  sameTypeTables: number;
  /** Share of people with at least one anchor at their table. Target: 1. */
  anchored: number;
  /** Share of newcomers and internationals at a table with a local (when the event has locals). */
  withLocal: number;
  /** On 💘 events: share of opted-in members sitting with another opted-in member. */
  romanceTogether: number;
  /** Pairs who chose each other before and sit together now. */
  mutualTogether: number;
  /** Pairs who sat together before without clicking and sit together again. Target: 0. */
  noClickTogether: number;
};

export type GroupResult = { groups: string[][]; metrics: GroupMetrics };

/** Language isolation is worse than any amount of vibe mismatch. */
const ISOLATION_PENALTY = 0.5;
/** D31 table costs, in the same units as a pair score (roughly 0..1). */
const NO_ANCHOR_PENALTY = 0.3;
const TYPE_CROWD_PENALTY = 0.35;
const FEW_TYPES_PENALTY = 0.1;
const NO_LOCAL_PENALTY = 0.15;
const ROMANCE_ALONE_PENALTY = 0.4;
/**
 * With the mix score the hard rules are ordered: blocks (100), then a shared
 * language (MIX_ISOLATION_PENALTY), then no-click repeats, then the mix costs
 * (at most about 1.3 together). A strand must outweigh every mix cost at once.
 */
const MIX_ISOLATION_PENALTY = 2;
const NO_CLICK_SEAT_PENALTY = 1.5;
/** At most this many people of one Bangkok Type per table. */
export const MAX_SAME_TYPE = 2;
/** Aim for at least this many Bangkok Types per table. */
export const MIN_TYPES = 3;
const BLOCKED_SCORE = -1;
const EPS = 1e-9;

type Unit = string[];

export function groupSizes(n: number, minSize: number, maxSize: number): number[] {
  if (n <= maxSize) return [n];
  let g = Math.ceil(n / maxSize);
  // Prefer fewer, fuller tables, but never below minSize.
  while (g > 1 && Math.floor(n / g) < minSize) g -= 1;
  const base = Math.floor(n / g);
  const extra = n % g;
  return Array.from({ length: g }, (_, i) => base + (i < extra ? 1 : 0));
}

export function formGroups(attendees: Profile[], options: GroupOptions): GroupResult {
  const minSize = options.minSize ?? 4;
  const maxSize = options.maxSize ?? 6;
  const method = options.method ?? "stable";
  const rng = createRng(`groups:${options.seed}`);
  const byId = new Map(attendees.map((p) => [p.id, p]));
  const mix = (options.scoring ?? "mix") === "mix";
  // "Sometimes" reunite people who chose each other: a fair coin per pair per event.
  const coin = (a: string, b: string) => hashString(`${options.seed}|${a < b ? a : b}|${a < b ? b : a}`) % 2 === 0;
  const hasLocal = attendees.some((p) => p.segment === "local");

  // Pair score cache: s(a, b) = how much a enjoys b.
  const cache = new Map<string, number>();
  const s = (a: string, b: string): number => {
    const k = `${a}\u0000${b}`;
    let v = cache.get(k);
    if (v === undefined) {
      const pa = byId.get(a)!;
      const pb = byId.get(b)!;
      v = isBlocked(pa, pb) ? BLOCKED_SCORE : mix ? score(pa, pb, coin) : similarityScore(pa, pb);
      cache.set(k, v);
    }
    return v;
  };

  /** How happy person `id` is sitting with `members` (which may include id). */
  const personUtility = (id: string, members: string[]): number => {
    const others = members.filter((m) => m !== id);
    if (others.length === 0) return 0;
    let total = 0;
    let canTalk = false;
    const p = byId.get(id)!;
    for (const o of others) {
      total += s(id, o);
      if (!canTalk && sharesLanguage(p, byId.get(o)!)) canTalk = true;
    }
    return total / others.length - (canTalk ? 0 : mix ? MIX_ISOLATION_PENALTY : ISOLATION_PENALTY) - (mix ? tableCost(p, others) : 0);
  };
  /** D31: the mix costs for `p` sitting with `others`. */
  function tableCost(p: Profile, others: string[]): number {
    const os = others.map((o) => byId.get(o)!);
    let cost = 0;
    if (!os.some((o) => isAnchor(p, o))) cost += NO_ANCHOR_PENALTY;
    if (p.type) {
      const same = os.filter((o) => o.type === p.type).length;
      if (same >= MAX_SAME_TYPE) cost += TYPE_CROWD_PENALTY * (same - MAX_SAME_TYPE + 1);
      const types = new Set([p.type, ...os.map((o) => o.type).filter(Boolean)]);
      const typed = 1 + os.filter((o) => o.type).length;
      if (typed >= MIN_TYPES && types.size < MIN_TYPES) cost += FEW_TYPES_PENALTY;
    }
    if (hasLocal && p.segment && p.segment !== "local" && !os.some((o) => o.segment === "local")) cost += NO_LOCAL_PENALTY;
    if (options.romance && p.openToMore && !os.some((o) => o.openToMore)) cost += ROMANCE_ALONE_PENALTY;
    return cost;
  }
  const unitUtility = (unit: Unit, members: string[]): number =>
    unit.reduce((sum, id) => sum + personUtility(id, members), 0) / unit.length;

  // ---- Build units (+1 pairs travel together). ---------------------------
  const unitOf = new Map<string, Unit>();
  for (const p of attendees) unitOf.set(p.id, [p.id]);
  for (const [a, b] of options.keepTogether ?? []) {
    if (!byId.has(a) || !byId.has(b) || unitOf.get(a) === unitOf.get(b)) continue;
    const merged = [...unitOf.get(a)!, ...unitOf.get(b)!];
    for (const id of merged) unitOf.set(id, merged);
  }
  const units = shuffle(rng, [...new Set(unitOf.values())]).sort((x, y) => y.length - x.length);

  const sizes = groupSizes(attendees.length, minSize, maxSize);
  const groups: Unit[][] = sizes.map(() => []);
  const fill = (g: Unit[]) => g.reduce((n, u) => n + u.length, 0);
  const membersOf = (g: Unit[]) => g.flat();
  /**
   * Who must not sit together: blocked pairs always; with the mix score, also
   * strangers who sat together before and didn't choose each other (D31: never
   * seat them together again, unless there is truly no other way).
   */
  const avoid = (a: Profile, b: Profile) => isBlocked(a, b) || (mix && noClick(a, b));
  const hasBlock = (g: Unit[], unit: Unit) =>
    membersOf(g).some((m) => unit.some((u) => avoid(byId.get(m)!, byId.get(u)!)));
  const hasBlocked = (g: Unit[], unit: Unit) =>
    membersOf(g).some((m) => unit.some((u) => isBlocked(byId.get(m)!, byId.get(u)!)));

  // ---- Initial assignment. ----------------------------------------------
  units.forEach((unit, idx) => {
    const open = groups
      .map((_, i) => i)
      .filter((i) => fill(groups[i]) + unit.length <= sizes[i]);
    // A +1 pair can fail to fit exactly; let it overflow the emptiest table.
    const candidates = open.length > 0 ? open : groups.map((_, i) => i);
    let target: number;
    if (method === "random") {
      target = candidates[idx % candidates.length];
    } else {
      // Greedy: seed empty tables first, then maximise the welfare gain,
      // never seating someone with a person they blocked if avoidable.
      const empty = candidates.filter((i) => groups[i].length === 0);
      if (empty.length > 0) target = empty[0];
      else {
        let best = -Infinity;
        target = candidates[0];
        for (const i of candidates) {
          const before = membersOf(groups[i]);
          const after = [...before, ...unit];
          const gain =
            unitUtility(unit, after) +
            before.reduce((sum, m) => sum + personUtility(m, after) - personUtility(m, before), 0) -
            // Order of hard rules: blocks, then a shared language, then no-click repeats.
            (hasBlocked(groups[i], unit) ? 100 : hasBlock(groups[i], unit) ? NO_CLICK_SEAT_PENALTY : 0);
          if (gain > best + EPS) {
            best = gain;
            target = i;
          }
        }
      }
    }
    groups[target].push(unit);
  });

  // ---- Exchange-stability: swap while two units both strictly gain. -----
  const isolatedIn = (members: string[]): number =>
    members.length < 2
      ? 0
      : members.filter((id) => !members.some((o) => o !== id && sharesLanguage(byId.get(id)!, byId.get(o)!))).length;

  /**
   * Every allowed swap that both sides strictly want, with its total gain.
   * Allowed = same unit size (tables keep their size), no blocked pair
   * created, and nobody — swapper or bystander — left without a shared language.
   */
  const blockingSwapList = (): { gi: number; ui: number; gj: number; vi: number; gain: number }[] => {
    const out: { gi: number; ui: number; gj: number; vi: number; gain: number }[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      for (let gj = gi + 1; gj < groups.length; gj++) {
        const A = membersOf(groups[gi]);
        const B = membersOf(groups[gj]);
        const isolatedBefore = isolatedIn(A) + isolatedIn(B);
        for (let ui = 0; ui < groups[gi].length; ui++) {
          const u = groups[gi][ui];
          const uNow = unitUtility(u, A);
          for (let vi = 0; vi < groups[gj].length; vi++) {
            const v = groups[gj][vi];
            if (v.length !== u.length) continue;
            const Brest = B.filter((m) => !v.includes(m));
            const Arest = A.filter((m) => !u.includes(m));
            const Bswap = [...Brest, ...u];
            const Aswap = [...Arest, ...v];
            const uGain = unitUtility(u, Bswap) - uNow;
            const vGain = unitUtility(v, Aswap) - unitUtility(v, B);
            if (uGain <= EPS || vGain <= EPS) continue;
            if (hasBlock([Brest], u) || hasBlock([Arest], v)) continue;
            if (isolatedIn(Aswap) + isolatedIn(Bswap) > isolatedBefore) continue;
            out.push({ gi, ui, gj, vi, gain: uGain + vGain });
          }
        }
      }
    }
    return out;
  };

  let swapsMade = 0;
  if (method === "stable") {
    // Steepest ascent: always take the swap with the largest combined gain.
    // Converges much faster than first-found and rarely cycles; the cap is a
    // safety net, and any swaps still wanted at the end are reported.
    const maxSwaps = (options.maxRounds ?? 200) * Math.max(1, groups.length);
    for (; swapsMade < maxSwaps; swapsMade++) {
      const swaps = blockingSwapList();
      if (swaps.length === 0) break;
      const best = swaps.reduce((a, b) => (b.gain > a.gain ? b : a));
      [groups[best.gi][best.ui], groups[best.gj][best.vi]] = [groups[best.gj][best.vi], groups[best.gi][best.ui]];
    }
  }

  // ---- Metrics. -----------------------------------------------------------
  const blockingSwaps = blockingSwapList().length;

  const final = groups.map(membersOf);
  const utilities: number[] = [];
  let isolated = 0;
  let blockedConflicts = 0;
  for (const g of final) {
    for (const id of g) {
      utilities.push(personUtility(id, g));
      const p = byId.get(id)!;
      if (g.length > 1 && !g.some((o) => o !== id && sharesLanguage(p, byId.get(o)!))) isolated += 1;
      blockedConflicts += g.filter((o) => o > id && isBlocked(p, byId.get(o)!)).length;
    }
  }

  return {
    groups: final,
    metrics: {
      meanUtility: utilities.reduce((a, b) => a + b, 0) / Math.max(1, utilities.length),
      minUtility: utilities.length ? Math.min(...utilities) : 0,
      blockingSwaps,
      isolated,
      blockedConflicts,
      swapsMade,
      ...mixMetrics(final.map((g) => g.map((id) => byId.get(id)!)), options.romance ?? false),
    },
  };
}

/** How mixed a set of tables is (D31). Pure, so the simulation can score any grouping. */
export function mixMetrics(tables: Profile[][], romance: boolean) {
  const pairsOf = (g: Profile[]) => g.flatMap((a, i) => g.slice(i + 1).map((b) => [a, b] as const));
  let typeSum = 0;
  let typedTables = 0;
  let sameTypeTables = 0;
  let anchored = 0;
  let people = 0;
  let needLocal = 0;
  let gotLocal = 0;
  let romanceNeed = 0;
  let romanceGot = 0;
  let mutualTogether = 0;
  let noClickTogether = 0;
  const hasLocal = tables.some((g) => g.some((p) => p.segment === "local"));
  for (const g of tables) {
    const types = g.map((p) => p.type).filter((t): t is string => !!t);
    if (types.length > 0) {
      typeSum += new Set(types).size;
      typedTables += 1;
    }
    if (types.length >= 3 && new Set(types).size === 1) sameTypeTables += 1;
    for (const p of g) {
      people += 1;
      const others = g.filter((o) => o !== p);
      if (others.some((o) => isAnchor(p, o))) anchored += 1;
      if (hasLocal && p.segment && p.segment !== "local") {
        needLocal += 1;
        if (others.some((o) => o.segment === "local")) gotLocal += 1;
      }
      if (romance && p.openToMore) {
        romanceNeed += 1;
        if (others.some((o) => o.openToMore)) romanceGot += 1;
      }
    }
    for (const [a, b] of pairsOf(g)) {
      if (a.mutual?.includes(b.id) || b.mutual?.includes(a.id)) mutualTogether += 1;
      if (a.metNoClick?.includes(b.id) || b.metNoClick?.includes(a.id)) noClickTogether += 1;
    }
  }
  return {
    typesPerTable: typedTables ? typeSum / typedTables : 0,
    sameTypeTables,
    anchored: people ? anchored / people : 1,
    withLocal: needLocal ? gotLocal / needLocal : 1,
    romanceTogether: romanceNeed ? romanceGot / romanceNeed : 1,
    mutualTogether,
    noClickTogether,
  };
}
