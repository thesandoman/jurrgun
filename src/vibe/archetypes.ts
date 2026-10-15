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
import { codePoles, TYPE_CODES, type TypeCode } from "./scenarios";

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
  { key: "M", icon: "🚲", name: t("ขยับตัว (Move)", "Move"), meaning: t("สนิทกันตอนได้ลงมือทำอะไรด้วยกัน", "Bonding while doing things") },
  { key: "S", icon: "🍜", name: t("ละเมียด (Savour)", "Savour"), meaning: t("นั่งนาน กินช้า คุยยาว", "Long meals, slow talk") },
  { key: "N", icon: "🎨", name: t("ซีนใหม่ (New-scene)", "New-scene"), meaning: t("แกลเลอรี ดีไซน์ ดนตรีอินดี้", "Galleries, design, indie music") },
  { key: "H", icon: "🛕", name: t("เมืองเก่า (Heritage)", "Heritage"), meaning: t("วัด ตึกเก่า ตลาดดั้งเดิม", "Temples, shophouses, old markets") },
  { key: "rhythm+", icon: "🌙", name: t("นกฮูกกลางคืน", "Night owl"), meaning: t("ยิ่งดึกยิ่งมีพลัง", "Comes alive after dark") },
  { key: "rhythm-", icon: "🌅", name: t("คนตื่นเช้า", "Early riser"), meaning: t("เช้าคือเวลาที่ดีที่สุด", "Mornings are best") },
  { key: "plan+", icon: "🎲", name: t("ไปตามใจ", "Spontaneous"), meaning: t("ไม่มีแพลนคือแพลน", "No plan is the plan") },
  { key: "plan-", icon: "🗓️", name: t("นักวางแผน", "Planner"), meaning: t("แพลนดี วันก็ดี", "A good plan makes a good day") },
];

export type ArchetypeKey = TypeCode;
const ARCHETYPE_CODES = TYPE_CODES;

/** A real Bangkok place where this type is most likely to be found, and why. */
export type Spot = { emoji: string; name: Text; area: Text; why: Text };

export type Archetype = {
  key: ArchetypeKey;
  emoji: string;
  name: Text;
  tagline: Text;
  description: Text;
  /** Places/activities to try, VisitBangkok flavoured (one line). */
  bangkok: Text;
  starter: Text;
  /** What this type is really after: the core motivation, Enneagram style. */
  drive: Text;
  /** What wears this type out. */
  drain: Text;
  /** Three places this type is most likely to be, with the reason. */
  spots: Spot[];
  /** When in the week this type is at its best. */
  bestTime: Text;
  /** The types this one clicks with most, and why. */
  clicks: { key: ArchetypeKey; why: Text }[];
  /** Modern hangouts and specific areas: malls, clubs, stadiums, food halls. */
  hangouts: Hangout[];
};

/** A specific venue or area, with its DISTRICTS key. */
export type Hangout = { emoji: string; district: string; name: Text; why: Text };

type Profile = Pick<Archetype, "drive" | "drain" | "spots" | "bestTime">;
type Social = Pick<Archetype, "clicks" | "hangouts">;

const spot = (emoji: string, name: Text, area: Text, why: Text): Spot => ({ emoji, name, area, why });

const A = (key: ArchetypeKey, emoji: string, name: Text, tagline: Text, description: Text, bangkok: Text, starter: Text): Omit<Archetype, keyof Profile | keyof Social> => ({
  key, emoji, name, tagline, description, bangkok, starter,
});

