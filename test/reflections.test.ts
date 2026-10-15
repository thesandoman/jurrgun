/**
 * "My Bangkok" reflections at the end of the quiz (owner, D26 (4)): what's
 * kept, what's dropped, what shows on the card, and the copy rules.
 */
import { describe, expect, it } from "vitest";
import {
  CHANGE_PULSE_QUESTION,
  CHANGES,
  LIKE_MAX,
  LIKES,
  NOT_YET_MAX,
  NOTE_MAX,
  PLACE_MAX,
  PLACE_SUGGESTIONS,
  cleanReflections,
  reflectionsFromForm,
} from "../src/content/reflections";
import { cleanBio } from "../src/content/profile";
import { reflectionFacts } from "../src/ui/reflections";
import { ADULT_EN, ADULT_TH, BANNED_EN, BANNED_TH, GENDERED_EN, GENDERED_TH } from "../src/vibe/bank-rules";

const t = (th: string, en: string) => en || th;

describe("reflections: what's kept", () => {
  it("keeps known options, at most 3 likes and 3 districts, and trims words", () => {
    const r = reflectionsFromForm({
      r_like: ["street_food", "water", "nope", "street_food", "green", "creative"],
      r_like_note: `  the ${"x".repeat(200)}  `,
      r_change: "shade",
      r_change_note: "more trees on my soi",
      r_fav_district: "bang_rak",
      r_fav_place: "Talat Noi",
      r_notyet_1: "nong_chok",
      r_notyet_2: "not_a_district",
      r_notyet_3: "min_buri",
      r_notyet_place: "",
    })!;
    expect(r.like).toEqual(["street_food", "water", "green"]);
    expect(r.like!.length).toBeLessThanOrEqual(LIKE_MAX);
    expect(r.likeNote!.length).toBe(NOTE_MAX);
    expect(r.change).toBe("shade");
    expect(r.changeNote).toBe("more trees on my soi");
    expect(r.favourite).toEqual({ district: "bang_rak", place: "Talat Noi" });
    expect(r.notYet).toEqual({ districts: ["nong_chok", "min_buri"] });
  });

  it("drops anything unknown, and an empty form is no reflections at all", () => {
    expect(reflectionsFromForm({})).toBeUndefined();
    expect(reflectionsFromForm({ r_like: "sushi", r_change: ["footpaths", "air"], r_fav_district: "atlantis", r_like_note: "   " })).toBeUndefined();
    expect(cleanReflections({ change: "air", favourite: { place: "y".repeat(200) } })).toEqual({ change: "air", favourite: { place: "y".repeat(PLACE_MAX) } });
    for (const junk of [null, 1, "x", []]) expect(cleanReflections(junk)).toBeUndefined();
  });

  it("a radio posted twice is ambiguous, so it isn't kept", () => {
    expect(reflectionsFromForm({ r_change: ["footpaths", "air"] })?.change).toBeUndefined();
  });

  it("survives the profile's bio cleaning, and nothing else sneaks in", () => {
    const bio = cleanBio({ story: "newcomer", reflections: { like: ["people"], change: "air", sneaky: true } });
    expect(bio.reflections).toEqual({ like: ["people"], change: "air" });
    expect(cleanBio({ reflections: "nope" }).reflections).toBeUndefined();
  });
});

describe("reflections on the profile card", () => {
  it("show likes, the favourite spot and where to explore next, never what they'd change", () => {
    const facts = reflectionFacts({ like: ["street_food"], likeNote: "night markets", change: "flooding", changeNote: "my street floods", favourite: { district: "bang_rak", place: "Talat Noi" }, notYet: { districts: ["nong_chok"], place: "Bang Krachao" } }, "en", t);
    const text = JSON.stringify(facts);
    expect(facts.map((f) => f[1])).toEqual(["Loves in Bangkok", "Favourite spot", "Next to explore"]);
    expect(text).toContain("The street food");
    expect(text).toContain("night markets");
    expect(text).toContain("Talat Noi");
    expect(text).toContain("Bang Krachao");
    expect(text).not.toMatch(/flood|Streets that don/i);
  });

  it("show nothing when there are none", () => {
    expect(reflectionFacts(undefined, "en", t)).toEqual([]);
    expect(reflectionFacts({ change: "air" }, "en", t)).toEqual([]);
  });
});

describe("reflections: copy and City Pulse", () => {
  it("options are short, Thai and English, with no dashes or banned words", () => {
    for (const o of [...LIKES, ...CHANGES]) {
      expect(o.th.trim(), o.value).not.toBe("");
      expect(o.en.split(/\s+/).length, o.en).toBeLessThanOrEqual(7);
      for (const text of [o.th, o.en]) expect(text, o.value).not.toMatch(/[–—]/);
      for (const re of [BANNED_EN, GENDERED_EN, ADULT_EN]) expect(o.en, o.value).not.toMatch(re);
      for (const re of [BANNED_TH, GENDERED_TH, ADULT_TH]) expect(o.th, o.value).not.toMatch(re);
      expect(o.th, o.value).not.toMatch(/ครับ|ค่ะ|คะ/);
    }
    // A few options, not a wall of them (paradox of choice).
    expect(LIKES.length).toBeLessThanOrEqual(6);
    expect(CHANGES.length).toBeLessThanOrEqual(6);
    expect(NOT_YET_MAX).toBe(3);
  });

  it("the City Pulse question carries the same options, archived so members aren't asked it twice", () => {
    expect(CHANGE_PULSE_QUESTION.options.map((o) => o.value)).toEqual(CHANGES.map((o) => o.value));
    expect(CHANGE_PULSE_QUESTION.status).toBe("archived");
    expect(CHANGE_PULSE_QUESTION.kind).toBe("single");
  });

  it("suggests real landmarks for places", () => {
    expect(PLACE_SUGGESTIONS).toContain("Talat Noi");
    expect(PLACE_SUGGESTIONS).toContain("ตลาดน้อย");
  });
});
