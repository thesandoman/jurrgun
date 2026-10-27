/** One-tap "Open to something more", dating prompts, and dating events only for romance mode. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { consents, events, profiles } from "../src/schema";
import { cleanBio, datingDeckFor, promptById } from "../src/content/profile";

const prof = async (id: string) => (await db().select().from(profiles).where(eq(profiles.accountId, id)))[0];
const quick = (cookie: string, on: "0" | "1") => req("/settings/quick", { cookie, form: { key: "romance", on, ...(on === "1" ? { consent: "1" } : {}) } });

describe.skipIf(!HAS_DB)("one tap: open to something more", () => {
  it("switches on in one tap, records consent and makes a prefer-not member Single", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    const html = await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain("Open to something more");
    expect((await quick(m.cookie, "1")).headers.get("location")).toBe("/settings?notice=romance_on");
    const p = await prof(m.id);
    expect([p.relationship, p.romanceOn, p.romanceOpenTo, p.intents.includes("romance")]).toEqual(["single", true, "everyone", true]);
    expect(p.lastSingleSwitchAt).not.toBeNull();
    const rows = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "romance_data")));
    expect(rows.map((r) => r.granted)).toEqual([true]);
  });

  it("sends a married member to Connection preferences instead, and never shows them the switch", async () => {
    const m = await createMember({ relationship: "married" });
    const html = await (await req("/settings", { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).not.toContain('name="key" value="romance"');
    expect((await quick(m.cookie, "1")).headers.get("location")).toBe("/settings/connections?notice=romance_single");
    expect((await prof(m.id)).romanceOn).toBe(false);
  });

  it("respects the 30-day limit on switching to Single", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    await db().update(profiles).set({ lastSingleSwitchAt: new Date(Date.now() - 86_400_000) }).where(eq(profiles.accountId, m.id));
    expect((await quick(m.cookie, "1")).headers.get("location")).toContain("/settings?error=");
    expect((await prof(m.id)).romanceOn).toBe(false);
  });

  it("switching off deletes dating answers, the dating deck and every romance field", async () => {
    const m = await createMember({ relationship: "single" });
    await quick(m.cookie, "1");
    const id = datingDeckFor(m.id).find((x) => promptById(x)!.kind === "text")!;
    const form = { nickname: "Ploy", district: "bang_rak", languages: "th", interests: "food", [`a_${id}`]: "A boat down Khlong Bang Luang" };
    await req("/settings/profile", { cookie: m.cookie, form });
    expect(cleanBio((await prof(m.id)).bio).answers?.[id]?.value).toBe("A boat down Khlong Bang Luang");
    expect((await quick(m.cookie, "0")).headers.get("location")).toBe("/settings?notice=romance_off");
    const p = await prof(m.id);
    const bio = cleanBio(p.bio);
    expect([p.romanceOn, p.romanceOpenTo, bio.datingDeck, bio.answers?.[id]]).toEqual([false, null, undefined, undefined]);
    expect(p.intents).not.toContain("romance");
  });
});

describe.skipIf(!HAS_DB)("dating prompts on a profile", () => {
  it("show only to a member who is also open to something more and a fit", async () => {
    const [a, b, friend] = await Promise.all([
      createMember({ relationship: "single", romanceOn: true, romanceOpenTo: "everyone", nickname: "Ann" }),
      createMember({ relationship: "single", romanceOn: true, romanceOpenTo: "everyone" }),
      createMember(),
    ]);
    const id = datingDeckFor(a.id).find((x) => promptById(x)!.kind === "text")!;
    const answer = "Sunset at Wat Arun, then noodles";
    await db()
      .update(profiles)
      .set({ bio: { datingDeck: datingDeckFor(a.id), answers: { [id]: { kind: "text", value: answer } } } })
      .where(eq(profiles.accountId, a.id));
    // People only see a card once they've met; the card page itself is checked here through /me/profile for the owner.
    const own = await (await req("/me/profile", { cookie: `${a.cookie}; lang=en` })).text();
    expect(own).toContain(answer);
    const { cardPerson } = await import("../src/routes/profile");
    const target = await prof(a.id);
    expect(cardPerson(target, await prof(b.id)).datingDeck).toContain(id);
    const toFriend = cardPerson(target, await prof(friend.id));
    expect(toFriend.datingDeck).toEqual([]);
    expect(JSON.stringify(toFriend.bio)).not.toContain(answer);
  });
});

describe.skipIf(!HAS_DB)("dating events (open_to_more)", () => {
  it("are hidden from friends-only members everywhere and open to romance mode", async () => {
    const [friend, dater] = await Promise.all([createMember(), createMember({ relationship: "single", romanceOn: true, romanceOpenTo: "everyone" })]);
    const id = newId();
    const title = `Singles canal walk ${id.slice(0, 6)}`;
    const startsAt = new Date(Date.now() + 9 * 86_400_000);
    await db().insert(events).values({ id, title, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600_000), venueName: "Pier", district: "bang_rak", capacity: 10, status: "published", createdBy: "t", tags: ["open_to_more"] });
    const listed = `/?view=list&q=${encodeURIComponent(title)}`; // a search, so other tests' events can't crowd it off the list
    expect(await (await req(listed, { cookie: friend.cookie })).text()).not.toContain(`href="/events/${id}"`);
    expect((await req(`/events/${id}`, { cookie: friend.cookie })).status).toBe(404);
    expect((await req(`/events/${id}/rsvp`, { cookie: friend.cookie, form: { rhythmOk: "1" } })).status).not.toBe(302);
    expect(await (await req(listed, { cookie: dater.cookie })).text()).toContain(`href="/events/${id}"`);
    expect((await req(`/events/${id}`, { cookie: dater.cookie })).status).toBe(200);
  });
});
