/**
 * Curated icebreakers (owner-approved): a small, hand-written bank of
 * questions for a Bangkok table. Written Thai first, then English, per
 * design/reference/thai-voice.md: warm, short, spoken, no polite particles.
 *
 * Low pressure by design: anyone can answer in a sentence, nobody has to
 * reveal much, and every question works for locals, people from the
 * provinces and people from abroad. Never about dating, politics, religion,
 * money or how anyone looks (test/icebreakers.test.ts checks the words).
 *
 * Shown to confirmed attendees from a few days before the event until it
 * ends: 3 on the event page and, for a hangout with a group chat, as optional
 * tap-to-send suggestions there. Which 3 depends on the event, so tables
 * don't all get the same ones: one about the city, one about food and one
 * about you.
 */

export type IcebreakerKind = "city" | "food" | "you";
export type Icebreaker = { id: string; kind: IcebreakerKind; emoji: string; th: string; en: string };

const q = (id: string, kind: IcebreakerKind, emoji: string, th: string, en: string): Icebreaker => ({ id, kind, emoji, th, en });

export const ICEBREAKERS: Icebreaker[] = [
  // --- the city
  q("first_visitor", "city", "📍", "ถ้ามีเพื่อนต่างถิ่นมาเที่ยว จะพาไปที่ไหนเป็นที่แรก", "A friend visits Bangkok. Where do you take them first?"),
  q("sunday_morning", "city", "🌳", "เช้าวันอาทิตย์ว่าง ๆ ชอบไปไหนในกรุงเทพฯ", "A free Sunday morning in Bangkok. Where do you go?"),
  q("new_area", "city", "🛵", "ย่านไหนที่เพิ่งไปครั้งแรกแล้วติดใจ", "Which neighbourhood did you visit for the first time and fall for?"),
  q("getting_around", "city", "🚆", "ชอบเดินทางในเมืองแบบไหนที่สุด เรือ รถไฟฟ้า หรือเดินเอา", "Your favourite way around the city: boat, train or on foot?"),
  q("sunset", "city", "🌅", "ที่ดูพระอาทิตย์ตกที่ชอบที่สุดในเมืองคือที่ไหน", "Where's your favourite place to watch the sunset in the city?"),
  q("market", "city", "🏮", "ตลาดไหนที่เดินได้ทั้งวันไม่เบื่อ", "Which market could you wander all day?"),
  q("not_yet", "city", "🗺️", "ที่ไหนในกรุงเทพฯ ที่อยากไปมานานแต่ยังไม่ได้ไป", "Where in Bangkok have you been meaning to go for ages?"),
  q("this_is_bangkok", "city", "🚶", "เดินเล่นแถวไหนแล้วรู้สึกว่า นี่แหละกรุงเทพฯ", "Where do you walk and think, this is Bangkok?"),
  q("quiet_corner", "city", "☕", "มุมสงบ ๆ ในเมืองที่ไว้นั่งพักใจคือที่ไหน", "Where's your quiet corner of the city to recharge?"),
  q("day_trip", "city", "🧭", "ถ้ามีหนึ่งวันเต็ม ๆ นอกกรุงเทพฯ จะไปไหน", "One whole day out of Bangkok. Where would you go?"),
  q("rainy_day", "city", "🌧️", "วันฝนตกในกรุงเทพฯ ชอบทำอะไร", "What do you do on a rainy Bangkok day?"),
  q("time_of_year", "city", "🌤️", "ช่วงไหนของปีที่ชอบกรุงเทพฯ ที่สุด เพราะอะไร", "What time of year do you like Bangkok best, and why?"),

  // --- food
  q("regular_spot", "food", "🍜", "ร้านไหนที่กลับไปกินซ้ำบ่อยที่สุด สั่งอะไรประจำ", "Which food spot do you keep going back to, and what do you order?"),
  q("street_snack", "food", "🍢", "ของกินข้างทางที่เห็นทีไรต้องแวะทุกที", "Which street snack can you never walk past?"),
  q("drink_order", "food", "🧋", "เครื่องดื่มที่สั่งประจำคืออะไร หวานแค่ไหน", "What's your usual drink order, and how sweet?"),
  q("cook_best", "food", "🍳", "เมนูที่ทำเองแล้วอร่อยที่สุดคืออะไร", "What's the dish you cook best?"),
  q("thai_fruit", "food", "🥭", "ผลไม้ไทยที่ชอบที่สุด กับผลไม้ที่ยังไม่กล้าลอง", "Your favourite Thai fruit, and one you haven't dared to try yet?"),
  q("spice_level", "food", "🌶️", "กินเผ็ดได้แค่ไหน มีเรื่องเผ็ดที่จำไม่ลืมไหม", "How spicy can you go? Any spicy story you'll never forget?"),
  q("comfort_food", "food", "🍲", "อาหารที่กินแล้วรู้สึกเหมือนได้กลับบ้านคืออะไร", "What food tastes like home to you?"),

  // --- you
  q("on_repeat", "you", "🎧", "เพลงที่ฟังวนช่วงนี้คือเพลงอะไร", "What song have you had on repeat lately?"),
  q("small_smile", "you", "😄", "สัปดาห์นี้มีเรื่องเล็ก ๆ อะไรที่ทำให้ยิ้มได้", "What small thing made you smile this week?"),
  q("lose_time", "you", "🎲", "ทำอะไรแล้วเพลินจนลืมดูเวลา", "What do you do that makes you lose track of time?"),
  q("want_to_learn", "you", "📚", "มีอะไรที่อยากลองเรียนมานานแต่ยังไม่ได้เริ่มไหม", "Something you've wanted to learn for ages but haven't started?"),
  q("watch_this", "you", "🎬", "หนังหรือซีรีส์เรื่องไหนที่อยากให้ทุกคนได้ดู", "Which film or series would you tell everyone to watch?"),
  q("karaoke", "you", "🎤", "ถ้าต้องร้องคาราโอเกะหนึ่งเพลง จะเลือกเพลงอะไร", "One karaoke song. Which do you pick?"),
  q("move", "you", "🏸", "ชอบขยับตัวแบบไหนที่สุด กีฬา เต้น หรือเดินเล่น", "How do you like to move: a sport, dancing or a long walk?"),
  q("hidden_skill", "you", "🧩", "ทักษะเล็ก ๆ ที่ทำได้ดีแบบคาดไม่ถึงคืออะไร", "What's a small thing you're surprisingly good at?"),
  q("trying_new", "you", "🌱", "ช่วงนี้กำลังลองทำอะไรใหม่ ๆ อยู่ไหม", "Anything new you're trying out lately?"),
  q("dream_pet", "you", "🐈", "ถ้าเลือกสัตว์เลี้ยงได้หนึ่งตัว จะเลือกอะไร", "If you could have any pet, what would it be?"),
  q("meet_again", "you", "🤝", "ถ้าโต๊ะนี้นัดเจอกันอีกครั้ง อยากไปทำอะไรด้วยกัน", "If this table met again, what would you do together?"),
];