const BASE: Record<ArchetypeKey, Omit<Archetype, keyof Profile | keyof Social>> = {
  BDMN: A("BDMN", "🛵", t("นักลุยสายสตรีท", "The Street Explorer"), t("ออกจากบ้าน ไปหาสิ่งใหม่", "Out the door, into the new."),
    t("คุณชอบคนเยอะ ของใหม่ และได้ขยับตัว ป๊อปอัป สตรีทอาร์ต และทริปปั่นจักรยานคือสนามของคุณ", "Crowds, new things and moving around: pop-ups, street art and bike tours are your playground."),
    t("เจริญกรุงและตลาดน้อย ทัวร์ปั่นสตรีทอาร์ต ป๊อปอัปมาร์เก็ต", "Charoenkrung and Talat Noi, street-art bike tours, pop-up markets"),
    t("ป๊อปอัปไหนล่าสุดที่คุณบอกต่อเพื่อน?", "Which pop-up did you last tell everyone about?")),
  BDMH: A("BDMH", "🧭", t("นักผจญภัยเมืองเก่า", "The Old-Town Adventurer"), t("ทุกตรอกมีเรื่องเล่า", "Every alley has a story."),
    t("คุณชอบพาแก๊งเดินลุยย่านเก่าที่ยังไม่มีใครเคยไป ทั้งวัดเล็ก ๆ ตลาดลับ และชุมชนริมคลอง", "You lead the group through old quarters nobody's tried: small temples, hidden markets, canal communities."),
    t("เกาะรัตนโกสินทร์ ถนนทรงวาด คลองฝั่งธนฯ", "Rattanakosin Island, Song Wat Road, Thonburi canals"),
    t("ย่านเก่าไหนที่คุณอยากพาเพื่อนใหม่ไปเดิน?", "Which old neighbourhood would you take a stranger to?")),
  BDSN: A("BDSN", "🥂", t("นักล่าซีนครีเอทีฟ", "The Scene Seeker"), t("เปิดตัวที่ไหน ไปที่นั่น", "If it's opening, you're there."),
    t("คุณชอบงานเปิดแกลเลอรี คาเฟ่ใหม่ และวงคุยยาว ๆ กับคนหลากหลาย", "Gallery openings, new cafés and long conversations with all kinds of people."),
    t("BACC งานบางกอกดีไซน์วีก ถนนเจริญนคร", "BACC, Bangkok Design Week, Charoen Nakhon Road"),
    t("งานศิลปะชิ้นไหนในกรุงเทพฯ ที่ยังติดอยู่ในหัวคุณ?", "Which Bangkok artwork is still stuck in your head?")),
  BDSH: A("BDSH", "🍜", t("นักล่าของอร่อย", "The Food Hunter"), t("ร้านลับต้องไปก่อนใคร", "First to the hidden stall."),
    t("คุณชอบตระเวนกินกับแก๊ง ร้านเก่าแก่ของครอบครัว เมนูที่อ่านชื่อยังไม่ถูก และโต๊ะยาวที่นั่งกันนาน ๆ", "Food crawls with a crew, old family shops, dishes you can't pronounce yet, and long tables."),
    t("เยาวราช ตลาดพลู ลิตเติ้ลอินเดีย", "Yaowarat, Talat Phlu, Little India"),
    t("จานไหนในกรุงเทพฯ ที่คุณยอมรอคิวนานที่สุด?", "Which Bangkok dish would you queue longest for?")),
  BFMN: A("BFMN", "🏸", t("สายทีมเวิร์ก", "The Team Player"), t("มาทุกนัด เล่นทุกเกม", "Shows up, plays every round."),
    t("คุณมีก๊วนประจำ รันคลับ ยิมปีนผา หรือคลาสเต้น เจอหน้าเดิมทุกสัปดาห์ และชอบลองสตูดิโอใหม่ ๆ ไปด้วยกัน", "You have a crew: run club, climbing gym or dance class, the same faces every week, trying the newest studios together."),
    t("รันคลับสวนเบญจกิติ ยิมปีนผา สตูดิโอเต้นย่านเอกมัย", "Benjakitti run clubs, climbing gyms, Ekkamai dance studios"),
    t("กีฬาอะไรที่คุณอยากชวนเพื่อนใหม่มาเล่นด้วย?", "Which sport would you invite a stranger to play?")),
  BFMH: A("BFMH", "🪷", t("ขาประจำงานเทศกาล", "The Festival Regular"), t("ทุกเทศกาลต้องไป", "Never misses a festival."),
    t("ลอยกระทง สงกรานต์ งานวัด คุณไปกับแก๊งทุกปี และรู้ว่าจุดไหนดีที่สุด", "Loy Krathong, Songkran, temple fairs: you go every year with the gang and know the best spots."),
    t("สนามหลวง งานวัด เทศกาลริมน้ำ", "Sanam Luang, temple fairs, riverside festivals"),
    t("เทศกาลไหนในกรุงเทพฯ ที่คุณไม่เคยพลาด?", "Which Bangkok festival do you never miss?")),
  BFSN: A("BFSN", "🎤", t("เจ้าภาพสายปาร์ตี้", "The Party Host"), t("ร้านเดิม เพื่อนใหม่ทุกครั้ง", "Same spot, new friends every time."),
    t("คุณมีรูฟท็อปและบาร์ดนตรีสดประจำ และชอบชวนคนใหม่มาร่วมโต๊ะ", "You have your rooftop and live-music bar, and you love pulling new people into your table."),
    t("บาร์ดนตรีสด รูฟท็อป คาราโอเกะ", "Live-music bars, rooftops, karaoke"),
    t("เพลงไหนที่คุณร้องทุกครั้งที่ไปคาราโอเกะ?", "What's your go-to karaoke song?")),
  BFSH: A("BFSH", "🏮", t("ขาประจำตลาดกลางคืน", "The Night-Market Regular"), t("โต๊ะใหญ่ ร้านเดิม เรื่องใหม่", "Big table, usual stall, new stories."),
    t("คุณรู้ว่าร้านไหนในตลาดอร่อยที่สุด และชอบนั่งโต๊ะใหญ่กับเพื่อนเยอะ ๆ", "You know the best stall in the market and love a big, noisy table of friends."),
    t("ซอยก๋วยเตี๋ยวเรืออนุสาวรีย์ชัยฯ ตลาดวังหลัง จตุจักร", "Victory Monument boat noodles, Wang Lang market, Chatuchak"),
    t("ร้านไหนในตลาดที่คุณกล้าการันตี?", "Which market stall would you personally guarantee?")),
  CDMN: A("CDMN", "🚲", t("นักเดินเงียบสายสำรวจ", "The Quiet Wanderer"), t("เมืองนี้ยังมีมุมให้ค้นหา", "There's always another corner."),
    t("คุณชอบสำรวจที่ใหม่แบบเงียบ ๆ กับคนไม่กี่คน ปั่นจักรยาน เดินซอย และแวะคาเฟ่ที่เพิ่งเจอ", "You explore quietly with a few people: bike rides, unknown sois and the café you just found."),
    t("บางกระเจ้า คลองโอ่งอ่าง สวนลอยฟ้าเจ้าพระยา", "Bang Krachao, Khlong Ong Ang, Chao Phraya Sky Park"),
    t("ซอยไหนที่คุณเจอโดยบังเอิญแล้วหลงรัก?", "Which soi did you stumble on and fall for?")),
  CDMH: A("CDMH", "🛕", t("สายเดินชมวัด", "The Temple Walker"), t("เช้า ๆ เงียบ ๆ ในเมืองเก่า", "Quiet mornings in the old town."),
    t("คุณชอบเดินช้า ๆ ผ่านวัด ตึกเก่า และชุมชนริมคลอง ไปกับคนที่ชอบฟังเรื่องเล่า", "Slow walks past temples, old buildings and canal communities, with people who like a story."),
    t("โลหะปราสาท ชุมชนกุฎีจีน คลองบางหลวง", "Loha Prasat, Kudi Chin, Khlong Bang Luang"),
    t("วัดไหนในกรุงเทพฯ ที่สงบที่สุดสำหรับคุณ?", "Which Bangkok temple feels calmest to you?")),
  CDSN: A("CDSN", "☕", t("นักคัดสรรคาเฟ่", "The Café Curator"), t("คาเฟ่ใหม่ เพลงดี ที่นั่งริมหน้าต่าง", "New café, good playlist, window seat."),
    t("คุณตามหาคาเฟ่ ร้านหนังสือ และแกลเลอรีเล็ก ๆ ที่ยังไม่มีใครรู้ และชอบนั่งคุยนาน ๆ", "You find the cafés, bookshops and small galleries nobody knows yet, and stay for long talks."),
    t("อารีย์ คาเฟ่ริมน้ำตลาดน้อย ร้านหนังสืออิสระ", "Ari, Talat Noi riverside cafés, indie bookshops"),
    t("คาเฟ่ไหนที่คุณอยากเก็บเป็นความลับ?", "Which café do you wish you could keep secret?")),
  CDSH: A("CDSH", "📜", t("นักสะสมเรื่องเล่า", "The Story Collector"), t("ทุกตึกแถวมีความทรงจำ", "Every shophouse remembers."),
    t("คุณชอบพิพิธภัณฑ์เล็ก ๆ ร้านเก่าแก่ และการนั่งฟังเรื่องเล่าของย่าน", "Small museums, generations-old shops, and sitting down to hear a neighbourhood's stories."),
    t("พิพิธภัณฑ์ชาวบางกอก มิวเซียมสยาม แพร่งภูธร", "Bangkokian Museum, Museum Siam, Phraeng Phuthon"),
    t("เรื่องเล่าเกี่ยวกับกรุงเทพฯ ที่คุณชอบเล่าให้คนอื่นฟังคืออะไร?", "What Bangkok story do you love telling people?")),
  CFMN: A("CFMN", "🧘", t("สายขยับสม่ำเสมอ", "The Steady Mover"), t("ทุกสัปดาห์ ที่เดิม เวลาเดิม", "Same place, same time, every week."),
    t("คุณชอบกิจวัตรกับกลุ่มเล็ก ๆ ทั้งโยคะ พิลาทิส หรือวิ่งในสวนสาธารณะยุคใหม่ ที่เดิม เวลาเดิม", "Small-group routines in the city's newer green spaces: yoga, pilates or a run, same place, same time."),
    t("อุทยาน 100 ปี จุฬาฯ สวนรถไฟ สตูดิโอโยคะประจำ", "Chula Centenary Park, Rot Fai Park, your yoga studio"),
    t("กิจวัตรไหนที่ทำให้สัปดาห์ของคุณดีขึ้น?", "Which routine makes your week better?")),
  CFMH: A("CFMH", "🌳", t("ขาประจำสวนสาธารณะ", "The Park Regular"), t("รอบสวนเดิม คนคุ้นหน้า", "The usual lap, familiar faces."),
    t("คุณชอบวิ่ง รำไทเก๊ก หรือเดินรอบสวนเดิมทุกเช้า และทักทายคนคุ้นหน้า", "Morning laps, tai chi or a walk around your park, greeting the regulars."),
    t("สวนลุมพินี สนามหลวง ริมน้ำยามเช้า", "Lumphini Park, Sanam Luang, the riverside at dawn"),
    t("สวนไหนที่คุณรู้จักทุกทางเดิน?", "Which park do you know every path of?")),
  CFSN: A("CFSN", "📚", t("สายครีเอทีฟอบอุ่น", "The Cosy Creative"), t("ร้านโปรด หนังสือดี เพื่อนไม่กี่คน", "Favourite spot, good book, a few friends."),
    t("คุณชอบวงอ่านหนังสือ เวิร์กช็อปเล็ก ๆ และคาเฟ่อินดี้ที่ไปประจำ", "Book circles, small workshops and the indie café you always return to."),
    t("วงอ่านหนังสือ เวิร์กช็อปงานฝีมือ คาเฟ่ประจำ", "Book circles, craft workshops, your regular café"),
    t("หนังสือเล่มไหนที่คุณอยากให้ทุกคนอ่าน?", "Which book do you wish everyone would read?")),
  CFSH: A("CFSH", "🍵", t("เจ้าถิ่นประจำย่าน", "The Neighbourhood Keeper"), t("ย่านของฉัน ร้านของฉัน", "My neighbourhood, my shops."),
    t("คุณรู้จักทุกร้านในย่าน ร้านก๋วยเตี๋ยวประจำ ตลาดเช้า และชอบพาเพื่อนมาลอง", "You know every shop in your area, the usual noodle place, the morning market, and love bringing friends."),
    t("ตลาดเช้าใกล้บ้าน ร้านก๋วยเตี๋ยวประจำ ชุมชนริมคลอง", "Your morning market, your noodle shop, canal-side communities"),
    t("ร้านไหนในย่านคุณที่ทุกคนควรลอง?", "Which shop in your neighbourhood should everyone try?")),
};

const P = (drive: Text, drain: Text, bestTime: Text, spots: Spot[]): Profile => ({ drive, drain, bestTime, spots });

