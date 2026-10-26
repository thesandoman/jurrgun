/**
 * LOCAL demo: seven fully lived-in accounts, as if each had used Jurrgun for
 * about two months, so every tab shows real-looking content when you log in
 * as them. All people, chats and reports are fictional.
 *
 *   npx vite-node scripts/seed-personas.ts            # create (skips if already there)
 *   npx vite-node scripts/seed-personas.ts --reset    # delete everything it made, then recreate
 *
 * Logins (password for all: bkksocial123):
 *   persona_expat          Daniel, 31, Australian in Thong Lo: newcomer, buddy, passport, chats, a pass
 *   persona_host_th        Krit, 34, Table Host (circle_head): regular tables, a circle, circle chat
 *   persona_woman_dating   Nam, 27, open to something more: a mutual romance connection, buddy, chats
 *   persona_lgbtq_dating   Ton, 29, gay man, open to something more: queer-friendly tables, romance match
 *   persona_mod            Fon, moderator: reports in every state, actions, notes, review queue
 *   persona_host           Ning, verified host: official events, groups, waitlists, no-shows, notices
 *   persona_partner        Oat, partner admin of "Soi Social Club (demo)", a fictional café
 * Supporting members log in as persona_x_<name> with the same password.
 *
 * Only ever touches rows it created: accounts named persona_*, events with ids
 * starting "persona-", the "persona-org-soi-social" partner org, and rows that
 * reference those. Refuses to run unless DATABASE_URL points at localhost.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, like, or, type Column } from "drizzle-orm";
import * as schema from "../src/schema";
import {
  accounts,
  auditLog,
  blocks,
  buddyMatches,
  buddyOptins,
  buddyPairs,
  buddyQuests,
  buddySwipes,
  chatMessages,
  chatReads,
  chatVotes,
  circleHeadRequests,
  circleShares,
  connectionChoices,
  connections,
  consents,
  contactShares,
  datingIntents,
  events,
  feedback,
  graduations,
  invites,
  loginAttempts,
  meetFeedback,
  moderationActions,
  notifications,
  oauthLinks,
  partnerOrgs,
  passportStamps,
  pitchJoins,
  planPitches,
  profiles,
  pulseQuestions,
  pulseResponses,
  registrations,
  reports,
  safeArrivals,
  sessions,
  strikes,
  thanks,
  vibes,
  weeklyPlans,
  wellbeing,
  type ProfileBio,
  type Role,
} from "../src/schema";
import { hashPassword, newId, randomToken } from "../src/lib/crypto";
import { ageBand, ageOn, resolveMutual, type Choice } from "../src/domain/rules";
import { pickQuest, weekKey } from "../src/domain/buddy";
import { monthKey, seasonQuestFor } from "../src/domain/seasons";
import { typeOf, type ArchetypeKey } from "../src/vibe/archetypes";

// ------------------------------------------------------------- safety --

// Node's fs, loaded by name so the Workers-only tsconfig still type-checks this script.
const FS = "node:fs";
let toml = "";
try {
  toml = ((await import(FS)) as { readFileSync(path: string, enc: string): string }).readFileSync("wrangler.toml", "utf8");
} catch {
  toml = "";
}
const DATABASE_URL = process.env.DATABASE_URL ?? /^DATABASE_URL\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? "";
let host = "";
try {
  host = new URL(DATABASE_URL).hostname;
} catch {
  host = "";
}
if (!DATABASE_URL.includes("localhost") || host !== "localhost") {
  console.error(`Refusing to run: DATABASE_URL must point at localhost (got "${host || "nothing"}"). This script is for your LOCAL database only.`);
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const RESET = process.argv.includes("--reset");
const PASSWORD = "bkksocial123";
const CONSENT_VERSION = "2026-10-proto";
const ORG_ID = "persona-org-soi-social";
const ORG_NAME = "Soi Social Club (demo)";

// -------------------------------------------------------------- time --

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);
/** `days` from today (negative = past) at hour:minute Bangkok time (UTC+7). */
function bkk(days: number, hour: number, minute = 0): Date {
  const l = new Date(NOW.getTime() + 7 * HOUR);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + days, hour - 7, minute));
}
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** Small deterministic hash, so reruns produce the same "random" details. */
function h(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return Math.abs(x);
}

// ------------------------------------------------------------- reset --

async function wipe(): Promise<void> {
  const people = await db.select({ id: accounts.id, researchId: accounts.researchId }).from(accounts).where(like(accounts.username, "persona\\_%"));
  const P = people.map((p) => p.id);
  const R = people.map((p) => p.researchId).filter((x): x is string => !!x);
  const evRows = await db
    .select({ id: events.id })
    .from(events)
    .where(P.length ? or(like(events.id, "persona-%"), inArray(events.hostAccountId, P), inArray(events.createdBy, P), eq(events.partnerOrgId, ORG_ID)) : like(events.id, "persona-%"));
  const E = evRows.map((e) => e.id);
  if (!P.length && !E.length) {
    await db.delete(partnerOrgs).where(eq(partnerOrgs.id, ORG_ID));
    return;
  }
  const inP = (col: Column) => (P.length ? inArray(col, P) : undefined);
  const inE = (col: Column) => (E.length ? inArray(col, E) : undefined);
  const matchRows = P.length ? await db.select({ id: buddyMatches.id }).from(buddyMatches).where(or(inP(buddyMatches.aAccount), inP(buddyMatches.bAccount))) : [];
  const M = matchRows.map((m) => m.id);
  const connRows = P.length ? await db.select({ id: connections.id }).from(connections).where(or(inP(connections.aAccount), inP(connections.bAccount))) : [];
  const C = connRows.map((x) => x.id);
  const msgRows = P.length ? await db.select({ id: chatMessages.id }).from(chatMessages).where(inP(chatMessages.sender)) : [];
  const pitchRows = P.length ? await db.select({ id: planPitches.id }).from(planPitches).where(inP(planPitches.accountId)) : [];

  if (msgRows.length) await db.delete(chatVotes).where(inArray(chatVotes.messageId, msgRows.map((m) => m.id)));
  if (M.length) await db.delete(buddyQuests).where(inArray(buddyQuests.matchId, M));
  if (C.length) {
    await db.delete(contactShares).where(inArray(contactShares.connectionId, C));
    await db.delete(graduations).where(inArray(graduations.connectionId, C));
  }
  if (pitchRows.length) await db.delete(pitchJoins).where(inArray(pitchJoins.pitchId, pitchRows.map((x) => x.id)));
  if (E.length) {
    await db.delete(buddyPairs).where(inE(buddyPairs.eventId)!);
    await db.delete(chatMessages).where(inArray(chatMessages.thread, E.map((e) => `circle:${e}`)));
  }
  await db.delete(registrations).where(or(inE(registrations.eventId), inP(registrations.accountId)));
  await db.delete(connectionChoices).where(or(inE(connectionChoices.eventId), inP(connectionChoices.fromAccount), inP(connectionChoices.toAccount)));
  await db.delete(feedback).where(or(inE(feedback.eventId), inP(feedback.accountId)));
  await db.delete(strikes).where(or(inE(strikes.eventId), inP(strikes.accountId)));
  await db.delete(invites).where(or(inE(invites.eventId), inP(invites.inviter)));
  await db.delete(circleShares).where(or(inE(circleShares.eventId), inP(circleShares.fromAccount), inP(circleShares.toAccount)));
  await db.delete(reports).where(or(inE(reports.targetEvent), inP(reports.reporter), inP(reports.targetAccount)));
  if (P.length) {
    await db.delete(connections).where(or(inP(connections.aAccount), inP(connections.bAccount)));
    await db.delete(contactShares).where(inP(contactShares.accountId)!);
    await db.delete(blocks).where(or(inP(blocks.blocker), inP(blocks.blocked)));
    await db.delete(moderationActions).where(or(inP(moderationActions.accountId), inP(moderationActions.by)));
    await db.delete(notifications).where(inP(notifications.accountId)!);
    await db.delete(vibes).where(inP(vibes.accountId)!);
    await db.delete(buddyMatches).where(or(inP(buddyMatches.aAccount), inP(buddyMatches.bAccount)));
    await db.delete(buddyOptins).where(inP(buddyOptins.accountId)!);
    await db.delete(buddySwipes).where(or(inP(buddySwipes.accountId), inP(buddySwipes.targetId)));
    await db.delete(passportStamps).where(inP(passportStamps.accountId)!);
    await db.delete(datingIntents).where(inP(datingIntents.accountId)!);
    await db.delete(chatMessages).where(inP(chatMessages.sender)!);
    await db.delete(chatVotes).where(inP(chatVotes.accountId)!);
    await db.delete(chatReads).where(inP(chatReads.accountId)!);
    await db.delete(safeArrivals).where(inP(safeArrivals.accountId)!);
    await db.delete(meetFeedback).where(inP(meetFeedback.accountId)!);
    await db.delete(weeklyPlans).where(inP(weeklyPlans.accountId)!);
    await db.delete(planPitches).where(inP(planPitches.accountId)!);
    await db.delete(pitchJoins).where(inP(pitchJoins.accountId)!);
    await db.delete(thanks).where(or(inP(thanks.fromAccount), inP(thanks.toAccount)));
    await db.delete(circleHeadRequests).where(inP(circleHeadRequests.accountId)!);
    await db.delete(auditLog).where(or(inP(auditLog.actor), inP(auditLog.targetId)));
    await db.delete(sessions).where(inP(sessions.accountId)!);
    await db.delete(oauthLinks).where(inP(oauthLinks.accountId)!);
    await db.delete(consents).where(inP(consents.accountId)!);
    await db.delete(profiles).where(inP(profiles.accountId)!);
  }
  if (E.length) await db.delete(auditLog).where(inArray(auditLog.targetId, E));
  if (R.length) {
    await db.delete(pulseResponses).where(inArray(pulseResponses.researchId, R));
    await db.delete(wellbeing).where(inArray(wellbeing.researchId, R));
  }
  await db.delete(loginAttempts).where(like(loginAttempts.username, "persona\\_%"));
  if (E.length) await db.delete(events).where(inArray(events.id, E));
  if (P.length) await db.delete(accounts).where(inArray(accounts.id, P));
  await db.delete(partnerOrgs).where(eq(partnerOrgs.id, ORG_ID));
  console.log(`Reset: removed ${P.length} persona accounts and ${E.length} persona events (and everything referencing them).`);
}

if (RESET) await wipe();

const [already] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, "persona_expat")).limit(1);
if (already) {
  console.log("Personas already seeded. Log in as persona_expat (password bkksocial123), or rerun with --reset to rebuild them.");
  await client.end();
  process.exit(0);
}

// ---------------------------------------------------------- accounts --

type Person = {
  key: string;
  username: string;
  role?: Role;
  nickname: string;
  birth: string;
  district: string;
  langs: string[];
  interests: string[];
  type: ArchetypeKey;
  /** rhythm and plan flavour: +1 / -1 / 0 */
  flavour?: [number, number];
  gender: "woman" | "man" | "non-binary";
  pronouns?: string;
  showPronouns?: boolean;
  relationship?: string;
  romance?: { identity: string; openTo: string[] | "everyone"; orientation?: string; orientationOpenTo?: string[]; showPrefs?: boolean };
  intents?: string[];
  newcomer?: boolean;
  locale?: "th" | "en";
  joinedDaysAgo: number;
  bio?: ProfileBio;
  status?: string;
  suspendedUntil?: Date;
  verified?: boolean;
  partner?: boolean;
  typeHidden?: boolean;
};

const text = (value: string) => ({ kind: "text", value });
const num = (kind: "slider" | "scale", value: number) => ({ kind, value });
const pick = (value: string) => ({ kind: "choice", value });

