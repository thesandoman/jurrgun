/**
 * Demo and test accounts (identity_accounts.is_demo, owner C2) never reach a
 * real member's People I Met, and a Pinky between a real and a demo account
 * never unlocks. The Pinky row itself never changes (it never depends on the
 * other person), so nothing shows who is a demo account.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { accounts, connections, events, registrations } from "../src/schema";

const HOUR = 3_600_000;
const en = (m: Member) => `${m.cookie}; lang=en`;
const heart = (gender: string, nickname: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const, nickname });

async function table(...ms: Member[]) {
  const ev = newId();
  const ends = new Date(Date.now() - 2 * HOUR);
  await db().insert(events).values({ id: ev, title: `DEMO-${ev.slice(0, 6)}`, startsAt: new Date(ends.getTime() - 2 * HOUR), endsAt: ends, venueName: "Cafe", district: "watthana", capacity: 8, status: "published", createdBy: "test" });
  for (const m of ms) await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18), checkedInAt: new Date(Date.now() - 3 * HOUR) });
  return ev;
}
const demo = (m: Member) => db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, m.id));

describe.skipIf(!HAS_DB)("demo accounts and the romance side", () => {
  it("People I Met never shows a demo account to a real member; a demo viewer still sees everyone", async () => {
    const real = await createMember({ nickname: `Real${randomToken(4)}` });
    const fake = await createMember({ nickname: `Demo${randomToken(4)}` });
    const other = await createMember({ nickname: `Other${randomToken(4)}` });
    await demo(fake);
    const ev = await table(real, fake, other);
    const seen = await (await req(`/events/${ev}/people`, { cookie: en(real) })).text();
    expect(seen).toContain(`name="choice_${other.id}"`);
    expect(seen).not.toContain(`name="choice_${fake.id}"`);
    const demoSees = await (await req(`/events/${ev}/people`, { cookie: en(fake) })).text();
    expect(demoSees).toContain(`name="choice_${real.id}"`);
  });

  it("a Pinky between a real and a demo account never unlocks, and the tap is answered the same way", async () => {
    const [real, fake] = await Promise.all([createMember(heart("woman", "Ploy")), createMember(heart("man", "Ken"))]);
    await demo(fake);
    const ev = await table(real, fake);
    const r1 = await req(`/people/${fake.id}/pinky`, { cookie: real.cookie, form: { action: "tap" } });
    const r2 = await req(`/people/${real.id}/pinky`, { cookie: fake.cookie, form: { action: "tap" } });
    expect(r1.headers.get("location")).toBe(`/people/${fake.id}#pinky`);
    expect(r2.headers.get("location")).toBe(`/people/${real.id}#pinky`);
    const [x, y] = real.id < fake.id ? [real.id, fake.id] : [fake.id, real.id];
    const [c] = await db().select().from(connections).where(and(eq(connections.aAccount, x), eq(connections.bAccount, y), eq(connections.eventId, ev)));
    expect(c).toBeUndefined();
  });
});