const PROFILES: Record<ArchetypeKey, Profile> = {
  BDMN: P(
    t("เป็นคนแรกที่ได้เจอของใหม่ และพาเพื่อนไปด้วย", "To be first to the new thing, with friends in tow."),
    t("วันที่ไม่มีอะไรใหม่ และที่ที่ทุกคนเคยไปแล้ว", "Days with nothing new, and places everyone has already been."),
    t("บ่ายวันเสาร์ถึงค่ำ", "Saturday afternoon into the evening"),
    [
      spot("🎨", t("สตรีทอาร์ตตลาดน้อย", "Talat Noi street art"), t("สัมพันธวงศ์", "Samphanthawong"), t("ภาพใหม่โผล่ทุกเดือน ปั่นจักรยานตามล่ากับแก๊งได้ทั้งบ่าย", "New murals appear every month; a bike and a crew make it an afternoon.")),
      spot("✈️", t("ช่างชุ่ย", "Chang Chui"), t("บางพลัด", "Bang Phlat"), t("ตลาดสร้างสรรค์ที่มีป๊อปอัปและงานดีไซน์ใหม่ตลอด", "A creative market where pop-ups and new design keep rotating.")),
      spot("💡", t("เส้นทางบางกอกดีไซน์วีก", "Bangkok Design Week trail"), t("เจริญกรุง ช่วงกุมภาพันธ์", "Charoenkrung, every February"), t("เดินทั้งย่าน ดูงานจัดแสดงใหม่ เจอคนเยอะ", "A whole district of new installations, walked with a crowd.")),
    ],
  ),
  BDMH: P(
    t("ค้นพบเรื่องเล่าของเมืองเก่า แล้วพาคนอื่นไปเห็นด้วย", "To uncover the old city's stories and lead others to them."),
    t("ทัวร์ที่เดินตามธงไปจุดเดิม ๆ", "Tours that follow a flag to the same old stops."),
    t("เช้าวันอาทิตย์ หรือค่ำที่อากาศเย็น", "Sunday mornings, or a cool evening"),
    [
      spot("🛶", t("คลองบางกอกน้อย", "Khlong Bangkok Noi"), t("ฝั่งธนฯ", "Thonburi"), t("นั่งเรือหางยาวเป็นกลุ่ม ผ่านบ้านริมน้ำและวัดที่คนไม่ค่อยรู้จัก", "A long-tail boat with the group, past stilt houses and lesser-known temples.")),
      spot("🏮", t("ถนนทรงวาด", "Song Wat Road"), t("สัมพันธวงศ์", "Samphanthawong"), t("โกดังเก่า ร้านเครื่องเทศ และซอยลับให้พาแก๊งเดินสำรวจ", "Old warehouses, spice shops and side lanes to lead a group through.")),
      spot("⛪", t("ชุมชนกุฎีจีน", "Kudi Chin"), t("ธนบุรี", "Thon Buri"), t("โบสถ์ ศาลเจ้า และขนมฝรั่งสูตรโปรตุเกสในชุมชนเดียว", "A church, a shrine and Portuguese-style cakes in one small community.")),
    ],
  ),
  BDSN: P(
    t("ได้อยู่ตรงที่ที่มีอะไรใหม่ ๆ กำลังเกิดขึ้น กับคนที่น่าสนใจ", "To be where something new is happening, among interesting people."),
    t("คืนที่ต้องอยู่บ้าน แล้วเห็นทุกคนโพสต์จากงานเปิด", "Staying in while everyone posts from the opening."),
    t("ค่ำวันพฤหัสและวันศุกร์", "Thursday and Friday evenings"),
    [
      spot("🖼️", t("หอศิลป์กรุงเทพฯ (BACC)", "BACC"), t("ปทุมวัน", "Pathum Wan"), t("งานเปิดนิทรรศการที่คนในวงการศิลปะมารวมตัวกัน", "Exhibition openings where the art crowd gathers.")),
      spot("🏭", t("Warehouse 30", "Warehouse 30"), t("บางรัก", "Bang Rak"), t("โกดังเก่าที่กลายเป็นแกลเลอรี ร้านค้า และกิจกรรมใหม่ ๆ", "Old warehouses turned galleries, shops and new events.")),
      spot("📚", t("The Jam Factory", "The Jam Factory"), t("คลองสาน", "Khlong San"), t("ร้านหนังสือ แกลเลอรี และร้านอาหารริมน้ำในที่เดียว", "Bookshop, gallery and riverside dinner in one courtyard.")),
    ],
  ),
  BDSH: P(
    t("ได้ชิมสูตรเก่าของแท้ที่ยังไม่มีใครเจอ แล้วแบ่งกันกินทั้งโต๊ะใหญ่", "To taste the real, old recipe nobody has found yet, shared across a big table."),
    t("ร้านเชนที่รสชาติเหมือนกันทุกสาขา", "Chain restaurants that taste the same everywhere."),
    t("เย็นวันศุกร์ถึงดึก", "Friday evening until late"),
    [
      spot("🥟", t("เยาวราช", "Yaowarat"), t("สัมพันธวงศ์", "Samphanthawong"), t("ร้านเก่าแก่หลายสิบปีกับเมนูที่ยังไม่เคยลองซ่อนอยู่ทุกซอย", "Decades-old family shops and dishes you haven't tried in every lane.")),
      spot("🍛", t("ตลาดพลู", "Talat Phlu"), t("ธนบุรี", "Thon Buri"), t("ย่านของกินเก่าฝั่งธนฯ ที่ตระเวนกินกับแก๊งได้ทั้งเย็น", "An old Thonburi food quarter made for a group crawl.")),
      spot("🍮", t("ตลาดนางเลิ้ง", "Nang Loeng Market"), t("ป้อมปราบศัตรูพ่าย", "Pom Prap"), t("ตลาดร้อยปีกับขนมไทยสูตรโบราณ", "A century-old market full of old-recipe Thai sweets.")),
    ],
  ),
  BFMN: P(
    t("มีก๊วนที่ได้ขยับตัวด้วยกันทุกสัปดาห์", "A crew to move with, every single week."),
    t("กิจกรรมที่ต้องทำคนเดียว และนัดที่ถูกยกเลิก", "Solo workouts and cancelled sessions."),
    t("เย็นวันธรรมดาและเช้าวันเสาร์", "Weekday evenings and Saturday mornings"),
    [
      spot("🏃", t("สวนป่าเบญจกิติ", "Benjakitti Forest Park"), t("คลองเตย", "Khlong Toei"), t("รันคลับนัดวิ่งบนสกายวอล์กทุกสัปดาห์", "Run clubs meet on the skywalk every week.")),
      spot("🧗", t("ยิมปีนผาในเมือง", "City climbing gyms"), t("สุขุมวิทและสาทร", "Sukhumvit and Sathon"), t("ก๊วนเดิม เส้นทางปีนใหม่ทุกเดือน", "The same crew, new routes every month.")),
      spot("💃", t("สตูดิโอเต้นย่านเอกมัย", "Ekkamai dance studios"), t("วัฒนา", "Watthana"), t("คลาสประจำที่ทุกคนรู้จักชื่อกัน", "A weekly class where everyone knows your name.")),
    ],
  ),
  BFMH: P(
    t("ได้อยู่ในช่วงเวลาที่ทั้งเมืองฉลองด้วยกัน", "To be part of the moments the whole city celebrates together."),
    t("ปีที่พลาดเทศกาลเพราะติดธุระ", "A year when something kept you from the festival."),
    t("ช่วงเทศกาล ตั้งแต่สงกรานต์ถึงลอยกระทง", "Festival season, Songkran through Loy Krathong"),
    [
      spot("💦", t("สนามหลวง", "Sanam Luang"), t("พระนคร", "Phra Nakhon"), t("ใจกลางงานสงกรานต์และงานใหญ่ของเมือง", "The heart of Songkran and the city's big celebrations.")),
      spot("🎡", t("งานภูเขาทอง วัดสระเกศ", "Golden Mount Fair"), t("ป้อมปราบศัตรูพ่าย ช่วงพฤศจิกายน", "Pom Prap, every November"), t("งานวัดใหญ่ประจำปี มีชิงช้าสวรรค์ เกม และของกิน", "The big yearly temple fair: ferris wheel, games and snacks.")),
      spot("🪷", t("สวนสันติชัยปราการ", "Santichaiprakarn Park"), t("พระนคร", "Phra Nakhon"), t("ลอยกระทงริมเจ้าพระยากับแก๊งทุกปี", "Loy Krathong on the Chao Phraya with the gang, every year.")),
    ],
  ),
  BFSN: P(
    t("เป็นศูนย์กลางของโต๊ะที่ทุกคนอยากนั่ง", "To be the centre of the table everyone wants to join."),
    t("คืนที่เงียบเกินไป และวันที่ร้านประจำปิด", "Quiet nights and your usual place being closed."),
    t("ศุกร์และเสาร์หลัง 2 ทุ่ม", "Friday and Saturday after 8 pm"),
    [
      spot("🎷", t("แซกโซโฟนผับ", "Saxophone Pub"), t("ราชเทวี", "Ratchathewi"), t("บาร์ดนตรีสดที่เหมือนบ้านหลังที่สอง", "Live music that feels like a second living room.")),
      spot("🌇", t("รูฟท็อปย่านสีลมและสาทร", "Silom and Sathon rooftops"), t("บางรัก", "Bang Rak"), t("โต๊ะประจำ วิวเมือง และเพื่อนใหม่ทุกครั้ง", "Your usual table, the skyline, and new friends every time.")),
      spot("🎤", t("บาร์ย่านทองหล่อ เอกมัย", "Thonglor and Ekkamai bars"), t("วัฒนา", "Watthana"), t("ร้านที่บาร์เทนเดอร์จำชื่อคุณได้", "Where the bartender already knows your name.")),
    ],
  ),
  BFSH: P(
    t("โต๊ะใหญ่ เพื่อนเยอะ และร้านที่ไว้ใจได้", "A big table, lots of friends, and a stall you can trust."),
    t("ร้านโปรดย้ายหรือเลิกขาย", "Your favourite stall moving away or closing."),
    t("ค่ำวันธรรมดาและเสาร์อาทิตย์", "Weeknight dinners and weekends"),
    [
      spot("🍜", t("ซอยก๋วยเตี๋ยวเรือ อนุสาวรีย์ชัยฯ", "Victory Monument boat noodles"), t("ราชเทวี", "Ratchathewi"), t("สั่งทีละสิบชาม แข่งกินกับเพื่อน", "Ordering ten bowls at a time and racing your friends.")),
      spot("🏮", t("ตลาดวังหลัง", "Wang Lang Market"), t("บางกอกน้อย", "Bangkok Noi"), t("ตลาดริมน้ำที่มีร้านประจำมาหลายสิบปี", "A riverside market of stalls that have been there for decades.")),
      spot("🛍️", t("ตลาดนัดจตุจักร", "Chatuchak Weekend Market"), t("จตุจักร", "Chatuchak"), t("เดินกับแก๊ง แล้วไปจบที่ร้านเดิมทุกครั้ง", "Wander with the gang, always ending at the same stall.")),
    ],
  ),
  CDMN: P(
    t("ค้นหามุมใหม่ของเมืองด้วยตัวเอง ในจังหวะของตัวเอง", "To find new corners of the city at your own pace."),
    t("ที่ที่คนแน่น และแพลนที่คนอื่นเป็นคนวาง", "Packed places and plans set by someone else."),
    t("เช้าตรู่หรือช่วงแสงทอง", "Early mornings or golden hour"),
    [
      spot("🚲", t("บางกระเจ้า", "Bang Krachao"), t("สมุทรปราการ ข้ามแม่น้ำจากคลองเตย", "Across the river from Khlong Toei"), t("ปั่นบนทางยกระดับในป่าเขียว ไม่ต้องมีใครนำ", "Raised bike paths through green, no guide needed.")),
      spot("🎨", t("คลองโอ่งอ่าง", "Khlong Ong Ang"), t("พระนคร", "Phra Nakhon"), t("ทางเดินริมคลองที่ฟื้นใหม่ มีสตรีทอาร์ตตลอดทาง", "A revived canal walk lined with new street art.")),
      spot("🌉", t("สวนลอยฟ้าเจ้าพระยา", "Chao Phraya Sky Park"), t("พระนครและคลองสาน", "Phra Nakhon and Khlong San"), t("สวนลอยฟ้าข้ามแม่น้ำ เดินเงียบ ๆ ชมเมือง", "A garden bridge over the river, made for a quiet walk.")),
    ],
  ),
  CDMH: P(
    t("หาความสงบและเรื่องเล่าในมุมที่คนอื่นเดินผ่าน", "To find calm, and stories, in corners other people pass by."),
    t("ที่เที่ยวที่คนแน่นจนคิดอะไรไม่ออก", "Tourist spots so crowded you can't hear yourself think."),
    t("เช้าก่อน 8 โมง", "Mornings before 8 am"),
    [
      spot("✨", t("โลหะปราสาท วัดราชนัดดาฯ", "Loha Prasat"), t("พระนคร", "Phra Nakhon"), t("ปราสาทยอดเหล็ก 37 ยอดที่เงียบกว่าที่คิด", "Thirty-seven metal spires, quieter than you'd expect.")),
      spot("⛪", t("ชุมชนกุฎีจีน", "Kudi Chin"), t("ธนบุรี", "Thon Buri"), t("ซอยเล็ก ๆ ริมน้ำที่ผสมหลายวัฒนธรรม", "Small riverside lanes where several cultures meet.")),
      spot("🎭", t("คลองบางหลวง", "Khlong Bang Luang"), t("ฝั่งธนฯ", "Thonburi side"), t("บ้านศิลปินริมคลองและการแสดงหุ่นละครเล็ก", "The canal-side Artist House and its puppet shows.")),
    ],
  ),
  CDSN: P(
    t("เจอที่ที่ใช่ก่อนใคร แล้วนั่งอยู่นาน ๆ", "To find the right place before anyone else, and stay a while."),
    t("คาเฟ่ที่แน่นจนต้องรีบลุก", "Cafés so busy you have to give up your seat."),
    t("บ่ายวันธรรมดา", "Weekday afternoons"),
    [
      spot("☕", t("อารีย์", "Ari"), t("พญาไท", "Phaya Thai"), t("มีคาเฟ่ใหม่ซ่อนอยู่ในซอยเล็ก ๆ ทุกเดือน", "A new café tucked into a side soi every month.")),
      spot("🌊", t("คาเฟ่ริมน้ำตลาดน้อย", "Talat Noi riverside cafés"), t("สัมพันธวงศ์", "Samphanthawong"), t("ตึกเก่ากลายเป็นคาเฟ่ เงียบ ๆ ริมเจ้าพระยา", "Old buildings turned quiet cafés on the Chao Phraya.")),
      spot("📚", t("ร้านหนังสืออิสระ", "Indie bookshops"), t("ทั่วเมือง เช่น Candide Books", "Around town, such as Candide Books"), t("หนังสือที่ร้านใหญ่ไม่มี และที่นั่งอ่านเงียบ ๆ", "Books the big shops don't stock, and a quiet seat.")),
    ],
  ),
  CDSH: P(
    t("ได้รู้ว่าแต่ละที่เป็นแบบนี้มาได้ยังไง", "To understand how a place came to be the way it is."),
    t("การรีบดูให้ครบทุกจุดโดยไม่ได้ฟังเรื่องราว", "Rushing through everything without hearing the story."),
    t("บ่ายวันอาทิตย์", "Sunday afternoons"),
    [
      spot("🏡", t("พิพิธภัณฑ์ชาวบางกอก", "Bangkokian Museum"), t("บางรัก", "Bang Rak"), t("บ้านไม้เก่าที่เล่าชีวิตคนกรุงเทพฯ ยุคก่อน", "Old wooden houses telling how Bangkokians once lived.")),
      spot("🏛️", t("มิวเซียมสยาม", "Museum Siam"), t("พระนคร", "Phra Nakhon"), t("พิพิธภัณฑ์ที่ชวนคิดว่าความเป็นไทยมาจากไหน", "A museum that asks where Thai-ness comes from.")),
      spot("🏘️", t("แพร่งภูธร", "Phraeng Phuthon"), t("พระนคร", "Phra Nakhon"), t("ย่านตึกแถวเก่ากับร้านที่เปิดมาหลายรุ่น", "Old shophouse squares and shops run for generations.")),
    ],
  ),
  CFMN: P(
    t("กิจวัตรสม่ำเสมอที่ทำให้กายและใจนิ่ง", "The steady routine that keeps body and mind settled."),
    t("ตารางที่ถูกเปลี่ยนกะทันหัน", "Schedules that change at the last minute."),
    t("เช้าตรู่ก่อนทำงาน", "Early mornings before work"),
    [
      spot("🌿", t("อุทยาน 100 ปี จุฬาฯ", "Chula Centenary Park"), t("ปทุมวัน", "Pathum Wan"), t("สวนดีไซน์ใหม่ที่วิ่งรอบเดิมได้ทุกวัน", "A newly designed park for the same loop every day.")),
      spot("🚲", t("สวนรถไฟ", "Rot Fai Park"), t("จตุจักร", "Chatuchak"), t("เส้นทางปั่นรอบสวนที่ร่มรื่น ปั่นซ้ำได้ทุกสัปดาห์", "A shady cycling loop to repeat every week.")),
      spot("🧘", t("สตูดิโอโยคะประจำ", "Your yoga studio"), t("ใกล้บ้านหรือที่ทำงาน", "Near home or work"), t("ครูคนเดิม ที่วางเสื่อจุดเดิม", "The same teacher, the same spot for your mat.")),
    ],
  ),
  CFMH: P(
    t("จังหวะชีวิตที่เรียบง่ายกับหน้าคุ้น ๆ", "A simple rhythm among familiar faces."),
    t("ความวุ่นวายและเสียงดังตอนเช้า", "Noise and rush first thing in the morning."),
    t("รุ่งเช้า 6 ถึง 7 โมง", "Dawn, 6 to 7 am"),
    [
      spot("🌳", t("สวนลุมพินี", "Lumphini Park"), t("ปทุมวัน", "Pathum Wan"), t("กลุ่มรำไทเก๊กและแอโรบิกที่เจอกันทุกเช้า", "Tai chi and aerobics groups that meet every dawn.")),
      spot("🏯", t("สนามหลวง", "Sanam Luang"), t("พระนคร", "Phra Nakhon"), t("เดินเช้ารอบสนามโดยมีวัดพระแก้วเป็นฉากหลัง", "A morning lap with the Grand Palace roofs behind you.")),
      spot("🌅", t("ริมน้ำย่านบางลำพู", "Bang Lamphu riverside"), t("พระนคร", "Phra Nakhon"), t("เดินริมน้ำตอนเช้าแล้วแวะกินโจ๊กร้านประจำ", "A riverside walk, then jok at your usual stall.")),
    ],
  ),
  CFSN: P(
    t("ที่อบอุ่นที่ได้ลงมือทำอะไรสักอย่างแบบสบาย ๆ", "A cosy place to make something, at ease."),
    t("ปาร์ตี้ใหญ่ที่ไม่มีใครคุยเรื่องที่คุณชอบ", "Big parties where nobody talks about what you love."),
    t("บ่ายวันอาทิตย์และค่ำวันธรรมดาเงียบ ๆ", "Sunday afternoons and quiet weeknights"),
    [
      spot("📐", t("TCDC อาคารไปรษณีย์กลาง", "TCDC, Grand Postal Building"), t("บางรัก", "Bang Rak"), t("ห้องสมุดดีไซน์ที่มีมุมประจำให้นั่งทำงาน", "A design library with a corner you can call yours.")),
      spot("🏺", t("สตูดิโอเซรามิก", "A ceramics studio"), t("ทั่วเมือง", "Around town"), t("คลาสประจำ ได้ลงมือปั้นดินกับคนคุ้นหน้าไม่กี่คน", "A regular class, hands in clay, with a few familiar faces.")),
      spot("📖", t("วงอ่านหนังสือที่คาเฟ่ประจำ", "A book circle at your café"), t("อารีย์หรือสามย่าน", "Ari or Samyan"), t("คนกลุ่มเล็ก หนังสือดี และกาแฟแก้วเดิม", "A small group, a good book and your usual coffee.")),
    ],
  ),
  CFSH: P(
    t("รู้สึกเป็นส่วนหนึ่งของย่าน และช่วยดูแลย่านไว้", "To belong to a neighbourhood and look after it."),
    t("ร้านเก่าที่ปิดตัวและย่านที่เปลี่ยนเร็วเกินไป", "Old shops closing and neighbourhoods changing too fast."),
    t("เช้าตรู่และมื้อเที่ยงวันธรรมดา", "Early mornings and weekday lunches"),
    [
      spot("🏘️", t("บางลำพู", "Bang Lamphu"), t("พระนคร", "Phra Nakhon"), t("ร้านเก่าแก่ที่เจ้าของจำหน้าลูกค้าได้", "Old shops where the owners know every face.")),
      spot("💐", t("ปากคลองตลาด", "Pak Khlong Talat"), t("พระนคร", "Phra Nakhon"), t("ตลาดดอกไม้ตอนเช้ากับพ่อค้าแม่ค้าที่ทักกันทุกวัน", "The morning flower market and vendors you greet daily.")),
      spot("🛶", t("ตลาดน้ำตลิ่งชัน", "Taling Chan Floating Market"), t("ตลิ่งชัน", "Taling Chan"), t("ตลาดน้ำชุมชนที่ไปทุกสุดสัปดาห์", "A community floating market you visit every weekend.")),
    ],
  ),
};


