/**
 * The 16 Bangkok Types: playful characters built on the non-political Vibe
 * categories, in the spirit of a 4-letter personality code.
 *
 * Four "code" axes give the letters (in this order):
 *   energy   B Buzz      / C Chill
 *   explore  D Discover  / F Familiar
 *   motion   M Move      / S Savour
 *   culture  N New-scene / H Heritage
 * The other two categories add a flavour badge, not a letter:
 *   rhythm   🌙 Night owl / 🌅 Early riser
 *   plan     🎲 Spontaneous / 🗓️ Planner
 * All six categories still feed table matching.
 *
 * Match labels (Natural / Complementary / Interesting) are conversation
 * starters between TYPES. They never hide, rank or exclude anyone.
 */
import { CATEGORIES, type Category, type Text } from "./content";
import { strengthOf } from "./generator";

const t = (th: string, en: string): Text => ({ th, en });

/** The four code axes, in letter order, with their two letters. */
export const CODE_AXES: { category: Category; plus: string; minus: string }[] = [
  { category: "energy", plus: "B", minus: "C" },
  { category: "explore", plus: "D", minus: "F" },
  { category: "motion", plus: "M", minus: "S" },
  { category: "culture", plus: "N", minus: "H" },
];

/** Legend: what every letter and badge means (shown in Learn and on results). */
export const LEGEND: { key: string; icon: string; name: Text; meaning: Text }[] = [
  { key: "B", icon: "🎉", name: t("คึกคัก (Buzz)", "Buzz"), meaning: t("ได้พลังจากคนเยอะ ๆ", "Energised by a crowd") },
  { key: "C", icon: "🍵", name: t("ชิล (Chill)", "Chill"), meaning: t("ชอบกลุ่มเล็ก คุยลึก", "Small groups, deeper talk") },
  { key: "D", icon: "🧭", name: t("ลองของใหม่ (Discover)", "Discover"), meaning: t("ชอบที่ใหม่ ร้านลับ", "New places, hidden spots") },
  { key: "F", icon: "🏠", name: t("ร้านประจำ (Familiar)", "Familiar"), meaning: t("ชอบที่คุ้นเคย เป็นขาประจำ", "Favourite spots, being a regular") },
  { key: "M", icon: "🚲", name: t("ขยับตัว (Move)", "Move"), meaning: t("รู้จักกันตอนได้ทำอะไรด้วยกัน", "Bonding while doing things") },
  { key: "S", icon: "🍜", name: t("ละเมียด (Savour)", "Savour"), meaning: t("นั่งนาน กินช้า คุยยาว", "Long meals, slow talk") },
  { key: "N", icon: "🎨", name: t("ซีนใหม่ (New-scene)", "New-scene"), meaning: t("แกลเลอรี ดีไซน์ ดนตรีอินดี้", "Galleries, design, indie music") },
  { key: "H", icon: "🛕", name: t("เมืองเก่า (Heritage)", "Heritage"), meaning: t("วัด ตึกเก่า ตลาดดั้งเดิม", "Temples, shophouses, old markets") },
  { key: "rhythm+", icon: "🌙", name: t("นกฮูกกลางคืน", "Night owl"), meaning: t("คึกคักหลังมืด", "Comes alive after dark") },
  { key: "rhythm-", icon: "🌅", name: t("คนตื่นเช้า", "Early riser"), meaning: t("เช้าคือเวลาที่ดีที่สุด", "Mornings are best") },
  { key: "plan+", icon: "🎲", name: t("ไปตามใจ", "Spontaneous"), meaning: t("ไม่มีแพลนคือแพลน", "No plan is the plan") },
  { key: "plan-", icon: "🗓️", name: t("นักวางแผน", "Planner"), meaning: t("แพลนดี วันก็ดี", "A good plan makes a good day") },
];

export type ArchetypeKey =
  | "BDMN" | "BDMH" | "BDSN" | "BDSH" | "BFMN" | "BFMH" | "BFSN" | "BFSH"
  | "CDMN" | "CDMH" | "CDSN" | "CDSH" | "CFMN" | "CFMH" | "CFSN" | "CFSH";

export type Archetype = {
  key: ArchetypeKey;
  emoji: string;
  name: Text;
  tagline: Text;
  description: Text;
  /** Places/activities to try, VisitBangkok flavoured. */
  bangkok: Text;
  starter: Text;
};

