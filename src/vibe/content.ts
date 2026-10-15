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
