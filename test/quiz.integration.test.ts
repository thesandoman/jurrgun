/**
 * Bangkok Vibe quiz, Bangkok Types and the quiz-first onboarding order,
 * against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { accounts, profiles, vibes } from "../src/schema";
import { cleanBio } from "../src/content/profile";
import { ROMANCE_EN } from "../src/vibe/bank-rules";
import { randomToken } from "../src/lib/crypto";
import { parseAnswers, personalOf, quizQuestions, quizSeed, typeSlug } from "../src/routes/quiz";
import { scoreSession, typeQuestions, type AnyQuestion } from "../src/vibe/generator";
import { answersAs } from "./quiz-helpers";
import { ARCHETYPES, displayName, typeOf, type ArchetypeKey } from "../src/vibe/archetypes";

const seedIn = (html: string) => /name="seed" value="([^"]+)"/.exec(html)?.[1] ?? "";
/** Question indices that have a field in the form (a3). */
const answerNames = (html: string) => new Set([...html.matchAll(/name="a(\d+)"/g)].map((m) => m[1]));

/** createMember()'s default profile, which personalises the /quiz session. */
const MEMBER = personalOf({ district: "bang_rak", interests: ["food", "art"], languages: ["th", "en"], relationship: "single" });

/** Answers as a Food Hunter (BDSH) would; `count` answers. */
function form(seed: string, questions: AnyQuestion[], count = questions.length): Record<string, string> {
  const f: Record<string, string> = { seed };
  const picks = answersAs(typeQuestions(questions), "BDSH");
  questions.slice(0, count).forEach((q, i) => (f[`a${i}`] = String(picks[q.id] ?? 0)));
  return f;
}

const answersOf = (f: Record<string, string>, questions: AnyQuestion[]) => parseAnswers(f, questions).answers;

