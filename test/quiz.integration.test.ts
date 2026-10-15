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
import { answersAs, formValue } from "./quiz-helpers";
import { ARCHETYPES, displayName, typeOf, type ArchetypeKey } from "../src/vibe/archetypes";

const seedIn = (html: string) => /name="seed" value="([^"]+)"/.exec(html)?.[1] ?? "";
/** Question indices that have a field in the form (a3, or a3_0 for rank and coins). */
const answerNames = (html: string) => new Set([...html.matchAll(/name="a(\d+)(?:_\d+)?"/g)].map((m) => m[1]));

/** createMember()'s default profile, which personalises the /quiz session. */
const MEMBER = personalOf({ district: "bang_rak", interests: ["food", "art"] });

/** Answers as a Food Hunter (BDSH) would; `count` answers. */
function form(seed: string, questions: Question[], count = questions.length): Record<string, string> {
  const f: Record<string, string> = { seed };
  const picks = answersAs(questions, "BDSH");
  questions.slice(0, count).forEach((q, i) => (f[`a${i}`] = formValue(picks[q.id])));
  return f;
}

const answersOf = (f: Record<string, string>, questions: Question[]) => parseAnswers(f, questions).answers;

describe.skipIf(!HAS_DB)("Bangkok Vibe quiz", () => {
  it("renders 20 questions for a member, each in its format", async () => {
    const m = await createMember();
    const r = await req("/quiz?lang=en", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(answerNames(html).size).toBe(20);
    expect(seedIn(html)).toBe(quizSeed(m.id, null));
    expect(html).toContain("Tap the answer that");
    expect(html).toContain("No wrong answers");
    expect(html).not.toContain("data-budget");
    // The interactive formats, each as a plain form field first.
    for (const marker of ["data-tot", "data-slider", 'type="range"', "data-rank", "data-map", "qf-photos", "data-sentence"]) expect(html).toContain(marker);
    // Personalised: the page is the session for this member's home district.
    const qs = quizQuestions(seedIn(html), null, MEMBER);
    for (const q of qs) expect(html).toContain(q.prompt.en.replace(/'/g, "&#39;").replace(/"/g, "&quot;").slice(0, 20));
    // One radio per answer; a slider is one range; rank is one value field (plus a number select per answer).
    for (const q of qs) {
      const i = qs.indexOf(q);
      const fields = (html.match(new RegExp(`name="a${i}"`, "g")) ?? []).length;
      expect(fields, `${i} ${q.format}`).toBe(q.format === "slider" || q.format === "rank" ? 1 : q.options.length);
      if (q.format === "rank") expect((html.match(new RegExp(`name="a${i}_\\d"`, "g")) ?? []).length).toBe(6);
    }
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
    const few = await req("/quiz", { cookie: m.cookie, form: form(seed, qs, 13) });
    expect(few.status).toBe(400);
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
  });

  it("rejects answers that aren't one of the options with 400, without saving", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const good = form(seed, qs);
    const c = qs.findIndex((q, i) => i > 0 && q.format === "choice");
    const s = qs.findIndex((q) => q.format === "slider");
    const k = qs.findIndex((q) => q.format === "rank");
    const t = qs.findIndex((q) => q.format === "this-or-that");
    const bad: Record<string, string>[] = [
      ...["6", "9", "-1", "abc", "1.5"].map((v) => ({ [`a${c}`]: v })),
      { [`a${s}`]: "101" },
      { [`a${k}`]: "0,0,1" },
      { [`a${k}`]: "0,1" },
      { [`a${t}`]: "2" },
    ];
    for (const b of bad) {
      const r = await req("/quiz?lang=en", { cookie: m.cookie, form: { ...good, ...b } });
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(await r.text()).toContain("needs another look");
    }
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
    // Leaving one question blank just skips it.
    expect((await req("/quiz", { cookie: m.cookie, form: { ...good, [`a${c}`]: "" } })).status).toBe(302);
  });

  it("scores, saves the type, shows it, and retakes with fresh questions", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const f = form(seed, qs);
    const r = await req("/quiz", { cookie: m.cookie, form: f });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/quiz/result?new=1");

    const scored = scoreSession(qs, answersOf(f, qs));
    expect(scored.answered).toBe(20);
    const expected = typeOf(scored.vector, scored.affinity, scored.unsure);
    const [row] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    expect(row.archetype).toBe(expected.archetype);
    expect(row.modifier).toBe(expected.modifier);
    expect(row.archetype).toBe("BDSH");
    expect(row.blend?.types).toEqual(expected.blend);
    expect(row.blend?.unsure).toEqual(scored.unsure);
    expect(row.blend?.consistency).toBe(1);
    expect(row.seen).toHaveLength(20);
    expect(row.visible).toBe(false);

    const result = await (await req("/quiz/result?lang=en", { cookie: m.cookie })).text();
    expect(result).toContain(displayName(row.archetype as ArchetypeKey, row.modifier).en);
    expect(result).toContain('action="/quiz/visibility"');
    expect(result).toContain("How sure we are");
    expect(result).toContain("Clicks with");
    expect(result).toContain("Hangouts and areas");

    // Retake: a new server-side seed, and (mostly) unseen questions.
    const again = await (await req("/quiz", { cookie: m.cookie })).text();
    expect(seedIn(again)).toBe(`${m.id}:20`);
    const next = quizQuestions(`${m.id}:20`, row, MEMBER);
    const seenScenarios = new Set(row.seen.map((id) => id.split(".")[0]));
    expect(next.filter((q) => seenScenarios.has(q.scenario)).length).toBeLessThanOrEqual(6);

    // Retaking keeps `visible` and grows `seen`.
    await req("/quiz/visibility", { cookie: m.cookie, form: { visible: "1", next: "/quiz/result" } });
    const r2 = await req("/quiz", { cookie: m.cookie, form: form(`${m.id}:20`, next) });
    expect(r2.status).toBe(302);
    const [row2] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    expect(row2.visible).toBe(true);
    expect(row2.seen.length).toBeGreaterThan(20);
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
    const welcomeHtml = await welcome.text();
    expect(welcomeHtml).toContain('action="/onboarding/welcome"');
    expect(welcomeHtml).toContain('value="dating"');
    expect((await req("/onboarding/welcome", { cookie, form: { mode: "friends" } })).headers.get("location")).toBe("/onboarding/quiz");
    expect((await req("/onboarding/welcome", { cookie, form: { mode: "dating_only" } })).headers.get("location")).toBe("/onboarding/dating");
    const quiz = await req("/onboarding/quiz", { cookie });
    expect(quiz.status).toBe(200);
    const qhtml = await quiz.text();
    expect(answerNames(qhtml).size).toBe(20);
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