const c = (key: ArchetypeKey, en: string, th: string) => ({ key, why: t(th, en) });
const h = (emoji: string, district: string, en: string, th: string, whyEn: string, whyTh: string): Hangout => ({ emoji, district, name: t(th, en), why: t(whyTh, whyEn) });

const SOCIAL: Record<ArchetypeKey, Social> = {
  BDMN: {
    clicks: [
      c("CDMN", "Same love of new routes; they find the quiet ones, you bring the crew.", "รักเส้นทางใหม่เหมือนกัน เขาเจอทางเงียบ คุณพาแก๊งมา"),
      c("BDSN", "They know what just opened; you know how to get everyone there.", "เขารู้ว่าอะไรเพิ่งเปิด คุณรู้ว่าจะพาทุกคนไปยังไง"),
      c("BFMN", "A ready-made crew that loves to move.", "ก๊วนพร้อมลุยที่ชอบขยับตัวเหมือนกัน"),
    ],
    hangouts: [
      h("🎪", "huai_khwang", "Jodd Fairs Ratchada", "จ๊อดแฟร์ รัชดา", "A night market that keeps changing, best with a big group.", "ตลาดกลางคืนที่เปลี่ยนตลอด ไปกันเยอะ ๆ สนุกสุด"),
      h("🛍️", "pathum_wan", "Siam Square and Lido Connect", "สยามสแควร์และลิโด้ คอนเน็คท์", "Pop-ups, street dance and new shops every weekend.", "ป๊อปอัป สตรีทแดนซ์ และร้านใหม่ทุกสุดสัปดาห์"),
      h("✈️", "bang_phlat", "Chang Chui", "ช่างชุ่ย", "A creative market made for wandering with friends.", "ตลาดสร้างสรรค์ที่เหมาะกับการเดินเล่นกับเพื่อน"),
    ],
  },
  BDMH: {
    clicks: [
      c("CDSH", "They know the story behind every lane you lead people down.", "เขารู้เรื่องเล่าของทุกซอยที่คุณพาเดิน"),
      c("BDSH", "Every old-town walk needs someone who knows where to eat.", "ทุกทริปเมืองเก่าต้องมีคนรู้ว่าจะกินที่ไหน"),
      c("BFMH", "They know the festivals; you know the back way in.", "เขารู้ทุกเทศกาล คุณรู้ทางลัดเข้างาน"),
    ],
    hangouts: [
      h("🛶", "khlong_san", "Sook Siam at ICONSIAM", "สุขสยาม ไอคอนสยาม", "An indoor floating market of regional crafts and food, cool on hot days.", "ตลาดน้ำในร่มรวมของดีทุกภาค เย็นสบายวันแดดแรง"),
      h("🥊", "pom_prap", "Rajadamnern Boxing Stadium", "เวทีมวยราชดำเนิน", "Bangkok's historic Muay Thai stadium, loud and full of tradition.", "เวทีมวยเก่าแก่ของกรุงเทพฯ เสียงเชียร์ดังและเต็มไปด้วยประวัติศาสตร์"),
      h("🎒", "phra_nakhon", "Khao San Road and Rambuttri", "ถนนข้าวสารและรามบุตรี", "Old Bang Lamphu lanes with travellers from everywhere.", "ซอยเก่าบางลำพูกับนักเดินทางจากทั่วโลก"),
    ],
  },
  BDSN: {
    clicks: [
      c("CDSN", "They find the café before anyone; you fill it with people.", "เขาเจอคาเฟ่ก่อนใคร คุณพาคนมาเต็มร้าน"),
      c("BDMN", "They'll get everyone to the opening on time.", "เขาพาทุกคนไปงานเปิดได้ทันเวลา"),
      c("BFSN", "They host, you bring the newest scene.", "เขาเป็นเจ้าภาพ คุณพาซีนใหม่มา"),
    ],
    hangouts: [
      h("🏙️", "khlong_toei", "EmSphere", "เอ็มสเฟียร์", "Big new venue with food halls, events and live shows.", "ที่เที่ยวใหม่ขนาดใหญ่ มีฟู้ดฮอลล์ กิจกรรม และโชว์สด"),
      h("🌳", "pathum_wan", "One Bangkok", "วัน แบงค็อก", "The city's newest district of art, food and events.", "ย่านใหม่ล่าสุดของเมือง รวมศิลปะ อาหาร และกิจกรรม"),
      h("🍽️", "watthana", "The Commons Thonglor", "เดอะ คอมมอนส์ ทองหล่อ", "Open-air terraces where you'll always meet someone new.", "ลานเปิดโล่งหลายชั้นที่เจอคนใหม่ได้เสมอ"),
    ],
  },
  BDSH: {
    clicks: [
      c("BFSH", "They know the best stall; you know the newest one.", "เขารู้ร้านที่ดีที่สุด คุณรู้ร้านใหม่ล่าสุด"),
      c("CDSH", "They tell the story of the recipe while you order seconds.", "เขาเล่าที่มาของสูตร ส่วนคุณสั่งจานที่สองไปแล้ว"),
      c("BDMH", "They walk the old town; you make sure it ends at dinner.", "เขาพาเดินเมืองเก่า คุณพาไปจบที่มื้อเย็น"),
    ],
    hangouts: [
      h("🌶️", "huai_khwang", "Huai Khwang night market", "ตลาดกลางคืนห้วยขวาง", "Late food stalls that locals queue for.", "ร้านอาหารดึกที่คนแถวนั้นยอมต่อคิว"),
      h("🍢", "lat_phrao", "Chokchai 4 market", "ตลาดโชคชัย 4", "A real neighbourhood food market, far from the tourist trail.", "ตลาดอาหารของคนในย่านจริง ๆ ไกลจากเส้นทางนักท่องเที่ยว"),
      h("🍛", "ratchathewi", "Ban Khrua", "ชุมชนบ้านครัว", "Halal khao mok and silk weaving by the Saen Saep canal.", "ข้าวหมกฮาลาลและผ้าทอริมคลองแสนแสบ"),
    ],
  },
  BFMN: {
    clicks: [
      c("CFMN", "Same discipline, and they keep you consistent.", "มีวินัยเหมือนกัน และเขาช่วยให้คุณไม่หลุด"),
      c("BDMN", "They bring new routes to your usual crew.", "เขาพาเส้นทางใหม่มาให้ก๊วนประจำ"),
      c("BFMH", "Same crowd energy, from the court to the festival.", "พลังเชียร์เหมือนกัน ตั้งแต่สนามกีฬาถึงงานเทศกาล"),
    ],
    hangouts: [
      h("🏟️", "bang_kapi", "Rajamangala Stadium", "ราชมังคลากีฬาสถาน", "Match nights and big concerts with a crowd.", "คืนแข่งบอลและคอนเสิร์ตใหญ่กับผู้คนเต็มสนาม"),
      h("🏸", "din_daeng", "Thai-Japanese Sports Centre", "ศูนย์เยาวชนไทย-ญี่ปุ่น ดินแดง", "Courts and pools for the weekly crew.", "สนามและสระว่ายน้ำสำหรับก๊วนประจำสัปดาห์"),
      h("⚽", "nong_chok", "Bangkok Arena", "บางกอกอารีนา", "Futsal and indoor sport, big and loud.", "ฟุตซอลและกีฬาในร่ม สนามใหญ่ เชียร์กันสนุก"),
    ],
  },
  BFMH: {
    clicks: [
      c("CFMH", "They keep the traditions all year; you bring the crowd.", "เขารักษาประเพณีทั้งปี คุณพาผู้คนมาร่วม"),
      c("BFSH", "Every festival ends at their favourite stall.", "ทุกเทศกาลไปจบที่ร้านโปรดของเขา"),
      c("BDMH", "They find the hidden part of the fair.", "เขาเจอมุมลับของงาน"),
    ],
    hangouts: [
      h("🎆", "pathum_wan", "The CentralWorld countdown square", "ลานเคาท์ดาวน์เซ็นทรัลเวิลด์", "New Year's Eve with the whole city.", "ส่งท้ายปีเก่ากับคนทั้งเมือง"),
      h("🌽", "chatuchak", "Kasetsart Fair", "งานเกษตรแฟร์", "The yearly fair of food, plants and family fun.", "งานประจำปีที่มีทั้งของกิน ต้นไม้ และความสนุกทั้งครอบครัว"),
      h("🎡", "bang_kho_laem", "Asiatique", "เอเชียทีค", "Riverside fairground nights and the Ferris wheel.", "คืนริมน้ำกับชิงช้าสวรรค์"),
    ],
  },
  BFSN: {
    clicks: [
      c("BDSN", "They bring the new scene to your table.", "เขาพาซีนใหม่มาที่โต๊ะคุณ"),
      c("BFSH", "Same big table, they just pick the food.", "โต๊ะใหญ่เหมือนกัน แค่เขาเป็นคนเลือกอาหาร"),
      c("CFSN", "The quiet one who makes your playlist better.", "คนเงียบ ๆ ที่ช่วยให้เพลย์ลิสต์ของคุณดีขึ้น"),
    ],
    hangouts: [
      h("🪩", "huai_khwang", "The RCA clubs", "คลับย่าน RCA", "Dance floors and live bands for a big group.", "ฟลอร์เต้นและวงดนตรีสดสำหรับกลุ่มใหญ่"),
      h("🎶", "watthana", "Thonglor and Ekkamai music spots", "ร้านดนตรีย่านทองหล่อ เอกมัย", "Your usual spot, a good band, new faces every week.", "มุมเดิม ดนตรีดี และหน้าใหม่ทุกสัปดาห์"),
      h("🌈", "bang_rak", "Silom Soi 4", "สีลมซอย 4", "A welcoming street for dancing and people-watching.", "ถนนที่เปิดรับทุกคน เต้นและนั่งดูผู้คน"),
    ],
  },
  BFSH: {
    clicks: [
      c("BDSH", "They find the new stall; you vouch for the old one.", "เขาเจอร้านใหม่ คุณการันตีร้านเก่า"),
      c("CFSH", "They know every shop in the neighbourhood too.", "เขาก็รู้จักทุกร้านในย่านเหมือนกัน"),
      c("BFSN", "Same big table, they bring the music.", "โต๊ะใหญ่เหมือนกัน เขาพาเพลงมา"),
    ],
    hangouts: [
      h("🛍️", "ratchathewi", "Pratunam market", "ตลาดประตูน้ำ", "Busy, cheap and full of food you already love.", "คึกคัก ราคาถูก และเต็มไปด้วยของกินที่คุณรักอยู่แล้ว"),
      h("🍜", "huai_khwang", "Jodd Fairs Ratchada", "จ๊อดแฟร์ รัชดา", "Long tables and the stalls you always go back to.", "โต๊ะยาวและร้านที่กลับไปกินทุกครั้ง"),
      h("🥘", "khlong_toei", "Khlong Toei Market", "ตลาดคลองเตย", "Bangkok's big fresh market, early and lively.", "ตลาดสดใหญ่ของกรุงเทพฯ เช้าตรู่และคึกคัก"),
    ],
  },
  CDMN: {
    clicks: [
      c("CDMH", "Two quiet walkers; one likes new streets, one likes old ones.", "นักเดินเงียบสองคน คนหนึ่งชอบถนนใหม่ อีกคนชอบถนนเก่า"),
      c("BDMN", "They bring the crew when you want company.", "เขาพาแก๊งมาเมื่อคุณอยากมีเพื่อน"),
      c("CDSN", "Your walk always ends at their café.", "เดินเสร็จทีไร คุณไปจบที่คาเฟ่ของเขาทุกที"),
    ],
    hangouts: [
      h("🌿", "bang_khun_thian", "The Bang Khun Thian seaside path", "ทางเดินริมทะเลผ่านป่าชายเลนบางขุนเทียน", "Bangkok's only coastline, calm and wide open.", "ชายฝั่งเดียวของกรุงเทพฯ สงบและโล่งกว้าง"),
      h("🌉", "khlong_toei", "The Benjakitti skywalk at dawn", "สกายวอล์กสวนเบญจกิติตอนเช้า", "A raised path over the wetlands before the city wakes.", "ทางเดินลอยฟ้าเหนือบึงก่อนเมืองตื่น"),
      h("🏮", "khlong_san", "Lhong 1919", "ล้ง 1919", "Riverside courtyards with quiet corners to find.", "ลานริมน้ำที่มีมุมเงียบให้ค้นหา"),
    ],
  },
  CDMH: {
    clicks: [
      c("CDSH", "They sit with the stories you walk past.", "คุณเดินผ่านเรื่องเล่าไป แต่เขาหยุดนั่งฟัง"),
      c("CFMH", "The same calm mornings, in a familiar park.", "เช้าที่สงบเหมือนกัน ในสวนที่คุ้นเคย"),
      c("BDMH", "They turn your quiet route into a group walk.", "เขาเปลี่ยนเส้นทางเงียบของคุณเป็นทริปกลุ่ม"),
    ],
    hangouts: [
      h("🛕", "dusit", "Wat Benchamabophit", "วัดเบญจมบพิตร", "Marble courtyards that are calm early in the day.", "ลานหินอ่อนที่สงบในช่วงเช้า"),
      h("🚣", "bangkok_noi", "The Royal Barges National Museum", "พิพิธภัณฑสถานแห่งชาติ เรือพระราชพิธี", "Quiet halls of carved boats by the canal.", "อาคารเงียบ ๆ ที่เก็บเรือแกะสลักริมคลอง"),
      h("🏯", "chom_thong", "Wat Ratchaorasaram", "วัดราชโอรสาราม", "A temple in Thai and Chinese style, rarely crowded.", "วัดศิลปะไทยผสมจีน คนไม่ค่อยพลุกพล่าน"),
    ],
  },
  CDSN: {
    clicks: [
      c("CFSN", "They have a regular corner; you bring a new place to try.", "เขามีมุมประจำ คุณพาที่ใหม่มาให้ลอง"),
      c("CDSH", "Long talks, one about design, one about history.", "คุยกันยาว คนหนึ่งเรื่องดีไซน์ อีกคนเรื่องประวัติศาสตร์"),
      c("BDSN", "They throw the opening; you find the quiet table.", "เขาจัดงานเปิด คุณหาโต๊ะเงียบ ๆ"),
    ],
    hangouts: [
      h("🎬", "pathum_wan", "House Samyan", "โรงหนังเฮาส์ สามย่าน", "Indie films and a slow talk after.", "หนังอินดี้แล้วนั่งคุยกันยาว ๆ ต่อ"),
      h("📚", "pathum_wan", "Samyan Mitrtown", "สามย่านมิตรทาวน์", "Reading spots and cafés that stay open late.", "มุมอ่านหนังสือและคาเฟ่ที่เปิดถึงดึก"),
      h("☕", "khlong_san", "Charoen Nakhon Road cafés", "คาเฟ่ถนนเจริญนคร", "Riverside cafés in old warehouses.", "คาเฟ่ริมน้ำในโกดังเก่า"),
    ],
  },
  CDSH: {
    clicks: [
      c("CDMH", "They walk the route; you know its story.", "เขาเดินนำทาง คุณเล่าเรื่องราวของทางนั้น"),
      c("BDSH", "They find the old family shop; you ask how it started.", "เขาเจอร้านเก่าแก่ คุณถามว่าร้านเริ่มมายังไง"),
      c("CFSH", "They know the neighbourhood's people; you know its past.", "เขารู้จักคนในย่าน คุณรู้อดีตของย่าน"),
    ],
    hangouts: [
      h("🧵", "ratchathewi", "Ban Khrua weaving community", "ชุมชนทอผ้าบ้านครัว", "Silk weaving and family stories by the canal.", "ผ้าไหมทอมือและเรื่องเล่าครอบครัวริมคลอง"),
      h("🚣", "bangkok_noi", "The Royal Barges National Museum", "พิพิธภัณฑสถานแห่งชาติ เรือพระราชพิธี", "Every barge has a story worth hearing.", "เรือทุกลำมีเรื่องเล่าที่น่าฟัง"),
      h("🖌️", "bang_kho_laem", "The murals of Wat Chong Nonsi", "จิตรกรรมฝาผนังวัดช่องนนทรี", "Old paintings you can study slowly.", "ภาพเขียนเก่าที่ค่อย ๆ ดูได้นาน ๆ"),
    ],
  },
  CFMN: {
    clicks: [
      c("CFMH", "Same routine, one in a new park, one in an old one.", "กิจวัตรเหมือนกัน คนหนึ่งในสวนใหม่ อีกคนในสวนเก่า"),
      c("BFMN", "They turn your routine into a team.", "เขาเปลี่ยนกิจวัตรของคุณให้เป็นทีม"),
      c("CDMN", "They show you a new route once in a while.", "นาน ๆ ทีเขาก็พาไปลองเส้นทางใหม่"),
    ],
    hangouts: [
      h("🌳", "khlong_toei", "Benjasiri Park", "สวนเบญจสิริ", "A small modern park for the same loop every day.", "สวนเล็กดีไซน์ทันสมัย วิ่งรอบเดิมได้ทุกวัน"),
      h("🌸", "prawet", "Suan Luang Rama IX", "สวนหลวง ร.9", "Bangkok's biggest park, with room for any routine.", "สวนใหญ่ที่สุดในกรุงเทพฯ มีพื้นที่ให้ทุกกิจวัตร"),
      h("🚴", "chatuchak", "Rot Fai Park", "สวนรถไฟ", "Shady bike paths for your weekly ride.", "ทางจักรยานร่มรื่นสำหรับปั่นประจำสัปดาห์"),
    ],
  },
  CFMH: {
    clicks: [
      c("CFMN", "Same early alarm, same love of a routine.", "ตื่นเช้าเหมือนกัน รักกิจวัตรเหมือนกัน"),
      c("CFSH", "Your walk ends at their favourite morning stall.", "เดินเสร็จแล้วไปจบที่ร้านมื้อเช้าร้านโปรดของเขา"),
      c("CDMH", "They know the quiet temple on your route.", "เขารู้จักวัดเงียบ ๆ บนเส้นทางของคุณ"),
    ],
    hangouts: [
      h("🌳", "bueng_kum", "Seri Thai Park", "สวนเสรีไทย", "A big lake loop with the same friendly faces.", "เดินรอบบึงใหญ่กับหน้าคุ้น ๆ เดิม"),
      h("🏰", "phra_nakhon", "Santichaiprakarn Park", "สวนสันติชัยปราการ", "Riverside mornings by the old fort.", "เช้าริมน้ำข้างป้อมเก่า"),
      h("🌸", "prawet", "Suan Luang Rama IX", "สวนหลวง ร.9", "Thai pavilions and long, calm paths.", "ศาลาไทยและทางเดินยาวที่สงบ"),
    ],
  },
  CFSN: {
    clicks: [
      c("CDSN", "They bring news of a new café; you keep your corner.", "เขาชวนไปคาเฟ่ใหม่ ส่วนคุณยังรักมุมเดิม"),
      c("CFSH", "Both of you are loyal to your favourite places.", "ทั้งสองคนรักที่ประจำของตัวเอง"),
      c("BFSN", "They pull you into the party; you bring the playlist.", "เขาชวนคุณเข้าปาร์ตี้ ส่วนคุณเตรียมเพลย์ลิสต์มา"),
    ],
    hangouts: [
      h("🎬", "pathum_wan", "House Samyan", "โรงหนังเฮาส์ สามย่าน", "Your regular seat for indie films.", "ที่นั่งประจำสำหรับหนังอินดี้"),
      h("🌿", "watthana", "The Commons Thonglor", "เดอะ คอมมอนส์ ทองหล่อ", "A familiar table and workshops on weekends.", "โต๊ะคุ้นเคยและเวิร์กช็อปช่วงสุดสัปดาห์"),
      h("📐", "bang_rak", "The TCDC library", "ห้องสมุด TCDC", "Design books and your usual corner.", "หนังสือดีไซน์และมุมประจำของคุณ"),
    ],
  },
  CFSH: {
    clicks: [
      c("CFSN", "Two regulars who like a quiet, familiar table.", "ขาประจำสองคนที่ชอบโต๊ะเงียบ ๆ ที่คุ้นเคย"),
      c("BFSH", "They bring friends to the shop you love.", "เขาพาเพื่อนมาที่ร้านที่คุณรัก"),
      c("CDSH", "They love the neighbourhood's story as much as you.", "เขารักเรื่องราวของย่านพอ ๆ กับคุณ"),
    ],
    hangouts: [
      h("🕰️", "min_buri", "Min Buri's old market", "ตลาดเก่ามีนบุรี", "An old market where people still know each other.", "ตลาดเก่าที่ผู้คนยังรู้จักกัน"),
      h("🛶", "lat_krabang", "Hua Takhe old market", "ตลาดหัวตะเข้", "Wooden shophouses and art on the canal.", "เรือนไม้และงานศิลปะริมคลอง"),
      h("🏮", "bangkok_noi", "Wang Lang Market", "ตลาดวังหลัง", "Riverside stalls that have been there for decades.", "ร้านริมน้ำที่อยู่มาหลายสิบปี"),
    ],
  },
};

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = Object.fromEntries(
  ARCHETYPE_CODES.map((k) => [k, { ...BASE[k], ...PROFILES[k], ...SOCIAL[k] }]),
) as Record<ArchetypeKey, Archetype>;

