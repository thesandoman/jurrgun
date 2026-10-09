/**
 * Procedural question generator for the Bangkok Vibe quiz.
 *
 * Questions are not stored anywhere. Each one is assembled from a template plus
 * random pieces of the content bank (activity, place, time, companion). A
 * session is fully determined by its seed, so the server can rebuild it from
 * the seed alone and score the answers without keeping any session state.
 *
 * Balance guarantees per session:
 *   - the same number of items for each of the 6 categories;
 *   - at least one 1–5 scale item per category (counters "always pick A");
 *   - the "+" option's position (A or B) is random;
 *   - no activity is used twice, and no question id the user has already seen.
 */

import {
  ACTIVITIES,
  CATEGORIES,
  COMPANIONS,
  PLACES,
  POLES,
  STATEMENTS,
  WHENS,
  type Category,
  type Pole,
  type Text,
} from "./content";
import { createRng, hashString, pick, shuffle, type Rng } from "./rng";
import { activityIcon, POLE_ICONS, PLACE_ICONS, WHEN_TONES, type Art } from "./visuals";

export type ChoiceOption = { label: Text; pole: Pole; icon: string };

export type Question =
  | {
      id: string;
      category: Category;
      format: "choice";
      template: string;
      prompt: Text;
      options: [ChoiceOption, ChoiceOption];
      art: Art;
    }
  | {
      id: string;
      category: Category;
      format: "scale";
      template: string;
      prompt: Text;
      art: Art;
      /** The pole that a 5 ("very me") points to. */
      pole: Pole;
      minLabel: Text;
      maxLabel: Text;
    };

/** What the browser gets: no category, no pole — nothing to game. */
export type PublicQuestion =
  | { id: string; format: "choice"; prompt: Text; options: Text[]; icons: string[]; art: Art }
  | { id: string; format: "scale"; prompt: Text; min: 1; max: 5; minLabel: Text; maxLabel: Text; art: Art };

export type SessionOptions = {
  seed: string;
  /** Items per category. 3 → 18 questions, about 3 minutes. */
  perCategory?: number;
  /** Question ids this user has already answered; avoided where possible. */
  seen?: ReadonlySet<string>;
};

type Used = Set<string>;

const t = (en: string, th: string): Text => ({ en, th });

function poleActivity(rng: Rng, category: Category, pole: Pole, used: Used): Text {
  const bank = pole === 1 ? ACTIVITIES[category].plus : ACTIVITIES[category].minus;
  const fresh = bank.filter((a) => !used.has(a.en));
  const chosen = pick(rng, fresh.length > 0 ? fresh : bank);
  used.add(chosen.en);
  return chosen;
}

/** Puts the "+" activity at A or B at random so position carries no signal. */
function pair(rng: Rng, category: Category, used: Used): [ChoiceOption, ChoiceOption] {
  const pl = poleActivity(rng, category, 1, used);
  const mi = poleActivity(rng, category, -1, used);
  const plus: ChoiceOption = { label: pl, pole: 1, icon: activityIcon(pl, category, 1) };
  const minus: ChoiceOption = { label: mi, pole: -1, icon: activityIcon(mi, category, -1) };
  return rng() < 0.5 ? [plus, minus] : [minus, plus];
}

function makeId(template: string, category: Category, parts: Text[]): string {
  return hashString([template, category, ...parts.map((p) => p.en)].join("|")).toString(36);
}

type ChoiceTemplate = (rng: Rng, category: Category, used: Used) => Question;

