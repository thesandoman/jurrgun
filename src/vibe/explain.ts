/**
 * "Why you got this": a result explained from the person's own picks (Q7).
 * No numbers, no score: two of their own answers that show the type, and the
 * letters those answers share with it.
 */
import { POLES, type Text } from "./content";
import type { Answers, Question } from "./generator";
import { LETTERS } from "./scenarios";

/** Up to two of the person's own picks that show their type, and the letters they share. */
export type Why = { picks: Text[]; letters: string[] };

const shared = (a: string, b: string) => [0, 1, 2, 3].filter((i) => a[i] === b[i]).length;

/**
 * Picks the clearest evidence for `archetype` among the answers: their own
 * type's answers first, then answers three letters close, earliest first.
 * Only plain one-pick answers count (a "none", a slider or a rank isn't quoted).
 */
export function whyOf(questions: Question[], answers: Answers, archetype: string): Why {
  const picks = questions
    .map((q, order) => {
      const a = answers[q.id];
      const o = typeof a === "number" && a >= 0 && q.format === "choice" ? q.options[a] : undefined;
      return o ? { o, order, score: shared(o.type, archetype) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.score >= 3)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 2);
  if (picks.length === 0) return { picks: [], letters: [] };
  const letters = [0, 1, 2, 3].filter((i) => picks.every((x) => x.o.type[i] === archetype[i])).map((i) => archetype[i]);
  return { picks: picks.map((x) => x.o.label), letters };
}

/** "Chill and Heritage" / "ชิล และ ดั้งเดิม". */
export function letterWords(letters: readonly string[]): Text {
  const label = (ch: string) => {
    const { category, pole } = LETTERS[ch];
    return pole === 1 ? POLES[category].plus.label : POLES[category].minus.label;
  };
  const join = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
  return { en: join(letters.map((ch) => label(ch).en), "and"), th: join(letters.map((ch) => label(ch).th), "และ") };
}
