/**
 * Procedural question generator for the Bangkok Vibe quiz.
 *
 * Questions are not stored anywhere. Each one is assembled from a template plus
 * random pieces of the content bank (activity, place, time, companion,
 * situation, slider end, "bothers" item, superpower). A session is fully
 * determined by its seed (and the optional personalisation), so the server can
 * rebuild it to score the answers without keeping any session state.
 *
 * Formats, all scored onto the same 6 categories, each in −1..+1:
 *   choice   pick one of two (templates scene, host, quick, skip, moment, power)
 *   bothers  "which would bother you more?" (reversed: the text describes the other side)
 *   scale    1–5 "how much is this you?"
 *   slider   0–100 between two pole phrases
 *   rank     order four activities, favourite first
 *   budget   spread 10 coins across four activities
 *
 * Balance guarantees per session:
 *   - the same number of items for each of the 6 categories (`perCategory`);
 *   - classic: one 1–5 scale item per category, the rest two-option choices;
 *   - mixed: at least one slider and one rank and one budget, plus scales,
 *     "bothers" items and choices, spread across the categories;
 *   - the "+" option's position is random;
 *   - neither the category nor (where it can be avoided) the format repeats
 *     back to back;
 *   - no activity is used twice, no question id twice, and no question id the
 *     user has already seen (where possible).
 */

import {
  ACTIVITIES,
  BOTHERS,
  CATEGORIES,
  COMPANIONS,
  PLACES,
  POLES,
  SITUATIONS,
  SLIDER_ENDS,
  STATEMENTS,
  SUPERPOWERS,
  WHENS,
  type Category,
  type Companion,
  type Place,
  type Pole,
  type Text,
} from "./content";
import { createRng, hashString, pick, shuffle, type Rng } from "./rng";
import { activityIcon, COMPANION_ICONS, phraseIcon, POLE_ICONS, PLACE_ICONS, SITUATION_ART, WHEN_TONES, type Art } from "./visuals";

export type ChoiceOption = { label: Text; pole: Pole; icon: string };

export type Format = "choice" | "bothers" | "scale" | "slider" | "rank" | "budget";

type Base = { id: string; category: Category; template: string; prompt: Text; art: Art };

export type Question =
  | (Base & { format: "choice"; options: [ChoiceOption, ChoiceOption] })
  /** Each option's pole is already the pole it scores (the text describes the other side). */
  | (Base & { format: "bothers"; options: [ChoiceOption, ChoiceOption] })
  | (Base & {
      format: "scale";
      /** The pole that a 5 ("very me") points to. */
      pole: Pole;
      minLabel: Text;
      maxLabel: Text;
    })
  /** options[0] is the left end (0), options[1] the right end (100); their poles are opposite. */
  | (Base & { format: "slider"; options: [ChoiceOption, ChoiceOption] })
  | (Base & { format: "rank"; options: ChoiceOption[] })
  | (Base & { format: "budget"; options: ChoiceOption[]; coins: number });

/** What the browser gets: no category, no pole, nothing to game. */
export type PublicQuestion =
  | { id: string; format: "choice" | "bothers"; prompt: Text; options: Text[]; icons: string[]; art: Art }
  | { id: string; format: "scale"; prompt: Text; min: 1; max: 5; minLabel: Text; maxLabel: Text; art: Art }
  | { id: string; format: "slider"; prompt: Text; min: 0; max: 100; options: Text[]; icons: string[]; art: Art }
  | { id: string; format: "rank"; prompt: Text; options: Text[]; icons: string[]; art: Art }
  | { id: string; format: "budget"; prompt: Text; coins: number; options: Text[]; icons: string[]; art: Art };

/** Light personalisation: biases places and companions, and changes the session. */
export type Personal = { district?: string | null; interests?: readonly string[] | null };

export type SessionOptions = {
  seed: string;
  /** Items per category. 3 → 18 questions, about 3 to 4 minutes. */
  perCategory?: number;
  /** Question ids this user has already answered; avoided where possible. */
  seen?: ReadonlySet<string>;
  /**
   * "classic" (default, used by the public /api/vibe prototype): scale + two-option
   * choices only. "mixed": the full v3.1 mix of sliders, ranking, coins and more.
   */
  formats?: "classic" | "mixed";
  personal?: Personal;
};

