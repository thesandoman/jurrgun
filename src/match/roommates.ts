/**
 * Irving's stable roommates algorithm (1985), with incomplete lists.
 *
 * Why roommates and not Gale–Shapley: Gale–Shapley needs two sides (e.g.
 * "men" and "women"). Friend/buddy pairing has one pool where anyone can be
 * paired with anyone, which is the roommates problem. That also keeps the
 * matching gender-neutral and inclusive by design.
 *
 * A matching is STABLE when no two people would both rather be with each other
 * than with their assigned partner (or than staying unmatched). Unlike the
 * two-sided case, a stable matching may not exist; the algorithm then reports
 * it, and the caller falls back to `bestEffortPairs`.
 */

export type Preferences = Map<string, string[]>;

export type RoommatesResult =
  | { stable: true; pairs: [string, string][]; unmatched: string[] }
  | { stable: false; reason: string };

/**
 * Lists must be symmetric: if a lists b, b lists a (anything else is dropped).
 */
export function stableRoommates(prefs: Preferences): RoommatesResult {
  // Live table: list[x] = x's remaining candidates, kept in preference order.
  const list = new Map<string, string[]>();
  for (const [x, ys] of prefs) {
    const symmetric = ys.filter((y) => y !== x && (prefs.get(y)?.includes(x) ?? false));
    list.set(x, symmetric);
  }

  const remove = (x: string, y: string): void => {
    list.set(x, list.get(x)!.filter((z) => z !== y));
    list.set(y, list.get(y)!.filter((z) => z !== x));
  };

  /** y keeps x and everyone it prefers to x; drops the rest (symmetrically). */
  const truncateAfter = (y: string, x: string): string[] => {
    const ys = list.get(y)!;
    const cut = ys.indexOf(x);
    const dropped = ys.slice(cut + 1);
    for (const z of dropped) remove(y, z);
    return dropped;
  };

  // ---- Phase 1: proposals. ---------------------------------------------
  // proposingTo[x] = whose list x currently sits in as "held".
  const proposingTo = new Map<string, string>();
  const free = [...list.keys()];
  while (free.length > 0) {
    const x = free.shift()!;
    const y = list.get(x)![0];
    if (y === undefined) continue; // x has run out of candidates: unmatched.
    proposingTo.set(x, y);
    // After truncation, every proposal that reaches y is the best y has seen,
    // so y always accepts. Anyone y drops who was proposing to y is free again.
    for (const z of truncateAfter(y, x)) {
      if (proposingTo.get(z) === y) {
        proposingTo.delete(z);
        free.push(z);
      }
    }
  }
  // With incomplete lists, anyone whose list is empty after phase 1 is
  // unmatched in every stable matching. Everyone else must keep a non-empty
  // list through phase 2, or no stable matching exists.
  const live = [...list.keys()].filter((x) => list.get(x)!.length > 0);

  // ---- Phase 2: find and eliminate rotations. ---------------------------
  const second = (x: string) => list.get(x)![1];
  const last = (x: string) => {
    const xs = list.get(x)!;
    return xs[xs.length - 1];
  };

  for (let guard = 0; guard < 100_000; guard++) {
    const start = [...list.keys()].find((x) => list.get(x)!.length > 1);
    if (start === undefined) break;

    // Walk x_{i+1} = last(second(x_i)) until a person repeats.
    const seq: string[] = [start];
    const seenAt = new Map<string, number>([[start, 0]]);
    let cycleStart = -1;
    while (cycleStart === -1) {
      const cur = seq[seq.length - 1];
      const s = second(cur);
      if (s === undefined) return { stable: false, reason: "table broke during rotation search" };
      const nxt = last(s);
      const at = seenAt.get(nxt);
      if (at !== undefined) cycleStart = at;
      else {
        seenAt.set(nxt, seq.length);
        seq.push(nxt);
      }
    }
    const rotation = seq.slice(cycleStart);
    // Read every second() BEFORE changing the table.
    const targets = rotation.map((x) => second(x));
    rotation.forEach((x, i) => truncateAfter(targets[i], x));

    const emptied = live.find((x) => list.get(x)!.length === 0);
    if (emptied !== undefined) {
      return { stable: false, reason: `no stable matching exists (${emptied}'s list emptied in phase 2)` };
    }
  }

  // ---- Read off the matching. --------------------------------------------
  const pairs: [string, string][] = [];
  const unmatched: string[] = [];
  const done = new Set<string>();
  for (const [x, xs] of list) {
    if (done.has(x)) continue;
    const y = xs[0];
    if (y === undefined || list.get(y)![0] !== x) {
      unmatched.push(x);
      done.add(x);
      continue;
    }
    pairs.push(x < y ? [x, y] : [y, x]);
    done.add(x);
    done.add(y);
  }
  return { stable: true, pairs, unmatched };
}

/** Pairs (a, b) that would both rather be together than with their partners. */
export function blockingPairs(prefs: Preferences, pairs: [string, string][]): [string, string][] {
  const partner = new Map<string, string>();
  for (const [a, b] of pairs) {
    partner.set(a, b);
    partner.set(b, a);
  }
  const prefersTo = (x: string, y: string): boolean => {
    const xs = prefs.get(x) ?? [];
    const iy = xs.indexOf(y);
    if (iy === -1) return false;
    const p = partner.get(x);
    if (p === undefined) return true; // anyone acceptable beats being alone
    return iy < xs.indexOf(p);
  };
  const out: [string, string][] = [];
  for (const [x, xs] of prefs) {
    for (const y of xs) {
      if (x < y && (prefs.get(y)?.includes(x) ?? false) && prefersTo(x, y) && prefersTo(y, x)) {
        out.push([x, y]);
      }
    }
  }
  return out;
}

/**
 * Fallback when no stable matching exists, and a baseline for the experiment:
 * repeatedly pair the two people with the highest mutual score.
 */
export function greedyPairs(
  ids: string[],
  mutualScore: (a: string, b: string) => number | null,
): [string, string][] {
  const edges: { a: string; b: string; s: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const s = mutualScore(ids[i], ids[j]);
      if (s !== null) edges.push({ a: ids[i], b: ids[j], s });
    }
  }
  edges.sort((x, y) => y.s - x.s);
  const used = new Set<string>();
  const pairs: [string, string][] = [];
  for (const e of edges) {
    if (used.has(e.a) || used.has(e.b)) continue;
    used.add(e.a);
    used.add(e.b);
    pairs.push(e.a < e.b ? [e.a, e.b] : [e.b, e.a]);
  }
  return pairs;
}
