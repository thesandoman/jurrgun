/**
 * Settings: profile, connections, Privacy Center, export, deactivation, password.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { ENV, HAS_DB, TEST_PASSWORD, createMember, db, req } from "./helpers";
import app from "../src/index";
import { accounts, auditLog, consents, profiles, pulseQuestions, pulseResponses, sessions } from "../src/schema";
import { newId } from "../src/lib/crypto";

const baseProfile = {
  nickname: "Mint",
  district: "bang_rak",
  languages: ["th", "en"],
  interests: ["food"],
  intents: ["friends"],
  locale: "th",
};

async function profileOf(id: string) {
  const [p] = await db().select().from(profiles).where(eq(profiles.accountId, id));
  return p;
}

async function latestConsent(id: string, category: string) {
  const [row] = await db()
    .select()
    .from(consents)
    .where(and(eq(consents.accountId, id), eq(consents.category, category)))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return row;
}

describe.skipIf(!HAS_DB)("settings", () => {
  it("redirects signed-out visitors to login", async () => {
    for (const path of ["/settings", "/settings/profile", "/settings/privacy", "/settings/privacy/export", "/settings/password"]) {
      const r = await req(path);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toMatch(/^\/login\?next=/);
    }
  });

  it("shows the hub with my profile", async () => {
    const m = await createMember({ nickname: "Hubby" });
    const r = await req("/settings", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Hubby");
    expect(html).toContain('action="/logout"');
    expect(html).toContain("/settings/privacy");
  });

  it("edits the profile and validates input", async () => {
    const m = await createMember({ romanceOn: true, relationship: "single", genderIdentity: "woman", romanceOpenTo: "everyone" });
    expect((await req("/settings/profile", { cookie: m.cookie })).status).toBe(200);

    let r = await req("/settings/profile", { cookie: m.cookie, form: { ...baseProfile, nickname: "" } });
    expect(r.status).toBe(400);
    r = await req("/settings/profile", { cookie: m.cookie, form: { ...baseProfile, district: "atlantis" } });
    expect(r.status).toBe(400);
    r = await req("/settings/profile", { cookie: m.cookie, form: { ...baseProfile, interests: [] } });
    expect(r.status).toBe(400);
    r = await req("/settings/profile", { cookie: m.cookie, form: { ...baseProfile, headline: "x".repeat(61) } });
    expect(r.status).toBe(400);

    r = await req("/settings/profile", {
      cookie: m.cookie,
      form: { ...baseProfile, nickname: "Mint2", district: "chatuchak", interests: ["art", "bogus"], intents: ["explore"], newcomer: "1", locale: "en", headline: "Chatuchak market fan", occupation: "other", occupationOther: "Drone pilot" },
    });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/settings?notice=saved");
    const p = await profileOf(m.id);
    expect(p.nickname).toBe("Mint2");
    expect(p.district).toBe("chatuchak");
    expect(p.interests).toEqual(["art"]);
    expect(p.newcomer).toBe(true);
    expect(p.locale).toBe("en");
    expect((p.bio as { headline?: string }).headline).toBe("Chatuchak market fan");
    expect(p.bio).toMatchObject({ occupation: "other", occupationOther: "Drone pilot" });
    // Romance intent preserved while romance mode is on.
    expect(p.intents).toEqual(["explore", "romance"]);
  });

  it("validates profile photos (type and size) before storing anything", async () => {
    const m = await createMember();
    const send = (file: File) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(baseProfile)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
      fd.append("photo", file);
      return app.request("/settings/profile", { method: "POST", headers: { cookie: m.cookie }, body: fd }, ENV);
    };
    expect((await send(new File(["hello"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect((await send(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }))).status).toBe(400);
    expect((await profileOf(m.id)).photoKey).toBeNull();
  });

  it("switching to married clears the romance fields", async () => {
    const m = await createMember({ relationship: "single", romanceOn: true, genderIdentity: "man", romanceOpenTo: ["woman"] });
    expect((await req("/settings/connections", { cookie: m.cookie })).status).toBe(200);
    const r = await req("/settings/connections", { cookie: m.cookie, form: { relationship: "married", ageMin: "25", ageMax: "40", romanceOn: "1", romanceConsent: "1" } });
    expect(r.headers.get("location")).toBe("/settings/connections?notice=saved");
    const p = await profileOf(m.id);
    expect(p.relationship).toBe("married");
    expect(p.romanceOn).toBe(false);
    expect(p.genderIdentity).toBeNull();
    expect(p.romanceOpenTo).toBeNull();
    expect(p.intents).not.toContain("romance");
    expect(p.ageMin).toBe(25);
    expect((await latestConsent(m.id, "romance_data")).granted).toBe(false);
  });

  it("refuses switching to Single twice within 30 days", async () => {
    const m = await createMember({ relationship: "married" });
    let r = await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single" } });
    expect(r.status).toBe(302);
    r = await req("/settings/connections", { cookie: m.cookie, form: { relationship: "relationship" } });
    expect(r.status).toBe(302);
    r = await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single" } });
    expect(r.status).toBe(400);
    expect((await profileOf(m.id)).relationship).toBe("relationship");
  });

  it("turns romance on with consent and syncs the intent", async () => {
    const m = await createMember({ relationship: "single" });
    let r = await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", romanceOn: "1" } });
    expect(r.status).toBe(400);
    r = await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", romanceOn: "1", romanceConsent: "1", genderIdentity: "non-binary", romanceOpenTo: "everyone" } });
    expect(r.status).toBe(302);
    const p = await profileOf(m.id);
    expect(p.romanceOn).toBe(true);
    expect(p.intents).toContain("romance");
    expect((await latestConsent(m.id, "romance_data")).granted).toBe(true);
  });

  it("privacy toggles append consent rows and the page shows the latest state", async () => {
    const m = await createMember({ research: true });
    let page = await (await req("/settings/privacy", { cookie: m.cookie })).text();
    expect(page).toMatch(/name="consent_research" value="1" checked/);
    const before = await db().select().from(consents).where(eq(consents.accountId, m.id));

    // Withdraw research + notifications, keep personalization.
    let r = await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1" } });
    expect(r.headers.get("location")).toBe("/settings/privacy?notice=saved");
    const after = await db().select().from(consents).where(eq(consents.accountId, m.id));
    expect(after.length).toBe(before.length + 2);
    expect((await latestConsent(m.id, "research")).granted).toBe(false);
    expect((await latestConsent(m.id, "notifications")).granted).toBe(false);
    expect((await latestConsent(m.id, "service")).granted).toBe(true); // required: unchanged
    page = await (await req("/settings/privacy", { cookie: m.cookie })).text();
    expect(page).not.toMatch(/name="consent_research" value="1" checked/);
    expect(page).not.toContain('name="consent_service"');

    // Grant research again: a third row for it, old rows untouched.
    await new Promise((res) => setTimeout(res, 5));
    r = await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_research: "1" } });
    expect((await latestConsent(m.id, "research")).granted).toBe(true);
    const research = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "research")));
    expect(research.length).toBe(3);
  });

  it("withdrawing romance data switches romance mode off", async () => {
    const m = await createMember({ relationship: "single" });
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", romanceOn: "1", romanceConsent: "1", genderIdentity: "woman", romanceOpenTo: "everyone" } });
    const page = await (await req("/settings/privacy", { cookie: m.cookie })).text();
    expect(page).toContain('name="consent_romance_data"');
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    const p = await profileOf(m.id);
    expect(p.romanceOn).toBe(false);
    expect(p.genderIdentity).toBeNull();
    expect(p.intents).not.toContain("romance");
    expect((await latestConsent(m.id, "romance_data")).granted).toBe(false);
  });

  it("exports my data without secrets", async () => {
    const m = await createMember({ research: true, nickname: "Exporter" });
    const qid = newId();
    await db().insert(pulseQuestions).values({ id: qid, promptTh: "ทดสอบ", promptEn: "Export test", kind: "text", status: "archived", createdBy: "test" });
    await db().insert(pulseResponses).values({ id: newId(), questionId: qid, researchId: m.researchId, answer: "hello pulse" });
    const r = await req("/settings/privacy/export", { cookie: m.cookie });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename=/);
    const text = await r.text();
    const data = JSON.parse(text);
    expect(data.account.username).toBe(m.username);
    expect(data.profile.nickname).toBe("Exporter");
    expect(data.consents.length).toBeGreaterThanOrEqual(5);
    expect(data.cityPulse.answers.map((a: { answer: unknown }) => a.answer)).toContain("hello pulse");
    expect(text).not.toMatch(/password|salt/i);
    expect(text).not.toContain(m.researchId);
  });

  it("deactivation needs confirmation, cuts researchId, ends sessions and blocks login", async () => {
    const m = await createMember({ research: true });
    let r = await req("/settings/deactivate", { cookie: m.cookie, form: { confirm: "" } });
    expect(r.status).toBe(400);

    r = await req("/settings/deactivate", { cookie: m.cookie, form: { confirm: "1" } });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/?notice=deactivated");
    expect(r.headers.get("set-cookie") ?? "").toMatch(/bkk_sid=;/);
    const [a] = await db().select().from(accounts).where(eq(accounts.id, m.id));
    expect(a.status).toBe("deactivated");
    expect(a.deactivatedAt).not.toBeNull();
    expect(a.researchId).toBeNull();
    expect(await db().select().from(sessions).where(eq(sessions.accountId, m.id))).toHaveLength(0);
    const logged = await db().select().from(auditLog).where(and(eq(auditLog.actor, m.id), eq(auditLog.action, "account.deactivated")));
    expect(logged).toHaveLength(1);

    r = await req("/settings", { cookie: m.cookie });
    expect(r.headers.get("location")).toMatch(/^\/login/);
    r = await req("/login", { form: { username: m.username, password: TEST_PASSWORD } });
    expect(r.status).toBe(403);
  });

  it("changes the password only with the right current password", async () => {
    const m = await createMember();
    expect((await req("/settings/password", { cookie: m.cookie })).status).toBe(200);
    let r = await req("/settings/password", { cookie: m.cookie, form: { current: "wrongwrong", password: "newpassword1", confirm: "newpassword1" } });
    expect(r.status).toBe(400);
    r = await req("/settings/password", { cookie: m.cookie, form: { current: TEST_PASSWORD, password: "short", confirm: "short" } });
    expect(r.status).toBe(400);
    r = await req("/settings/password", { cookie: m.cookie, form: { current: TEST_PASSWORD, password: "newpassword1", confirm: "different12" } });
    expect(r.status).toBe(400);
    r = await req("/settings/password", { cookie: m.cookie, form: { current: TEST_PASSWORD, password: "newpassword1", confirm: "newpassword1" } });
    expect(r.headers.get("location")).toBe("/settings?notice=password_changed");
    // Still signed in here; old password no longer works, new one does.
    expect((await req("/settings", { cookie: m.cookie })).status).toBe(200);
    expect((await req("/login", { form: { username: m.username, password: TEST_PASSWORD } })).status).toBe(400);
    expect((await req("/login", { form: { username: m.username, password: "newpassword1" } })).status).toBe(302);
  });
});
