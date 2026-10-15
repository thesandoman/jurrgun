/**
 * LOCAL demo: Bangkok Buddy and the dating features, using the dummy members
 * from scripts/seed-demo-event.ts (run that first). Never point this at the
 * deployed database. Idempotent: skips if the demo match exists.
 *
 *  - demo_fern + demo_jay: an active buddy pair, both "open to more" and in
 *    dating mode. Last week's quest is done (one stamp each); this week Jay has
 *    marked the quest done. Log in as demo_fern and confirm it: that is the
 *    second finished quest, so the district is stamped and the romance reveal
 *    unlocks (see /connections).
 *  - demo_arun + demo_max: a fresh proposal this round, waiting for both to say meet.
 *  - demo_toey: here for dating only. demo_pim, demo_mew, demo_ravi: in the buddy pool.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import { newId } from "../src/lib/crypto";
import { dayKey, pickQuest, weekKey } from "../src/domain/buddy";
import type { ArchetypeKey } from "../src/vibe/archetypes";
import { accounts, buddyMatches, buddyOptins, buddyQuests, buddyRounds, connections, datingIntents, passportStamps, profiles } from "../src/schema";

const env = { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev" };
const db = getDb(env);
const DAY = 86_400_000;
const MATCH_ID = "demo-buddy-fern-jay";

const [exists] = await db.select({ id: buddyMatches.id }).from(buddyMatches).where(eq(buddyMatches.id, MATCH_ID)).limit(1);
if (exists) {
  console.log("Buddy demo already there. Log in as demo_fern and open /buddy.");
  process.exit(0);
}

const names = ["fern", "jay", "arun", "max", "toey", "pim", "mew", "ravi"];
const rows = await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(inArray(accounts.username, names.map((n) => `demo_${n}`)));
const id = Object.fromEntries(rows.map((r) => [r.username.slice(5), r.id])) as Record<string, string>;
if (names.some((n) => !id[n])) throw new Error("Run scripts/seed-demo-event.ts first.");

const now = new Date();
const lastWeek = new Date(now.getTime() - 7 * DAY);

// Dating modes (private, from the first onboarding screen) and romance settings.
const dating: [string, "dating" | "dating_only", string[], string[], string, string[] | "everyone"][] = [
  ["fern", "dating", ["slow", "real_things"], ["swiping", "time"], "woman", "everyone"],
  ["jay", "dating", ["meet", "new_city"], ["language", "ghosting"], "non-binary", "everyone"],
  ["toey", "dating_only", ["long_term", "see"], ["fake", "safety", "pressure"], "woman", ["man", "non-binary"]],
];
for (const [n, mode, reasons, challenges, genderIdentity, romanceOpenTo] of dating) {
  await db.insert(datingIntents).values({ accountId: id[n], mode, reasons, challenges }).onConflictDoNothing();
  await db
    .update(profiles)
    .set({ relationship: "single", romanceOn: true, intents: mode === "dating_only" ? ["romance"] : ["friends", "romance"], genderIdentity, romanceOpenTo })
    .where(eq(profiles.accountId, id[n]));
}
for (const n of ["arun", "max", "pim", "mew", "ravi"]) {
  await db.insert(datingIntents).values({ accountId: id[n], mode: "friends" }).onConflictDoNothing();
}

// Buddy opt-ins. The intent is private: a buddy never sees the other's.
const intents: Record<string, string> = { fern: "open", jay: "open", arun: "friends", max: "activity", toey: "dating", pim: "friends", mew: "activity", ravi: "friends" };
await db.insert(buddyOptins).values(Object.entries(intents).map(([n, intent]) => ({ accountId: id[n], intent }))).onConflictDoNothing();

// Today's round already ran, so the demo stays as seeded until tomorrow's round.
await db.insert(buddyRounds).values({ week: dayKey(now), method: "stable", pool: 8, pairs: 1, ranAt: now }).onConflictDoNothing();

const pair = (x: string, y: string): [string, string] => (id[x] < id[y] ? [id[x], id[y]] : [id[y], id[x]]);

// Fern + Jay: matched last week, both said meet, now buddies in each other's circle.
const [fa, fb] = pair("fern", "jay");
const connectionId = newId();
await db.insert(connections).values({ id: connectionId, aAccount: fa, bAccount: fb, level: "activity", eventId: `buddy:${MATCH_ID}`, createdAt: lastWeek });
await db.insert(buddyMatches).values({ id: MATCH_ID, aAccount: fa, bAccount: fb, week: weekKey(lastWeek), state: "active", aMeetAt: lastWeek, bMeetAt: lastWeek, connectionId, createdAt: lastWeek });

const types: [ArchetypeKey, ArchetypeKey] = fa === id.fern ? ["BDMN", "CFMH"] : ["CFMH", "BDMN"];
const past = pickQuest(MATCH_ID, weekKey(lastWeek), types, new Set());
const pastId = newId();
await db.insert(buddyQuests).values({ id: pastId, matchId: MATCH_ID, week: weekKey(lastWeek), scenario: past.scenario, typeCode: past.typeCode, district: past.district, aDoneAt: lastWeek, bDoneAt: lastWeek, createdAt: lastWeek });
await db.insert(passportStamps).values([fa, fb].map((accountId) => ({ id: newId(), accountId, district: past.district, source: "buddy", questId: pastId, createdAt: lastWeek }))).onConflictDoNothing();

const cur = pickQuest(MATCH_ID, weekKey(now), types, new Set([past.district]));
const jayIsA = fa === id.jay;
await db.insert(buddyQuests).values({
  id: newId(),
  matchId: MATCH_ID,
  week: weekKey(now),
  scenario: cur.scenario,
  typeCode: cur.typeCode,
  district: cur.district,
  aDoneAt: jayIsA ? now : null,
  bDoneAt: jayIsA ? null : now,
  createdAt: now,
});

// Arun + Max: proposed in today's round, waiting for both to say meet.
const [aa, ab] = pair("arun", "max");
await db.insert(buddyMatches).values({ id: "demo-buddy-arun-max", aAccount: aa, bAccount: ab, week: weekKey(now), state: "proposed", createdAt: now });

console.log(`Buddy demo ready. Fern+Jay active (stamped ${past.district}; this week: ${cur.district}, Jay done). Arun+Max proposed. Toey: dating only.`);
process.exit(0);
