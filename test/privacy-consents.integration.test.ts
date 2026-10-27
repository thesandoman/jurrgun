/**
 * Privacy risk assessment R7 (design/reference/privacy-risk-assessment.md):
 * every consent offered is honoured. Personalization gates what seating, buddy
 * matching and the weekly plan read; notifications need a yes (no row is no)
 * and switching push off on the last device withdraws it; research withdrawal
 * deletes past answers, and a research_id exists only with research consent.
 */
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { createMember, db, ENV, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { accounts, consents, events, notifications, profiles, pulseQuestions, pulseResponses, pushSubscriptions, registrations, vibes, weeklyPlans, wellbeing } from "../src/schema";
import { loadAttendees } from "../src/services/events";
import { pairScore } from "../src/domain/buddy";
import { KIND_TOMORROW, runClock } from "../src/services/clock";
import { runRetention } from "../src/services/retention";

const HOUR = 3_600_000;
const day = new Date();
// 10:00 in Bangkok today: outside quiet hours whatever time the suite runs.
const NOW = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 3, 0, 0));
const say = (m: Member, category: string, granted: boolean, at = Date.now() + 1000) =>
  db().insert(consents).values({ id: newId(), accountId: m.id, category, granted, version: "test", createdAt: new Date(at) });
const history = async (id: string, category: string) =>
  (await db().select().from(consents).where(and(eq(consents.accountId, id), eq(consents.category, category))).orderBy(asc(consents.createdAt))).map((r) => r.granted);
const account = async (id: string) => (await db().select().from(accounts).where(eq(accounts.id, id)))[0];

