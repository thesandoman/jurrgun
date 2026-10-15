/**
 * The hand-written quiz bank: content rules, coverage of all 50 districts,
 * contexts, twins and flavours.
 */
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../src/vibe/scenarios";
import { checkScenarios, DISTRICT_KEYS } from "../src/vibe/bank-rules";
import { LANDMARKS } from "../src/vibe/landmarks";
import { ARCHETYPES } from "../src/vibe/archetypes";

describe("quiz bank", () => {
  it("passes every content rule: bilingual, gender neutral, family friendly, non-political, no dashes, no duplicates", () => {
    const { errors } = checkScenarios(SCENARIOS);
    expect(errors).toEqual([]);
  });

  it("has 198 scenarios: 172 core, 14 rhythm, 12 plan", () => {
    expect(SCENARIOS).toHaveLength(198);
    expect(SCENARIOS.filter((s) => s.kind === "core")).toHaveLength(172);
    expect(SCENARIOS.filter((s) => s.kind === "rhythm")).toHaveLength(14);
    expect(SCENARIOS.filter((s) => s.kind === "plan")).toHaveLength(12);
  });


  it("covers friends, family, dates, solo, coworkers, parties and meetups", () => {
    for (const ctx of ["friends", "family", "date", "solo", "coworkers", "party", "meetup"]) {
      expect(SCENARIOS.filter((s) => s.kind === "core" && s.context === ctx).length, ctx).toBeGreaterThanOrEqual(3);
    }
  });

  it("has four twin pairs that point at each other", () => {
    const twins = SCENARIOS.filter((s) => s.twin);
    expect(twins).toHaveLength(8);
    for (const s of twins) expect(SCENARIOS.find((x) => x.id === s.twin)?.twin).toBe(s.id);
  });

  it("features all 50 districts: each in at least 6 answers, none in more than 8% of them", () => {
    const { counts } = checkScenarios(SCENARIOS).districts;
    const total = SCENARIOS.length * 16;
    expect(DISTRICT_KEYS.size).toBe(50);
    for (const d of DISTRICT_KEYS) {
      expect(counts.get(d) ?? 0, d).toBeGreaterThanOrEqual(6);
      expect(counts.get(d) ?? 0, d).toBeLessThanOrEqual(total * 0.08);
    }
  });

  it("has 30 funny core scenarios and 20 personality ones with a motive on every answer", async () => {
    const { MOTIVES } = await import("../src/vibe/content");
    const core = SCENARIOS.filter((s) => s.kind === "core");
    expect(core.filter((s) => s.mood === "funny").length).toBeGreaterThanOrEqual(30);
    const motivated = SCENARIOS.filter((s) => Object.values(s.answers).some((a) => a.motive));
    expect(motivated.length).toBeGreaterThanOrEqual(20);
    for (const s of motivated) {
      expect(s.mood, s.id).toBe("personality");
      expect(s.set, s.id).toBeUndefined();
      for (const a of Object.values(s.answers)) expect(MOTIVES, s.id).toContain(a.motive);
    }
    // Every motive is reachable from most types, so the badge is not the type in disguise.
    for (const m of MOTIVES) {
      const types = new Set(motivated.flatMap((s) => Object.entries(s.answers).filter(([, a]) => a.motive === m).map(([k]) => k)));
      expect(types.size, m).toBeGreaterThanOrEqual(10);
    }
  });

  it("the 'what moves you' sentences follow the same rules, at real places in real districts", async () => {
    const { MOTIVES, MOTIVE_LINES, MOTIVE_PLACES } = await import("../src/vibe/content");
    const { ADULT_EN, ADULT_TH, BANNED_EN, BANNED_TH, BORROWED_NAMES, GENDERED_EN, GENDERED_TH, POLITE_TH } = await import("../src/vibe/bank-rules");
    for (const m of MOTIVES) {
      expect(MOTIVE_PLACES[m].length, m).toBeGreaterThanOrEqual(3);
      for (const x of [MOTIVE_LINES[m], ...MOTIVE_PLACES[m]]) {
        for (const re of [BANNED_EN, GENDERED_EN, ADULT_EN, BORROWED_NAMES, /[–—]/]) expect(x.en, x.en).not.toMatch(re);
        for (const re of [BANNED_TH, GENDERED_TH, ADULT_TH, BORROWED_NAMES, POLITE_TH, /[–—]/]) expect(x.th, x.th).not.toMatch(re);
      }
      for (const p of MOTIVE_PLACES[m]) expect(DISTRICT_KEYS.has(p.district), p.id).toBe(true);
    }
  });

  it("tags every scenario with a mood, and months only on seasonal ones", () => {
    for (const s of SCENARIOS) expect(["everyday", "landmark", "seasonal", "funny", "personality"], s.id).toContain(s.mood);
    for (const s of SCENARIOS.filter((x) => x.months)) expect(s.mood, s.id).toBe("seasonal");
  });

  it("catches the sense rules: letters said in words, retired names, Thai spellings, both languages naming the same place", () => {
    const base = SCENARIOS.find((s) => s.id === "saturday")!;
    const bad = structuredClone(base);
    bad.id = "bad";
    bad.twin = undefined;
    bad.prompt = { en: "A free Saturday afternoon", th: "บ่ายวันเสาร์ว่าง ๆ" };
    bad.answers.CDSN = { ...bad.answers.CDSN, en: "Your usual seat at the new café in Ari with your circle, a quiet read" };
    bad.answers.CFSN = { ...bad.answers.CFSN, en: "A café in Ari none of you has tried, slow coffee and a long talk" };
    bad.answers.CFSH = { ...bad.answers.CFSH, en: "Wang Lang Market with your grandparent, 50-baht curry, same stall", th: "ตลาดวังหลังกับตายาย แกงจานละ 40 บาท แชทกันยาว ๆ" };
    bad.answers.CDMH = { ...bad.answers.CDMH, en: "Paddle Khlong Lat Mayom with one friend past wooden houses on Yaowarat" };
    // Two more stock-word answers, so four of the 16 lean on usual, regular, never or new (the cap is 3).
    bad.answers.BFMN = { ...bad.answers.BFMN, en: "The usual run club lap of Benjakitti Forest Park" };
    bad.answers.BFSN = { ...bad.answers.BFSN, en: "Your regular big table at The Commons in Thonglor" };
    bad.answers.CDMN = { ...bad.answers.CDMN, en: "Walk Ari's back sois to a new design shop" };
    const { errors } = checkScenarios([bad]);
    const has = (s: string) => expect(errors.some((e) => e.includes(s)), `${s} in\n${errors.join("\n")}`).toBe(true);
    has('prompt must end with "?"');
    has("CDSN: a D answer reads as a habit");
    has("CDSN: retired name");
    has("words; keep answers to 6 to 12");
    has("answers say usual, regular, never or new");
    has("CFSN: an F answer reads as a first");
    has("CFSH: 50 baht in English but not in Thai");
    has("CFSH: glossary spelling");
    has("CDMH: names Yaowarat in English but not in Thai");
  });

  it("has no legacy scenarios left: all 47 pre-review scenarios are rewritten to the review rules", async () => {
    const { LEGACY_IDS } = await import("../src/vibe/bank-rules");
    expect([...LEGACY_IDS]).toEqual([]);
  });

  it("every D and F answer shows its letter, and a detail counts as much as a word (D24)", async () => {
    const { answerSense } = await import("../src/vibe/bank-rules");
    const shows = (code: string, en: string) => answerSense("x", code, "core", en, "x").filter((e) => e.includes("must show"));
    for (const en of ["That Ari noodle stall everyone keeps posting. Finally", "A soi with no signboard, on a hunch", "The dumpling place a friend swears by"]) expect(shows("CDSH", en), en).toEqual([]);
    for (const en of ["Tai chi at Lumphini at 6am. The aunties already know your name", "Your stool at the Nang Loeng stall, iced coffee without asking", "The owner remembers your order"]) expect(shows("CFSH", en), en).toEqual([]);
    // No cue at all still fails both ways; a habit still cannot be a D, nor a first an F.
    expect(shows("CDSH", "Noodles at a stall in Ari, slow and quiet").join()).toContain("D answer must show");
    expect(shows("CFSH", "Noodles at a stall in Ari, slow and quiet").join()).toContain("F answer must show");
    expect(answerSense("x", "CDSH", "core", "Finally back at your usual Ari stall", "x").join()).toContain("D answer reads as a habit");
    expect(answerSense("x", "CFSH", "core", "Your stool at a stall you've never tried", "x").join()).toContain("F answer reads as a first");
  });

  it("no false alarms on yoga or Wat Prayun, while the real words still fail", async () => {
    const { BANNED_EN, POLITE_TH } = await import("../src/vibe/bank-rules");
    expect(POLITE_TH.test("โยคะ ริมสวนเบญจกิติ")).toBe(false);
    expect(POLITE_TH.test("ไปด้วยกันไหมคะ ")).toBe(true);
    expect(BANNED_EN.test("The turtle mound garden at Wat Prayun")).toBe(false);
    for (const en of ["pray", "praying at the shrine", "a prayer"]) expect(BANNED_EN.test(en), en).toBe(true);
  });

  it("the letter hints see the word café", async () => {
    const { HINT_EN } = await import("../src/vibe/bank-rules");
    for (const L of ["S", "N"]) expect(HINT_EN[L].test("A quiet café by the canal"), L).toBe(true);
  });

  it("every district has a landmark, and every landmark and type hangout is in a real district", () => {
    for (const d of DISTRICT_KEYS) expect(LANDMARKS.some((l) => l.district === d && l.kind === "landmark"), d).toBe(true);
    for (const l of LANDMARKS) expect(DISTRICT_KEYS.has(l.district), l.name.en).toBe(true);
    for (const a of Object.values(ARCHETYPES)) for (const h of a.hangouts) expect(DISTRICT_KEYS.has(h.district), h.name.en).toBe(true);
  });
});

describe("monthly big quests", () => {
  it("one per month, in a real district, bilingual and following the same content rules", async () => {
    const { SEASON_QUESTS } = await import("../src/domain/seasons");
    const { ADULT_EN, ADULT_TH, BANNED_EN, BANNED_TH, GENDERED_EN, GENDERED_TH } = await import("../src/vibe/bank-rules");
    expect(SEASON_QUESTS.map((q) => q.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const q of SEASON_QUESTS) {
      expect(DISTRICT_KEYS.has(q.district), q.district).toBe(true);
      for (const x of [q.theme, q.quest]) {
        expect(x.en && x.th).toBeTruthy();
        for (const re of [BANNED_EN, GENDERED_EN, ADULT_EN, /[–—]/]) expect(x.en, x.en).not.toMatch(re);
        for (const re of [BANNED_TH, GENDERED_TH, ADULT_TH, /[–—]/]) expect(x.th, x.th).not.toMatch(re);
      }
    }
  });
});