/** Coins in a budget question. */
export const COINS = 10;

type Used = Set<string>;
type Ctx = { rng: Rng; used: Used; personal?: Personal };

const t = (en: string, th: string): Text => ({ en, th });
const plain = (x: Text): Text => ({ en: x.en, th: x.th });

// ------------------------------------------------------------ picking --

function freshPick(rng: Rng, bank: readonly Text[], used: Used): Text {
  const fresh = bank.filter((a) => !used.has(a.en));
  const chosen = pick(rng, fresh.length > 0 ? fresh : bank);
  used.add(chosen.en);
  return chosen;
}

function poleActivity(ctx: Ctx, category: Category, pole: Pole): ChoiceOption {
  const bank = pole === 1 ? ACTIVITIES[category].plus : ACTIVITIES[category].minus;
  const label = freshPick(ctx.rng, bank, ctx.used);
  return { label: plain(label), pole, icon: activityIcon(label, category, pole) };
}

function polePhrase(ctx: Ctx, bank: { plus: Text[]; minus: Text[] }, category: Category, pole: Pole): ChoiceOption {
  const label = freshPick(ctx.rng, pole === 1 ? bank.plus : bank.minus, ctx.used);
  return { label: plain(label), pole, icon: phraseIcon(label, category, pole) };
}

/** Random order so position carries no signal. */
function sides<T>(rng: Rng, a: T, b: T): [T, T] {
  return rng() < 0.5 ? [a, b] : [b, a];
}

/** One activity from each pole, the "+" one at A or B at random. */
function pair(ctx: Ctx, category: Category): [ChoiceOption, ChoiceOption] {
  return sides(ctx.rng, poleActivity(ctx, category, 1), poleActivity(ctx, category, -1));
}

/** Two from each pole, shuffled: for rank and budget. */
function four(ctx: Ctx, category: Category): ChoiceOption[] {
  return shuffle(ctx.rng, [poleActivity(ctx, category, 1), poleActivity(ctx, category, 1), poleActivity(ctx, category, -1), poleActivity(ctx, category, -1)]);
}

function overlaps(tags: readonly string[], interests: readonly string[] | null | undefined): boolean {
  return !!interests && interests.some((i) => tags.includes(i));
}

/** Leans toward places in the person's district or matching their interests. */
function pickPlace(ctx: Ctx): Place {
  const p = ctx.personal;
  const unused = (list: Place[]) => list.filter((pl) => !ctx.used.has(`place:${pl.en}`));
  let chosen: Place | null = null;
  if (p) {
    const r = ctx.rng();
    const local = p.district ? unused(PLACES.filter((pl) => pl.districts.includes(p.district!))) : [];
    const liked = unused(PLACES.filter((pl) => overlaps(pl.tags, p.interests)));
    if (local.length > 0 && r < 0.3) chosen = pick(ctx.rng, local);
    else if (liked.length > 0 && r < 0.65) chosen = pick(ctx.rng, liked);
  }
  if (!chosen) {
    const rest = unused(PLACES);
    chosen = pick(ctx.rng, rest.length > 0 ? rest : PLACES);
  }
  ctx.used.add(`place:${chosen.en}`);
  return chosen;
}

/** A situation or time of day not yet used in this session, where possible. */
function freshScene(ctx: Ctx, bank: readonly Text[], kind: string): Text {
  const fresh = bank.filter((x) => !ctx.used.has(`${kind}:${x.en}`));
  const chosen = pick(ctx.rng, fresh.length > 0 ? fresh : bank);
  ctx.used.add(`${kind}:${chosen.en}`);
  return chosen;
}

