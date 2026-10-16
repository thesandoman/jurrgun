/**
 * Showing up pays (owner card 10-16, tit-for-tat): a freed seat goes first to
 * someone with a mutual "again" with a person already going, or to someone who
 * kept their last 4 plans, ahead of earlier sign-ups. Never shown as a score.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db } from "./helpers";
import { connections, events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { refreshWaitlist } from "../src/services/events";

const HOUR = 3_600_000;

async function mkEvent(over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 3 * 24 * HOUR);
  await db().insert(events).values({ id, title: `EV-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test", ...over });
  return id;
}
const reg = (eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) =>
  db().insert(registrations).values({ id: newId(), eventId, accountId, status: "confirmed", passToken: randomToken(), ...over });
const statusOf = async (eventId: string, accountId: string) =>
  (await db().select().from(registrations).where(and(eq(registrations.eventId, eventId), eq(registrations.accountId, accountId))))[0]?.status;

describe.skipIf(!HAS_DB)("showing up pays on the waitlist", () => {
  it("a mutual 'again' with someone going gets the freed seat before an earlier sign-up", async () => {
    const [going, early, friend] = await Promise.all([createMember(), createMember(), createMember()]);
    const ev = await mkEvent({ capacity: 2 });
    await reg(ev, going.id);
    await reg(ev, early.id, { status: "waitlisted", createdAt: new Date(Date.now() - 2 * HOUR) });
    await reg(ev, friend.id, { status: "waitlisted", createdAt: new Date(Date.now() - HOUR) });
    const [a, b] = [going.id, friend.id].sort();
    await db().insert(connections).values({ id: newId(), aAccount: a, bAccount: b, level: "again", eventId: newId() });
    await refreshWaitlist(ENV, ev);
    expect(await statusOf(ev, friend.id)).toBe("offered");
    expect(await statusOf(ev, early.id)).toBe("waitlisted");
  });

  it("someone who kept their last 4 plans gets the freed seat before an earlier sign-up", async () => {
    const [early, steady] = await Promise.all([createMember(), createMember()]);
    for (let d = 1; d <= 4; d++) {
      const past = await mkEvent({ startsAt: new Date(Date.now() - d * 24 * HOUR) });
      await reg(past, steady.id, { checkedInAt: new Date(Date.now() - d * 24 * HOUR) });
    }
    const ev = await mkEvent({ capacity: 1 });
    await reg(ev, early.id, { status: "waitlisted", createdAt: new Date(Date.now() - 2 * HOUR) });
    await reg(ev, steady.id, { status: "waitlisted", createdAt: new Date(Date.now() - HOUR) });
    await refreshWaitlist(ENV, ev);
    expect(await statusOf(ev, steady.id)).toBe("offered");
    expect(await statusOf(ev, early.id)).toBe("waitlisted");
  });
});