const A = (key: ArchetypeKey, emoji: string, name: Text, tagline: Text, description: Text, bangkok: Text, starter: Text): Archetype => ({
  key, emoji, name, tagline, description, bangkok, starter,
});

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  BDMN: A("BDMN", "🛵", t("นักลุยสายสตรีท", "The Street Explorer"), t("ออกจากบ้าน ไปหาสิ่งใหม่", "Out the door, into the new."),
    t("คุณชอบคนเยอะ ของใหม่ และได้ขยับตัว ป๊อปอัป สตรีทอาร์ต และทริปปั่นจักรยานคือสนามของคุณ", "Crowds, new things and moving around: pop-ups, street art and bike tours are your playground."),
    t("เจริญกรุง-ตลาดน้อย ทัวร์ปั่นสตรีทอาร์ต ป๊อปอัปมาร์เก็ต", "Charoenkrung–Talat Noi, street-art bike tours, pop-up markets"),
    t("ป๊อปอัปไหนล่าสุดที่คุณบอกต่อเพื่อน?", "Which pop-up did you last tell everyone about?")),
  BDMH: A("BDMH", "🧭", t("นักผจญภัยเมืองเก่า", "The Old-Town Adventurer"), t("ทุกตรอกมีเรื่องเล่า", "Every alley has a story."),
    t("คุณชอบพาแก๊งเดินลุยย่านเก่าที่ไม่เคยไป วัดเล็ก ๆ ตลาดลับ และชุมชนริมคลอง", "You lead the group through old quarters nobody's tried: small temples, hidden markets, canal communities."),
    t("เกาะรัตนโกสินทร์ ถนนทรงวาด คลองฝั่งธนฯ", "Rattanakosin Island, Song Wat Road, Thonburi canals"),
    t("ย่านเก่าไหนที่คุณอยากพาคนแปลกหน้าไปเดิน?", "Which old neighbourhood would you take a stranger to?")),
  BDSN: A("BDSN", "🥂", t("นักล่าซีนครีเอทีฟ", "The Scene Seeker"), t("เปิดตัวที่ไหน ไปที่นั่น", "If it's opening, you're there."),
    t("คุณชอบงานเปิดแกลเลอรี คาเฟ่ใหม่ และวงคุยยาว ๆ กับคนหลากหลาย", "Gallery openings, new cafés and long conversations with all kinds of people."),
    t("BACC งานบางกอกดีไซน์วีก ถนนเจริญนคร", "BACC, Bangkok Design Week, Charoen Nakhon Road"),
    t("งานศิลปะชิ้นไหนในกรุงเทพฯ ที่ยังติดอยู่ในหัวคุณ?", "Which Bangkok artwork is still stuck in your head?")),
  BDSH: A("BDSH", "🍜", t("นักล่าของอร่อย", "The Food Hunter"), t("ร้านลับต้องไปก่อนใคร", "First to the hidden stall."),
    t("คุณชอบตระเวนกินกับแก๊ง ร้านเก่าแก่ เมนูที่อ่านชื่อยังไม่ถูก และนั่งนาน ๆ", "Food crawls with a crew, old family shops, dishes you can't pronounce yet, and long tables."),
    t("เยาวราช ตลาดพลู ลิตเติ้ลอินเดีย", "Yaowarat, Talat Phlu, Little India"),
    t("จานไหนในกรุงเทพฯ ที่คุณยอมรอคิวนานที่สุด?", "Which Bangkok dish would you queue longest for?")),
  BFMN: A("BFMN", "🏸", t("สายทีมเวิร์ก", "The Team Player"), t("มาครบ เล่นครบ", "Shows up, plays every round."),
    t("คุณชอบกิจกรรมประจำกับแก๊งเดิม แบดมินตันทุกสัปดาห์ คลาสเต้น และเชียร์กันเสียงดัง", "Regular games with the same crew: weekly badminton, dance class and loud cheering."),
    t("ลานกีฬาในสวน คลาสเต้น สนามแบด", "Park courts, dance classes, badminton halls"),
    t("กีฬาอะไรที่คุณอยากชวนคนแปลกหน้ามาเล่นด้วย?", "Which sport would you invite a stranger to play?")),
  BFMH: A("BFMH", "🪷", t("ขาประจำงานเทศกาล", "The Festival Regular"), t("ทุกเทศกาลต้องไป", "Never misses a festival."),
    t("ลอยกระทง สงกรานต์ งานวัด คุณไปทุกปี ไปกับแก๊ง และรู้ว่าจุดไหนดีที่สุด", "Loy Krathong, Songkran, temple fairs: you go every year with the gang and know the best spots."),
    t("สนามหลวง งานวัด เทศกาลริมน้ำ", "Sanam Luang, temple fairs, riverside festivals"),
    t("เทศกาลไหนในกรุงเทพฯ ที่คุณไม่เคยพลาด?", "Which Bangkok festival do you never miss?")),
  BFSN: A("BFSN", "🎤", t("เจ้าภาพสายปาร์ตี้", "The Party Host"), t("ที่ประจำ เพื่อนใหม่ทุกครั้ง", "Same spot, new friends every time."),
    t("คุณมีรูฟท็อปและบาร์ดนตรีสดประจำ และชอบชวนคนใหม่มาร่วมโต๊ะ", "You have your rooftop and live-music bar, and you love pulling new people into your table."),
    t("บาร์ดนตรีสด รูฟท็อป คาราโอเกะ", "Live-music bars, rooftops, karaoke"),
    t("เพลงไหนที่คุณร้องทุกครั้งที่ไปคาราโอเกะ?", "What's your go-to karaoke song?")),
  BFSH: A("BFSH", "🏮", t("ขาประจำตลาดกลางคืน", "The Night-Market Regular"), t("โต๊ะใหญ่ ร้านเดิม เรื่องใหม่", "Big table, usual stall, new stories."),
    t("คุณรู้ว่าร้านไหนในตลาดอร่อยที่สุด และชอบนั่งโต๊ะใหญ่กับเพื่อนเยอะ ๆ", "You know the best stall in the market and love a big, noisy table of friends."),
    t("ตลาดนัดรัชดา จตุจักร เยาวราชยามค่ำ", "Ratchada market, Chatuchak, Yaowarat by night"),
    t("ร้านไหนในตลาดที่คุณกล้าการันตี?", "Which market stall would you personally guarantee?")),
  CDMN: A("CDMN", "🚲", t("นักเดินเงียบสายสำรวจ", "The Quiet Wanderer"), t("เมืองนี้ยังมีมุมให้ค้นหา", "There's always another corner."),
    t("คุณชอบสำรวจที่ใหม่แบบเงียบ ๆ กับคนไม่กี่คน ปั่นจักรยาน เดินซอย และแวะคาเฟ่ที่เพิ่งเจอ", "You explore quietly with a few people: bike rides, unknown sois and the café you just found."),
    t("บางกระเจ้า ถนนพระอาทิตย์ ท่าเรือที่ไม่เคยลง", "Bang Krachao, Phra Athit Road, ferry stops you've never tried"),
    t("ซอยไหนที่คุณเจอโดยบังเอิญแล้วหลงรัก?", "Which soi did you stumble on and fall for?")),
  CDMH: A("CDMH", "🛕", t("สายเดินไหว้พระ", "The Temple Walker"), t("เช้า ๆ เงียบ ๆ ในเมืองเก่า", "Quiet mornings in the old town."),
    t("คุณชอบเดินช้า ๆ ผ่านวัด ตึกเก่า และชุมชนริมคลอง ไปกับคนที่ชอบฟังเรื่องเล่า", "Slow walks past temples, old buildings and canal communities, with people who like a story."),
    t("ริมน้ำวัดอรุณ คลองบางหลวง เกาะรัตนโกสินทร์", "Wat Arun riverside, Khlong Bang Luang, Rattanakosin"),
    t("วัดไหนในกรุงเทพฯ ที่สงบที่สุดสำหรับคุณ?", "Which Bangkok temple feels calmest to you?")),
  CDSN: A("CDSN", "☕", t("นักคัดสรรคาเฟ่", "The Café Curator"), t("คาเฟ่ใหม่ เพลงดี ที่นั่งริมหน้าต่าง", "New café, good playlist, window seat."),
    t("คุณตามหาคาเฟ่ ร้านหนังสือ และแกลเลอรีเล็ก ๆ ที่ยังไม่มีใครรู้ และชอบนั่งคุยนาน ๆ", "You find the cafés, bookshops and small galleries nobody knows yet, and stay for long talks."),
    t("อารีย์ เจริญกรุง ร้านหนังสืออิสระ", "Ari, Charoenkrung, indie bookshops"),
    t("คาเฟ่ไหนที่คุณอยากเก็บเป็นความลับ?", "Which café do you wish you could keep secret?")),
  CDSH: A("CDSH", "📜", t("นักสะสมเรื่องเล่า", "The Story Collector"), t("ทุกตึกแถวมีความทรงจำ", "Every shophouse remembers."),
    t("คุณชอบพิพิธภัณฑ์เล็ก ๆ ร้านเก่าแก่ และการนั่งฟังเรื่องเล่าของย่าน", "Small museums, generations-old shops, and sitting down to hear a neighbourhood's stories."),
    t("ถนนทรงวาด ตลาดน้อย พิพิธภัณฑ์เล็ก ๆ", "Song Wat Road, Talat Noi, small museums"),
    t("เรื่องเล่าเกี่ยวกับกรุงเทพฯ ที่คุณชอบเล่าให้คนอื่นฟังคืออะไร?", "What Bangkok story do you love telling people?")),
  CFMN: A("CFMN", "🧘", t("สายขยับสม่ำเสมอ", "The Steady Mover"), t("ทุกสัปดาห์ ที่เดิม เวลาเดิม", "Same place, same time, every week."),
    t("คุณชอบกิจกรรมประจำในกลุ่มเล็ก โยคะ วิ่ง หรือคลาสที่ทำต่อเนื่อง", "Regular small-group routines: yoga, running or a class you keep going back to."),
    t("สวนเบญจกิติ คลาสโยคะ ชมรมวิ่ง", "Benjakitti Park, yoga classes, running clubs"),
    t("กิจวัตรไหนที่ทำให้สัปดาห์ของคุณดีขึ้น?", "Which routine makes your week better?")),
  CFMH: A("CFMH", "🌳", t("ขาประจำสวนสาธารณะ", "The Park Regular"), t("รอบสวนเดิม คนคุ้นหน้า", "The usual lap, familiar faces."),
    t("คุณชอบวิ่ง รำไทเก็ก หรือเดินรอบสวนเดิมทุกเช้า และทักทายคนคุ้นหน้า", "Morning laps, tai chi or a walk around your park, greeting the regulars."),
    t("สวนลุมพินี สนามหลวง ริมน้ำยามเช้า", "Lumphini Park, Sanam Luang, the riverside at dawn"),
    t("สวนไหนที่คุณรู้จักทุกทางเดิน?", "Which park do you know every path of?")),
  CFSN: A("CFSN", "📚", t("สายครีเอทีฟอบอุ่น", "The Cosy Creative"), t("ร้านโปรด หนังสือดี เพื่อนไม่กี่คน", "Favourite spot, good book, a few friends."),
    t("คุณชอบวงอ่านหนังสือ เวิร์กช็อปเล็ก ๆ และคาเฟ่อินดี้ที่ไปประจำ", "Book circles, small workshops and the indie café you always return to."),
    t("วงอ่านหนังสือ เวิร์กช็อปงานฝีมือ คาเฟ่ประจำ", "Book circles, craft workshops, your regular café"),
    t("หนังสือเล่มไหนที่คุณอยากให้ทุกคนอ่าน?", "Which book do you wish everyone would read?")),
  CFSH: A("CFSH", "🍵", t("ผู้รักษาย่าน", "The Neighbourhood Keeper"), t("ย่านของฉัน ร้านของฉัน", "My neighbourhood, my shops."),
    t("คุณรู้จักทุกร้านในย่าน ร้านก๋วยเตี๋ยวประจำ ตลาดเช้า และชอบพาเพื่อนมาลอง", "You know every shop in your area, the usual noodle place, the morning market, and love bringing friends."),
    t("ตลาดเช้าใกล้บ้าน ร้านก๋วยเตี๋ยวประจำ ชุมชนริมคลอง", "Your morning market, your noodle shop, canal-side communities"),
    t("ร้านไหนในย่านคุณที่ทุกคนควรลอง?", "Which shop in your neighbourhood should everyone try?")),
};

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as ArchetypeKey[];