function pickCompanion(ctx: Ctx): Companion {
  const unused = COMPANIONS.filter((c) => !ctx.used.has(`who:${c.en}`));
  const pool = unused.length > 0 ? unused : COMPANIONS;
  const liked = pool.filter((c) => overlaps(c.tags, ctx.personal?.interests));
  const chosen = liked.length > 0 && ctx.rng() < 0.45 ? pick(ctx.rng, liked) : pick(ctx.rng, pool);
  ctx.used.add(`who:${chosen.en}`);
  return chosen;
}

function situationArt(sit: Text) {
  return SITUATION_ART[sit.en] ?? { tone: "afternoon" as const, icon: "🏙️" };
}

function makeId(template: string, category: Category, parts: (Text | string)[]): string {
  return hashString([template, category, ...parts.map((p) => (typeof p === "string" ? p : p.en))].join("|")).toString(36);
}

// --------------------------------------------------------- templates --

type Builder = (ctx: Ctx, category: Category) => Question;

const CHOICE_TEMPLATES: Record<string, Builder> = {
  scene(ctx, category) {
    const when = freshScene(ctx, WHENS, "when");
    const place = pickPlace(ctx);
    const options = pair(ctx, category);
    const home = !!ctx.personal?.district && place.districts.includes(ctx.personal.district);
    return {
      id: makeId("scene", category, [when, place, options[0].label, options[1].label, home ? "home" : ""]),
      category,
      format: "choice",
      template: "scene",
      prompt: home
        ? t(`${when.en}, close to home near ${place.en}. Which sounds better?`, `${when.th} ใกล้บ้านแถว${place.th} แบบไหนน่าสนใจกว่า?`)
        : t(`${when.en}, you're near ${place.en}. Which sounds better?`, `${when.th} คุณอยู่แถว${place.th} แบบไหนน่าสนใจกว่า?`),
      options,
      art: { tone: WHEN_TONES[when.en] ?? "afternoon", icons: [PLACE_ICONS[place.en] ?? "📍"], caption: plain(place), seed: hashString(place.en + when.en) },
    };
  },
  host(ctx, category) {
    const who = pickCompanion(ctx);
    const place = pickPlace(ctx);
    const options = pair(ctx, category);
    return {
      id: makeId("host", category, [who, place, options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "host",
      prompt: t(`You're showing ${who.en} around ${place.en}. You'd suggest…`, `คุณพา${who.th}เที่ยวแถว${place.th} คุณจะชวนไป…`),
      options,
      art: { tone: "afternoon", icons: [PLACE_ICONS[place.en] ?? "📍", COMPANION_ICONS[who.en] ?? "🧳"], caption: plain(place), seed: hashString(place.en + who.en) },
    };
  },
  quick(ctx, category) {
    const options = pair(ctx, category);
    return {
      id: makeId("quick", category, [options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "quick",
      prompt: t("Quick one: which is more you?", "เร็ว ๆ แบบไหนเป็นคุณมากกว่า?"),
      options,
      art: { tone: POLE_ICONS[category].tone, icons: [options[0].icon, options[1].icon], seed: hashString(options[0].label.en) },
    };
  },
  /**
   * Reversed item: the user picks what to SKIP, so the chosen option's pole is
   * flipped. Mixing these in stops a habit of always picking the first or the
   * "fun-sounding" answer from dominating a score.
   */
  skip(ctx, category) {
    const [a, b] = pair(ctx, category);
    const options: [ChoiceOption, ChoiceOption] = [
      { label: a.label, pole: (-a.pole) as Pole, icon: a.icon },
      { label: b.label, pole: (-b.pole) as Pole, icon: b.icon },
    ];
    return {
      id: makeId("skip", category, [a.label, b.label]),
      category,
      format: "choice",
      template: "skip",
      prompt: t("Your weekend only has room for one of these. Which do you skip?", "วันหยุดนี้ทำได้แค่อย่างเดียว คุณจะ 'ข้าม' อันไหน?"),
      options,
      art: { tone: "afternoon", icons: [a.icon, "⚖️", b.icon], seed: hashString(a.label.en + b.label.en) },
    };
  },
  /** An everyday moment ("a free Sunday with nothing booked") and two ways to spend it. */
  moment(ctx, category) {
    const sit = freshScene(ctx, SITUATIONS, "sit");
    const options = pair(ctx, category);
    const art = situationArt(sit);
    return {
      id: makeId("moment", category, [sit, options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "moment",
      prompt: t(`${sit.en}. Which sounds better?`, `${sit.th} แบบไหนน่าสนใจกว่า?`),
      options,
      art: { tone: art.tone, icons: [art.icon], seed: hashString(sit.en + options[0].label.en) },
    };
  },
  /** "Pick your Bangkok superpower." */
  power(ctx, category) {
    const options = sides(ctx.rng, polePhrase(ctx, SUPERPOWERS[category], category, 1), polePhrase(ctx, SUPERPOWERS[category], category, -1));
    return {
      id: makeId("power", category, [options[0].label, options[1].label]),
      category,
      format: "choice",
      template: "power",
      prompt: t("Pick your Bangkok superpower.", "เลือกพลังพิเศษในกรุงเทพฯ ของคุณ"),
      options,
      art: { tone: "evening", icons: [options[0].icon, "🦸", options[1].icon], seed: hashString(options[0].label.en + "power") },
    };
  },
};

const BOTHERS_PROMPTS: Text[] = [t("Which would bother you more?", "อะไรจะกวนใจคุณมากกว่า?"), t("Be honest: which one gets to you more?", "บอกตรง ๆ อันไหนทำให้หงุดหงิดกว่า?")];
const SLIDER_PROMPTS: [string, string][] = [
  [". Where do you land?", " คุณอยู่ตรงไหน?"],
  [". Slide to your spot between these two.", " เลื่อนไปยังจุดที่ใช่สำหรับคุณ"],
];
const RANK_PROMPTS: [string, string][] = [
  [". Put these in order, favourite first.", " เรียงจากที่ชอบที่สุดไปน้อยที่สุด"],
  [". What would you do first? Order all four.", " จะทำอะไรก่อน? เรียงให้ครบทั้งสี่อย่าง"],
];
const BUDGET_PROMPTS: [string, string][] = [
  [`. You have ${COINS} coins of time and energy. Where do they go?`, ` คุณมี ${COINS} เหรียญแทนเวลาและพลัง จะใช้กับอะไรบ้าง?`],
  [`. Share ${COINS} coins between these, more coins for what you want more of.`, ` แบ่ง ${COINS} เหรียญให้สิ่งเหล่านี้ อยากทำอะไรมากให้เหรียญเยอะ`],
];

function variant(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

function scaleQuestion(ctx: Ctx, category: Category): Question {
  const pole: Pole = ctx.rng() < 0.5 ? 1 : -1;
  const bank = pole === 1 ? STATEMENTS[category].plus : STATEMENTS[category].minus;
  const statement = pick(ctx.rng, bank);
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

const FORMAT_BUILDERS: Record<Exclude<Format, "choice">, Builder> = {
  scale: scaleQuestion,
  bothers(ctx, category) {
    const options = sides(ctx.rng, polePhrase(ctx, BOTHERS[category], category, 1), polePhrase(ctx, BOTHERS[category], category, -1));
    const v = variant(ctx.rng, BOTHERS_PROMPTS.length);
    return {
      id: makeId("bothers", category, [String(v), options[0].label, options[1].label]),
      category,
      format: "bothers",
      template: "bothers",
      prompt: BOTHERS_PROMPTS[v],
      options,
      art: { tone: POLE_ICONS[category].tone, icons: [options[0].icon, "🙃", options[1].icon], seed: hashString(options[1].label.en) },
    };
  },
  slider(ctx, category) {
    const sit = freshScene(ctx, SITUATIONS, "sit");
    const options = sides(ctx.rng, polePhrase(ctx, SLIDER_ENDS[category], category, 1), polePhrase(ctx, SLIDER_ENDS[category], category, -1));
    const v = variant(ctx.rng, SLIDER_PROMPTS.length);
    const art = situationArt(sit);
    return {
      id: makeId("slider", category, [String(v), sit, options[0].label, options[1].label]),
      category,
      format: "slider",
      template: "slider",
      prompt: t(sit.en + SLIDER_PROMPTS[v][0], sit.th + SLIDER_PROMPTS[v][1]),
      options,
      art: { tone: art.tone, icons: [options[0].icon, art.icon, options[1].icon], seed: hashString(sit.en + options[0].label.en) },
    };
  },
  rank(ctx, category) {
    const sit = freshScene(ctx, SITUATIONS, "sit");
    const options = four(ctx, category);
    const v = variant(ctx.rng, RANK_PROMPTS.length);
    const art = situationArt(sit);
    return {
      id: makeId("rank", category, [String(v), sit, ...options.map((o) => o.label)]),
      category,
      format: "rank",
      template: "rank",
      prompt: t(sit.en + RANK_PROMPTS[v][0], sit.th + RANK_PROMPTS[v][1]),
      options,
      art: { tone: art.tone, icons: [art.icon, "🏅"], seed: hashString(sit.en + options[0].label.en) },
    };
  },
  budget(ctx, category) {
    const sit = freshScene(ctx, SITUATIONS, "sit");
    const options = four(ctx, category);
    const v = variant(ctx.rng, BUDGET_PROMPTS.length);
    const art = situationArt(sit);
    return {
      id: makeId("budget", category, [String(v), sit, ...options.map((o) => o.label)]),
      category,
      format: "budget",
      template: "budget",
      prompt: t(sit.en + BUDGET_PROMPTS[v][0], sit.th + BUDGET_PROMPTS[v][1]),
      options,
      coins: COINS,
      art: { tone: art.tone, icons: [art.icon, "🪙"], seed: hashString(sit.en + options[1].label.en) },
    };
  },
};

// ---------------------------------------------------------- sessions --

/** How many of each non-choice format a mixed session has, by items per category. */
export function mixCounts(perCategory: number): Record<Exclude<Format, "choice">, number> {
  const n = perCategory;
  return {
    rank: n >= 4 ? 2 : 1,
    budget: n >= 5 ? 2 : 1,
    slider: n <= 3 ? 2 : n === 4 ? 3 : 4,
    bothers: n - 1,
    scale: n,
  };
}

const HEAVY: ReadonlySet<Format> = new Set(["rank", "budget"]);

/** Which formats each category gets. Spreads the special formats across categories. */
function planFormats(rng: Rng, perCategory: number, mixed: boolean): Record<Category, Format[]> {
  const slots = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Format[]])) as Record<Category, Format[]>;
  if (!mixed) {
    for (const c of CATEGORIES) slots[c].push("scale");
  } else {
    const counts = mixCounts(perCategory);
    const order: Exclude<Format, "choice">[] = ["rank", "budget", "slider", "bothers", "scale"];
    for (const f of order) {
      for (let k = 0; k < counts[f]; k++) {
        const open = CATEGORIES.filter((c) => slots[c].length < perCategory);
        const tiers = [
          open.filter((c) => !slots[c].includes(f) && !(HEAVY.has(f) && slots[c].some((x) => HEAVY.has(x)))),
          open.filter((c) => !slots[c].includes(f)),
          open,
        ];
        const cands = tiers.find((tier) => tier.length > 0) ?? [];
        if (cands.length === 0) break;
        const most = Math.max(...cands.map((c) => perCategory - slots[c].length));
        slots[pick(rng, cands.filter((c) => perCategory - slots[c].length === most))].push(f);
      }
    }
  }
  for (const c of CATEGORIES) while (slots[c].length < perCategory) slots[c].push("choice");
  return slots;
}

function itemsForCategory(ctx: Ctx, category: Category, formats: Format[], seen: ReadonlySet<string>, taken: Set<string>, mixed: boolean): Question[] {
  const out: Question[] = [];
  const names = mixed ? Object.keys(CHOICE_TEMPLATES) : ["scene", "host", "quick", "skip"];
  const templates = shuffle(ctx.rng, names);
  let ti = 0;
  for (const f of formats) {
    const build: Builder = f === "choice" ? CHOICE_TEMPLATES[templates[ti++ % templates.length]] : FORMAT_BUILDERS[f];
    // Retry to dodge ids already seen or already in this session; then, as a
    // last resort, a fresh-activity "quick" item so ids never repeat.
    let q = build(ctx, category);
    for (let i = 0; i < 12 && (seen.has(q.id) || taken.has(q.id)); i++) q = build(ctx, category);
    for (let i = 0; i < 40 && taken.has(q.id); i++) q = CHOICE_TEMPLATES.quick(ctx, category);
    taken.add(q.id);
    out.push(q);
  }
  return out;
}

function orderCost(order: Question[]): number {
  let cost = 0;
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    if (a.category === b.category) cost += 1000;
    if (a.format === b.format) cost += 100;
    if (a.template === b.template) cost += 1;
  }
  return cost;
}

function greedyOrder(rng: Rng, items: Question[]): Question[] {
  const pool = shuffle(rng, items);
  const out: Question[] = [];
  const left = (key: (q: Question) => string, v: string) => pool.filter((q) => key(q) === v).length;
  while (pool.length > 0) {
    const prev = out[out.length - 1];
    let best = 0;
    let bestScore = Infinity;
    pool.forEach((q, idx) => {
      let s = rng() * 0.5; // tie-break
      if (prev) {
        if (q.category === prev.category) s += 1000;
        if (q.format === prev.format) s += 100;
        if (q.template === prev.template) s += 1;
      }
      // Use up the biggest groups first so the tail doesn't get stuck.
      s -= 20 * left((x) => x.category, q.category) + 6 * left((x) => x.format, q.format);
      if (s < bestScore) {
        bestScore = s;
        best = idx;
      }
    });
    out.push(pool.splice(best, 1)[0]);
  }
  return out;
}

/** Reorders so neither the category nor the format repeats back to back where it can be avoided. */
function interleave(rng: Rng, items: Question[]): Question[] {
  // The fewest same-format neighbours possible, e.g. 12 choices among 18 need 5.
  const byFormat = new Map<string, number>();
  for (const q of items) byFormat.set(q.format, (byFormat.get(q.format) ?? 0) + 1);
  const biggest = Math.max(0, ...byFormat.values());
  const floor = 100 * Math.max(0, 2 * biggest - items.length - 1);
  let best = items;
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const order = greedyOrder(rng, items);
    const cost = orderCost(order);
    if (cost < bestCost) {
      best = order;
      bestCost = cost;
    }
    if (cost < floor + 10) break;
  }
  return best;
}

function personalKey(p: Personal | undefined): string {
  if (!p) return "";
  const interests = [...(p.interests ?? [])].sort().join(",");
  if (!p.district && !interests) return "";
  return `|d=${p.district ?? ""}|i=${interests}`;
}

export function generateSession(options: SessionOptions): Question[] {
  const perCategory = Math.min(Math.max(options.perCategory ?? 3, 2), 6);
  const mixed = options.formats === "mixed";
  const key = personalKey(options.personal);
  const rng = createRng(`vibe:${options.seed}${mixed ? "|mix" : ""}${key}`);
  const ctx: Ctx = { rng, used: new Set(), personal: key ? options.personal : undefined };
  const taken = new Set<string>();
  const seen = options.seen ?? new Set<string>();
  const plan = planFormats(rng, perCategory, mixed);
  const all = CATEGORIES.flatMap((c) => itemsForCategory(ctx, c, plan[c], seen, taken, mixed));
  return interleave(rng, all);
}

export function toPublic(q: Question): PublicQuestion {
  const labels = () => (q.format === "scale" ? [] : q.options.map((o) => plain(o.label)));
  const icons = () => (q.format === "scale" ? [] : q.options.map((o) => o.icon));
  switch (q.format) {
    case "scale":
      return { id: q.id, format: "scale", prompt: q.prompt, min: 1, max: 5, minLabel: q.minLabel, maxLabel: q.maxLabel, art: q.art };
    case "slider":
      return { id: q.id, format: "slider", prompt: q.prompt, min: 0, max: 100, options: labels(), icons: icons(), art: q.art };
    case "rank":
      return { id: q.id, format: "rank", prompt: q.prompt, options: labels(), icons: icons(), art: q.art };
    case "budget":
      return { id: q.id, format: "budget", prompt: q.prompt, coins: q.coins, options: labels(), icons: icons(), art: q.art };
    default:
      return { id: q.id, format: q.format, prompt: q.prompt, options: labels(), icons: icons(), art: q.art };
  }
}

// ---------------------------------------------------------------- scoring --

/**
 * choice / bothers → option index (0 or 1); scale → 1..5; slider → 0..100;
 * rank → option indices, favourite first (a permutation); budget → coins per
 * option (non-negative integers adding up to `coins`).
 */
export type Answer = number | readonly number[];
export type Answers = Record<string, Answer>;

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

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** True when `order` is a permutation of 0..n-1. */
export function isPermutation(order: readonly number[], n: number): boolean {
  if (order.length !== n) return false;
  const seen = new Set<number>();
  for (const k of order) {
    if (!isInt(k) || k < 0 || k >= n || seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/** The item's score in −1..+1, or null when the answer is not valid for it. */
export function itemScore(q: Question, answer: Answer): number | null {
  switch (q.format) {
    case "choice":
    case "bothers":
      if (answer !== 0 && answer !== 1) return null;
      return q.options[answer].pole;
    case "scale":
      if (!isInt(answer) || answer < 1 || answer > 5) return null;
      return ((answer - 3) / 2) * q.pole + 0; // + 0 turns -0 into 0
    case "slider":
      if (!isInt(answer) || answer < 0 || answer > 100) return null;
      return ((answer - 50) / 50) * q.options[1].pole + 0;
    case "rank": {
      if (!Array.isArray(answer) || !isPermutation(answer, q.options.length)) return null;
      // Weights n-1, n-3, … −(n-1): 3, 1, −1, −3 for four items.
      const n = q.options.length;
      let sum = 0;
      let norm = 0;
      answer.forEach((idx, k) => {
        const w = n - 1 - 2 * k;
        sum += w * q.options[idx].pole;
        norm += Math.abs(w);
      });
      return sum / norm + 0;
    }
    case "budget": {
      if (!Array.isArray(answer) || answer.length !== q.options.length) return null;
      let total = 0;
      let sum = 0;
      for (let k = 0; k < answer.length; k++) {
        const c = answer[k];
        if (!isInt(c) || c < 0 || c > q.coins) return null;
        total += c;
        sum += c * q.options[k].pole;
      }
      if (total !== q.coins) return null;
      return sum / q.coins + 0;
    }
  }
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

const choose2 = (n: number) => (n * (n - 1)) / 2;

/**
 * How many distinct questions the generator can produce (by id), template by
 * template. Order of the options counts, as it changes the question.
 */
export function questionSpace(): number {
  const S = SITUATIONS.length;
  let total = 0;
  for (const c of CATEGORIES) {
    const P = ACTIVITIES[c].plus.length;
    const M = ACTIVITIES[c].minus.length;
    const pairs = P * M * 2;
    const fours = choose2(P) * choose2(M) * 24; // 2 + 2 activities, any order
    total += WHENS.length * PLACES.length * pairs; // scene
    total += COMPANIONS.length * PLACES.length * pairs; // host
    total += pairs; // quick
    total += pairs; // skip
    total += S * pairs; // moment
    total += SUPERPOWERS[c].plus.length * SUPERPOWERS[c].minus.length * 2; // power
    total += BOTHERS[c].plus.length * BOTHERS[c].minus.length * 2 * BOTHERS_PROMPTS.length; // bothers
    total += STATEMENTS[c].plus.length + STATEMENTS[c].minus.length; // scale
    total += S * SLIDER_ENDS[c].plus.length * SLIDER_ENDS[c].minus.length * 2 * SLIDER_PROMPTS.length; // slider
    total += S * fours * RANK_PROMPTS.length; // rank
    total += S * fours * BUDGET_PROMPTS.length; // budget
  }
  return total;
}
