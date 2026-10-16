/** Three fixes found while filming (owner, via Branding). */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { connections, contactShares, profiles } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { A11Y_CSS } from "../src/ui/a11y-css";

describe("quiz result card", () => {
  it("'Close to' takes the dark card's light text colour", () => {
    expect(A11Y_CSS).toContain(".tile2 .type-range{color:inherit!important}");
  });
});

describe.skipIf(!HAS_DB)("filming fixes", () => {
  it("card flows carry their own required-field messages in the page language", async () => {
    const m = await createMember();
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const th = await (await req("/onboarding/privacy?lang=th", { cookie: m.cookie })).text();
    expect(th).toContain('data-miss-check="ติ๊กช่องนี้ก่อนจึงจะไปต่อได้"');
    const en = await (await req("/onboarding/privacy?lang=en", { cookie: m.cookie })).text();
    expect(en).toContain('data-miss-check="Tick this box to continue."');
  });

  it("the friendship milestone uses the bare nickname; pronouns stay on the heading", async () => {
    const a = await createMember();
    const b = await createMember({ nickname: `Jay${newId().slice(0, 3)}` });
    await db().update(profiles).set({ pronouns: "they/them", showPronouns: true }).where(eq(profiles.accountId, b.id));
    const c1 = newId();
    await db().insert(connections).values([
      { id: c1, aAccount: a.id < b.id ? a.id : b.id, bAccount: a.id < b.id ? b.id : a.id, level: "friend", eventId: newId() },
      { id: newId(), aAccount: a.id < b.id ? a.id : b.id, bAccount: a.id < b.id ? b.id : a.id, level: "friend", eventId: newId() },
    ]);
    for (const m of [a, b]) await db().insert(contactShares).values({ id: newId(), connectionId: c1, accountId: m.id, method: "line", value: "x_" + m.id.slice(0, 4) });
    const [pb] = await db().select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.accountId, b.id));
    const html = await (await req("/connections?lang=en", { cookie: a.cookie })).text();
    expect(html).toContain("🎉 Met 2 times");
    expect(html).toContain(`Invite ${pb.nickname} to a table`);
    expect(html).not.toContain(`You and ${pb.nickname} (they/them)`);
    expect(html).toContain(`${pb.nickname} (they/them)</a>`);
  });
});
