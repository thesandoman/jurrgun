/**
 * Bangkok Vibe quiz, Bangkok Types and the quiz-first onboarding order,
 * against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { vibes } from "../src/schema";
import { randomToken } from "../src/lib/crypto";
import { quizQuestions, quizSeed, typeSlug } from "../src/routes/quiz";
import { scoreSession, type Question } from "../src/vibe/generator";
import { ARCHETYPES, displayName, typeOf, type ArchetypeKey } from "../src/vibe/archetypes";

const seedIn = (html: string) => /name="seed" value="([^"]+)"/.exec(html)?.[1] ?? "";
const answerNames = (html: string) => new Set([...html.matchAll(/name="(a\d+)"/g)].map((m) => m[1]));

/** Leans "+" on every choice, 5 on every scale; `count` answers. */
function form(seed: string, questions: Question[], count = questions.length): Record<string, string> {
  const f: Record<string, string> = { seed };
  questions.slice(0, count).forEach((q, i) => {
    f[`a${i}`] = q.format === "choice" ? String(q.options.findIndex((o) => o.pole === 1)) : "5";
  });
  return f;
}

function answersOf(f: Record<string, string>, questions: Question[]) {
  const a: Record<string, number> = {};
  questions.forEach((q, i) => {
    if (f[`a${i}`] !== undefined) a[q.id] = Number(f[`a${i}`]);
  });
  return a;
}

describe.skipIf(!HAS_DB)("Bangkok Vibe quiz", () => {
  it("renders 18 one-tap questions for a member", async () => {
    const m = await createMember();
    const r = await req("/quiz?lang=en", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(answerNames(html).size).toBe(18);
    expect(seedIn(html)).toBe(quizSeed(m.id, null));
    expect(html).toContain("Tap an answer");
    expect(html).toContain("nothing political");
  });

  it("requires sign-in", async () => {
    const r = await req("/quiz");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("/login");
  });

  it("rejects a tampered seed and too few answers", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null);
    const tampered = await req("/quiz", { cookie: m.cookie, form: form(`${m.id}:999`, qs) });
    expect(tampered.status).toBe(400);
    const few = await req("/quiz", { cookie: m.cookie, form: form(seed, qs, 11) });
    expect(few.status).toBe(400);
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
  });

  it("scores, saves the type, shows it, and retakes with fresh questions", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null);
    const f = form(seed, qs);
    const r = await req("/quiz", { cookie: m.cookie, form: f });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/quiz/result?new=1");

    const expected = typeOf(scoreSession(qs, answersOf(f, qs)).vector);
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
    const next = quizQuestions(`${m.id}:18`, row);
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
    await req("/quiz", { cookie: m.cookie, form: form(seed, quizQuestions(seed, null)) });
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
