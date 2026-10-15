/**
 * The six NON-POLITICAL lifestyle categories behind the Bangkok Type quiz.
 * Each has a "+" and a "−" pole. Four make the type letters, two (rhythm,
 * plan) add a flavour badge. The questions themselves are hand-written in
 * src/vibe/bank/ (see src/vibe/bank/WRITING.md).
 */

export type Text = { th: string; en: string };

export const CATEGORIES = [
  "energy",
  "explore",
  "rhythm",
  "motion",
  "plan",
  "culture",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** +1 = the first pole in POLES, −1 = the second. */
export type Pole = 1 | -1;

type PoleInfo = {
  label: Text;
  /** Used to build the result name, e.g. "Curious" + "Night Owl". */
  adjective: Text;
  noun: Text;
};

export const POLES: Record<Category, { plus: PoleInfo; minus: PoleInfo; name: Text }> = {
  energy: {
    name: { en: "Social energy", th: "พลังโซเชียล" },
    plus: {
      label: { en: "Buzz", th: "คึกคัก" },
      adjective: { en: "Lively", th: "สายคึกคัก" },
      noun: { en: "Connector", th: "นักเชื่อมคน" },
    },
    minus: {
      label: { en: "Chill", th: "ชิล" },
      adjective: { en: "Easygoing", th: "สายชิล" },
      noun: { en: "Listener", th: "นักฟัง" },
    },
  },
  explore: {
    name: { en: "Exploring", th: "การสำรวจ" },
    plus: {
      label: { en: "Discover", th: "ลองของใหม่" },
      adjective: { en: "Curious", th: "สายลองของใหม่" },
      noun: { en: "Explorer", th: "นักสำรวจ" },
    },
    minus: {
      label: { en: "Familiar", th: "ร้านประจำ" },
      adjective: { en: "Loyal", th: "สายร้านประจำ" },
      noun: { en: "Regular", th: "ขาประจำ" },
    },
  },
  rhythm: {
    name: { en: "Daily rhythm", th: "จังหวะชีวิต" },
    plus: {
      label: { en: "Night owl", th: "นกฮูกกลางคืน" },
      adjective: { en: "Late-Night", th: "สายกลางคืน" },
      noun: { en: "Night Owl", th: "นกฮูกราตรี" },
    },
    minus: {
      label: { en: "Early bird", th: "ตื่นเช้า" },
      adjective: { en: "Sunrise", th: "สายตื่นเช้า" },
      noun: { en: "Early Riser", th: "คนตื่นเช้า" },
    },
  },
  motion: {
    name: { en: "Activity style", th: "สไตล์กิจกรรม" },
    plus: {
      label: { en: "Move", th: "ขยับตัว" },
      adjective: { en: "Active", th: "สายแอคทีฟ" },
      noun: { en: "Mover", th: "สายลุย" },
    },
    minus: {
      label: { en: "Savour", th: "นั่งละเมียด" },
      adjective: { en: "Slow-Sipping", th: "สายนั่งละเมียด" },
      noun: { en: "Savourer", th: "นักละเมียด" },
    },
  },
  plan: {
    name: { en: "Planning style", th: "สไตล์การวางแผน" },
    plus: {
      label: { en: "Spontaneous", th: "ไปตามใจ" },
      adjective: { en: "Spontaneous", th: "สายไปตามใจ" },
      noun: { en: "Wanderer", th: "นักเตร็ดเตร่" },
    },
    minus: {
      label: { en: "Planner", th: "วางแผน" },
      adjective: { en: "Organised", th: "สายวางแผน" },
      noun: { en: "Planner", th: "นักวางแผน" },
    },
  },
  culture: {
    name: { en: "Culture taste", th: "รสนิยมวัฒนธรรม" },
    plus: {
      label: { en: "Creative", th: "ครีเอทีฟ" },
      adjective: { en: "Creative", th: "สายครีเอทีฟ" },
      noun: { en: "Trendspotter", th: "นักล่าเทรนด์" },
    },
    minus: {
      label: { en: "Old-town", th: "เมืองเก่า" },
      adjective: { en: "Old-Town", th: "สายเมืองเก่า" },
      noun: { en: "Heritage Lover", th: "คนรักย่านเก่า" },
    },
  },
};

/**
 * What moves you: a quiet second signal beside the type, from the personality
 * answers that carry a motive. On the result it is one personal sentence,
 * Thai first, with a real Bangkok place to try (owner, D32): no icon, no name
 * to collect, never compared, and it never changes the four letters.
 */
export const MOTIVES = ["useful", "known", "freedom", "calm", "discovery", "belonging"] as const;
export type Motive = (typeof MOTIVES)[number];

/** The first half of the sentence: what you seem happiest doing. */
export const MOTIVE_LINES: Record<Motive, Text> = {
  useful: { th: "คุณดูมีความสุขที่สุดตอนได้ช่วยใครสักคน", en: "You seem happiest when you're helping someone out." },
  known: { th: "คุณดูมีความสุขที่สุดตอนอยู่กับคนที่จำชื่อคุณได้", en: "You seem happiest around people who know your name." },
  freedom: { th: "คุณดูมีความสุขที่สุดตอนได้เลือกทางของตัวเอง", en: "You seem happiest when the day is yours to shape." },
  calm: { th: "คุณดูมีความสุขที่สุดตอนวันค่อย ๆ ผ่านไปช้า ๆ", en: "You seem happiest when the day slows right down." },
  discovery: { th: "คุณดูมีความสุขที่สุดตอนได้เจอมุมใหม่ของเมือง", en: "You seem happiest finding a new corner of the city." },
  belonging: { th: "คุณดูมีความสุขที่สุดตอนอยู่ในที่ที่รู้สึกเป็นของคุณ", en: "You seem happiest somewhere that feels like yours." },
};

/** The second half: a real place to try, with its DISTRICTS key. */
export type MotivePlace = { id: string; district: string; th: string; en: string };

export const MOTIVE_PLACES: Record<Motive, MotivePlace[]> = {
  useful: [
    { id: "nang-loeng-guide", district: "pom_prap", th: "ลองพาเพื่อนใหม่เดินตลาดนางเลิ้งตอนสายดูสิ", en: "Try showing a new friend round Nang Loeng Market one late morning." },
    { id: "tha-chang-boat", district: "phra_nakhon", th: "ลองพาเพื่อนนั่งเรือข้ามฟากจากท่าช้างไปวัดอรุณดูสิ", en: "Try taking a friend on the ferry from Tha Chang to Wat Arun." },
    { id: "lumphini-aerobics", district: "pathum_wan", th: "ลองชวนคนที่เพิ่งย้ายมาไปเต้นแอโรบิกตอนเย็นที่สวนลุมพินีดูสิ", en: "Try bringing someone new in town to Lumphini's evening aerobics." },
  ],
  known: [
    { id: "talat-phlu-breakfast", district: "thon_buri", th: "ลองกินมื้อเช้าร้านเดิมในตลาดพลูทุกเสาร์ดูสิ เดี๋ยวเขาก็จำได้", en: "Try one Talat Phlu breakfast stall every Saturday. They'll soon know you." },
    { id: "ari-cafe", district: "phaya_thai", th: "ลองนั่งคาเฟ่ร้านเดียวในอารีย์ทุกสัปดาห์ดูสิ", en: "Try the same little café in Ari every week." },
    { id: "lumphini-tai-chi", district: "pathum_wan", th: "ลองไปรำไทเก๊กตอนเช้าที่สวนลุมพินีดูสิ ป้า ๆ จำหน้าเก่ง", en: "Try morning tai chi at Lumphini. The aunties remember faces." },
  ],
  freedom: [
    { id: "orange-flag-boat", district: "sathon", th: "ลองนั่งเรือธงส้มจากท่าสาทร แล้วลงท่าที่ใจอยากลงดูสิ", en: "Try the orange-flag boat from Sathorn pier and get off wherever you like." },
    { id: "chatuchak-wander", district: "chatuchak", th: "ลองเดินตลาดนัดจตุจักรแบบไม่มีลิสต์ดูสิ", en: "Try Chatuchak weekend market with no list at all." },
    { id: "rot-fai-ride", district: "chatuchak", th: "ลองปั่นจักรยานในสวนรถไฟแบบไม่กำหนดเส้นทางดูสิ", en: "Try a bike ride round Rot Fai Park with no route in mind." },
  ],
  calm: [
    { id: "benjakitti-skywalk", district: "khlong_toei", th: "ลองเดินสกายวอล์กสวนเบญจกิติเช้าวันธรรมดาดูสิ", en: "Try the Benjakitti skywalk early on a weekday morning." },
    { id: "talat-noi-river", district: "samphanthawong", th: "ลองนั่งจิบกาแฟช้า ๆ ริมน้ำตลาดน้อยดูสิ", en: "Try a slow coffee by the river in Talat Noi." },
    { id: "neilson-hays", district: "bang_rak", th: "ลองนั่งอ่านหนังสือที่ห้องสมุดเนลสันเฮส์บ่ายวันเงียบ ๆ ดูสิ", en: "Try a quiet afternoon in the Neilson Hays Library." },
  ],
  discovery: [
    { id: "talat-noi-sunday", district: "samphanthawong", th: "ลองไปตลาดน้อยเช้าวันอาทิตย์ดูสิ", en: "Try Talat Noi on a Sunday morning." },
    { id: "bacc-show", district: "pathum_wan", th: "ลองแวะดูนิทรรศการใหม่ที่หอศิลป์กรุงเทพฯ ดูสิ", en: "Try the newest show at the Bangkok Art and Culture Centre." },
    { id: "khlong-bang-luang", district: "phasi_charoen", th: "ลองเดินซอยริมคลองบางหลวงสักเสาร์ดูสิ", en: "Try the Khlong Bang Luang canal lanes one Saturday." },
  ],
  belonging: [
    { id: "santichaiprakarn", district: "phra_nakhon", th: "ลองไปสวนสันติชัยปราการเช้าวันเสาร์ ตอนคนแถวนั้นออกมาเจอกันดูสิ", en: "Try Santichaiprakarn Park on a Saturday morning, when the neighbourhood comes out." },
    { id: "kudi-chin-evening", district: "thon_buri", th: "ลองเดินชุมชนกุฎีจีนตอนเย็นดูสิ", en: "Try an evening walk through Kudi Chin as the lanes come alive." },
    { id: "wang-lang-lunch", district: "bangkok_noi", th: "ลองไปกินมื้อเที่ยงที่ตลาดวังหลังกับเพื่อนกลุ่มเดิมดูสิ", en: "Try lunch at Wang Lang Market with the same few friends." },
  ],
};

/**
 * The place for a motive, from the member's own picks: the first place in a
 * district they picked most, else one chosen steadily by `seed`.
 */
export function motivePlace(motive: Motive, pickedDistricts: readonly string[], seed: number): MotivePlace {
  const places = MOTIVE_PLACES[motive];
  const count = new Map<string, number>();
  for (const d of pickedDistricts) count.set(d, (count.get(d) ?? 0) + 1);
  const best = [...places].sort((a, b) => (count.get(b.district) ?? 0) - (count.get(a.district) ?? 0))[0];
  return (count.get(best.district) ?? 0) > 0 ? best : places[Math.abs(seed) % places.length];
}

/** The whole sentence, e.g. "You seem happiest finding a new corner of the city. Try Talat Noi on a Sunday morning." */
export function motiveSentence(motive: Motive, placeId: string): Text {
  const line = MOTIVE_LINES[motive];
  const place = MOTIVE_PLACES[motive].find((p) => p.id === placeId) ?? MOTIVE_PLACES[motive][0];
  return { th: `${line.th} ${place.th}`, en: `${line.en} ${place.en}` };
}
