/**
 * Bangkok Vibe quiz, Bangkok Types and the quiz-first onboarding order,
 * against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { vibes } from "../src/schema";
import { randomToken } from "../src/lib/crypto";
import { parseAnswers, personalOf, quizQuestions, quizSeed, typeSlug } from "../src/routes/quiz";
import { scoreSession, type Question } from "../src/vibe/generator";
import { ARCHETYPES, displayName, typeOf, type ArchetypeKey } from "../src/vibe/archetypes";

const seedIn = (html: string) => /name="seed" value="([^"]+)"/.exec(html)?.[1] ?? "";
/** Question indices that have a field in the form (a3, or a3_0 for rank and coins). */
const answerNames = (html: string) => new Set([...html.matchAll(/name="a(\d+)(?:_\d+)?"/g)].map((m) => m[1]));

/** createMember()'s default profile, which personalises the /quiz session. */
const MEMBER = personalOf({ district: "bang_rak", interests: ["food", "art"] });

/**
 * Leans "+" on every question; `count` answers. Ranks go in as the no-JS
 * number selects, coins as number inputs, sliders as 0..100.
 */
function form(seed: string, questions: Question[], count = questions.length): Record<string, string> {
  const f: Record<string, string> = { seed };
  questions.slice(0, count).forEach((q, i) => {
    switch (q.format) {
      case "scale":
        f[`a${i}`] = "5";
        break;
      case "slider":
        f[`a${i}`] = q.options[1].pole === 1 ? "90" : "10";
        break;
      case "rank": {
        // positions: + items get 1 and 2, − items 3 and 4
        let plus = 1;
        let minus = 3;
        q.options.forEach((o, j) => (f[`a${i}_${j}`] = String(o.pole === 1 ? plus++ : minus++)));
        break;
      }
      case "budget": {
        let first = true;
        q.options.forEach((o, j) => {
          f[`a${i}_${j}`] = o.pole === 1 ? (first ? "7" : "3") : "0";
          if (o.pole === 1) first = false;
        });
        break;
      }
      default:
        f[`a${i}`] = String(q.options.findIndex((o) => o.pole === 1));
    }
  });
  return f;
}

const answersOf = (f: Record<string, string>, questions: Question[]) => parseAnswers(f, questions).answers;