/** Shown before any quiz result exists. */
export const DEFAULT_TYPE: ArchetypeKey = "CFSH";

export function isArchetypeKey(k: string): k is ArchetypeKey {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, k);
}

/**
 * Code from the 4 code axes (ties → first letter), plus a flavour from rhythm
 * and plan when they aren't balanced, e.g. "rhythm+,plan-".
 */
export function typeOf(vector: Record<string, number>): { archetype: ArchetypeKey; modifier: string | null } {
  const code = CODE_AXES.map((a) => ((vector[a.category] ?? 0) >= 0 ? a.plus : a.minus)).join("") as ArchetypeKey;
  const flavour = (["rhythm", "plan"] as Category[])
    .filter((c) => strengthOf(vector[c] ?? 0) !== "balanced")
    .map((c) => `${c}${(vector[c] ?? 0) >= 0 ? "+" : "-"}`);
  return { archetype: code, modifier: flavour.length ? flavour.join(",") : null };
}

/** The flavour badges for a modifier string, e.g. ["🌙 Night owl", "🗓️ Planner"]. */
export function flavourBadges(modifier: string | null): { icon: string; name: Text }[] {
  if (!modifier) return [];
  return modifier
    .split(",")
    .map((k) => LEGEND.find((l) => l.key === k))
    .filter((l): l is (typeof LEGEND)[number] => !!l)
    .map((l) => ({ icon: l.icon, name: l.name }));
}

