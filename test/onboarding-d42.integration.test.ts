/**
 * D42: fewer screens before the first event. About-you moved to after the
 * first RSVP ("Help your table get to know you"); the private settings can be
 * skipped; members partway through the old order still get through.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { consents, events, profiles, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

describe.skipIf(!HAS_DB)("onboarding after D42", () => {
  it("basics and privacy are one screen each, and privacy leads to the private settings", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const basics = await (await req("/onboarding/basics?lang=en", { cookie: m.cookie })).text();
    expect(basics.match(/class="flow-step /g)).toHaveLength(1);
    const privacy = await (await req("/onboarding/privacy?lang=en", { cookie: m.cookie })).text();
    expect(privacy.match(/class="flow-step /g)).toHaveLength(1);
    // Every consent is still asked, with the PDPA notice and code of conduct linked.
    for (const k of ["consent_service", "consent_safety", "conduct", "consent_personalization", "consent_research", "consent_notifications", 'href="/privacy"', 'href="/code-of-conduct"']) expect(privacy).toContain(k);
  });

  it("a member with consents but no interests (partway through the old order) goes on to the private settings", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null, interests: [] }).where(eq(profiles.accountId, m.id));
    expect((await req("/onboarding", { cookie: m.cookie })).headers.get("location")).toBe("/onboarding/connections");
  });

  it("Skip for now on the private settings keeps the defaults and finishes onboarding", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null, interests: [], relationship: "prefer_not" }).where(eq(profiles.accountId, m.id));
    await db().delete(consents).where(eq(consents.accountId, m.id));
    await db().insert(consents).values([
      { id: crypto.randomUUID(), accountId: m.id, category: "service", granted: true, version: "t" },
      { id: crypto.randomUUID(), accountId: m.id, category: "safety", granted: true, version: "t" },
    ]);
    const r = await req("/onboarding/connections", { cookie: m.cookie, form: { skip: "1", relationship: "single", romanceOn: "1" } });
    expect(r.headers.get("location")).toBe("/onboarding/wellbeing");
    expect((await req("/onboarding/wellbeing", { cookie: m.cookie })).headers.get("location")).toBe("/guide");
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.onboardedAt).not.toBeNull();
    expect(p.relationship).toBe("prefer_not");
    expect(p.romanceOn).toBe(false);
  });

  it("the private settings keep pronouns given in the table intro", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null, pronouns: "they/them", showPronouns: true }).where(eq(profiles.accountId, m.id));
    await req("/onboarding/connections", { cookie: m.cookie, form: { relationship: "prefer_not", ageMin: "18", ageMax: "99" } });
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.pronouns).toBe("they/them");
    expect(p.showPronouns).toBe(true);
  });

  it("the table intro works after onboarding, saves, and returns to where it was opened", async () => {
    const m = await createMember();
    await db().update(profiles).set({ interests: [] }).where(eq(profiles.accountId, m.id));
    const page = await req("/onboarding/you?lang=en&next=%2Fme%2Fevents", { cookie: m.cookie });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Skip for now");
    const r = await req("/onboarding/you?next=%2Fme%2Fevents", { cookie: m.cookie, form: { languages: ["th", "en"], interests: ["food", "art"], pronouns: "she/her", showPronouns: "1" } });
    expect(r.headers.get("location")).toBe("/me/events");
    const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.interests).toEqual(["food", "art"]);
    expect(p.pronouns).toBe("she/her");
    expect(p.showPronouns).toBe(true);
  });

  it("the table intro never redirects off the site", async () => {
    const m = await createMember();
    for (const next of ["https://evil.example", "//evil.example", "/\\\\evil.example"]) {
      const r = await req(`/onboarding/you?next=${encodeURIComponent(next)}`, { cookie: m.cookie, form: { languages: ["th"], interests: ["food"] } });
      expect(r.headers.get("location")).toBe("/events");
    }
  });

  it("asks on the RSVP confirmation and the pass until interests are picked, then stops", async () => {
    const m = await createMember();
    await db().update(profiles).set({ interests: [] }).where(eq(profiles.accountId, m.id));
    const id = newId();
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    await db().insert(events).values({ id, title: "Intro walk", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Park", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" });
    await db().insert(registrations).values({ id: newId(), eventId: id, accountId: m.id, status: "confirmed", passToken: randomToken(16) });
    for (const path of [`/events/${id}?notice=rsvp_confirmed&lang=en`, `/me/events/${id}/pass?lang=en`]) {
      const html = await (await req(path, { cookie: m.cookie })).text();
      expect(html).toContain(`class="card table-intro"`);
    }
    await db().update(profiles).set({ interests: ["food"] }).where(eq(profiles.accountId, m.id));
    for (const path of [`/events/${id}?lang=en`, `/me/events/${id}/pass?lang=en`]) {
      expect(await (await req(path, { cookie: m.cookie })).text()).not.toContain(`class="card table-intro"`);
    }
  });
});
