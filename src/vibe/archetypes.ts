/**
 * Bangkok Types: playful archetypes built on the 6 non-political Vibe
 * categories (energy, explore, rhythm, motion, plan, culture).
 *
 * Your archetype is your strongest pole (12 possible), your modifier is the
 * second-strongest ("Curious Night Owl"). Everyone balanced on every axis is
 * the All-Rounder.
 *
 * Match labels (Natural / Complementary / Interesting) are conversation
 * starters between TYPES. They never hide, rank or exclude people — the PRD
 * rule is that difference is framed as curiosity, never as "incompatible".
 */
import { CATEGORIES, POLES, type Category, type Pole, type Text } from "./content";
import { strengthOf } from "./generator";

export type PoleKey = `${Category}${"+" | "-"}`;
export type ArchetypeKey = PoleKey | "allrounder";

export type Archetype = {
  key: ArchetypeKey;
  emoji: string;
  name: Text;
  tagline: Text;
  description: Text;
  /** Places/activities to try — VisitBangkok flavoured. */
  bangkok: Text;
  starter: Text;
};

const t = (th: string, en: string): Text => ({ th, en });

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  "energy+": {
    key: "energy+", emoji: "🎉",
    name: t("นักเชื่อมคน", "The Connector"),
    tagline: t("คนยิ่งเยอะ ยิ่งสนุก", "The more, the merrier."),
    description: t("คุณได้พลังจากผู้คน ชอบโต๊ะใหญ่ เสียงหัวเราะ และการแนะนำเพื่อนให้รู้จักกัน", "You get energy from people — big tables, laughter, and introducing friends to friends."),
    bangkok: t("ตลาดนัดกลางคืน เทศกาลดนตรี เกมทีม", "Night markets, music festivals, team games"),
    starter: t("งานไหนในกรุงเทพฯ ที่ทำให้คุณได้เพื่อนใหม่มากที่สุด?", "Which Bangkok event got you the most new friends?"),
  },
  "energy-": {
    key: "energy-", emoji: "🍵",
    name: t("เพื่อนสายชิล", "The Calm Companion"),
    tagline: t("คุยลึก ๆ กับคนไม่กี่คน", "Deep talks, few people."),
    description: t("คุณชอบบรรยากาศสบาย ๆ กลุ่มเล็ก และบทสนทนาที่ได้ฟังกันจริง ๆ", "You love easy-going vibes, small groups and conversations where people really listen."),
    bangkok: t("คาเฟ่เงียบ ๆ ม้านั่งริมแม่น้ำ วงอ่านหนังสือ", "Quiet cafés, riverside benches, book circles"),
    starter: t("มุมเงียบที่คุณชอบที่สุดในกรุงเทพฯ อยู่ที่ไหน?", "Where's your favourite quiet corner of Bangkok?"),
  },
  "explore+": {
    key: "explore+", emoji: "🧭",
    name: t("นักสำรวจ", "The Explorer"),
    tagline: t("ซอยไหนยังไม่เคยไป ต้องไป", "If I haven't been, I'm going."),
    description: t("คุณชอบลองของใหม่ ร้านลับ เมนูแปลก และย่านที่ไม่ค่อยมีใครพูดถึง", "You chase the new — hidden spots, unfamiliar dishes and neighbourhoods few people mention."),
    bangkok: t("ฝั่งธนฯ ป๊อปอัปใหม่ คลาสที่ไม่เคยลอง", "Thonburi, new pop-ups, classes you've never tried"),
    starter: t("ที่ล่าสุดในกรุงเทพฯ ที่ทำให้คุณ ‘ว้าว’ คือที่ไหน?", "What's the last Bangkok place that made you go 'wow'?"),
  },
  "explore-": {
    key: "explore-", emoji: "🏠",
    name: t("ขาประจำ", "The Local Regular"),
    tagline: t("ร้านประจำคือที่สุด", "Nothing beats your regular spot."),
    description: t("คุณรู้ว่าอะไรดี และกลับไปหามันเสมอ — ร้านที่รู้ใจ ตลาดที่คุ้นเคย", "You know what's good and keep going back — the shop that knows your order, the market you know by heart."),
    bangkok: t("ร้านก๋วยเตี๋ยวประจำ ตลาดใกล้บ้าน สวนที่วิ่งทุกวัน", "Your noodle place, the local market, your usual park"),
    starter: t("ร้านไหนที่คุณกล้าการันตีว่าอร่อยที่สุด?", "Which spot would you personally guarantee is the best?"),
  },
  "rhythm+": {
    key: "rhythm+", emoji: "🌙",
    name: t("นกฮูกราตรี", "The Night Owl"),
    tagline: t("กรุงเทพฯ ตื่นตอนมืด", "Bangkok wakes up after dark."),
    description: t("คุณคึกคักที่สุดตอนกลางคืน — สตรีทฟู้ดดึก ๆ บาร์แจ๊ส และบทสนทนาหลังสี่ทุ่ม", "You come alive at night — late street food, jazz bars and conversations after 10pm."),
    bangkok: t("เยาวราชยามค่ำ บาร์แจ๊ส ตลาดกลางคืน", "Yaowarat at night, jazz bars, night markets"),
    starter: t("มื้อดึกที่ดีที่สุดในกรุงเทพฯ ของคุณคืออะไร?", "What's your best late-night bite in Bangkok?"),
  },
  "rhythm-": {
    key: "rhythm-", emoji: "🌅",
    name: t("คนตื่นเช้า", "The Early Riser"),
    tagline: t("กรุงเทพฯ ก่อนเก้าโมงสวยที่สุด", "Bangkok is best before 9am."),
    description: t("คุณชอบเช้าที่สงบ ตลาดเช้า วิ่งในสวน และโจ๊กร้อน ๆ ก่อนเมืองตื่น", "You love quiet mornings — early markets, park runs and hot jok before the city wakes."),
    bangkok: t("สวนลุมพินีตอนเช้า ตลาดเช้า วัดก่อนคนเยอะ", "Lumphini at dawn, morning markets, temples before the crowds"),
    starter: t("เช้าที่สมบูรณ์แบบในกรุงเทพฯ ของคุณเป็นแบบไหน?", "What does a perfect Bangkok morning look like for you?"),
  },
  "motion+": {
    key: "motion+", emoji: "🚲",
    name: t("สายลุย", "The Mover"),
    tagline: t("รู้จักกันตอนได้ทำอะไรด้วยกัน", "Friends are made in motion."),
    description: t("คุณชอบลงมือทำ — ปั่นจักรยาน พายเรือ เดินตามล่าของกิน หรือคลาสที่ได้ลงมือเอง", "You like doing — bike rides, kayaking, food quests and hands-on classes."),
    bangkok: t("ปั่นรอบเกาะรัตนโกสินทร์ พายคายัคในคลอง คลาสทำอาหาร", "Rattanakosin bike loops, khlong kayaking, cooking classes"),
    starter: t("กิจกรรมไหนในกรุงเทพฯ ที่คุณอยากชวนคนแปลกหน้าไปทำด้วย?", "What Bangkok activity would you drag a stranger along to?"),
  },
  "motion-": {
    key: "motion-", emoji: "🍜",
    name: t("นักละเมียด", "The Savourer"),
    tagline: t("ขอที่นั่งดี ๆ กับเรื่องคุยยาว ๆ", "A good seat and a long conversation."),
    description: t("คุณชอบใช้เวลาช้า ๆ — มื้อยาว ๆ แกลเลอรี ชาไทย และการนั่งคุยแบบไม่รีบ", "You like slow time — long meals, galleries, Thai tea and unhurried talk."),
    bangkok: t("โต๊ะชิมอาหาร แกลเลอรี รูฟท็อปยามเย็น", "Tasting tables, galleries, rooftops at sunset"),
    starter: t("ถ้าให้ชิมแค่จานเดียวในกรุงเทพฯ จะเลือกอะไร?", "If you could only eat one Bangkok dish today, which?"),
  },
  "plan+": {
    key: "plan+", emoji: "🎲",
    name: t("นักเดินเตร็ด", "The Wanderer"),
    tagline: t("ไม่มีแพลน คือแพลน", "No plan is the plan."),
    description: t("คุณชอบความไม่คาดฝัน — คำชวนกะทันหัน สุ่มลงสถานี BTS และเดินตามความสนใจ", "You love the unexpected — last-minute invites, random BTS stops and following your curiosity."),
    bangkok: t("สุ่มสถานี BTS ซอยในเจริญกรุง ป๊อปอัปวันนี้", "Random BTS stops, Charoenkrung sois, today's pop-ups"),
    starter: t("เรื่องบังเอิญที่ดีที่สุดที่เกิดกับคุณในกรุงเทพฯ คืออะไร?", "What's the best accident that ever happened to you in Bangkok?"),
  },
  "plan-": {
    key: "plan-", emoji: "🗓️",
    name: t("นักวางแผน", "The Planner"),
    tagline: t("แพลนดี วันก็ดี", "A good plan makes a good day."),
    description: t("คุณชอบรู้ล่วงหน้า — จองโต๊ะไว้ เช็กเวลาเปิด และรู้ทางกลับบ้าน ทำให้ทุกคนสบายใจ", "You like knowing ahead — booking the table, checking opening hours, knowing the way home. Everyone relaxes around you."),
    bangkok: t("ทริปตามเส้นทาง VisitBangkok ร้านที่ต้องจอง", "VisitBangkok routes, places worth booking"),
    starter: t("ถ้าต้องวางแผนวันเที่ยวกรุงเทพฯ ให้เพื่อนต่างชาติ คุณจะพาไปไหน?", "Planning a Bangkok day for a visiting friend — where do you take them?"),
  },
  "culture+": {
    key: "culture+", emoji: "🎨",
    name: t("นักล่าเทรนด์", "The Trendspotter"),
    tagline: t("ที่ใหม่ ครีเอทีฟ ต้องไปก่อนใคร", "First to the newest creative spot."),
    description: t("คุณตามหาแกลเลอรีร่วมสมัย ตลาดดีไซน์ คาเฟ่อินดี้ และดนตรีสด", "You hunt for contemporary galleries, design markets, indie cafés and live music."),
    bangkok: t("เจริญกรุง-ตลาดน้อย หอศิลป์ BACC ถนนเจริญนคร", "Charoenkrung–Talat Noi, BACC, Charoen Nakhon Road"),
    starter: t("ศิลปินหรือที่ครีเอทีฟในกรุงเทพฯ ที่คนควรรู้จักคือใคร?", "Which Bangkok artist or creative spot should everyone know?"),
  },
  "culture-": {
    key: "culture-", emoji: "🛕",
    name: t("คนรักย่านเก่า", "The Heritage Lover"),
    tagline: t("เรื่องเล่าอยู่ในตึกเก่า", "Every old shophouse has a story."),
    description: t("คุณหลงรักวัด ตึกแถวเก่า ตลาดดั้งเดิม และชุมชนริมคลอง", "You love temples, old shophouses, traditional markets and canal-side communities."),
    bangkok: t("เกาะรัตนโกสินทร์ คลองบางหลวง ตลาดพลู", "Rattanakosin Island, Khlong Bang Luang, Talat Phlu"),
    starter: t("ย่านเก่าไหนในกรุงเทพฯ ที่คุณอยากให้คนรู้จักมากขึ้น?", "Which old Bangkok neighbourhood deserves more love?"),
  },
  allrounder: {
    key: "allrounder", emoji: "🌀",
    name: t("สายกลางรอบด้าน", "The Bangkok All-Rounder"),
    tagline: t("ได้หมด สนุกได้ทุกแบบ", "Up for anything."),
    description: t("คุณเห็นเสน่ห์ของทุกแบบ — เช้าหรือดึก ร้านประจำหรือที่ใหม่ คุณเข้ากับทุกกลุ่มได้", "You see the fun in everything — early or late, regular or new. You fit into any table."),
    bangkok: t("ทุกที่ที่มีคนน่ารัก", "Anywhere with good people"),
    starter: t("ถ้าต้องเลือกวันหยุดในกรุงเทพฯ แบบสุ่ม คุณอยากได้แบบไหน?", "If your next Bangkok weekend was random, what would you hope for?"),
  },
};

