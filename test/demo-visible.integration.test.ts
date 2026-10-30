/**
 * Demo accounts out of what real members see (owner C2, 27 Oct 2026): tables hosted
 * by a demo account are hidden from real members, visitors and the public feed, but
 * a demo viewer still sees them; demo people are never seated or paired with real
 * members; demo accounts get no district alerts.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { accounts, connections, events } from "../src/schema";
import { and, or, sql } from "drizzle-orm";
import { newId } from "../src/lib/crypto";
import { DEMO_CHAT_LINKS, pairSeenBy, realPeopleFor } from "../src/services/demo";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function demoHostedEvent() {
  const host = await createMember({ role: "host" });
  await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, host.id));
  const id = newId();
  const title = `DEMO-TABLE-${id.slice(0, 8)}`;
  const startsAt = new Date(Date.now() + 2 * DAY);
  await db().insert(events).values({
    id,
    title,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * HOUR),
    venueName: "Lumphini Park",
    district: "pathum_wan",
    capacity: 8,
    status: "published",
    createdBy: host.id,
    hostAccountId: host.id,
  });
  return { id, title, host };
}

describe.skipIf(!HAS_DB)("demo accounts in member views", () => {
  it("hides a demo-hosted table from real members and the public feed, and shows it to demo accounts", async () => {
    const { title } = await demoHostedEvent();
    const real = await createMember();
    expect(await (await req("/?view=list&lang=en", { cookie: real.cookie })).text()).not.toContain(title);
    const demo = await createMember();
    await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, demo.id));
    expect(await (await req("/?view=list&lang=en", { cookie: demo.cookie })).text()).toContain(title);
    expect(await (await req("/feeds/events.json")).text()).not.toContain(title);
  });

  it("never seats or pairs a demo account with real members, except at a demo-hosted table", async () => {
    const [a, b, d] = await Promise.all([createMember(), createMember(), createMember()]);
    await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, d.id));
    const realHost = await createMember({ role: "host" });
    expect(await realPeopleFor(db(), realHost.id, [a.id, b.id, d.id])).toEqual([a.id, b.id]);
    const { host } = await demoHostedEvent();
    expect(await realPeopleFor(db(), host.id, [a.id, b.id, d.id])).toEqual([a.id, b.id, d.id]);
  });

  it("leaves connections and chats with demo accounts out of a real member's counts, not a demo viewer's", async () => {
    const [real, demo, other] = await Promise.all([createMember(), createMember(), createMember()]);
    await db().update(accounts).set({ isDemo: true }).where(eq(accounts.id, demo.id));
    const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);
    const [a1, b1] = pair(real.id, demo.id);
    const [a2, b2] = pair(demo.id, other.id);
    const c1 = newId();
    await db().insert(connections).values([
      { id: c1, aAccount: a1, bAccount: b1, level: "friend", eventId: newId() },
      { id: newId(), aAccount: a2, bAccount: b2, level: "friend", eventId: newId() },
    ]);
    const seen = async (me: string) =>
      (await db().select({ id: connections.id }).from(connections).where(and(or(eq(connections.aAccount, me), eq(connections.bAccount, me)), pairSeenBy(sql`${connections.aAccount}`, sql`${connections.bAccount}`, me)))).length;
    expect(await seen(real.id)).toBe(0);
    expect(await seen(demo.id)).toBe(2);
    const links = (await db().execute(sql`select 1 from (select ${`/chat/conn:${c1}`} as l) x where x.l in ${DEMO_CHAT_LINKS}`)) as unknown as unknown[];
    expect(links).toHaveLength(1);
    const html = await (await req("/me/month?lang=en", { cookie: real.cookie })).text();
    expect(html.length).toBeGreaterThan(0);
  });
});
