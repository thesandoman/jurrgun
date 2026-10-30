/**
 * Card D3 (owner, 2026-10-30): ask at the moment. Step B1: a women-only event asks for the
 * private gender inside My registration (an AskCard that is the #rsvp form, so the RSVP bar
 * observes it), with a remembered "Not now".
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { consents, events, profiles } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { WOMEN_ONLY_TAG } from "../src/domain/rules";

const HOUR = 3_600_000;
async function womenOnlyEvent() {
  const id = newId();
  const startsAt = new Date(Date.now() + 72 * HOUR);
  await db().insert(events).values({ id, title: `WO-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Cafe", district: "bang_rak", capacity: 8, status: "published", createdBy: "test", tags: [WOMEN_ONLY_TAG] });
  return id;
}
const page = async (ev: string, cookie: string) => (await req(`/events/${ev}?lang=en`, { cookie })).text();

describe.skipIf(!HAS_DB)("card D3 B1: gender at the women-only RSVP", () => {
  it("asks inside My registration, saves it privately with its consent, then shows the RSVP", async () => {
    const m = await createMember();
    await db().update(profiles).set({ gender: null }).where(eq(profiles.accountId, m.id));
    const ev = await womenOnlyEvent();
    let html = await page(ev, m.cookie);
    expect(html).toContain(`<form method="post" action="/events/${ev}/ask-gender" id="rsvp">`);
    expect(html).toContain("We ask because this event is only for women and non-binary people");
    expect(html).toContain("Not now");
    const r = await req(`/events/${ev}/ask-gender`, { cookie: m.cookie, form: { ask: "women_only_gender", do: "save", gender: "woman" } });
    expect(r.headers.get("location")).toBe(`/events/${ev}#reg-h`);
    const [p] = await db().select({ gender: profiles.gender }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.gender).toBe("woman");
    const [c] = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "gender_data"))).orderBy(desc(consents.createdAt)).limit(1);
    expect(c.granted).toBe(true);
    html = await page(ev, m.cookie);
    expect(html).toContain(`action="/events/${ev}/rsvp" id="rsvp"`);
    expect(html).not.toContain("/ask-gender");
  });

  it("remembers Not now: no second ask, a plain line, and the gender stays unset", async () => {
    const m = await createMember();
    await db().update(profiles).set({ gender: null }).where(eq(profiles.accountId, m.id));
    const ev = await womenOnlyEvent();
    await req(`/events/${ev}/ask-gender`, { cookie: m.cookie, form: { ask: "women_only_gender", do: "later" } });
    const html = await page(ev, m.cookie);
    expect(html).not.toContain("/ask-gender");
    expect(html).toContain("set your gender at Me › Connection preferences");
    const [p] = await db().select({ gender: profiles.gender, bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.gender).toBeNull();
    const bio = (typeof p.bio === "string" ? JSON.parse(p.bio) : p.bio) as { dismissedAsks?: string[] };
    expect(bio.dismissedAsks).toContain("women_only_gender");
  });
});