const PERSONAS: Person[] = [
  {
    key: "daniel",
    username: "persona_expat",
    nickname: "Daniel",
    birth: "1995-03-14",
    district: "watthana",
    langs: ["en", "th"],
    interests: ["street_food", "night_markets", "learning_thai", "running", "photo_walks", "cafe_hopping", "board_games_fallback", "craft_beer"],
    type: "BDMN",
    flavour: [-1, 1],
    gender: "man",
    pronouns: "he/him",
    showPronouns: true,
    relationship: "relationship",
    intents: ["friends", "explore"],
    newcomer: true,
    locale: "en",
    joinedDaysAgo: 62,
    bio: {
      comm: ["planner", "texter", "meme_sender"],
      occupation: "tech",
      education: "bsc",
      educationDetail: "Computer science",
      residency: "lives",
      story: "expat",
      bkkTime: "lt1y",
      hometown: "Melbourne, Australia",
      learning: "Thai, one menu at a time",
      learningLangs: ["th"],
      energy: "curious",
      weekend: "early_bird",
      pay: ["promptpay", "card"],
      bill: "split",
      travel: ["rail", "motosai", "boat"],
      spice: "medium",
      pets: "dogs",
      punctual: "on_time",
      rhythm: 2,
      budget: "300",
      activities: ["food", "language_exchange", "walk", "run"],
      meals: ["dinner", "dessert"],
      groupSize: "table",
      times: ["weekday_evening", "weekend_morning"],
      socialEnergy: "full",
      deck: ["show_visitor", "defend_street_food", "learning_now", "spice", "bts_boat", "together_try"],
      answers: {
        show_visitor: text("Talat Noi at golden hour, then a boat back up the river"),
        defend_street_food: text("Khao man gai from the cart on Soi 38. Fight me."),
        learning_now: text("Reading Thai menus without pointing. Currently 40% success."),
        spice: num("slider", 6),
        bts_boat: pick("boat"),
        together_try: text("A muay thai class where nobody minds that I'm terrible"),
      },
    },
  },
  {
    key: "krit",
    username: "persona_host_th",
    role: "circle_head",
    nickname: "Krit",
    birth: "1992-05-20",
    district: "bang_rak",
    langs: ["th", "en"],
    interests: ["running", "park_mornings", "street_food", "mookata", "board_games_fallback", "old_town_walks", "photo_walks", "hosting", "weekend_markets"],
    type: "BFMH",
    flavour: [-1, -1],
    gender: "man",
    relationship: "married",
    intents: ["friends", "activity-buddy"],
    locale: "th",
    joinedDaysAgo: 68,
    verified: true,
    bio: {
      comm: ["planner", "sticker_fan", "lets_meet"],
      occupation: "engineering",
      residency: "lives",
      story: "local",
      bkkTime: "always",
      hometown: "บางรัก",
      guide: true,
      energy: "chatty",
      weekend: "early_bird",
      pay: ["promptpay", "cash"],
      bill: "turns",
      travel: ["rail", "walk"],
      spice: "thai_hot",
      pets: "cats",
      punctual: "early",
      rhythm: 3,
      budget: "300",
      activities: ["run", "food", "walk", "board_game"],
      meals: ["breakfast", "dinner"],
      groupSize: "table",
      times: ["weekend_morning", "weekday_evening"],
      deck: ["perfect_soi", "comfort_meal", "early_late", "hidden_gem", "mango_sticky", "green_flag"],
      answers: {
        perfect_soi: text("เจริญกรุง 32 ตอนเช้า ก่อนร้านกาแฟเปิด เงียบแต่มีชีวิต"),
        comfort_meal: text("โจ๊กหมูใส่ไข่ หลังวิ่งลุมพินีรอบเช้า"),
        early_late: num("slider", 2),
        hidden_gem: text("ร้านข้าวมันไก่เจ้าเก่าหลังตลาดบางรัก ป้าจำทุกคนได้"),
        mango_sticky: pick("mango"),
        green_flag: text("คนที่มาก่อนเวลาแล้วช่วยจัดโต๊ะโดยไม่ต้องขอ"),
      },
    },
  },
  {
    key: "nam",
    username: "persona_woman_dating",
    nickname: "Nam",
    birth: "1999-08-02",
    district: "phaya_thai",
    langs: ["th", "en"],
    interests: ["cafe_hopping", "pottery", "thai_indie", "brunch", "film_photography", "night_markets", "yoga", "book_club"],
    type: "CDSN",
    flavour: [-1, 1],
    gender: "woman",
    pronouns: "she/her",
    relationship: "single",
    romance: { identity: "woman", openTo: ["man"], orientation: "straight", showPrefs: true },
    intents: ["friends", "romance"],
    locale: "th",
    joinedDaysAgo: 58,
    verified: true,
    bio: {
      comm: ["voice_noter", "emoji_fan", "lets_meet"],
      occupation: "creative",
      education: "bcomarts",
      educationDetail: "Communication design",
      residency: "lives",
      story: "province",
      bkkTime: "3to10",
      hometown: "เชียงใหม่",
      energy: "warm_slow",
      weekend: "lazy_brunch",
      pay: ["promptpay"],
      bill: "split",
      travel: ["rail", "walk"],
      spice: "mild",
      pets: "cats",
      punctual: "bit_late",
      rhythm: 2,
      budget: "600",
      activities: ["culture", "food", "workshop"],
      meals: ["lunch", "dessert"],
      groupSize: "small",
      times: ["weekend_afternoon", "weekday_evening"],
      deck: ["small_thing", "hidden_gem", "song_on_loop", "deep_talk", "sunrise_sunset", "rainy_day"],
      datingDeck: ["date_first", "date_looking_for", "date_view", "date_pace"],
      answers: {
        small_thing: text("กาแฟดริปแก้วแรกของวันเสาร์ที่อารีย์ แล้วไม่ต้องรีบไปไหน"),
        hidden_gem: text("ร้านเซรามิกเล็ก ๆ ในซอยอารีย์ 4 ที่ให้ลองปั้นเองได้"),
        song_on_loop: text("Polycat, ทุกเพลง"),
        deep_talk: num("scale", 4),
        sunrise_sunset: pick("sunset"),
        rainy_day: text("นั่งร้านหนังสือ ฟังเสียงฝน แล้วไม่ยอมกลับบ้าน"),
        date_first: text("เดินตลาดเช้าอารีย์ แล้วไปนั่งคาเฟ่ที่คุยกันได้ยิน"),
        date_looking_for: text("คนที่ใจดีกับพนักงานร้าน และไม่รีบ"),
        date_view: pick("riverside"),
        date_pace: num("scale", 2),
      },
    },
  },
  {
    key: "ton",
    username: "persona_lgbtq_dating",
    nickname: "Ton",
    birth: "1997-01-11",
    district: "ratchathewi",
    langs: ["th", "en"],
    interests: ["live_music", "karaoke", "dance", "musicals", "street_art", "rooftops", "pilates", "y_series"],
    type: "BDSN",
    flavour: [1, 1],
    gender: "man",
    pronouns: "he/him",
    showPronouns: true,
    relationship: "single",
    romance: { identity: "man", openTo: ["man", "non-binary"], orientation: "gay", orientationOpenTo: ["gay", "bi", "pan", "queer"], showPrefs: true },
    intents: ["friends", "explore", "romance"],
    locale: "th",
    joinedDaysAgo: 51,
    bio: {
      comm: ["meme_sender", "voice_noter", "caller"],
      occupation: "media",
      residency: "lives",
      story: "returnee",
      bkkTime: "1to3",
      hometown: "นครปฐม",
      energy: "playful",
      weekend: "night_owl",
      pay: ["ewallet", "card"],
      bill: "flex",
      travel: ["rail", "ride"],
      spice: "thai_hot",
      pets: "both",
      punctual: "bit_late",
      rhythm: 3,
      budget: "any",
      activities: ["culture", "food", "board_game"],
      meals: ["dinner", "dessert"],
      groupSize: "big",
      times: ["weekday_evening", "weekend_evening"],
      deck: ["ask_me_about", "unpopular_opinion", "karaoke_brave", "song_on_loop", "cat_dog", "city_wish"],
      datingDeck: ["date_first", "date_green_flag", "date_market", "date_plans"],
      answers: {
        ask_me_about: text("ซีรีส์วายทุกเรื่องตั้งแต่ปี 2016 และทำไมเรื่องนั้นจบไม่ดี"),
        unpopular_opinion: text("คาราโอเกะห้องเล็กสนุกกว่าคอนเสิร์ตใหญ่"),
        karaoke_brave: num("scale", 5),
        song_on_loop: text("Jeff Satur, Ghost"),
        cat_dog: pick("both"),
        city_wish: text("ทางเท้าที่เดินได้จริงตลอดถนนพญาไท"),
        date_first: text("ดูละครเวทีเล็ก ๆ แถวบางรัก แล้วไปกินข้าวต้มดึก"),
        date_green_flag: text("ร้องเพลงผิดคีย์ได้แบบไม่อาย"),
        date_market: pick("market"),
        date_plans: num("scale", 2),
      },
    },
  },
  {
    key: "fon",
    username: "persona_mod",
    role: "moderator",
    nickname: "Fon",
    birth: "1988-11-03",
    district: "dusit",
    langs: ["th", "en"],
    interests: ["books", "podcasts", "tea", "temple_visits", "volunteering", "psychology"],
    type: "CFMH",
    flavour: [-1, -1],
    gender: "woman",
    relationship: "prefer_not",
    locale: "th",
    joinedDaysAgo: 70,
    bio: { occupation: "government", residency: "lives", story: "local", bkkTime: "always", energy: "listener", weekend: "homebody", deck: ["best_advice", "happy_place", "tidy"], answers: { best_advice: text("ฟังให้จบก่อนตัดสิน"), happy_place: text("สวนสันติชัยปราการตอนเย็น"), tidy: num("scale", 5) } },
  },
  {
    key: "ning",
    username: "persona_host",
    role: "host",
    nickname: "Ning",
    birth: "1990-04-22",
    district: "pathum_wan",
    langs: ["th", "en"],
    interests: ["cooking", "street_food", "galleries", "practising_english", "hosting", "old_town_walks", "board_games_fallback"],
    type: "BDSH",
    flavour: [0, -1],
    gender: "woman",
    relationship: "prefer_not",
    locale: "en",
    joinedDaysAgo: 75,
    verified: true,
    bio: { occupation: "hospitality", residency: "lives", story: "local", bkkTime: "always", guide: true, energy: "chatty", weekend: "out_all_day", deck: ["show_visitor", "teach_30s", "group_size"], answers: { show_visitor: text("Yaowarat after dark, five stalls, no plan"), teach_30s: text("How to order khao man gai like a regular: 'mai sai nang'"), group_size: num("slider", 6) } },
  },
  {
    key: "oat",
    username: "persona_partner",
    role: "partner_admin",
    nickname: "Oat",
    birth: "1991-09-09",
    district: "phra_khanong",
    langs: ["th", "en"],
    interests: ["coffee_brewing", "open_mics", "small_business", "live_music", "latte_art_fallback"],
    type: "CDMN",
    flavour: [1, 0],
    gender: "man",
    relationship: "prefer_not",
    locale: "th",
    joinedDaysAgo: 66,
    partner: true,
    bio: { occupation: "own_business", residency: "lives", story: "province", bkkTime: "10plus", hometown: "ขอนแก่น", energy: "curious", deck: ["first_job", "coffee_cups", "hidden_gem"], answers: { first_job: text("บาริสต้าร้านเล็ก ๆ ที่ขอนแก่น"), coffee_cups: num("slider", 4), hidden_gem: text("Soi Social Club ก็ได้ ขอโปรโมตหน่อย") } },
  },
];

type X = Omit<Person, "username" | "joinedDaysAgo" | "bio"> & { joinedDaysAgo?: number; job?: string; line?: string };
const X_MEMBERS: X[] = [
  { key: "bow", nickname: "Bow", birth: "1998-02-17", district: "watthana", langs: ["th", "en"], interests: ["cafe_hopping", "old_town_walks", "thai_desserts", "practising_english"], type: "CFSH", flavour: [-1, -1], gender: "woman", job: "education", line: "Teaches Thai to kids on weekdays and to Daniel on weekends" },
  { key: "sofia", nickname: "Sofia", birth: "1996-06-30", district: "watthana", langs: ["en"], interests: ["learning_thai", "yoga", "brunch", "salsa_fallback"], type: "BDMN", gender: "woman", job: "education", line: "From Valencia, teaching English, learning Thai" },
  { key: "golf", nickname: "Golf", birth: "1993-01-05", district: "bang_kapi", langs: ["th"], interests: ["running", "football", "mookata"], type: "BFMH", gender: "man", job: "engineering", line: "วิ่งได้ กินเก่งกว่า" },
  { key: "mook", nickname: "Mook", birth: "2000-04-12", district: "chatuchak", langs: ["th", "en"], interests: ["weekend_markets", "thrifting", "film_photography"], type: "CDMN", gender: "woman", job: "student", line: "ป.โท ปีสุดท้าย หนีวิทยานิพนธ์มาเดินตลาด" },
  { key: "kenji", nickname: "Kenji", birth: "1991-10-02", district: "watthana", langs: ["ja", "en"], interests: ["ramen_fallback", "street_food", "photo_walks", "jazz"], type: "CDSH", gender: "man", job: "finance", line: "Osaka to Phrom Phong, still hunting the best noodle soup" },
  { key: "liam", nickname: "Liam", birth: "1997-03-22", district: "sathon", langs: ["en"], interests: ["live_music", "trivia", "craft_beer"], type: "BFSN", gender: "man", job: "media", line: "Dubliner, writes about food, quiz-night captain" },
  { key: "pete", nickname: "Pete", birth: "1996-09-14", district: "pathum_wan", langs: ["th", "en"], interests: ["board_games_fallback", "climbing", "coffee_brewing", "thai_indie"], type: "CDMH", gender: "man", relationship: "single", romance: { identity: "man", openTo: ["woman"], orientation: "straight" }, job: "tech", line: "Product designer, makes a decent pour-over" },
  { key: "beam", nickname: "Beam", birth: "1998-11-28", district: "phaya_thai", langs: ["th"], interests: ["games", "anime", "street_food"], type: "BFSN", gender: "man", relationship: "single", romance: { identity: "man", openTo: ["woman"], orientation: "straight" }, job: "office" },
  { key: "bank", nickname: "Bank", birth: "1995-05-03", district: "chatuchak", langs: ["th", "en"], interests: ["cycling", "plant_care", "weekend_markets", "film_photography"], type: "CDMN", gender: "man", relationship: "single", romance: { identity: "man", openTo: ["woman"], orientation: "straight" }, job: "science", line: "Plant nerd, weekend cyclist" },
  { key: "pond", nickname: "Pond", birth: "1995-07-19", district: "ratchathewi", langs: ["th", "en"], interests: ["theatre", "musicals", "cooking", "dance"], type: "BDSH", gender: "man", pronouns: "he/him", showPronouns: true, relationship: "single", romance: { identity: "man", openTo: ["man"], orientation: "gay" }, job: "arts", line: "Stage manager by day, karaoke menace by night" },
  { key: "hana", nickname: "Hana", birth: "1999-02-08", district: "huai_khwang", langs: ["ko", "en", "th"], interests: ["kpop", "dance", "korean_food", "learning_thai"], type: "BDMN", gender: "woman", pronouns: "she/her", showPronouns: true, job: "creative" },
  { key: "chloe", nickname: "Chloe", birth: "1994-12-01", district: "bang_rak", langs: ["fr", "en"], interests: ["galleries", "wine", "street_art", "baking"], type: "CDSN", gender: "non-binary", pronouns: "they/them", showPronouns: true, job: "creative", line: "Lyon to Charoen Krung, works in a gallery" },
  { key: "priya", nickname: "Priya", birth: "1997-08-25", district: "khlong_toei", langs: ["hi", "en"], interests: ["board_games_fallback", "yoga", "cooking"], type: "CFMN", gender: "woman", job: "health" },
  { key: "lukas", nickname: "Lukas", birth: "1992-01-30", district: "sathon", langs: ["de", "en"], interests: ["cycling", "khlong_kayak", "photo_walks"], type: "BDMH", gender: "man", job: "engineering", line: "Berliner, kayaks the khlongs on Sundays" },
  { key: "earth", nickname: "Earth", birth: "2001-03-03", district: "bang_sue", langs: ["th"], interests: ["running", "games", "esports"], type: "BFMN", gender: "man", job: "student" },
  { key: "tan", nickname: "Tan", birth: "1990-10-10", district: "bang_rak", langs: ["th", "en"], interests: ["running", "coffee_brewing", "old_town_walks"], type: "CFMH", gender: "man", job: "finance" },
  { key: "kwan", nickname: "Kwan", birth: "1996-04-04", district: "yan_nawa", langs: ["th"], interests: ["park_mornings", "baking", "cats"], type: "CFMN", gender: "woman", job: "health" },
  { key: "fah", nickname: "Fah", birth: "2002-06-16", district: "din_daeng", langs: ["th", "en"], interests: ["running", "kpop", "bubble_tea_fallback"], type: "BFMN", gender: "woman", job: "student" },
  { key: "ice", nickname: "Ice", birth: "2000-01-27", district: "phra_khanong", langs: ["th", "en"], interests: ["open_mics", "poetry", "cafe_hopping"], type: "CDSN", gender: "woman", job: "media" },
  { key: "arm", nickname: "Arm", birth: "1999-09-30", district: "bang_na", langs: ["th", "en"], interests: ["skateboarding", "street_art", "hip_hop"], type: "BDMN", gender: "man", job: "freelance" },
  { key: "mild", nickname: "Mild", birth: "2003-05-12", district: "lat_phrao", langs: ["th"], interests: ["webtoons", "baking", "art_toys"], type: "CFSN", gender: "woman", job: "student" },
  { key: "praew", nickname: "Praew", birth: "1992-07-07", district: "thon_buri", langs: ["th", "en"], interests: ["temple_visits", "river_boats", "thai_desserts"], type: "CFSH", gender: "woman", job: "government" },
  { key: "boss", nickname: "Boss", birth: "1997-12-12", district: "huai_khwang", langs: ["th"], interests: ["football", "mookata", "karaoke"], type: "BFSH", gender: "man", job: "retail" },
  { key: "amara", nickname: "Amara", birth: "1995-02-20", district: "watthana", langs: ["en"], interests: ["afrobeats_fallback", "brunch", "volunteering"], type: "BDSN", gender: "woman", job: "ngo", line: "Lagos-born, Bangkok-based, NGO comms" },
  { key: "rick", nickname: "Rick", birth: "1988-08-08", district: "khlong_toei", langs: ["en"], interests: ["nightlife", "craft_beer"], type: "BFSN", gender: "man", status: "suspended", suspendedUntil: plus(NOW, 8 * DAY), typeHidden: true },
  { key: "vince", nickname: "Vince", birth: "1993-03-03", district: "sathon", langs: ["en", "th"], interests: ["investing", "networking"], type: "BDMN", gender: "man", status: "banned", typeHidden: true },
  { key: "dom", nickname: "Dom", birth: "1991-11-11", district: "ratchathewi", langs: ["th", "en"], interests: ["nightlife", "street_food"], type: "BFSH", gender: "man", typeHidden: true },
];

