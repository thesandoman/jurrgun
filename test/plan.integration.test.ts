/** The weekly plan page: picks with reasons, accept, skip, pitch and join. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { connections, events, pitchJoins, planPitches, weeklyPlans } from "../src/schema";

describe.skipIf(!HAS_DB)("weekly plan", () => {
  it("makes two picks once a week, with reasons; accept goes to the event", async () => {
    const m = await createMember({ district: "bang_rak", interests: ["food"] });
    const id = newId();
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    await db().insert(events).values({ id, title: "ตลาดเช้า", titleEn: "Plan test food walk", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Market", district: "bang_rak", capacity: 10, status: "published", createdBy: "test", tags: ["food"], languages: ["th", "en"] });
    const html = await (await req("/plan", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain("This week&#39;s plan");
    const [plan] = await db().select().from(weeklyPlans).where(eq(weeklyPlans.accountId, m.id));
    expect(plan.picks.length).toBeGreaterThan(0);
    // Stable within the week.
    await req("/plan", { cookie: m.cookie });
    expect(await db().select().from(weeklyPlans).where(eq(weeklyPlans.accountId, m.id))).toHaveLength(1);
    const ref = plan.picks[0].ref;
    const r = await req("/plan/accept", { cookie: m.cookie, form: { ref } });
    expect(r.headers.get("location")).toMatch(/^\/events\/|^\/buddy$/);
    const [after] = await db().select().from(weeklyPlans).where(eq(weeklyPlans.id, plan.id));
    expect(after.status).toBe("accepted");
  });

  it("skip records a reason; pitches reach the circle, who can join", async () => {
    const [a, b, stranger] = await Promise.all([createMember(), createMember(), createMember()]);
    await req("/plan", { cookie: a.cookie });
    await req("/plan/skip", { cookie: a.cookie, form: { reason: "money" } });
    const [plan] = await db().select().from(weeklyPlans).where(eq(weeklyPlans.accountId, a.id));
    expect([plan.status, plan.skipReason]).toEqual(["skipped", "money"]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "friend", eventId: newId() });
    await req("/plan/pitch", { cookie: a.cookie, form: { what: "Pitch test: Sunday kayak", district: "bang_rak", when: "Sun 8am", audience: "circle" } });
    const [p] = await db().select().from(planPitches).where(eq(planPitches.accountId, a.id));
    expect(await (await req("/plan", { cookie: b.cookie })).text()).toContain("Pitch test: Sunday kayak");
    await req(`/plan/pitch/${p.id}/join`, { cookie: b.cookie, method: "POST" });
    await req(`/plan/pitch/${p.id}/join`, { cookie: stranger.cookie, method: "POST" });
    const joined = await db().select().from(pitchJoins).where(eq(pitchJoins.pitchId, p.id));
    expect(joined.map((j) => j.accountId)).toEqual([b.id]);
    expect(await (await req("/plan", { cookie: stranger.cookie })).text()).not.toContain("Pitch test: Sunday kayak");
  });
});
