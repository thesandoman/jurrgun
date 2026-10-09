/**
 * Small deterministic random helpers. The quiz and the matching experiment
 * must be reproducible: the same seed always gives the same questions, so a
 * session can be re-generated server-side to score it without storing it.
 */

export type Rng = () => number;

/** FNV-1a 32-bit. Used to turn a string seed into a number and to build stable ids. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — fast, decent-quality 32-bit PRNG. Returns floats in [0, 1). */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() from an empty list");
  return items[randInt(rng, items.length)];
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