const TEXT_POOL: [string, string, string][] = [
  ["show_visitor", "ไปตลาดน้อยตอนเย็น แล้วนั่งเรือข้ามฟาก", "Talat Noi at sunset, then the cross-river ferry"],
  ["comfort_meal", "ข้าวผัดกะเพราไข่ดาวไม่สุก", "Pad kra pao with a runny fried egg"],
  ["small_thing", "ได้ที่นั่งบน BTS ตอนเช้า", "Getting a seat on the morning BTS"],
  ["hidden_gem", "ร้านข้าวต้มเปิดดึกหลังตลาดห้วยขวาง", "A late-night rice soup place behind Huai Khwang market"],
  ["happy_place", "สวนเบญจกิติตอนหกโมงเช้า", "Benjakitti park at 6am"],
  ["together_try", "คลาสปั้นเซรามิก", "A pottery class"],
  ["perfect_soi", "อารีย์ซอย 1", "Ari Soi 1"],
  ["rainy_day", "นั่งร้านกาแฟดูฝน", "Watch the rain from a café window"],
];

function bioFor(x: X): ProfileBio {
  const n = h(x.key);
  const a = TEXT_POOL[n % TEXT_POOL.length];
  const b = TEXT_POOL[(n >> 3) % TEXT_POOL.length === n % TEXT_POOL.length ? (n % TEXT_POOL.length + 1) % TEXT_POOL.length : (n >> 3) % TEXT_POOL.length];
  const th = x.langs[0] === "th";
  return {
    occupation: x.job,
    residency: "lives",
    story: x.langs.includes("th") && th ? (n % 3 === 0 ? "province" : "local") : "expat",
    energy: ["chill", "curious", "chatty", "listener", "playful"][n % 5],
    deck: [a[0], b[0], "spice"],
    answers: { [a[0]]: text(th ? a[1] : a[2]), [b[0]]: text(x.line ?? (th ? b[1] : b[2])), spice: num("slider", n % 11) },
  };
}

const U: Record<string, string> = {};
const RID: Record<string, string> = {};
const PROFILE: Record<string, { birth: string; district: string }> = {};
const ROMANCE_ON = new Set<string>();

const { hash, salt } = await hashPassword(PASSWORD);
await db.insert(partnerOrgs).values({ id: ORG_ID, name: ORG_NAME, createdAt: ago(80 * DAY) }).onConflictDoNothing();

function cleanInterests(list: string[]): string[] {
  // A few labels above are human shorthand; map them onto real interest values.
  const map: Record<string, string> = {
    board_games_fallback: "games",
    latte_art_fallback: "coffee_brewing",
    salsa_fallback: "dance",
    ramen_fallback: "japanese_food",
    bubble_tea_fallback: "tea",
    afrobeats_fallback: "music_festivals",
  };
  return [...new Set(list.map((x) => map[x] ?? x))];
}

function vibeRow(code: ArchetypeKey, flavour: [number, number] = [0, 0], key: string) {
  const s = (i: number) => (code[i] === "BDMN"[i] ? 1 : -1) * (0.62 + (h(key + i) % 30) / 100);
  const vector = { energy: s(0), explore: s(1), motion: s(2), culture: s(3), rhythm: flavour[0] * 0.66, plan: flavour[1] * 0.64 };
  const r = typeOf(vector);
  return { vector, archetype: r.archetype, modifier: r.modifier, blend: { types: r.blend, unsure: [], consistency: 0.85 + (h(key) % 15) / 100 } };
}

async function createPerson(p: Person): Promise<void> {
  const id = newId();
  const researchId = newId();
  U[p.key] = id;
  RID[p.key] = researchId;
  PROFILE[p.key] = { birth: p.birth, district: p.district };
  const joined = ago(p.joinedDaysAgo * DAY);
  await db.insert(accounts).values({
    id,
    username: p.username,
    passwordHash: hash,
    passwordSalt: salt,
    role: p.role ?? "user",
    partnerOrgId: p.partner ? ORG_ID : null,
    status: p.status ?? "active",
    suspendedUntil: p.suspendedUntil ?? null,
    verification: p.verified ? "verified" : "none",
    bkkRegistered: p.verified ? "verified" : "not_checked",
    researchId,
    createdAt: joined,
  });
  const r = p.romance;
  if (r) ROMANCE_ON.add(p.key);
  await db.insert(profiles).values({
    accountId: id,
    nickname: p.nickname,
    birthDate: p.birth,
    district: p.district,
    languages: p.langs,
    interests: cleanInterests(p.interests),
    socialStyles: h(p.key) % 2 ? ["small_group", "coffee_talk"] : ["small_group", "activity"],
    eventStyle: ["weekday_evening", "weekend_morning", "weekend_afternoon", "weekend_night"][h(p.key) % 4],
    intents: p.intents ?? (r ? ["friends", "romance"] : ["friends"]),
    relationship: p.relationship ?? (r ? "single" : "prefer_not"),
    lastSingleSwitchAt: r ? plus(joined, HOUR) : null,
    romanceOn: !!r,
    genderIdentity: r?.identity ?? null,
    romanceOpenTo: r?.openTo ?? null,
    orientation: r?.orientation ?? null,
    orientationOpenTo: r?.orientationOpenTo ?? null,
    showDatingPrefs: r?.showPrefs ?? false,
    gender: p.gender,
    pronouns: p.pronouns ?? null,
    showPronouns: p.showPronouns ?? false,
    showResidentBadge: !!p.verified,
    bio: p.bio ?? {},
    newcomer: p.newcomer ?? false,
    locale: p.locale ?? (p.langs[0] === "th" ? "th" : "en"),
    onboardedAt: plus(joined, 20 * MIN),
    updatedAt: ago((p.joinedDaysAgo / 3) * DAY),
  });
  const cats = ["service", "safety", "personalization", "research", "notifications", ...(r ? ["romance_data"] : [])];
  await db.insert(consents).values(cats.map((category) => ({ id: newId(), accountId: id, category, granted: true, version: CONSENT_VERSION, createdAt: plus(joined, 10 * MIN) })));
  const v = vibeRow(p.type, p.flavour, p.key);
  await db.insert(vibes).values({ accountId: id, ...v, seen: [], visible: !p.typeHidden, takenAt: plus(joined, 5 * MIN) });
}

for (const p of PERSONAS) await createPerson(p);
for (const x of X_MEMBERS) {
  await createPerson({ ...x, username: `persona_x_${x.key}`, joinedDaysAgo: x.joinedDaysAgo ?? 30 + (h(x.key) % 50), bio: bioFor(x) });
}

// ------------------------------------------------------------ events --

type Ev = {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  start: Date;
  hours: number;
  venue: string;
  address: string;
  district: string;
  capacity: number;
  cost?: number;
  paymentNote?: string;
  tags: string[];
  intensity?: string;
  host: string;
  partner?: boolean;
  visibility?: "public" | "private";
  status?: string;
  buddy?: boolean;
  route?: string;
  groups?: boolean;
  submittedAt?: Date;
  accessibility?: string;
  safety?: string;
  languages?: string[];
  ageMin?: number;
  ageMax?: number;
  createdDaysBefore?: number;
};

const EV: Record<string, Ev> = {};
async function event(key: string, e: Ev): Promise<string> {
  EV[key] = e;
  await db.insert(events).values({
    id: e.id,
    title: e.title,
    titleEn: e.titleEn,
    description: e.description,
    descriptionEn: e.descriptionEn,
    startsAt: e.start,
    endsAt: plus(e.start, e.hours * HOUR),
    venueName: e.venue,
    venueAddress: e.address,
    mapUrl: `https://maps.google.com/?q=${encodeURIComponent(e.venue + ", Bangkok")}`,
    district: e.district,
    capacity: e.capacity,
    ageMin: e.ageMin ?? 18,
    ageMax: e.ageMax ?? 99,
    languages: e.languages ?? ["th", "en"],
    costThb: e.cost ?? 0,
    paymentNote: e.paymentNote ?? null,
    hostAccountId: U[e.host],
    partnerOrgId: e.partner ? ORG_ID : null,
    intensity: e.intensity ?? "social",
    groupMin: 4,
    groupMax: 6,
    plusOneAllowed: false,
    accessibility: e.accessibility ?? "",
    safetyInfo: e.safety ?? "Meet at the entrance; the host wears a green Jurrgun lanyard.",
    emergencyContact: "Host via the event page · Police 191 · Ambulance 1669 · Tourist police 1155",
    tags: e.tags,
    status: e.status ?? "published",
    visibility: e.visibility ?? "public",
    privateToken: e.visibility === "private" ? randomToken(18) : null,
    submittedAt: e.submittedAt ?? null,
    buddyEnabled: e.buddy ?? false,
    groupsPublishedAt: e.groups ? plus(e.start, -2 * HOUR) : null,
    visitBangkokRoute: e.route ?? null,
    createdBy: U[e.host],
    createdAt: plus(e.start, -(e.createdDaysBefore ?? 12) * DAY),
  });
  return e.id;
}

// Ning (verified host): official events.
await event("h1", {
  id: "persona-ev-language-table",
  title: "โต๊ะแลกเปลี่ยนภาษา ไทย อังกฤษ",
  titleEn: "Thai and English language table",
  description: "ครึ่งแรกคุยภาษาไทย ครึ่งหลังคุยภาษาอังกฤษ โต๊ะละ 4 ถึง 6 คน มีการ์ดคำถามให้ มาคนเดียวได้",
  descriptionEn: "First half in Thai, second half in English, tables of 4 to 6 with question cards. Coming alone is the norm.",
  start: bkk(-49, 14),
  hours: 2.5,
  venue: "TCDC, Grand Postal Building",
  address: "1160 Charoen Krung Rd, Bang Rak, Bangkok 10500",
  district: "bang_rak",
  capacity: 18,
  tags: ["language_exchange", "newcomers", "english_friendly", "step_free"],
  host: "ning",
  groups: true,
  accessibility: "Lift to the 5th floor, step-free throughout.",
});
await event("h2", {
  id: "persona-ev-yaowarat-crawl",
  title: "ตระเวนกินเยาวราชยามค่ำ",
  titleEn: "Yaowarat night food crawl",
  description: "เดินกินสตรีทฟู้ดเยาวราช 5 ร้าน เป็นกลุ่มเล็ก โฮสต์แบ่งกลุ่มให้ก่อนเริ่ม จบที่บัวลอยน้ำขิง",
  descriptionEn: "Five street-food stops in Yaowarat in small groups, sorted by the host before we start. Ends with ginger soup and sesame dumplings.",
  start: bkk(-28, 18),
  hours: 3.5,
  venue: "Wat Mangkon MRT, Exit 1",
  address: "Charoen Krung Rd, Samphanthawong, Bangkok 10100",
  district: "samphanthawong",
  capacity: 18,
  cost: 350,
  paymentNote: "Pay each stall yourself, about 350 THB for all five stops. Bring cash.",
  tags: ["food", "walk", "culture", "english_friendly"],
  host: "ning",
  groups: true,
});
await event("h3", {
  id: "persona-ev-queer-picnic",
  title: "ปิกนิกเป็นมิตรกับ LGBTQ+ ที่เบญจกิติ",
  titleEn: "Queer-friendly picnic at Benjakitti",
  description: "ปิกนิกเย็นวันอาทิตย์ ใครก็มาได้ ขอแค่ใจดีกับกัน เอาขนมมาแบ่งกันคนละอย่าง",
  descriptionEn: "A Sunday evening picnic for LGBTQ+ folks and friends. Bring one snack to share and your kindest self.",
  start: bkk(-14, 16),
  hours: 2.5,
  venue: "Benjakitti Forest Park, Gate 3 lawn",
  address: "Ratchadaphisek Rd, Khlong Toei, Bangkok 10110",
  district: "khlong_toei",
  capacity: 30,
  tags: ["queer_friendly", "lgbtq_community", "english_friendly", "daytime"],
  host: "ning",
  intensity: "chill",
});
await event("h4", {
  id: "persona-ev-board-games",
  title: "บอร์ดเกมหลังเลิกงาน",
  titleEn: "After-work board games",
  description: "เกมง่าย ๆ ที่เล่นแป๊บเดียวก็เข้าใจ โต๊ะละ 4 ถึง 6 คน ไม่ต้องดื่ม ไม่ต้องรู้จักใครมาก่อน",
  descriptionEn: "Easy games you learn in minutes, tables of 4 to 6. No drinking needed, no need to know anyone.",
  start: bkk(-10, 19),
  hours: 2.5,
  venue: "A board-game café near BTS Victory Monument",
  address: "Phaya Thai Rd, Ratchathewi, Bangkok 10400",
  district: "ratchathewi",
  capacity: 18,
  cost: 150,
  paymentNote: "150 THB table fee at the café, includes one drink.",
  tags: ["board_game", "english_friendly", "newcomers"],
  host: "ning",
  intensity: "chill",
  groups: true,
});
await event("h5", {
  id: "persona-ev-riverside-walk",
  title: "เดินเล่นริมน้ำเจริญกรุง เช้าวันหยุด",
  titleEn: "Weekend morning riverside walk, Charoen Krung",
  description: "เดินช้า ๆ จากท่าเรือสี่พระยาถึงตลาดน้อย แวะกาแฟกับขนมไทย ประมาณ 2 กม.",
  descriptionEn: "A slow walk from Si Phraya pier to Talat Noi with coffee and Thai sweets on the way, about 2 km.",
  start: bkk(-1, 9),
  hours: 2.5,
  venue: "Si Phraya pier",
  address: "Charoen Krung Soi 30, Bang Rak, Bangkok 10500",
  district: "bang_rak",
  capacity: 14,
  tags: ["walk", "culture", "daytime", "english_friendly"],
  host: "ning",
  intensity: "chill",
});
await event("h6", {
  id: "persona-ev-cooking-class",
  title: "คลาสทำอาหารไทยสำหรับคนมาใหม่",
  titleEn: "Thai cooking class for newcomers",
  description: "ทำต้มยำ ผัดกะเพรา และข้าวเหนียวมะม่วง แบ่งเป็นสถานีละ 4 คน แล้วนั่งกินด้วยกัน",
  descriptionEn: "Cook tom yum, pad kra pao and mango sticky rice at stations of four, then sit down and eat together.",
  start: bkk(5, 10),
  hours: 3,
  venue: "A cooking school on Sukhumvit Soi 49",
  address: "Sukhumvit Soi 49, Watthana, Bangkok 10110",
  district: "watthana",
  capacity: 12,
  cost: 890,
  paymentNote: "890 THB paid at the school, ingredients included.",
  tags: ["food", "workshop", "newcomers", "english_friendly"],
  host: "ning",
  createdDaysBefore: 16,
});
await event("h7", {
  id: "persona-ev-talat-phlu-quest",
  title: "ซิตี้เควสต์: ตลาดพลู",
  titleEn: "City Quest: Talat Phlu market",
  description: "เดินตามเส้นทาง VisitBangkok กับโฮสต์ ชิมของดังตลาดพลู เก็บแสตมป์เขตธนบุรีลงพาสปอร์ต",
  descriptionEn: "Walk an official VisitBangkok route with a host, taste Talat Phlu's classics and stamp Thon Buri in your passport.",
  start: bkk(12, 9, 30),
  hours: 3,
  venue: "Talat Phlu",
  address: "Thoet Thai Rd, Thon Buri, Bangkok 10600",
  district: "thon_buri",
  capacity: 18,
  tags: ["city_quest", "food", "culture", "daytime"],
  host: "ning",
  route: "talat_phlu",
  buddy: true,
});
await event("h8", {
  id: "persona-ev-queer-game-night",
  title: "คืนบอร์ดเกมเป็นมิตรกับ LGBTQ+",
  titleEn: "Queer-friendly board game night",
  description: "เกมปาร์ตี้สนุก ๆ สำหรับชาว LGBTQ+ และเพื่อน ๆ โต๊ะละ 4 ถึง 6 คน",
  descriptionEn: "Party games for LGBTQ+ folks and friends, tables of 4 to 6.",
  start: bkk(19, 19),
  hours: 2.5,
  venue: "A board-game café near BTS Victory Monument",
  address: "Phaya Thai Rd, Ratchathewi, Bangkok 10400",
  district: "ratchathewi",
  capacity: 16,
  cost: 150,
  tags: ["board_game", "queer_friendly", "lgbtq_community", "english_friendly"],
  host: "ning",
  intensity: "chill",
});
await event("h9", {
  id: "persona-ev-song-wat-draft",
  title: "เดินชมสตรีทอาร์ตทรงวาด",
  titleEn: "Song Wat street art walk",
  description: "ร่าง: เดินดูงานสตรีทอาร์ตและตึกเก่าย่านทรงวาด",
  descriptionEn: "Draft: street art and old shophouses along Song Wat Road.",
  start: bkk(26, 16),
  hours: 2,
  venue: "Song Wat Road",
  address: "Song Wat Rd, Samphanthawong, Bangkok 10100",
  district: "samphanthawong",
  capacity: 14,
  tags: ["art", "walk", "culture"],
  host: "ning",
  status: "draft",
  createdDaysBefore: 3,
});

