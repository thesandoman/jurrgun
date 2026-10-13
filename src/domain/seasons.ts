/**
 * The monthly "big quest" for Bangkok Buddies: one hand-written quest per
 * month, themed on the season or a Thai holiday, at a real public place.
 * It sits next to the weekly quest and earns a season badge as well as the
 * district stamp.
 *
 * Same content rules as the quiz bank (src/vibe/bank/WRITING.md): family
 * friendly, gender neutral, works for friends AND for dates, places and food
 * rather than religious practice, no em or en dashes.
 */
import type { Text } from "../vibe/content";

export type SeasonQuest = { month: number; icon: string; theme: Text; quest: Text; district: string };

const q = (month: number, icon: string, theme: [string, string], quest: [string, string], district: string): SeasonQuest => ({
  month,
  icon,
  theme: { en: theme[0], th: theme[1] },
  quest: { en: quest[0], th: quest[1] },
  district,
});

export const SEASON_QUESTS: SeasonQuest[] = [
  q(1, "🌅", ["New Year, cool season", "ปีใหม่ หน้าหนาว"],
    ["Start the year with a sunrise walk on the Benjakitti skywalk, then swap one goal each for the year", "เริ่มปีใหม่ด้วยการเดินรับแสงเช้าบนสกายวอล์กสวนเบญจกิติ แล้วแลกเป้าหมายปีนี้กันคนละข้อ"], "khlong_toei"),
  q(2, "🏮", ["Lunar New Year and Valentine's for friends", "ตรุษจีนและวาเลนไทน์ของเพื่อน"],
    ["Walk the red lanterns of Yaowarat for Lunar New Year and share one sweet you've never tried", "เดินชมโคมแดงเยาวราชช่วงตรุษจีน แล้วแบ่งกันกินขนมที่ยังไม่เคยลองหนึ่งอย่าง"], "samphanthawong"),
  q(3, "🪁", ["Kite season", "หน้าว่าว"],
    ["Fly a kite together at Sanam Luang in kite season, then cool off by the river at Tha Chang", "เล่นว่าวด้วยกันที่สนามหลวงช่วงหน้าว่าว แล้วไปนั่งรับลมริมน้ำท่าช้าง"], "phra_nakhon"),
  q(4, "💦", ["Songkran", "สงกรานต์"],
    ["Join the Songkran water fun on Silom Road with water guns and plenty of sunscreen", "ร่วมเล่นน้ำสงกรานต์ที่ถนนสีลม พร้อมปืนฉีดน้ำและครีมกันแดดเต็มที่"], "bang_rak"),
  q(5, "🥭", ["Mango season", "หน้ามะม่วง"],
    ["Taste mango sticky rice side by side at Or Tor Kor market and pick the best one", "ชิมข้าวเหนียวมะม่วงหลายร้านที่ตลาด อ.ต.ก. แล้วเลือกร้านที่อร่อยที่สุด"], "chatuchak"),
  q(6, "🌧️", ["Rainy season begins", "เข้าหน้าฝน"],
    ["Wait out a rainy afternoon at BACC: pick one artwork each and tell the other why", "หลบฝนช่วงบ่ายที่หอศิลป์กรุงเทพฯ เลือกงานศิลปะคนละชิ้น แล้วเล่าให้กันฟังว่าทำไม"], "pathum_wan"),
  q(7, "🌿", ["Mid-year, somewhere new", "กลางปี ไปที่ใหม่"],
    ["Walk Bangkok's only coastline on the Bang Khun Thian seaside path, then share a seafood lunch", "เดินเลียบชายฝั่งเดียวของกรุงเทพฯ ที่บางขุนเทียน แล้วกินอาหารทะเลมื้อเที่ยงด้วยกัน"], "bang_khun_thian"),
  q(8, "🌼", ["Mother's Day month", "เดือนวันแม่"],
    ["Pick jasmine garlands at Pak Khlong Talat at dawn for someone who raised you", "ไปเลือกพวงมาลัยมะลิที่ปากคลองตลาดตอนเช้าตรู่ ให้คนที่เลี้ยงดูคุณมา"], "phra_nakhon"),
  q(9, "🍜", ["Late rainy season comfort food", "อาหารอุ่นท้องปลายฝน"],
    ["Race each other through bowls of boat noodles at the Victory Monument alley on a rainy evening", "แข่งกันกินก๋วยเตี๋ยวเรือที่ซอยอนุสาวรีย์ชัยฯ ในเย็นวันที่ฝนตก"], "ratchathewi"),
  q(10, "🟡", ["Vegetarian Festival", "เทศกาลกินเจ"],
    ["Follow the yellow flags through Yaowarat in Vegetarian Festival week and try three jay dishes", "เดินตามธงเหลืองในเยาวราชช่วงเทศกาลกินเจ แล้วลองอาหารเจสามอย่าง"], "samphanthawong"),
  q(11, "🪷", ["Loy Krathong", "ลอยกระทง"],
    ["Float an eco krathong together on the lake at Lumphini Park on Loy Krathong night", "ลอยกระทงรักษ์โลกด้วยกันที่บึงสวนลุมพินีในคืนลอยกระทง"], "pathum_wan"),
  q(12, "✨", ["Year-end lights", "ไฟส่งท้ายปี"],
    ["See the year-end light displays along the river at ICONSIAM and plan one thing to do together next year", "ชมไฟส่งท้ายปีริมแม่น้ำที่ไอคอนสยาม แล้ววางแผนสิ่งที่จะทำด้วยกันปีหน้าหนึ่งอย่าง"], "khlong_san"),
];

/** "M2026-10": the quest key for a month, in Bangkok time. */
export function monthKey(now: Date): string {
  const local = new Date(now.getTime() + 7 * 3600_000);
  return `M${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function seasonQuestFor(key: string): SeasonQuest | null {
  const m = /^M\d{4}-(\d{2})$/.exec(key);
  return m ? (SEASON_QUESTS.find((s) => s.month === Number(m[1])) ?? null) : null;
}
