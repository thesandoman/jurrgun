/**
 * POST /api/setup/universities: the one-time load of the university list into
 * social_universities (Core Platform C3, migration 0029), and the label fill
 * that gives each bio its university's display name.
 */
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../src/index";
import { profiles, socialUniversities } from "../src/schema";
import { uniRow } from "../src/routes/setup";
import { createMember, db, ENV, HAS_DB } from "./helpers";

const KEY = "test-universities-key-123";
const env = { ...ENV, SETUP_KEY: KEY };
const post = (rows: unknown[], key = KEY) =>
  app.request("/api/setup/universities", { method: "POST", headers: { "content-type": "application/json", "x-setup-key": key }, body: JSON.stringify({ rows }) }, env);

const tag = Date.now().toString(36);
const A = { id: `th:zz-test-uni-${tag}`, name: `Zz Test University ${tag}`, cc: "TH", nameTh: "มหาวิทยาลัยทดสอบ", search: ` zz test university ${tag} `, thFold: "มหาวิทยาลัยทดสอบ" };
const B = { id: `gb:zz-test-college-${tag}`, name: `Zz Test College ${tag}`, cc: "GB", nameTh: null, search: ` zz test college ${tag} `, thFold: null };

describe("uniRow", () => {
  it("accepts a well-formed row and refuses junk", () => {
    expect(uniRow(A)).toMatchObject({ id: A.id, cc: "TH" });
    expect(uniRow({ ...A, cc: "th" })).toBeNull();
    expect(uniRow({ ...A, id: "no-country" })).toBeNull();
    expect(uniRow({ ...A, name: "" })).toBeNull();
    expect(uniRow({ ...A, nameTh: 5 })).toBeNull();
    expect(uniRow(null)).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("POST /api/setup/universities", () => {
  it("is hidden without SETUP_KEY and refuses a wrong key or a bad row", async () => {
    expect((await app.request("/api/setup/universities", { method: "POST" }, ENV)).status).toBe(404);
    expect((await post([A], "wrong-key-wrong-key-12")).status).toBe(403);
    const bad = await post([A, { ...B, cc: "gbr" }]);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ index: 1 });
  });

  it("upserts rows, labels bios that picked one, and is idempotent", async () => {
    const m = await createMember();
    await db().update(profiles).set({ bio: sql`jsonb_build_object('university', ${A.id}::text)` }).where(eq(profiles.accountId, m.id));

    const first = await post([A, B]);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ upserted: 2 });
    const [p] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.bio.universityLabel).toEqual({ en: A.name, th: A.nameTh });

    // A refresh updates the row in place; a bio that already has a label is left alone.
    const again = await post([{ ...A, name: `${A.name} (renamed)` }]);
    expect(again.status).toBe(200);
    const rows = await db().select().from(socialUniversities).where(inArray(socialUniversities.id, [A.id, B.id]));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === A.id)?.name).toBe(`${A.name} (renamed)`);
    const [p2] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p2.bio.universityLabel?.en).toBe(A.name);

    await db().delete(socialUniversities).where(inArray(socialUniversities.id, [A.id, B.id]));
  });
});