export const ARCHETYPE_KEYS: ArchetypeKey[] = [...ARCHETYPE_CODES];

/** Shown before any quiz result exists. */
export const DEFAULT_TYPE: ArchetypeKey = "CFSH";

export function isArchetypeKey(k: string): k is ArchetypeKey {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, k);
}

/** A type and how well it fits someone, 0..100. */
export type BlendEntry = { key: ArchetypeKey; fit: number };

/** How much the picks themselves (type-linked answers) count next to the letter axes. */
export const AFFINITY_WEIGHT = 0.4;

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

/** The plain letter code: the sign of each axis, ties toward the first letter. */
function signCode(vector: Record<string, number>): ArchetypeKey {
  return CODE_AXES.map((a) => ((vector[a.category] ?? 0) >= 0 ? a.plus : a.minus)).join("") as ArchetypeKey;
}

/** 0..1: 1 when every axis sits fully on this code's side. */
function axisFit(vector: Record<string, number>, code: ArchetypeKey): number {
  return codePoles(code).reduce((t, { category, pole }) => t + (1 + pole * clamp(vector[category] ?? 0)) / 2, 0) / 4;
}

/**
 * Every type ranked by fit, best first. Fit blends how close the letter axes
 * are to the type with how often the person picked that type's own answers
 * (when there are any). Ties go to the plain letter code, then the fewest
 * letters away from it.
 */
