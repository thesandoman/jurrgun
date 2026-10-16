/** Quiz health (/admin/quiz-health): totals only, k = 10, flags per question. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { vibes } from "../src/schema";
import { FLAGS, RETAKE_DAYS, kappa, languageGaps, mergeStability, questionHealth, retakeStability, wilson } from "../src/routes/admin/quiz-health";
import { personalOf, quizQuestions, quizSeed } from "../src/routes/quiz";
import { isStyleQuestion } from "../src/vibe/generator";

const row = (scenario: string, pick: string, archetype: string, count: number) => ({ scenario, pick, archetype, count });

describe("questionHealth", () => {
  it("flags many 'none', picks that don't match the final type, and one dominant answer; never under 10", () => {
    const rows = [
      // fine: 20 answers, all agreeing, spread over two answers
      row("good", "BDSH", "BDSH", 10), row("good", "BDSN", "BDSH", 10),
      // many say none
      row("passy", "none", "BDSH", 8), row("passy", "BDSH", "BDSH", 12),
      // picks rarely match the final type
      row("off", "CFMN", "BDSH", 16), row("off", "BDSH", "BDSH", 4),
      // one answer takes most picks
      row("lopsided", "BDSH", "BDSH", 18), row("lopsided", "BDSN", "BDSH", 2),
      // too few to judge
      row("tiny", "none", "BDSH", 9),
    ];
    const h = Object.fromEntries(questionHealth(rows).map((q) => [q.scenario, q]));
    expect(h.good.flags).toEqual([]);
    expect(h.passy.flags).toContain("none");
    expect(h.off.flags).toContain("agreement");
    expect(h.lopsided.flags).toContain("top");
    expect(h.tiny.flags).toEqual([]);
    expect(FLAGS).toEqual({ none: 0.2, agreementGap: 0.15, topPick: 0.6 });
  });
});

describe("intervals and kappa", () => {
  it("wilson gives the standard 95% interval and stays inside 0..1", () => {
    const [lo, hi] = wilson(8, 20);
    expect(lo).toBeCloseTo(0.2188, 3);
    expect(hi).toBeCloseTo(0.6134, 3);
    expect(wilson(0, 10)[0]).toBe(0);
    expect(wilson(10, 10)[1]).toBe(1);
  });

  it("kappa is 1 for perfect agreement across a mixed type spread", () => {
    const s = retakeStability([
      { group: "g", prev: "BDSH", now: "BDSH", count: 6 },
      { group: "g", prev: "CFMN", now: "CFMN", count: 6 },
    ]).get("g")!;
    expect(kappa(s)).toBeCloseTo(1, 5);
  });

  it("a share barely over a line on few answers is not flagged", () => {
    // 3 of 12 say none (25% > 20%), but the 95% range starts near 9%: noise, not a flag.
    const h = questionHealth([row("q", "none", "BDSH", 3), row("q", "BDSH", "BDSH", 5), row("q", "BDSN", "BDSH", 4)]);
    expect(h[0].flags).toEqual([]);
  });
});

describe("languageGaps", () => {
  it("flags a question only when Thai and English 'none' ranges don't overlap, with 10+ each", () => {
    const g = Object.fromEntries(
      languageGaps([
        // 5% vs 50%: a translation problem
        { scenario: "q8", lang: "th", none: true, count: 2 }, { scenario: "q8", lang: "th", none: false, count: 38 },
        { scenario: "q8", lang: "en", none: true, count: 20 }, { scenario: "q8", lang: "en", none: false, count: 20 },
        // similar rates
        { scenario: "q1", lang: "th", none: true, count: 4 }, { scenario: "q1", lang: "th", none: false, count: 36 },
        { scenario: "q1", lang: "en", none: true, count: 5 }, { scenario: "q1", lang: "en", none: false, count: 35 },
        // too few English answers
        { scenario: "q2", lang: "th", none: false, count: 40 }, { scenario: "q2", lang: "en", none: true, count: 9 },
      ]).map((x) => [x.scenario, x.flag]),
    );
    expect(g).toEqual({ q8: true, q1: false, q2: false });
  });
});

describe("retakeStability", () => {
  it("counts same type and 3+ shared letters per group, skipping older non-letter types", () => {
    const s = retakeStability([
      { group: "local", prev: "BDSH", now: "BDSH", count: 7 },
      { group: "local", prev: "BDSH", now: "BDSN", count: 2 },
      { group: "local", prev: "BDSH", now: "CFMN", count: 1 },
      { group: "local", prev: "rhythm+", now: "BDSH", count: 5 },
    ]);
    expect(s.get("local")).toMatchObject({ n: 10, same: 7, kept3: 9 });
    // Chance agreement: everyone was BDSH before, 7 of 10 are now, so luck alone gives 0.7 and κ is 0.
    expect(kappa(s.get("local")!)).toBeCloseTo(0, 5);
    expect(mergeStability([s.get("local")!, s.get("local")!])).toMatchObject({ n: 20, same: 14 });
    expect(RETAKE_DAYS).toEqual({ min: 14, max: 30 });
  });
});

describe.skipIf(!HAS_DB)("quiz health page and saved picks", () => {
  it("saves each type question's pick (never style answers) and shows only to insight viewers", async () => {
    const m = await createMember();
    const member = personalOf({ district: "bang_rak", interests: ["food"], languages: ["th", "en"], relationship: "single" });
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, member);
    const f: Record<string, string> = { seed };
    qs.forEach((q, i) => (f[`a${i}`] = i === 2 ? "none" : "0"));
    let r = await req("/quiz", { cookie: m.cookie, form: f });
    // A close letter gets a follow-up page first; answer it and submit again.
    if (r.status === 200) {
      const html = await r.text();
      const fu = /name="fu" value="([^"]*)"/.exec(html)?.[1] ?? "";
      const g: Record<string, string> = { ...f, fu };
      fu.split(",").forEach((_, k) => (g[`a${qs.length + k}`] = "0"));
      r = await req("/quiz", { cookie: m.cookie, form: g });
    }
    expect(r.status).toBe(302);
    const [saved] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    const picks = (saved.blend as unknown as { picks: [string, string][] }).picks;
    const typeScenarios = qs.filter((q) => !isStyleQuestion(q)).map((q) => q.scenario);
    for (const [scenario] of picks) expect(typeScenarios.concat(picks.map((p) => p[0]))).toContain(scenario);
    expect(picks.find(([s]) => s === qs[2].scenario)?.[1]).toBe("none");
    for (const q of qs.filter(isStyleQuestion)) expect(picks.map((p) => p[0])).not.toContain(q.scenario);

    // Members can't see it; insight viewers see totals with the k = 10 rule.
    expect((await req("/admin/quiz-health", { cookie: m.cookie })).status).not.toBe(200);
    const viewer = await createMember({ role: "insight_viewer" });
    const page = await req("/admin/quiz-health?lang=en", { cookie: viewer.cookie });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Bangkok Type quiz health");
    expect(html).toContain("&lt;10");
    expect(html).toContain("Retakes (14 to 30 days later)");
    expect(html).toContain("Thai vs English");
    expect((saved.blend as unknown as { lang?: string }).lang).toMatch(/^(th|en)$/);

    // A retake keeps only the last type, its unsure letters and when it was taken.
    const before = saved;
    const seed2 = quizSeed(m.id, saved);
    const qs2 = quizQuestions(seed2, saved, member);
    const f2: Record<string, string> = { seed: seed2 };
    qs2.forEach((_, i) => (f2[`a${i}`] = "1"));
    const again = await req("/quiz", { cookie: m.cookie, form: f2 });
    if (again.status === 200) {
      const fu = /name="fu" value="([^"]*)"/.exec(await again.text())?.[1] ?? "";
      const g: Record<string, string> = { ...f2, fu };
      fu.split(",").forEach((_, k) => (g[`a${qs2.length + k}`] = "1"));
      expect((await req("/quiz", { cookie: m.cookie, form: g })).status).toBe(302);
    } else expect(again.status).toBe(302);
    const [after] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    const prev = (after.blend as unknown as { prev?: { archetype: string; unsure: string[]; at: string; prev?: unknown } }).prev;
    expect(prev?.archetype).toBe(before.archetype);
    expect(prev?.at).toBe(before.takenAt.toISOString());
    expect(prev).not.toHaveProperty("prev");
  });
});