// Krit (Table Host): regular tables and private circle hangouts.
await event("k1", {
  id: "persona-ev-lumphini-run-1",
  title: "วิ่งเบา ๆ ลุมพินี แล้วไปกินโจ๊ก",
  titleEn: "Easy Lumphini run, then jok",
  description: "วิ่งหรือเดินเร็ว 5 กม. รอบสวนลุมพินีตามจังหวะกลุ่ม แล้วไปกินโจ๊กสามย่านด้วยกัน ไม่ต้องเร็ว แค่มาให้ทัน",
  descriptionEn: "Run or brisk-walk 5 km around Lumphini at the group's pace, then rice porridge in Sam Yan. No need to be fast, just show up.",
  start: bkk(-42, 6, 30),
  hours: 2,
  venue: "Lumphini Park, King Rama VI statue gate",
  address: "Rama IV Rd, Pathum Wan, Bangkok 10330",
  district: "pathum_wan",
  capacity: 12,
  tags: ["run", "food", "daytime"],
  host: "krit",
  submittedAt: bkk(-50, 21),
});
await event("k2", {
  id: "persona-ev-lumphini-run-2",
  title: "วิ่งเบา ๆ ลุมพินี แล้วไปกินโจ๊ก",
  titleEn: "Easy Lumphini run, then jok",
  description: "รอบที่สอง ขาประจำและคนใหม่ วิ่ง 5 กม. แล้วกินโจ๊ก",
  descriptionEn: "Round two for regulars and new faces: 5 km, then jok.",
  start: bkk(-21, 6, 30),
  hours: 2,
  venue: "Lumphini Park, King Rama VI statue gate",
  address: "Rama IV Rd, Pathum Wan, Bangkok 10330",
  district: "pathum_wan",
  capacity: 12,
  tags: ["run", "food", "daytime", "english_friendly"],
  host: "krit",
  submittedAt: bkk(-30, 20),
});
await event("k3", {
  id: "persona-ev-regulars-mookata",
  title: "มื้อเย็นขาประจำ: หมูกระทะบางรัก",
  titleEn: "Regulars' dinner: mookata in Bang Rak",
  description: "แฮงเอาต์ส่วนตัวของโต๊ะประจำวิ่งลุมพินี หมูกระทะร้านเดิม หารกัน",
  descriptionEn: "A private hangout for the Lumphini runners' regular table. Our usual mookata place, split the bill.",
  start: bkk(-4, 18, 30),
  hours: 2.5,
  venue: "A mookata place on Surawong Rd",
  address: "Surawong Rd, Bang Rak, Bangkok 10500",
  district: "bang_rak",
  capacity: 10,
  cost: 300,
  paymentNote: "Split the bill, about 300 THB each.",
  tags: ["food"],
  host: "krit",
  visibility: "private",
  createdDaysBefore: 7,
});
await event("k4", {
  id: "persona-ev-lumphini-run-3",
  title: "วิ่งเบา ๆ ลุมพินี แล้วไปกินโจ๊ก",
  titleEn: "Easy Lumphini run, then jok",
  description: "รอบที่สาม มือใหม่ยินดีต้อนรับ มีกลุ่มเดินเร็วด้วย",
  descriptionEn: "Round three. Beginners welcome, there's a brisk-walk group too.",
  start: bkk(6, 6, 30),
  hours: 2,
  venue: "Lumphini Park, King Rama VI statue gate",
  address: "Rama IV Rd, Pathum Wan, Bangkok 10330",
  district: "pathum_wan",
  capacity: 12,
  tags: ["run", "food", "daytime", "english_friendly", "newcomers"],
  host: "krit",
  submittedAt: bkk(-6, 21),
});
await event("k5", {
  id: "persona-ev-regulars-chatuchak",
  title: "ขาประจำ: เดินจตุจักรวันเสาร์",
  titleEn: "Regulars: Saturday wander at Chatuchak",
  description: "แฮงเอาต์ส่วนตัว เดินจตุจักรช่วงเช้าก่อนร้อน แล้วกินก๋วยเตี๋ยวเรือ",
  descriptionEn: "Private hangout: Chatuchak in the morning before the heat, then boat noodles.",
  start: bkk(13, 9),
  hours: 3,
  venue: "Chatuchak Weekend Market, Gate 1",
  address: "Kamphaeng Phet 2 Rd, Chatuchak, Bangkok 10900",
  district: "chatuchak",
  capacity: 8,
  tags: ["walk", "food", "daytime"],
  host: "krit",
  visibility: "private",
  createdDaysBefore: 2,
});
await event("k6", {
  id: "persona-ev-talat-noi-photo-walk",
  title: "เดินถ่ายรูปกลางคืน ตลาดน้อย",
  titleEn: "Night photo walk in Talat Noi",
  description: "เดินถ่ายรูปตรอกซอกซอยตลาดน้อยตอนค่ำ ใช้มือถือก็ได้ จบที่ร้านกาแฟริมน้ำ",
  descriptionEn: "Photograph Talat Noi's alleys after dark, phones are fine. Ends at a riverside café.",
  start: bkk(20, 18),
  hours: 2.5,
  venue: "Talat Noi, Soi Wanit 2",
  address: "Soi Wanit 2, Samphanthawong, Bangkok 10100",
  district: "samphanthawong",
  capacity: 10,
  tags: ["walk", "art", "culture"],
  host: "krit",
  status: "pending",
  submittedAt: ago(20 * HOUR),
  createdDaysBefore: 1,
});

// Oat (partner admin): Soi Social Club events.
await event("p1", {
  id: "persona-ev-coffee-cupping",
  title: "ชิมกาแฟและคุยกัน ที่ Soi Social Club",
  titleEn: "Coffee cupping and conversation at Soi Social Club",
  description: "ชิมกาแฟไทย 4 แหล่งปลูก เรียนวิธีชิมแบบบาริสต้า แล้วคุยกันเป็นโต๊ะเล็ก",
  descriptionEn: "Taste coffees from four Thai farms, learn to cup like a barista, then chat at small tables.",
  start: bkk(-35, 10),
  hours: 2,
  venue: "Soi Social Club (demo), Sukhumvit 71",
  address: "Sukhumvit Soi 71, Phra Khanong, Bangkok 10110",
  district: "phra_khanong",
  capacity: 14,
  cost: 250,
  paymentNote: "250 THB at the café, includes all tastings.",
  tags: ["food", "workshop", "english_friendly", "step_free"],
  host: "oat",
  partner: true,
});
await event("p2", {
  id: "persona-ev-open-mic",
  title: "โอเพนไมค์และขนมไทย",
  titleEn: "Open mic and Thai snacks night",
  description: "อ่านกลอน เล่นดนตรี หรือแค่มาฟัง ลงชื่อได้คนละ 5 นาที มีขนมไทยให้",
  descriptionEn: "Read a poem, play a song, or just listen. Five minutes each on the sign-up sheet, Thai snacks on the house.",
  start: bkk(-8, 19),
  hours: 2.5,
  venue: "Soi Social Club (demo), Sukhumvit 71",
  address: "Sukhumvit Soi 71, Phra Khanong, Bangkok 10110",
  district: "phra_khanong",
  capacity: 20,
  tags: ["art", "english_friendly"],
  host: "oat",
  partner: true,
  intensity: "very_social",
});
await event("p3", {
  id: "persona-ev-singles-supper",
  title: "ซัปเปอร์คลับคนโสด 💘",
  titleEn: "Singles' supper club 💘",
  description: "มื้อค่ำโต๊ะยาวสำหรับคนที่เปิดใจมากกว่าเพื่อน นั่งสลับที่ทุกคอร์ส บรรยากาศสบาย ๆ ไม่กดดัน",
  descriptionEn: "A long-table supper for members open to something more. Swap seats each course, relaxed and no pressure.",
  start: bkk(8, 19),
  hours: 2.5,
  venue: "Soi Social Club (demo), Sukhumvit 71",
  address: "Sukhumvit Soi 71, Phra Khanong, Bangkok 10110",
  district: "phra_khanong",
  capacity: 16,
  cost: 650,
  paymentNote: "650 THB set menu, paid at the café.",
  tags: ["food", "open_to_more", "english_friendly"],
  host: "oat",
  partner: true,
  ageMin: 24,
  ageMax: 40,
});
await event("p4", {
  id: "persona-ev-latte-art",
  title: "เวิร์กช็อปลาเต้อาร์ต",
  titleEn: "Latte art workshop",
  description: "ฝึกเทนมเป็นรูปหัวใจและใบไม้กับบาริสต้าของร้าน กลุ่มละ 5 คน",
  descriptionEn: "Pour hearts and rosettas with our baristas, groups of five.",
  start: bkk(16, 14),
  hours: 2,
  venue: "Soi Social Club (demo), Sukhumvit 71",
  address: "Sukhumvit Soi 71, Phra Khanong, Bangkok 10110",
  district: "phra_khanong",
  capacity: 10,
  cost: 450,
  paymentNote: "450 THB at the café, milk and coffee included.",
  tags: ["workshop", "food"],
  host: "oat",
  partner: true,
});

// ----------------------------------------------------- registrations --

type RegOpts = { status?: string; in?: boolean; group?: number; noShow?: boolean; buddy?: boolean; signal?: string; topics?: string[]; offeredUntil?: Date; cancelledAt?: Date; createdAt?: Date };
const REG: Record<string, string> = {};
async function reg(ev: string, who: string, o: RegOpts = {}): Promise<void> {
  const e = EV[ev];
  const id = newId();
  REG[`${ev}:${who}`] = id;
  const checkedInAt = o.in ? plus(e.start, ((h(ev + who) % 35) - 12) * MIN) : null;
  await db.insert(registrations).values({
    id,
    eventId: e.id,
    accountId: U[who],
    status: o.status ?? "confirmed",
    offeredUntil: o.offeredUntil ?? null,
    wantsBuddy: o.buddy ?? false,
    passToken: randomToken(18),
    checkedInAt,
    checkedInBy: checkedInAt ? U[e.host] : null,
    checkInMethod: checkedInAt ? (h(who) % 4 === 0 ? "manual" : "scan") : null,
    groupNo: o.group ?? null,
    socialSignal: o.signal ?? null,
    signalTopics: o.topics ?? null,
    noShowRecorded: o.noShow ?? false,
    createdAt: o.createdAt ?? plus(e.start, -((h(who + ev) % 9) + 2) * DAY),
    cancelledAt: o.cancelledAt ?? null,
  });
}
/** Past event: everyone in `groups` checked in (group index + 1, unless no groups were published). */
async function attended(ev: string, groups: string[][], extra: { noShows?: string[]; signals?: Record<string, [string, string[]?]> } = {}) {
  const e = EV[ev];
  for (const [i, g] of groups.entries()) for (const who of g) {
    const sig = extra.signals?.[who];
    await reg(ev, who, { in: true, group: e.groups ? i + 1 : undefined, signal: sig?.[0], topics: sig?.[1] });
  }
  for (const who of extra.noShows ?? []) await reg(ev, who, { noShow: true });
}

