/**
 * LOCAL demo: one fully filled-in event with dummy participants, for showing
 * the event page off. Run with `npx vite-node scripts/seed-demo-event.ts`
 * after `npm run seed`. Idempotent (skips if the demo event exists); `--reset`
 * deletes the demo event and its sign-ups first. Never point this at the
 * deployed database.
 *
 * Dummy members log in as demo_<name> with the same password as scripts/seed.ts.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { hashPassword, newId, randomToken } from "../src/lib/crypto";
import { accounts, consents, events, profiles, registrations, vibes } from "../src/schema";

const env = { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cloud_dev" };
const db = getDb(env);
const PASSWORD = "bkksocial123";
const DEMO_ID = "demo-yaowarat-night-crawl";

if (process.argv.includes("--reset")) {
  await db.delete(registrations).where(eq(registrations.eventId, DEMO_ID));
  await db.delete(events).where(eq(events.id, DEMO_ID));
  console.log("Demo event cleared.");
}

const [exists] = await db.select({ id: events.id }).from(events).where(eq(events.id, DEMO_ID)).limit(1);
if (exists) {
  console.log(`Demo event already there: /events/${DEMO_ID}`);
  process.exit(0);
}

const [host] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, "host")).limit(1);
if (!host) throw new Error("Run `npm run seed` first (needs the host account).");

type Dummy = { name: string; birth: string; district: string; langs: string[]; interests: string[]; type: string; pronouns?: string; status: "confirmed"; buddy?: boolean };
const DUMMIES: Dummy[] = [
  { name: "Fern", birth: "1996-02-11", district: "bang_rak", langs: ["th", "en"], interests: ["food", "photography"], type: "BDMN", status: "confirmed", buddy: true },
  { name: "Jay", birth: "1993-09-23", district: "sathon", langs: ["en"], interests: ["food", "city"], type: "CFMH", pronouns: "they/them", status: "confirmed", buddy: true },
  { name: "Nam", birth: "1999-05-02", district: "samphanthawong", langs: ["th"], interests: ["food", "culture"], type: "BFSN", status: "confirmed" },
  { name: "Arun", birth: "1990-12-30", district: "watthana", langs: ["th", "en"], interests: ["food", "music"], type: "BDSH", status: "confirmed", buddy: true },
  { name: "Lin", birth: "1995-07-18", district: "huai_khwang", langs: ["en", "th"], interests: ["food", "languages"], type: "CDMN", status: "confirmed" },
  { name: "Pim", birth: "1998-03-09", district: "chatuchak", langs: ["th"], interests: ["cafes", "food"], type: "CFSN", status: "confirmed" },
  { name: "Max", birth: "1992-11-04", district: "khlong_toei", langs: ["en"], interests: ["food", "nightlife"], type: "BFMH", status: "confirmed", buddy: true },
  { name: "Toey", birth: "1997-08-27", district: "phaya_thai", langs: ["th", "en"], interests: ["food", "art"], type: "CDSH", pronouns: "she/her", status: "confirmed" },
  { name: "Ravi", birth: "1991-04-15", district: "bang_na", langs: ["en"], interests: ["food", "photography"], type: "BDMH", pronouns: "he/him", status: "confirmed" },
  { name: "Mew", birth: "2000-01-21", district: "lat_phrao", langs: ["th"], interests: ["food", "games"], type: "CFMN", status: "confirmed" },
  { name: "Noor", birth: "1994-06-06", district: "min_buri", langs: ["th", "en"], interests: ["food", "culture"], type: "BFSH", status: "confirmed" },
  { name: "Kai", birth: "1996-10-10", district: "thon_buri", langs: ["en", "th"], interests: ["food", "running"], type: "CDMH", status: "confirmed" },
];

const { hash, salt } = await hashPassword(PASSWORD);
const ids: { id: string; d: Dummy }[] = [];
for (const d of DUMMIES) {
  const username = `demo_${d.name.toLowerCase()}`;
  const [found] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).limit(1);
  const id = found?.id ?? newId();
  if (!found) {
    await db.insert(accounts).values({ id, username, passwordHash: hash, passwordSalt: salt, role: "user", researchId: newId(), isDemo: true });
    await db.insert(profiles).values({
      accountId: id,
      nickname: d.name,
      birthDate: d.birth,
      district: d.district,
      languages: d.langs,
      interests: d.interests,
      socialStyles: ["small_group"],
      intents: ["friends"],
      pronouns: d.pronouns ?? null,
      showPronouns: !!d.pronouns,
      onboardedAt: new Date(),
    });
    await db.insert(vibes).values({ accountId: id, vector: {}, archetype: d.type, visible: true });
    for (const category of ["service", "safety", "personalization", "research", "notifications"]) {
      await db.insert(consents).values({ id: newId(), accountId: id, category, granted: true, version: "seed" });
    }
  }
  ids.push({ id, d });
}

// Next Saturday, 18:00 to 21:30 Bangkok time (UTC+7).
const start = new Date();
start.setUTCDate(start.getUTCDate() + ((6 - start.getUTCDay() + 7) % 7 || 7));
start.setUTCHours(18 - 7, 0, 0, 0);
const end = new Date(start.getTime() + 3.5 * 3_600_000);

await db.insert(events).values({
  id: DEMO_ID,
  title: "ตระเวนกินเยาวราชยามค่ำ",
  titleEn: "Yaowarat night food crawl",
  description:
    "เดินกินสตรีทฟู้ดเยาวราชเป็นกลุ่มเล็ก 4–6 คน แวะ 5 ร้าน ตั้งแต่ก๋วยจั๊บน้ำข้น ขนมปังปิ้ง ไปจนถึงบัวลอยน้ำขิง\n\nโฮสต์จะแบ่งกลุ่มให้ก่อนเริ่ม ไม่ต้องมากับเพื่อนก็ได้ มีคำถามชวนคุยระหว่างทาง จบที่ร้านของหวานริมถนน\n\nเดินรวมประมาณ 1.5 กม. ทางเรียบ มีจุดพักนั่ง",
  descriptionEn:
    "A small-group walk through Yaowarat's street food, tables of 4 to 6. Five stops: peppery rolled noodle soup, toasted buns with custard, grilled seafood, and ginger soup with sesame dumplings to finish.\n\nThe host sorts groups before we start, so coming alone is the norm. A few easy conversation prompts along the way, ending at a dessert stall on the main road.\n\nAbout 1.5 km of flat walking, with places to sit between stops.",
  startsAt: start,
  endsAt: end,
  venueName: "Wat Mangkon MRT, Exit 1",
  venueAddress: "Charoen Krung Rd, Samphanthawong, Bangkok 10100",
  mapUrl: "https://maps.google.com/?q=Wat+Mangkon+MRT+Exit+1",
  district: "samphanthawong",
  capacity: 18,
  ageMin: 20,
  ageMax: 45,
  languages: ["th", "en"],
  costThb: 350,
  paymentNote: "Pay each stall yourself, about 350 THB covers all five stops. Bring cash.",
  hostAccountId: host.id,
  intensity: "social",
  groupMin: 4,
  groupMax: 6,
  plusOneAllowed: true,
  accessibility: "Step-free from MRT Exit 1 by lift. Flat pavements, some crowded spots. Seated rests at stops 2 and 4.",
  safetyInfo: "Meet at the top of the Exit 1 lift. Host wears a green Jurrgun lanyard. Keep bags in front in crowds.",
  emergencyContact: "Host via the event chat · Police 191 · Ambulance 1669 · Tourist police 1155",
  tags: ["food", "walk", "culture", "newcomers", "english_friendly"],
  status: "published",
  visibility: "public",
  buddyEnabled: true,
  createdBy: host.id,
});

for (const { id, d } of ids) {
  await db.insert(registrations).values({ id: newId(), eventId: DEMO_ID, accountId: id, status: d.status, wantsBuddy: !!d.buddy, passToken: randomToken(18) });
}

console.log(`Demo event: /events/${DEMO_ID} (${ids.length} going of 18). Members: demo_fern … demo_kai`);
process.exit(0);