export function typeFits(vector: Record<string, number>, affinity?: Partial<Record<string, number>> | null): BlendEntry[] {
  const sign = signCode(vector);
  const aff = Object.values(affinity ?? {}).filter((x): x is number => typeof x === "number");
  const mean = aff.length ? aff.reduce((t, x) => t + x, 0) / aff.length : 0;
  return ARCHETYPE_KEYS.map((key) => {
    const ax = axisFit(vector, key);
    const raw = aff.length ? (1 - AFFINITY_WEIGHT) * ax + AFFINITY_WEIGHT * (affinity?.[key] ?? mean) : ax;
    return { key, raw, away: lettersDiffer(key, sign) };
  })
    .sort((a, b) => b.raw - a.raw || a.away - b.away)
    .map(({ key, raw }) => ({ key, fit: Math.round(raw * 100) }));
}

/**
 * Everything saved with a result besides the vector: the top three types, the
 * letters that were within the margin of error, and twin-pair consistency.
 */
export type TypeResult = {
  types: BlendEntry[];
  unsure: Category[];
  consistency: number | null;
  margin?: Partial<Record<Category, number>>;
};

/**
 * The type, allowing for a margin of error. A clear letter is never
 * overruled; a letter within the margin (`unsure`, from scoreSession) is
 * decided by which types' answers the person actually picked. Without
 * `unsure`, a letter counts as clear when it is not "balanced".
 *
 * `range` is what the result page headlines: one type when every letter is
 * clear, the two types either side of a single unsure letter, or the three
 * closest when two or more letters are unsure.
 */
