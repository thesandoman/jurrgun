/**
 * Content rules for the hand-written quiz bank (src/vibe/bank/*.ts). Used by
 * test/bank.test.ts and by scripts/check-bank.ts while writing new scenarios.
 */
import { DISTRICTS } from "../lib/constants";
import type { Scenario } from "./scenarios";

const CODES = [
  "BDMN", "BDMH", "BDSN", "BDSH", "BFMN", "BFMH", "BFSN", "BFSH",
  "CDMN", "CDMH", "CDSN", "CDSH", "CFMN", "CFMH", "CFSN", "CFSH",
];
const FLIP: Record<string, string> = { B: "C", C: "B", D: "F", F: "D", M: "S", S: "M", N: "H", H: "N" };
const opposite = (c: string) => c.split("").map((ch) => FLIP[ch]).join("");

const CONTEXTS = new Set(["friends", "family", "date", "solo", "coworkers", "party", "meetup"]);
const KINDS = new Set(["core", "rhythm", "plan"]);
const TONES = new Set(["dawn", "morning", "afternoon", "evening", "night", "rain"]);
const MOODS = new Set(["everyday", "landmark", "seasonal", "funny", "personality"]);
const AUDIENCES = new Set(["local", "newcomer", "international"]);
const SETS = new Set(["open-to-more", "table-host"]);
export const DISTRICT_KEYS = new Set(DISTRICTS.map((d) => d.value));

/** Civic, political and religious-practice words (same list as the old quiz). */
export const BANNED_EN =
  /policy|policies|government|politic|vote|voting|election|ballot|budget|tax\b|taxes|rules?\b|regulat|law\b|cctv|surveillance|police|security guard|expert|resident|public money|subsid|campaign|party (?:member|leader|line|politics)|ideolog|religio|worship|monk|alms|merit|pray|LGBT|gender|income|salary|protest|candidate|parliament|minister|governor|BMA\b/i;
export const BANNED_TH = /การเมือง|เลือกตั้ง|โหวต|ลงคะแนน|ภาษี(?!เจริญ)|งบประมาณ|ตำรวจ|กล้องวงจรปิด|ศาสนา|ไหว้พระ|ตักบาตร|ทำบุญ|พรรค|รัฐบาล|นโยบาย|กฎหมาย|ผู้ว่า|ประท้วง|รายได้|เงินเดือน/;
/** Gendered words: every answer has to work for anyone. */
export const GENDERED_EN = /\b(he|she|him|her|his|hers|himself|herself|boyfriend|girlfriend|husband|wife|guys|girls|boys|ladies|gentlemen|mom|dad|mum)\b/i;
export const GENDERED_TH = /ครับ|ค่ะ|แฟนหนุ่ม|แฟนสาว|สามี|ภรรยา|หนุ่ม ๆ|สาว ๆ/;
/** Family friendly: no alcohol, drugs, gambling or anything adult. */
export const ADULT_EN = /\b(beer|beers|wine|cocktails?|booze|alcohol|drunk|drinks?|drinking|shots?|hangover|sexy|hook ?up|casino|bet|betting|gambl\w*|weed|cannabis|smoking|cigarettes?|vape)\b/i;
export const ADULT_TH = /เบียร์|ไวน์|เหล้า|ค็อกเทล|เมา|แอลกอฮอล์|กัญชา|บุหรี่|พนัน|คาสิโน/;

/** Retired names (project-state D4, D5, O1): never "circle", "dating mode" or "Made with the BMA" in copy. */
export const RETIRED_EN = /\bcircles?\b|dating mode|made with the bma/i;
export const RETIRED_TH = /โหมดเดต|หาคู่|ตั้งวง|วงคุย|วงเพื่อน|ร่วมกับกรุงเทพมหานคร/;
/** Spellings the Thai glossary (design/reference/thai-voice.md) replaces. */
export const SPELLING_TH = /เดท|แชท|เช็คอิน|ลิ้?งค์|อีเว้?นท์|อีเวนต์|แมทช์|บล็อค|สแตมป์|เควส(?!ต์)|ไทพ์|บัดดี(?!้)|โฮส(?!ต์)|พาสปอต/;
/**
 * Romance words (owner, Q-D1): a date moment's friend wording, which members
 * who aren't open to something more read, must never say any of these.
 */
