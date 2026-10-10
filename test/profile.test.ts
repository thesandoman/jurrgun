/**
 * The richer profile content: interests, communication styles, prompt bank,
 * per-member decks and answer validation. Pure, no database.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_INTERESTS,
  COMM_STYLES,
  deckFor,
  ENERGY,
  INTEREST_GROUPS,
  EDUCATION,
  educationLabel,
  OCCUPATIONS,
  occupationLabel,
  parseEducation,
  parseOccupation,
  PROMPT_BANK,
  PROMPT_KINDS,
  promptById,
  rankFromPositions,
  swapPrompt,
  validateAnswer,
  WEEKEND_RHYTHM,
  type Prompt,
} from "../src/content/profile";
import { INTERESTS } from "../src/lib/constants";

const bilingual = (x: { th: string; en: string }) => x.th.trim().length > 0 && x.en.trim().length > 0;
const kindOf = (id: string) => promptById(id)!.kind;
const prompt = (id: string) => promptById(id)!;
const firstOf = (kind: Prompt["kind"]) => PROMPT_BANK.find((p) => p.kind === kind)!;

describe("interests", () => {
  it("has at least 12 groups and 110 interests, all bilingual with an emoji", () => {
    expect(INTEREST_GROUPS.length).toBeGreaterThanOrEqual(12);
    expect(ALL_INTERESTS.length).toBeGreaterThanOrEqual(110);
    for (const g of INTEREST_GROUPS) expect(bilingual(g)).toBe(true);
    for (const i of ALL_INTERESTS) {
      expect(bilingual(i)).toBe(true);
      expect(i.emoji.length).toBeGreaterThan(0);
    }
  });

  it("has unique values and keeps every legacy interest value", () => {
    const vals = ALL_INTERESTS.map((i) => i.value);
    expect(new Set(vals).size).toBe(vals.length);
    for (const old of INTERESTS) expect(vals).toContain(old.value);
  });

  it("uses no en or em dashes in copy", () => {
    const all = JSON.stringify([INTEREST_GROUPS, COMM_STYLES, ENERGY, WEEKEND_RHYTHM, PROMPT_BANK]);
    expect(all).not.toMatch(/[–—]/);
  });
});

describe("occupation", () => {
  it("is a bilingual list ending in Other", () => {
    for (const o of OCCUPATIONS) expect(bilingual(o)).toBe(true);
    expect(new Set(OCCUPATIONS.map((o) => o.value)).size).toBe(OCCUPATIONS.length);
    expect(OCCUPATIONS.at(-1)!.value).toBe("other");
  });

  it("keeps a listed pick, keeps Other only with words, and drops anything else", () => {
    expect(parseOccupation("student", "ignored")).toEqual({ occupation: "student", occupationOther: undefined });
    expect(parseOccupation("other", "  Drone pilot ")).toEqual({ occupation: "other", occupationOther: "Drone pilot" });
    expect(parseOccupation("other", "   ")).toEqual({ occupation: undefined, occupationOther: undefined });
    expect(parseOccupation("astronaut", "")).toEqual({ occupation: undefined, occupationOther: undefined });
    expect(parseOccupation("other", "x".repeat(80)).occupationOther).toHaveLength(40);
  });

  it("labels a pick in either language, and Other with the member's words", () => {
    expect(occupationLabel({ occupation: "student" }, "en")).toEqual({ emoji: "🎓", text: "Student" });
    expect(occupationLabel({ occupation: "other", occupationOther: "Drone pilot" }, "th")!.text).toBe("Drone pilot");
    expect(occupationLabel({}, "en")).toBeNull();
  });
});

describe("education", () => {
  it("keeps a listed level with an optional school or field, and drops unknown levels", () => {
    for (const o of EDUCATION) expect(bilingual(o)).toBe(true);
    expect(parseEducation("bachelors", "  Chula, engineering ")).toEqual({ education: "bachelors", educationDetail: "Chula, engineering" });
    expect(parseEducation("masters", "")).toEqual({ education: "masters", educationDetail: undefined });
    expect(parseEducation("wizardry", "Hogwarts")).toEqual({ education: undefined, educationDetail: undefined });
    expect(parseEducation("studying", "x".repeat(90)).educationDetail).toHaveLength(60);
  });

  it("shows the level, then the school or field", () => {
    expect(educationLabel({ education: "bachelors", educationDetail: "Chula" }, "en")!.text).toBe("Bachelor's degree · Chula");
    expect(educationLabel({ education: "vocational" }, "th")!.text).toBe("อาชีวะ (ปวช. / ปวส.)");
    expect(educationLabel({}, "en")).toBeNull();
  });
});

describe("communication styles and quick facts", () => {
  it("are bilingual, unique and include the classics", () => {
    const vals = COMM_STYLES.map((c) => c.value);
    expect(new Set(vals).size).toBe(vals.length);
    for (const v of ["texter", "voice_noter", "caller", "meme_sender", "sticker_fan", "lets_meet"]) expect(vals).toContain(v);
    for (const c of COMM_STYLES) expect(bilingual(c) && bilingual(c.blurb)).toBe(true);
    for (const o of [...ENERGY, ...WEEKEND_RHYTHM]) expect(bilingual(o)).toBe(true);
  });
});

describe("prompt bank", () => {
  it("has at least 80 prompts with unique ids, every kind, all bilingual", () => {
    expect(PROMPT_BANK.length).toBeGreaterThanOrEqual(80);
    const ids = PROMPT_BANK.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of PROMPT_KINDS) expect(PROMPT_BANK.some((p) => p.kind === k)).toBe(true);
    for (const p of PROMPT_BANK) expect(bilingual(p)).toBe(true);
    for (const id of ["dream_city", "show_visitor", "small_thing", "weirdly_good", "teach_30s", "emoji_sunday", "defend_street_food", "spice", "photo_bkk_corner"]) {
      expect(promptById(id)).toBeTruthy();
    }
  });

  it("gives every kind the settings it needs", () => {
    for (const p of PROMPT_BANK) {
      if (p.kind === "slider" || p.kind === "scale") {
        expect(p.min).toBeTypeOf("number");
        expect(p.max! > p.min!).toBe(true);
        expect(p.ends).toHaveLength(2);
      }
      if (p.kind === "choice") expect(p.options!.length).toBeGreaterThanOrEqual(2);
      if (p.kind === "choice") expect(p.options!.length).toBeLessThanOrEqual(4);
      if (p.kind === "rank") expect(p.options!.length).toBeGreaterThanOrEqual(3);
      if (p.kind === "rank") expect(p.options!.length).toBeLessThanOrEqual(4);
      if (p.kind === "multi" || p.kind === "emoji") expect(p.options!.length).toBeGreaterThan(p.pick ?? 1);
      if (p.options) expect(new Set(p.options.map((x) => x.value)).size).toBe(p.options.length);
      for (const o of p.options ?? []) expect(bilingual(o)).toBe(true);
    }
  });
});

describe("deckFor", () => {
  it("is deterministic per account", () => {
    expect(deckFor("acct-1")).toEqual(deckFor("acct-1"));
    expect(deckFor("acct-1")).toHaveLength(6);
  });

  it("differs across accounts", () => {
    const decks = new Set<string>();
    for (let i = 0; i < 200; i++) decks.add(deckFor(`member-${i}`).join(","));
    expect(decks.size).toBeGreaterThanOrEqual(190);
  });

  it("always mixes kinds, with no duplicates", () => {
    for (let i = 0; i < 300; i++) {
      const deck = deckFor(`mix-${i}`);
      expect(new Set(deck).size).toBe(deck.length);
      const kinds = deck.map(kindOf);
      expect(kinds).toContain("text");
      expect(kinds.some((k) => k === "slider" || k === "scale")).toBe(true);
      expect(kinds.some((k) => k === "choice" || k === "emoji")).toBe(true);
      expect(kinds).toContain("photo");
    }
  });

  it("can leave photos out and exclude prompts", () => {
    const deck = deckFor("no-photo", 5, { photo: false, exclude: ["dream_city"] });
    expect(deck).toHaveLength(5);
    expect(deck.map(kindOf)).not.toContain("photo");
    expect(deck).not.toContain("dream_city");
  });
});

describe("swapPrompt", () => {
  it("replaces one prompt with an unused one of the same family, keeping the rest", () => {
    const deck = deckFor("swap-me");
    const target = deck[2];
    const next = swapPrompt(deck, target, () => 0.5);
    expect(next).toHaveLength(deck.length);
    expect(next[2]).not.toBe(target);
    expect(deck.filter((_, i) => i !== 2)).toEqual(next.filter((_, i) => i !== 2));
    expect(new Set(next).size).toBe(next.length);
    const fam = (k: string) => ({ slider: "g", scale: "g", choice: "p", emoji: "p", multi: "l", rank: "l" })[k] ?? k;
    expect(fam(kindOf(next[2]))).toBe(fam(kindOf(target)));
  });

  it("ignores ids that are not in the deck", () => {
    const deck = deckFor("swap-none");
    expect(swapPrompt(deck, "nope")).toBe(deck);
  });
});

describe("validateAnswer", () => {
  it("text: trims, allows empty, caps at 140", () => {
    const p = firstOf("text");
    expect(validateAnswer(p, "  Lisbon ")).toEqual({ ok: true, value: "Lisbon" });
    expect(validateAnswer(p, "")).toEqual({ ok: true, value: null });
    expect(validateAnswer(p, "x".repeat(141)).ok).toBe(false);
  });

  it("slider: within range and on a step", () => {
    const p = prompt("spice");
    expect(validateAnswer(p, "7")).toEqual({ ok: true, value: 7 });
    expect(validateAnswer(p, "11").ok).toBe(false);
    expect(validateAnswer(p, "-1").ok).toBe(false);
    expect(validateAnswer(p, "abc").ok).toBe(false);
    expect(validateAnswer(prompt("sweetness"), "30").ok).toBe(false);
    expect(validateAnswer(prompt("sweetness"), "75")).toEqual({ ok: true, value: 75 });
  });

  it("scale: 1 to 5 integers", () => {
    const p = firstOf("scale");
    expect(validateAnswer(p, "5")).toEqual({ ok: true, value: 5 });
    expect(validateAnswer(p, "0").ok).toBe(false);
    expect(validateAnswer(p, "2.5").ok).toBe(false);
  });

  it("choice: exactly one known option", () => {
    const p = prompt("cat_dog");
    expect(validateAnswer(p, "cat")).toEqual({ ok: true, value: "cat" });
    expect(validateAnswer(p, "hamster").ok).toBe(false);
    expect(validateAnswer(p, ["cat", "dog"]).ok).toBe(false);
  });

  it("multi: known options, up to 3", () => {
    const p = prompt("perfect_weekend");
    expect(validateAnswer(p, ["market", "nap"])).toEqual({ ok: true, value: ["market", "nap"] });
    expect(validateAnswer(p, ["market", "nap", "brunch", "park"]).ok).toBe(false);
    expect(validateAnswer(p, ["market", "moon"]).ok).toBe(false);
  });

  it("emoji: one from the list, or up to N for multi-emoji prompts", () => {
    const one = prompt("emoji_bkk");
    expect(validateAnswer(one, "🛺")).toEqual({ ok: true, value: "🛺" });
    expect(validateAnswer(one, "🦄").ok).toBe(false);
    const three = prompt("emoji_sunday");
    expect(validateAnswer(three, ["☕", "📚", "😴"]).ok).toBe(true);
    expect(validateAnswer(three, ["☕", "📚", "😴", "🍜"]).ok).toBe(false);
  });

  it("rank: a full permutation, from positions", () => {
    const p = prompt("rank_seasons");
    expect(validateAnswer(p, ["cool", "rainy", "hot"])).toEqual({ ok: true, value: ["cool", "rainy", "hot"] });
    expect(validateAnswer(p, ["cool", "cool", "hot"]).ok).toBe(false);
    expect(validateAnswer(p, ["cool", "hot"]).ok).toBe(false);
    expect(rankFromPositions(p, { hot: "3", rainy: "2", cool: "1" })).toEqual(["cool", "rainy", "hot"]);
    expect(rankFromPositions(p, { hot: "", rainy: "", cool: "" })).toEqual([]);
    expect(rankFromPositions(p, { hot: "1", rainy: "1", cool: "2" })).toBe("partial");
    expect(rankFromPositions(p, { hot: "1", rainy: "", cool: "2" })).toBe("partial");
  });

  it("photo: caption up to 80", () => {
    const p = firstOf("photo");
    expect(validateAnswer(p, "Soi 38 at dusk")).toEqual({ ok: true, value: "Soi 38 at dusk" });
    expect(validateAnswer(p, "x".repeat(81)).ok).toBe(false);
  });
});