export function poleKey(category: Category, pole: Pole): PoleKey {
  return `${category}${pole === 1 ? "+" : "-"}` as PoleKey;
}

export function parsePoleKey(key: string): { category: Category; pole: Pole } | null {
  const m = /^([a-z]+)([+-])$/.exec(key);
  if (!m || !(CATEGORIES as readonly string[]).includes(m[1])) return null;
  return { category: m[1] as Category, pole: m[2] === "+" ? 1 : -1 };
}

/** Strongest and second-strongest non-balanced poles. */
export function typeOf(vector: Record<string, number>): { archetype: ArchetypeKey; modifier: PoleKey | null } {
  const ranked = CATEGORIES.filter((c) => strengthOf(vector[c] ?? 0) !== "balanced").sort(
    (a, b) => Math.abs(vector[b] ?? 0) - Math.abs(vector[a] ?? 0) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b),
  );
  if (ranked.length === 0) return { archetype: "allrounder", modifier: null };
  const key = (c: Category) => poleKey(c, (vector[c] ?? 0) >= 0 ? 1 : -1);
  return { archetype: key(ranked[0]), modifier: ranked[1] ? key(ranked[1]) : null };
}

/** "Curious Night Owl" / "นกฮูกราตรีสายลองของใหม่". */
export function displayName(archetype: ArchetypeKey, modifier: string | null): Text {
  const a = ARCHETYPES[archetype];
  const m = modifier ? parsePoleKey(modifier) : null;
  if (!m || archetype === "allrounder") return a.name;
  const info = m.pole === 1 ? POLES[m.category].plus : POLES[m.category].minus;
  const bare = { th: a.name.th, en: a.name.en.replace(/^The /, "") };
  return { en: `The ${info.adjective.en} ${bare.en}`, th: `${bare.th}${info.adjective.th}` };
}

