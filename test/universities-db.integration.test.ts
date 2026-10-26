/**
 * University search from the database (services/universities.ts) gives the
 * same results as ranking the whole list in memory did before the list left
 * the bundle (Core Platform C3).
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { buildUniversities, searchIn } from "../src/content/universities";
import { profiles, socialUniversities } from "../src/schema";
import { educationLookup, searchUniversities, universityById, universityByName } from "../src/services/universities";
import { createMember, db, ENV, HAS_DB, req } from "./helpers";

const UNIS = buildUniversities(JSON.parse(readFileSync("scripts/data/universities.json", "utf8")) as [string, string][]);

const QUERIES = [
  "chula", "จุฬา", "จุฬาฯ", "kmitl", "abac", "muic", "suan sunandha", "institute of technology", "รามคำแหง",
  "มหาวิทยาลัยรามคำแหง", "นิด้า", "ธรรมศาสตร์", "lse", "ucl", "mit", "nus", "ntu", "seoul national", "oxford",
  "university", "college", "university of", "technology", "evangelische fachhochschule berlin sozialarbeit", "zzzz",
];

describe.skipIf(!HAS_DB)("university search from the database", () => {
  beforeAll(async () => {
    const rows = UNIS.map((u) => ({ id: u.id, name: u.name, cc: u.cc, nameTh: u.th ?? null, search: u.search, thFold: u.thFold ?? null }));
    for (let i = 0; i < rows.length; i += 1000) {
      await db()
        .insert(socialUniversities)
        .values(rows.slice(i, i + 1000))
        .onConflictDoUpdate({ target: socialUniversities.id, set: { name: sql`excluded.name`, search: sql`excluded.search`, thFold: sql`excluded.th_fold`, nameTh: sql`excluded.name_th` } });
    }
  }, 60_000);

  it.each(QUERIES)("%s: same top 8 as in memory", async (q) => {
    const fromDb = (await searchUniversities(ENV, q, 8)).map((u) => u.id);
    expect(fromDb).toEqual(searchIn(UNIS, q, 8).map((u) => u.id));
  });

  it("finds one by id or exact name, and resolves a posted form", async () => {
    const chula = searchIn(UNIS, "chula")[0];
    expect((await universityById(ENV, chula.id))?.th).toBe("จุฬาลงกรณ์มหาวิทยาลัย");
    expect(await universityById(ENV, "zz:nope")).toBeUndefined();
    expect((await universityByName(ENV, "  chulalongkorn  UNIVERSITY "))?.id).toBe(chula.id);
    expect((await universityByName(ENV, "จุฬาลงกรณ์มหาวิทยาลัย"))?.id).toBe(chula.id);
    expect(await universityByName(ENV, "Hogwarts")).toBeUndefined();
    const lk = await educationLookup(ENV, { university: chula.id, universityName: "mahidol university" });
    expect(lk.byId(chula.id)?.id).toBe(chula.id);
    expect(lk.byId("th:other")).toBeUndefined();
    expect(lk.byName("Mahidol University")?.name).toBe("Mahidol University");
  });

  it("saving Work with a picked university stores its name with the bio, and the card shows it", async () => {
    const m = await createMember();
    const chula = searchIn(UNIS, "chula")[0];
    const r = await req("/settings/profile/section/work", {
      cookie: `${m.cookie}; lang=en`,
      form: { education: "", educationDetail: "", university: chula.id, universityName: chula.name, gradYear: "", occupation: "", occupationOther: "", learning: "" },
    });
    expect(r.status).toBeLessThan(400);
    const [p] = await db().select({ bio: profiles.bio }).from(profiles).where(eq(profiles.accountId, m.id));
    expect(p.bio).toMatchObject({ university: chula.id, universityLabel: { en: "Chulalongkorn University", th: "จุฬาลงกรณ์มหาวิทยาลัย" } });
    const card = await (await req("/me/profile", { cookie: `${m.cookie}; lang=th` })).text();
    expect(card).toContain("จุฬาลงกรณ์มหาวิทยาลัย");
  });
});
