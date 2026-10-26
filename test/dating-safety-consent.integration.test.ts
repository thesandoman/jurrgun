/**
 * Owner card C3 (2026-10-26): a first-date safety line at a mutual Pinky, and
 * the 💘 explainer as the consent screen when 💘 is switched on.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { connections, datingIntents, events, registrations } from "../src/schema";

const HOUR = 3_600_000;
const en = (m: Member) => `${m.cookie}; lang=en`;
const heart = (gender: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const });

describe.skipIf(!HAS_DB)("💘 safety and consent", () => {
  it("a mutual Pinky shows the first-date line with the safety links", async () => {
    const [a, b] = await Promise.all([createMember(heart("woman")), createMember(heart("man"))]);
    await db().insert(datingIntents).values([
      { accountId: a.id, mode: "dating" },
      { accountId: b.id, mode: "dating" },
    ]);
    const ev = newId();
    const ends = new Date(Date.now() - 2 * HOUR);
    await db().insert(events).values({ id: ev, title: `SAFE-${ev.slice(0, 6)}`, startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Cafe", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
    for (const m of [a, b]) await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(Date.now() - 3 * HOUR) });
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "romance", eventId: ev });

    const html = await (await req(`/people/${b.id}`, { cookie: en(a) })).text();
    expect(html).toContain("Meet somewhere public and tell someone you trust your plan.");
    expect(html).toContain('href="/safety#plan"');
    expect(html).toContain('href="/learn/date-responsibly"');
  });

  it("switching 💘 on shows the explainer as the consent screen", async () => {
    const m = await createMember({ relationship: "single" });
    const html = await (await req("/settings", { cookie: en(m) })).text();
    expect(html).toContain("only for 💘 events and Pinky. Staff and partners never see it.");
    expect(html).toContain('name="consent"');
  });
});