describe.skipIf(!HAS_DB)("Bangkok Vibe quiz", () => {
  it("renders the 16 curated questions for a member", async () => {
    const m = await createMember();
    const r = await req("/quiz?lang=en", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(answerNames(html).size).toBe(16);
    expect(seedIn(html)).toBe(quizSeed(m.id, null));
    expect(html).toContain("Tap the answer that");
    expect(html).toContain("Go with your gut");
    expect(html).toContain("None of these are me");
    expect(html).not.toContain("groupmates");
    // Plain scenarios only (owner, D26): no sliders, rank, swipes, maps or chips.
    for (const marker of ['type="range"', "data-budget", "data-tot", "data-slider", "data-rank", "data-map", "qf-photos", "data-sentence"]) expect(html).not.toContain(marker);
    // The page is this member's curated set.
    const qs = quizQuestions(seedIn(html), null, MEMBER);
    for (const q of qs) expect(html).toContain(q.prompt.en.replace(/'/g, "&#39;").replace(/"/g, "&quot;").slice(0, 20));
    // One radio per answer, then "None of these are me".
    for (const q of qs) {
      const i = qs.indexOf(q);
      expect((html.match(new RegExp(`name="a${i}"`, "g")) ?? []).length).toBe(q.options.length + 1);
      expect(html).toContain(`name="a${i}" value="none"`);
    }
    // The same curated questions as anyone with no Bangkok story yet: a local member gets the local set (D26).
    expect(qs.map((q) => q.id)).toEqual(quizQuestions(seedIn(html), null).map((q) => q.id));
    expect(qs.every((q) => q.format === "choice" && q.options.length === 4)).toBe(true);
  });

  it("shows each member only the sets that fit them, and saves the style cards without changing the type", async () => {
    // Friends only (romance off): the 16, no romance anywhere.
    const plain = await createMember();
    const plainHtml = await (await req("/quiz?lang=en", { cookie: plain.cookie })).text();
    expect(answerNames(plainHtml).size).toBe(16);
    expect(plainHtml).not.toContain("Open to something more");
    // Date moments read as friend meetups (owner, Q-D1): no romance words on the page's questions.
    for (const q of quizQuestions(seedIn(plainHtml), null, MEMBER)) for (const x of [q.prompt, ...q.options.map((o) => o.label)]) if (q.kind !== "style" && q.context === "date") expect(ROMANCE_EN.test(x.en), x.en).toBe(false);

    // Open to something more: 16 + 4 "how you date", saved to the dating profile.
    const dater = await createMember({ romanceOn: true, relationship: "single", romanceOpenTo: "everyone" });
    const [dp] = await db().select().from(profiles).where(eq(profiles.accountId, dater.id));
    const daterPersonal = personalOf(dp);
    expect(daterPersonal?.openToMore).toBe(true);
    const dHtml = await (await req("/quiz?lang=en", { cookie: dater.cookie })).text();
    expect(answerNames(dHtml).size).toBe(20);
    expect(dHtml).toContain("Open to something more · doesn");
    const dSeed = seedIn(dHtml);
    const dQs = quizQuestions(dSeed, null, daterPersonal);
    expect((await req("/quiz", { cookie: dater.cookie, form: form(dSeed, dQs) })).status).toBe(302);
    const [dRow] = await db().select().from(vibes).where(eq(vibes.accountId, dater.id));
    expect(dRow.archetype).toBe("BDSH");
    expect(dRow.seen).toHaveLength(20);
    const dBio = cleanBio((await db().select().from(profiles).where(eq(profiles.accountId, dater.id)))[0].bio);
    expect(Object.keys(dBio.dateStyle ?? {})).toHaveLength(4);
    expect(dBio.hostStyle).toBeUndefined();
    expect(await (await req("/me/profile?lang=en", { cookie: dater.cookie })).text()).toContain("How I date");

    // Table Host: 16 + 2 "how you host", shown on their result.
    const host = await createMember({ role: "circle_head" });
    const [hp] = await db().select().from(profiles).where(eq(profiles.accountId, host.id));
    const [ha] = await db().select().from(accounts).where(eq(accounts.id, host.id));
    const hHtml = await (await req("/quiz?lang=en", { cookie: host.cookie })).text();
    expect(answerNames(hHtml).size).toBe(18);
    expect(hHtml).not.toContain("Open to something more");
    const hSeed = seedIn(hHtml);
    const hQs = quizQuestions(hSeed, null, personalOf(hp, ha.role));
    expect((await req("/quiz", { cookie: host.cookie, form: form(hSeed, hQs) })).status).toBe(302);
    const hBio = cleanBio((await db().select().from(profiles).where(eq(profiles.accountId, host.id)))[0].bio);
    expect(Object.keys(hBio.hostStyle ?? {})).toHaveLength(2);
    expect(hBio.dateStyle).toBeUndefined();
    expect(await (await req("/quiz/result?lang=en", { cookie: host.cookie })).text()).toContain("How you host");
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
    const tampered = await req("/quiz", { cookie: m.cookie, form: form(`${m.id}:999:2026-01`, qs) });
    expect(tampered.status).toBe(400);
    const few = await req("/quiz", { cookie: m.cookie, form: form(seed, qs, 13) });
    expect(few.status).toBe(400);
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
  });

  it("gives a result when most answers are None of these, but not when every answer is", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const f = form(seed, qs);
    qs.forEach((_, i) => {
      if (i > 0) f[`a${i}`] = "none";
    });
    expect((await req("/quiz", { cookie: m.cookie, form: f })).status).toBe(302);
    // Under 10 real picks the result is a rough start, said plainly, not refused.
    expect(await (await req("/quiz/result?lang=en", { cookie: m.cookie })).text()).toContain("This is a rough start");
    const m2 = await createMember();
    const seed2 = quizSeed(m2.id, null);
    const qs2 = quizQuestions(seed2, null, MEMBER);
    const all = form(seed2, qs2);
    qs2.forEach((_, i) => (all[`a${i}`] = "none"));
    expect((await req("/quiz", { cookie: m2.cookie, form: all })).status).toBe(400);
  });

  it("rejects answers that aren't one of the options with 400, without saving", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const good = form(seed, qs);
    const c = qs.findIndex((q, i) => i > 0 && q.format === "choice");
    const bad: Record<string, string>[] = ["4", "6", "-1", "abc", "1.5"].map((v) => ({ [`a${c}`]: v }));
    for (const b of bad) {
      const r = await req("/quiz?lang=en", { cookie: m.cookie, form: { ...good, ...b } });
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(await r.text()).toContain("needs another look");
    }
    expect(await db().select().from(vibes).where(eq(vibes.accountId, m.id))).toHaveLength(0);
    // Every question needs a response, a pick or "None of these": a blank one comes back to be answered.
    const blank = await req("/quiz?lang=en", { cookie: m.cookie, form: { ...good, [`a${c}`]: "" } });
    expect(blank.status).toBe(400);
    expect(await blank.text()).toContain("still needs an answer");
    expect((await req("/quiz", { cookie: m.cookie, form: { ...good, [`a${c}`]: "none" } })).status).toBe(302);
  });

  it('takes "None of these are me" as no vote', async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const good = form(seed, qs);
    const three = { ...good, a1: "none", a2: "none", a3: "none" };
    expect((await req("/quiz", { cookie: m.cookie, form: three })).status).toBe(302);
    const [row] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    // Scored as if those three were never answered.
    const without = Object.fromEntries(Object.entries(answersOf(good, qs)).filter(([id]) => ![1, 2, 3].some((i) => qs[i].id === id)));
    expect(row.vector).toEqual(scoreSession(typeQuestions(qs), without).vector);
  });

  it("scores, saves the type, shows it, and a retake asks the same questions (D26)", async () => {
    const m = await createMember();
    const seed = quizSeed(m.id, null);
    const qs = quizQuestions(seed, null, MEMBER);
    const f = form(seed, qs);
    const r = await req("/quiz", { cookie: m.cookie, form: f });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/quiz/result?new=1");

    const scored = scoreSession(typeQuestions(qs), answersOf(f, qs));
    expect(scored.answered).toBe(16);
    const expected = typeOf(scored.vector, scored.affinity, scored.unsure);
    const [row] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    expect(row.archetype).toBe(expected.archetype);
    expect(row.modifier).toBe(expected.modifier);
    expect(row.archetype).toBe("BDSH");
    expect(row.blend?.types).toEqual(expected.blend);
    expect(row.blend?.unsure).toEqual(scored.unsure);
    expect(row.blend?.consistency).toBe(1);
    expect(row.seen).toHaveLength(16);
    expect(row.blend?.answered).toBe(16);
    expect(row.visible).toBe(false);

    const result = await (await req("/quiz/result?lang=en", { cookie: m.cookie })).text();
    expect(result).toContain(displayName(row.archetype as ArchetypeKey, row.modifier).en);
    expect(result).toContain('action="/quiz/visibility"');
    expect(result).toContain("How sure we are");
    expect(result).toContain("Clicks with");
    expect(result).toContain("Hangouts and areas");

    // Retake: the same questions in the same order, so a change in the result is a real change.
    const again = await (await req("/quiz", { cookie: m.cookie })).text();
    expect(seedIn(again)).toBe(quizSeed(m.id, row));
    expect(seedIn(again)).toMatch(new RegExp(`^${m.id}:16:\\d{4}-\\d{2}$`));
    const next = quizQuestions(seedIn(again), row, MEMBER);
    expect(next.map((q) => q.id)).toEqual(qs.map((q) => q.id));

    // Retaking keeps `visible`.
    await req("/quiz/visibility", { cookie: m.cookie, form: { visible: "1", next: "/quiz/result" } });
    const r2 = await req("/quiz", { cookie: m.cookie, form: form(seedIn(again), next) });
    expect(r2.status).toBe(302);
    const [row2] = await db().select().from(vibes).where(eq(vibes.accountId, m.id));
    expect(row2.visible).toBe(true);
    expect(row2.seen).toHaveLength(16);
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
    expect(answerNames(qhtml).size).toBe(16);
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
