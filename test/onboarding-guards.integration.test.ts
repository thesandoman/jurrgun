/**
 * Onboarding can't be finished early (consents and interests come first) and
 * its steps close once a member is onboarded, so locked fields stay locked.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { consents, profiles } from "../src/schema";

describe.skipIf(!HAS_DB)("onboarding guards", () => {
  it("won't finish onboarding from the last step before consents are given", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    await db().delete(consents).where(eq(consents.accountId, m.id));

    for (const r of [await req("/onboarding/wellbeing", { cookie: m.cookie }), await req("/onboarding/wellbeing", { cookie: m.cookie, form: { skip: "1" } })]) {
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("/onboarding/privacy");
    }
    const [p] = await db().select({ onboardedAt: profiles.onboardedAt }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.onboardedAt).toBeNull();
  });

  it("lets people near, moving to or visiting Bangkok join, and still accepts the old checkbox", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const post = (form: Record<string, string>) => req("/onboarding/basics", { cookie: m.cookie, form: { nickname: "Lek", birthDate: "1995-05-05", district: "bang_rak", ...form } });
    expect((await post({ residency: "from_mars" })).status).toBe(400);
    for (const residency of ["nearby", "moving", "visiting", "passing", "lives"]) {
      const r = await post({ residency });
      expect(r.headers.get("location")).toBe("/onboarding/privacy");
      const [p] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, m.id));
      expect((p.bio as { residency?: string }).residency).toBe(residency);
    }
    expect((await post({ livesInBangkok: "1" })).headers.get("location")).toBe("/onboarding/privacy");
  });

  it("closes the steps after onboarding, so the birth date can't be rewritten", async () => {
    const m = await createMember({ birthDate: "1985-05-05" });
    const r = await req("/onboarding/basics", {
      cookie: m.cookie,
      form: { nickname: "Young", birthDate: "2001-01-01", district: "bang_rak", livesInBangkok: "1" },
    });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/events");
    const [p] = await db().select({ birthDate: profiles.birthDate, nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.birthDate).toBe("1985-05-05");
    expect(p.nickname).not.toBe("Young");
  });
});
