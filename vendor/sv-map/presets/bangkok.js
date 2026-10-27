/**
 * Bangkok preset: where the map starts, how far it may pan, and the 50 districts.
 *
 * District positions are the district offices (สำนักงานเขต) from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL; amenity=townhall, fetched 2026-09-28).
 * Wang Thonglang's office isn't in OpenStreetMap, so its position is null: show
 * those items in a list instead of guessing a spot.
 */

/** Map start: Democracy Monument area. [lat, lng] */
export const BANGKOK_CENTER = [13.7563, 100.5018];
export const BANGKOK_ZOOM = 10.6;
/** Bangkok with a margin, for ignoring mistyped links. */
export const BANGKOK_BOUNDS = { south: 13.45, west: 100.3, north: 14.0, east: 100.95 };
/** How far the map may pan (a little wider than the city). */
export const BANGKOK_PAN_LIMIT = { south: 13.35, west: 100.15, north: 14.15, east: 101.1 };

/** @type {{ id: string, th: string, en: string, lat: number | null, lng: number | null }[]} */
export const BANGKOK_DISTRICTS = [
  { id: "phra_nakhon", th: "พระนคร", en: "Phra Nakhon", lat: 13.764582, lng: 100.498843 },
  { id: "dusit", th: "ดุสิต", en: "Dusit", lat: 13.777082, lng: 100.52055 },
  { id: "nong_chok", th: "หนองจอก", en: "Nong Chok", lat: 13.855728, lng: 100.862571 },
  { id: "bang_rak", th: "บางรัก", en: "Bang Rak", lat: 13.730649, lng: 100.523651 },
  { id: "bang_khen", th: "บางเขน", en: "Bang Khen", lat: 13.873269, lng: 100.596215 },
  { id: "bang_kapi", th: "บางกะปิ", en: "Bang Kapi", lat: 13.765588, lng: 100.647692 },
  { id: "pathum_wan", th: "ปทุมวัน", en: "Pathum Wan", lat: 13.74475, lng: 100.522179 },
  { id: "pom_prap", th: "ป้อมปราบศัตรูพ่าย", en: "Pom Prap Sattru Phai", lat: 13.758176, lng: 100.513137 },
  { id: "phra_khanong", th: "พระโขนง", en: "Phra Khanong", lat: 13.702093, lng: 100.601768 },
  { id: "min_buri", th: "มีนบุรี", en: "Min Buri", lat: 13.813794, lng: 100.731645 },
  { id: "lat_krabang", th: "ลาดกระบัง", en: "Lat Krabang", lat: 13.723446, lng: 100.783931 },
  { id: "yan_nawa", th: "ยานนาวา", en: "Yan Nawa", lat: 13.696192, lng: 100.542299 },
  { id: "samphanthawong", th: "สัมพันธวงศ์", en: "Samphanthawong", lat: 13.731564, lng: 100.513795 },
  { id: "phaya_thai", th: "พญาไท", en: "Phaya Thai", lat: 13.77983, lng: 100.542522 },
  { id: "thon_buri", th: "ธนบุรี", en: "Thon Buri", lat: 13.724935, lng: 100.485677 },
  { id: "bangkok_yai", th: "บางกอกใหญ่", en: "Bangkok Yai", lat: 13.72339, lng: 100.476194 },
  { id: "huai_khwang", th: "ห้วยขวาง", en: "Huai Khwang", lat: 13.776676, lng: 100.579435 },
  { id: "khlong_san", th: "คลองสาน", en: "Khlong San", lat: 13.730614, lng: 100.509205 },
  { id: "taling_chan", th: "ตลิ่งชัน", en: "Taling Chan", lat: 13.776946, lng: 100.456321 },
  { id: "bangkok_noi", th: "บางกอกน้อย", en: "Bangkok Noi", lat: 13.762778, lng: 100.478104 },
  { id: "bang_khun_thian", th: "บางขุนเทียน", en: "Bang Khun Thian", lat: 13.660896, lng: 100.43542 },
  { id: "phasi_charoen", th: "ภาษีเจริญ", en: "Phasi Charoen", lat: 13.714713, lng: 100.436993 },
  { id: "nong_khaem", th: "หนองแขม", en: "Nong Khaem", lat: 13.705511, lng: 100.34918 },
  { id: "rat_burana", th: "ราษฎร์บูรณะ", en: "Rat Burana", lat: 13.682062, lng: 100.505679 },
  { id: "bang_phlat", th: "บางพลัด", en: "Bang Phlat", lat: 13.794049, lng: 100.504919 },
  { id: "din_daeng", th: "ดินแดง", en: "Din Daeng", lat: 13.769931, lng: 100.553162 },
  { id: "bueng_kum", th: "บึงกุ่ม", en: "Bueng Kum", lat: 13.785424, lng: 100.669524 },
  { id: "sathon", th: "สาทร", en: "Sathon", lat: 13.708099, lng: 100.526165 },
  { id: "bang_sue", th: "บางซื่อ", en: "Bang Sue", lat: 13.809666, lng: 100.537371 },
  { id: "chatuchak", th: "จตุจักร", en: "Chatuchak", lat: 13.828777, lng: 100.559936 },
  { id: "bang_kho_laem", th: "บางคอแหลม", en: "Bang Kho Laem", lat: 13.693018, lng: 100.502372 },
  { id: "prawet", th: "ประเวศ", en: "Prawet", lat: 13.717059, lng: 100.69472 },
  { id: "khlong_toei", th: "คลองเตย", en: "Khlong Toei", lat: 13.708097, lng: 100.583609 },
  { id: "suan_luang", th: "สวนหลวง", en: "Suan Luang", lat: 13.730387, lng: 100.651472 },
  { id: "chom_thong", th: "จอมทอง", en: "Chom Thong", lat: 13.677421, lng: 100.484222 },
  { id: "don_mueang", th: "ดอนเมือง", en: "Don Mueang", lat: 13.910253, lng: 100.594858 },
  { id: "ratchathewi", th: "ราชเทวี", en: "Ratchathewi", lat: 13.75903, lng: 100.534346 },
  { id: "lat_phrao", th: "ลาดพร้าว", en: "Lat Phrao", lat: 13.803524, lng: 100.607618 },
  { id: "watthana", th: "วัฒนา", en: "Watthana", lat: 13.742359, lng: 100.586036 },
  { id: "bang_khae", th: "บางแค", en: "Bang Khae", lat: 13.695944, lng: 100.409276 },
  { id: "lak_si", th: "หลักสี่", en: "Lak Si", lat: 13.887408, lng: 100.579121 },
  { id: "sai_mai", th: "สายไหม", en: "Sai Mai", lat: 13.895243, lng: 100.660816 },
  { id: "khan_na_yao", th: "คันนายาว", en: "Khan Na Yao", lat: 13.799406, lng: 100.682726 },
  { id: "saphan_sung", th: "สะพานสูง", en: "Saphan Sung", lat: 13.76886, lng: 100.685738 },
  { id: "wang_thonglang", th: "วังทองหลาง", en: "Wang Thonglang", lat: null, lng: null },
  { id: "khlong_sam_wa", th: "คลองสามวา", en: "Khlong Sam Wa", lat: 13.859528, lng: 100.704177 },
  { id: "bang_na", th: "บางนา", en: "Bang Na", lat: 13.667536, lng: 100.641933 },
  { id: "thawi_watthana", th: "ทวีวัฒนา", en: "Thawi Watthana", lat: 13.772973, lng: 100.353341 },
  { id: "thung_khru", th: "ทุ่งครุ", en: "Thung Khru", lat: 13.611647, lng: 100.508516 },
  { id: "bang_bon", th: "บางบอน", en: "Bang Bon", lat: 13.633915, lng: 100.368767 },
];

/** A district by id or Thai/English name, or undefined. */
export function bangkokDistrict(key) {
  const k = String(key ?? "").trim().toLowerCase().replace(/^เขต/, "");
  return BANGKOK_DISTRICTS.find((d) => d.id === k || d.th === k || d.en.toLowerCase() === k);
}