/** "The Food Hunter 🌙🗓️" — the name plus flavour icons. */
export function displayName(archetype: ArchetypeKey, modifier: string | null): Text {
  const a = ARCHETYPES[archetype];
  const icons = flavourBadges(modifier).map((b) => b.icon).join("");
  return icons ? { th: `${a.name.th} ${icons}`, en: `${a.name.en} ${icons}` } : a.name;
}

/** Each letter of a code with its legend entry. */
export function codeLetters(archetype: ArchetypeKey): (typeof LEGEND)[number][] {
  return archetype.split("").map((ch) => LEGEND.find((l) => l.key === ch)!);
}

function lettersDiffer(a: ArchetypeKey, b: ArchetypeKey): number {
  let n = 0;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) n++;
  return n;
}

export type MatchLabel = "natural" | "complementary" | "interesting" | null;

/** Natural: same code. Complementary: one letter apart. Interesting: every letter opposite. */
export function matchLabel(a: ArchetypeKey, b: ArchetypeKey): MatchLabel {
  const d = lettersDiffer(a, b);
  if (d === 0) return "natural";
  if (d === 1) return "complementary";
  if (d === 4) return "interesting";
  return null;
}

export const MATCH_LABELS: Record<Exclude<MatchLabel, null>, { emoji: string; name: Text; copy: Text }> = {
  natural: { emoji: "💚", name: t("เข้ากันเป็นธรรมชาติ", "Natural match"), copy: t("มองกรุงเทพฯ คล้ายกัน คุยกันง่าย", "You see Bangkok the same way, easy to click.") },
  complementary: { emoji: "🧩", name: t("เติมเต็มกัน", "Complementary match"), copy: t("ต่างกันแค่ข้อเดียว ลงตัวพอดี", "One letter apart: different in a way that fits.") },
  interesting: { emoji: "✨", name: t("คู่ที่น่าสนใจ", "Interesting match"), copy: t("คนละขั้วทุกข้อ เรื่องคุยไม่มีวันหมด", "Opposite on every letter: you'll never run out of things to say.") },
};

