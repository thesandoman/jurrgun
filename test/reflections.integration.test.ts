/**
 * "My Bangkok" reflections at the end of the quiz, against local Postgres:
 * shown only in the member quiz, saved to the profile, never scored, private
 * where they should be, and fed to City Pulse only with research consent.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { profiles, pulseResponses, vibes } from "../src/schema";
import { personalOf, quizQuestions, quizSeed } from "../src/routes/quiz";
import { cleanBio } from "../src/content/profile";
import { CHANGE_PULSE_ID } from "../src/content/reflections";
import { typeQuestions, type AnyQuestion } from "../src/vibe/generator";
import { answersAs } from "./quiz-helpers";

/** createMember()'s default profile, which personalises the /quiz session. */
const MEMBER = personalOf({ district: "bang_rak", interests: ["food", "art"], languages: ["th", "en"], relationship: "single" });

const seedIn = (html: string) => /name="seed" value="([^"]+)"/.exec(html)?.[1] ?? "";

/** The quiz answered as a Food Hunter (BDSH), plus any reflection fields. */
function form(seed: string, questions: AnyQuestion[], extra: Record<string, string | string[]> = {}): Record<string, string | string[]> {
  const f: Record<string, string | string[]> = { seed };
  const picks = answersAs(typeQuestions(questions), "BDSH");
  questions.forEach((q, i) => (f[`a${i}`] = String(picks[q.id] ?? 0)));
  return { ...f, ...extra };
}

const REFLECT = {
  r_like: ["street_food", "water"],
  r_like_note: "night markets after rain",
  r_change: "flooding",
  r_change_note: "my soi floods every September",
  r_fav_district: "samphanthawong",
  r_fav_place: "Talat Noi",
  r_notyet_1: "nong_chok",
  r_notyet_2: "",
  r_notyet_3: "bang_khun_thian",
};

async function bioOf(id: string) {
  return cleanBio((await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, id)))[0].bio);
}

async function take(m: { id: string; cookie: string }, extra: Record<string, string | string[]>) {
  const row = (await db().select().from(vibes).where(eq(vibes.accountId, m.id)))[0] ?? null;
  const seed = quizSeed(m.id, row);
  const r = await req("/quiz", { cookie: m.cookie, form: form(seed, quizQuestions(seed, row, MEMBER), extra) as Record<string, string> });
  expect(r.status).toBe(302);
}

describe.skipIf(!HAS_DB)("My Bangkok reflections", () => {
  it("come after the questions in the member quiz, optional, and never in onboarding", async () => {
    const m = await createMember();
    const html = await (await req("/quiz?lang=en", { cookie: m.cookie })).text();
    for (const name of ["r_like", "r_change", "r_fav_district", "r_fav_place", "r_notyet_1", "r_notyet_place"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain("What do you like about Bangkok?");
    expect(html).toContain("doesn&#39;t change your type");
    // No cheering in the quiz (owner, D26 (6)).
    expect(html).not.toMatch(/toast party|Halfway|halfway/);
    // Onboarding has no profile to keep them in yet.
    const fresh = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, fresh.id));
    const onboarding = await (await req("/onboarding/quiz?lang=en", { cookie: fresh.cookie })).text();
    expect(onboarding).not.toContain('name="r_like"');
  });

  it("are saved to the profile, prefilled next time, and never change the type", async () => {
    const m = await createMember();
    await take(m, REFLECT);
    const bio = await bioOf(m.id);
    expect(bio.reflections).toEqual({
      like: ["street_food", "water"],
      likeNote: "night markets after rain",
      change: "flooding",
      changeNote: "my soi floods every September",
      favourite: { district: "samphanthawong", place: "Talat Noi" },
      notYet: { districts: ["nong_chok", "bang_khun_thian"] },
    });
    const withReflections = (await db().select().from(vibes).where(eq(vibes.accountId, m.id)))[0];
    expect(withReflections.archetype).toBe("BDSH");

    // Same answers without reflections give the same type.
    const plain = await createMember();
    await take(plain, {});
    expect((await db().select().from(vibes).where(eq(vibes.accountId, plain.id)))[0].archetype).toBe(withReflections.archetype);
    expect((await bioOf(plain.id)).reflections).toBeUndefined();

    // A retake opens with the last answers ticked and filled in.
    const again = await (await req("/quiz?lang=en", { cookie: m.cookie })).text();
    expect(again).toMatch(/name="r_like" value="street_food"[^>]*checked/);
    expect(again).toContain('value="Talat Noi"');
    expect(seedIn(again)).not.toBe("");
    // Clearing everything on a retake clears them.
    await take(m, {});
    expect((await bioOf(m.id)).reflections).toBeUndefined();
  });

  it("send what you'd change to City Pulse only with research consent, as the option alone, once per member", async () => {
    const without = await createMember();
    await take(without, REFLECT);
    const withConsent = await createMember({ research: true });
    await take(withConsent, REFLECT);
    const rows = await db().select().from(pulseResponses).where(eq(pulseResponses.questionId, CHANGE_PULSE_ID));
    const [acct] = await db().select({ rid: pulseResponses.researchId, answer: pulseResponses.answer }).from(pulseResponses).where(and(eq(pulseResponses.questionId, CHANGE_PULSE_ID), eq(pulseResponses.researchId, withConsent.researchId)));
    expect(acct?.answer).toBe("flooding");
    expect(rows.some((r) => r.researchId === without.researchId)).toBe(false);
    // Never the words, never the account id.
    expect(JSON.stringify(rows)).not.toContain("September");
    expect(JSON.stringify(rows)).not.toContain(withConsent.id);
    // A retake replaces the answer rather than adding another.
    await take(withConsent, { ...REFLECT, r_change: "shade" });
    const mine = await db().select().from(pulseResponses).where(and(eq(pulseResponses.questionId, CHANGE_PULSE_ID), eq(pulseResponses.researchId, withConsent.researchId)));
    expect(mine).toHaveLength(1);
    expect(mine[0].answer).toBe("shade");
  });

  it("show on the card as My Bangkok, without what you'd change, and mark the Passport", async () => {
    const m = await createMember();
    await take(m, REFLECT);
    const card = await (await req("/me/profile?lang=en", { cookie: m.cookie })).text();
    expect(card).toContain("Loves in Bangkok");
    expect(card).toContain("The street food");
    expect(card).toContain("Talat Noi");
    expect(card).toContain("Next to explore");
    expect(card).not.toContain("September");
    expect(card).not.toContain("flood");
    const passport = await (await req("/buddy/passport?lang=en", { cookie: m.cookie })).text();
    expect(passport).toContain("Next to explore");
    expect(passport).toContain("Nong Chok");
  });
});
