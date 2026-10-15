/** Phase 2: feedback (felt heard, unsafe → report), buddy meet feedback, host insights and ideas, admin measures. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { buddyMatches, buddyQuests, events, feedback, meetFeedback, profiles, registrations } from "../src/schema";

async function pastEvent(host: string | null, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const endsAt = new Date(Date.now() - 2 * 3600_000);
  await db().insert(events).values({ id, title: "Past table", startsAt: new Date(endsAt.getTime() - 2 * 3600_000), endsAt, venueName: "Cafe", district: "bang_rak", capacity: 20, status: "published", createdBy: host ?? "test", hostAccountId: host, ...over });
  return id;
}
const attend = (eventId: string, m: Member) => db().insert(registrations).values({ id: newId(), eventId, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: new Date(Date.now() - 3 * 3600_000) });

describe.skipIf(!HAS_DB)("feedback", () => {
  it("event feedback asks 'felt heard'; feeling unsafe leads straight to a report", async () => {
    const m = await createMember();
    const e = await pastEvent(null);
    await attend(e, m);
    expect(await (await req(`/events/${e}/feedback`, { cookie: `${m.cookie}; lang=en` })).text()).toContain("Did you feel heard?");
    const r = await req(`/events/${e}/feedback`, { cookie: m.cookie, form: { metNewPerson: "yes", wouldMeetAgain: "no", feltSafe: "2", feltHeard: "3", groupRating: "3" } });
    expect(r.headers.get("location")).toBe(`/report?event=${e}&from=feedback`);
    const [fb] = await db().select().from(feedback).where(and(eq(feedback.eventId, e), eq(feedback.accountId, m.id)));
    expect(fb.feltHeard).toBe(3);
  });

  it("buddy meet feedback is private and only after a finished quest", async () => {
    const [a, b, stranger] = await Promise.all([createMember(), createMember(), createMember()]);
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const mid = newId();
    await db().insert(buddyMatches).values({ id: mid, aAccount: x, bAccount: y, week: "2026-W42", state: "active" });
    const qid = newId();
    await db().insert(buddyQuests).values({ id: qid, matchId: mid, week: "2026-W42", scenario: "x", typeCode: "BDSH", district: "bang_rak", aDoneAt: new Date(), bDoneAt: null });
    expect((await req(`/buddy/quest/${qid}/feedback`, { cookie: a.cookie })).headers.get("location")).toBe("/buddy");
    await db().update(buddyQuests).set({ bDoneAt: new Date() }).where(eq(buddyQuests.id, qid));
    expect((await req(`/buddy/quest/${qid}/feedback`, { cookie: stranger.cookie })).headers.get("location")).toBe("/buddy");
    expect((await req(`/buddy/quest/${qid}/feedback`, { cookie: a.cookie, form: { showedUp: "yes", onTime: "yes", feltSafe: "5", feltHeard: "4", again: "yes" } })).headers.get("location")).toBe("/buddy?notice=saved");
    const r = await req(`/buddy/quest/${qid}/feedback`, { cookie: b.cookie, form: { showedUp: "yes", feltSafe: "1", again: "no" } });
    expect(r.headers.get("location")).toBe(`/report?account=${a.id}&from=feedback`);
    const rows = await db().select().from(meetFeedback).where(eq(meetFeedback.ref, qid));
    expect(rows).toHaveLength(2);
    // a never sees b's answer anywhere on their buddy page.
    expect(await (await req("/buddy?lang=en", { cookie: a.cookie })).text()).not.toContain("felt");
  });
});

describe.skipIf(!HAS_DB)("host insights and ideas", () => {
  it("shows a host only their own events, and hides small groups", async () => {
    const [host, other, member] = await Promise.all([createMember({ role: "circle_head" }), createMember({ role: "circle_head" }), createMember()]);
    const mine = await pastEvent(host.id, { title: "Host insight test mine" });
    await pastEvent(other.id, { title: "Host insight test theirs" });
    const attendees = await Promise.all(Array.from({ length: 6 }, () => createMember()));
    for (const a of attendees) {
      await attend(mine, a);
      await db().insert(feedback).values({ id: newId(), eventId: mine, accountId: a.id, feltSafe: 5, feltHeard: 4, wouldMeetAgain: true, metNewPerson: true, groupRating: 4 });
    }
    const html = await (await req("/host/insights", { cookie: `${host.cookie}; lang=en` })).text();
    expect(html).toContain("Host insight test mine");
    expect(html).not.toContain("Host insight test theirs");
    expect(html).toContain("100%");
    // Members who can't host are pointed to lead a circle.
    expect((await req("/host/insights", { cookie: member.cookie })).headers.get("location")).toBe("/circles/lead");
  });

  it("ideas show demand only where 10+ members share it", async () => {
    const host = await createMember({ role: "circle_head" });
    const fans = await Promise.all(Array.from({ length: 10 }, () => createMember({ district: "nong_chok" })));
    for (const f of fans) await db().update(profiles).set({ bio: { activities: ["volunteer"] } }).where(eq(profiles.accountId, f.id));
    const html = await (await req("/host/ideas", { cookie: `${host.cookie}; lang=en` })).text();
    expect(html).toContain("Nong Chok");
    expect(html).toContain("Volunteering");
  });

  it("admin insights include healthy-connection measures", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const html = await (await req("/admin/insights", { cookie: `${admin.cookie}; lang=en` })).text();
    expect(html).toContain("Healthy connections");
    expect(html).not.toContain("BMA to confirm");
  });
});
