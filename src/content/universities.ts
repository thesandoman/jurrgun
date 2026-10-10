/**
 * Universities worldwide, for the education picker and "same university"
 * matching. About 10,000 names (src/content/universities.generated.ts) plus
 * Thai universities the open list misses, Thai-language names and the
 * abbreviations people actually type (KMITL, ABAC, MUIC…).
 *
 * The browser never downloads the list: it asks /universities/search for the
 * top few matches as someone types. A pick is stored as a stable id
 * ("th:chulalongkorn-university"), so two members match exactly even if one
 * searched in Thai and the other in English.
 *
 * Pure module: no database, no Hono.
 */
import { UNIVERSITY_ROWS } from "./universities.generated";

/** Thai universities missing from the open list. */
const THAI_EXTRA = [
  "Bangkokthonburi University",
  "Bansomdejchaopraya Rajabhat University",
  "Chandrakasem Rajabhat University",
  "Christian University of Thailand",
  "Chulabhorn Royal Academy",
  "Dhonburi Rajabhat University",
  "Dusit Thani College",
  "Navamindradhiraj University",
  "North Bangkok University",
  "Panyapiwat Institute of Management",
  "Phranakhon Rajabhat University",
  "Pibulsongkram Rajabhat University",
  "Princess of Naradhiwas University",
  "Rajamangala University of Technology Isan",
  "Rajamangala University of Technology Krungthep",
  "Rajamangala University of Technology Rattanakosin",
  "Rajamangala University of Technology Srivijaya",
  "Rajamangala University of Technology Suvarnabhumi",
  "Rajamangala University of Technology Tawan-ok",
  "Rajamangala University of Technology Thanyaburi",
  "Saint Louis College",
  "Southeast Bangkok University",
  "Suan Sunandha Rajabhat University",
  "Thai-Nichi Institute of Technology",
  "Thonburi University",
  "University of Phayao",
];

/** Thai names (shown in Thai, and searchable). Keyed by the English name. */
const THAI_NAMES: Record<string, string> = {
  "Chulalongkorn University": "จุฬาลงกรณ์มหาวิทยาลัย",
  "Thammasat University": "มหาวิทยาลัยธรรมศาสตร์",
  "Mahidol University": "มหาวิทยาลัยมหิดล",
  "Mahidol University International College": "วิทยาลัยนานาชาติ มหาวิทยาลัยมหิดล",
  "Kasetsart University": "มหาวิทยาลัยเกษตรศาสตร์",
  "Chiang Mai University": "มหาวิทยาลัยเชียงใหม่",
  "Khon Kaen University": "มหาวิทยาลัยขอนแก่น",
  "Prince of Songkla University": "มหาวิทยาลัยสงขลานครินทร์",
  "King Mongkut's Institute of Technology Ladkrabang": "สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง",
  "King Mongkut's University of Technology Thonburi": "มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี",
  "King Mongkut's University of Technology North Bangkok": "มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ",
  "Silpakorn University": "มหาวิทยาลัยศิลปากร",
  "Srinakharinwirot University": "มหาวิทยาลัยศรีนครินทรวิโรฒ",
  "Ramkhamhaeng University": "มหาวิทยาลัยรามคำแหง",
  "Sukhothai Thammathirat Open University": "มหาวิทยาลัยสุโขทัยธรรมาธิราช",
  "National Institute of Development Administration": "สถาบันบัณฑิตพัฒนบริหารศาสตร์",
  "Burapha University": "มหาวิทยาลัยบูรพา",
  "Naresuan University": "มหาวิทยาลัยนเรศวร",
  "Mae Fah Luang University": "มหาวิทยาลัยแม่ฟ้าหลวง",
  "Walailak University": "มหาวิทยาลัยวลัยลักษณ์",
  "Suranaree University of Technology": "มหาวิทยาลัยเทคโนโลยีสุรนารี",
  "Mahasarakham University": "มหาวิทยาลัยมหาสารคาม",
  "Ubonratchathani University": "มหาวิทยาลัยอุบลราชธานี",
  "Thaksin University": "มหาวิทยาลัยทักษิณ",
  "Maejo University": "มหาวิทยาลัยแม่โจ้",
  "University of Phayao": "มหาวิทยาลัยพะเยา",
  "Assumption University of Thailand": "มหาวิทยาลัยอัสสัมชัญ",
  "Bangkok University": "มหาวิทยาลัยกรุงเทพ",
  "Rangsit University": "มหาวิทยาลัยรังสิต",
  "Sripatum University": "มหาวิทยาลัยศรีปทุม",
  "Siam University": "มหาวิทยาลัยสยาม",
  "University of the Thai Chamber of Commerce": "มหาวิทยาลัยหอการค้าไทย",
  "Dhurakijpundit University": "มหาวิทยาลัยธุรกิจบัณฑิตย์",
  "Huachiew Chalermprakiet University": "มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ",
  "Kasem Bundit University": "มหาวิทยาลัยเกษมบัณฑิต",
  "Stamford International University": "มหาวิทยาลัยแสตมฟอร์ด",
  "Mahanakorn University of Technology": "มหาวิทยาลัยเทคโนโลยีมหานคร",
  "Asian Institute of Technology": "สถาบันเทคโนโลยีแห่งเอเชีย",
  "Navamindradhiraj University": "มหาวิทยาลัยนวมินทราธิราช",
  "Panyapiwat Institute of Management": "สถาบันการจัดการปัญญาภิวัฒน์",
  "Thai-Nichi Institute of Technology": "สถาบันเทคโนโลยีไทย-ญี่ปุ่น",
  "Suan Dusit Rajabhat University": "มหาวิทยาลัยราชภัฏสวนดุสิต",
  "Suan Sunandha Rajabhat University": "มหาวิทยาลัยราชภัฏสวนสุนันทา",
  "Chandrakasem Rajabhat University": "มหาวิทยาลัยราชภัฏจันทรเกษม",
  "Phranakhon Rajabhat University": "มหาวิทยาลัยราชภัฏพระนคร",
  "Dhonburi Rajabhat University": "มหาวิทยาลัยราชภัฏธนบุรี",
  "Bansomdejchaopraya Rajabhat University": "มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา",
  "Rajamangala University of Technology Thanyaburi": "มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี",
  "Rajamangala University of Technology Krungthep": "มหาวิทยาลัยเทคโนโลยีราชมงคลกรุงเทพ",
  "Rajamangala University of Technology, Phra Nakhon": "มหาวิทยาลัยเทคโนโลยีราชมงคลพระนคร",
  "Rajamangala University of Technology Rattanakosin": "มหาวิทยาลัยเทคโนโลยีราชมงคลรัตนโกสินทร์",
  "Mahachulalongkorn Buddhist University": "มหาวิทยาลัยมหาจุฬาลงกรณราชวิทยาลัย",
  "Mahamakut Buddhist University": "มหาวิทยาลัยมหามกุฏราชวิทยาลัย",
};