/** Days before the start that the icebreakers appear. */
export const ICEBREAKER_DAYS_BEFORE = 3;
const DAY = 86_400_000;

/** From a few days before the start until the event ends. */
export function icebreakerWindow(startsAt: Date, endsAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= startsAt.getTime() - ICEBREAKER_DAYS_BEFORE * DAY && now.getTime() < endsAt.getTime();
}

/** A small seeded generator (mulberry32) from a string (FNV-1a). */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The icebreakers for one event: the same for everyone at that event, and
 * usually different from the next event's. One about the city, one about
 * food, one about you (for n = 3), in that order.
 */
export function icebreakersFor(eventId: string, n = 3): Icebreaker[] {
  const next = rng(`ice:${eventId}`);
  const pick = (kind: IcebreakerKind) => {
    const pool = ICEBREAKERS.filter((x) => x.kind === kind);
    return pool[Math.floor(next() * pool.length)];
  };
  const out = [pick("city"), pick("food"), pick("you")];
  // More than 3: fill from the rest of the bank in a seeded order.
  const rest = ICEBREAKERS.filter((x) => !out.includes(x))
    .map((x) => ({ x, k: next() }))
    .sort((a, b) => a.k - b.k)
    .map((r) => r.x);
  return [...out, ...rest].slice(0, n);
}
