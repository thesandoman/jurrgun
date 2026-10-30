/**
 * Inclusive identity fields: a self-described gender has somewhere to go (kept
 * private, dropped when another option is picked), and pronouns have quick picks.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { profiles } from "../src/schema";

const bioOf = async (id: string) => {
  const [p] = await db().select({ bio: profiles.bio, gender: profiles.gender }).from(profiles).where(eq(profiles.accountId, id));
  const bio = typeof p.bio === "string" ? JSON.parse(p.bio) : p.bio;
  return { gender: p.gender, genderSelf: (bio as { genderSelf?: string }).genderSelf };
};

describe.skipIf(!HAS_DB)("identity fields", () => {
  it("keeps a self-described gender privately, and drops it when another option is picked", async () => {
    const m = await createMember();
    const form = { relationship: "prefer_not", ageMin: "18", ageMax: "99" };
    await req("/settings/connections", { cookie: m.cookie, form: { ...form, gender: "self", genderSelf: "genderfluid" } });
    expect(await bioOf(m.id)).toEqual({ gender: "self", genderSelf: "genderfluid" });
    // Never on the profile, not even the preview of how others see it.
    expect(await (await req("/me/profile", { cookie: m.cookie })).text()).not.toContain("genderfluid");
    await req("/settings/connections", { cookie: m.cookie, form: { ...form, gender: "woman", genderSelf: "genderfluid" } });
    expect(await bioOf(m.id)).toEqual({ gender: "woman", genderSelf: undefined });
  });

  it("offers pronoun quick picks next to the pronoun box, in Settings (card D3: no longer in the table intro)", async () => {
    const m = await createMember();
    const html = await (await req("/settings/profile?lang=en", { cookie: m.cookie })).text();
    for (const p of ["she/her", "he/him", "they/them", "use my name"]) expect(html).toContain(`data-pronoun="${p}"`);
    expect(await (await req("/onboarding/you?lang=en", { cookie: m.cookie })).text()).not.toContain("data-pronoun=");
  });

  it("a self-described dating identity is kept privately while romance is on, and deleted with it", async () => {
    const m = await createMember({ relationship: "single" });
    const on = { relationship: "single", ageMin: "18", ageMax: "99", romanceOn: "1", romanceConsent: "1", genderIdentity: "self", datingGenderSelf: "two-spirit", romanceOpenTo: "everyone" };
    await req("/settings/connections", { cookie: m.cookie, form: on });
    const [a] = await db().select({ bio: profiles.bio, gi: profiles.genderIdentity }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(a.gi).toBe("self");
    expect((typeof a.bio === "string" ? JSON.parse(a.bio) : a.bio).datingGenderSelf).toBe("two-spirit");
    expect(await (await req("/me/profile", { cookie: m.cookie })).text()).not.toContain("two-spirit");
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", ageMin: "18", ageMax: "99" } });
    const [b] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, m.id));
    expect((typeof b.bio === "string" ? JSON.parse(b.bio) : b.bio).datingGenderSelf).toBeUndefined();
  });
});
