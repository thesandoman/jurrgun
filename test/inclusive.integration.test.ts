/** Settings for women-only and orientation; the women-only RSVP gate; dating details on a card. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { events, profiles } from "../src/schema";

const prof = async (id: string) => (await db().select().from(profiles).where(eq(profiles.accountId, id)))[0];

describe.skipIf(!HAS_DB)("inclusive dating and women-only spaces", () => {
  it("saves gender and women-only privately; only a woman can switch it on", async () => {
    const [w, m] = await Promise.all([createMember(), createMember()]);
    await req("/settings/connections", { cookie: w.cookie, form: { relationship: "prefer_not", ageMin: "18", ageMax: "99", gender: "woman", womenOnly: "1" } });
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "prefer_not", ageMin: "18", ageMax: "99", gender: "man", womenOnly: "1" } });
    expect((await prof(w.id)).womenOnly).toBe(true);
    expect((await prof(m.id)).womenOnly).toBe(false);
    expect((await prof(m.id)).gender).toBe("man");
  });

  it("keeps orientation only while romance is on", async () => {
    const a = await createMember({ relationship: "single" });
    const on = { relationship: "single", ageMin: "18", ageMax: "99", romanceOn: "1", romanceConsent: "1", genderIdentity: "woman", romanceOpenTo: ["everyone"], orientation: "bi", orientationOpenTo: ["lesbian", "bi", "nope"], showDatingPrefs: "1" };
    await req("/settings/connections", { cookie: a.cookie, form: on });
    let p = await prof(a.id);
    expect([p.orientation, p.orientationOpenTo, p.showDatingPrefs]).toEqual(["bi", ["lesbian", "bi"], true]);
    await req("/settings/connections", { cookie: a.cookie, form: { relationship: "single", ageMin: "18", ageMax: "99" } });
    p = await prof(a.id);
    expect([p.orientation, p.orientationOpenTo, p.showDatingPrefs]).toEqual([null, null, false]);
  });

  it("refuses a women-only RSVP from anyone else", async () => {
    const [w, m] = await Promise.all([createMember(), createMember()]);
    await db().update(profiles).set({ gender: "woman" }).where(eq(profiles.accountId, w.id));
    const id = newId();
    const startsAt = new Date(Date.now() + 9 * 86_400_000);
    await db().insert(events).values({ id, title: "Women's run", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Park", district: "bang_rak", capacity: 10, status: "published", createdBy: "t", tags: ["women_only"] });
    expect((await req(`/events/${id}/rsvp`, { cookie: m.cookie, form: { rhythmOk: "1" } })).status).toBe(403);
    expect((await req(`/events/${id}/rsvp`, { cookie: w.cookie, form: { rhythmOk: "1" } })).status).toBe(302);
  });

  it("quick switches on Me: one tap pauses, and women-only needs the right gender", async () => {
    const [w, m] = await Promise.all([createMember(), createMember()]);
    await db().update(profiles).set({ gender: "non-binary" }).where(eq(profiles.accountId, w.id));
    const html = await (await req("/settings", { cookie: `${w.cookie}; lang=en` })).text();
    expect(html).toContain("Quick switches");
    expect(html).toContain("Women &amp; non-binary only");
    expect((await req("/settings/quick", { cookie: w.cookie, form: { key: "pause", on: "1" } })).headers.get("location")).toBe("/settings?notice=saved");
    expect((await prof(w.id)).pausedUntil).not.toBeNull();
    await req("/settings/quick", { cookie: w.cookie, form: { key: "womenOnly", on: "1" } });
    await req("/settings/quick", { cookie: m.cookie, form: { key: "womenOnly", on: "1" } });
    expect((await prof(w.id)).womenOnly).toBe(true);
    expect((await prof(m.id)).womenOnly).toBe(false);
  });
});
