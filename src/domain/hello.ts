/**
 * "Say hi first" (owner card 10-16, costly signalling without money): the day
 * before a meetup, everyone going can answer one light prompt, shared only
 * with the people at that meetup (only their own table once groups are out).
 * Walking in already knowing something about each person takes the edge off
 * nerves and gives an easy first topic. Skipping is fine; nothing is scored.
 * Lines are cleared 7 days after the meetup (src/services/retention.ts).
 */

/** Opens this many hours before the start, and closes when the meetup ends. */
export const HELLO_OPEN_HOURS = 36;
export const HELLO_MAX = 80;

const HOUR = 3_600_000;

export function helloOpen(event: { startsAt: Date; endsAt: Date }, now: Date): boolean {
  return now.getTime() >= event.startsAt.getTime() - HELLO_OPEN_HOURS * HOUR && now.getTime() < event.endsAt.getTime();
}

/** The prompt: about food when it's a food meetup, otherwise what you'd love to talk about. */
export function helloPrompt(tags: readonly string[]): { th: string; en: string } {
  return tags.includes("food")
    ? { th: "ถ้าได้สั่งให้ทั้งโต๊ะ คุณจะสั่งเมนูอะไร?", en: "The dish you'd order for the table?" }
    : { th: "เรื่องที่คุณอยากคุยด้วยที่สุดตอนนี้?", en: "Something you'd love to chat about right now?" };
}

/** One line, trimmed and capped; empty clears it. */
export function cleanHello(raw: string): string | null {
  const line = raw.replace(/\s+/g, " ").trim().slice(0, HELLO_MAX).trim();
  return line ? line : null;
}
