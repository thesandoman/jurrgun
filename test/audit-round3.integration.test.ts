/** Audit round three (owner cards): "Still new to Bangkok?" at six months, Thai passport initials. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { accounts, profiles } from "../src/schema";

describe.skipIf(!HAS_DB)("audit round three", () => {
  it("asks once, six months in, and Not anymore takes off the label and the welcome", async () => {
    const m = await createMember();
    await db().update(profiles).set({ newcomer: true, bio: { story: "expat" } }).where(eq(profiles.accountId, m.id));
    expect(await (await req("/settings?lang=en", { cookie: m.cookie })).text()).not.toContain("Still new to Bangkok?");
    await db().update(accounts).set({ createdAt: new Date(Date.now() - 200 * 86_400_000) }).where(eq(accounts.id, m.id));
    expect(await (await req("/settings?lang=en", { cookie: m.cookie })).text()).toContain("Still new to Bangkok?");
    expect(await (await req("/?view=list&lang=en", { cookie: m.cookie })).text()).toContain("Welcome to Bangkok");
    await req("/settings/newcomer", { cookie: m.cookie, method: "POST", form: { still: "0" } });
    const [p] = await db().select({ newcomer: profiles.newcomer }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.newcomer).toBe(false);
    expect(await (await req("/settings?lang=en", { cookie: m.cookie })).text()).not.toContain("Still new to Bangkok?");
    const disc = await (await req("/?view=list&lang=en", { cookie: m.cookie })).text();
    expect(disc).not.toContain("Welcome to Bangkok");
    expect(disc).toContain("English-friendly this week");
  });

  it("Thai passport stamps show 50 different Thai codes", async () => {
    const m = await createMember();
    const html = await (await req("/buddy/passport?lang=th", { cookie: m.cookie })).text();
    const codes = [...html.matchAll(/<ul class="stamps">([\s\S]*?)<\/ul>/g)].flatMap((x) => [...x[1].matchAll(/<span>([^<]+)<\/span>/g)].map((y) => y[1]));
    expect(codes.length).toBeGreaterThanOrEqual(50);
    const fifty = codes.slice(-50);
    expect(new Set(fifty).size).toBe(50);
    for (const c of fifty) expect(c).toMatch(/^[ก-ฮ]{2,4}$/);
  });
});
