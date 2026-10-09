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
 * Inputs are only the non-political Vibe vector, interests and languages.
 * +1 friends who asked to stay together move as one unit.
 */

import { isBlocked, score, sharesLanguage, type Profile } from "./profile";
import { createRng, shuffle } from "../vibe/rng";

export type GroupMethod = "random" | "greedy" | "stable";

export type GroupOptions = {
  seed: string;
  minSize?: number;
  maxSize?: number;
  /** Pairs who came together (+1) and asked to stay together. */
  keepTogether?: [string, string][];
  method?: GroupMethod;
  maxRounds?: number;
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
};

export type GroupResult = { groups: string[][]; metrics: GroupMetrics };

/** Language isolation is worse than any amount of vibe mismatch. */
const ISOLATION_PENALTY = 0.5;
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

  // Pair score cache: s(a, b) = how much a enjoys b.
  const cache = new Map<string, number>();
  const s = (a: string, b: string): number => {
    const k = `${a}\u0000${b}`;
    let v = cache.get(k);
    if (v === undefined) {
      const pa = byId.get(a)!;
      const pb = byId.get(b)!;
      v = isBlocked(pa, pb) ? BLOCKED_SCORE : score(pa, pb);
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
    return total / others.length - (canTalk ? 0 : ISOLATION_PENALTY);
  };
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
  const hasBlock = (g: Unit[], unit: Unit) =>
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
            (hasBlock(groups[i], unit) ? 100 : 0);
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
    },
  };
}