/** What people actually type. Keyed by the English name; lower case. */
const ALIASES: Record<string, string[]> = {
  "Chulalongkorn University": ["chula", "cu", "จุฬา", "จุฬาฯ"],
  "Thammasat University": ["tu", "ธรรมศาสตร์", "มธ"],
  "Mahidol University": ["mu", "มหิดล"],
  "Mahidol University International College": ["muic"],
  "Kasetsart University": ["ku", "เกษตร", "มก"],
  "King Mongkut's Institute of Technology Ladkrabang": ["kmitl", "ลาดกระบัง", "สจล"],
  "King Mongkut's University of Technology Thonburi": ["kmutt", "บางมด", "มจธ"],
  "King Mongkut's University of Technology North Bangkok": ["kmutnb", "พระนครเหนือ", "มจพ"],
  "Srinakharinwirot University": ["swu", "มศว"],
  "Sukhothai Thammathirat Open University": ["stou", "มสธ"],
  "National Institute of Development Administration": ["nida", "นิด้า"],
  "Assumption University of Thailand": ["abac", "au", "เอแบค"],
  "University of the Thai Chamber of Commerce": ["utcc", "หอการค้า"],
  "Asian Institute of Technology": ["ait"],
  "Prince of Songkla University": ["psu", "มอ"],
  "Khon Kaen University": ["kku", "มข"],
  "Ramkhamhaeng University": ["ru", "ราม", "รามคำแหง"],
  "Panyapiwat Institute of Management": ["pim"],
  "Thai-Nichi Institute of Technology": ["tni"],
  "Massachusetts Institute of Technology": ["mit"],
  "University of California, Los Angeles": ["ucla"],
  "University of California, Berkeley": ["berkeley", "ucb"],
  "London School of Economics and Political Science": ["lse"],
  "University College London": ["ucl"],
  "National University of Singapore": ["nus"],
  "Nanyang Technological University": ["ntu"],
};

export type University = { id: string; name: string; cc: string; th?: string; search: string };

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const uniId = (name: string, cc: string) => `${cc.toLowerCase()}:${fold(name).replace(/ /g, "-")}`;

const ALL: University[] = (() => {
  const rows: [string, string][] = [...UNIVERSITY_ROWS, ...THAI_EXTRA.map((n): [string, string] => [n, "TH"])];
  const seen = new Set<string>();
  const out: University[] = [];
  for (const [name, cc] of rows) {
    const id = uniId(name, cc);
    if (seen.has(id)) continue;
    seen.add(id);
    const th = cc === "TH" ? THAI_NAMES[name] : undefined;
    out.push({ id, name, cc, th, search: ` ${fold(name)} ${th ?? ""} ${(ALIASES[name] ?? []).join(" ")} ` });
  }
  return out;
})();
const BY_ID = new Map(ALL.map((u) => [u.id, u]));

export const universityById = (id: string | undefined | null): University | undefined => (id ? BY_ID.get(id) : undefined);

/** The name to show: Thai when the reader reads Thai and we have one. */
export const universityName = (u: University, lang: "th" | "en") => (lang === "th" && u.th ? u.th : u.name);

/** Exact name (either language) → university, for forms posted without JS. */
export function universityByName(name: string): University | undefined {
  const f = fold(name);
  if (!f) return undefined;
  return ALL.find((u) => fold(u.name) === f || (u.th && fold(u.th) === f));
}

/**
 * Top matches for what someone typed. Every word must start a word of the
 * name (or match a Thai name or alias). Bangkok first: Thai universities rank
 * above others, then whole-name prefixes, then shorter names.
 */
export function searchUniversities(q: string, limit = 8): University[] {
  const words = fold(q).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const scored: [number, University][] = [];
  for (const u of ALL) {
    if (!words.every((w) => u.search.includes(` ${w}`) || (u.th && u.th.includes(w)))) continue;
    let score = 0;
    if (u.cc === "TH") score += 3;
    const whole = fold(q);
    if (fold(u.name).startsWith(whole) || (u.th ?? "").startsWith(whole)) score += 2;
    if ((ALIASES[u.name] ?? []).includes(whole)) score += 5;
    scored.push([score, u]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length);
  return scored.slice(0, limit).map(([, u]) => u);
}
