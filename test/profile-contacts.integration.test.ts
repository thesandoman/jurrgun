/**
 * Owner card F2: contact details in a bio or prompt answer stay saved, but show as •••• until two people
 * have met and connected. Hidden on the server: the text never reaches a viewer who hasn't connected.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import { connections, events, profiles, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { PROMPT_BANK } from "../src/content/profile";

const TEXT = PROMPT_BANK.find((p) => p.kind === "text" && !p.id.startsWith("d_"))!;
const SECRET = "sando99";

async function metAtEvent(a: string, b: string) {
  const ev = newId();
  const startsAt = new Date(Date.now() - 48 * 3_600_000);
  await db().insert(events).values({ id: ev, title: "Met", startsAt, endsAt: new Date(startsAt.getTime() + 7_200_000), venueName: "V", district: "bang_rak", capacity: 8, status: "published", createdBy: "test" });
  await db().insert(registrations).values([a, b].map((accountId) => ({ id: newId(), eventId: ev, accountId, status: "confirmed", passToken: randomToken(18), checkedInAt: startsAt })));
  return ev;
}

describe.skipIf(!HAS_DB)("card F2: contact details on a profile", () => {
  it("is hidden from someone met but not connected, shown once connected, and the author is told", async () => {
    const [owner, viewer] = await Promise.all([createMember(), createMember()]);
    await db().update(profiles).set({ bio: { hometown: `LINE: ${SECRET}`, deck: [TEXT.id], answers: { [TEXT.id]: { kind: "text", value: `ทักมาได้ ไลน์ ${SECRET} นะ` } } } }).where(eq(profiles.accountId, owner.id));
    const ev = await metAtEvent(owner.id, viewer.id);

    let html = await (await req(`/people/${owner.id}?lang=en`, { cookie: viewer.cookie })).text();
    expect(html).not.toContain(SECRET);
    expect(html).toContain("••••");

    const mine = await (await req("/me/profile?lang=en", { cookie: owner.cookie })).text();
    expect(mine).toContain(SECRET);
    expect(mine).toContain("Only people you&#39;ve met at an event and connected with can see them.");

    const [x, y] = [owner.id, viewer.id].sort();
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "friend", eventId: ev });
    html = await (await req(`/people/${owner.id}?lang=en`, { cookie: viewer.cookie })).text();
    expect(html).toContain(SECRET);

    // Saved as written.
    const [p] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, owner.id));
    expect(JSON.stringify(p.bio)).toContain(SECRET);
  });

  it("leaves ordinary sentences alone, with no note for the author", async () => {
    const owner = await createMember();
    await attendedOnce(owner.id);
    await db().update(profiles).set({ bio: { deck: [TEXT.id], answers: { [TEXT.id]: { kind: "text", value: "I post on Instagram sometimes" } } } }).where(eq(profiles.accountId, owner.id));
    const mine = await (await req("/me/profile?lang=en", { cookie: owner.cookie })).text();
    expect(mine).toContain("I post on Instagram sometimes");
    expect(mine).not.toContain("data-contacts-hidden");
  });
});
