/**
 * Fixed lists used across forms, filters and dashboards. Bilingual.
 */
type Opt = { value: string; th: string; en: string };
const o = (value: string, th: string, en: string): Opt => ({ value, th, en });

/** Bangkok's 50 districts (khet). */
export const DISTRICTS: Opt[] = [
  o("phra_nakhon", "พระนคร", "Phra Nakhon"),
  o("dusit", "ดุสิต", "Dusit"),
  o("nong_chok", "หนองจอก", "Nong Chok"),
  o("bang_rak", "บางรัก", "Bang Rak"),
  o("bang_khen", "บางเขน", "Bang Khen"),
  o("bang_kapi", "บางกะปิ", "Bang Kapi"),
  o("pathum_wan", "ปทุมวัน", "Pathum Wan"),
  o("pom_prap", "ป้อมปราบศัตรูพ่าย", "Pom Prap Sattru Phai"),
  o("phra_khanong", "พระโขนง", "Phra Khanong"),
  o("min_buri", "มีนบุรี", "Min Buri"),
  o("lat_krabang", "ลาดกระบัง", "Lat Krabang"),
  o("yan_nawa", "ยานนาวา", "Yan Nawa"),
  o("samphanthawong", "สัมพันธวงศ์", "Samphanthawong"),
  o("phaya_thai", "พญาไท", "Phaya Thai"),
  o("thon_buri", "ธนบุรี", "Thon Buri"),
  o("bangkok_yai", "บางกอกใหญ่", "Bangkok Yai"),
  o("huai_khwang", "ห้วยขวาง", "Huai Khwang"),
  o("khlong_san", "คลองสาน", "Khlong San"),
  o("taling_chan", "ตลิ่งชัน", "Taling Chan"),
  o("bangkok_noi", "บางกอกน้อย", "Bangkok Noi"),
  o("bang_khun_thian", "บางขุนเทียน", "Bang Khun Thian"),
  o("phasi_charoen", "ภาษีเจริญ", "Phasi Charoen"),
  o("nong_khaem", "หนองแขม", "Nong Khaem"),
  o("rat_burana", "ราษฎร์บูรณะ", "Rat Burana"),
  o("bang_phlat", "บางพลัด", "Bang Phlat"),
  o("din_daeng", "ดินแดง", "Din Daeng"),
  o("bueng_kum", "บึงกุ่ม", "Bueng Kum"),
  o("sathon", "สาทร", "Sathon"),
  o("bang_sue", "บางซื่อ", "Bang Sue"),
  o("chatuchak", "จตุจักร", "Chatuchak"),
  o("bang_kho_laem", "บางคอแหลม", "Bang Kho Laem"),
  o("prawet", "ประเวศ", "Prawet"),
  o("khlong_toei", "คลองเตย", "Khlong Toei"),
  o("suan_luang", "สวนหลวง", "Suan Luang"),
  o("chom_thong", "จอมทอง", "Chom Thong"),
  o("don_mueang", "ดอนเมือง", "Don Mueang"),
  o("ratchathewi", "ราชเทวี", "Ratchathewi"),
  o("lat_phrao", "ลาดพร้าว", "Lat Phrao"),
  o("watthana", "วัฒนา", "Watthana"),
  o("bang_khae", "บางแค", "Bang Khae"),
  o("lak_si", "หลักสี่", "Lak Si"),
  o("sai_mai", "สายไหม", "Sai Mai"),
  o("khan_na_yao", "คันนายาว", "Khan Na Yao"),
  o("saphan_sung", "สะพานสูง", "Saphan Sung"),
  o("wang_thonglang", "วังทองหลาง", "Wang Thonglang"),
  o("khlong_sam_wa", "คลองสามวา", "Khlong Sam Wa"),
  o("bang_na", "บางนา", "Bang Na"),
  o("thawi_watthana", "ทวีวัฒนา", "Thawi Watthana"),
  o("thung_khru", "ทุ่งครุ", "Thung Khru"),
  o("bang_bon", "บางบอน", "Bang Bon"),
];