describe.skipIf(!HAS_DB)("Bangkok Vibe quiz", () => {
  it("renders 18 questions in every format for a member", async () => {
    const m = await createMember();
    const r = await req("/quiz?lang=en", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(answerNames(html).size).toBe(18);
    expect(seedIn(html)).toBe(quizSeed(m.id, null));
    expect(html).toContain("Tap an answer");
    expect(html).toContain("nothing political");
    // slider, rank (with no-JS selects), coins (with no-JS number inputs), bothers
    expect(html).toContain('type="range"');
    expect(html).toContain("data-rank");
    expect(html).toMatch(/<select name="a\d+_0"/);
    expect(html).toContain("data-budget");
    expect(html).toMatch(/type="number" name="a\d+_0"/);
    expect(html).toContain("Slide to your spot");
    // Personalised: the page is the session for this member's district and interests.
    const qs = quizQuestions(seedIn(html), null, MEMBER);
    for (const q of qs) expect(html).toContain(q.prompt.en.replace(/'/g, "&#39;").replace(/"/g, "&quot;").slice(0, 20));
    expect(qs.map((q) => q.id)).not.toEqual(quizQuestions(seedIn(html), null).map((q) => q.id));
  });

  it("requires sign-in", async () => {
    const r = await req("/quiz");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("/login");
  });

  it("rejects a tampered seed and too few answers", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const tampered = await req("/quiz", { cookie: m.cookie, form: form(`${m.id}:999`, qs) });
    expect(tampered.status).toBe(400);
    const few = await req("/quiz", { cookie: m.cookie, form: form(seed, qs, 11) });
    expect(few.status).toBe(400);
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
  });

  it("rejects malformed rank, coin and choice answers with 400, without saving", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const ri = qs.findIndex((q) => q.format === "rank");
    const bi = qs.findIndex((q) => q.format === "budget");
    const ci = qs.findIndex((q) => q.format === "choice");
    const si = qs.findIndex((q) => q.format === "slider");
    expect(ri).toBeGreaterThanOrEqual(0);
    expect(bi).toBeGreaterThanOrEqual(0);
    const good = form(seed, qs);
    const bad: Record<string, string>[] = [
      { ...good, [`a${ri}_0`]: "1", [`a${ri}_1`]: "1" }, // duplicate position
      { ...good, [`a${ri}_2`]: "" }, // half-done ranking
      { ...good, [`a${ri}_3`]: "9" }, // out of range
      { ...good, [`a${bi}_0`]: "9", [`a${bi}_1`]: "0", [`a${bi}_2`]: "0", [`a${bi}_3`]: "0" }, // 9 coins
      { ...good, [`a${bi}_0`]: "10", [`a${bi}_1`]: "10" }, // 20 coins
      { ...good, [`a${bi}_0`]: "abc" },
      { ...good, [`a${ci}`]: "7" },
      { ...good, [`a${si}`]: "250" },
    ];
    for (const f of bad) {
      const r = await req("/quiz?lang=en", { cookie: m.cookie, form: f });
      expect(r.status).toBe(400);
      expect(await r.text()).toContain("needs another look");
    }
    // The compact rank form ("2,0,3,1") must also be a real permutation.
    const compact = { ...good, [`a${ri}`]: "0,0,1,2" };
    expect((await req("/quiz", { cookie: m.cookie, form: compact })).status).toBe(400);
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
    // Leaving a rank or coin question untouched just skips it.
    const skipped = { ...good };
    for (const k of Object.keys(skipped)) if (k.startsWith(`a${ri}_`)) skipped[k] = "";
    for (const k of Object.keys(skipped)) if (k.startsWith(`a${bi}_`)) skipped[k] = "0";
    expect((await req("/quiz", { cookie: m.cookie, form: skipped })).status).toBe(302);
  });

  it("scores, saves the type, shows it, and retakes with fresh questions", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    expect(new Set(qs.map((q) => q.format))).toEqual(new Set(["choice", "bothers", "scale", "slider", "rank", "budget"]));
    const f = form(seed, qs);
    const r = await req("/quiz", { cookie: m.cookie, form: f });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/quiz/result?new=1");

    const scored = scoreSession(qs, answersOf(f, qs));
    expect(scored.answered).toBe(18);
    const expected = typeOf(scored.vector);
    const [row] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    expect(row.archetype).toBe(expected.archetype);
    expect(row.modifier).toBe(expected.modifier);
    expect(row.seen).toHaveLength(18);
    expect(row.visible).toBe(false);

    const result = await (await req("/quiz/result?lang=en", { cookie: m.cookie })).text();
    expect(result).toContain(displayName(row.archetype as ArchetypeKey, row.modifier).en);
    expect(result).toContain('action="/quiz/visibility"');

    // Retake: a new server-side seed, and (mostly) unseen questions.
    const again = await (await req("/quiz", { cookie: m.cookie })).text();
    expect(seedIn(again)).toBe(`${m.id}:18`);
    const next = quizQuestions(`${m.id}:18`, row, MEMBER);
    const repeats = next.filter((q) => row.seen.includes(q.id)).length;
    expect(repeats).toBeLessThanOrEqual(3);

    // Retaking keeps `visible` and grows `seen`.
    await req("/quiz/visibility", { cookie: m.cookie, form: { visible: "1", next: "/quiz/result" } });
    const r2 = await req("/quiz", { cookie: m.cookie, form: form(`${m.id}:18`, next) });
    expect(r2.status).toBe(302);
    const [row2] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    expect(row2.visible).toBe(true);
    expect(row2.seen.length).toBeGreaterThan(18);
  });

  it("toggles visibility", async () => {
    const m = await createMember();
    expect((await req("/quiz/visibility", { cookie: m.cookie, form: { visible: "1" } })).headers.get("location")).toBe("/quiz");
    const seed = quizSeed(m.id, null);
    await req("/quiz", { cookie: m.cookie, form: form(seed, quizQuestions(seed, null, MEMBER)) });
    const on = await req("/quiz/visibility", { cookie: m.cookie, form: { visible: "1", next: "/settings" } });
    expect(on.headers.get("location")).toBe("/settings?notice=vibe_saved");
    expect((await db().select().from(vibes).where(eq(vibes.accountId, m.id)))[0].visible).toBe(true);
    await req("/quiz/visibility", { cookie: m.cookie, form: { next: "https://evil.example" } });
    expect((await db().select().from(vibes).where(eq(vibes.accountId, m.id)))[0].visible).toBe(false);
    const settings = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(settings).toContain("Your Bangkok Type");
  });

  it("serves the public type gallery and pages", async () => {
    const gallery = await req("/types?lang=en");
    expect(gallery.status).toBe(200);
    const html = await gallery.text();
    const keys = Object.keys(ARCHETYPES) as ArchetypeKey[];
    expect(keys).toHaveLength(16);
    for (const k of keys) expect(html).toContain(`/types/${typeSlug(k)}`);
    for (const k of keys) {
      const r = await req(`/types/${typeSlug(k)}?lang=en`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain(ARCHETYPES[k].name.en);
    }
    expect((await req("/types/nope")).status).toBe(404);
  });

  it("puts the quiz first in onboarding, and skipping continues to basics", async () => {
    const username = `q_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const signup = await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1" } });
    const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0];
    expect((await req("/onboarding", { cookie })).headers.get("location")).toBe("/onboarding/welcome");
    const welcome = await req("/onboarding/welcome", { cookie });
    expect(welcome.status).toBe(200);
    expect(await welcome.text()).toContain('href="/onboarding/quiz"');
    const quiz = await req("/onboarding/quiz", { cookie });
    expect(quiz.status).toBe(200);
    const qhtml = await quiz.text();
    expect(answerNames(qhtml).size).toBe(18);
    expect(qhtml).toContain('formaction="/onboarding/quiz/skip"');
    const skip = await req("/onboarding/quiz/skip", { cookie, method: "POST" });
    expect(skip.headers.get("location")).toBe("/onboarding/basics");
    expect((await req("/onboarding", { cookie: `${cookie}; bkk_quiz_skip=1` })).headers.get("location")).toBe("/onboarding/basics");
  });

  it("taking the quiz in onboarding reveals the type, then continues to basics", async () => {
    const username = `r_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const signup = await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1" } });
    const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0];
    const html = await (await req("/onboarding/quiz", { cookie })).text();
    const seed = seedIn(html);
    const qs = quizQuestions(seed, null);
    const r = await req("/quiz", { cookie, form: { ...form(seed, qs), next: "/onboarding/type" } });
    expect(r.headers.get("location")).toBe("/onboarding/type?new=1");
    expect((await req("/onboarding/type", { cookie })).status).toBe(200);
    expect((await req("/onboarding", { cookie })).headers.get("location")).toBe("/onboarding/basics");
  });
});