export const ROMANCE_EN = /\b(dates?|dating|double date|partner|boyfriend|girlfriend|romantic|romance|crush|couples?(?! of)|anniversary|valentine'?s?|in love|lovers?|kiss)\b/i;
/** Thai has no spaces between words: กาแฟ (coffee) holds แฟน and ขนมจีบ (dumplings) holds จีบ. */
export const ROMANCE_TH = /เดต|(?<!กา)แฟน|คู่รัก|คู่เดต|โรแมนติก|วาเลนไทน์|(?<!ขนม)จีบ|ความรัก|หวานใจ/;
export const ROMANCE_ICONS = /💘|💞|💕|💖|💗|💓|❤️|❤|💍|🌹|💋|😍|🥰/u;

/** Polite particles: the app has no gender, so none at all (ครับ and ค่ะ are in GENDERED_TH). */
export const POLITE_TH = /คะ(?=\s|$|[?!…])|จ้ะ|จ้า(?=\s|$)/;

/**
 * The quiz review (design/reference/quiz-review.md, rule 1): show a letter
 * through a detail, never by naming it. At most one answer in five per
 * scenario may lean on these words (3 of 16).
 */
export const STOCK_WORDS_EN = /\b(usual|regular|regulars|never|new)\b/i;
export const MAX_STOCK_ANSWERS = 3;
/** Review rule 2: 6 to 12 words, one picture in your head. */
export const MIN_WORDS = 6;
export const MAX_WORDS = 12;
/**
 * Scenarios written before the review (2026-10-15). Until each is rewritten
 * they keep the old limits: up to 24 words and no cap on stock words. When you
 * rewrite one to the new rules, delete its id here; never add one.
 */
export const LEGACY_IDS: ReadonlySet<string> = new Set([
  "saturday", "visitor", "friday", "sunday", "photo", "rain", "story", "newfriend", "familylunch", "parentsvisit",
  "grandparent-birthday", "kids-day", "siblings", "chosen-family", "firstdate", "seconddate", "anniversary", "budget-date",
  "rainy-date", "sunset-date", "birthday-host", "countdown", "farewell", "good-news", "stranger-dinner", "new-group",
  "know-one", "team-outing", "new-coworker", "after-work", "longweekend", "cheer-up", "group-chat", "toohot",
  "weekday-off", "best-hours", "meetup-slot", "date-time", "family-outing-time", "friends-time", "party-time",
  "free-evening", "meetup-signup", "date-plan", "family-trip", "friends-weekend", "party-plan",
]);
/** A D answer that reads as a habit, or an F answer that reads as a first. */
export const CONTRA_D_EN = /\b(usual|regular|as always|like every|for years|like always|same (?:route|loop|table|stall|spot|order|seat))\b/i;
export const CONTRA_F_EN = /\b(never(?! skip| miss)|none of you|neither of you|haven't|you've never|just opened|just-opened|brand[- ]new|first visit|first time)\b/i;
export const TIME_EN = /\b\d{1,2}(?::\d\d)? ?(?:am|pm)\b|midnight|sunrise|sunset|dawn|dusk|late|after[- ]dark|night|morning|past \d|till|until/i;
export const PLAN_EN = /ahead|book|reserv|plan|schedul|sign up|register|rsvp|whim|on the spot|unplanned|unannounced|impulse|same-day|that morning|on the day|on the night|last.minute|an hour|\bnow\b|tonight|no plan|decide|calendar|saved|itinerar|kept for|\bmap|route|turn up|show up|drop into|drift|say yes|open call|soonest|whichever|whatever|\btext|message|\bring\b|\bcall\b|ping|\bask|right away|random|let's go|whoever's free|standing|no reviews/i;
/** Softer hints for the other six letters: missing ones are warnings, not errors. */
const HINT_EN: Record<string, RegExp> = {
  B: /\b(crowds?|crowded|group|gang|crew|everyone|whole|team|teammates|all|friends|big|long table|packed|busy|bustl\w*|buzzing|lively|strangers|double date|relatives|cousins|family|siblings|regulars|thousands|half|six|ten|twelve|twenty|clan|club|invite\w*|welcome|noisy|anyone|whoever|party|fair|festival|tour|class|queue|room|locals|neighbourhood)\b/i,
  C: /\b(alone|solo|one|two|three|few|couple|small|quiet\w*|calm|slow\w*|just|your date|with them|sibling|grandparents?|parents?|housemate|flatmate|neither|both|corner|pairs|one-on-one|best friend|old friend|close|window seat|seat|no hurry|you two|kid)\b/i,
  M: /\b(walk\w*|wander\w*|rid(?:e|es|ing)|cycl\w*|bikes?|run\w*|jog\w*|danc\w*|paddl\w*|kayak|climb\w*|yoga|swim|badminton|football|futsal|games?|class|hunt\w*|explor\w*|stroll\w*|laps?|loop|tai chi|aerobics|bowling|kites?|hands-on|workshop|pilates|scooters|slides|picking|crawl|hop\w*|tour|sketch\w*|stretch|ramwong|muay thai|takraw|rac(?:e|ing)|match|rallies|soaked|water fights|on foot|steps|lead|squeeze|browse|dash|duck|follow)\b/i,
  S: /\b(eat\w*|dinner|lunch|breakfast|brunch|tables?|caf[ée]s?|seats?|sit\w*|seated|film|movie|cinema|talk\w*|chat\w*|conversation|coffee|tea|cake|noodles?|feast|show|museum|read\w*|books?|supper|jok|dessert|sweets|plates?|dishes|bowls?|stools|curry|karaoke|music|jazz|band|concert|watch\w*|slow|sketchbook|board games?|library|snack\w*|food|stalls?|restaurant|mocktails|smoothies|coconut|ice cream|khao|bua loi|shaved ice|latte|pastry|kopi|seafood|rice|buns|banquet|gig|exhibition|picture|photo|order|stories|wheel|counting down|stay\w*|linger\w*|listen\w*)\b/i,
  N: /\b(new\w*|caf[ée]s?|gallery|galleries|design|indie|pop-ups?|art|artists?|murals?|mall|rooftop|club|studio|film|cinema|board games?|DJ|jazz|concert|playlist|karaoke|yoga|pilates|run club|smoothies|latte|brunch|skywalk|expo|bowling|futsal|badminton|swim|dance|salad|mocktails|fair|book\w*|modern|station|terminal|Pink Line|campus|park|EmSphere|EmQuartier|ICONSIAM|Siam|Samyan|One Bangkok|Commons|Terminal 21|Fashion Island|Seacon|Union Mall|Jam Factory|Lhong|Chang Chui|BACC|TCDC|True Digital|Ari|Thonglor|Ekkamai|Charoenkrung|Charoen Nakhon|RCA|Silom|Sathon|BITEC|Benjakitti|Chula|Lido|House Samyan|Warehouse 30|Aphiwat|MahaNakhon|Asiatique|Jodd|Saxophone|Brown Sugar|Rama III|Lat Phrao|Pattavikorn|Amazing Park|Safari|Major|Arena|Rajamangala|Sports Centre|Benjasiri|Rot Fai|Suan Luang|Seri Thai|Lumphini)\b/i,
  H: /\b(old\w*|temples?|Wat|markets?|canals?|Khlong|shophouses?|recipes?|Kudi Chin|Yaowarat|Talat|Song Wat|Phahurat|Little India|Ban Khrua|Nang Loeng|Wang Lang|Golden Mount|Sanam Luang|Pak Khlong|Thewet|Rattanakosin|Phraeng Phuthon|Dusit|Lumphini|Santichaiprakarn|Songkran|Loy Krathong|krathong|kites?|tai chi|Muay Thai|takraw|ramwong|fair|sweets|jok|khao|bua loi|kopi|patongko|museum|Barges|Bangkokian|Baan Silapin|puppet|rice fields?|farms?|orchards?|orchid|mangroves?|long-tail|floating|noodles?|garlands?|street food|stalls?|Suan Luang|Seri Thai|curry|chicken rice|seafood|coconut|grandparents?|tradition|Chokchai|Pratunam|Victory Monument|Ramkhamhaeng|Din Daeng|Hua Takhe|Min Buri|Air Force|Rama VIII|Bang \w+|Isan|halal|dessert|coast|river\w*|pier|boat)\b/i,
};
/** Places that must be named in both languages when one of them names it (EN pattern, Thai substring). */
const PLACE_PAIRS: [RegExp, string][] = [
  [/Yaowarat/, "เยาวราช"], [/Talat Noi/, "ตลาดน้อย"], [/Song Wat/, "ทรงวาด"], [/Talat Phlu/, "ตลาดพลู"], [/Kudi Chin/, "กุฎีจีน"],
  [/Wang Lang/, "วังหลัง"], [/Nang Loeng/, "นางเลิ้ง"], [/Golden Mount/, "ภูเขาทอง"], [/Pak Khlong Talat/, "ปากคลองตลาด"],
  [/Thewet/, "เทเวศร์"], [/Sanam Luang/, "สนามหลวง"], [/Santichaiprakarn/, "สันติชัยปราการ"], [/Khlong Ong Ang/, "โอ่งอ่าง"],
  [/Wat Arun/, "วัดอรุณ"], [/Lumphini/, "ลุมพินี"], [/Benjakitti/, "เบญจกิติ"], [/Benjasiri/, "เบญจสิริ"], [/Suan Luang Rama IX/, "สวนหลวง ร.9"],
  [/Rot Fai Park/, "สวนรถไฟ"], [/Chatuchak/, "จตุจักร"], [/Chula Centenary/, "100 ปี จุฬาฯ"], [/Seri Thai/, "เสรีไทย"], [/\bAri\b/, "อารีย์"],
  [/Thonglor/, "ทองหล่อ"], [/Ekkamai/, "เอกมัย"], [/Charoenkrung/, "เจริญกรุง"], [/Charoen Nakhon/, "เจริญนคร"], [/ICONSIAM/, "ไอคอนสยาม"],
  [/EmSphere/, "เอ็มสเฟียร์"], [/EmQuartier/, "เอ็มควอเทียร์"], [/The Commons/, "คอมมอนส์"], [/Jam Factory/, "แจม แฟคทอรี่"], [/Lhong 1919/, "ล้ง 1919"],
  [/Chang Chui/, "ช่างชุ่ย"], [/BACC/, "BACC|หอศิลป์กรุงเทพฯ"], [/TCDC/, "TCDC"], [/True Digital Park/, "ทรู ดิจิทัล พาร์ค"], [/House Samyan/, "เฮาส์ สามย่าน"],
  [/Samyan Mitrtown/, "สามย่านมิตรทาวน์"], [/One Bangkok/, "วัน แบงค็อก"], [/Lido Connect/, "ลิโด้"], [/Siam Square/, "สยามสแควร์"], [/\bRCA\b/, "RCA"],
  [/Silom Soi 4/, "สีลมซอย 4"], [/Sathon/, "สาทร"], [/BITEC/, "ไบเทค"], [/Asiatique/, "เอเชียทีค"], [/MahaNakhon/, "มหานคร"],
  [/Krung Thep Aphiwat|Central Terminal/, "อภิวัฒน์"], [/Fashion Island/, "แฟชั่นไอส์แลนด์"], [/Seacon/, "ซีคอน"], [/Union Mall/, "ยูเนี่ยน มอลล์"],
  [/Major Cineplex|Ratchayothin/, "เมเจอร์"], [/Terminal 21/, "เทอร์มินอล 21"], [/Jodd Fairs/, "จ๊อดแฟร์"], [/Saxophone/, "แซกโซโฟน"], [/Brown Sugar/, "บราวน์ชูการ์"],
  [/Siam Amazing Park/, "สวนสยาม"], [/Safari World/, "ซาฟารีเวิลด์"], [/Bangkok Arena/, "บางกอกอารีนา"], [/Rajamangala/, "ราชมังคลา"],
  [/Thai-Japanese Sports Centre/, "ศูนย์เยาวชนไทย-ญี่ปุ่น"], [/Victory Monument/, "อนุสาวรีย์ชัย"], [/Pratunam/, "ประตูน้ำ"], [/Ban Khrua/, "บ้านครัว"],
  [/Phahurat|Little India/, "พาหุรัด"], [/Chokchai 4/, "โชคชัย 4"], [/Lat Phrao 101/, "ลาดพร้าว 101"], [/Khlong Lat Phrao/, "คลองลาดพร้าว"],
  [/Din Daeng/, "ดินแดง"], [/Liab Duan/, "เลียบด่วน"], [/Pattavikorn/, "ปัฐวิกรณ์"], [/On Nut/, "อ่อนนุช"], [/Ramkhamhaeng/, "รามคำแหง"],
  [/Hua Takhe/, "หัวตะเข้"], [/Min Buri/, "มีนบุรี"], [/Nong Chok/, "หนองจอก"], [/Khlong Sam Wa/, "คลองสามวา"], [/Lat Krabang/, "ลาดกระบัง"],
  [/Bang Khun Thian/, "บางขุนเทียน"], [/Taling Chan/, "ตลิ่งชัน"], [/Lat Mayom/, "ลัดมะยม"], [/Phasi Charoen/, "ภาษีเจริญ"], [/Bang Luang|Baan Silapin|Artist House/, "บ้านศิลปิน|บางหลวง"],
  [/Royal Barges/, "เรือพระราชพิธี"], [/Bangkokian Museum/, "ชาวบางกอก"], [/Air Force Museum/, "กองทัพอากาศ"], [/Wat Ratchaorasaram/, "ราชโอรส"],
  [/Bang Mot/, "บางมด"], [/KMUTT/, "มจธ"], [/Pracha Uthit/, "ประชาอุทิศ"], [/Suk Sawat/, "สุขสวัสดิ์"], [/Wat Bang Pakok/, "บางปะกอก"],
  [/Rama III/, "พระราม 3"], [/Rama VIII/, "พระราม 8"], [/Wat Chong Nonsi/, "วัดช่องนนทรี"], [/Chong Nonsi Canal Park/, "สวนคลองช่องนนทรี"],
  [/Wat Yannawa/, "ยานนาวา"], [/Wat Thammamongkhon/, "ธรรมมงคล"], [/Wat Benchamabophit|Marble Temple/, "เบญจ"], [/Wat Lak Si/, "วัดหลักสี่"],
  [/IT Square/, "ไอทีสแควร์"], [/Bang Khae/, "บางแค"], [/Saphan Khwai/, "สะพานควาย"], [/Saphan Mai/, "สะพานใหม่"], [/Wongsakorn/, "วงศกร"],
  [/Don Mueang/, "ดอนเมือง"], [/Bang Bon/, "บางบอน"], [/Saphan Sung/, "สะพานสูง"], [/Thawi Watthana/, "ทวีวัฒนา"], [/Nong Khaem/, "หนองแขม"],
  [/Khlong Toei Market/, "ตลาดคลองเตย"], [/Udom Suk/, "อุดมสุข"], [/Bang Khen/, "บางเขน"], [/Bang Sue|Bang Pho/, "บางซื่อ|บางโพ|อภิวัฒน์"],
  [/Saen Saep/, "แสนแสบ"], [/Khlong Bangkok Yai/, "บางกอกใหญ่"], [/Bangkok Noi/, "บางกอกน้อย"], [/Kaset/, "เกษตร"], [/Khao San/, "ข้าวสาร"],
  [/Phraeng Phuthon/, "แพร่งภูธร"], [/Warehouse 30/, "Warehouse 30"], [/Thailand Cultural Centre/, "ศูนย์วัฒนธรรม"], [/Huai Khwang/, "ห้วยขวาง"],
  [/Thepleela/, "เทพลีลา"], [/Gateway at Bangsue/, "เกตเวย์"], [/Rama VII\b/, "พระราม 7"],
];

export type BankCheck = { errors: string[]; warnings: string[]; districts: { counts: Map<string, number> } };

/** `oneFile`: checking one bank file on its own, so a twin may live in another file. */
export function checkScenarios(list: Scenario[], opts: { oneFile?: boolean } = {}): BankCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const seenEn = new Set<string>();
  const counts = new Map<string, number>();
  const text = (where: string, en: string, th: string) => {
    if (!en?.trim()) errors.push(`${where}: empty English`);
    if (!th?.trim()) errors.push(`${where}: empty Thai`);
    for (const [re, what] of [
      [/[–—]/, "em or en dash"],
      [BANNED_EN, "civic/political/religious word"],
      [GENDERED_EN, "gendered word"],
      [ADULT_EN, "not family friendly"],
      [RETIRED_EN, "retired name"],
    ] as const) {
      const m = re.exec(en ?? "");
      if (m) errors.push(`${where}: ${what} "${m[0]}" in EN: ${en}`);
    }
    for (const [re, what] of [
      [/[–—]/, "em or en dash"],
      [BANNED_TH, "civic/political/religious word"],
      [GENDERED_TH, "gendered word"],
      [ADULT_TH, "not family friendly"],
      [RETIRED_TH, "retired name"],
      [SPELLING_TH, "glossary spelling"],
      [POLITE_TH, "polite particle"],
    ] as const) {
      const m = re.exec(th ?? "");
      if (m) errors.push(`${where}: ${what} "${m[0]}" in TH: ${th}`);
    }
  };
  for (const sc of list) {
    const w = `scenario ${sc.id}`;
    if (!sc.id || ids.has(sc.id)) errors.push(`${w}: missing or duplicate id`);
    ids.add(sc.id);
    if (!KINDS.has(sc.kind)) errors.push(`${w}: bad kind ${sc.kind}`);
    if (!CONTEXTS.has(sc.context)) errors.push(`${w}: bad context ${sc.context}`);
    if (!TONES.has(sc.tone)) errors.push(`${w}: bad tone ${sc.tone}`);
    if (!sc.icon) errors.push(`${w}: no icon`);
    if (!MOODS.has(sc.mood)) errors.push(`${w}: bad mood ${sc.mood}`);
    if (sc.months !== undefined) {
      if (sc.mood !== "seasonal") errors.push(`${w}: only seasonal scenarios have months`);
      if (!sc.months.length || sc.months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) errors.push(`${w}: months must be 1 to 12`);
    }
    for (const x of sc.audience ?? []) if (!AUDIENCES.has(x)) errors.push(`${w}: bad audience ${x}`);
    if (sc.set !== undefined && !SETS.has(sc.set)) errors.push(`${w}: bad set ${sc.set}`);
    // Date moments are in everyone's quiz (owner, Q-D1): members who aren't open to
    // something more read the friend wording, which must have no romance in it.
    if (sc.context === "date" && sc.set !== "open-to-more") {
      const f = sc.friend;
      if (!f?.prompt) errors.push(`${w}: a date scenario needs a friend wording (friend.prompt) unless it is in set "open-to-more"`);
      else {
        text(`${w} friend prompt`, f.prompt.en, f.prompt.th);
        for (const [lang, p] of [["EN", f.prompt.en], ["TH", f.prompt.th]] as const) if (p && !/[?:…]$/.test(p.trim())) errors.push(`${w}: ${lang} friend prompt must end with "?", ":" or "…"`);
        for (const k of Object.keys(f.answers ?? {})) if (!CODES.includes(k)) errors.push(`${w}: friend answer for unknown type ${k}`);
        const read: [string, string, string, string][] = [["prompt", f.prompt.en, f.prompt.th, f.icon ?? sc.icon]];
        for (const code of CODES) {
          const a = sc.answers?.[code as keyof typeof sc.answers];
          const o = f.answers?.[code as keyof typeof f.answers];
          if (o) text(`${w} friend ${code}`, o.en, o.th);
          if (a || o) read.push([code, (o ?? a)!.en, (o ?? a)!.th, a?.icon ?? ""]);
        }
        for (const [where, en, th, icon] of read) {
          const m = ROMANCE_EN.exec(en ?? "") ?? ROMANCE_TH.exec(th ?? "") ?? ROMANCE_ICONS.exec(icon);
          if (m) errors.push(`${w} friend ${where}: romance "${m[0]}" in the friend wording`);
        }
      }
    }
    if (sc.friend && sc.context !== "date") errors.push(`${w}: only date scenarios have a friend wording`);
    text(`${w} prompt`, sc.prompt?.en, sc.prompt?.th);
    for (const [lang, p] of [["EN", sc.prompt?.en], ["TH", sc.prompt?.th]] as const) if (p && !/[?:…]$/.test(p.trim())) errors.push(`${w}: ${lang} prompt must end with "?", ":" or "…"`);
    const keys = Object.keys(sc.answers ?? {});
    if (keys.length !== 16 || !CODES.every((c) => keys.includes(c))) errors.push(`${w}: needs exactly the 16 type codes, has ${keys.join(",")}`);
    for (const code of CODES) {
      const a = sc.answers?.[code as keyof typeof sc.answers];
      if (!a) continue;
      const aw = `${w} ${code}`;
      text(aw, a.en, a.th);
      if (!a.icon) errors.push(`${aw}: no icon`);
      if (!DISTRICT_KEYS.has(a.district)) errors.push(`${aw}: unknown district "${a.district}"`);
      counts.set(a.district, (counts.get(a.district) ?? 0) + 1);
      const key = a.en?.toLowerCase().trim();
      if (seenEn.has(key)) errors.push(`${aw}: duplicate answer text`);
      seenEn.add(key);
      errors.push(...answerSense(aw, code, sc.kind, a.en, a.th, LEGACY_IDS.has(sc.id)));
      // Alone or as a pair is the whole point of a solo or date scenario, so C needs no word there.
      for (const L of code) if (HINT_EN[L] && !(L === "C" && (sc.context === "solo" || sc.context === "date")) && !HINT_EN[L].test(a.en ?? "")) warnings.push(`${aw}: nothing in the English shows ${L}: ${a.en}`);
      if (sc.kind === "core" && a.flavour !== undefined) errors.push(`${aw}: core answers have no flavour`);
      if (sc.kind !== "core") {
        if (a.flavour !== 1 && a.flavour !== -1) errors.push(`${aw}: ${sc.kind} answers need flavour 1 or -1`);
        const opp = sc.answers?.[opposite(code) as keyof typeof sc.answers];
        if (opp && a.flavour !== undefined && opp.flavour === a.flavour) errors.push(`${aw}: flavour must be the opposite of ${opposite(code)}'s`);
      }
    }
  }
  for (const sc of list) {
    if (LEGACY_IDS.has(sc.id)) continue;
    const stock = CODES.filter((c) => STOCK_WORDS_EN.test(sc.answers?.[c as keyof typeof sc.answers]?.en ?? ""));
    if (stock.length > MAX_STOCK_ANSWERS) errors.push(`scenario ${sc.id}: ${stock.length} answers say usual, regular, never or new (${stock.join(", ")}); show it through a detail instead, at most ${MAX_STOCK_ANSWERS}`);
  }
  for (const sc of list) {
    if (sc.twin && !list.some((x) => x.id === sc.twin) && !opts.oneFile) errors.push(`scenario ${sc.id}: twin ${sc.twin} not found`);
  }
  return { errors, warnings, districts: { counts } };
}