await attended("h1", [["daniel", "sofia", "golf", "mook"], ["fah", "earth", "praew"], ["liam", "hana", "amara", "rick"]], {
  noShows: ["boss", "mild"],
  signals: { daniel: ["talk_about", ["Learning Thai", "Melbourne coffee"]], sofia: ["new_friends"], hana: ["say_hi"] },
});
await attended("h2", [["daniel", "nam", "kenji", "mook", "rick"], ["ton", "liam", "chloe", "arm"], ["ice", "dom", "tan", "vince"]], { signals: { nam: ["small_group"], ton: ["say_hi"] } });
await reg("h2", "golf", { status: "late_cancelled", cancelledAt: plus(EV.h2.start, -5 * HOUR) });
await attended("k1", [["golf", "fah", "earth", "tan", "kwan", "boss", "arm"]], { noShows: ["praew"] });
await attended("p1", [["krit", "tan", "kwan", "earth", "golf", "mild", "praew", "lukas", "amara", "chloe"]]);
await attended("k2", [["daniel", "golf", "earth", "tan", "kwan", "fah", "boss", "ice"]], { signals: { daniel: ["new_friends"] } });
await attended("h3", [["ton", "pond", "hana", "chloe", "liam", "amara", "mild", "boss", "praew"]], { signals: { ton: ["open_to_spark"], pond: ["say_hi"] } });
await attended("h4", [["nam", "pete", "beam", "daniel", "priya", "krit"], ["sofia", "kenji", "earth", "mook"], ["lukas", "fah"]]);
await attended("p2", [["nam", "ice", "mook", "priya", "kenji", "hana", "lukas", "tan", "boss", "mild", "sofia", "arm"]]);
for (const who of ["daniel", "golf", "earth", "tan", "kwan", "fah", "boss"]) await reg("k3", who, { in: true });
await attended("h5", [["daniel", "ton", "lukas", "amara", "chloe", "arm", "mild"]]);

// Upcoming.
for (const who of ["daniel", "ton", "sofia", "kenji", "liam", "hana", "chloe", "priya", "lukas", "amara", "arm"]) await reg("h6", who);
await reg("h6", "boss", { status: "offered", offeredUntil: plus(NOW, 9 * HOUR), createdAt: ago(5 * DAY) });
for (const [i, who] of ["nam", "fah", "earth"].entries()) await reg("h6", who, { status: "waitlisted", createdAt: ago((3 - i) * DAY) });
for (const who of ["nam", "pete", "mook", "ice", "praew", "tan", "kwan"]) await reg("h7", who, { buddy: who === "nam" || who === "ice" });
for (const who of ["ton", "pond", "hana", "chloe", "mild", "boss"]) await reg("h8", who);
for (const who of ["daniel", "golf", "earth", "tan", "kwan", "fah", "ice"]) await reg("k4", who);
for (const who of ["golf", "tan", "kwan"]) await reg("k5", who);
for (const who of ["nam", "pete", "beam", "bank", "ton", "pond"]) await reg("p3", who);
for (const who of ["krit", "kwan", "fah", "mook", "earth", "lukas"]) await reg("p4", who);

// No-shows and late cancels (strikes, one waived by the host).
const strikeRows: { who: string; ev: string; reason: string; waived?: string }[] = [
  { who: "boss", ev: "h1", reason: "no_show", waived: "Flooded soi, messaged the host before start" },
  { who: "mild", ev: "h1", reason: "no_show" },
  { who: "golf", ev: "h2", reason: "late_cancel" },
  { who: "praew", ev: "k1", reason: "no_show" },
];
for (const s of strikeRows) {
  const at = plus(EV[s.ev].start, EV[s.ev].hours * HOUR + HOUR);
  await db.insert(strikes).values({ id: newId(), accountId: U[s.who], eventId: EV[s.ev].id, reason: s.reason, expiresAt: plus(at, 90 * DAY), waivedBy: s.waived ? U[EV[s.ev].host] : null, waivedReason: s.waived ?? null, createdAt: at });
}

// ---------------------------------------------------------- feedback --

const COMMENTS = [
  "Loved the small tables, easy to talk.",
  "โฮสต์ใจดีมาก รู้สึกสบายใจ",
  "Great mix of people, would come again.",
  "อยากให้มีที่นั่งพักมากกว่านี้หน่อย",
  "The question cards really helped break the ice.",
  "ได้เพื่อนใหม่สองคน ขอบคุณค่ะ",
  "",
  "A bit loud near the end, otherwise perfect.",
];
async function fb(ev: string, who: string, o: { safe?: number; heard?: number; rating?: number; met?: boolean; again?: boolean; comment?: string } = {}) {
  const n = h(ev + who);
  await db.insert(feedback).values({
    id: newId(),
    eventId: EV[ev].id,
    accountId: U[who],
    metNewPerson: o.met ?? n % 7 !== 0,
    wouldMeetAgain: o.again ?? n % 5 !== 0,
    feltSafe: o.safe ?? 4 + (n % 2),
    feltHeard: o.heard ?? 3 + (n % 3),
    groupRating: o.rating ?? 4 + ((n >> 2) % 2),
    comment: o.comment ?? COMMENTS[n % COMMENTS.length],
    createdAt: plus(EV[ev].start, (EV[ev].hours + 3 + (n % 20)) * HOUR),
  });
}
await fb("h1", "daniel", { safe: 5, heard: 5, rating: 5, met: true, again: true, comment: "Brilliant way to practise Thai without feeling silly. Sofia and Golf were great." });
for (const w of ["sofia", "golf", "mook", "fah", "praew", "liam", "hana"]) await fb("h1", w);
await fb("h2", "daniel", { safe: 5, heard: 4, rating: 5, met: true, again: true, comment: "Best night out since I moved here. The ginger soup at the end!" });
await fb("h2", "nam", { safe: 4, heard: 4, rating: 4, met: true, again: true, comment: "อร่อยทุกร้าน แต่คนเยอะมากช่วงสองทุ่ม" });
await fb("h2", "ton", { safe: 5, heard: 5, rating: 5, comment: "สนุกมาก กลุ่มเราคุยกันไม่หยุด" });
for (const w of ["kenji", "liam", "chloe", "ice", "tan", "arm"]) await fb("h2", w);
for (const w of ["golf", "fah", "earth", "tan", "kwan", "arm"]) await fb("k1", w, { comment: ["วิ่งสบาย ๆ โจ๊กอร่อย", "Krit keeps the pace friendly", "มาอีกแน่นอน", "", "ชอบที่ไม่กดดันเรื่องความเร็ว", ""][h(w) % 6] });
await fb("k2", "daniel", { safe: 5, heard: 5, rating: 5, met: true, again: true, comment: "Krit made me feel like a regular on my first run." });
for (const w of ["golf", "earth", "tan", "kwan", "ice"]) await fb("k2", w);
await fb("h3", "ton", { safe: 5, heard: 5, rating: 5, met: true, again: true, comment: "ปลอดภัย อบอุ่น อยากให้จัดทุกเดือน" });
for (const w of ["pond", "hana", "chloe", "liam", "amara", "praew"]) await fb("h3", w);
await fb("h4", "nam", { safe: 5, heard: 4, rating: 5, met: true, again: true, comment: "โต๊ะเราเล่น Codenames กันจนร้านปิด" });
await fb("h4", "daniel", { safe: 5, heard: 4, rating: 4, met: true, again: true, comment: "Fun table. Would love a slightly quieter corner next time." });
await fb("h4", "krit", { safe: 5, heard: 5, rating: 5, met: true, again: true, comment: "ได้ไอเดียไปจัดโต๊ะประจำเพิ่ม" });
for (const w of ["pete", "beam", "priya", "sofia", "kenji", "mook"]) await fb("h4", w);
await fb("p1", "krit", { safe: 5, heard: 5, rating: 5, comment: "กาแฟน่านอร่อยมาก" });
for (const w of ["tan", "kwan", "earth", "golf", "lukas", "amara", "chloe"]) await fb("p1", w);
await fb("p2", "nam", { safe: 5, heard: 5, rating: 4, met: true, again: true, comment: "อ่านกลอนครั้งแรก ทุกคนปรบมือให้ ใจฟูมาก" });
for (const w of ["ice", "mook", "priya", "kenji", "hana", "lukas", "tan"]) await fb("p2", w);
await fb("p2", "boss", { safe: 4, heard: 3, rating: 3, comment: "เสียงดังไปหน่อยช่วงท้าย" });
for (const w of ["lukas", "amara", "chloe"]) await fb("h5", w);

// ------------------------------------------- People I Met: choices + connections --

const CONN: Record<string, string> = {};
/** Both private choices; a connection only when they're mutual (domain/rules.ts resolveMutual). */
async function met(ev: string, x: string, y: string, cx: Choice, cy: Choice, connId?: string): Promise<string | null> {
  const e = EV[ev];
  const at = plus(e.start, (e.hours + 2 + (h(x + y) % 30)) * HOUR);
  await db.insert(connectionChoices).values([
    { id: newId(), eventId: e.id, fromAccount: U[x], toAccount: U[y], choice: cx, createdAt: at },
    { id: newId(), eventId: e.id, fromAccount: U[y], toAccount: U[x], choice: cy, createdAt: plus(at, 3 * HOUR) },
  ]);
  const level = resolveMutual(cx, cy, ROMANCE_ON.has(x) && ROMANCE_ON.has(y));
  if (!level) return null;
  const [a, b] = U[x] < U[y] ? [U[x], U[y]] : [U[y], U[x]];
  const id = connId ?? `persona-conn-${x}-${y}-${ev}`;
  await db.insert(connections).values({ id, aAccount: a, bAccount: b, level, eventId: e.id, createdAt: plus(at, 3 * HOUR) });
  CONN[`${x}-${y}`] = id;
  CONN[`${y}-${x}`] = id;
  return id;
}
async function oneWay(ev: string, from: string, to: string, c: Choice) {
  await db.insert(connectionChoices).values({ id: newId(), eventId: EV[ev].id, fromAccount: U[from], toAccount: U[to], choice: c, createdAt: plus(EV[ev].start, (EV[ev].hours + 5) * HOUR) });
}

const cDanielSofia = await met("h1", "daniel", "sofia", "friend", "friend", "persona-conn-daniel-sofia");
await met("h1", "daniel", "golf", "activity", "friend");
await oneWay("h1", "daniel", "mook", "friend");
await met("h1", "liam", "hana", "friend", "again");
const cDanielKenji = await met("h2", "daniel", "kenji", "friend", "friend", "persona-conn-daniel-kenji");
const cDanielNamH2 = await met("h2", "daniel", "nam", "again", "friend", "persona-conn-daniel-nam-yaowarat");
await met("h2", "nam", "mook", "friend", "again", "persona-conn-nam-mook");
const cNamRick = await met("h2", "nam", "rick", "again", "romance", "persona-conn-nam-rick");
await met("h2", "ton", "liam", "friend", "friend", "persona-conn-ton-liam");
await met("p1", "krit", "tan", "friend", "friend");
await met("p1", "krit", "kwan", "again", "activity");
await met("p1", "krit", "earth", "activity", "activity");
await met("p1", "krit", "golf", "friend", "friend");
const cTonPond = await met("h3", "ton", "pond", "romance", "romance", "persona-conn-ton-pond");
await met("h3", "ton", "hana", "again", "again");
await met("h3", "ton", "chloe", "friend", "friend");
const cNamPete = await met("h4", "nam", "pete", "romance", "romance", "persona-conn-nam-pete");
await met("h4", "nam", "beam", "romance", "friend"); // an unreturned romance quietly becomes "friend"
await met("h4", "daniel", "nam", "friend", "friend", "persona-conn-daniel-nam-boardgames");
await met("h4", "daniel", "priya", "friend", "activity");
const cDanielKrit = await met("h4", "daniel", "krit", "friend", "friend", "persona-conn-daniel-krit");
await met("h4", "krit", "pete", "again", "again");
await met("p2", "nam", "ice", "friend", "friend", "persona-conn-nam-ice");
// Yesterday's walk: the 72h People I Met window is still open. Daniel has picked for two people so far.
await oneWay("h5", "daniel", "lukas", "friend");
await oneWay("h5", "daniel", "amara", "again");
await oneWay("h5", "ton", "arm", "activity");
await oneWay("h5", "lukas", "daniel", "friend");

// Nam reported and blocked Rick after his money request (the connection closes with the block).
await db.update(connections).set({ removedAt: ago(6 * DAY) }).where(eq(connections.id, cNamRick!));
await db.insert(blocks).values({ id: newId(), blocker: U.nam, blocked: U.rick, createdAt: ago(6 * DAY) });

// Contact shares (Jurrgun hands you over to your own app once you both want to).
async function share(connId: string | null, who: string, method: string, value: string, daysAgo: number) {
  if (!connId) return;
  await db.insert(contactShares).values({ id: newId(), connectionId: connId, accountId: U[who], method, value, createdAt: ago(daysAgo * DAY) });
}
await share(cDanielSofia, "daniel", "line", "dan.in.bkk", 40);
await share(cDanielSofia, "sofia", "instagram", "sofia.vlc.bkk", 39);
await share(cDanielKenji, "daniel", "line", "dan.in.bkk", 20);
await share(cDanielNamH2, "daniel", "line", "dan.in.bkk", 25);
await share(cDanielNamH2, "nam", "instagram", "nam.makes.pots", 24);
await share(cNamPete, "pete", "instagram", "pete.pourover", 7);
await share(cTonPond, "ton", "line", "ton.sings", 9);
await share(cTonPond, "pond", "line", "pond.backstage", 9);
// Daniel and Nam shared contacts and met twice: they've graduated.
await db.insert(graduations).values({ id: newId(), connectionId: cDanielNamH2!, createdAt: ago(9 * DAY) });

// Private thank-you notes.
async function thank(from: string, to: string, connId: string | null, body: string, daysAgo: number) {
  if (!connId) return;
  await db.insert(thanks).values({ id: newId(), fromAccount: U[from], toAccount: U[to], context: `conn:${connId}`, body, createdAt: ago(daysAgo * DAY) });
}
await thank("sofia", "daniel", cDanielSofia, "Thanks for the patience with my terrible Thai tones!", 46);
await thank("kenji", "daniel", cDanielKenji, "Thank you for the noodle tip. Went back twice already.", 26);
await thank("daniel", "krit", cDanielKrit, "Cheers for making the new guy feel welcome, Krit.", 9);
await thank("pond", "ton", cTonPond, "ขอบคุณที่ชวนคุยตอนเรายืนเก้ ๆ กัง ๆ นะ", 13);
await thank("pete", "nam", cNamPete, "ขอบคุณที่สอนเล่น Codenames อย่างใจเย็น", 9);
await thank("mook", "nam", CONN["nam-mook"], "ดีใจที่ได้เจอกันที่เยาวราชนะ", 27);

// -------------------------------------------------------- Bangkok Buddy --

