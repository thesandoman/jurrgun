/**
 * Pinky Plans rules, pure (owner, 2026-10-26; 3 Wise Men conditions).
 *
 * Ideas: ranked by the pair's overlap in the first-date kinds both already
 * gave for 💘. Nothing new is asked. The reason is never shown: no "because
 * you both like…". Every three always includes at least one idea that isn't
 * preference-driven, and each three is shuffled, so neither person can work
 * out the other's private answers. A few at a time, up to IDEAS_PER_DAY a
 * day, and never a counter.
 */
import { DATE_IDEAS, IDEAS_AT_A_TIME, IDEAS_PER_DAY, type DateIdea } from "../content/date-ideas";

/** A small deterministic PRNG (mulberry32) seeded from a string: same pair and day, same ideas. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], next: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The first-date kinds both people gave (only the overlap is ever used). */
export function sharedKinds(a: string[] | undefined, b: string[] | undefined): Set<string> {
  const mine = new Set(a ?? []);
  return new Set((b ?? []).filter((k) => mine.has(k)));
}

/**
 * The day's ideas for a pair, in the order they're shown: up to
 * IDEAS_PER_DAY, in threes. Each three holds at most 2 preference-driven
 * ideas and at least 1 that isn't, shuffled within the three.
 */
export function dayIdeas(seed: string, shared: Set<string>, all: DateIdea[] = DATE_IDEAS): DateIdea[] {
  const next = rng(seed);
  const pool = shuffle(all, next);
  const liked = pool.filter((i) => shared.has(i.kind));
  const other = pool.filter((i) => !shared.has(i.kind));
  const out: DateIdea[] = [];
  while (out.length < Math.min(IDEAS_PER_DAY, all.length)) {
    const three: DateIdea[] = [];
    // One that isn't preference-driven, always, when any are left.
    const free = other.shift();
    if (free) three.push(free);
    while (three.length < IDEAS_AT_A_TIME) {
      const likedIn = three.filter((x) => shared.has(x.kind)).length;
      const pick = (likedIn < IDEAS_AT_A_TIME - 1 ? liked.shift() : undefined) ?? other.shift() ?? liked.shift();
      if (!pick) break;
      three.push(pick);
    }
    if (!three.length) break;
    out.push(...shuffle(three, next));
  }
  return out.slice(0, IDEAS_PER_DAY);
}

/** The ideas showing after `batches` presses of "Other ideas" today (0 = the first three). */
export function ideaBatch(day: DateIdea[], batches: number): DateIdea[] {
  return day.slice(batches * IDEAS_AT_A_TIME, (batches + 1) * IDEAS_AT_A_TIME);
}

// ----------------------------------------------------------------- plan --

export const NOTE_MAX = 280;
export const PLACE_MAX = 80;

/** Both people have confirmed the plan as it stands. */
export const bothConfirmed = (p: { aConfirmedAt: Date | null; bConfirmedAt: Date | null } | null | undefined) => !!p?.aConfirmedAt && !!p?.bConfirmedAt;

// ---------------------------------------------------------- end kindly --

/** The gentle preset messages for End kindly (owner card). Nothing free-typed. */
export const END_KINDLY: Record<string, { th: string; en: string }> = {
  thanks: { th: "ขอบคุณที่ไปเดตด้วยกันนะ ขอให้เจอคนที่ใช่", en: "Thank you for the date. I hope you find the right person." },
  friends: { th: "เรากลับมาเป็นเพื่อนกันดีกว่านะ", en: "I'd rather we were friends." },
  not_ready: { th: "ช่วงนี้ยังไม่พร้อมจริง ๆ ขอโทษนะ", en: "I'm not ready right now. I'm sorry." },
};
export const isEndKindly = (x: string): x is keyof typeof END_KINDLY => x in END_KINDLY;