export function typeOf(
  vector: Record<string, number>,
  affinity?: Partial<Record<string, number>> | null,
  unsure?: readonly Category[] | null,
): { archetype: ArchetypeKey; modifier: string | null; blend: BlendEntry[]; range: ArchetypeKey[] } {
  const fits = typeFits(vector, affinity);
  const isUnsure = (c: Category) => (unsure ? unsure.includes(c) : strengthOf(vector[c] ?? 0) === "balanced");
  const clear = CODE_AXES.map((a, i) => ({ i, c: a.category })).filter((x) => !isUnsure(x.c));
  const sign = signCode(vector);
  const ok = (k: ArchetypeKey) => clear.every((x) => k[x.i] === sign[x.i]);
  const top = fits.find((f) => ok(f.key)) ?? fits[0];
  const flavour = (["rhythm", "plan"] as Category[])
    .filter((c) => !isUnsure(c) && (vector[c] ?? 0) !== 0)
    .map((c) => `${c}${(vector[c] ?? 0) >= 0 ? "+" : "-"}`);
  const blend = [top, ...fits.filter((f) => f.key !== top.key).slice(0, 2)];
  const open = CODE_AXES.map((a, i) => i).filter((i) => isUnsure(CODE_AXES[i].category));
  const range = open.length === 0 ? [top.key] : open.length === 1 ? [top.key, flip(top.key, open[0])] : blend.map((b) => b.key);
  return { archetype: top.key, modifier: flavour.length ? flavour.join(",") : null, blend, range };
}