const pairOf = (x: string, y: string): [string, string] => (U[x] < U[y] ? [U[x], U[y]] : [U[y], U[x]]);
const typeOfKey = (k: string) => [...PERSONAS, ...X_MEMBERS].find((p) => p.key === k)!.type;
const stamped = new Map<string, Set<string>>();
async function stamp(who: string, district: string, questId: string, at: Date) {
  const s = stamped.get(who) ?? new Set<string>();
  if (s.has(district)) return;
  s.add(district);
  stamped.set(who, s);
  await db.insert(passportStamps).values({ id: newId(), accountId: U[who], district, source: "buddy", questId, createdAt: at });
}
type QuestPlan = { weeksAgo: number; aDone?: boolean; bDone?: boolean };
async function buddy(matchId: string, x: string, y: string, startedDaysAgo: number, quests: QuestPlan[], intents: [string, string]) {
  const [a, b] = pairOf(x, y);
  const aKey = a === U[x] ? x : y;
  const bKey = aKey === x ? y : x;
  const started = ago(startedDaysAgo * DAY);
  const connectionId = `persona-conn-buddy-${x}-${y}`;
  await db.insert(buddyOptins).values([
    { accountId: U[x], intent: intents[0], active: true, updatedAt: plus(started, -2 * DAY) },
    { accountId: U[y], intent: intents[1], active: true, updatedAt: plus(started, -3 * DAY) },
  ]);
  await db.insert(connections).values({ id: connectionId, aAccount: a, bAccount: b, level: "activity", eventId: `buddy:${matchId}`, createdAt: plus(started, 20 * HOUR) });
  await db.insert(buddyMatches).values({ id: matchId, aAccount: a, bAccount: b, week: weekKey(started), state: "active", aMeetAt: plus(started, 3 * HOUR), bMeetAt: plus(started, 20 * HOUR), connectionId, createdAt: started });
  const types: [ArchetypeKey, ArchetypeKey] = [typeOfKey(aKey), typeOfKey(bKey)];
  const seen = new Set<string>();
  const questIds: string[] = [];
  for (const q of quests) {
    const when = ago(q.weeksAgo * 7 * DAY);
    const week = weekKey(when);
    const p = pickQuest(matchId, week, types, seen);
    seen.add(p.district);
    const id = newId();
    questIds.push(id);
    const doneA = q.aDone ? plus(when, -(1 * DAY)) : null;
    const doneB = q.bDone ? plus(when, -(1 * DAY) + 2 * HOUR) : null;
    await db.insert(buddyQuests).values({ id, matchId, week, scenario: p.scenario, typeCode: p.typeCode, district: p.district, aDoneAt: doneA, bDoneAt: doneB, createdAt: plus(when, -3 * DAY) });
    if (doneA && doneB) {
      await stamp(aKey, p.district, id, doneB);
      await stamp(bKey, p.district, id, doneB);
    }
  }
  return { connectionId, questIds, aKey, bKey };
}

const danielBuddy = await buddy("persona-buddy-daniel-bow", "daniel", "bow", 26, [{ weeksAgo: 3, aDone: true, bDone: true }, { weeksAgo: 2, aDone: true, bDone: true }, { weeksAgo: 1, aDone: true, bDone: true }], ["friends", "friends"]);
// This week's quest: Bow has marked it done, Daniel hasn't yet.
{
  const [a] = pairOf("daniel", "bow");
  const week = weekKey(NOW);
  const p = pickQuest("persona-buddy-daniel-bow", week, [typeOfKey(danielBuddy.aKey), typeOfKey(danielBuddy.bKey)], stamped.get("daniel") ?? new Set());
  const bowIsA = a === U.bow;
  await db.insert(buddyQuests).values({ id: newId(), matchId: "persona-buddy-daniel-bow", week, scenario: p.scenario, typeCode: p.typeCode, district: p.district, aDoneAt: bowIsA ? ago(5 * HOUR) : null, bDoneAt: bowIsA ? null : ago(5 * HOUR), createdAt: ago(2 * DAY) });
  // Last month's themed big quest, done together: a season badge on the passport.
  const lastMonth = monthKey(ago(30 * DAY));
  const season = seasonQuestFor(lastMonth);
  if (season) {
    const id = newId();
    await db.insert(buddyQuests).values({ id, matchId: "persona-buddy-daniel-bow", week: lastMonth, scenario: "season", typeCode: String(season.month), district: season.district, aDoneAt: ago(22 * DAY), bDoneAt: ago(22 * DAY), createdAt: ago(25 * DAY) });
    await stamp("daniel", season.district, id, ago(22 * DAY));
    await stamp("bow", season.district, id, ago(22 * DAY));
  }
}
for (const [i, qid] of danielBuddy.questIds.entries()) {
  for (const [who, about] of [["daniel", "bow"], ["bow", "daniel"]] as const) {
    await db.insert(meetFeedback).values({ id: newId(), kind: "quest", ref: qid, accountId: U[who], aboutAccount: U[about], showedUp: true, onTime: i !== 1 || who === "daniel", feltSafe: 5, feltHeard: who === "daniel" ? 5 : 4, wouldMeetAgain: true, comment: who === "daniel" && i === 0 ? "Bow ordered for both of us and explained every dish." : "", createdAt: ago((3 - i) * 7 * DAY - 2 * HOUR) });
  }
}
await db.insert(safeArrivals).values({ id: newId(), accountId: U.daniel, context: "buddy:persona-buddy-daniel-bow", backBy: ago(20 * DAY), answer: "safe", answeredAt: ago(20 * DAY - HOUR), createdAt: ago(20 * DAY + 5 * HOUR) });
await share(danielBuddy.connectionId, "bow", "line", "bow.teaches.thai", 15);

// Nam and Bank: both privately "open to more"; one quest done, so the reveal isn't unlocked yet (needs two).
await buddy("persona-buddy-nam-bank", "nam", "bank", 13, [{ weeksAgo: 1, aDone: true, bDone: true }], ["open", "open"]);
await db.insert(datingIntents).values([
  { accountId: U.nam, mode: "dating", reasons: ["slow", "real_things"], challenges: ["swiping", "ghosting", "safety"], prefs: { goal: "long_term", kids: "open", pace: "group_first", firstDate: ["coffee", "market", "walk"], distance: "rail" }, updatedAt: ago(55 * DAY) },
  { accountId: U.ton, mode: "dating", reasons: ["see", "new_city"], challenges: ["fake", "pressure"], prefs: { goal: "see", kids: "no", pace: "steady", firstDate: ["street_food", "activity"], distance: "anywhere" }, updatedAt: ago(48 * DAY) },
  { accountId: U.bank, mode: "dating", reasons: ["long_term"], challenges: ["time"], prefs: { goal: "long_term", kids: "want", pace: "steady", firstDate: ["walk", "coffee"], distance: "rail" } },
  { accountId: U.pete, mode: "dating", reasons: ["real_things"], challenges: ["swiping"], prefs: { goal: "long_term", kids: "open", pace: "group_first", firstDate: ["coffee"] } },
  { accountId: U.pond, mode: "dating", reasons: ["see"], challenges: ["fake"], prefs: { goal: "see", kids: "no", firstDate: ["museum", "street_food"] } },
  { accountId: U.daniel, mode: "friends", reasons: [], challenges: [] },
  { accountId: U.krit, mode: "friends", reasons: [], challenges: [] },
]);
await db.insert(safeArrivals).values({ id: newId(), accountId: U.nam, context: "buddy:persona-buddy-nam-bank", backBy: ago(7 * DAY - 3 * HOUR), answer: "safe", answeredAt: ago(7 * DAY - 4 * HOUR), createdAt: ago(7 * DAY + 2 * HOUR) });

// Ton: a fresh buddy proposal from yesterday's round. Ton said meet; waiting for Arm.
{
  const [a, b] = pairOf("ton", "arm");
  const tonIsA = a === U.ton;
  await db.insert(buddyOptins).values([
    { accountId: U.ton, intent: "open", active: true, updatedAt: ago(16 * DAY) },
    { accountId: U.arm, intent: "friends", active: true, updatedAt: ago(10 * DAY) },
  ]);
  await db.insert(buddyMatches).values({ id: "persona-buddy-ton-arm", aAccount: a, bAccount: b, week: weekKey(ago(20 * HOUR)), state: "proposed", aMeetAt: tonIsA ? ago(18 * HOUR) : null, bMeetAt: tonIsA ? null : ago(18 * HOUR), createdAt: ago(20 * HOUR) });
  await db.insert(buddySwipes).values([
    { id: newId(), accountId: U.ton, targetId: U.arm, choice: "keen", createdAt: ago(3 * DAY) },
    { id: newId(), accountId: U.ton, targetId: U.boss, choice: "pass", createdAt: ago(3 * DAY) },
    { id: newId(), accountId: U.ton, targetId: U.lukas, choice: "keen", createdAt: ago(2 * DAY) },
  ]);
}

// --------------------------------------------------------------- chat --

type Line = [who: string, body: string, minutesAgo: number];
async function chat(thread: string, lines: Line[], extra: Partial<typeof chatMessages.$inferInsert> = {}): Promise<string[]> {
  const ids: string[] = [];
  for (const [who, body, m] of lines) {
    const id = newId();
    ids.push(id);
    await db.insert(chatMessages).values({ id, thread, sender: U[who], body, createdAt: ago(m * MIN), ...extra });
  }
  return ids;
}
async function read(thread: string, who: string, minutesAgo: number) {
  await db.insert(chatReads).values({ thread, accountId: U[who], lastReadAt: ago(minutesAgo * MIN) });
}
const D_ = 24 * 60;
await chat("buddy:persona-buddy-daniel-bow", [
  ["bow", "สวัสดีค่ะ Daniel! I'm Bow. Our first quest is in Phra Nakhon, are you free Saturday morning?", 25 * D_],
  ["daniel", "Sawasdee krap Bow! Saturday works. 9am before it gets too hot?", 25 * D_ - 40],
  ["bow", "Perfect. Meet at Sanam Chai MRT exit 1 😊", 25 * D_ - 55],
  ["daniel", "See you there. I'll try to order in Thai, please be patient haha", 25 * D_ - 70],
  ["bow", "That was fun! Your 'ao kafae yen mai wan' was very good 👏", 20 * D_],
  ["daniel", "Thanks for being such a good teacher. Same time next week?", 20 * D_ - 30],
  ["bow", "Next quest is in Bang Rak. Do you like old cafés?", 14 * D_],
  ["daniel", "Love them. Anywhere with good khanom is a yes from me", 14 * D_ - 15],
  ["bow", "สัปดาห์นี้ฉันทำเควสต์แล้วนะ ไปร้านขนมไทยที่บอกไว้ อร่อยมาก!", 5 * 60],
  ["bow", "Your turn this week 😉 Tell me which one you pick", 5 * 60 - 2],
]);
await read("buddy:persona-buddy-daniel-bow", "daniel", 20 * 60);
await read("buddy:persona-buddy-daniel-bow", "bow", 4 * 60);
await chat("conn:persona-conn-daniel-sofia", [
  ["sofia", "Hola Daniel! Fun table yesterday. Shall we do a Thai study session at a café?", 48 * D_],
  ["daniel", "Yes please! I'm stuck on the five tones. Saturday?", 48 * D_ - 120],
  ["sofia", "Saturday 2pm in Ekkamai. I'll bring my flashcards 📚", 47 * D_],
  ["daniel", "Found a cooking class on Jurrgun next week, want to come?", 9 * D_],
  ["sofia", "Already signed up! See you there 🍜", 9 * D_ - 30],
]);
await read("conn:persona-conn-daniel-sofia", "daniel", 9 * D_ - 60);
await chat("conn:persona-conn-daniel-krit", [
  ["krit", "Daniel ยินดีที่ได้รู้จักนะ วิ่งรอบหน้าวันเสาร์ มาด้วยกันไหม", 9 * D_],
  ["daniel", "Count me in! Should I bring anything?", 9 * D_ - 45],
  ["krit", "แค่น้ำกับรองเท้าวิ่ง โจ๊กเลี้ยงกันเอง 😄", 9 * D_ - 60],
]);
await read("conn:persona-conn-daniel-krit", "daniel", 8 * D_);
await chat("conn:persona-conn-daniel-kenji", [
  ["kenji", "Daniel-san, that boat noodle place you mentioned, what's the soi?", 26 * D_],
  ["daniel", "Victory Monument, the alley along the canal. Go hungry!", 26 * D_ - 90],
]);
await read("conn:persona-conn-daniel-kenji", "daniel", 26 * D_ - 100);

// Krit's private circle hangout chat: still open for a week after the dinner, with a poll.
const k3 = `circle:${EV.k3.id}`;
await chat(k3, [
  ["krit", "พรุ่งนี้หกโมงครึ่ง ร้านเดิมนะทุกคน จองโต๊ะไว้แล้ว 10 ที่", 5 * D_],
  ["golf", "ไปครับ เดี๋ยวพา Earth ไปด้วย", 5 * D_ - 30],
  ["daniel", "Can't wait. First mookata with the crew!", 5 * D_ - 60],
  ["kwan", "เอาน้ำจิ้มซีฟู้ดเพิ่มด้วยนะคะ 🙏", 5 * D_ - 90],
  ["tan", "ถึงแล้ว นั่งโต๊ะริมหน้าต่าง", 4 * D_ - 10],
  ["krit", "ขอบคุณทุกคนที่มานะ สนุกมาก! บิลหารแล้วคนละ 285", 4 * D_ - 200],
  ["daniel", "Thanks Krit! Best night. Sending via PromptPay now", 4 * D_ - 210],
]);
const [pollId] = await chat(k3, [["krit", "รอบวิ่งหน้า วันไหนดี?", 3 * D_]], { kind: "poll", pollOptions: ["เสาร์นี้ 6:30", "อาทิตย์นี้ 6:30", "เสาร์หน้า 6:30"] });
await db.insert(chatVotes).values([
  { messageId: pollId, accountId: U.golf, option: 0, createdAt: ago(3 * D_ * MIN - 20 * MIN) },
  { messageId: pollId, accountId: U.tan, option: 1, createdAt: ago(3 * D_ * MIN - 40 * MIN) },
  { messageId: pollId, accountId: U.kwan, option: 0, createdAt: ago(2 * D_ * MIN) },
  { messageId: pollId, accountId: U.daniel, option: 0, createdAt: ago(2 * D_ * MIN + 30 * MIN) },
  { messageId: pollId, accountId: U.earth, option: 2, createdAt: ago(2 * D_ * MIN + 90 * MIN) },
]);
await chat(k3, [["golf", "เสาร์นี้ชนะ เจอกันลุมพินี!", 2 * D_ - 120]]);
await read(k3, "krit", 2 * D_ - 150);
await read(k3, "daniel", 2 * D_);
await chat(`circle:${EV.k5.id}`, [
  ["krit", "เสาร์หน้าเดินจตุจักรกัน เก้าโมงเช้าก่อนร้อน ใครว่างกดเข้าร่วมได้เลย", 2 * D_],
  ["tan", "ไปครับ ขอกินก๋วยเตี๋ยวเรือด้วย", 2 * D_ - 60],
]);
await read(`circle:${EV.k5.id}`, "krit", 2 * D_ - 61);

