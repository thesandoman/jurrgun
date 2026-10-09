/**
 * LOCAL demo data. Run with `npm run seed` (after `npm run db:migrate`).
 * Idempotent: skips anything that already exists. Never point this at the
 * deployed database.
 *
 * Logins (password for all: bkksocial123):
 *   admin   — BMA admin         host    — event host
 *   mod     — moderator         ploy, ken, ari, sam, mai, tom — members
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { hashPassword, newId } from "../src/lib/crypto";
import { VISITBANGKOK_ROUTES } from "../src/lib/constants";
import { accounts, consents, events, partnerOrgs, profiles, pulseQuestions, type Role } from "../src/schema";

const env = { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev" };
const db = getDb(env);
const PASSWORD = "bkksocial123";

async function ensureAccount(
  username: string,
  role: Role,
  profile: { nickname: string; birthDate: string; district: string; languages: string[]; interests: string[]; relationship?: string; romanceOn?: boolean; genderIdentity?: string; romanceOpenTo?: string[] | "everyone" },
): Promise<string> {
  const [existing] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).limit(1);
  if (existing) return existing.id;
  const { hash, salt } = await hashPassword(PASSWORD);
  const id = newId();
  await db.insert(accounts).values({ id, username, passwordHash: hash, passwordSalt: salt, role, researchId: newId() });
  await db.insert(profiles).values({
    accountId: id,
    nickname: profile.nickname,
    birthDate: profile.birthDate,
    district: profile.district,
    languages: profile.languages,
    interests: profile.interests,
    socialStyles: ["small_group"],
    intents: profile.romanceOn ? ["friends", "romance"] : ["friends"],
    relationship: profile.relationship ?? "prefer_not",
    romanceOn: profile.romanceOn ?? false,
    genderIdentity: profile.romanceOn ? (profile.genderIdentity ?? null) : null,
    romanceOpenTo: profile.romanceOn ? (profile.romanceOpenTo ?? "everyone") : null,
    onboardedAt: new Date(),
  });
  for (const category of ["service", "safety", "personalization", "research", "notifications"]) {
    await db.insert(consents).values({ id: newId(), accountId: id, category, granted: true, version: "seed" });
  }
  return id;
}

const admin = await ensureAccount("admin", "bma_admin", { nickname: "BMA Admin", birthDate: "1988-01-01", district: "phra_nakhon", languages: ["th", "en"], interests: ["city"] });
const host = await ensureAccount("host", "host", { nickname: "Host Nok", birthDate: "1992-06-01", district: "bang_rak", languages: ["th", "en"], interests: ["art", "food"] });
await ensureAccount("mod", "moderator", { nickname: "Mod", birthDate: "1990-02-02", district: "dusit", languages: ["th"], interests: ["books"] });
const members: [string, Parameters<typeof ensureAccount>[2]][] = [
  ["ploy", { nickname: "Ploy", birthDate: "1997-03-04", district: "bang_rak", languages: ["th", "en"], interests: ["food", "art", "cafes"], relationship: "single", romanceOn: true, genderIdentity: "woman", romanceOpenTo: ["woman", "non-binary"] }],
  ["ken", { nickname: "Ken", birthDate: "1994-08-12", district: "sathon", languages: ["en"], interests: ["running", "food"] }],
  ["ari", { nickname: "Ari", birthDate: "1999-11-20", district: "phaya_thai", languages: ["th"], interests: ["art", "music"], relationship: "single", romanceOn: true, genderIdentity: "non-binary", romanceOpenTo: "everyone" }],
  ["sam", { nickname: "Sam", birthDate: "1991-01-15", district: "watthana", languages: ["th", "en"], interests: ["games", "food"], relationship: "married" }],
  ["mai", { nickname: "Mai", birthDate: "1996-07-07", district: "chatuchak", languages: ["th"], interests: ["pets", "running"] }],
  ["tom", { nickname: "Tom", birthDate: "1989-04-30", district: "khlong_toei", languages: ["en", "th"], interests: ["city", "culture"] }],
];
for (const [u, p] of members) await ensureAccount(u, "user", p);

const [org] = await db.select().from(partnerOrgs).limit(1);
if (!org) await db.insert(partnerOrgs).values({ id: newId(), name: "Bangkok Art & Culture Centre (demo)" });

const [anyEvent] = await db.select({ id: events.id }).from(events).limit(1);
if (!anyEvent) {
  const day = 86_400_000;
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * day);
    d.setUTCHours(hour - 7, 0, 0, 0); // Bangkok is UTC+7
    return d;
  };
  const quests = VISITBANGKOK_ROUTES.map((r, i) => ({
    id: newId(),
    title: `City Quest: ${r.th}`,
    titleEn: `City Quest: ${r.en}`,
    description: "เดินสำรวจเป็นกลุ่มเล็ก 4–6 คนกับโฮสต์ ตามเส้นทางแนะนำจาก VisitBangkok",
    descriptionEn: "A host-led small-group walk on an official VisitBangkok route.",
    startsAt: at(2 + i, 9),
    endsAt: at(2 + i, 12),
    venueName: r.venue,
    district: r.district,
    capacity: 18,
    languages: ["th", "en"],
    tags: [...r.tags, "english_friendly", "daytime"],
    visitBangkokRoute: r.value,
    hostAccountId: host,
    status: "published",
    buddyEnabled: true,
    plusOneAllowed: true,
    safetyInfo: "จุดนัดพบหน้าทางเข้า มีโฮสต์ใส่เสื้อสีเขียว",
    emergencyContact: "191 / 1669",
    createdBy: admin,
  }));
  await db.insert(events).values([
    ...quests,
    {
      id: newId(),
      title: "บอร์ดเกมหลังเลิกงาน",
      titleEn: "After-work board games",
      description: "บอร์ดเกมง่าย ๆ โต๊ะละ 4–6 คน",
      descriptionEn: "Easy board games, tables of 4–6.",
      startsAt: at(1, 19),
      endsAt: at(1, 21),
      venueName: "BACC, 4th floor",
      district: "pathum_wan",
      capacity: 24,
      languages: ["th", "en"],
      tags: ["board_game", "english_friendly"],
      hostAccountId: host,
      status: "published",
      createdBy: admin,
      intensity: "chill",
    },
    {
      id: newId(),
      title: "โต๊ะแลกเปลี่ยนภาษา ไทย ↔ อังกฤษ",
      titleEn: "Thai ↔ English language exchange table",
      startsAt: at(3, 18),
      endsAt: at(3, 20),
      venueName: "Lumphini Park pavilion",
      district: "pathum_wan",
      capacity: 20,
      languages: ["th", "en"],
      tags: ["language_exchange", "newcomers", "english_friendly"],
      hostAccountId: host,
      status: "published",
      createdBy: admin,
    },
    {
      id: newId(),
      title: "Queer-friendly picnic",
      titleEn: "Queer-friendly picnic",
      startsAt: at(5, 16),
      endsAt: at(5, 18),
      venueName: "Benjakitti Forest Park",
      district: "khlong_toei",
      capacity: 30,
      languages: ["th", "en"],
      tags: ["queer_friendly", "lgbtq_community", "english_friendly"],
      hostAccountId: host,
      status: "published",
      createdBy: admin,
    },
    {
      id: newId(),
      title: "เดินเล่นหลังเลิกงาน (จบไปแล้ว — ทดสอบ People I Met)",
      titleEn: "After-work walk (finished — for testing People I Met)",
      startsAt: new Date(Date.now() - 5 * 3_600_000),
      endsAt: new Date(Date.now() - 3 * 3_600_000),
      venueName: "Chao Phraya riverside",
      district: "bang_rak",
      capacity: 12,
      languages: ["th", "en"],
      tags: ["walk"],
      hostAccountId: host,
      status: "published",
      createdBy: admin,
    },
  ]);
}

const [anyQ] = await db.select({ id: pulseQuestions.id }).from(pulseQuestions).limit(1);
if (!anyQ) {
  const q = (promptTh: string, promptEn: string, kind: string, options: { value: string; th: string; en: string }[], sortOrder: number) => ({
    id: newId(), promptTh, promptEn, kind, options, status: "active", sortOrder, createdBy: admin,
  });
  await db.insert(pulseQuestions).values([
    q("อะไรทำให้การนัดเจอคนในกรุงเทพฯ เหนื่อยที่สุด?", "What makes meeting someone in Bangkok most exhausting?", "single", [
      { value: "traffic", th: "รถติด", en: "Traffic" },
      { value: "cost", th: "ค่าใช้จ่าย", en: "Cost" },
      { value: "heat", th: "อากาศร้อน", en: "Heat" },
      { value: "sidewalks", th: "ทางเท้า", en: "Sidewalks" },
      { value: "safety", th: "ความปลอดภัย", en: "Safety" },
      { value: "no_seat", th: "ไม่มีที่นั่ง", en: "Nowhere to sit" },
      { value: "where", th: "ไม่รู้จะเจอคนที่ไหน", en: "I don't know where to meet people" },
    ], 1),
    q("หลังเลิกงาน คุณรู้สึกสบายใจแค่ไหนที่จะเดินคนเดียวแถวบ้าน?", "After work, how comfortable are you walking alone near home?", "scale", [], 2),
    q("ถ้า กทม. แก้ได้ 1 อย่างเพื่อให้คนออกมาเจอกันมากขึ้น จะเลือกอะไร?", "If BMA could fix one thing to get people out and meeting, what would it be?", "single", [
      { value: "lighting", th: "ไฟส่องสว่าง", en: "Lighting" },
      { value: "shade", th: "ร่มเงา", en: "Shade" },
      { value: "seating", th: "ที่นั่งสาธารณะ", en: "Public seating" },
      { value: "transport", th: "การเดินทางกลับบ้าน", en: "Getting home" },
      { value: "events", th: "กิจกรรมฟรี", en: "Free events" },
    ], 3),
    q("ย่านไหนเหมาะกับการนัดเจอครั้งแรกที่สุด?", "Which area feels easiest for a first meet-up?", "area", [], 4),
  ]);
}

console.log(`Seeded. Logins (password "${PASSWORD}"): admin, host, mod, ploy, ken, ari, sam, mai, tom`);
process.exit(0);
