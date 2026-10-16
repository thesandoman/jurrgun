/**
 * "Say hi first" and "Who finishes" (owner cards 10-16, migration 0023).
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, quizReach, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { cleanHello, HELLO_MAX, helloOpen, helloPrompt } from "../src/domain/hello";
import { biggestDrop, reachFunnel } from "../src/routes/admin/quiz-health";

const HOUR = 3_600_000;

describe("say hi first: rules", () => {
  it("opens 36 hours before and closes at the end", () => {
    const startsAt = new Date("2026-10-20T12:00:00Z");
    const endsAt = new Date("2026-10-20T15:00:00Z");
    expect(helloOpen({ startsAt, endsAt }, new Date("2026-10-18T23:00:00Z"))).toBe(false);
    expect(helloOpen({ startsAt, endsAt }, new Date("2026-10-19T01:00:00Z"))).toBe(true);
    expect(helloOpen({ startsAt, endsAt }, new Date("2026-10-20T15:00:00Z"))).toBe(false);
  });
  it("asks about food at food meetups, and keeps one tidy line", () => {
    expect(helloPrompt(["food"]).en).toMatch(/dish/);
    expect(helloPrompt(["walk"]).en).toMatch(/chat/);
    expect(cleanHello("  khao   soi,\n extra lime ")).toBe("khao soi, extra lime");
    expect(cleanHello("   ")).toBeNull();
    expect(cleanHello("x".repeat(200))!.length).toBe(HELLO_MAX);
  });
});

describe("who finishes: funnel", () => {
  it("adds up days, splits by segment and finds the biggest drop", () => {
    const rows = [
      { segment: "local", question: 0, reached: 30 },
      { segment: "local", question: 1, reached: 28 },
      { segment: "local", question: 2, reached: 27 },
      { segment: "local", question: 3, reached: 15 },
      { segment: "local", question: 99, reached: 14 },
      { segment: "newcomer", question: 1, reached: 5 },
    ];
    const all = reachFunnel(rows);
    expect(all).toMatchObject({ opened: 30, finished: 14 });
    expect(all.steps.find((x) => x.q === 1)?.reached).toBe(33);
    expect(reachFunnel(rows, "newcomer").steps).toEqual([{ q: 1, reached: 5 }]);
    expect(biggestDrop(reachFunnel(rows, "local"))).toEqual({ from: 2, to: 3, lost: 12 });
  });
});

describe.skipIf(!HAS_DB)("say hi first and quiz reach, end to end", () => {
  it("people going see each other's line; others don't", async () => {
    const [a, b, outsider] = await Promise.all([createMember(), createMember(), createMember()]);
    const id = newId();
    const startsAt = new Date(Date.now() + 10 * HOUR);
    await db().insert(events).values({ id, title: `EV-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", tags: ["food"] });
    for (const m of [a, b]) await db().insert(registrations).values({ id: newId(), eventId: id, accountId: m.id, status: "confirmed", passToken: randomToken() });

    const r = await req(`/events/${id}/hello`, { cookie: a.cookie, form: { hello: "khao soi, extra lime" } });
    expect(r.status).toBe(302);
    const [saved] = await db().select().from(registrations).where(and(eq(registrations.eventId, id), eq(registrations.accountId, a.id)));
    expect(saved.helloLine).toBe("khao soi, extra lime");

    const seen = await (await req(`/events/${id}?lang=en`, { cookie: b.cookie })).text();
    expect(seen).toContain("Say hi first");
    expect(seen).toContain("khao soi, extra lime");
    const notGoing = await (await req(`/events/${id}?lang=en`, { cookie: outsider.cookie })).text();
    expect(notGoing).not.toContain("khao soi, extra lime");
    expect((await req(`/events/${id}/hello`, { cookie: outsider.cookie, form: { hello: "hi" } })).status).toBe(404);
  });

  it("counts a question reached, ignores nonsense, and shows on Quiz health", async () => {
    const m = await createMember();
    const day = new Date(Date.now() + 7 * HOUR).toISOString().slice(0, 10);
    const before = (await db().select().from(quizReach).where(and(eq(quizReach.day, day), eq(quizReach.question, 5)))).reduce((t, r) => t + r.reached, 0);
    expect((await req("/quiz/reach", { cookie: m.cookie, form: { q: "5" } })).status).toBe(204);
    expect((await req("/quiz/reach", { cookie: m.cookie, form: { q: "500" } })).status).toBe(204);
    const after = (await db().select().from(quizReach).where(and(eq(quizReach.day, day), eq(quizReach.question, 5)))).reduce((t, r) => t + r.reached, 0);
    expect(after).toBe(before + 1);
    expect((await db().select().from(quizReach).where(eq(quizReach.question, 500))).length).toBe(0);
    const viewer = await createMember({ role: "insight_viewer" });
    expect(await (await req("/admin/quiz-health?lang=en", { cookie: viewer.cookie })).text()).toContain("Who finishes");
  });
});
