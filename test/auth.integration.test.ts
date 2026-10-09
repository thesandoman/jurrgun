/**
 * Sign-up → onboarding → member pages, against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, db, req } from "./helpers";
import { accounts, profiles } from "../src/schema";
import { randomToken } from "../src/lib/crypto";

const cookieFrom = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

describe.skipIf(!HAS_DB)("sign-up and onboarding", () => {
  it("creates an account, onboards through every step, and lands on events", async () => {
    const username = `u_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const signup = await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1" } });
    expect(signup.status).toBe(302);
    expect(signup.headers.get("location")).toBe("/onboarding");
    const cookie = cookieFrom(signup);
    expect(cookie).toMatch(/^bkk_sid=/);

    expect((await req("/events", { cookie })).headers.get("location")).toBe("/onboarding");

    // New order: welcome → quiz (skippable) → basics.
    expect((await req("/onboarding", { cookie })).headers.get("location")).toBe("/onboarding/welcome");
    const skip = await req("/onboarding/quiz/skip", { cookie, method: "POST" });
    expect(skip.headers.get("location")).toBe("/onboarding/basics");
    expect(skip.headers.get("set-cookie")).toContain("bkk_quiz_skip=1");
    expect((await req("/onboarding", { cookie: `${cookie}; bkk_quiz_skip=1` })).headers.get("location")).toBe("/onboarding/basics");

    const under18 = await req("/onboarding/basics", { cookie, form: { nickname: "Kid", birthDate: "2015-01-01", district: "bang_rak", livesInBangkok: "1" } });
    expect(under18.status).toBe(400);

    let r = await req("/onboarding/basics", { cookie, form: { nickname: "Ploy", birthDate: "1997-03-04", district: "bang_rak", livesInBangkok: "1" } });
    expect(r.headers.get("location")).toBe("/onboarding/privacy");

    r = await req("/onboarding/privacy", { cookie, form: { consent_service: "1", consent_safety: "1" } });
    expect(r.status).toBe(400); // code of conduct not accepted
    r = await req("/onboarding/privacy", { cookie, form: { consent_service: "1", consent_safety: "1", consent_research: "1", conduct: "1" } });
    expect(r.headers.get("location")).toBe("/onboarding/you");

    r = await req("/onboarding/you", { cookie, form: { languages: ["th", "en"], interests: ["food", "art"], intents: ["friends"] } });
    expect(r.headers.get("location")).toBe("/onboarding/connections");

    // Romance on without consent is refused; married can never turn it on.
    r = await req("/onboarding/connections", { cookie, form: { relationship: "single", romanceOn: "1", ageMin: "20", ageMax: "40" } });
    expect(r.status).toBe(400);
    r = await req("/onboarding/connections", { cookie, form: { relationship: "married", romanceOn: "1", romanceConsent: "1", genderIdentity: "woman", romanceOpenTo: "everyone" } });
    expect(r.headers.get("location")).toBe("/onboarding/wellbeing");

    const [acct] = await db().select().from(accounts).where(eq(accounts.username, username));
    const [prof] = await db().select().from(profiles).where(eq(profiles.accountId, acct.id));
    expect(prof.romanceOn).toBe(false);
    expect(prof.genderIdentity).toBeNull();

    r = await req("/onboarding/wellbeing", { cookie, form: { q1: "2", q2: "1", q3: "1" } });
    expect(r.headers.get("location")).toBe("/events?notice=welcome");
  });

  it("rejects a wrong password with the same message as an unknown user", async () => {
    // A fresh name each run, so login throttling from earlier runs can't interfere.
    const nobody = `nobody_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const r1 = await req("/login", { form: { username: nobody, password: "whatever12" } });
    const r2 = await req("/login", { form: { username: nobody, password: "x" } });
    expect(r1.status).toBe(400);
    expect(await r1.text()).toContain("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    expect(r2.status).toBe(400);
  });

  it("refuses a duplicate username", async () => {
    const username = `d_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1" } });
    const again = await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1" } });
    expect(again.status).toBe(400);
  });

  it("refuses cross-site form posts", async () => {
    const { default: app } = await import("../src/index");
    const res = await app.request("/login", { method: "POST", headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });
});