// Nam's chats.
await chat("conn:persona-conn-nam-pete", [
  ["pete", "Nam ยินดีที่ได้เจอกันนะครับ ยังติดใจ Codenames รอบสุดท้ายอยู่เลย", 9 * D_],
  ["nam", "ฮ่า ๆ คำใบ้ 'มะม่วง 3' ของ Pete ตำนานมาก 😂", 9 * D_ - 25],
  ["pete", "อยากชวนไปลองร้านดริปที่อารีย์ ที่ Nam เขียนไว้ในโปรไฟล์ วันเสาร์ว่างไหมครับ", 8 * D_],
  ["nam", "ว่างค่ะ บ่ายสองดีไหม แล้วไปดูร้านเซรามิกต่อ", 8 * D_ - 70],
  ["pete", "ดีครับ เจอกันหน้า BTS อารีย์ทางออก 3 นะ", 8 * D_ - 80],
  ["nam", "ขอบคุณสำหรับวันนี้นะคะ สนุกมาก ☕️🏺", 6 * D_],
  ["pete", "เหมือนกันครับ แก้วที่ปั้นออกมาเบี้ยวแต่น่ารักดี", 6 * D_ - 15],
  ["pete", "เห็นว่ามีซัปเปอร์คลับที่ Soi Social Club ด้วย Nam ไปไหมครับ", 3 * 60],
]);
await read("conn:persona-conn-nam-pete", "nam", 6 * D_ - 20);
await chat("buddy:persona-buddy-nam-bank", [
  ["bank", "สวัสดีครับ Nam เควสต์แรกอยู่จตุจักร เช้าวันอาทิตย์สะดวกไหม", 12 * D_],
  ["nam", "สะดวกค่ะ ไปตลาดต้นไม้ด้วยได้ไหม 🌿", 12 * D_ - 40],
  ["bank", "ได้เลย ผมเป็นสายต้นไม้อยู่แล้ว", 12 * D_ - 45],
  ["nam", "ได้ต้นมอนสเตอร่ามาหนึ่งต้น ขอบคุณที่ช่วยเลือกนะคะ", 7 * D_],
  ["bank", "เควสต์สัปดาห์นี้ออกมาแล้ว ลองดูนะครับ", 1 * D_],
]);
await read("buddy:persona-buddy-nam-bank", "nam", 2 * D_);
await chat("conn:persona-conn-nam-mook", [
  ["mook", "Nam ไปตลาดนัดรถไฟใหม่ด้วยกันไหม", 20 * D_],
  ["nam", "ไปสิ ศุกร์นี้หลังเลิกงาน", 20 * D_ - 30],
]);
await read("conn:persona-conn-nam-mook", "nam", 20 * D_ - 31);
await chat("conn:persona-conn-nam-ice", [
  ["ice", "กลอนของ Nam เมื่อคืนเพราะมากเลย", 7 * D_],
  ["nam", "ขอบคุณนะ ตื่นเต้นจนมือสั่น 🥹", 7 * D_ - 12],
]);
await read("conn:persona-conn-nam-ice", "nam", 7 * D_ - 13);
const [, rickMoneyMsg] = await chat("conn:persona-conn-nam-rick", [
  ["rick", "hey Nam, fun night at Yaowarat", 26 * D_],
  ["rick", "can you lend me 2,000 baht by PromptPay? I'll pay you back tomorrow, my card got blocked", 7 * D_],
]);
await db.update(chatMessages).set({ moneyFlag: true, hiddenAt: ago(6 * D_ * MIN) }).where(eq(chatMessages.id, rickMoneyMsg));

// Ton's chats.
await chat("conn:persona-conn-ton-pond", [
  ["pond", "Ton! ปิกนิกวันนั้นสนุกมาก ขอบคุณที่ชวนคุยนะ", 13 * D_],
  ["ton", "ดีใจที่ได้เจอเหมือนกัน เห็นว่าทำงานละครเวที เท่มาก", 13 * D_ - 20],
  ["pond", "สัปดาห์หน้ามีรอบซ้อมใหญ่ที่บางรัก อยากมาดูเบื้องหลังไหม", 12 * D_],
  ["ton", "อยากมาก!! แล้วไปกินข้าวต้มดึกต่อนะ", 12 * D_ - 10],
  ["pond", "ดีลนะ 🎭🍲", 12 * D_ - 15],
  ["ton", "เมื่อคืนสนุกมาก ร้องเพลงในรถแท็กซี่ด้วย ขำไม่หยุด", 8 * D_],
  ["pond", "คนขับยังยิ้มตามเลย 😂", 8 * D_ - 5],
  ["pond", "คืนบอร์ดเกมวันที่ 19 ไปด้วยกันนะ กดเข้าร่วมแล้ว", 2 * D_],
  ["ton", "กดแล้วเหมือนกัน! เจอกันนะ 💜", 2 * D_ - 8],
]);
await read("conn:persona-conn-ton-pond", "ton", 2 * D_ - 9);
await chat("conn:persona-conn-ton-liam", [
  ["liam", "Ton, quiz night at my place in Sathon next month, you in?", 18 * D_],
  ["ton", "Yesss I'm the music round guy", 18 * D_ - 60],
  ["liam", "Hired 🎤", 18 * D_ - 61],
]);

// ------------------------------------------------------ circle shares --

for (const to of ["daniel", "earth", "fah", "boss", "golf", "tan", "kwan"]) {
  await db.insert(circleShares).values({ id: newId(), eventId: EV.k5.id, fromAccount: U.krit, toAccount: U[to], createdAt: ago(2 * DAY) });
}
for (const to of ["daniel", "golf", "earth", "tan", "kwan", "fah", "boss"]) {
  await db.insert(circleShares).values({ id: newId(), eventId: EV.k3.id, fromAccount: U.krit, toAccount: U[to], createdAt: ago(7 * DAY) });
}

// ------------------------------------------- circle head requests and review --

const KRIT_REQ = newId();
const DOM_REQ = newId();
await db.insert(circleHeadRequests).values([
  { id: KRIT_REQ, accountId: U.krit, status: "approved", circleName: "Lumphini easy runners", plan: "วิ่งเบา ๆ รอบลุมพินีทุกสองอาทิตย์ แล้วกินโจ๊กสามย่าน มีมื้อเย็นขาประจำเดือนละครั้ง", reviewedBy: U.fon, reviewedAt: ago(60 * DAY), createdAt: ago(63 * DAY) },
  { id: newId(), accountId: U.sofia, status: "pending", circleName: "Saturday language swap", plan: "Spanish, English and Thai swap at cafés in Ekkamai every other Saturday afternoon.", createdAt: ago(30 * HOUR) },
  { id: DOM_REQ, accountId: U.dom, status: "declined", circleName: "Late night bar crawl", plan: "Bars in RCA after midnight.", reviewedBy: U.fon, reviewedAt: ago(16 * DAY), reviewNote: "Regular tables need to meet in public before 22:00. You're welcome to ask again with a daytime plan.", createdAt: ago(17 * DAY) },
]);

// ---------------------------------------------------------- moderation --

type Rep = { reporter: string; target?: string; event?: string; message?: string; reason: string; details: string; severity?: string; status: string; daysAgo: number; resolvedDaysAgo?: number };
async function report(r: Rep): Promise<string> {
  const id = newId();
  await db.insert(reports).values({
    id,
    reporter: U[r.reporter],
    targetAccount: r.target ? U[r.target] : null,
    targetEvent: r.event ? EV[r.event].id : null,
    targetMessage: r.message ?? null,
    reason: r.reason,
    details: r.details,
    severity: r.severity ?? "standard",
    status: r.status,
    resolvedBy: r.resolvedDaysAgo !== undefined ? U.fon : null,
    resolvedAt: r.resolvedDaysAgo !== undefined ? ago(r.resolvedDaysAgo * DAY) : null,
    createdAt: ago(r.daysAgo * DAY),
  });
  return id;
}
async function action(reportId: string | null, target: string, act: string, note: string, daysAgo: number, until?: Date) {
  await db.insert(moderationActions).values({ id: newId(), reportId, accountId: U[target], action: act, until: until ?? null, note, by: U.fon, createdAt: ago(daysAgo * DAY) });
}
async function aud(actor: string, act: string, target: { type: string; id: string } | null, detail: Record<string, unknown>, at: Date) {
  await db.insert(auditLog).values({ id: newId(), actor: actor === "system" ? "system" : U[actor], action: act, targetType: target?.type ?? null, targetId: target?.id ?? null, detail, createdAt: at });
}

const rDom = await report({ reporter: "ice", target: "dom", event: "h2", reason: "unsafe", severity: "critical", status: "open", daysAgo: 0.12, details: "After the food crawl he kept insisting on walking me home after I said no twice, then waited at the MRT exit. I felt unsafe. Nothing happened but I don't want this for anyone else." });
await report({ reporter: "boss", event: "p2", reason: "other", status: "open", daysAgo: 7, details: "เสียงเพลงดังมากช่วงท้าย ไม่ได้ยินคนที่อ่านกลอน และไม่มีที่ให้นั่งพักข้างนอก" });
const rGolf = await report({ reporter: "mook", target: "golf", reason: "inappropriate_romantic", status: "in_review", daysAgo: 4, details: "I said I was here for friends only but he kept messaging about going on a date. Not threatening, just won't take the hint." });
const rRick1 = await report({ reporter: "sofia", target: "rick", event: "h1", reason: "harassment", status: "actioned", daysAgo: 47, resolvedDaysAgo: 46, details: "Kept commenting on my body during the language table and laughed when I asked him to stop." });
const rRick2 = await report({ reporter: "nam", target: "rick", message: rickMoneyMsg, reason: "spam_scam", status: "actioned", daysAgo: 6.2, resolvedDaysAgo: 6, details: "Chat message: can you lend me 2,000 baht by PromptPay? I'll pay you back tomorrow, my card got blocked" });
const rVince = await report({ reporter: "kenji", target: "vince", event: "h2", reason: "spam_scam", status: "actioned", daysAgo: 25, resolvedDaysAgo: 24, details: "Pitched a crypto 'trading course' to everyone at the table and asked for LINE IDs to add us to a group." });
const rEarth = await report({ reporter: "beam", target: "earth", reason: "misrepresented_relationship", status: "dismissed", daysAgo: 10, resolvedDaysAgo: 9, details: "I think he said he was single but someone told me he has a girlfriend." });

await action(rRick1, "rick", "warning", "First flag. Told him the code of conduct is clear on comments about bodies. Reporter thanked and offered a block.", 46);
await action(rGolf, "golf", "note", "Asked Golf for his side. He says he misread a choice on People I Met. Checking chat volume before deciding.", 3);
await action(rRick2, "rick", "suspend", "[spam_scam] Money request in chat to someone he met once, second report. 14-day suspension; ban on any repeat.", 6, plus(NOW, 8 * DAY));
await action(rVince, "vince", "ban", "[spam_scam] Selling a crypto course at a table and harvesting contacts. Three members confirmed. Banned.", 24);
await action(null, "dom", "note", "Circle head request declined: late-night bar crawl. Watch for a resubmission.", 16);

const audits: [string, string, { type: string; id: string } | null, Record<string, unknown>, Date][] = [
  ["fon", "circle_head.approve", { type: "circle_head_request", id: KRIT_REQ }, { circle: "Lumphini easy runners" }, ago(60 * DAY)],
  ["fon", "moderation.view_report", { type: "report", id: rRick1 }, { target: U.rick }, ago(46 * DAY + 2 * HOUR)],
  ["fon", "moderation.warning", { type: "report", id: rRick1 }, { target: U.rick, reportStatus: "actioned", rule: "harassment", flags: 1 }, ago(46 * DAY)],
  ["fon", "event.review_approve", { type: "event", id: EV.k1.id }, {}, ago(49 * DAY)],
  ["fon", "event.review_approve", { type: "event", id: EV.k2.id }, {}, ago(29 * DAY)],
  ["fon", "moderation.view_report", { type: "report", id: rVince }, { target: U.vince }, ago(24 * DAY + 3 * HOUR)],
  ["fon", "moderation.view_history", { type: "account", id: U.vince }, { report: rVince }, ago(24 * DAY + 2 * HOUR)],
  ["fon", "moderation.ban", { type: "report", id: rVince }, { target: U.vince, reportStatus: "actioned", rule: "spam_scam", flags: 0 }, ago(24 * DAY)],
  ["fon", "circle_head.decline", { type: "circle_head_request", id: DOM_REQ }, {}, ago(16 * DAY)],
  ["fon", "moderation.note", { type: "account", id: U.dom }, { target: U.dom }, ago(16 * DAY)],
  ["fon", "moderation.view_report", { type: "report", id: rEarth }, { target: U.earth }, ago(9 * DAY + HOUR)],
  ["fon", "moderation.dismiss", { type: "report", id: rEarth }, { target: U.earth, reportStatus: "dismissed", note: "Second-hand rumour, no evidence. Relationship status is private." }, ago(9 * DAY)],
  ["fon", "moderation.view_report", { type: "report", id: rRick2 }, { target: U.rick }, ago(6 * DAY + HOUR)],
  ["fon", "moderation.suspend", { type: "report", id: rRick2 }, { target: U.rick, until: plus(NOW, 8 * DAY).toISOString(), reportStatus: "actioned", rule: "spam_scam", flags: 1 }, ago(6 * DAY)],
  ["fon", "event.review_approve", { type: "event", id: EV.k4.id }, {}, ago(5 * DAY)],
  ["fon", "moderation.view_report", { type: "report", id: rGolf }, { target: U.golf }, ago(3 * DAY + HOUR)],
  ["fon", "moderation.note", { type: "report", id: rGolf }, { target: U.golf, reportStatus: "in_review" }, ago(3 * DAY)],
  ["nam", "report.create", { type: "report", id: rRick2 }, {}, ago(6.2 * DAY)],
  ["nam", "block.create", { type: "account", id: U.rick }, {}, ago(6.2 * DAY)],
  ["ice", "report.create", { type: "report", id: rDom }, {}, ago(0.12 * DAY)],
  ["krit", "circle_head.request", { type: "circle_head_request", id: KRIT_REQ }, {}, ago(63 * DAY)],
  ["krit", "event.host_submit", { type: "event", id: EV.k1.id }, {}, ago(50 * DAY)],
  ["krit", "event.host_submit", { type: "event", id: EV.k2.id }, {}, ago(30 * DAY)],
  ["krit", "event.host_publish", { type: "event", id: EV.k3.id }, {}, ago(7 * DAY)],
  ["krit", "event.circle_share", { type: "event", id: EV.k3.id }, { recipients: 7 }, ago(7 * DAY)],
  ["krit", "event.host_submit", { type: "event", id: EV.k4.id }, {}, ago(6 * DAY)],
  ["krit", "event.host_publish", { type: "event", id: EV.k5.id }, {}, ago(2 * DAY)],
  ["krit", "event.circle_share", { type: "event", id: EV.k5.id }, { recipients: 7 }, ago(2 * DAY)],
  ["krit", "event.host_submit", { type: "event", id: EV.k6.id }, {}, ago(20 * HOUR)],
];
// Ning and Oat run their events from /admin/events.
for (const [k, e] of Object.entries(EV)) {
  if (e.host !== "ning" && e.host !== "oat") continue;
  const created = plus(e.start, -(e.createdDaysBefore ?? 12) * DAY);
  audits.push([e.host, "event.create", { type: "event", id: e.id }, {}, created]);
  if ((e.status ?? "published") === "published") audits.push([e.host, "event.publish", { type: "event", id: e.id }, {}, plus(created, 20 * MIN)]);
  if (e.groups) audits.push([e.host, "event.groups_publish", { type: "event", id: e.id }, {}, plus(e.start, -2 * HOUR)]);
  if (e.start < NOW && k !== "h9") audits.push([e.host, "event.checkin", { type: "event", id: e.id }, { method: "scan" }, plus(e.start, 5 * MIN)]);
}
audits.push(["ning", "event.noshows", { type: "event", id: EV.h1.id }, { count: 2 }, plus(EV.h1.start, 4 * HOUR)]);
audits.push(["ning", "strike.waive", { type: "account", id: U.boss }, { event: EV.h1.id }, plus(EV.h1.start, 30 * HOUR)]);
audits.push(["ning", "event.notice", { type: "event", id: EV.h6.id }, { th: "นำผ้ากันเปื้อนมาด้วยนะ เจอกันหน้าร้าน 9:50", en: "Bring an apron if you have one. Meet at the shop front at 9:50.", recipients: 16 }, ago(1 * DAY)]);
audits.push(["ning", "event.waitlist_offer", { type: "event", id: EV.h6.id }, { to: U.boss }, ago(15 * HOUR)]);
audits.push(["ning", "event.prompt_set", { type: "event", id: EV.h5.id }, { prompt: "What's a Bangkok smell you'd miss if you left?" }, plus(EV.h5.start, 40 * MIN)]);
audits.push(["oat", "event.notice", { type: "event", id: EV.p3.id }, { th: "มีเมนูมังสวิรัติ แจ้งในแชตได้", en: "Vegetarian menu available, just let us know.", recipients: 6 }, ago(2 * DAY)]);
for (const [actor, act, target, detail, at] of audits) await aud(actor, act, target, detail, at);