/** The sense rules one answer can be checked for without a human (quiz-blueprint.md, "Checklist"). */
export function answerSense(where: string, code: string, kind: string, en: string, th: string, legacy = false): string[] {
  const out: string[] = [];
  if (!en || !th) return out;
  const words = en.trim().split(/\s+/).length;
  const max = legacy ? 24 : MAX_WORDS;
  if (words < MIN_WORDS || words > max) out.push(`${where}: ${words} words; keep answers to ${MIN_WORDS} to ${max}`);
  if (/^I\b|\bI'm\b|\bmy\b/.test(en)) out.push(`${where}: write the action, not "I": ${en}`);
  if (code[1] === "D") {
    const m = CONTRA_D_EN.exec(en);
    if (m) out.push(`${where}: a D answer reads as a habit ("${m[0]}"): ${en}`);
  }
  if (code[1] === "F") {
    const m = CONTRA_F_EN.exec(en);
    if (m) out.push(`${where}: an F answer reads as a first ("${m[0]}"): ${en}`);
  }
  if (kind === "rhythm" && !TIME_EN.test(en)) out.push(`${where}: a rhythm answer must make the time obvious: ${en}`);
  if (kind === "plan" && !PLAN_EN.test(en)) out.push(`${where}: a plan answer must make planned or spontaneous obvious: ${en}`);
  for (const b of en.match(/\d+(?=-baht| baht)/g) ?? []) if (!th.includes(b)) out.push(`${where}: ${b} baht in English but not in Thai`);
  for (const [re, thName] of PLACE_PAIRS) {
    if (re.test(en) && !new RegExp(thName).test(th)) out.push(`${where}: names ${re.source} in English but not in Thai`);
  }
  return out;
}