/** Pairings that tend to spark: different strengths that fit together. */
const COMPLEMENTS: [PoleKey, PoleKey][] = [
  ["explore+", "plan-"], // explorer finds it, planner makes it happen
  ["rhythm+", "energy+"], // night owl + connector
  ["motion+", "rhythm-"], // mover + early riser
  ["motion-", "culture-"], // savourer + heritage lover
  ["culture+", "plan+"], // trendspotter + wanderer
  ["explore-", "energy-"], // regular + calm companion
];

export type MatchLabel = "natural" | "complementary" | "interesting" | null;

/** How two types relate — for conversation copy only. */
export function matchLabel(a: ArchetypeKey, b: ArchetypeKey): MatchLabel {
  if (a === "allrounder" || b === "allrounder") return a === b ? "natural" : "complementary";
  if (a === b) return "natural";
  if (COMPLEMENTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return "complementary";
  const pa = parsePoleKey(a);
  const pb = parsePoleKey(b);
  if (pa && pb && pa.category === pb.category) return "interesting"; // same axis, opposite ends
  return null;
}

export const MATCH_LABELS: Record<Exclude<MatchLabel, null>, { emoji: string; name: Text; copy: Text }> = {
  natural: { emoji: "💚", name: t("เข้ากันเป็นธรรมชาติ", "Natural match"), copy: t("มองกรุงเทพฯ คล้ายกัน คุยกันง่าย", "You see Bangkok the same way — easy to click.") },
  complementary: { emoji: "🧩", name: t("เติมเต็มกัน", "Complementary match"), copy: t("ต่างกันในแบบที่ลงตัว", "Different in ways that fit together.") },
  interesting: { emoji: "✨", name: t("คู่ที่น่าสนใจ", "Interesting match"), copy: t("คนละขั้ว — เรื่องคุยไม่มีวันหมด", "Opposite ends — you'll never run out of things to talk about.") },
};

/** Types to show on someone's result card. */
export function suggestedMatches(a: ArchetypeKey): { natural: ArchetypeKey; complementary: ArchetypeKey | null; interesting: ArchetypeKey | null } {
  if (a === "allrounder") return { natural: "allrounder", complementary: "energy+", interesting: null };
  const comp = COMPLEMENTS.find(([x, y]) => x === a || y === a);
  const p = parsePoleKey(a)!;
  return {
    natural: a,
    complementary: comp ? (comp[0] === a ? comp[1] : comp[0]) : null,
    interesting: poleKey(p.category, (p.pole === 1 ? -1 : 1) as Pole),
  };
}