// ------------------------------------------------------- notifications --

type N = [who: string, kind: string, th: string, en: string, link: string | null, hoursAgo: number, read?: boolean];
const NOTES: N[] = [
  // Daniel
  ["daniel", "event_notice", "นำผ้ากันเปื้อนมาด้วยนะ เจอกันหน้าร้าน 9:50", "Bring an apron if you have one. Meet at the shop front at 9:50.", `/events/${EV.h6.id}`, 24],
  ["daniel", "people_open", "คนที่เจอ: เลือกได้ถึง 72 ชม. หลังจบงาน", "People I met is open for 72 hours: who would you like to see again?", `/events/${EV.h5.id}/people`, 20],
  ["daniel", "buddy_quest", "Bow ทำเควสต์สัปดาห์นี้แล้ว ถึงตาคุณ", "Bow finished this week's quest. Your turn!", "/buddy", 5],
  ["daniel", "connection", "คุณมีคนรู้จักใหม่จากบอร์ดเกมหลังเลิกงาน", "You have new connections from After-work board games", "/connections", 24 * 9, true],
  ["daniel", "graduated", "🎓 คุณสองคนไม่ต้องพึ่งเราแล้ว ยินดีด้วย!", "🎓 You two don't need us anymore. Congrats!", "/connections", 24 * 9, true],
  ["daniel", "thanks", "💌 Kenji ส่งคำขอบคุณถึงคุณ", "💌 Kenji sent you a thank-you", "/thanks", 24 * 26, true],
  ["daniel", "circle_share", "Krit ชวนคุณไปแฮงเอาต์: เดินจตุจักรวันเสาร์", "Krit invited you to a hangout: Saturday wander at Chatuchak", "/connections", 48],
  ["daniel", "reminder", "พรุ่งนี้: วิ่งเบา ๆ ลุมพินี", "Coming up: Easy Lumphini run", `/events/${EV.k4.id}`, 3],
  ["daniel", "stamp", "แสตมป์ใหม่ในพาสปอร์ตกรุงเทพฯ", "New stamp in your Bangkok Passport", "/buddy/passport", 24 * 7, true],
  // Krit
  ["krit", "circle_head", "คำขอเป็นเจ้าภาพโต๊ะประจำผ่านแล้ว", "You're now a Table Host: Lumphini easy runners", "/host", 24 * 60, true],
  ["krit", "event_approved", "กิจกรรมผ่านการตรวจแล้ว: วิ่งเบา ๆ ลุมพินี", "Your event was approved: Easy Lumphini run", `/events/${EV.k4.id}`, 24 * 5, true],
  ["krit", "event_submitted", "ส่งกิจกรรมให้ทีมงานตรวจแล้ว: เดินถ่ายรูปกลางคืน ตลาดน้อย", "Sent for review: Night photo walk in Talat Noi", "/host", 20],
  ["krit", "rsvp", "มีคนเข้าร่วมวิ่งรอบหน้าเพิ่ม 3 คน", "3 more people joined your next run", `/events/${EV.k4.id}`, 30],
  ["krit", "thanks", "💌 Daniel ส่งคำขอบคุณถึงคุณ", "💌 Daniel sent you a thank-you", "/thanks", 24 * 9],
  ["krit", "chat", "ข้อความใหม่ในแชตมื้อเย็นขาประจำ", "New messages in Regulars' dinner", `/chat/circle:${EV.k3.id}`, 48],
  // Nam
  ["nam", "connection", "💘 คุณมีคนรู้จักใหม่จากบอร์ดเกมหลังเลิกงาน", "💘 You have a new connection from After-work board games", "/connections", 24 * 9, true],
  ["nam", "chat", "Pete ส่งข้อความถึงคุณ", "New message from Pete", "/chat/conn:persona-conn-nam-pete", 3],
  ["nam", "waitlist", "คุณอยู่ในคิวสำรอง: คลาสทำอาหารไทย", "You're on the waitlist: Thai cooking class for newcomers", `/events/${EV.h6.id}`, 24 * 3],
  ["nam", "report_update", "ขอบคุณที่รายงาน ทีมงานดำเนินการแล้ว", "Thanks for your report. Our team has taken action.", null, 24 * 6, true],
  ["nam", "buddy_quest", "เควสต์บัดดี้สัปดาห์นี้มาแล้ว", "This week's buddy quest is ready", "/buddy", 24],
  ["nam", "event_notice", "มีเมนูมังสวิรัติ แจ้งในแชตได้", "Vegetarian menu available, just let us know.", `/events/${EV.p3.id}`, 48],
  // Ton
  ["ton", "connection", "💘 คุณมีคนรู้จักใหม่จากปิกนิกเป็นมิตรกับ LGBTQ+", "💘 You have new connections from Queer-friendly picnic", "/connections", 24 * 13, true],
  ["ton", "thanks", "💌 Pond ส่งคำขอบคุณถึงคุณ", "💌 Pond sent you a thank-you", "/thanks", 24 * 13, true],
  ["ton", "buddy_match", "คุณมีบัดดี้กรุงเทพฯ คนใหม่แล้ว", "You have a new Bangkok Buddy", "/buddy", 20],
  ["ton", "people_open", "คนที่เจอ: เลือกได้ถึง 72 ชม. หลังจบงาน", "People I met is open: who would you like to see again?", `/events/${EV.h5.id}/people`, 20],
  ["ton", "chat", "Pond ส่งข้อความถึงคุณ", "New message from Pond", "/chat/conn:persona-conn-ton-pond", 48, true],
  // Fon (moderator)
  ["fon", "report", "มีรายงานด่วนรอตรวจสอบ", "Critical report waiting", "/admin/moderation", 3],
  ["fon", "report", "มีรายงานใหม่รอตรวจสอบ", "New report waiting", "/admin/moderation", 24 * 4, true],
  ["fon", "report", "มีรายงานแชตรอตรวจสอบ", "Chat message reported", "/admin/moderation", 24 * 6, true],
  ["fon", "review", "มีคำขอเป็นเจ้าภาพโต๊ะประจำรอตรวจ", "A Table Host request is waiting for review", "/admin/review", 30],
  ["fon", "review", "มีกิจกรรมรอตรวจ: เดินถ่ายรูปกลางคืน ตลาดน้อย", "An event is waiting for review: Night photo walk in Talat Noi", "/admin/review", 20],
  // Ning (host)
  ["ning", "waitlist", "คลาสทำอาหารไทยเต็มแล้ว มีคิวสำรอง 3 คน", "Thai cooking class is full, 3 on the waitlist", `/admin/events/${EV.h6.id}`, 24 * 2],
  ["ning", "feedback", "มีความคิดเห็นใหม่ 3 รายการ: เดินเล่นริมน้ำเจริญกรุง", "3 new feedback answers: Riverside walk", "/host/insights", 10],
  ["ning", "rsvp", "มีคนเข้าร่วมซิตี้เควสต์ตลาดพลูเพิ่ม", "New sign-ups for City Quest: Talat Phlu", `/admin/events/${EV.h7.id}`, 26, true],
  // Oat (partner)
  ["oat", "rsvp", "ซัปเปอร์คลับคนโสดมีผู้เข้าร่วม 6 คนแล้ว", "Singles' supper club: 6 going", `/admin/events/${EV.p3.id}`, 30],
  ["oat", "feedback", "มีความคิดเห็นใหม่: โอเพนไมค์และขนมไทย", "New feedback: Open mic and Thai snacks night", "/host/insights", 24 * 6, true],
  ["oat", "report_event", "มีรายงานเกี่ยวกับกิจกรรมของคุณ ทีมงานกำลังดู", "A member left a note about your event; our team is looking at it", `/admin/events/${EV.p2.id}`, 24 * 7, true],
];
for (const [who, kind, th, en, link, hrs, isRead] of NOTES) {
  await db.insert(notifications).values({ id: newId(), accountId: U[who], kind, titleTh: th, titleEn: en, link, readAt: isRead ? ago((hrs - 1) * HOUR) : null, createdAt: ago(hrs * HOUR) });
}
// The host's notice reached everyone on the cooking class list.
for (const who of ["ton", "sofia", "kenji", "liam", "hana", "chloe", "priya", "lukas", "amara", "arm", "boss", "fah", "earth"]) {
  await db.insert(notifications).values({ id: newId(), accountId: U[who], kind: "event_notice", titleTh: "นำผ้ากันเปื้อนมาด้วยนะ เจอกันหน้าร้าน 9:50", titleEn: "Bring an apron if you have one. Meet at the shop front at 9:50.", link: `/events/${EV.h6.id}`, createdAt: ago(24 * HOUR) });
}
for (const s of strikeRows) {
  await db.insert(notifications).values({ id: newId(), accountId: U[s.who], kind: "strike", titleTh: `คุณได้ 1 strike จาก "${EV[s.ev].title}"`, titleEn: `You got 1 strike from "${EV[s.ev].titleEn}"`, link: "/me/events", createdAt: plus(EV[s.ev].start, (EV[s.ev].hours + 1) * HOUR) });
}

// ------------------------------------------------- City Pulse (research) --

const ACTIVE_Q = await db.select().from(pulseQuestions).where(and(eq(pulseQuestions.status, "active"))).limit(500);
// Prefer the four questions scripts/seed.ts creates; fall back to any live ones.
const [adminAcct] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, "admin")).limit(1);
const seeded = ACTIVE_Q.filter((q) => /exhausting|walking alone|BMA could fix|first meet-up/.test(q.promptEn))
  .sort((a, b) => Number(b.createdBy === adminAcct?.id) - Number(a.createdBy === adminAcct?.id) || a.sortOrder - b.sortOrder);
const QS = (seeded.length ? seeded : ACTIVE_Q.slice(0, 4)).filter((q, i, arr) => arr.findIndex((x) => x.promptEn === q.promptEn) === i)
  .sort((a, b) => a.sortOrder - b.sortOrder);
function optionsOf(q: typeof pulseQuestions.$inferSelect): string[] {
  let raw: unknown = q.options;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  return Array.isArray(raw) ? raw.map((o) => (o as { value: string }).value).filter(Boolean) : [];
}
function answerFor(q: typeof pulseQuestions.$inferSelect, who: string): string | number | string[] | null {
  const n = h(q.id + who);
  const opts = optionsOf(q);
  if (q.kind === "scale") return 2 + (n % 4);
  if (q.kind === "area") return PROFILE[who].district;
  if (q.kind === "single") return opts.length ? opts[n % opts.length] : null;
  if (q.kind === "multi") return opts.length ? [...new Set([opts[n % opts.length], opts[(n >> 4) % opts.length]])] : null;
  if (q.kind === "text") return "More shade and benches near BTS exits.";
  return null;
}
let pulseCount = 0;
const answerers = Object.keys(U).filter((k) => !["rick", "vince", "dom"].includes(k));
for (const who of answerers) {
  // Leave the last question open for Daniel, Nam and Ton so /pulse still asks them something.
  const mine = ["daniel", "nam", "ton"].includes(who) ? QS.slice(0, Math.max(0, QS.length - 1)) : QS;
  for (const [i, q] of mine.entries()) {
    const answer = answerFor(q, who);
    if (answer === null) continue;
    await db.insert(pulseResponses).values({ id: newId(), questionId: q.id, researchId: RID[who], answer, district: PROFILE[who].district, ageBand: ageBand(ageOn(PROFILE[who].birth)), createdAt: ago((40 - i * 6 - (h(who) % 5)) * DAY) }).onConflictDoNothing();
    pulseCount++;
  }
  // UCLA-3 loneliness baseline at onboarding; a follow-up for Daniel (3+ events since).
  const n = h(who + "ucla");
  await db.insert(wellbeing).values({ id: newId(), researchId: RID[who], phase: "baseline", q1: 1 + (n % 3), q2: 1 + ((n >> 2) % 3), q3: 1 + ((n >> 4) % 3), createdAt: ago(55 * DAY) });
}
await db.insert(wellbeing).values({ id: newId(), researchId: RID.daniel, phase: "followup", q1: 1, q2: 1, q3: 2, createdAt: ago(6 * DAY) });

await client.end();

// -------------------------------------------------------------- report --

const ids = {
  passEvent: EV.h6.id,
  peopleEvent: EV.h5.id,
  danielBuddy: "persona-buddy-daniel-bow",
  namBuddy: "persona-buddy-nam-bank",
};
console.log(`Personas seeded (password "${PASSWORD}"):
  persona_expat         Daniel  /me/events  /me/events/${ids.passEvent}/pass  /events/${ids.peopleEvent}/people  /buddy  /buddy/passport  /chat/buddy:${ids.danielBuddy}  /connections
  persona_host_th       Krit    /host  /host/insights  /chat/circle:${EV.k3.id}  /connections  /admin/events
  persona_woman_dating  Nam     /connections  /chat/conn:${cNamPete}  /chat/buddy:${ids.namBuddy}  /settings/dating  /events/${EV.p3.id}
  persona_lgbtq_dating  Ton     /connections  /chat/conn:${cTonPond}  /buddy  /events/${EV.h8.id}
  persona_mod           Fon     /admin/moderation  /admin/moderation?status=actioned  /admin/review
  persona_host          Ning    /admin/events  /admin/events/${EV.h6.id}  /admin/events?view=past  /host/insights
  persona_partner       Oat     /admin/events  /admin/events/${EV.p3.id}  /host/insights
  ${X_MEMBERS.length} supporting members (persona_x_*), ${Object.keys(EV).length} events, ${pulseCount} City Pulse answers.`);
process.exit(0);