export const INTERESTS: Opt[] = [
  o("food", "อาหาร", "Food"),
  o("running", "วิ่ง", "Running"),
  o("art", "ศิลปะ", "Art"),
  o("music", "ดนตรี", "Music"),
  o("pets", "สัตว์เลี้ยง", "Pets"),
  o("books", "หนังสือ", "Books"),
  o("volunteering", "อาสาสมัคร", "Volunteering"),
  o("city", "สำรวจเมือง", "City exploration"),
  o("games", "บอร์ดเกม", "Games"),
  o("sports", "กีฬา", "Sports"),
  o("culture", "วัฒนธรรม", "Culture"),
  o("nightlife", "ไนท์ไลฟ์", "Nightlife"),
  o("cafes", "คาเฟ่", "Cafés"),
  o("photography", "ถ่ายรูป", "Photography"),
  o("languages", "แลกเปลี่ยนภาษา", "Language exchange"),
];

export const SOCIAL_STYLES: Opt[] = [
  o("small_group", "กลุ่มเล็ก", "Small group"),
  o("big_group", "กลุ่มใหญ่", "Big group"),
  o("activity", "ทำกิจกรรมด้วยกัน", "Doing an activity together"),
  o("coffee_talk", "นั่งคุยกาแฟ", "Coffee and talk"),
  o("bring_friend", "ชวนเพื่อนมาด้วย", "Bring a friend"),
];

export const EVENT_STYLES: Opt[] = [
  o("weekday_evening", "เย็นวันธรรมดา", "Weekday evenings"),
  o("weekend_morning", "เช้าวันหยุด", "Weekend mornings"),
  o("weekend_afternoon", "บ่ายวันหยุด", "Weekend afternoons"),
  o("weekend_night", "คืนวันหยุด", "Weekend nights"),
];

export const LANGUAGES: Opt[] = [
  o("th", "ไทย", "Thai"),
  o("en", "อังกฤษ", "English"),
  o("zh", "จีน", "Chinese"),
  o("ja", "ญี่ปุ่น", "Japanese"),
  o("ko", "เกาหลี", "Korean"),
  o("my", "พม่า", "Burmese"),
  o("hi", "ฮินดี", "Hindi"),
  o("fr", "ฝรั่งเศส", "French"),
  o("de", "เยอรมัน", "German"),
];

/** Connection intents. "romance" is only offered to eligible Single users. */
export const INTENTS: Opt[] = [
  o("friends", "เพื่อนใหม่", "New friends"),
  o("activity-buddy", "เพื่อนทำกิจกรรม", "Activity buddies"),
  o("explore", "ขยายวงเพื่อนในกรุงเทพฯ", "Expand my Bangkok circle"),
];

export const RELATIONSHIP: Opt[] = [
  o("single", "โสด", "Single"),
  o("relationship", "มีแฟน", "In a relationship"),
  o("married", "แต่งงานแล้ว", "Married"),
  o("prefer_not", "ไม่ระบุ", "Prefer not to say"),
];

export const GENDER_IDENTITIES: Opt[] = [
  o("woman", "ผู้หญิง", "Woman"),
  o("man", "ผู้ชาย", "Man"),
  o("non-binary", "นอนไบนารี", "Non-binary"),
  o("self", "ระบุเอง", "Self-described"),
  o("prefer_not", "ไม่ระบุ", "Prefer not to say"),
];

export const EVENT_TAGS: Opt[] = [
  o("food", "อาหาร", "Food"),
  o("run", "วิ่ง", "Run"),
  o("walk", "เดินเล่น", "Walk"),
  o("culture", "วัฒนธรรม", "Culture"),
  o("art", "ศิลปะ", "Art"),
  o("volunteer", "อาสา", "Volunteer"),
  o("board_game", "บอร์ดเกม", "Board games"),
  o("workshop", "เวิร์กช็อป", "Workshop"),
  o("pets", "สัตว์เลี้ยง", "Pets"),
  o("language_exchange", "แลกเปลี่ยนภาษา", "Language exchange"),
  o("newcomers", "มาใหม่ในกรุงเทพฯ", "New to Bangkok"),
  o("queer_friendly", "เป็นมิตรกับ LGBTQ+", "Queer-friendly"),
  o("lgbtq_community", "ชุมชน LGBTQ+", "LGBTQ+ community"),
  o("english_friendly", "ใช้ภาษาอังกฤษได้", "English-friendly"),
  o("step_free", "ไม่มีขั้นบันได", "Step-free access"),
  o("city_quest", "ซิตี้เควสต์", "City Quest"),
  o("festival", "เทศกาล", "Festival go-together"),
  o("daytime", "กลางวัน", "Daytime"),
];

