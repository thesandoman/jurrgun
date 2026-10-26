/**
 * University lookups against the social_universities table (Core Platform
 * C3, migration 0028; loaded by POST /api/setup/universities). The list used
 * to be bundled into the Worker; now the database finds candidates and
 * content/universities.ts ranks them with the same rules as before.
 */
import { asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DatabaseEnv } from "../db";
import { socialUniversities } from "../schema";
import { aliasTargets, fold, nameIn, searchIn, type University, type UniversityLookup } from "../content/universities";

/** Candidates fetched per search, best first by the same score searchIn() uses. */
const CANDIDATES = 400;

type Row = typeof socialUniversities.$inferSelect;
const toUniversity = (r: Row): University => ({
  id: r.id,
  name: r.name,
  cc: r.cc,
  search: r.search,
  ...(r.nameTh ? { th: r.nameTh } : {}),
  ...(r.thFold ? { thFold: r.thFold } : {}),
});

/** One university by its stable id ("th:chulalongkorn-university"). */
export async function universityById(env: DatabaseEnv, id: string | undefined | null): Promise<University | undefined> {
  if (!id || id.length > 210) return undefined;
  const [r] = await getDb(env).select().from(socialUniversities).where(eq(socialUniversities.id, id)).limit(1);
  return r ? toUniversity(r) : undefined;
}

/** Exact name, in English or Thai (forms posted without JS type the name). */
export async function universityByName(env: DatabaseEnv, name: string): Promise<University | undefined> {
  const f = fold(name);
  if (!f) return undefined;
  // fold() leaves only letters, marks, digits and spaces, so f carries no LIKE wildcards.
  const rows = await getDb(env)
    .select()
    .from(socialUniversities)
    .where(or(sql`${socialUniversities.search} LIKE ${` ${f} %`}`, eq(socialUniversities.thFold, f)))
    .limit(50);
  return nameIn(rows.map(toUniversity), name);
}

/** Top matches for what someone typed (the education picker). */
export async function searchUniversities(env: DatabaseEnv, q: string, limit = 8): Promise<University[]> {
  const words = fold(q).split(" ").filter(Boolean).slice(0, 8);
  if (words.length === 0) return [];
  const each: SQL[] = words.map(
    (w) => sql`(${socialUniversities.search} LIKE ${`% ${w}%`} OR ${socialUniversities.thFold} LIKE ${`%${w}%`})`,
  );
  const all = sql.join(each, sql` AND `);
  const whole = words.join(" ");
  const targets = aliasTargets(q);
  const isAlias = targets.length ? inArray(socialUniversities.name, targets) : sql`false`;
  const where = targets.length ? or(all, isAlias)! : all;
  // The same score searchIn() gives (alias 5, Thai 3, whole-name prefix 2, then shorter names), so cutting at
  // CANDIDATES never drops a row that would have made the top results.
  const score = sql`(CASE WHEN ${isAlias} THEN 5 ELSE 0 END
    + CASE WHEN ${socialUniversities.cc} = 'TH' THEN 3 ELSE 0 END
    + CASE WHEN ${socialUniversities.search} LIKE ${` ${whole}%`} OR ${socialUniversities.thFold} LIKE ${`%${whole}%`} THEN 2 ELSE 0 END)`;
  const rows = await getDb(env)
    .select()
    .from(socialUniversities)
    .where(where)
    .orderBy(sql`${score} DESC`, asc(sql`length(${socialUniversities.name})`), sql`${socialUniversities.name} COLLATE "C"`, sql`${socialUniversities.id} COLLATE "C"`)
    .limit(CANDIDATES);
  return searchIn(rows.map(toUniversity), q, limit);
}

/** Resolve a posted education form's university once, so parseEducation stays pure. */
export async function educationLookup(env: DatabaseEnv, f: { university?: string; universityName?: string }): Promise<UniversityLookup> {
  const typed = (f.universityName ?? "").trim();
  const [picked, named] = await Promise.all([universityById(env, f.university), typed ? universityByName(env, typed) : undefined]);
  return {
    byId: (id) => (id && picked?.id === id ? picked : undefined),
    byName: (name) => (named && fold(name) === fold(typed) ? named : undefined),
  };
}
