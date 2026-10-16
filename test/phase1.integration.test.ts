/** Phase 1 of the three-way review (owner-approved 2026-10-16). */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { profiles } from "../src/schema";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { joinBirthDate } from "../src/routes/onboarding";

describe("phase 1 rules", () => {
  it("one bottom layer per screen, dark mode on palette", () => {
    expect(A11Y_CSS).toContain("body:not(.fullmap-body) .view-switch{position:static");
    expect(A11Y_CSS).toContain("body:has(main .flow-bar) .tabbar,body:has(main .pf-save) .tabbar{display:none}");
    expect(A11Y_CSS).toContain("--love:#f0505c");
    expect(A11Y_CSS).not.toMatch(/--love:#ff6b78/);
  });
  it("birthday pickers join into a date", () => {
    expect(joinBirthDate("5", "3", "1996")).toBe("1996-03-05");
    expect(joinBirthDate("", "3", "1996")).toBe("");
  });
});

describe.skipIf(!HAS_DB)("phase 1 pages", () => {
  it("onboarding: the quiz starts at question 1 with \"1 of 4\"; basics has day, month and year", async () => {
    const m = await createMember();
    await db().delete(profiles).where(eq(profiles.accountId, m.id));
    const quiz = await (await req("/onboarding/quiz?lang=en", { cookie: m.cookie })).text();
    expect(quiz).toContain("1 of 4");
    expect(quiz).not.toContain("What&#39;s your Bangkok Type?");
    expect(quiz).toContain('data-span-total="18"');
    const welcome = await (await req("/onboarding/welcome?lang=en", { cookie: m.cookie })).text();
    expect(welcome).toContain("16 quick Bangkok moments");
    const basics = await (await req("/onboarding/basics?lang=th", { cookie: m.cookie })).text();
    for (const n of ["birthDay", "birthMonth", "birthYear"]) expect(basics).toContain(`name="${n}"`);
    expect(basics).toContain("2 จาก 4");
    const r = await req("/onboarding/basics", { cookie: m.cookie, form: { nickname: "Lek", birthDay: "5", birthMonth: "3", birthYear: "1996", district: "bang_rak", residency: "lives" } });
    expect(r.headers.get("location")).toBe("/onboarding/privacy");
    const [p] = await db().select({ birthDate: profiles.birthDate }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.birthDate).toBe("1996-03-05");
  });
});