const CHOICE_TEMPLATES: Record<string, ChoiceTemplate> = {
  scene(rng, category, used) {
    const when = pick(rng, WHENS);
    const place = pick(rng, PLACES);
    const options = pair(rng, category, used);
    return {
      id: makeId("scene", category, [when, place, options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "scene",
      prompt: t(
        `${when.en}, you're near ${place.en}. Which sounds better?`,
        `${when.th} คุณอยู่แถว${place.th} แบบไหนน่าสนใจกว่า?`,
      ),
      options,
      art: { tone: WHEN_TONES[when.en] ?? "afternoon", icons: [PLACE_ICONS[place.en] ?? "📍"], caption: place, seed: hashString(place.en + when.en) },
    };
  },
  host(rng, category, used) {
    const who = pick(rng, COMPANIONS);
    const place = pick(rng, PLACES);
    const options = pair(rng, category, used);
    return {
      id: makeId("host", category, [who, place, options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "host",
      prompt: t(
        `You're showing ${who.en} around ${place.en}. You'd suggest…`,
        `คุณพา${who.th}เที่ยวแถว${place.th} คุณจะชวนไป…`,
      ),
      options,
      art: { tone: "afternoon", icons: [PLACE_ICONS[place.en] ?? "📍", "🧳"], caption: place, seed: hashString(place.en + who.en) },
    };
  },
  quick(rng, category, used) {
    const options = pair(rng, category, used);
    return {
      id: makeId("quick", category, [options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "quick",
      prompt: t("Quick one — which is more you?", "เร็ว ๆ — แบบไหนเป็นคุณมากกว่า?"),
      options,
      art: { tone: POLE_ICONS[category].tone, icons: [options[0].icon, options[1].icon], seed: hashString(options[0].label.en) },
    };
  },
  /**
   * Reversed item: the user picks what to SKIP, so the chosen option's pole is
   * flipped. Mixing these in stops a habit of always picking the first or the
   * "fun-sounding" answer from dominating a score.
   */
  skip(rng, category, used) {
    const [a, b] = pair(rng, category, used);
    const options: [ChoiceOption, ChoiceOption] = [
      { label: a.label, pole: (-a.pole) as Pole, icon: a.icon },
      { label: b.label, pole: (-b.pole) as Pole, icon: b.icon },
    ];
    return {
      id: makeId("skip", category, [a.label, b.label]),
      category,
      format: "choice",
      template: "skip",
      prompt: t(
        "Your weekend only has room for one of these. Which do you skip?",
        "วันหยุดนี้ทำได้แค่อย่างเดียว คุณจะ 'ข้าม' อันไหน?",
      ),
      options,
      art: { tone: "afternoon", icons: [a.icon, "⚖️", b.icon], seed: hashString(a.label.en + b.label.en) },
    };
  },
};

function scaleQuestion(rng: Rng, category: Category): Question {
  const pole: Pole = rng() < 0.5 ? 1 : -1;
  const bank = pole === 1 ? STATEMENTS[category].plus : STATEMENTS[category].minus;
  const statement = pick(rng, bank);
  return {
    id: makeId("scale", category, [statement]),
    category,
    format: "scale",
    template: "scale",
    prompt: t(`How much is this you? “${statement.en}”`, `ตรงกับคุณแค่ไหน? “${statement.th}”`),
    pole,
    art: { tone: POLE_ICONS[category].tone, icons: [pole === 1 ? POLE_ICONS[category].plus : POLE_ICONS[category].minus], seed: hashString(statement.en) },
    minLabel: t("Not me", "ไม่ใช่เลย"),
    maxLabel: t("So me", "ใช่เลย"),
  };
}

function itemsForCategory(
  rng: Rng,
  category: Category,
  count: number,
  used: Used,
  seen: ReadonlySet<string>,
  taken: Set<string>,
): Question[] {
  const out: Question[] = [];
  const accept = (make: () => Question): void => {
    // A few retries to dodge ids already seen or already in this session.
    let q = make();
    for (let i = 0; i < 8 && (seen.has(q.id) || taken.has(q.id)); i++) q = make();
    taken.add(q.id);
    out.push(q);
  };
  accept(() => scaleQuestion(rng, category));
  const templates = shuffle(rng, Object.keys(CHOICE_TEMPLATES));
  for (let i = 0; out.length < count; i++) {
    const name = templates[i % templates.length];
    accept(() => CHOICE_TEMPLATES[name](rng, category, used));
  }
  return out;
}

/**
 * Reorders so neither the category nor the question template repeats back to
 * back (category takes priority when both can't be avoided).
 */
function interleave(rng: Rng, items: Question[]): Question[] {
  const pool = shuffle(rng, items);
  const out: Question[] = [];
  while (pool.length > 0) {
    const prev = out[out.length - 1];
    let idx = pool.findIndex((q) => q.category !== prev?.category && q.template !== prev?.template);
    if (idx === -1) idx = pool.findIndex((q) => q.category !== prev?.category);
    out.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

export function generateSession(options: SessionOptions): Question[] {
  const perCategory = Math.min(Math.max(options.perCategory ?? 3, 2), 6);
  const rng = createRng(`vibe:${options.seed}`);
  const used: Used = new Set();
  const taken = new Set<string>();
  const seen = options.seen ?? new Set<string>();
  const all = CATEGORIES.flatMap((c) => itemsForCategory(rng, c, perCategory, used, seen, taken));
  return interleave(rng, all);
}

export function toPublic(q: Question): PublicQuestion {
  if (q.format === "choice") {
    return { id: q.id, format: "choice", prompt: q.prompt, options: q.options.map((o) => o.label), icons: q.options.map((o) => o.icon), art: q.art };
  }
  return { id: q.id, format: "scale", prompt: q.prompt, min: 1, max: 5, minLabel: q.minLabel, maxLabel: q.maxLabel, art: q.art };
}

// ---------------------------------------------------------------- scoring --

/** choice → option index (0 or 1); scale → 1..5. */
export type Answers = Record<string, number>;

export type Strength = "strong" | "leans" | "balanced";

export type VibeResult = {
  /** −1..+1 per category; + is the first pole in POLES. */
  vector: Record<Category, number>;
  strength: Record<Category, Strength>;
  answered: number;
  name: Text;
  /** Two strongest poles, for display. Empty when everything is balanced. */
  highlights: { category: Category; pole: Pole }[];
};

export function itemScore(q: Question, answer: number): number | null {
  if (q.format === "choice") {
    if (answer !== 0 && answer !== 1) return null;
    return q.options[answer].pole;
  }
  if (!Number.isInteger(answer) || answer < 1 || answer > 5) return null;
  return ((answer - 3) / 2) * q.pole + 0; // + 0 turns -0 into 0
}

export function strengthOf(score: number): Strength {
  const a = Math.abs(score);
  if (a >= 0.6) return "strong";
  if (a >= 0.25) return "leans";
  return "balanced";
}

export function scoreSession(questions: Question[], answers: Answers): VibeResult {
  const sums = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let answered = 0;
  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined) continue;
    const s = itemScore(q, a);
    if (s === null) continue;
    sums[q.category] += s;
    counts[q.category] += 1;
    answered += 1;
  }
  const vector = {} as Record<Category, number>;
  const strength = {} as Record<Category, Strength>;
  for (const c of CATEGORIES) {
    vector[c] = counts[c] === 0 ? 0 : sums[c] / counts[c];
    strength[c] = strengthOf(vector[c]);
  }
  const highlights = CATEGORIES.filter((c) => strength[c] !== "balanced")
    .sort((a, b) => Math.abs(vector[b]) - Math.abs(vector[a]) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
    .slice(0, 2)
    .map((category) => ({ category, pole: (vector[category] >= 0 ? 1 : -1) as Pole }));
  return { vector, strength, answered, name: vibeName(highlights), highlights };
}

function poleInfo(category: Category, pole: Pole) {
  return pole === 1 ? POLES[category].plus : POLES[category].minus;
}

/** "Curious Night Owl" / "นกฮูกราตรีสายลองของใหม่". */
export function vibeName(highlights: { category: Category; pole: Pole }[]): Text {
  if (highlights.length === 0) return t("Bangkok All-Rounder", "สายกลางรอบด้านแห่งกรุงเทพฯ");
  const main = poleInfo(highlights[0].category, highlights[0].pole);
  if (highlights.length === 1) return t(`Bangkok ${main.noun.en}`, `${main.noun.th}แห่งกรุงเทพฯ`);
  const second = poleInfo(highlights[1].category, highlights[1].pole);
  return t(`${second.adjective.en} ${main.noun.en}`, `${main.noun.th}${second.adjective.th}`);
}

/**
 * How many distinct questions the generator can produce (by id), template by
 * template. Order of the two options counts, as it changes the question.
 */
export function questionSpace(): number {
  let total = 0;
  for (const c of CATEGORIES) {
    const pairs = ACTIVITIES[c].plus.length * ACTIVITIES[c].minus.length * 2;
    total += WHENS.length * PLACES.length * pairs; // scene
    total += COMPANIONS.length * PLACES.length * pairs; // host
    total += pairs; // quick
    total += pairs; // skip
    total += STATEMENTS[c].plus.length + STATEMENTS[c].minus.length; // scale
  }
  return total;
}
