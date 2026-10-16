/**
 * Integration-test harness: runs the real app against LOCAL Postgres.
 *
 * Tests using it must be wrapped in `describe.skipIf(!HAS_DB)` — CI has no
 * database, so they skip there and run on a developer machine where
 * `npm run db:migrate` has been applied.
 */
import postgres from "postgres";
import app from "../src/index";
import { getDb } from "../src/db";
import { hashPassword, newId, randomToken, sha256 } from "../src/lib/crypto";
import { accounts, consents, events, profiles, registrations, sessions, type Role } from "../src/schema";
import { TERMS_CONSENT, TERMS_VERSION } from "../src/content/privacy";

export const ENV = { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev", NO_EXTERNAL: "1" };

async function probe(): Promise<boolean> {
  const sql = postgres(ENV.DATABASE_URL, { max: 1, connect_timeout: 2 });
  try {
    await sql`select 1 from identity_accounts limit 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export const HAS_DB = await probe();

export const db = () => getDb(ENV);

let cachedHash: { hash: string; salt: string } | null = null;
export const TEST_PASSWORD = "password123";

export type Member = { id: string; username: string; cookie: string; researchId: string };

/** A fully onboarded member with a live session. */
export async function createMember(
  opts: {
    role?: Role;
    birthDate?: string;
    district?: string;
    languages?: string[];
    interests?: string[];
    relationship?: string;
    romanceOn?: boolean;
    genderIdentity?: string | null;
    romanceOpenTo?: string[] | "everyone" | null;
    ageMin?: number;
    ageMax?: number;
    research?: boolean;
    bkkRegistered?: "verified" | "not_checked";
    nickname?: string;
  } = {},
): Promise<Member> {
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const id = newId();
  const username = `t_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  const researchId = newId();
  const d = db();
  // Consents first: a retention run from another test file (the research-consent sweep) must
  // never see this account holding a research_id before its research consent row exists.
  const cats = ["service", "safety", "personalization", "notifications", ...(opts.research ? ["research"] : [])];
  for (const category of cats) {
    await d.insert(consents).values({ id: newId(), accountId: id, category, granted: true, version: "test" });
  }
  await d.insert(accounts).values({
    id,
    username,
    passwordHash: cachedHash.hash,
    passwordSalt: cachedHash.salt,
    role: opts.role ?? "user",
    // A research_id exists only with research consent (privacy R7).
    researchId: opts.research ? researchId : null,
    bkkRegistered: opts.bkkRegistered ?? "not_checked",
  });
  await d.insert(profiles).values({
    accountId: id,
    nickname: opts.nickname ?? username,
    birthDate: opts.birthDate ?? "1996-05-01",
    district: opts.district ?? "bang_rak",
    languages: opts.languages ?? ["th", "en"],
    interests: opts.interests ?? ["food", "art"],
    intents: opts.romanceOn ? ["friends", "romance"] : ["friends"],
    relationship: opts.relationship ?? "single",
    romanceOn: opts.romanceOn ?? false,
    genderIdentity: opts.genderIdentity ?? null,
    romanceOpenTo: opts.romanceOpenTo ?? null,
    ageMin: opts.ageMin ?? 18,
    ageMax: opts.ageMax ?? 99,
    onboardedAt: new Date(),
  });
  // Agreed to the current Terms at sign-up, so Me shows no "updated Terms" card.
  await d.insert(consents).values({ id: newId(), accountId: id, category: TERMS_CONSENT, granted: true, version: TERMS_VERSION });
  const token = randomToken();
  await d.insert(sessions).values({ id: await sha256(token), accountId: id, expiresAt: new Date(Date.now() + 86_400_000) });
  return { id, username, cookie: `bkk_sid=${token}`, researchId };
}

/** Request the app as a member. `form` sends application/x-www-form-urlencoded. */
export async function req(
  path: string,
  opts: { cookie?: string; method?: string; form?: Record<string, string | string[]>; json?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | undefined;
  if (opts.form) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.form)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
    body = p.toString();
    headers["content-type"] = "application/x-www-form-urlencoded";
  } else if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers["content-type"] = "application/json";
  }
  return app.request(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body }, ENV);
}

/** A past event the member checked in to, so pages that wait for a first event (the tiles on Me) show. */
export async function attendedOnce(accountId: string): Promise<string> {
  const id = newId();
  const startsAt = new Date(Date.now() - 3 * 86_400_000);
  await db().insert(events).values({ id, title: `PAST-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3_600_000), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
  await db().insert(registrations).values({ id: newId(), eventId: id, accountId, status: "confirmed", passToken: randomToken(18), checkedInAt: startsAt });
  return id;
}