describe.skipIf(!HAS_DB)("R7: personalization", () => {
  it("seating reads interests, styles and the Bangkok Type only with the consent", async () => {
    const [yes, no] = await Promise.all([createMember({ interests: ["food", "art"] }), createMember({ interests: ["food", "art"] })]);
    for (const m of [yes, no]) await db().insert(vibes).values({ accountId: m.id, vector: { energy: 1 }, archetype: "BDMN" });
    await say(no, "personalization", false);
    const people = await loadAttendees(db(), [yes.id, no.id]);
    const a = people.find((p) => p.accountId === yes.id)!;
    const b = people.find((p) => p.accountId === no.id)!;
    expect([a.interests, a.type, a.vibe]).toEqual([["food", "art"], "BDMN", { energy: 1 }]);
    expect([b.interests, b.socialStyles, b.type, b.vibe, b.university]).toEqual([[], [], null, null, null]);
    // What seating needs stays.
    expect(b.languages.length).toBeGreaterThan(0);
  });

  it("buddy matching scores only languages and home district without it", () => {
    const base = { languages: ["th"], district: "bang_rak", archetype: "BDMN" as const };
    const typed = pairScore({ ...base, accountId: "a" }, { ...base, accountId: "b", archetype: "CFSH" as const });
    const plain = pairScore({ ...base, accountId: "a", plain: true }, { ...base, accountId: "b", archetype: "CFSH" as const });
    expect(plain).toBe(3);
    expect(typed).not.toBe(plain);
    expect(pairScore({ ...base, accountId: "a", plain: true }, { ...base, accountId: "b", district: "dusit", languages: ["en"] })).toBeNull();
  });

  it("the weekly plan doesn't pick for interests without it", async () => {
    const m = await createMember({ district: "bang_rak", interests: ["food"] });
    await say(m, "personalization", false);
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    await db().insert(events).values({ id: newId(), title: "ตลาด", startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Market", district: "bang_rak", capacity: 10, status: "published", createdBy: "test", tags: ["food"], languages: ["th"] });
    await req("/plan", { cookie: m.cookie });
    const [plan] = await db().select().from(weeklyPlans).where(eq(weeklyPlans.accountId, m.id));
    expect(plan.picks.flatMap((p) => p.reasons).filter((r) => r.startsWith("likes:"))).toEqual([]);
  });
});

describe.skipIf(!HAS_DB)("R7: notifications", () => {
  it("no consent row means no reminder", async () => {
    const [yes, none] = await Promise.all([createMember(), createMember()]);
    await db().delete(consents).where(and(eq(consents.accountId, none.id), eq(consents.category, "notifications")));
    const id = newId();
    const startsAt = new Date(NOW.getTime() + 20 * HOUR);
    await db().insert(events).values({ id, title: `PRV-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
    for (const m of [yes, none]) await db().insert(registrations).values({ id: newId(), eventId: id, accountId: m.id, status: "confirmed", passToken: randomToken(18) });
    await runClock(ENV, NOW);
    const got = async (m: Member) => db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, KIND_TOMORROW)));
    expect(await got(yes)).toHaveLength(1);
    expect(await got(none)).toEqual([]);
  });

  it("switching push off on the last device withdraws the consent; another device keeps it", async () => {
    const m = await createMember();
    const endpoint = (n: number) => `https://fcm.googleapis.com/fcm/send/prv-${m.id}-${n}`;
    for (const n of [1, 2]) await db().insert(pushSubscriptions).values({ id: newId(), accountId: m.id, endpoint: endpoint(n), p256dh: "p", auth: "a" });
    await req("/settings/push/off", { cookie: m.cookie, json: { endpoint: endpoint(1) } });
    expect(await history(m.id, "notifications")).toEqual([true]);
    await req("/settings/push/off", { cookie: m.cookie, json: { endpoint: endpoint(2) } });
    expect(await history(m.id, "notifications")).toEqual([true, false]);
  });
});

describe.skipIf(!HAS_DB)("R7: research", () => {
  it("a new account has no research_id until it says yes to research", async () => {
    const username = `prv_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const r = await req("/signup", { form: { username, password: "a-long-password-1", confirm: "a-long-password-1", terms: "1", age: "1" } });
    const [acct] = await db().select().from(accounts).where(eq(accounts.username, username));
    expect(r.status).toBeLessThan(400);
    expect(acct.researchId).toBeNull();
  });

  it("onboarding privacy: a research yes issues one, a no doesn't", async () => {
    const [yes, no] = await Promise.all([createMember(), createMember()]);
    for (const [m, research] of [[yes, "1"], [no, ""]] as const) {
      await db().delete(consents).where(eq(consents.accountId, m.id));
      await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
      await req("/onboarding/privacy", { cookie: m.cookie, form: { conduct: "1", terms: "1", ...(research ? { consent_research: "1" } : {}) } });
    }
    expect((await account(yes.id)).researchId).not.toBeNull();
    expect((await account(no.id)).researchId).toBeNull();
  });

  it("withdrawing research deletes past City Pulse and wellbeing answers and cuts the id; a new yes gets a fresh one", async () => {
    const m = await createMember({ research: true });
    const qid = newId();
    await db().insert(pulseQuestions).values({ id: qid, promptTh: "ทดสอบ", promptEn: "Withdraw test", kind: "text", status: "archived", createdBy: "test" });
    await db().insert(pulseResponses).values({ id: newId(), questionId: qid, researchId: m.researchId, answer: "x" });
    await db().insert(wellbeing).values({ id: newId(), researchId: m.researchId, phase: "baseline", q1: 2, q2: 2, q3: 2 });
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect(await db().select().from(pulseResponses).where(eq(pulseResponses.researchId, m.researchId))).toEqual([]);
    expect(await db().select().from(wellbeing).where(eq(wellbeing.researchId, m.researchId))).toEqual([]);
    expect((await account(m.id)).researchId).toBeNull();
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1", consent_research: "1" } });
    const fresh = (await account(m.id)).researchId;
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(m.researchId);
  });

  it("retention cuts research ids (and their answers) held without research consent", async () => {
    const m = await createMember();
    const rid = newId();
    await db().update(accounts).set({ researchId: rid }).where(eq(accounts.id, m.id));
    await db().insert(wellbeing).values({ id: newId(), researchId: rid, phase: "baseline", q1: 1, q2: 1, q3: 1 });
    const kept = await createMember({ research: true });
    await runRetention(ENV, new Date());
    expect((await account(m.id)).researchId).toBeNull();
    expect(await db().select().from(wellbeing).where(eq(wellbeing.researchId, rid))).toEqual([]);
    expect((await account(kept.id)).researchId).toBe(kept.researchId);
  });
});

describe.skipIf(!HAS_DB)("card P2: consent history on /settings/consents", () => {
  it("shows every give and withdraw with its date and notice version, newest first", async () => {
    const m = await createMember();
    await db().insert(consents).values([
      { id: newId(), accountId: m.id, category: "research", granted: true, version: "notice-2026-10-16", createdAt: new Date("2026-10-16T05:00:00Z") },
      { id: newId(), accountId: m.id, category: "research", granted: false, version: "notice-2026-10-26", createdAt: new Date("2026-10-26T05:00:00Z") },
    ]);
    const html = await (await req("/settings/consents?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain('id="history"');
    const hist = html.slice(html.indexOf('id="history"'));
    expect(hist).toContain("Notice of 26 October 2026");
    expect(hist).toContain("Notice of 16 October 2026");
    expect(hist.indexOf("26 October 2026")).toBeLessThan(hist.indexOf("16 October 2026"));
  });
});