/**
 * A saved result's extras, or (results from before margins existed) ones
 * rebuilt from the vector with no unsure letters.
 */
export function resultOf(row: { archetype: ArchetypeKey; vector: Record<string, number>; blend?: unknown }): TypeResult & { range: ArchetypeKey[] } {
  const raw = row.blend as Partial<TypeResult> | BlendEntry[] | null | undefined;
  const types = (Array.isArray(raw) ? raw : raw?.types ?? []).filter((b) => b && isArchetypeKey(b.key) && typeof b.fit === "number");
  const unsure = (!Array.isArray(raw) && Array.isArray(raw?.unsure) ? raw!.unsure : []).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const consistency = !Array.isArray(raw) && typeof raw?.consistency === "number" ? raw.consistency : null;
  let blend: BlendEntry[];
  if (types.length > 0 && types[0].key === row.archetype) blend = types;
  else {
    const fits = typeFits(row.vector);
    blend = [fits.find((f) => f.key === row.archetype)!, ...fits.filter((f) => f.key !== row.archetype).slice(0, 2)];
  }
  const open = CODE_AXES.map((a, i) => i).filter((i) => unsure.includes(CODE_AXES[i].category));
  const range = open.length === 0 ? [row.archetype] : open.length === 1 ? [row.archetype, flip(row.archetype, open[0])] : blend.map((b) => b.key);
  const margin = !Array.isArray(raw) ? raw?.margin : undefined;
  return { types: blend, unsure, consistency, ...(margin ? { margin } : {}), range };
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
  const { archetype, modifier } = typeOf(row.vector);
  return { archetype, modifier };
}
