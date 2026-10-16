/**
 * Bangkok rail stations a host can pick as the nearest to their venue: BTS,
 * MRT and the Airport Rail Link. A fixed list, so the event page can say
 * "BTS อโศก เดิน 5 นาที / BTS Asok, 5 min walk" in both languages without
 * trusting free text. Keys are stable: they are stored on social_events.nearest_station.
 *
 * An interchange inside one system is one station with several lines (BTS
 * Siam, MRT Tao Poon). The same name in two systems is two stations (BTS Bang
 * Wa and MRT Bang Wa), because the walk and the entrance differ.
 */

export type RailSystem = "bts" | "mrt" | "arl";
export type RailLine = "bts_sukhumvit" | "bts_silom" | "bts_gold" | "mrt_blue" | "mrt_purple" | "mrt_yellow" | "mrt_pink" | "arl";

export type Station = { key: string; th: string; en: string; system: RailSystem; lines: RailLine[] };

export const LINES: Record<RailLine, { th: string; en: string; system: RailSystem }> = {
  bts_sukhumvit: { th: "BTS สายสุขุมวิท", en: "BTS Sukhumvit Line", system: "bts" },
  bts_silom: { th: "BTS สายสีลม", en: "BTS Silom Line", system: "bts" },
  bts_gold: { th: "สายสีทอง", en: "Gold Line", system: "bts" },
  mrt_blue: { th: "MRT สายสีน้ำเงิน", en: "MRT Blue Line", system: "mrt" },
  mrt_purple: { th: "MRT สายสีม่วง", en: "MRT Purple Line", system: "mrt" },
  mrt_yellow: { th: "MRT สายสีเหลือง", en: "MRT Yellow Line", system: "mrt" },
  mrt_pink: { th: "MRT สายสีชมพู", en: "MRT Pink Line", system: "mrt" },
  arl: { th: "แอร์พอร์ต เรล ลิงก์", en: "Airport Rail Link", system: "arl" },
};

/** What a station is called before its name: "BTS อโศก", "ARL มักกะสัน". */
export const SYSTEM_PREFIX: Record<RailSystem, string> = { bts: "BTS", mrt: "MRT", arl: "ARL" };

