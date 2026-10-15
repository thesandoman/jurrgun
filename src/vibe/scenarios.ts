/**
 * Type-linked scenarios: the Enneagram half of the Bangkok Type quiz.
 *
 * The axis items (content.ts) measure one letter at a time, MBTI style. These
 * items do the opposite: every answer is written in the voice of ONE of the 16
 * Bangkok Types, usually at a real Bangkok place that type would pick. A
 * question shows four answers from four different types, so picking one moves
 * all four letters at once and also counts as a vote for that type.
 *
 * The four types on a question are always two opposite pairs (X, its opposite,
 * Y, its opposite), so every letter has two answers on each side and no
 * position or letter is favoured. Which pairs, which scenario and the order are
 * random per session.
 *
 * Rule for anyone adding content: an answer must read like something that type
 * would actually do, and must fit ALL FOUR of its letters:
 *   B Buzz (a crowd, a group)      / C Chill (alone, one or two people)
 *   D Discover (new, never tried)  / F Familiar (the usual, a regular)
 *   M Move (walking, cycling, sport) / S Savour (sitting, eating, talking)
 *   N New-scene (art, design, indie, new openings) / H Heritage (temples, old markets, old shops)
 * Nothing political or religious practice, and no em or en dashes.
 */
import type { Category, Pole, Text } from "./content";
import type { Tone } from "./visuals";
import { CLASSIC } from "./bank/classic";
import { DATES } from "./bank/dates";
import { FAMILY } from "./bank/family";
import { FRIENDS_SOLO } from "./bank/friends-solo";
import { PARTY_MEETUP_WORK } from "./bank/party-meetup-work";
import { PLAN } from "./bank/plan";
import { RHYTHM } from "./bank/rhythm";

export const TYPE_CODES = [
  "BDMN", "BDMH", "BDSN", "BDSH", "BFMN", "BFMH", "BFSN", "BFSH",
  "CDMN", "CDMH", "CDSN", "CDSH", "CFMN", "CFMH", "CFSN", "CFSH",
] as const;
export type TypeCode = (typeof TYPE_CODES)[number];

/** Each letter of a code and the axis pole it stands for. */
export const LETTERS: Record<string, { category: Category; pole: Pole }> = {
  B: { category: "energy", pole: 1 },
  C: { category: "energy", pole: -1 },
  D: { category: "explore", pole: 1 },
  F: { category: "explore", pole: -1 },
  M: { category: "motion", pole: 1 },
  S: { category: "motion", pole: -1 },
  N: { category: "culture", pole: 1 },
  H: { category: "culture", pole: -1 },
};

const FLIP: Record<string, string> = { B: "C", C: "B", D: "F", F: "D", M: "S", S: "M", N: "H", H: "N" };

export function isTypeCode(k: string): k is TypeCode {
  return (TYPE_CODES as readonly string[]).includes(k);
}

/** Every letter flipped: BDSH → CFMN. */
export function oppositeCode(code: TypeCode): TypeCode {
  return code.split("").map((ch) => FLIP[ch]).join("") as TypeCode;
}

/** The four (category, pole) pairs a code stands for. */
export function codePoles(code: string): { category: Category; pole: Pole }[] {
  return code.split("").map((ch) => LETTERS[ch]);
}

/** Who the scenario is with. Every quiz mixes these (see generator.ts). */
export type Context = "friends" | "family" | "date" | "solo" | "coworkers" | "party" | "meetup";
/** core: types only; rhythm / plan: each answer also leans night owl or early riser, spontaneous or planner. */
export type Kind = "core" | "rhythm" | "plan";
/**
 * What kind of moment the scenario is (the bank's mix target lives in
 * design/reference/quiz-blueprint.md). Not `tone`: that is the postcard sky.
 */
export type Mood = "everyday" | "landmark" | "seasonal" | "funny" | "personality";
/** The member's Bangkok story (src/domain/segment.ts). */
export type Audience = "local" | "newcomer" | "international";
/**
 * A set only some members are offered: "open-to-more" for members who switched
 * on Open to something more (D4), "table-host" for Table Hosts. Absent means
 * the core quiz everyone gets, which has no romance.
 */
export type ScenarioSet = "open-to-more" | "table-host";

export type Answer = Text & {
  icon: string;
  /** DISTRICTS key (src/lib/constants.ts) of the place the answer names. */
  district: string;
  /** rhythm / plan scenarios only: +1 night owl or spontaneous, -1 early riser or planner. Opposite types always lean opposite ways. */
  flavour?: Pole;
};

export type Scenario = {
  id: string;
  kind: Kind;
  context: Context;
  /** id of the scenario that asks the same thing in other words (consistency check). */
  twin?: string;
  prompt: Text;
  icon: string;
  tone: Tone;
  mood: Mood;
  /** Months (1 to 12) the scenario fits, for seasonal ones only; absent means all year. */
  months?: number[];
  /** Written for these members only; absent means everyone. */
  audience?: Audience[];
  /** Offered only to members in this set (see ScenarioSet); absent means the core quiz. */
  set?: ScenarioSet;
  /**
   * Date moments only (owner, Q-D1): the same moment as a one-to-one friend
   * meetup, shown to every member who isn't open to something more. Answers
   * listed here replace the date wording; the rest read the same either way.
   * Same answers and types, so scoring is identical.
   */
  friend?: { prompt: Text; icon?: string; answers?: Partial<Record<TypeCode, Text>> };
  answers: Record<TypeCode, Answer>;
};

export const SCENARIOS: Scenario[] = [...CLASSIC, ...FAMILY, ...DATES, ...PARTY_MEETUP_WORK, ...FRIENDS_SOLO, ...RHYTHM, ...PLAN];
