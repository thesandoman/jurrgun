/**
 * The legal review's safe fixes (owner, 16 Oct 2026) against the running app
 * and local Postgres: the Terms box at sign-up and in onboarding, the card on
 * Me for members who joined before, the consent centre's three parts, and
 * withdrawing gender and relationship status.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req } from "./helpers";
import { accounts, consents, profiles } from "../src/schema";
import { randomToken } from "../src/lib/crypto";
import { TERMS_CONSENT, TERMS_VERSION } from "../src/content/privacy";

const latest = async (id: string, category: string) =>
  (await db().select().from(consents).where(and(eq(consents.accountId, id), eq(consents.category, category))).orderBy(desc(consents.createdAt)).limit(1))[0];
const uname = () => `lr_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
/** A member who joined before the Terms box (or before the Terms last changed). */
const withoutTerms = async (id: string) => db().delete(consents).where(and(eq(consents.accountId, id), eq(consents.category, TERMS_CONSENT)));

describe.skipIf(!HAS_DB)("the Terms box at sign-up", () => {
  it("sign-up fails without it and makes no account", async () => {
    const username = uname();
    const r = await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1" } });
    expect(r.status).toBe(400);
    expect(await db().select().from(accounts).where(eq(accounts.username, username))).toHaveLength(0);
    // What was typed comes back (the box stays unticked).
    expect(await r.text()).toContain(`value="${username}"`);
  });

  it("ticked, it records a terms row with the Terms version, and onboarding doesn't ask again", async () => {
    const username = uname();
    const r = await req("/signup", { form: { username, password: "longenough1", confirm: "longenough1", terms: "1" } });
    expect(r.status).toBe(302);
    const [acct] = await db().select().from(accounts).where(eq(accounts.username, username));
    const row = await latest(acct.id, TERMS_CONSENT);
    expect(row.granted).toBe(true);
    expect(row.version).toBe(TERMS_VERSION);
    const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
    await req("/onboarding/basics", { cookie, form: { nickname: "Ploy", birthDate: "1997-03-04", district: "bang_rak", residency: "lives" } });
    const privacy = await (await req("/onboarding/privacy?lang=en", { cookie })).text();
    expect(privacy).not.toContain('name="terms"');
  });

  it("Google and LINE sign-ups agree in onboarding: required there, then recorded", async () => {
    const m = await createMember();
    await withoutTerms(m.id);
    await db().delete(consents).where(eq(consents.accountId, m.id));
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const page = await (await req("/onboarding/privacy?lang=en", { cookie: m.cookie })).text();
    expect(page).toMatch(/<input[^>]*name="terms"[^>]*required/);
    let r = await req("/onboarding/privacy", { cookie: m.cookie, form: { conduct: "1" } });
    expect(r.status).toBe(400);
    expect(await latest(m.id, TERMS_CONSENT)).toBeUndefined();
    r = await req("/onboarding/privacy", { cookie: m.cookie, form: { conduct: "1", terms: "1" } });
    expect(r.headers.get("location")).toBe("/onboarding/connections");
    expect((await latest(m.id, TERMS_CONSENT)).version).toBe(TERMS_VERSION);
  });

  it("onboarding records service and safety as acknowledgements without any box for them", async () => {
    const m = await createMember();
    await db().delete(consents).where(eq(consents.accountId, m.id));
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const r = await req("/onboarding/privacy", { cookie: m.cookie, form: { conduct: "1", terms: "1" } });
    expect(r.headers.get("location")).toBe("/onboarding/connections");
    expect((await latest(m.id, "service")).granted).toBe(true);
    expect((await latest(m.id, "safety")).granted).toBe(true);
    expect((await latest(m.id, "research")).granted).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("members who joined before the Terms box", () => {
  it("see one small card on Me, can still use the app, and it goes once they agree", async () => {
    const m = await createMember();
    await withoutTerms(m.id);
    let me = await req("/settings?lang=en", { cookie: m.cookie });
    expect(me.status).toBe(200);
    let html = await me.text();
    expect(html).toContain('action="/settings/terms"');
    expect(html).toContain("Updated Terms of service");
    // Not a lock: other pages still open.
    expect((await req("/events", { cookie: m.cookie })).status).toBe(200);
    const r = await req("/settings/terms", { cookie: m.cookie, method: "POST", form: { agree: "1" } });
    expect(r.headers.get("location")).toBe("/settings?notice=saved");
    expect((await latest(m.id, TERMS_CONSENT)).version).toBe(TERMS_VERSION);
    html = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(html).not.toContain('action="/settings/terms"');
  });

  it("an older Terms version brings the card back", async () => {
    const m = await createMember();
    await withoutTerms(m.id);
    await db().insert(consents).values({ id: crypto.randomUUID(), accountId: m.id, category: TERMS_CONSENT, granted: true, version: "terms-2020-01-01" });
    expect(await (await req("/settings", { cookie: m.cookie })).text()).toContain('action="/settings/terms"');
  });
});

describe.skipIf(!HAS_DB)("the consent centre", () => {
  it("shows service and safety as needed to run the app with no switch, and the Terms as a dated record", async () => {
    const m = await createMember();
    const html = await (await req("/settings/consents", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain("Needed to run the app (not a consent)");
    expect(html).toContain("Consents you choose");
    expect(html).toContain("Agreements on record");
    for (const key of ["service", "safety", "terms", "guide"]) expect(html).not.toContain(`name="consent_${key}"`);
    expect(html).toMatch(/Acknowledged \d{1,2} [A-Z][a-z]{2} \d{4}/);
    expect(html).toMatch(/Agreed \d{1,2} [A-Z][a-z]{2} \d{4} · Version of 16 October 2026/);
    // Each switch says what switching it off does.
    expect(html).toContain("If you turn it off, we delete your past answers");
    const th = await (await req("/settings/consents", { cookie: `${m.cookie}; lang=th` })).text();
    expect(th).toContain("จำเป็นต่อการให้บริการ (ไม่ใช่การขอความยินยอม)");
    expect(th).not.toContain("ไม่ระบุตัวตน");
  });

  it("withdraws private gender: cleared, women-only off, a no row", async () => {
    const m = await createMember();
    await db().update(profiles).set({ gender: "woman", womenOnly: true }).where(eq(profiles.accountId, m.id));
    await db().insert(consents).values({ id: crypto.randomUUID(), accountId: m.id, category: "gender_data", granted: true, version: "test" });
    const html = await (await req("/settings/consents", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toMatch(/name="consent_gender_data" value="1" checked/);
    expect(html).toContain("If you withdraw gender, we clear it, and you can&#39;t choose women-only tables.");
    // Saving with the switch left on keeps it.
    await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1", consent_gender_data: "1" } });
    expect((await latest(m.id, "gender_data")).granted).toBe(true);
    // Switched off: withdrawn.
    await new Promise((res) => setTimeout(res, 5));
    await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "gender_data")).granted).toBe(false);
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.gender).toBeNull();
    expect(p.womenOnly).toBe(false);
    // Off now: no switch, a link to give it again.
    const after = await (await req("/settings/consents", { cookie: `${m.cookie}; lang=en` })).text();
    expect(after).not.toContain('name="consent_gender_data"');
    expect(after).toContain('href="/settings/connections"');
  });

  it("withdraws relationship status: back to prefer not to say, a no row", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single" } });
    expect((await latest(m.id, "relationship_data")).granted).toBe(true);
    expect(await (await req("/settings/consents", { cookie: m.cookie })).text()).toMatch(/name="consent_relationship_data" value="1" checked/);
    await new Promise((res) => setTimeout(res, 5));
    await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "relationship_data")).granted).toBe(false);
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.relationship).toBe("prefer_not");
  });

  it("the Privacy Center's older form never withdraws gender or relationship status", async () => {
    const m = await createMember();
    await db().update(profiles).set({ gender: "woman" }).where(eq(profiles.accountId, m.id));
    await db().insert(consents).values({ id: crypto.randomUUID(), accountId: m.id, category: "gender_data", granted: true, version: "test" });
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "gender_data")).granted).toBe(true);
  });
});
