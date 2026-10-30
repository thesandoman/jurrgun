/**
 * Privacy risk assessment R1, R2, R3 (design/reference/privacy-risk-assessment.md):
 * dating intents only with the romance_data consent, deleted the moment romance
 * goes off or the consent is withdrawn, and consent rows for relationship status
 * and the private gender.
 */
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req, type Member } from "./helpers";
import { newId } from "../src/lib/crypto";
import { consents, datingIntents, profiles } from "../src/schema";

const intents = async (id: string) => db().select().from(datingIntents).where(eq(datingIntents.accountId, id));
const prof = async (id: string) => (await db().select().from(profiles).where(eq(profiles.accountId, id)))[0];
const rows = async (id: string, category: string) =>
  (await db().select().from(consents).where(and(eq(consents.accountId, id), eq(consents.category, category))).orderBy(asc(consents.createdAt))).map((r) => r.granted);
const notOnboarded = (m: Member) => db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
const consent = (m: Member, category: string, granted: boolean) => db().insert(consents).values({ id: newId(), accountId: m.id, category, granted, version: "test" });
const romantic = async () => {
  const m = await createMember({ relationship: "single", romanceOn: true, romanceOpenTo: "everyone" });
  await consent(m, "romance_data", true);
  await db().insert(datingIntents).values({ accountId: m.id, mode: "dating", reasons: ["long_term"], challenges: ["safety"], prefs: { kids: "want" } });
  await db()
    .update(profiles)
    .set({ genderIdentity: "self", bio: { datingGenderSelf: "my words", datingDeck: ["d1", "d2"], occupation: "teacher" } })
    .where(eq(profiles.accountId, m.id));
  return m;
};

describe.skipIf(!HAS_DB)("R1: dating intents only with the romance_data consent", () => {
  it("the welcome answer and the dating questions save nothing before consent", async () => {
    const m = await createMember();
    await req("/onboarding/welcome", { cookie: m.cookie, form: { mode: "dating" } });
    const res = await req("/onboarding/dating", { cookie: `${m.cookie}; bkk_intent=dating`, form: { kids: "want" } });
    // D3-urgent: no "We hear you" screen any more; the welcome goes straight on.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/onboarding/quiz");
    expect(await intents(m.id)).toEqual([]);
    // The answers wait in a private, httpOnly cookie on the member's own device.
    expect(res.headers.get("set-cookie")).toMatch(/bkk_dating_pending=.*HttpOnly/i);
  });

  it("answers are dropped, never saved, when the member says no to Open to something more", async () => {
    const m = await createMember();
    const res = await req("/onboarding/dating", { cookie: `${m.cookie}; bkk_intent=dating`, form: { kids: "want" } });
    const pending = /bkk_dating_pending=[^;]+/.exec(res.headers.get("set-cookie") ?? "")![0];
    await notOnboarded(m);
    const r = await req("/onboarding/connections", { cookie: `${m.cookie}; bkk_intent=dating; ${pending}`, form: { relationship: "single", ageMin: "18", ageMax: "99" } });
    expect(r.headers.get("location")).toBe("/onboarding/wellbeing");
    expect(await intents(m.id)).toEqual([]);
    expect(r.headers.get("set-cookie")).toMatch(/bkk_dating_pending=;/);
    expect(await rows(m.id, "romance_data")).toEqual([false]);
  });

  it("answers are saved with the consent, prefs included", async () => {
    const m = await createMember();
    const res = await req("/onboarding/dating", { cookie: `${m.cookie}; bkk_intent=dating`, form: { reasons: ["long_term", "bogus"], challenges: ["safety"], kids: "want" } });
    const pending = /bkk_dating_pending=[^;]+/.exec(res.headers.get("set-cookie") ?? "")![0];
    await notOnboarded(m);
    await req("/onboarding/connections", {
      cookie: `${m.cookie}; bkk_intent=dating; ${pending}`,
      form: { relationship: "single", romanceOn: "1", romanceConsent: "1", romanceOpenTo: "everyone", ageMin: "18", ageMax: "99" },
    });
    const [row] = await intents(m.id);
    // D3-urgent: "why" and "what makes it hard" are never kept, even if an old form still sends them.
    expect([row.mode, row.reasons, row.challenges, row.prefs]).toEqual(["dating", [], [], { kids: "want" }]);
    expect(await rows(m.id, "romance_data")).toEqual([true]);
  });

  it("D3-urgent: the 💘 welcome no longer asks why or what makes dating hard, and links the safety net", async () => {
    const m = await createMember();
    const html = await (await req("/onboarding/dating?lang=en", { cookie: `${m.cookie}; bkk_intent=dating` })).text();
    expect(html).not.toContain('name="reasons"');
    expect(html).not.toContain('name="challenges"');
    expect(html).toContain('href="/safety"');
    expect(html).toContain('name="kids"');
  });

  it("dating preferences in Settings are not saved without the consent", async () => {
    const m = await createMember({ relationship: "single" });
    await db().insert(datingIntents).values({ accountId: m.id, mode: "dating", prefs: {} });
    await req("/settings/dating", { cookie: m.cookie, form: { kids: "want" } });
    expect((await intents(m.id))[0].prefs).toEqual({});
    await consent(m, "romance_data", true);
    await req("/settings/dating", { cookie: m.cookie, form: { kids: "want" } });
    expect((await intents(m.id))[0].prefs).toEqual({ kids: "want" });
  });
});

describe.skipIf(!HAS_DB)("R2: romance off or consent withdrawn deletes dating data at once", () => {
  const gone = async (m: Member) => {
    expect(await intents(m.id)).toEqual([]);
    const p = await prof(m.id);
    expect([p.romanceOn, p.genderIdentity, p.bio.datingGenderSelf, p.bio.datingDeck, p.bio.occupation]).toEqual([false, null, undefined, undefined, "teacher"]);
  };

  it("the one-tap switch", async () => {
    const m = await romantic();
    await req("/settings/quick", { cookie: m.cookie, form: { key: "romance", on: "0" } });
    await gone(m);
  });

  it("Connection preferences", async () => {
    const m = await romantic();
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", ageMin: "18", ageMax: "99" } });
    await gone(m);
  });

  it("withdrawing romance_data in the Privacy Center", async () => {
    const m = await romantic();
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    await gone(m);
    expect((await rows(m.id, "romance_data")).at(-1)).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("R3: consent rows for relationship status and the private gender", () => {
  it("giving them records a yes, clearing them a no, and saving again adds nothing", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    await notOnboarded(m);
    await req("/onboarding/connections", { cookie: m.cookie, form: { relationship: "single", gender: "woman", ageMin: "18", ageMax: "99" } });
    expect(await rows(m.id, "relationship_data")).toEqual([true]);
    expect(await rows(m.id, "gender_data")).toEqual([true]);
    await db().update(profiles).set({ onboardedAt: new Date() }).where(eq(profiles.accountId, m.id));
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", gender: "woman", ageMin: "18", ageMax: "99" } });
    expect(await rows(m.id, "relationship_data")).toEqual([true]);
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "prefer_not", ageMin: "18", ageMax: "99" } });
    expect(await rows(m.id, "relationship_data")).toEqual([true, false]);
    expect(await rows(m.id, "gender_data")).toEqual([true, false]);
  });

  it("a status first given in Settings records the consent too", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "married", ageMin: "18", ageMax: "99" } });
    expect(await rows(m.id, "relationship_data")).toEqual([true]);
  });
});
