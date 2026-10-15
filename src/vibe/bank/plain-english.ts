/**
 * Language flavour (Task 10): the English of the quiz for members who don't
 * speak Thai, or who are here from abroad. Same scenarios, same answers, same
 * types; only the English words change:
 *
 *  - local words get a few words of explanation the first time they appear
 *    ("khao tom" → "khao tom (rice soup)"), so new content is covered too;
 *  - a few prompts become moments from an expat's Bangkok (a visa run,
 *    learning Thai), where every answer still reads right.
 *
 * Thai text is never changed: Thai readers keep the fully local wording.
 * Language never goes into the seed, so switching language mid-quiz still
 * rebuilds the same session.
 */

/** Local word → what it is. Longer phrases first, so "khao man gai" wins over shorter matches. */
export const GLOSSES: [RegExp, string][] = [
  [/\bkhao man gai\b/i, "chicken rice"],
  [/\bkhao kha mu\b/i, "braised pork leg on rice"],
  [/\bkhao mok\b/i, "Thai biryani"],
  [/\bkhao tom\b/i, "rice soup"],
  [/\bjok\b/i, "rice porridge"],
  [/\bpatongko\b/i, "Thai doughnuts"],
  [/\bkopi\b/i, "old-style coffee"],
  [/\bsom tam\b/i, "papaya salad"],
  [/\bkanom\b(?! (?:Market|shop))/i, "Thai sweets"],
  [/\bLoy Krathong\b/i, "the festival of floating flower baskets"],
  [/(?<!Loy )\bkrathong\b/i, "a small floating flower basket"],
  [/\bSongkran\b/i, "Thai New Year, the water festival"],
  [/\bsepak takraw\b/i, "kick volleyball"],
  [/\bWat Arun\b/, "Temple of Dawn"],
  [/\bWat Pho\b/, "Temple of the Reclining Buddha"],
];

/** Each local word explained once, in brackets after it. Text that already explains it is left alone. */
export function explainLocal(en: string): string {
  let out = en;
  for (const [re, gloss] of GLOSSES) {
    const m = re.exec(out);
    if (!m || out.includes(`(${gloss})`)) continue;
    const end = m.index + m[0].length;
    out = `${out.slice(0, end)} (${gloss})${out.slice(end)}`;
  }
  return out;
}

/**
 * Expat moments: English prompts for members who don't speak Thai. The Thai
 * prompt stays as it is. Same rule as segment-prompts.ts: all 16 answers must
 * still read right after it.
 */
export const EXPAT_PROMPTS: Record<string, string> = {
  longweekend: "Back from a visa run, with a long weekend left and your friends all free. Where does it take you?",
  "new-group": "You want a regular group to meet people and practise your Thai. Which one?",
  "know-one": "A Thai friend invites you to an event where you only know them and most people speak Thai. What do you hope it is?",
  "weekday-off": "A Thai public holiday you'd never heard of, just you. How do you spend it?",
};
