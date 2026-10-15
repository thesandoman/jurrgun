/**
 * LOCAL demo: the Rebuilder's weekly newcomer tables (design/reference/customer-profile.md),
 * dated from next Saturday, so /new and Discover show a real programme.
 * Run with `npx vite-node scripts/seed-newcomer-tables.ts` after `npm run seed`.
 * Idempotent (skips tables that exist); `--reset` deletes and recreates them.
 * Never point this at the deployed database: real tables are created by hosts.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import { accounts, events, registrations } from "../src/schema";

const env = { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev" };
const db = getDb(env);

const [host] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, "host")).limit(1);
if (!host) throw new Error("Run `npm run seed` first (needs the host account).");

/** The next Saturday at 00:00 Bangkok time (UTC+7), plus `days` and `hour`. */
function at(days: number, hour: number, minute = 0): Date {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  const toSat = (6 - bkk.getUTCDay() + 7) % 7 || 7;
  const d = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + toSat + days, hour - 7, minute);
  return new Date(d);
}

type Table = {
  id: string; title: string; titleEn: string; description: string; descriptionEn: string;
  start: Date; hours: number; venue: string; district: string; tags: string[]; cost: number; intensity: string;
};

const TABLES: Table[] = [
  {
    id: "rebuilder-ari-market-walk", title: "มาใหม่ในกรุงเทพฯ: เดินตลาดเช้าอารีย์", titleEn: "New in Bangkok: Ari morning market walk",
    description: "เดินตลาดเช้าเป็นโต๊ะละ 4 ถึง 6 คน ชิมของกินเล่น แล้วนั่งกาแฟด้วยกัน มาคนเดียวได้ ทุกคนก็มาคนเดียว", descriptionEn: "A morning market walk in tables of 4 to 6, snacks along the way, then coffee together. Come alone, everyone does.",
    start: at(0, 9), hours: 2, venue: "BTS Ari, Exit 3", district: "phaya_thai", tags: ["newcomers", "walk", "food", "daytime", "english_friendly"], cost: 0, intensity: "chill",
  },
  {
    id: "rebuilder-language-table", title: "โต๊ะแลกเปลี่ยนภาษา ไทย อังกฤษ", titleEn: "Thai and English language table",
    description: "ครึ่งแรกคุยภาษาไทย ครึ่งหลังคุยภาษาอังกฤษ มีโฮสต์ช่วยเริ่มบทสนทนา เหมาะกับคนมาใหม่และคนอยากฝึกภาษา", descriptionEn: "Half in Thai, half in English, with a host to get things going. Great for newcomers and anyone practising.",
    start: at(0, 15), hours: 2, venue: "TCDC, Grand Postal Building", district: "bang_rak", tags: ["language_exchange", "english_friendly", "newcomers"], cost: 0, intensity: "social",
  },
  {
    id: "rebuilder-park-run", title: "วิ่งเบา ๆ ที่เบญจกิติ แล้วไปกาแฟ", titleEn: "Easy run at Benjakitti, then coffee",
    description: "วิ่งหรือเดินเร็ว 5 กม. ตามจังหวะของกลุ่ม แล้วนั่งกาแฟด้วยกัน ไม่ต้องเร็ว แค่มาให้ทัน", descriptionEn: "Run or walk 5 km at the group's pace, then coffee. No need to be fast, just show up.",
    start: at(1, 8), hours: 2, venue: "Benjakitti Forest Park, main gate", district: "khlong_toei", tags: ["run", "daytime", "newcomers"], cost: 0, intensity: "social",
  },
  {
    id: "rebuilder-board-games", title: "บอร์ดเกมหลังเลิกงาน", titleEn: "After-work board games",
    description: "เกมง่าย ๆ ที่เล่นแป๊บเดียวก็เข้าใจ โต๊ะละ 4 ถึง 6 คน ใกล้ BTS ไม่ต้องดื่ม ไม่ต้องรู้จักใครมาก่อน", descriptionEn: "Easy games you learn in minutes, tables of 4 to 6, near the BTS. No drinking, no need to know anyone.",
    start: at(4, 19), hours: 2.5, venue: "A board-game café near BTS Victory Monument", district: "ratchathewi", tags: ["board_game", "english_friendly", "newcomers"], cost: 150, intensity: "chill",
  },
  {
    id: "rebuilder-old-town-quest", title: "ซิตี้เควสต์: เกาะรัตนโกสินทร์กับโฮสต์", titleEn: "City Quest: Old Town with a host",
    description: "เดินตามเส้นทาง VisitBangkok กับโฮสต์ เก็บแสตมป์เขตลงพาสปอร์ตกรุงเทพฯ จบที่ร้านขนมไทยเก่าแก่", descriptionEn: "Walk a VisitBangkok route with a host, stamp the district in your Bangkok Passport, and finish at an old Thai dessert shop.",
    start: at(7, 9, 30), hours: 3, venue: "MRT Sanam Chai, Exit 1", district: "phra_nakhon", tags: ["city_quest", "culture", "walk", "daytime", "newcomers"], cost: 0, intensity: "social",
  },
  {
    id: "rebuilder-meet-again", title: "โต๊ะเจอกันอีกครั้ง: คนเดิม ที่ใหม่", titleEn: "Meet again table: same faces, new place",
    description: "สำหรับคนที่เคยมาโต๊ะมือใหม่แล้ว เจอกันอีกครั้งที่ร้านใหม่ในเจริญกรุง ชวนคนที่เลือกกันไว้มาด้วยได้", descriptionEn: "For people who've been to a newcomer table: meet again at a new spot in Charoen Krung, and bring people you chose to see again.",
    start: at(8, 17), hours: 2, venue: "A café on Charoen Krung Soi 32", district: "bang_rak", tags: ["food", "newcomers", "english_friendly"], cost: 0, intensity: "social",
  },
];

const ids = TABLES.map((x) => x.id);
if (process.argv.includes("--reset")) {
  await db.delete(registrations).where(inArray(registrations.eventId, ids));
  await db.delete(events).where(inArray(events.id, ids));
}
const existing = new Set((await db.select({ id: events.id }).from(events).where(inArray(events.id, ids))).map((r) => r.id));
for (const x of TABLES) {
  if (existing.has(x.id)) continue;
  await db.insert(events).values({
    id: x.id, title: x.title, titleEn: x.titleEn, description: x.description, descriptionEn: x.descriptionEn,
    startsAt: x.start, endsAt: new Date(x.start.getTime() + x.hours * 3600_000),
    venueName: x.venue, district: x.district, capacity: 18, ageMin: 20, ageMax: 40, languages: ["th", "en"],
    costThb: x.cost, hostAccountId: host.id, intensity: x.intensity, groupMin: 4, groupMax: 6,
    tags: x.tags, status: "published", visibility: "public", createdBy: host.id,
  });
}
console.log(`Newcomer tables ready (${TABLES.length}). See /new`);
process.exit(0);
