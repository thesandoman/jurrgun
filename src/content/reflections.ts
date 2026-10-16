/**
 * "My Bangkok" reflections: four short questions at the end of the Bangkok
 * Type quiz (owner, D26 (4)). Optional, never scored, and they never change
 * the type. Written Thai first (design/reference/thai-voice.md).
 *
 *   like      what you like about Bangkok: up to 3 short options, plus words
 *   change    what you'd change: one option, plus words. Private: never on
 *             the profile. With research consent, the option alone (never
 *             the words) goes to City Pulse under the member's research id,
 *             so it's only ever seen as totals, under a research code
 *   favourite your favourite area or place: a district and/or a place typed
 *             in (suggestions from src/vibe/landmarks.ts)
 *   notYet    where you haven't been yet: up to 3 districts and/or a place;
 *             it marks those districts on the Passport and nudges first-table
 *             suggestions there
 *
 * Stored in profiles.bio.reflections (no new column). like, favourite and
 * notYet show on the profile card as "My Bangkok", to whoever may see the
 * card at all.
 */
import { DISTRICTS } from "../lib/constants";
import { LANDMARKS } from "../vibe/landmarks";

type L2 = { th: string; en: string };
export type ReflectionOpt = L2 & { value: string; emoji: string };

export const LIKE_MAX = 3;
export const NOT_YET_MAX = 3;
export const NOTE_MAX = 140;
export const PLACE_MAX = 80;

export const LIKES: ReflectionOpt[] = [
  { value: "street_food", emoji: "🍜", th: "ของกินข้างทาง", en: "The street food" },
  { value: "people", emoji: "🙂", th: "คนที่เป็นกันเอง", en: "How easygoing people are" },
  { value: "water", emoji: "🛶", th: "แม่น้ำกับคลอง", en: "The river and the canals" },
  { value: "old_town", emoji: "🏘️", th: "ย่านเก่ากับเรื่องเล่า", en: "Old neighbourhoods and their stories" },
  { value: "green", emoji: "🌳", th: "สวนตอนเช้ากับตอนเย็น", en: "Parks early and late in the day" },
  { value: "creative", emoji: "🎨", th: "ศิลปะ ดนตรี งานสร้างสรรค์", en: "Art, music and creative scenes" },
];

export const CHANGES: ReflectionOpt[] = [
  { value: "footpaths", emoji: "🚶", th: "ทางเท้าที่เดินได้สบาย", en: "Footpaths you can actually walk on" },
  { value: "getting_around", emoji: "🚆", th: "เดินทางง่ายขึ้น ต่อรถน้อยลง", en: "Easier trips with fewer changes" },
  { value: "air", emoji: "🌫️", th: "อากาศที่หายใจได้เต็มปอด", en: "Cleaner air" },
  { value: "shade", emoji: "🌴", th: "ร่มเงากับต้นไม้มากขึ้น", en: "More shade and trees" },
  { value: "flooding", emoji: "🌧️", th: "ฝนตกแล้วน้ำไม่ท่วม", en: "Streets that don't flood when it rains" },
  { value: "free_spaces", emoji: "🪑", th: "ที่นั่งเล่นฟรีให้คนได้เจอกัน", en: "Free places to sit and meet people" },
];

export type Reflections = {
  like?: string[];
  likeNote?: string;
  change?: string;
  changeNote?: string;
  favourite?: { district?: string; place?: string };
  notYet?: { districts?: string[]; place?: string };
};

const DISTRICT_KEYS = new Set(DISTRICTS.map((d) => d.value));
const LIKE_KEYS = new Set(LIKES.map((o) => o.value));
const CHANGE_KEYS = new Set(CHANGES.map((o) => o.value));

/** Landmark names to suggest while typing a place (both languages). */
export const PLACE_SUGGESTIONS: string[] = [...new Set(LANDMARKS.flatMap((l) => [l.name.th, l.name.en]))];

const text = (v: unknown, max: number) => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || undefined;
};
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x): x is string => typeof x === "string");

/** Keep only well-formed reflections (stored jsonb, or a posted form). Empty → undefined. */
export function cleanReflections(raw: unknown): Reflections | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Reflections = {};
  const like = [...new Set(list(r.like).filter((x) => LIKE_KEYS.has(x)))].slice(0, LIKE_MAX);
  if (like.length) out.like = like;
  const likeNote = text(r.likeNote, NOTE_MAX);
  if (likeNote) out.likeNote = likeNote;
  if (typeof r.change === "string" && CHANGE_KEYS.has(r.change)) out.change = r.change;
  const changeNote = text(r.changeNote, NOTE_MAX);
  if (changeNote) out.changeNote = changeNote;
  const fav = (r.favourite && typeof r.favourite === "object" ? r.favourite : {}) as Record<string, unknown>;
  const favDistrict = typeof fav.district === "string" && DISTRICT_KEYS.has(fav.district) ? fav.district : undefined;
  const favPlace = text(fav.place, PLACE_MAX);
  if (favDistrict || favPlace) out.favourite = { ...(favDistrict ? { district: favDistrict } : {}), ...(favPlace ? { place: favPlace } : {}) };
  const ny = (r.notYet && typeof r.notYet === "object" ? r.notYet : {}) as Record<string, unknown>;
  const nyDistricts = [...new Set(list(ny.districts).filter((x) => DISTRICT_KEYS.has(x)))].slice(0, NOT_YET_MAX);
  const nyPlace = text(ny.place, PLACE_MAX);
  if (nyDistricts.length || nyPlace) out.notYet = { ...(nyDistricts.length ? { districts: nyDistricts } : {}), ...(nyPlace ? { place: nyPlace } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** Reflections from the quiz form (fields r_like, r_like_note, r_change, r_change_note, r_fav_district, r_fav_place, r_notyet_1 to r_notyet_3, r_notyet_place). */
export function reflectionsFromForm(body: Record<string, unknown>): Reflections | undefined {
  return cleanReflections({
    like: body.r_like,
    likeNote: body.r_like_note,
    change: body.r_change,
    changeNote: body.r_change_note,
    favourite: { district: body.r_fav_district, place: body.r_fav_place },
    notYet: { districts: Array.from({ length: NOT_YET_MAX }, (_, k) => body[`r_notyet_${k + 1}`]).flatMap(list).filter(Boolean), place: body.r_notyet_place },
  });
}

/** The City Pulse question the "what would you change" answer feeds (totals only, under a research code, research consent only). */
export const CHANGE_PULSE_ID = "quiz-change";
export const CHANGE_PULSE_QUESTION = {
  id: CHANGE_PULSE_ID,
  promptTh: "ถ้าเปลี่ยนกรุงเทพฯ ได้ 1 อย่าง อยากเปลี่ยนอะไร (จากแบบทดสอบไทป์กรุงเทพฯ)",
  promptEn: "If you could change one thing about Bangkok, what would it be? (from the Bangkok Type quiz)",
  kind: "single",
  options: CHANGES.map(({ value, th, en }) => ({ value, th, en })),
  /** Archived: admins see its totals, members are never asked it again in City Pulse. */
  status: "archived",
  createdBy: "quiz",
};