// [Thai, English], in line order.
const RAW: Record<RailLine, [string, string][]> = {
  bts_sukhumvit: [
    ["คูคต", "Khu Khot"],
    ["แยก คปอ.", "Yaek Kor Por Aor"],
    ["พิพิธภัณฑ์กองทัพอากาศ", "Royal Thai Air Force Museum"],
    ["โรงพยาบาลภูมิพลอดุลยเดช", "Bhumibol Adulyadej Hospital"],
    ["สะพานใหม่", "Saphan Mai"],
    ["สายหยุด", "Sai Yud"],
    ["พหลโยธิน 59", "Phahon Yothin 59"],
    ["วัดพระศรีมหาธาตุ", "Wat Phra Sri Mahathat"],
    ["กรมทหารราบที่ 11", "11th Infantry Regiment"],
    ["บางบัว", "Bang Bua"],
    ["กรมป่าไม้", "Royal Forest Department"],
    ["มหาวิทยาลัยเกษตรศาสตร์", "Kasetsart University"],
    ["เสนานิคม", "Sena Nikhom"],
    ["รัชโยธิน", "Ratchayothin"],
    ["พหลโยธิน 24", "Phahon Yothin 24"],
    ["ห้าแยกลาดพร้าว", "Ha Yaek Lat Phrao"],
    ["หมอชิต", "Mo Chit"],
    ["สะพานควาย", "Saphan Khwai"],
    ["อารีย์", "Ari"],
    ["สนามเป้า", "Sanam Pao"],
    ["อนุสาวรีย์ชัยสมรภูมิ", "Victory Monument"],
    ["พญาไท", "Phaya Thai"],
    ["ราชเทวี", "Ratchathewi"],
    ["สยาม", "Siam"],
    ["ชิดลม", "Chit Lom"],
    ["เพลินจิต", "Phloen Chit"],
    ["นานา", "Nana"],
    ["อโศก", "Asok"],
    ["พร้อมพงษ์", "Phrom Phong"],
    ["ทองหล่อ", "Thong Lo"],
    ["เอกมัย", "Ekkamai"],
    ["พระโขนง", "Phra Khanong"],
    ["อ่อนนุช", "On Nut"],
    ["บางจาก", "Bang Chak"],
    ["ปุณณวิถี", "Punnawithi"],
    ["อุดมสุข", "Udom Suk"],
    ["บางนา", "Bang Na"],
    ["แบริ่ง", "Bearing"],
    ["สำโรง", "Samrong"],
    ["ปู่เจ้า", "Pu Chao"],
    ["ช้างเอราวัณ", "Chang Erawan"],
    ["โรงเรียนนายเรือ", "Royal Thai Naval Academy"],
    ["ปากน้ำ", "Pak Nam"],
    ["ศรีนครินทร์", "Srinagarindra"],
    ["แพรกษา", "Phraek Sa"],
    ["สายลวด", "Sai Luat"],
    ["เคหะฯ", "Kheha"],
  ],
  bts_silom: [
    ["สนามกีฬาแห่งชาติ", "National Stadium"],
    ["สยาม", "Siam"],
    ["ราชดำริ", "Ratchadamri"],
    ["ศาลาแดง", "Sala Daeng"],
    ["ช่องนนทรี", "Chong Nonsi"],
    ["เซนต์หลุยส์", "Saint Louis"],
    ["สุรศักดิ์", "Surasak"],
    ["สะพานตากสิน", "Saphan Taksin"],
    ["กรุงธนบุรี", "Krung Thon Buri"],
    ["วงเวียนใหญ่", "Wongwian Yai"],
    ["โพธิ์นิมิตร", "Pho Nimit"],
    ["ตลาดพลู", "Talat Phlu"],
    ["วุฒากาศ", "Wutthakat"],
    ["บางหว้า", "Bang Wa"],
  ],
  bts_gold: [
    ["กรุงธนบุรี", "Krung Thon Buri"],
    ["เจริญนคร", "Charoen Nakhon"],
    ["คลองสาน", "Khlong San"],
  ],
  mrt_blue: [
    ["ท่าพระ", "Tha Phra"],
    ["จรัญฯ 13", "Charan 13"],
    ["ไฟฉาย", "Fai Chai"],
    ["บางขุนนนท์", "Bang Khun Non"],
    ["บางยี่ขัน", "Bang Yi Khan"],
    ["สิรินธร", "Sirindhorn"],
    ["บางพลัด", "Bang Phlat"],
    ["บางอ้อ", "Bang O"],
    ["บางโพ", "Bang Pho"],
    ["เตาปูน", "Tao Poon"],
    ["บางซื่อ", "Bang Sue"],
    ["กำแพงเพชร", "Kamphaeng Phet"],
    ["สวนจตุจักร", "Chatuchak Park"],
    ["พหลโยธิน", "Phahon Yothin"],
    ["ลาดพร้าว", "Lat Phrao"],
    ["รัชดาภิเษก", "Ratchadaphisek"],
    ["สุทธิสาร", "Sutthisan"],
    ["ห้วยขวาง", "Huai Khwang"],
    ["ศูนย์วัฒนธรรมแห่งประเทศไทย", "Thailand Cultural Centre"],
    ["พระราม 9", "Phra Ram 9"],
    ["เพชรบุรี", "Phetchaburi"],
    ["สุขุมวิท", "Sukhumvit"],
    ["ศูนย์การประชุมแห่งชาติสิริกิติ์", "Queen Sirikit National Convention Centre"],
    ["คลองเตย", "Khlong Toei"],
    ["ลุมพินี", "Lumphini"],
    ["สีลม", "Si Lom"],
    ["สามย่าน", "Sam Yan"],
    ["หัวลำโพง", "Hua Lamphong"],
    ["วัดมังกร", "Wat Mangkon"],
    ["สามยอด", "Sam Yot"],
    ["สนามไชย", "Sanam Chai"],
    ["อิสรภาพ", "Itsaraphap"],
    ["บางไผ่", "Bang Phai"],
    ["บางหว้า", "Bang Wa"],
    ["เพชรเกษม 48", "Phetkasem 48"],
    ["ภาษีเจริญ", "Phasi Charoen"],
    ["บางแค", "Bang Khae"],
    ["หลักสอง", "Lak Song"],
  ],
  mrt_purple: [
    ["คลองบางไผ่", "Khlong Bang Phai"],
    ["ตลาดบางใหญ่", "Talad Bang Yai"],
    ["สามแยกบางใหญ่", "Sam Yaek Bang Yai"],
    ["บางพลู", "Bang Phlu"],
    ["บางรักใหญ่", "Bang Rak Yai"],
    ["บางรักน้อยท่าอิฐ", "Bang Rak Noi Tha It"],
    ["ไทรม้า", "Sai Ma"],
    ["สะพานพระนั่งเกล้า", "Phra Nang Klao Bridge"],
    ["แยกนนทบุรี 1", "Yaek Nonthaburi 1"],
    ["บางกระสอ", "Bang Krasor"],
    ["ศูนย์ราชการนนทบุรี", "Nonthaburi Civic Center"],
    ["กระทรวงสาธารณสุข", "Ministry of Public Health"],
    ["แยกติวานนท์", "Yaek Tiwanon"],
    ["วงศ์สว่าง", "Wong Sawang"],
    ["บางซ่อน", "Bang Son"],
    ["เตาปูน", "Tao Poon"],
  ],
  mrt_yellow: [
    ["ลาดพร้าว", "Lat Phrao"],
    ["ภาวนา", "Phawana"],
    ["โชคชัย 4", "Chok Chai 4"],
    ["ลาดพร้าว 71", "Lat Phrao 71"],
    ["ลาดพร้าว 83", "Lat Phrao 83"],
    ["มหาดไทย", "Mahat Thai"],
    ["ลาดพร้าว 101", "Lat Phrao 101"],
    ["บางกะปิ", "Bang Kapi"],
    ["แยกลำสาลี", "Yaek Lam Sali"],
    ["ศรีกรีฑา", "Si Kritha"],
    ["หัวหมาก", "Hua Mak"],
    ["กลันตัน", "Kalantan"],
    ["ศรีนุช", "Si Nut"],
    ["ศรีนครินทร์ 38", "Srinagarindra 38"],
    ["สวนหลวง ร.9", "Suan Luang Rama IX"],
    ["ศรีอุดม", "Si Udom"],
    ["ศรีเอี่ยม", "Si Iam"],
    ["ศรีลาซาล", "Si La Salle"],
    ["ศรีแบริ่ง", "Si Bearing"],
    ["ศรีด่าน", "Si Dan"],
    ["ศรีเทพา", "Si Thepha"],
    ["ทิพวัล", "Thipphawan"],
    ["สำโรง", "Samrong"],
  ],
  mrt_pink: [
    ["ศูนย์ราชการนนทบุรี", "Nonthaburi Civic Center"],
    ["แคราย", "Khae Rai"],
    ["สนามบินน้ำ", "Sanambin Nam"],
    ["สามัคคี", "Samakkhi"],
    ["กรมชลประทาน", "Royal Irrigation Department"],
    ["แยกปากเกร็ด", "Yaek Pak Kret"],
    ["เลี่ยงเมืองปากเกร็ด", "Pak Kret Bypass"],
    ["แจ้งวัฒนะ ปากเกร็ด 28", "Chaeng Watthana Pak Kret 28"],
    ["ศรีรัช", "Si Rat"],
    ["เมืองทองธานี", "Muang Thong Thani"],
    ["แจ้งวัฒนะ 14", "Chaeng Watthana 14"],
    ["ศูนย์ราชการเฉลิมพระเกียรติ", "Government Complex"],
    ["โทรคมนาคมแห่งชาติ", "National Telecom"],
    ["หลักสี่", "Lak Si"],
    ["ราชภัฏพระนคร", "Rajabhat Phranakhon"],
    ["วัดพระศรีมหาธาตุ", "Wat Phra Sri Mahathat"],
    ["รามอินทรา 3", "Ram Inthra 3"],
    ["ลาดปลาเค้า", "Lat Pla Khao"],
    ["รามอินทรา กม.4", "Ram Inthra Km 4"],
    ["มัยลาภ", "Maiyalap"],
    ["วัชรพล", "Vacharaphol"],
    ["รามอินทรา กม.6", "Ram Inthra Km 6"],
    ["คู้บอน", "Khu Bon"],
    ["รามอินทรา กม.9", "Ram Inthra Km 9"],
    ["วงแหวนรามอินทรา", "Outer Ring Road Ram Inthra"],
    ["นพรัตน์", "Nopparat"],
    ["บางชัน", "Bang Chan"],
    ["เศรษฐบุตรบำเพ็ญ", "Setthabutbamphen"],
    ["ตลาดมีนบุรี", "Min Buri Market"],
    ["มีนบุรี", "Min Buri"],
  ],
  arl: [
    ["พญาไท", "Phaya Thai"],
    ["ราชปรารภ", "Ratchaprarop"],
    ["มักกะสัน", "Makkasan"],
    ["รามคำแหง", "Ramkhamhaeng"],
    ["หัวหมาก", "Hua Mak"],
    ["บ้านทับช้าง", "Ban Thap Chang"],
    ["ลาดกระบัง", "Lat Krabang"],
    ["สุวรรณภูมิ", "Suvarnabhumi"],
  ],
};

