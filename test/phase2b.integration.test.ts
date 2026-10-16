/** Phase 2B (owner-approved 2026-10-16): friends lead the welcome; type pairs never read as compatibility (D31). */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { profiles } from "../src/schema";
import { MODE_OPTS, MODES, offeredMode } from "../src/content/dating";
import { ARCHETYPES, MATCH_LABELS } from "../src/vibe/archetypes";

const COMPAT = /click|match|compatib|best fit|เข้ากัน|แมตช์|ลงตัว/i;

describe("phase 2B rules", () => {
  it("offers exactly two choices, friends first, and keeps dating_only valid", () => {
    expect(MODE_OPTS.map((o) => o.value)).toEqual(["friends", "dating"]);
    expect(MODE_OPTS[0]).toMatchObject({ emoji: "👋", label: { th: "เพื่อนใหม่และกิจกรรมกลุ่ม", en: "New friends and group plans" } });
    expect(MODE_OPTS[1]).toMatchObject({ emoji: "💘", label: { th: "เพื่อนใหม่ และเปิดใจมากกว่าเพื่อน", en: "New friends, and open to something more" } });
    expect(MODES).toContain("dating_only");
    expect(offeredMode("dating_only")).toBe("dating");
    expect(offeredMode("friends")).toBe("friends");
  });
  it("type pair labels and reasons never say click, match or compatible", () => {
    for (const m of Object.values(MATCH_LABELS)) for (const s of [m.name.th, m.name.en, m.copy.th, m.copy.en]) expect(s).not.toMatch(COMPAT);
    for (const a of Object.values(ARCHETYPES)) for (const x of a.clicks) expect(`${x.why.th} ${x.why.en}`).not.toMatch(COMPAT);
  });
});

describe.skipIf(!HAS_DB)("phase 2B pages", () => {
  it("welcome: friends preselected, two choices, 💘 tinted love red only when chosen", async () => {
    const m = await createMember();
    await db().delete(profiles).where(eq(profiles.accountId, m.id));
    const en = await (await req("/onboarding/welcome?lang=en", { cookie: m.cookie })).text();
    expect(en).toContain("New friends and group plans");
    expect(en).toContain("New friends, and open to something more");
    expect(en).not.toContain("Here for dating");
    expect(en).not.toContain('value="dating_only"');
    expect(en).toMatch(/value="friends" checked/);
    expect(en).toContain(".welcome-mode .answer input[value=dating]:checked+span{border-color:var(--love);background:var(--love-soft)");
    expect(en).toContain("Change it anytime. Dating stays private.");
    expect(en).toContain("Next: your Bangkok Type.");
    const th = await (await req("/onboarding/welcome?lang=th", { cookie: m.cookie })).text();
    expect(th).toContain("เพื่อนใหม่และกิจกรรมกลุ่ม");
    expect(th).not.toContain("มาหาเดตโดยเฉพาะ");
  });
  it("welcome: a stored dating_only choice shows as the 💘 option, and old posts still work", async () => {
    const m = await createMember();
    await db().delete(profiles).where(eq(profiles.accountId, m.id));
    const html = await (await req("/onboarding/welcome?lang=en", { cookie: `${m.cookie}; bkk_intent=dating_only` })).text();
    expect(html).toMatch(/value="dating" checked/);
    expect(html).not.toMatch(/value="friends" checked/);
    const r = await req("/onboarding/welcome", { cookie: m.cookie, form: { mode: "dating_only" } });
    expect(r.headers.get("location")).toBe("/onboarding/dating");
  });
});
