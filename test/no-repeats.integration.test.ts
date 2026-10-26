/**
 * No repeats (owner): one My people card per person however many events you
 * met at, Remove removes them entirely, and the tables someone sits at are
 * counted on Me and listed one chip each on their profile.
 */
import { describe, expect, it } from "vitest";
import { and, eq, isNull, or } from "drizzle-orm";
import { HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import { connections, events, regularTableMembers, regularTables } from "../src/schema";
import { newId } from "../src/lib/crypto";

const event = async (title: string, daysAgo: number) => {
  const id = newId();
  const startsAt = new Date(Date.now() - daysAgo * 86_400_000);
  await db().insert(events).values({ id, title, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Cafe", district: "bang_rak", capacity: 10, status: "published", createdBy: "t" });
  return id;
};

describe.skipIf(!HAS_DB)("no repeats", () => {
  it("shows one card per person with the last meeting, lists every meeting on their profile, and Remove removes them all", async () => {
    const me = await createMember();
    const them = await createMember({ nickname: `Twice${newId().slice(0, 4)}` });
    const e1 = await event("Board games night", 10);
    const e2 = await event("Night food crawl", 3);
    await db().insert(connections).values([
      { id: newId(), aAccount: me.id, bAccount: them.id, level: "friend", eventId: e1, createdAt: new Date(Date.now() - 9 * 86_400_000) },
      { id: newId(), aAccount: them.id, bAccount: me.id, level: "friend", eventId: e2, createdAt: new Date(Date.now() - 2 * 86_400_000) },
    ]);
    const html = await (await req("/connections?lang=en", { cookie: me.cookie })).text();
    expect(html.split(`href="/people/${them.id}"`).length - 1).toBe(1);
    expect(html).toContain("Last met at Night food crawl");
    expect(html).not.toContain("Board games night");
    // The full history lives on their profile (B1), newest first.
    const prof = await (await req(`/people/${them.id}?lang=en`, { cookie: me.cookie })).text();
    expect(prof).toContain("Where you&#39;ve met");
    expect(prof.indexOf("Night food crawl")).toBeGreaterThan(0);
    expect(prof.indexOf("Night food crawl")).toBeLessThan(prof.indexOf("Board games night"));
    expect(html).not.toContain("nothing yet");
    // My month in people counts people, not meetings (the count moved there from Me, mobile card 6).
    expect(await (await req("/me/month?lang=en", { cookie: me.cookie })).text()).toMatch(/<a class="fact" href="\/connections"><b aria-hidden="true">🤝<\/b><span class="big-n">1<\/span>/);
    const id = html.match(/action="\/connections\/([^/]+)\/remove"/)![1];
    await req(`/connections/${id}/remove`, { cookie: me.cookie, method: "POST", form: { go: "1" } });
    const left = await db()
      .select({ id: connections.id })
      .from(connections)
      .where(and(or(and(eq(connections.aAccount, me.id), eq(connections.bAccount, them.id)), and(eq(connections.aAccount, them.id), eq(connections.bAccount, me.id))), isNull(connections.removedAt)));
    expect(left).toHaveLength(0);
  });

  it("counts tables on Me and lists several as chips on a profile", async () => {
    const host = await createMember();
    const me = await createMember();
    const names = ["Runners", "Board gamers", "Sketchers"].map((n) => `${n} ${newId().slice(0, 4)}`);
    for (const name of names) {
      const id = newId();
      await db().insert(regularTables).values({ id, hostAccountId: host.id, name, district: "bang_rak", joinToken: newId() });
      await db().insert(regularTableMembers).values({ id: newId(), tableId: id, accountId: me.id });
    }
    await attendedOnce(me.id);
    const hub = await (await req("/settings?lang=en", { cookie: me.cookie })).text();
    expect(hub).toMatch(/<p class="me-line"><span>Bang Rak ·<\/span> <span>With Jurrgun since [A-Z][a-z]{2} \d{4} ·<\/span> <span>3 Regular Tables<\/span><\/p>/);
    const prof = await (await req("/me/profile?lang=en", { cookie: me.cookie })).text();
    expect(prof).toContain("Regular at 3 tables");
    for (const n of names) expect(prof).toContain(`<span class="pc-chip">${n}</span>`);
  });
});