const slug = (en: string) => en.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function build(): Station[] {
  const byKey = new Map<string, Station>();
  for (const line of Object.keys(RAW) as RailLine[]) {
    const system = LINES[line].system;
    for (const [th, en] of RAW[line]) {
      const key = `${system}_${slug(en)}`;
      const had = byKey.get(key);
      if (had) {
        if (!had.lines.includes(line)) had.lines.push(line);
      } else byKey.set(key, { key, th, en, system, lines: [line] });
    }
  }
  return [...byKey.values()];
}

export const STATIONS: readonly Station[] = build();
const BY_KEY = new Map(STATIONS.map((s) => [s.key, s]));

export const stationByKey = (key: string | null | undefined): Station | null => (key ? (BY_KEY.get(key) ?? null) : null);
export const isStationKey = (key: string): boolean => BY_KEY.has(key);

/** "BTS อโศก" / "BTS Asok". */
export function stationName(s: Station, lang: "th" | "en"): string {
  return `${SYSTEM_PREFIX[s.system]} ${lang === "en" ? s.en : s.th}`;
}

/** The longest walk a host can enter, in minutes. */
export const WALK_MAX = 60;

/**
 * "BTS อโศก เดิน 5 นาที" / "BTS Asok, 5 min walk"; just the station when no
 * walk is given. Null when there is no known station.
 */
export function stationLine(key: string | null | undefined, walkMinutes: number | null | undefined, lang: "th" | "en"): string | null {
  const s = stationByKey(key);
  if (!s) return null;
  const name = stationName(s, lang);
  if (walkMinutes == null || walkMinutes < 0 || walkMinutes > WALK_MAX) return name;
  if (walkMinutes === 0) return lang === "en" ? `${name}, right outside` : `${name} ออกมาก็ถึง`;
  return lang === "en" ? `${name}, ${walkMinutes} min walk` : `${name} เดิน ${walkMinutes} นาที`;
}

/** Stations grouped by line for a picker (an interchange shows under each of its lines). */
export function stationsByLine(): { line: RailLine; th: string; en: string; stations: Station[] }[] {
  return (Object.keys(RAW) as RailLine[]).map((line) => ({
    line,
    th: LINES[line].th,
    en: LINES[line].en,
    stations: RAW[line].map(([, en]) => BY_KEY.get(`${LINES[line].system}_${slug(en)}`)!),
  }));
}