function flip(code: ArchetypeKey, index: number): ArchetypeKey {
  const axis = CODE_AXES[index];
  const ch = code[index] === axis.plus ? axis.minus : axis.plus;
  return (code.slice(0, index) + ch + code.slice(index + 1)) as ArchetypeKey;
}

/** Types to show on a result card: yourself, one letter apart, and your opposite. */
export function suggestedMatches(a: ArchetypeKey): { natural: ArchetypeKey; complementary: ArchetypeKey | null; interesting: ArchetypeKey | null } {
  // Flip the activity letter (Move/Savour): the most noticeable difference at a table.
  const complementary = flip(a, 2);
  const interesting = [0, 1, 2, 3].reduce<ArchetypeKey>((c, i) => flip(c, i), a);
  return { natural: a, complementary, interesting };
}

/** Every category exists in the vector even if unanswered, for meters. */
export function fullVector(v: Record<string, number>): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, v[c] ?? 0])) as Record<Category, number>;
}

/**
 * Results saved by the earlier 13-type version used keys like "plan+". Their
 * vector is still valid, so recompute the type from it instead of hiding them.
 */
export function normalizeType(row: { archetype: string; modifier: string | null; vector: Record<string, number> }): { archetype: ArchetypeKey; modifier: string | null } {
  if (isArchetypeKey(row.archetype)) return { archetype: row.archetype, modifier: row.modifier };
  return typeOf(row.vector);
}