export const INTENSITY: Opt[] = [
  o("chill", "ชิล", "Chill"),
  o("social", "โซเชียล", "Social"),
  o("very_social", "โซเชียลมาก", "Very social"),
];

export const SIGNALS: Opt[] = [
  o("say_hi", "ทักได้เลย", "Say hi"),
  o("new_friends", "มาหาเพื่อนใหม่", "Here for new friends"),
  o("small_group", "ขอกลุ่มเล็ก ๆ", "Small group please"),
  o("talk_about", "คุยเรื่องนี้กับฉันได้", "Talk to me about…"),
  o("came_with_friend", "มากับเพื่อน", "I came with a friend"),
  o("open_to_spark", "เปิดใจให้ความรู้สึกดี ๆ", "Open to a spark"),
];

export const CHOICE_LABELS: Opt[] = [
  o("friend", "อยากเป็นเพื่อน", "Would like to be friends"),
  o("activity", "เพื่อนทำกิจกรรม", "Activity buddy"),
  o("again", "ยินดีเจอกันอีก", "Open to meeting again"),
  o("romance", "เปิดใจมากกว่าเพื่อน", "Open to something more"),
  o("none", "ไม่เลือก", "No action"),
];

export const REPORT_REASON_LABELS: Opt[] = [
  o("harassment", "การคุกคาม", "Harassment"),
  o("inappropriate_romantic", "พฤติกรรมเชิงชู้สาวที่ไม่เหมาะสม", "Inappropriate romantic behaviour"),
  o("misrepresented_relationship", "ให้ข้อมูลสถานะความสัมพันธ์ไม่จริง", "Misrepresented relationship status"),
  o("impersonation", "แอบอ้างตัวตน", "Impersonation"),
  o("spam_scam", "สแปม / หลอกลวง", "Spam / scam"),
  o("unsafe", "พฤติกรรมไม่ปลอดภัย", "Unsafe behaviour"),
  o("discrimination", "การเลือกปฏิบัติ", "Discrimination"),
  o("misgendering_outing", "เรียกเพศผิดโดยเจตนา / เปิดเผยตัวตน", "Misgendering / outing"),
  o("other", "อื่น ๆ", "Other"),
];

/**
 * VisitBangkok recommended routes (visit.bangkok.go.th), used as City Quest
 * presets in the admin event form.
 */
export const VISITBANGKOK_ROUTES: (Opt & { district: string; venue: string; tags: string[] })[] = [
  { ...o("rattanakosin", "เส้นทางสุดคลาสสิก ย่านเกาะรัตนโกสินทร์", "Classic Rattanakosin Island route"), district: "phra_nakhon", venue: "Rattanakosin Island", tags: ["city_quest", "culture", "walk"] },
  { ...o("little_india", "ย่าน Little India พาหุรัด", "Little India (Phahurat)"), district: "phra_nakhon", venue: "Phahurat", tags: ["city_quest", "food", "walk"] },
  { ...o("charoenkrung", "ย่านเจริญกรุง-ตลาดน้อย สายครีเอทีฟ", "Charoenkrung–Talat Noi creative route"), district: "bang_rak", venue: "Charoenkrung–Talat Noi", tags: ["city_quest", "art", "walk"] },
  { ...o("bang_luang", "บ้านศิลปิน คลองบางหลวง", "Artist's House, Khlong Bang Luang"), district: "phasi_charoen", venue: "Baan Silapin, Khlong Bang Luang", tags: ["city_quest", "art", "culture"] },
  { ...o("yaowarat", "ถนนเยาวราช สายกิน", "Yaowarat food walk"), district: "samphanthawong", venue: "Yaowarat Road", tags: ["city_quest", "food", "walk"] },
  { ...o("talat_phlu", "ตลาดพลู", "Talat Phlu market"), district: "thon_buri", venue: "Talat Phlu", tags: ["city_quest", "food", "culture"] },
];

export function label(list: Opt[], value: string | null | undefined, lang: "th" | "en"): string {
  if (!value) return "";
  const found = list.find((x) => x.value === value);
  return found ? (lang === "en" ? found.en : found.th) : value;
}

export function values(list: Opt[]): string[] {
  return list.map((x) => x.value);
}
